import Foundation
import EventKit
import Darwin

// Local diagnostic only. Never saves, removes, or modifies an EKEvent or EKCalendar.
// No event query is made until the caller supplies one calendar ID and a <= 7-day range.
@main
@MainActor
struct CalendarProbe {
    private static let usage = """
    CalendarProbe — 番茄专注日历只读诊断（macOS 14+）

      CalendarProbe status
      CalendarProbe authorize
      CalendarProbe list --output /absolute/path/calendars.json
      CalendarProbe export --calendar-id ID --start ISO8601 --end ISO8601 --output /absolute/path/events.json

    只有 authorize 命令会请求系统日历权限。list 只输出日历名称、来源和 ID。
    export 只读取指定的一个日历，时间范围最多 7 天。例如：
      --start 2026-09-23T00:00:00+08:00 --end 2026-09-24T00:00:00+08:00
    文件必须不存在；事件详情只写入本地 JSON，不在终端显示。
    """

    struct ProbeError: Error, LocalizedError {
        let message: String
        var errorDescription: String? { message }
        init(_ message: String) { self.message = message }
    }

    struct CalendarInfo: Encodable {
        let calendarID: String
        let title: String
        let sourceTitle: String
        let sourceType: String
        init(_ calendar: EKCalendar) {
            calendarID = calendar.calendarIdentifier
            title = calendar.title
            sourceTitle = calendar.source.title
            switch calendar.source.sourceType {
            case .local: sourceType = "local"
            case .exchange: sourceType = "exchange"
            case .calDAV: sourceType = "calDAV"
            case .mobileMe: sourceType = "mobileMe"
            case .subscribed: sourceType = "subscribed"
            case .birthdays: sourceType = "birthdays"
            @unknown default: sourceType = "unknown"
            }
        }
    }

    struct EventInfo: Encodable {
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
        // Calendar span is not yet validated as effective focus time.
        let elapsedSeconds: Double
        let focusSeconds: Double? = nil
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
        }
    }

    struct CalendarList: Encodable {
        let schemaVersion = 1
        let kind = "calendar_metadata"
        let generatedAt: Date
        let calendars: [CalendarInfo]
    }

    struct EventExport: Encodable {
        let schemaVersion = 1
        let kind = "unverified_focus_calendar_sample"
        let generatedAt: Date
        let calendar: CalendarInfo
        let requestedStart: Date
        let requestedEnd: Date
        let rangeSemantics = "events_overlapping_half_open_range"
        let events: [EventInfo]
    }

    static func main() async {
        do { try await run(Array(CommandLine.arguments.dropFirst())) }
        catch {
            FileHandle.standardError.write(Data(("CalendarProbe: \(error.localizedDescription)\n").utf8))
            exit(1)
        }
    }

    private static func run(_ args: [String]) async throws {
        guard let command = args.first else { print(usage); return }
        if command == "--help" || command == "help" { print(usage); return }
        switch command {
        case "status":
            guard args.count == 1 else { throw ProbeError("status 不接受额外参数。") }
            print(authorizationName())
        case "authorize":
            guard args.count == 1 else { throw ProbeError("authorize 不接受额外参数。") }
            // A usage description must be embedded in the executable/app before requesting.
            guard let explanation = Bundle.main.object(forInfoDictionaryKey: "NSCalendarsFullAccessUsageDescription") as? String,
                  !explanation.isEmpty else {
                throw ProbeError("缺少日历用途说明；请先按 README 用附带的 Info.plist 编译。未发起权限请求。")
            }
            let store = EKEventStore()
            let granted = try await store.requestFullAccessToEvents()
            guard granted else { throw ProbeError("没有获得读取日历的权限。可在系统设置 → 隐私与安全性 → 日历中调整。") }
            print("fullAccess — 已授权；未读取或修改任何事件。")
        case "list":
            let options = try parseOptions(Array(args.dropFirst()), required: ["--output"])
            try requireReadAccess()
            let store = EKEventStore()
            let calendars = store.calendars(for: .event).map(CalendarInfo.init).sorted {
                ($0.sourceTitle, $0.title, $0.calendarID) < ($1.sourceTitle, $1.title, $1.calendarID)
            }
            try write(CalendarList(generatedAt: Date(), calendars: calendars), to: options["--output"]!)
            print("已保存 \(calendars.count) 个日历的名称与 ID；没有读取事件。")
        case "export":
            let options = try parseOptions(Array(args.dropFirst()), required: ["--calendar-id", "--start", "--end", "--output"])
            let start = try parseDate(options["--start"]!)
            let end = try parseDate(options["--end"]!)
            let span = end.timeIntervalSince(start)
            guard span > 0, span <= 7 * 24 * 60 * 60 else {
                throw ProbeError("诊断范围必须大于 0 且不超过 7 天。")
            }
            let selectedID = options["--calendar-id"]!
            guard !selectedID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw ProbeError("必须明确选择一个日历 ID。")
            }
            try requireReadAccess()
            let store = EKEventStore()
            guard let calendar = store.calendar(withIdentifier: selectedID), calendar.allowedEntityTypes.contains(.event) else {
                throw ProbeError("找不到指定的事件日历；请重新运行 list 确认日历 ID。")
            }
            // Never pass nil for calendars: that would search every calendar.
            let predicate = store.predicateForEvents(withStart: start, end: end, calendars: [calendar])
            let events = store.events(matching: predicate)
                .filter { $0.calendar.calendarIdentifier == selectedID && $0.startDate < end && $0.endDate > start }
                .sorted {
                    if $0.startDate != $1.startDate { return $0.startDate < $1.startDate }
                    return $0.calendarItemIdentifier < $1.calendarItemIdentifier
                }
                .map(EventInfo.init)
            try write(EventExport(generatedAt: Date(), calendar: CalendarInfo(calendar), requestedStart: start, requestedEnd: end, events: events),
                      to: options["--output"]!)
            print("已保存指定日历范围内的 \(events.count) 条事件；尚未导入专注远征。")
        default: throw ProbeError("未知命令。使用 --help 查看说明。")
        }
    }

    private static func requireReadAccess() throws {
        guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else {
            throw ProbeError("日历状态为 \(authorizationName())。本命令不会弹出授权；请先明确运行 authorize 并在系统提示中允许。")
        }
    }

    private static func authorizationName() -> String {
        switch EKEventStore.authorizationStatus(for: .event) {
        case .notDetermined: return "notDetermined"
        case .restricted: return "restricted"
        case .denied: return "denied"
        case .fullAccess: return "fullAccess"
        case .writeOnly: return "writeOnly"
        @unknown default: return "unknown"
        }
    }

    private static func parseOptions(_ args: [String], required: Set<String>) throws -> [String: String] {
        guard args.count % 2 == 0 else { throw ProbeError("参数必须是 --选项 值 成对提供。") }
        var result: [String: String] = [:]
        for index in stride(from: 0, to: args.count, by: 2) {
            let key = args[index]
            guard required.contains(key), result[key] == nil else { throw ProbeError("未知或重复的参数：\(key)") }
            result[key] = args[index + 1]
        }
        guard Set(result.keys) == required else { throw ProbeError("缺少必要参数。使用 --help 查看说明。") }
        return result
    }

    private static func parseDate(_ value: String) throws -> Date {
        let formatter = ISO8601DateFormatter()
        for format: ISO8601DateFormatter.Options in [[.withInternetDateTime, .withFractionalSeconds], [.withInternetDateTime]] {
            formatter.formatOptions = format
            if let date = formatter.date(from: value) { return date }
        }
        throw ProbeError("时间需要完整 ISO 8601 格式并包含时区，例如 2026-09-23T00:00:00+08:00。")
    }

    private static func write<T: Encodable>(_ value: T, to path: String) throws {
        guard path.hasPrefix("/") else { throw ProbeError("输出路径必须是绝对路径。") }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(value)
        // Refuse existing files rather than silently overwriting a previous sample.
        try data.write(to: URL(fileURLWithPath: path), options: [.withoutOverwriting])
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path)
    }
}
