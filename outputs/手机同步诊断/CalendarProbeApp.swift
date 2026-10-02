import AppKit
import EventKit
import Foundation

// Read-only diagnostic and configured background collector. Never changes events.
// Permission is requested only by the GUI's explicit calendar-list button.
@main
@MainActor
final class CalendarProbeApp: NSObject, NSApplicationDelegate {
    private let store = EKEventStore()
    private var window: NSWindow!
    private let listButton = NSButton(title: "读取日历列表", target: nil, action: nil)
    private let calendarPicker = NSPopUpButton(frame: .zero, pullsDown: false)
    private let readButton = NSButton(title: "读取最近 1 天", target: nil, action: nil)
    private let status = NSTextField(wrappingLabelWithString: "点击“读取日历列表”开始。首次使用会显示 macOS 的日历权限提示。")
    private let preview = NSTextView()
    private var calendars: [EKCalendar] = []
    private let background = CommandLine.arguments.contains("--background")
    private var bridge: CalendarBridge?
    private var signalSources: [DispatchSourceSignal] = []
    private let bridgeStatus = NSTextField(wrappingLabelWithString: "正在检查自动同步配置…")

    static func main() {
        let app = NSApplication.shared
        let delegate = CalendarProbeApp()
        app.setActivationPolicy(delegate.background ? .prohibited : .regular)
        app.delegate = delegate
        app.run()
        withExtendedLifetime(delegate) {}
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let collector = CalendarBridge(store: store)
        collector.onStatus = { [weak self] value in self?.bridgeStatus.stringValue = value }
        bridge = collector
        installSignalHandlers()
        collector.start()
        guard !background else { return }
        let menu = NSMenu()
        let applicationItem = NSMenuItem()
        let applicationMenu = NSMenu()
        applicationMenu.addItem(withTitle: "退出专注日历诊断", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        applicationItem.submenu = applicationMenu
        menu.addItem(applicationItem)
        NSApplication.shared.mainMenu = menu

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 820, height: 640), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "专注日历诊断"
        window.minSize = NSSize(width: 650, height: 500)
        let content = window.contentView!
        let title = NSTextField(labelWithString: "验证 iPhone 专注记录是否已同步到 Mac")
        title.font = .systemFont(ofSize: 20, weight: .semibold)
        let description = NSTextField(wrappingLabelWithString: "下方按钮用于单独诊断所选日历最近 24 小时的记录。自动同步每 30 秒读取指定日历：白名单任务已完成后可供专注远征导入，尚未结束的记录会提示等待。")
        description.textColor = .secondaryLabelColor
        listButton.target = self
        listButton.action = #selector(loadCalendars)
        calendarPicker.addItem(withTitle: "请先读取日历列表")
        calendarPicker.isEnabled = false
        calendarPicker.target = self
        calendarPicker.action = #selector(selectionChanged)
        calendarPicker.setAccessibilityLabel("选择要诊断的日历")
        readButton.target = self
        readButton.action = #selector(readRecentDay)
        readButton.isEnabled = false
        let actions = NSStackView(views: [listButton, calendarPicker, readButton])
        actions.orientation = .horizontal
        actions.spacing = 12
        calendarPicker.setContentHuggingPriority(.defaultLow, for: .horizontal)
        calendarPicker.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        status.font = .systemFont(ofSize: 12)
        status.textColor = .secondaryLabelColor
        status.setAccessibilityIdentifier("diagnostic-status")
        bridgeStatus.font = .systemFont(ofSize: 12)
        bridgeStatus.textColor = .secondaryLabelColor
        bridgeStatus.setAccessibilityIdentifier("calendar-bridge-status")
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.borderType = .bezelBorder
        preview.isEditable = false
        preview.isSelectable = true
        preview.isRichText = false
        preview.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        preview.textContainerInset = NSSize(width: 12, height: 12)
        preview.autoresizingMask = [.width]
        preview.textContainer?.widthTracksTextView = true
        preview.setAccessibilityLabel("所选日历的诊断结果")
        preview.string = "尚未读取事件。\n\n日历事件的起止时间可能包含休息或暂停，需对照番茄中的真实记录确认后，才能用于学习时长统计。"
        scroll.documentView = preview
        let stack = NSStackView(views: [title, description, bridgeStatus, actions, status, scroll])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: content.topAnchor, constant: 24),
            stack.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -24),
            description.widthAnchor.constraint(equalTo: stack.widthAnchor),
            bridgeStatus.widthAnchor.constraint(equalTo: stack.widthAnchor),
            actions.widthAnchor.constraint(equalTo: stack.widthAnchor),
            status.widthAnchor.constraint(equalTo: stack.widthAnchor),
            scroll.widthAnchor.constraint(equalTo: stack.widthAnchor),
            scroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 220)
        ])
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        bridge?.stop()
        for source in signalSources { source.cancel() }
        signalSources.removeAll()
    }

    private func installSignalHandlers() {
        for code in [SIGTERM, SIGINT] {
            Darwin.signal(code, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: code, queue: .main)
            source.setEventHandler { NSApplication.shared.terminate(nil) }
            source.resume()
            signalSources.append(source)
        }
    }

    @objc private func loadCalendars() {
        listButton.isEnabled = false
        readButton.isEnabled = false
        calendarPicker.isEnabled = false
        status.stringValue = "正在检查日历权限…"
        Task { @MainActor in
            defer { listButton.isEnabled = true }
            do {
                if EKEventStore.authorizationStatus(for: .event) != .fullAccess {
                    let granted = try await store.requestFullAccessToEvents()
                    guard granted else {
                        status.stringValue = "尚未获得完整读取权限。可在系统设置 → 隐私与安全性 → 日历中允许“专注日历诊断”。未读取事件。"
                        return
                    }
                }
                guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else {
                    status.stringValue = "当前权限不足以读取日历。未读取事件。"
                    return
                }
                bridge?.refresh()
                // This enumerates calendar metadata only, not events.
                calendars = store.calendars(for: .event).sorted {
                    ($0.source.title, $0.title, $0.calendarIdentifier) < ($1.source.title, $1.title, $1.calendarIdentifier)
                }
                calendarPicker.removeAllItems()
                calendarPicker.addItem(withTitle: "请选择一个日历（不自动读取）")
                for calendar in calendars {
                    calendarPicker.addItem(withTitle: "\(calendar.title) — \(calendar.source.title)")
                }
                calendarPicker.selectItem(at: 0)
                calendarPicker.isEnabled = !calendars.isEmpty
                status.stringValue = "找到 \(calendars.count) 个日历，仅读取了名称和来源。请选择番茄 ToDo 写入的日历，再点击“读取最近 1 天”。"
            } catch {
                status.stringValue = "读取日历列表失败：\(error.localizedDescription)"
            }
        }
    }

    @objc private func selectionChanged() {
        readButton.isEnabled = calendarPicker.indexOfSelectedItem > 0
        if let calendar = selectedCalendar {
            status.stringValue = "已选择：\(calendar.title)（\(calendar.source.title)）。点击“读取最近 1 天”后才会读取该日历事件。"
        }
    }

    private var selectedCalendar: EKCalendar? {
        let index = calendarPicker.indexOfSelectedItem - 1
        guard calendars.indices.contains(index) else { return nil }
        return calendars[index]
    }

    @objc private func readRecentDay() {
        guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else {
            status.stringValue = "日历读取权限已不可用，请重新点击“读取日历列表”。"
            return
        }
        guard let selected = selectedCalendar else { return }
        let end = Date()
        let start = end.addingTimeInterval(-24 * 60 * 60)
        // Explicitly restrict the predicate to ONE selected calendar.
        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: [selected])
        let events = store.events(matching: predicate)
            .filter { $0.calendar.calendarIdentifier == selected.calendarIdentifier && $0.startDate < end && $0.endDate > start }
            .sorted { $0.startDate > $1.startDate }
        let export = EventExport(generatedAt: end, calendar: CalendarInfo(selected), requestedStart: start, requestedEnd: end, events: events.map(EventInfo.init))
        do {
            let url = try save(export)
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "zh_CN")
            formatter.dateFormat = "yyyy-MM-dd HH:mm:ss ZZZZ"
            var lines = ["日历：\(selected.title)", "来源：\(selected.source.title)", "范围：\(formatter.string(from: start)) → \(formatter.string(from: end))", "事件数量：\(events.count)", "诊断文件：\(url.path)", "", "最近最多 10 条（全部范围内记录均已保存到 JSON）：", ""]
            for (index, event) in events.prefix(10).enumerated() {
                lines.append("\(index + 1). \(event.title ?? "（无标题）")")
                lines.append("开始：\(formatter.string(from: event.startDate))")
                lines.append("结束：\(formatter.string(from: event.endDate))")
                lines.append(String(format: "日历跨度：%.1f 分钟（尚未确认等于有效专注时长）", event.endDate.timeIntervalSince(event.startDate) / 60))
                let notes = event.notes ?? "（无备注）"
                lines.append("备注：\(notes.prefix(300))\(notes.count > 300 ? "…" : "")")
                lines.append("")
            }
            if events.isEmpty { lines.append("该日历最近 24 小时没有事件。可等 iPhone 完成一次真实专注并同步后再读取。") }
            preview.string = lines.joined(separator: "\n")
            preview.scrollToBeginningOfDocument(nil)
            status.stringValue = "已读取所选日历的 \(events.count) 条事件并保存本地 JSON。未导入专注远征，未修改任何日历。"
        } catch {
            status.stringValue = "保存本地诊断文件失败：\(error.localizedDescription)"
        }
    }

    private func save(_ export: EventExport) throws -> URL {
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let directory = support.appendingPathComponent("FocusQuest/calendar-diagnostics", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let timestamp = ISO8601DateFormatter().string(from: export.generatedAt).replacingOccurrences(of: ":", with: "-")
        let url = directory.appendingPathComponent("calendar-sample-\(timestamp)-\(UUID().uuidString).json")
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(export)
        // O_EXCL + mode 0600 avoids overwrites and makes the file private from creation.
        let descriptor = Darwin.open(url.path, O_WRONLY | O_CREAT | O_EXCL, 0o600)
        guard descriptor >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        do { try handle.write(contentsOf: data); try handle.close() }
        catch { try? handle.close(); throw error }
        return url
    }

    private struct CalendarInfo: Encodable {
        let calendarID: String
        let title: String
        let sourceTitle: String
        let sourceType: Int
        init(_ calendar: EKCalendar) {
            calendarID = calendar.calendarIdentifier
            title = calendar.title
            sourceTitle = calendar.source.title
            sourceType = calendar.source.sourceType.rawValue
        }
    }

    private struct EventInfo: Encodable {
        let calendarID: String
        let eventIdentifier: String?
        let calendarItemIdentifier: String
        let externalIdentifier: String?
        let title: String
        let start: Date
        let end: Date
        let notes: String?
        let timeZoneIdentifier: String?
        let isAllDay: Bool
        let elapsedSeconds: Double
        let hasRecurrenceRules: Bool
        let isDetached: Bool
        let occurrenceDate: Date?
        let durationInterpretation = "unverified_calendar_span"
        init(_ event: EKEvent) {
            calendarID = event.calendar.calendarIdentifier
            eventIdentifier = event.eventIdentifier
            calendarItemIdentifier = event.calendarItemIdentifier
            externalIdentifier = event.calendarItemExternalIdentifier
            title = event.title ?? ""
            start = event.startDate
            end = event.endDate
            notes = event.notes
            timeZoneIdentifier = event.timeZone?.identifier
            isAllDay = event.isAllDay
            elapsedSeconds = event.endDate.timeIntervalSince(event.startDate)
            hasRecurrenceRules = event.hasRecurrenceRules
            isDetached = event.isDetached
            occurrenceDate = event.occurrenceDate
        }
    }

    private struct EventExport: Encodable {
        let schemaVersion = 1
        let kind = "unverified_focus_calendar_sample"
        let generatedAt: Date
        let calendar: CalendarInfo
        let requestedStart: Date
        let requestedEnd: Date
        let rangeSemantics = "events_overlapping_half_open_range"
        let events: [EventInfo]
    }
}
