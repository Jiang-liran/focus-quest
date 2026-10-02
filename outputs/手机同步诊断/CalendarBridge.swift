import AppKit
import EventKit
import Foundation
import Darwin

struct CalendarBridgeConfig: Decodable {
    let schemaVersion: Int
    let enabled: Bool
    let calendarID: String
    let allowedTitles: [String]
    let lookbackDays: Int

    func validate() throws {
        guard schemaVersion == 1 else { throw CalendarBridgeError("日历同步配置版本不支持。") }
        guard !calendarID.isEmpty, calendarID.count <= 512 else { throw CalendarBridgeError("日历同步未明确指定一个日历。") }
        guard (1...90).contains(lookbackDays) else { throw CalendarBridgeError("日历同步回看范围必须为 1 至 90 天。") }
        guard !allowedTitles.isEmpty, allowedTitles.count <= 200,
              allowedTitles.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.count <= 256 }) else {
            throw CalendarBridgeError("日历同步需要明确的任务名称白名单。")
        }
    }
}

struct CalendarBridgeError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

struct CalendarBridgeCalendar: Encodable {
    let calendarID: String
    let title: String
    let sourceTitle: String
}

struct CalendarBridgeEvent: Encodable {
    let calendarID: String
    let calendarItemIdentifier: String
    let eventIdentifier: String?
    let externalIdentifier: String?
    let title: String
    let start: Date
    let end: Date
    let isAllDay: Bool

    init(calendarID: String, calendarItemIdentifier: String, eventIdentifier: String? = nil,
         externalIdentifier: String? = nil, title: String, start: Date, end: Date, isAllDay: Bool = false) {
        self.calendarID = calendarID
        self.calendarItemIdentifier = calendarItemIdentifier
        self.eventIdentifier = eventIdentifier
        self.externalIdentifier = externalIdentifier
        self.title = title
        self.start = start
        self.end = end
        self.isAllDay = isAllDay
    }

    init(_ event: EKEvent) {
        calendarID = event.calendar.calendarIdentifier
        calendarItemIdentifier = event.calendarItemIdentifier
        eventIdentifier = event.eventIdentifier
        externalIdentifier = event.calendarItemExternalIdentifier
        title = event.title ?? ""
        start = event.startDate
        end = event.endDate
        isAllDay = event.isAllDay
    }
}

struct CalendarBridgeSnapshot: Encodable {
    let schemaVersion = 1
    let kind = "focus_calendar_snapshot"
    let generatedAt: Date
    let status: String
    let error: String?
    let calendar: CalendarBridgeCalendar
    let requestedStart: Date
    let requestedEnd: Date
    let events: [CalendarBridgeEvent]
    let pendingEvents: [CalendarBridgeEvent]
}

enum CalendarBridgePolicy {
    enum EventPhase { case completed, pending }

    static func phase(calendarID: String, title: String, isAllDay: Bool, start: Date, end: Date,
                      config: CalendarBridgeConfig, now: Date, requestedStart: Date, isRecurring: Bool = false) -> EventPhase? {
        let span = end.timeIntervalSince(start)
        guard calendarID == config.calendarID, config.allowedTitles.contains(title), !isAllDay, !isRecurring,
              start <= now, end > requestedStart, span > 0, span <= 24 * 60 * 60 else { return nil }
        return end <= now ? .completed : .pending
    }

    static func includes(calendarID: String, title: String, isAllDay: Bool, start: Date, end: Date,
                         config: CalendarBridgeConfig, now: Date, requestedStart: Date, isRecurring: Bool = false) -> Bool {
        phase(calendarID: calendarID, title: title, isAllDay: isAllDay, start: start, end: end,
              config: config, now: now, requestedStart: requestedStart, isRecurring: isRecurring) == .completed
    }

    static func writeAtomically(_ snapshot: CalendarBridgeSnapshot, directory: URL) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(snapshot)
        let destination = directory.appendingPathComponent("calendar-bridge-snapshot.json")
        let temporary = directory.appendingPathComponent(".calendar-bridge-\(UUID().uuidString).tmp")
        let descriptor = Darwin.open(temporary.path, O_WRONLY | O_CREAT | O_EXCL, 0o600)
        guard descriptor >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        defer { try? FileManager.default.removeItem(at: temporary) }
        do {
            try handle.write(contentsOf: data)
            try handle.synchronize()
            try handle.close()
            guard Darwin.rename(temporary.path, destination.path) == 0 else {
                throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
            }
        } catch { try? handle.close(); throw error }
    }
}

struct CalendarBridgeRefreshRequest: Decodable {
    let schemaVersion: Int
    let requestedAt: String
    let requestID: String
}

// At most one 4 KB request is inspected per second. Recently handled UUIDs are
// retained until their timestamps expire, so an unchanged/replayed file cannot
// generate a busy calendar-query loop. No request file is deleted or rewritten.
struct CalendarBridgeRefreshTracker {
    private var handled: [String: Date] = [:]

    mutating func consume(_ data: Data, now: Date) -> Bool {
        guard data.count <= 4096,
              let request = try? JSONDecoder().decode(CalendarBridgeRefreshRequest.self, from: data),
              request.schemaVersion == 1, let uuid = UUID(uuidString: request.requestID),
              request.requestedAt.hasSuffix("Z"), request.requestedAt.count <= 40 else { return false }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = formatter.date(from: request.requestedAt)
        if date == nil {
            formatter.formatOptions = [.withInternetDateTime]
            date = formatter.date(from: request.requestedAt)
        }
        guard let requestedAt = date, requestedAt >= now.addingTimeInterval(-300),
              requestedAt <= now.addingTimeInterval(30) else { return false }
        handled = handled.filter { $0.value >= now.addingTimeInterval(-300) }
        let identifier = uuid.uuidString
        guard handled[identifier] == nil else { return false }
        // The one-second poll cannot fill this within the five-minute valid
        // window; the bound also protects future accidental callers.
        guard handled.count < 512 else { return false }
        handled[identifier] = requestedAt
        return true
    }

    static func readBoundedFile(_ url: URL) throws -> Data {
        let descriptor = Darwin.open(url.path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
        guard descriptor >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        defer { try? handle.close() }
        var fileInfo = stat()
        guard fstat(descriptor, &fileInfo) == 0, (fileInfo.st_mode & S_IFMT) == S_IFREG,
              fileInfo.st_size >= 0, fileInfo.st_size <= 4096 else {
            throw CalendarBridgeError("日历刷新请求不是有效的小型普通文件。")
        }
        let data = try handle.read(upToCount: 4097) ?? Data()
        guard data.count <= 4096 else { throw CalendarBridgeError("日历刷新请求过大。") }
        return data
    }
}

@MainActor
final class CalendarBridge {
    private let store: EKEventStore
    private let directory: URL
    private var timer: Timer?
    private var requestTimer: Timer?
    private var requestTracker = CalendarBridgeRefreshTracker()
    private var changeObserver: NSObjectProtocol?
    private var pendingChange: DispatchWorkItem?
    private var running = false
    var onStatus: ((String) -> Void)?

    init(store: EKEventStore) {
        self.store = store
        directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("FocusQuest", isDirectory: true)
    }

    func start() {
        guard !running else { return }
        running = true
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
        requestTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.checkRefreshRequest() }
        }
        changeObserver = NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: store, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.scheduleRefresh() }
        }
        refresh()
    }

    func stop() {
        running = false
        timer?.invalidate()
        timer = nil
        requestTimer?.invalidate()
        requestTimer = nil
        pendingChange?.cancel()
        pendingChange = nil
        if let changeObserver { NotificationCenter.default.removeObserver(changeObserver) }
        changeObserver = nil
    }

    private func checkRefreshRequest() {
        guard running else { return }
        let url = directory.appendingPathComponent("calendar-bridge-refresh.json")
        guard let data = try? CalendarBridgeRefreshTracker.readBoundedFile(url),
              requestTracker.consume(data, now: Date()) else { return }
        refresh()
    }

    private func scheduleRefresh() {
        guard running else { return }
        pendingChange?.cancel()
        let work = DispatchWorkItem { [weak self] in
            Task { @MainActor in self?.refresh() }
        }
        pendingChange = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: work)
    }

    func refresh() {
        guard running else { return }
        let now = Date()
        var requestedStart = now
        var metadata = CalendarBridgeCalendar(calendarID: "", title: "", sourceTitle: "")
        // Serialize a background and a manually opened instance, if both exist.
        // A complete query + atomic replacement is protected by the same lock.
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        } catch { onStatus?("无法创建本地日历同步目录：\(error.localizedDescription)"); return }
        let lock = Darwin.open(directory.appendingPathComponent(".calendar-bridge.lock").path, O_WRONLY | O_CREAT, 0o600)
        guard lock >= 0 else { onStatus?("无法锁定本地日历同步文件。"); return }
        defer { _ = flock(lock, LOCK_UN); _ = Darwin.close(lock) }
        guard flock(lock, LOCK_EX | LOCK_NB) == 0 else { return }

        func publish(status: String, error: String? = nil, events: [CalendarBridgeEvent] = [],
                     pendingEvents: [CalendarBridgeEvent] = []) throws {
            let snapshot = CalendarBridgeSnapshot(generatedAt: now, status: status, error: error, calendar: metadata,
                                                  requestedStart: requestedStart, requestedEnd: now, events: events,
                                                  pendingEvents: pendingEvents)
            try CalendarBridgePolicy.writeAtomically(snapshot, directory: directory)
        }
        do {
            let configURL = directory.appendingPathComponent("calendar-bridge-config.json")
            guard FileManager.default.fileExists(atPath: configURL.path) else {
                try publish(status: "disabled")
                onStatus?("自动同步尚未配置。")
                return
            }
            let configData = try Data(contentsOf: configURL)
            guard configData.count <= 64 * 1024 else { throw CalendarBridgeError("日历同步配置文件过大。") }
            let config = try JSONDecoder().decode(CalendarBridgeConfig.self, from: configData)
            metadata = CalendarBridgeCalendar(calendarID: config.calendarID, title: "", sourceTitle: "")
            guard config.enabled else {
                try publish(status: "disabled")
                onStatus?("自动同步已关闭。")
                return
            }
            try config.validate()
            requestedStart = now.addingTimeInterval(-Double(config.lookbackDays) * 24 * 60 * 60)
            // Background collection MUST NOT ask for permission. Only the GUI button can.
            guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else {
                throw CalendarBridgeError("缺少日历完整读取权限。请打开专注日历诊断，点击读取日历列表并在系统提示中允许。")
            }
            guard let calendar = store.calendar(withIdentifier: config.calendarID), calendar.allowedEntityTypes.contains(.event) else {
                throw CalendarBridgeError("找不到配置的日历。请检查 iCloud 日历同步及已选择的日历。")
            }
            metadata = CalendarBridgeCalendar(calendarID: calendar.calendarIdentifier, title: calendar.title, sourceTitle: calendar.source.title)
            // Never use calendars:nil, and never include notes or unapproved titles in the snapshot.
            let predicate = store.predicateForEvents(withStart: requestedStart, end: now, calendars: [calendar])
            let candidates = store.events(matching: predicate).compactMap { event -> (event: CalendarBridgeEvent, phase: CalendarBridgePolicy.EventPhase)? in
                guard let start = event.startDate, let end = event.endDate,
                      let phase = CalendarBridgePolicy.phase(calendarID: event.calendar.calendarIdentifier, title: event.title ?? "",
                                                              isAllDay: event.isAllDay, start: start, end: end,
                                                              config: config, now: now, requestedStart: requestedStart,
                                                              isRecurring: event.hasRecurrenceRules || !(event.recurrenceRules ?? []).isEmpty
                                                                  || event.isDetached) else { return nil }
                return (CalendarBridgeEvent(event), phase)
            }.sorted {
                if $0.event.start != $1.event.start { return $0.event.start < $1.event.start }
                return $0.event.calendarItemIdentifier < $1.event.calendarItemIdentifier
            }
            let events = candidates.filter { $0.phase == .completed }.map(\.event)
            let pendingEvents = candidates.filter { $0.phase == .pending }.map(\.event)
            try publish(status: "ok", events: events, pendingEvents: pendingEvents)
            let pendingText = pendingEvents.isEmpty ? "" : "，另有 \(pendingEvents.count) 条待结束"
            onStatus?("自动同步正常：\(calendar.title)，最近 \(config.lookbackDays) 天 \(events.count) 条已完成记录\(pendingText)；每 30 秒刷新，支持立即刷新请求。")
        } catch {
            // Error/disabled snapshots carry no events. Importers must check status.
            let message: String
            if error is DecodingError { message = "日历同步配置格式无效，请检查配置文件。" }
            else { message = error.localizedDescription }
            do { try publish(status: "error", error: message) }
            catch { onStatus?("无法保存本地同步状态：\(error.localizedDescription)"); return }
            onStatus?("自动同步暂不可用：\(message)")
        }
    }
}
