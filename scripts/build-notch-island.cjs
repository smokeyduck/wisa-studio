const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "native/notch-island");
const output = path.join(root, "resources/notch-island");
const arches = ["arm64", "x86_64"];
const deployment = "14.0";
const run = (file, args, options = {}) => execFileSync(file, args, { stdio: "inherit", ...options });
const capture = (file, args) => execFileSync(file, args, { encoding: "utf8" }).trim();
const verifyArches = (binary) => {
	const actual = capture("/usr/bin/lipo", ["-archs", binary]).split(/\s+/);
	if (!arches.every((arch) => actual.includes(arch))) throw new Error(`Invalid Notch Island architectures: ${actual.join(" ")}`);
};

async function build() {
	if (process.platform !== "darwin") {
		console.log("Notch Island: native macOS helper is not available on this platform; skipped.");
		return;
	}
	const files = ["Info.plist", "LICENSE", "provenance.json"];
	for (const dir of ["Sources/App", "Sources/Shared"]) {
		for (const name of (await fs.readdir(path.join(source, dir))).sort()) {
			if (name.endsWith(".swift")) files.push(`${dir}/${name}`);
		}
	}
	const compiler = capture("/usr/bin/xcrun", ["--find", "swiftc"]);
	const sdk = capture("/usr/bin/xcrun", ["--sdk", "macosx", "--show-sdk-path"]);
	const hash = createHash("sha256");
	hash.update(JSON.stringify({ arches, deployment, compiler, sdk, version: capture(compiler, ["--version"]) }));
	hash.update(await fs.readFile(__filename));
	for (const file of files) hash.update(file).update(await fs.readFile(path.join(source, file)));
	const key = hash.digest("hex");
	const relativeBinary = "Notch Island.app/Contents/MacOS/NotchIsland";
	const binary = path.join(output, relativeBinary);
	try {
		if ((await fs.readFile(path.join(output, "source.sha256"), "utf8")).trim() === key) {
			verifyArches(binary);
			console.log("Notch Island: universal helper is current.");
			return;
		}
	} catch { /* Missing or stale payload is rebuilt below. */ }
	const cache = path.join(source, ".build");
	await fs.mkdir(cache, { recursive: true });
	const staging = await fs.mkdtemp(path.join(cache, "universal-"));
	try {
		const app = path.join(staging, "payload/Notch Island.app/Contents");
		await fs.mkdir(path.join(app, "MacOS"), { recursive: true });
		await fs.mkdir(path.join(app, "Resources"), { recursive: true });
		const sources = files.filter((file) => file.endsWith(".swift")).map((file) => path.join(source, file));
		for (const arch of arches) {
			run(compiler, ["-O", "-sdk", sdk, "-target", `${arch}-apple-macosx${deployment}`, "-module-cache-path", path.join(cache, `modules-${arch}`), ...sources, "-o", path.join(staging, arch)]);
		}
		const built = path.join(app, "MacOS/NotchIsland");
		run("/usr/bin/lipo", ["-create", ...arches.map((arch) => path.join(staging, arch)), "-output", built]);
		verifyArches(built);
		await fs.copyFile(path.join(source, "Info.plist"), path.join(app, "Info.plist"));
		for (const file of ["LICENSE", "provenance.json"]) await fs.copyFile(path.join(source, file), path.join(app, "Resources", file));
		run("/usr/bin/codesign", ["--force", "--sign", "-", path.dirname(app)]);
		await fs.writeFile(path.join(staging, "payload/source.sha256"), `${key}\n`);
		await fs.mkdir(path.dirname(output), { recursive: true });
		await fs.rm(output, { recursive: true, force: true });
		await fs.rename(path.join(staging, "payload"), output);
		console.log("Notch Island: built universal arm64 + x86_64 macOS 14+ helper.");
	} finally {
		await fs.rm(staging, { recursive: true, force: true });
	}
}

if (require.main === module) build().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { build };
