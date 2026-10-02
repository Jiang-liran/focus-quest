import Foundation
import Darwin

// Pure protocol/filter/file tests only; no EKEventStore is constructed or queried.
@main
struct BridgeTests {
    static func main() throws {
        let config = CalendarBridgeConfig(schemaVersion: 1, enabled: true, calendarID: "one", allowedTitles: ["408做题", "复习数学"], lookbackDays: 90)
        try config.validate()
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let rangeStart = now.addingTimeInterval(-90 * 24 * 3600)
        func includes(_ title: String = "408做题", _ calendarID: String = "one", _ allDay: Bool = false,
                      _ start: Date = now.addingTimeInterval(-120), _ end: Date = now) -> Bool {
            CalendarBridgePolicy.includes(calendarID: calendarID, title: title, isAllDay: allDay, start: start, end: end,
                                          config: config, now: now, requestedStart: rangeStart)
        }
        precondition(includes(), "Completed allowed two-minute record must pass")
        precondition(!includes("408做题 "), "Titles require exact match")
        precondition(!includes("私人会议"), "Other titles must not be exported")
        precondition(!includes("408做题", "two"), "Other calendars must not be exported")
        precondition(!includes("408做题", "one", true), "All-day records excluded")
        precondition(!CalendarBridgePolicy.includes(calendarID: "one", title: "408做题", isAllDay: false,
                                                    start: now.addingTimeInterval(-120), end: now,
                                                    config: config, now: now, requestedStart: rangeStart, isRecurring: true),
                     "Recurring schedules excluded even when titles match")
        precondition(!includes("408做题", "one", false, now, now.addingTimeInterval(60)), "Unfinished records excluded")
        precondition(!includes("408做题", "one", false, now, now), "Zero duration excluded")
        precondition(!includes("408做题", "one", false, now, now.addingTimeInterval(-1)), "Negative duration excluded")
        precondition(!includes("408做题", "one", false, now.addingTimeInterval(-86401), now), "Longer than 24h excluded")
        precondition(includes("408做题", "one", false, now.addingTimeInterval(-86400), now), "24h boundary included")
        precondition(!includes("408做题", "one", false, rangeStart.addingTimeInterval(-120), rangeStart), "Old records excluded")
        func phase(_ start: Date, _ end: Date, title: String = "408做题", calendarID: String = "one", allDay: Bool = false,
                   recurring: Bool = false) -> CalendarBridgePolicy.EventPhase? {
            CalendarBridgePolicy.phase(calendarID: calendarID, title: title, isAllDay: allDay, start: start, end: end,
                                       config: config, now: now, requestedStart: rangeStart, isRecurring: recurring)
        }
        precondition(phase(now.addingTimeInterval(-82 * 60), now.addingTimeInterval(7 * 60)) == .pending,
                     "Backfilled 89-minute record still ending in seven minutes must be visible as pending")
        precondition(phase(now, now.addingTimeInterval(60)) == .pending, "Starting now is pending")
        precondition(phase(now.addingTimeInterval(-60), now) == .completed, "End boundary transitions to complete")
        precondition(phase(now.addingTimeInterval(1), now.addingTimeInterval(61)) == nil, "Future scheduled start excluded")
        precondition(phase(now, now) == nil && phase(now, now.addingTimeInterval(-1)) == nil, "Invalid spans excluded")
        precondition(phase(now.addingTimeInterval(-3600), now.addingTimeInterval(86400)) == nil, "Long pending span excluded")
        precondition(phase(now, now.addingTimeInterval(60), title: "私人会议") == nil, "Pending titles still restricted")
        precondition(phase(now, now.addingTimeInterval(60), calendarID: "two") == nil, "Pending calendars still restricted")
        precondition(phase(now, now.addingTimeInterval(60), allDay: true) == nil, "Pending all-day events excluded")
        precondition(phase(now, now.addingTimeInterval(60), recurring: true) == nil, "Pending recurrence excluded")

        var tracker = CalendarBridgeRefreshTracker()
        let requestID = UUID().uuidString
        func requestData(_ id: String = UUID().uuidString, date: Date = now, schema: Int = 1, fractional: Bool = false) throws -> Data {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = fractional ? [.withInternetDateTime, .withFractionalSeconds] : [.withInternetDateTime]
            return try JSONSerialization.data(withJSONObject: ["schemaVersion": schema, "requestedAt": formatter.string(from: date), "requestID": id])
        }
        let request = try requestData(requestID)
        precondition(tracker.consume(request, now: now), "New current request accepted")
        precondition(!tracker.consume(request, now: now.addingTimeInterval(1)), "Unchanged request not replayed every second")
        let fractional = try requestData(fractional: true)
        precondition(tracker.consume(fractional, now: now), "Fractional ISO timestamp accepted")
        let replay = try requestData(requestID.lowercased(), date: now.addingTimeInterval(1))
        precondition(!tracker.consume(replay, now: now), "Previously handled UUID is not replayed after another request")
        for data in [try requestData("not-a-uuid"), try requestData(schema: 2),
                     try requestData(date: now.addingTimeInterval(-301)), try requestData(date: now.addingTimeInterval(31)),
                     Data("invalid json".utf8), Data(repeating: 32, count: 4097)] {
            precondition(!tracker.consume(data, now: now), "Invalid/stale/future/oversized request excluded")
        }
        for candidate in [
            CalendarBridgeConfig(schemaVersion: 2, enabled: true, calendarID: "one", allowedTitles: ["408做题"], lookbackDays: 90),
            CalendarBridgeConfig(schemaVersion: 1, enabled: true, calendarID: "", allowedTitles: ["408做题"], lookbackDays: 90),
            CalendarBridgeConfig(schemaVersion: 1, enabled: true, calendarID: "one", allowedTitles: [], lookbackDays: 90),
            CalendarBridgeConfig(schemaVersion: 1, enabled: true, calendarID: "one", allowedTitles: ["408做题"], lookbackDays: 91)
        ] {
            do { try candidate.validate(); preconditionFailure("Invalid config accepted") }
            catch is CalendarBridgeError { }
        }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("calendar-bridge-test-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let calendar = CalendarBridgeCalendar(calendarID: "one", title: "学习", sourceTitle: "iCloud")
        let pending = CalendarBridgeEvent(calendarID: "one", calendarItemIdentifier: "sample", title: "408做题",
                                          start: now.addingTimeInterval(-120), end: now.addingTimeInterval(60))
        let ok = CalendarBridgeSnapshot(generatedAt: now, status: "ok", error: nil, calendar: calendar,
                                        requestedStart: rangeStart, requestedEnd: now, events: [], pendingEvents: [pending])
        try CalendarBridgePolicy.writeAtomically(ok, directory: directory)
        let path = directory.appendingPathComponent("calendar-bridge-snapshot.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: path)) as! [String: Any]
        precondition(object["schemaVersion"] as? Int == 1)
        precondition(object["kind"] as? String == "focus_calendar_snapshot")
        precondition((object["generatedAt"] as! String).hasSuffix("Z"))
        precondition(object["error"] == nil)
        precondition((object["events"] as! [Any]).isEmpty, "Pending record must not appear as completed")
        let pendingJSON = object["pendingEvents"] as! [[String: Any]]
        precondition(pendingJSON.count == 1 && pendingJSON[0]["title"] as? String == "408做题")
        precondition(pendingJSON[0]["notes"] == nil && pendingJSON[0]["isAllDay"] as? Bool == false)
        let attributes = try FileManager.default.attributesOfItem(atPath: path.path)
        precondition((attributes[.posixPermissions] as! NSNumber).intValue == 0o600)
        let error = CalendarBridgeSnapshot(generatedAt: now, status: "error", error: "权限不可用", calendar: calendar,
                                          requestedStart: rangeStart, requestedEnd: now, events: [], pendingEvents: [])
        try CalendarBridgePolicy.writeAtomically(error, directory: directory)
        let replaced = try JSONSerialization.jsonObject(with: Data(contentsOf: path)) as! [String: Any]
        precondition(replaced["status"] as? String == "error")
        precondition((replaced["pendingEvents"] as! [Any]).isEmpty)
        let remainingFiles = try FileManager.default.contentsOfDirectory(atPath: directory.path)
        precondition(remainingFiles.count == 1)
        let requestFile = directory.appendingPathComponent("request.json")
        try request.write(to: requestFile)
        let read = try CalendarBridgeRefreshTracker.readBoundedFile(requestFile)
        precondition(read == request)
        try Data(repeating: 32, count: 4097).write(to: requestFile)
        do { _ = try CalendarBridgeRefreshTracker.readBoundedFile(requestFile); preconditionFailure("Oversized file accepted") }
        catch is CalendarBridgeError { }
        let symlink = directory.appendingPathComponent("request-link.json")
        try FileManager.default.createSymbolicLink(atPath: symlink.path, withDestinationPath: requestFile.path)
        do { _ = try CalendarBridgeRefreshTracker.readBoundedFile(symlink); preconditionFailure("Symlink request accepted") }
        catch { }
        print("PASS: completion/pending boundary and privacy filters, refresh UUID/time/size/replay validation, bounded file reader, snapshot schema, atomic replacement and 0600 permissions")
    }
}
