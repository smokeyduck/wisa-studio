import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { openSystemTerminal, type TerminalLaunch } from "./os-terminal";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const WINDOWS_CWD = "D:\\Dự án WISA\\mã nguồn";
const WINDOWS_ENV = { SystemRoot: "C:\\Windows", LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" };
const CMD = "C:\\Windows\\System32\\cmd.exe";
const WT = "C:\\Users\\test\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe";

function fixture(platform: NodeJS.Platform, inheritedEnv: NodeJS.ProcessEnv = {}) {
	return {
		platform,
		inheritedEnv,
		isDirectory: vi.fn(async (_dir: string) => true),
		launch: vi.fn(async (_candidate: TerminalLaunch) => true),
	};
}

describe("openSystemTerminal", () => {
	it("opens a separate Windows Terminal window using its default profile, without PATH or agent state", async () => {
		const deps = fixture("win32", {
			...WINDOWS_ENV,
			WISA_PROFILE_ROOT: "D:\\test-profile",
			PI_CONFIG_SOURCES: "native",
			omp_daemon_token: "private",
		});
		expect(await openSystemTerminal(WINDOWS_CWD, deps)).toEqual({ ok: true });
		expect(deps.launch).toHaveBeenCalledExactlyOnceWith({
			file: WT,
			args: ["-w", "new", "new-tab", "--startingDirectory", WINDOWS_CWD],
			options: { env: WINDOWS_ENV },
		});
	});

	it("falls back from a missing Windows Terminal to a system PowerShell console and then CMD", async () => {
		const deps = fixture("win32", WINDOWS_ENV);
		deps.launch.mockRejectedValueOnce(new Error("ENOENT")).mockResolvedValueOnce(false);
		expect(await openSystemTerminal(WINDOWS_CWD, deps)).toEqual({ ok: true });
		const [first, second, third] = deps.launch.mock.calls.map(([candidate]) => candidate);
		expect(first.file).toBe(WT);
		expect(second).toMatchObject({
			file: CMD,
			options: { cwd: WINDOWS_CWD, windowsHide: true, windowsVerbatimArguments: true },
			waitForExit: true,
		});
		expect(second.args[2]).toContain("WindowsPowerShell");
		expect(second.args.join(" ")).not.toContain(WINDOWS_CWD);
		expect(third).toMatchObject({ file: CMD, options: { cwd: WINDOWS_CWD }, waitForExit: true });
		expect(third.args[2]).toContain('start "" "%SystemRoot%\\System32\\cmd.exe"');
	});

	it("does not let Windows Terminal interpret a workspace name as a command separator", async () => {
		const cwd = "D:\\Dự án; mới %TEMP%";
		const deps = fixture("win32", WINDOWS_ENV);
		expect(await openSystemTerminal(cwd, deps)).toEqual({ ok: true });
		const [[candidate]] = deps.launch.mock.calls;
		expect(candidate).toMatchObject({ file: CMD, options: { cwd } });
		expect(candidate.args.join(" ")).not.toContain(cwd);
	});

	it("passes an UNC workspace to PowerShell as literal data and never falls back to CMD on failure", async () => {
		const cwd = "\\\\server\\share\\Dự án [a] & b";
		const deps = fixture("win32", WINDOWS_ENV);
		deps.launch.mockResolvedValue(false);
		expect(await openSystemTerminal(cwd, deps)).toEqual({ ok: false, error: "terminal-unavailable" });
		expect(deps.launch).toHaveBeenCalledTimes(1);
		const [[candidate]] = deps.launch.mock.calls;
		expect(candidate).toMatchObject({ file: CMD, options: { cwd: WINDOWS_ENV.SystemRoot, env: { WISA_TERMINAL_CWD: cwd } } });
		const encodedCommand = candidate.args[2].match(/-EncodedCommand ([\w+/=]+)/)?.[1];
		expect(Buffer.from(encodedCommand ?? "", "base64").toString("utf16le")).toContain("Set-Location -LiteralPath $dir");
		expect(candidate.args.join(" ")).not.toContain(cwd);
	});

	it("sends a macOS workspace directly to Terminal.app and reports Launch Services failure", async () => {
		const cwd = "/Users/test/Dự án WISA";
		const deps = fixture("darwin");
		deps.launch.mockResolvedValue(false);
		expect(await openSystemTerminal(cwd, deps)).toEqual({ ok: false, error: "terminal-unavailable" });
		expect(deps.launch).toHaveBeenCalledExactlyOnceWith({
			file: "/usr/bin/open",
			args: ["-b", "com.apple.Terminal", cwd],
			options: { env: {} },
			waitForExit: true,
		});
	});

	it("prefers the Linux desktop default, then the distro alternative, without searching the workspace", async () => {
		const cwd = "/home/test/Dự án WISA";
		const deps = fixture("linux", { WAYLAND_DISPLAY: "wayland-0", PATH: ":.:bin:/usr/bin" });
		deps.launch.mockResolvedValueOnce(false);
		expect(await openSystemTerminal(cwd, deps)).toEqual({ ok: true });
		const options = { cwd, env: { WAYLAND_DISPLAY: "wayland-0", PATH: "/usr/bin" } };
		expect(deps.launch).toHaveBeenNthCalledWith(1, { file: "xdg-terminal-exec", args: [`--dir=${cwd}`], options });
		expect(deps.launch).toHaveBeenNthCalledWith(2, { file: "x-terminal-emulator", args: [], options });
	});

	it("returns structured errors for unsupported OS, unavailable workspace, and headless Linux", async () => {
		const unsupported = fixture("freebsd");
		expect(await openSystemTerminal("/workspace", unsupported)).toEqual({ ok: false, error: "unsupported-platform" });
		expect(unsupported.isDirectory).not.toHaveBeenCalled();
		const deps = fixture("linux");
		expect(await openSystemTerminal("relative/path", deps)).toEqual({ ok: false, error: "workspace-unavailable" });
		deps.isDirectory.mockRejectedValueOnce(new Error("ENOENT"));
		expect(await openSystemTerminal("/missing", deps)).toEqual({ ok: false, error: "workspace-unavailable" });
		deps.isDirectory.mockResolvedValueOnce(false);
		expect(await openSystemTerminal("/file", deps)).toEqual({ ok: false, error: "workspace-unavailable" });
		expect(await openSystemTerminal("/workspace", deps)).toEqual({ ok: false, error: "terminal-unavailable" });
		expect(deps.launch).not.toHaveBeenCalled();
	});

	it("waits for Launch Services and reports a nonzero exit rather than returning spawn success", async () => {
		const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
		vi.mocked(spawn).mockImplementationOnce(() => {
			queueMicrotask(() => child.emit("exit", 1));
			return child as unknown as ChildProcess;
		});
		const { launch: _launch, ...deps } = fixture("darwin");
		expect(await openSystemTerminal("/workspace", deps)).toEqual({ ok: false, error: "terminal-unavailable" });
		expect(child.unref).toHaveBeenCalledOnce();
	});
});
