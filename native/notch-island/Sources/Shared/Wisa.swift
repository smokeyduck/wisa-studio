import Dispatch
import Foundation

let wisaMode = ProcessInfo.processInfo.environment["WISA_NOTCH"] == "1"
let wisaDisplayID = ProcessInfo.processInfo.environment["WISA_NOTCH_DISPLAY_ID"] ?? ""
let wisaShowIdle = ProcessInfo.processInfo.environment["WISA_NOTCH_SHOW_IDLE"] == "1"

// Electron's will-quit cannot run after a crash, SIGKILL or app.exit().
// Observe the owning process in the kernel rather than polling or relying on IPC cleanup.
func monitorWisaParent() -> DispatchSourceProcess? {
    guard wisaMode else { return nil }
    let parent = getppid()
    guard parent > 1 else { exit(EXIT_SUCCESS) }
    let source = DispatchSource.makeProcessSource(identifier: parent, eventMask: .exit, queue: .main)
    source.setEventHandler { exit(EXIT_SUCCESS) }
    source.resume()
    // The parent may have exited between getppid() and registering the source.
    guard getppid() == parent else { exit(EXIT_SUCCESS) }
    return source
}

// Never silently share preferences with the standalone app or a different Wisa profile.
let notchDefaults: UserDefaults = {
    guard wisaMode else { return .standard }
    let env = ProcessInfo.processInfo.environment
    guard let suite = env["WISA_NOTCH_DEFAULTS"], suite.hasPrefix("org.wisa."),
          let privateHome = env["HOME"], privateHome.hasPrefix("/"),
          let socket = env["NOTCH_ISLAND_SOCKET"], socket.hasPrefix("/"),
          !wisaDisplayID.isEmpty, let defaults = UserDefaults(suiteName: suite) else {
        fatalError("Wisa Notch requires a private HOME, defaults suite, absolute socket and display ID")
    }
    defaults.register(defaults: ["shortcuts": false, "showUsage": false])
    return defaults
}()

func emitNative(_ event: [String: Any]) {
    guard var data = try? JSONSerialization.data(withJSONObject: event, options: [.sortedKeys]) else { return }
    data.append(0x0A)
    writeAll(STDOUT_FILENO, data)
}
