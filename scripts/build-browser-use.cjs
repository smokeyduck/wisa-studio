const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { constants, createReadStream } = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");

const resources = path.resolve(__dirname, "../resources");
const payload = path.join(resources, "browser-use");
const version = "1.0.8";
const uvVersion = "0.13.9";
const pythonVersion = "3.12.16";
// Pin official BSD-licensed Chromium snapshots, not Google Chrome for Testing.
const chromiumSource = "https://storage.googleapis.com/chromium-browser-snapshots";
// LICENSE-CHROMIUM is from chromium/chromium@bcbb931601e022995556ad63d60f4582ece603c4.
const chromiumLicenseSha = "368cca1106be99d39ecd32a38d8305585d802a475effb66380b91ffc9bcf709b";
const targets = {
	"win32-x64": {
		uv: "x86_64-pc-windows-msvc.zip",
		uvSha: "edd61f7f5728a56cc62455386661860bdfc7bab65872f39b0c25bdcc1d8e1beb",
		chrome: "Win_x64/1755747/chrome-win.zip",
		chromeSha: "c16e8910ff44ce34bf6140254cdc5e6f7771f2aae096e6eed65a714c81efa9af",
		chromeBinary: "chrome-win/chrome.exe",
	},
	"darwin-arm64": {
		uv: "aarch64-apple-darwin.tar.gz",
		uvSha: "5aeca67f2283f75235de40d0bd9c0a5bbc5fce23b6d48b3bf9fa1b2db08382ca",
		chrome: "Mac_Arm/1755836/chrome-mac.zip",
		chromeSha: "4b4589aaa3678af48aba39ab4d1d983f63987d2812b0b26ef206d92451f7fb83",
		chromeBinary: "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
	},
	"darwin-x64": {
		uv: "x86_64-apple-darwin.tar.gz",
		uvSha: "617a3211261b0fc739562f0071aa34e9739797c510208ede8e2977c30903d041",
		chrome: "Mac/1755820/chrome-mac.zip",
		chromeSha: "ccd5ddc323266b2781bf75699d48587ced77ffd9da1a0e091365a6bc9ae60c04",
		chromeBinary: "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
	},
	"linux-x64": {
		uv: "x86_64-unknown-linux-gnu.tar.gz",
		uvSha: "a7fbaff2b9a271d85c1bdb540941090fd1ce011797b4abeb48e4dcd39c2471d5",
		chrome: "Linux_x64/1755806/chrome-linux.zip",
		chromeSha: "60c7c80c6ee2ddf8a1574ab9da92c28b5eaa031ce94d33ed54038f8ca61e961f",
		chromeBinary: "chrome-linux/chrome",
	},
};

function layout(platform, arch) {
	const target = targets[`${platform}-${arch}`];
	if (!target) throw new Error(`Unsupported Browser Use payload target: ${platform}-${arch}`);
	const windows = platform === "win32";
	return {
		uvAsset: `uv-${target.uv}`,
		uvSha: target.uvSha,
		chrome: target.chrome,
		chromeSha: target.chromeSha,
		executable: `chromium/${target.chromeBinary}`,
		python: windows ? "python/python.exe" : "python/bin/python3",
		uv: windows ? "uv.exe" : "uv",
	};
}

function run(executable, args, options = {}) {
	return execFileSync(executable, args, { stdio: "inherit", windowsHide: true, ...options });
}

function extract(archive, destination) {
	if (process.platform === "linux" && archive.endsWith(".zip")) {
		run("unzip", ["-q", archive, "-d", destination]);
	} else {
		// Git Bash can put GNU tar ahead of Windows' ZIP-capable bsdtar.
		const tar = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:/Windows", "System32", "tar.exe") : "tar";
		run(tar, ["-xf", archive, "-C", destination]);
	}
}

async function verifySha256(file, expected) {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(file)) hash.update(chunk);
	if (hash.digest("hex") !== expected) throw new Error(`SHA-256 mismatch for ${file}`);
}

async function download(url, destination, sha256) {
	run(process.platform === "win32" ? "curl.exe" : "curl", ["--disable", "--fail", "--location", "--silent", "--show-error", "--output", destination, url]);
	await verifySha256(destination, sha256);
}

async function build() {
	const target = layout(process.platform, process.arch);
	// Stage on the destination volume so a failed download or install cannot
	// leave an incomplete payload at the path used by Electron and the builder.
	const work = await fs.mkdtemp(path.join(resources, ".browser-use-"));
	const staged = path.join(work, "payload");
	try {
		await fs.mkdir(staged);
		const uvArchive = path.join(work, target.uvAsset);
		await download(`https://github.com/astral-sh/uv/releases/download/${uvVersion}/${target.uvAsset}`, uvArchive, target.uvSha);
		const uvExtract = path.join(work, "uv");
		await fs.mkdir(uvExtract);
		extract(uvArchive, uvExtract);
		const unpackedUv = target.uv === "uv.exe" ? uvExtract : path.join(uvExtract, target.uvAsset.replace(/\.tar\.gz$/, ""));
		const uv = path.join(staged, target.uv);
		await fs.rename(path.join(unpackedUv, target.uv), uv);

		const pythonInstall = path.join(work, "python");
		const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(UV_|PIP_|PYTHON)/i.test(key)));
		Object.assign(env, { UV_NO_CONFIG: "1", UV_PYTHON_INSTALL_DIR: pythonInstall });
		run(uv, ["python", "install", "--no-bin", "--no-registry", `cpython@${pythonVersion}`], { cwd: work, env });
		const installations = (await fs.readdir(pythonInstall, { withFileTypes: true })).filter(entry => entry.isDirectory() && entry.name.startsWith(`cpython-${pythonVersion}-`));
		if (installations.length !== 1) throw new Error(`Expected exactly one uv-managed CPython ${pythonVersion} installation`);
		await fs.rename(path.join(pythonInstall, installations[0].name), path.join(staged, "python"));
		run(uv, ["pip", "install", "--python", path.join(staged, target.python), "--target", path.join(staged, "packages"), "--no-build", "--no-python-downloads", "--link-mode", "copy", "--default-index", "https://pypi.org/simple", `browser-use==${version}`], { cwd: work, env });

		const chromeArchive = path.join(work, "chromium.zip");
		const chromeDir = path.join(staged, "chromium");
		await download(`${chromiumSource}/${target.chrome}`, chromeArchive, target.chromeSha);
		await fs.mkdir(chromeDir);
		// libarchive (Windows/macOS) and unzip (Linux) retain the archive's modes
		// and symlinks, including Chrome's nested macOS framework links.
		extract(chromeArchive, chromeDir);
		// The Windows snapshot includes the upstream test runner, not needed by Chromium.
		if (process.platform === "win32") await fs.rm(path.join(chromeDir, "chrome-win", "interactive_ui_tests.exe"), { force: true });
		const license = await fs.readFile(path.join(resources, "LICENSE-CHROMIUM"), "utf8");
		await fs.writeFile(path.join(chromeDir, "LICENSE"), license.replaceAll("\r\n", "\n"));
		await fs.writeFile(path.join(staged, "version.json"), `${JSON.stringify({ version, executable: target.executable }, null, 2)}\n`);
		await verify(staged, process.platform, process.arch);
		await fs.rm(payload, { recursive: true, force: true });
		await fs.rename(staged, payload);
		console.log(`Browser Use ${version} payload: ${payload}`);
	} finally {
		await fs.rm(work, { recursive: true, force: true });
	}
}

async function checkBinary(file, platform, arch) {
	await fs.access(file, constants.X_OK);
	const handle = await fs.open(file, "r");
	let matches = false;
	try {
		const header = Buffer.alloc(64);
		if ((await handle.read(header, 0, header.length, 0)).bytesRead === header.length) {
			if (platform === "win32" && header.readUInt16LE() === 0x5a4d) {
				const pe = Buffer.alloc(6);
				const { bytesRead } = await handle.read(pe, 0, pe.length, header.readUInt32LE(0x3c));
				matches = bytesRead === pe.length && pe.readUInt32LE() === 0x4550 && pe.readUInt16LE(4) === 0x8664;
			} else if (platform === "darwin") {
				matches = header.readUInt32LE() === 0xfeedfacf && header.readUInt32LE(4) === (arch === "arm64" ? 0x0100000c : 0x01000007);
			} else if (platform === "linux") {
				matches = header.readUInt32BE() === 0x7f454c46 && header[4] === 2 && header[5] === 1 && header.readUInt16LE(18) === 62;
			}
		}
	} finally {
		await handle.close();
	}
	if (!matches) throw new Error(`${file} is not a ${platform}-${arch} executable`);
}

async function verify(root, platform, arch) {
	await verifySha256(path.join(root, "chromium", "LICENSE"), chromiumLicenseSha);
	const target = layout(platform, arch);
	const manifest = JSON.parse(await fs.readFile(path.join(root, "version.json"), "utf8"));
	if (manifest.version !== version || manifest.executable !== target.executable) {
		throw new Error(`Expected Browser Use ${version} and executable ${target.executable} in ${root}/version.json`);
	}
	for (const binary of [target.uv, target.python, target.executable]) {
		await checkBinary(path.join(root, binary), platform, arch);
	}
	const browserDir = path.dirname(path.join(root, target.executable));
	const browserResource = platform === "darwin"
		? "../Frameworks/Chromium Framework.framework/Versions/Current/Resources/resources.pak"
		: "resources.pak";
	if (!(await fs.stat(path.join(browserDir, browserResource))).size) {
		throw new Error(`Missing Chromium resources: ${browserResource}`);
	}
	const uv = run(path.join(root, target.uv), ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
	if (uv.trim().split(/\s+/)[1] !== uvVersion) throw new Error(`Expected uv ${uvVersion}, received ${uv.trim()}`);
	// Use the relocated interpreter and only the payload's third-party modules;
	// do not accidentally pass using the build host's Python or site-packages.
	run(path.join(root, target.python), ["-ISB", "-c", `
import sys
from importlib.metadata import version
assert sys.version_info[:3] == (${pythonVersion.replaceAll(".", ", ")}), sys.version
sys.path.insert(0, sys.argv[1])
import browser_use
import pydantic_core
from PIL import Image
assert version('browser-use') == '${version}'
`, path.join(root, "packages")], { env: { ...process.env, ANONYMIZED_TELEMETRY: "false" } });
}

async function beforePack(context) {
	const { Arch } = require("builder-util");
	const arch = Arch[context.arch];
	const platform = context.electronPlatformName;
	if (platform !== process.platform || arch !== process.arch) {
		throw new Error(`Build Browser Use on a native ${platform}-${arch} runner; current host is ${process.platform}-${process.arch}`);
	}
	try {
		for (const name of ["browser-use-bridge.py", "studio-agent.yml"]) {
			const stat = await fs.stat(path.join(resources, name));
			if (!stat.isFile() || !stat.size) throw new Error(`Missing content in resources/${name}`);
		}
		await verify(payload, platform, arch);
	} catch (error) {
		throw new Error(`Cannot pack Browser Use for ${platform}-${arch}. Run bun run build:browser-use on this host.`, { cause: error });
	}
}

if (require.main === module) {
	const args = process.argv.slice(2);
	const action = args.length === 0 ? build() : args.length === 2 && args[0] === "--verify"
		? verify(path.resolve(args[1]), process.platform, process.arch)
		: Promise.reject(new Error("Usage: node scripts/build-browser-use.cjs [--verify <payload directory>]"));
	action.catch(error => {
		console.error(error);
		process.exitCode = 1;
	});
}

module.exports = { beforePack };
