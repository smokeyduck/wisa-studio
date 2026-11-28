import AppKit
import SwiftUI

struct WisaWidget: Decodable, Identifiable {
    let id: String
    let kind: String
    let title: String
    let text: String
}

struct WisaConfiguration: Decodable {
    var agents = ["wisa"]
    var showWhenIdle = true
    var openOnHover = true
    var openForApprovals = true
    var approveInNotch = true
    var shortcuts = false
    var sounds = true
    var width: Double = 720
    var maxCards = 5
    var background = "#101012"
    var foreground = "#ffffff"
    var accent = "#c8ad75"
    var opacity: Double = 1
    var radius: Double = 26
    var widgets = [WisaWidget(id: "sessions", kind: "sessions", title: "", text: "")]
    var labels: [String: String] = [:]

    static func decode(_ value: Any) -> WisaConfiguration? {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value) else { return nil }
        return try? JSONDecoder().decode(WisaConfiguration.self, from: data)
    }

    static var initial: WisaConfiguration {
        guard wisaMode, let raw = ProcessInfo.processInfo.environment["WISA_NOTCH_CONFIG"],
              let data = raw.data(using: .utf8), let config = try? JSONDecoder().decode(WisaConfiguration.self, from: data) else {
            return WisaConfiguration()
        }
        return config
    }

    func install() {
        notchDefaults.set(openOnHover, forKey: Pref.openOnHover)
        notchDefaults.set(openForApprovals, forKey: Pref.openForApprovals)
        notchDefaults.set(approveInNotch, forKey: Pref.approveInNotch)
        notchDefaults.set(shortcuts, forKey: Pref.shortcuts)
        notchDefaults.set(width, forKey: "islandWidth")
        notchDefaults.set(0, forKey: "listHeight")
        for agent in ["wisa", "claude", "codex", "cursor", "gemini", "copilot", "opencode", "custom"] {
            notchDefaults.set(agents.contains(agent), forKey: Pref.agent(agent))
        }
    }

    func label(_ key: String, fallback: String) -> String { labels[key] ?? fallback }
}

func wisaColor(_ hex: String) -> Color {
    let value = UInt32(hex.dropFirst(), radix: 16) ?? 0
    return Color(red: Double((value >> 16) & 255) / 255,
                 green: Double((value >> 8) & 255) / 255,
                 blue: Double(value & 255) / 255)
}

struct WisaCustomWidget: View {
    let widget: WisaWidget
    @ObservedObject var store: Store

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !widget.title.isEmpty {
                Text(widget.title).font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(wisaColor(store.configuration.accent))
            }
            switch widget.kind {
            case "clock":
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(context.date, style: .time).font(.system(size: 24, weight: .medium, design: .rounded)).monospacedDigit()
                }
            case "note":
                Text(widget.text).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
            case "activity":
                HStack(spacing: 18) {
                    metric("working", fallback: "Working", count: store.sessions.values.filter { $0.status == .working }.count)
                    metric("waiting", fallback: "Needs you", count: store.sessions.values.filter { $0.status == .waiting }.count)
                    metric("done", fallback: "Done", count: store.sessions.values.filter { $0.status == .done }.count)
                }
            default: EmptyView()
            }
        }
        .foregroundStyle(wisaColor(store.configuration.foreground))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(wisaColor(store.configuration.foreground).opacity(0.06)))
    }

    func metric(_ key: String, fallback: String, count: Int) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(count)").font(.system(size: 20, weight: .semibold)).monospacedDigit()
            Text(store.configuration.label(key, fallback: fallback)).font(.system(size: 11))
        }
    }
}
