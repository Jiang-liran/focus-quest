import Cocoa
import WebKit
import Darwin

private let applicationTitle = "专注远征"
private let serviceURL = URL(string: "http://127.0.0.1:18473")!
private let dataDirectory = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/FocusQuest", isDirectory: true)

@main
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var backend: Process?
    private var backendLog: FileHandle?
    private var ready = false
    private var waiting = false
    private var didStartBackend = false
    private var fittingWindow = false
    private var fullScreenTransition = false
    private var reportedVisibility: Bool?
    private var windowedFrameSize = NSSize(width: 1280, height: 828)
    private var downloads: [ObjectIdentifier: (temporary: URL, destination: URL)] = [:]

    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
        withExtendedLifetime(delegate) {}
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        makeMenu()
        makeWindow()
        connect()
    }

    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool { true }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationDidBecomeActive(_ notification: Notification) { notifyOpeningArrival() }
    func windowDidBecomeKey(_ notification: Notification) { notifyOpeningArrival() }
    func applicationDidHide(_ notification: Notification) { notifyVisibility() }
    func applicationDidUnhide(_ notification: Notification) { notifyVisibility() }
    func windowDidMiniaturize(_ notification: Notification) { notifyVisibility() }
    func windowDidDeminiaturize(_ notification: Notification) { notifyVisibility() }
    func windowDidChangeOcclusionState(_ notification: Notification) { notifyVisibility() }
    func windowWillClose(_ notification: Notification) { notifyVisibility(visible: false) }

    private func notifyVisibility(visible override: Bool? = nil) {
        guard ready, let window = window else { return }
        let visible = override ?? (window.isVisible && !window.isMiniaturized && !NSApp.isHidden && window.occlusionState.contains(.visible))
        guard reportedVisibility != visible else { return }
        reportedVisibility = visible
        // The collector is independent. Only suspend the invisible web UI.
        webView?.evaluateJavaScript("window.__focusQuestVisible=\(visible);document.dispatchEvent(new CustomEvent('focusquest:visibility',{detail:{visible:\(visible)}}))", completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        reportedVisibility = nil
        notifyVisibility()
    }

    private func notifyOpeningArrival() {
        notifyVisibility()
        guard ready, let window = window, window.isVisible, !window.isMiniaturized, NSApp.isActive else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new Event('focusquest:activate'))", completionHandler: nil)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
        if !ready { connect() }
        else { notifyOpeningArrival() }
        return true
    }

    private func makeMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu(title: applicationTitle)
        appMenu.addItem(withTitle: "关于\(applicationTitle)", action: #selector(showAbout), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "隐藏\(applicationTitle)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "退出\(applicationTitle)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let editItem = NSMenuItem()
        let edit = NSMenu(title: "编辑")
        edit.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = edit.addItem(withTitle: "重做", action: Selector(("redo:")), keyEquivalent: "Z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        main.addItem(editItem)

        let viewItem = NSMenuItem()
        let view = NSMenu(title: "窗口")
        view.addItem(withTitle: "刷新", action: #selector(reload), keyEquivalent: "r")
        view.addItem(withTitle: "最小化", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        view.addItem(withTitle: "显示主窗口", action: #selector(showWindow), keyEquivalent: "1")
        let fullScreen = view.addItem(withTitle: "进入 / 退出全屏", action: #selector(toggleFullScreen), keyEquivalent: "f")
        fullScreen.keyEquivalentModifierMask = [.control, .command]
        view.addItem(.separator())
        view.addItem(withTitle: "打开数据文件夹", action: #selector(openDataFolder), keyEquivalent: "")
        viewItem.submenu = view
        main.addItem(viewItem)
        NSApplication.shared.mainMenu = main
        NSApplication.shared.windowsMenu = view
    }

    private func makeWindow() {
        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = applicationTitle
        window.delegate = self
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.backgroundColor = NSColor(calibratedRed: 0.055, green: 0.07, blue: 0.115, alpha: 1)
        window.isReleasedWhenClosed = false
        window.isRestorable = false
        window.collectionBehavior = [.fullScreenPrimary]
        window.contentView = webView
        fitWindowToScreen(center: true)
        NotificationCenter.default.addObserver(self, selector: #selector(screenParametersChanged),
                                               name: NSApplication.didChangeScreenParametersNotification,
                                               object: nil)
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    // Keep the layout at its designed size. Smaller displays get the same
    // proportions, with title-bar space included in the visible-screen limit.
    private func fitWindowToScreen(center: Bool = false) {
        guard !fittingWindow, !fullScreenTransition, let window = window,
              !window.styleMask.contains(.fullScreen),
              let screen = window.screen ?? NSScreen.main else { return }
        fittingWindow = true
        defer { fittingWindow = false }

        let available = screen.visibleFrame.insetBy(dx: 12, dy: 12)
        let reference = NSSize(width: 1280, height: 800)
        let frame = window.frameRect(forContentRect: NSRect(origin: .zero, size: reference))
        let chrome = NSSize(width: frame.width - reference.width, height: frame.height - reference.height)
        let scale = min(1, max(0.01, (available.width - chrome.width) / reference.width),
                        max(0.01, (available.height - chrome.height) / reference.height))
        let contentSize = NSSize(width: reference.width * scale, height: reference.height * scale)

        // Keep AppKit's full-screen size unconstrained. The resize delegate
        // holds the normal window at its fitted size instead of min/max locks.
        window.contentMinSize = .zero
        window.contentMaxSize = NSSize(width: 100_000, height: 100_000)
        window.setContentSize(contentSize)
        windowedFrameSize = window.frame.size
        let origin = center
            ? NSPoint(x: available.midX - window.frame.width / 2, y: available.midY - window.frame.height / 2)
            : NSPoint(x: min(max(window.frame.minX, available.minX), available.maxX - window.frame.width),
                      y: min(max(window.frame.minY, available.minY), available.maxY - window.frame.height))
        window.setFrameOrigin(origin)
    }

    func windowShouldZoom(_ window: NSWindow, toFrame newFrame: NSRect) -> Bool { false }
    func windowWillResize(_ sender: NSWindow, to frameSize: NSSize) -> NSSize {
        if fittingWindow || fullScreenTransition || sender.styleMask.contains(.fullScreen) { return frameSize }
        return windowedFrameSize
    }
    @objc private func toggleFullScreen() {
        guard !fullScreenTransition else { return }
        window.toggleFullScreen(nil)
    }
    func windowWillEnterFullScreen(_ notification: Notification) { fullScreenTransition = true }
    func windowDidEnterFullScreen(_ notification: Notification) { fullScreenTransition = false }
    func windowWillExitFullScreen(_ notification: Notification) { fullScreenTransition = true }
    func windowDidExitFullScreen(_ notification: Notification) {
        fullScreenTransition = false
        fitWindowToScreen()
    }
    func windowDidFailToEnterFullScreen(_ window: NSWindow) {
        fullScreenTransition = false
        fitWindowToScreen()
    }
    func windowDidFailToExitFullScreen(_ window: NSWindow) { fullScreenTransition = false }
    func windowDidChangeScreen(_ notification: Notification) { fitWindowToScreen() }
    @objc private func screenParametersChanged() { fitWindowToScreen() }

    private func showStatus(_ title: String, detail: String) {
        let escaped = detail.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
        webView.loadHTMLString("""
        <!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
        body{margin:0;background:#0e1420;color:#eef1fb;font:16px -apple-system,sans-serif;display:grid;place-items:center;height:100vh}
        main{max-width:560px;padding:40px}h1{font-size:32px;font-weight:650}p{color:#aebcd1;line-height:1.8}small{color:#73839b}
        </style><main><small>FOCUS QUEST · 专注远征</small><h1>\(title)</h1><p>\(escaped)</p></main></html>
        """, baseURL: nil)
    }

    private func connect() {
        guard !waiting else { return }
        waiting = true
        ready = false
        showStatus("正在准备你的远征", detail: "连接本机学习记录，马上就好。")
        checkHealth(attempt: 0)
    }

    private func checkHealth(attempt: Int) {
        var request = URLRequest(url: serviceURL.appendingPathComponent("api/health"))
        request.timeoutInterval = 1.5
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { [weak self] _, response, _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if (response as? HTTPURLResponse)?.statusCode == 200 {
                    self.waiting = false
                    self.ready = true
                    self.webView.load(URLRequest(url: serviceURL))
                    return
                }
                if attempt == 0 && !self.didStartBackend {
                    do { try self.startBackend() }
                    catch {
                        self.waiting = false
                        self.showStatus("暂时无法启动", detail: "\(error.localizedDescription) 可通过「窗口 → 打开数据文件夹」查看 server.log，再按 ⌘R 重试。")
                        return
                    }
                }
                guard attempt < 30 else {
                    self.waiting = false
                    self.didStartBackend = false
                    self.showStatus("连接还没有准备好", detail: "本机服务启动超时。请通过「窗口 → 打开数据文件夹」查看 server.log；修复后按 ⌘R 重试。")
                    return
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.checkHealth(attempt: attempt + 1) }
            }
        }.resume()
    }

    private func startBackend() throws {
        // A registered login service owns the collector lifecycle. Ask launchd
        // to start it, so a briefly unavailable service cannot race a second copy.
        let serviceTarget = "gui/\(getuid())/com.local.focusquest"
        if try runLaunchctl(["print", serviceTarget]) == 0 {
            let status = try runLaunchctl(["kickstart", serviceTarget])
            guard status == 0 else {
                throw NSError(domain: "FocusQuest", code: Int(status), userInfo: [
                    NSLocalizedDescriptionKey: "登录后台服务暂时无法启动，请检查数据文件夹内的 service.log，或重新运行 install-service.sh 更新应用路径。"
                ])
            }
            didStartBackend = true
            return
        }

        // An existing child may still be initializing; continue waiting for it.
        if backend?.isRunning == true {
            didStartBackend = true
            return
        }

        guard let resources = Bundle.main.resourceURL else {
            throw NSError(domain: "FocusQuest", code: 1, userInfo: [NSLocalizedDescriptionKey: "应用资源目录不存在，请重新打包应用。"])
        }
        let script = resources.appendingPathComponent("server.py")
        guard FileManager.default.fileExists(atPath: script.path) else {
            throw NSError(domain: "FocusQuest", code: 2, userInfo: [NSLocalizedDescriptionKey: "应用内缺少 server.py，请运行 macos/build.sh 重新打包。"])
        }
        try FileManager.default.createDirectory(at: dataDirectory, withIntermediateDirectories: true)
        let logURL = dataDirectory.appendingPathComponent("server.log")
        if !FileManager.default.fileExists(atPath: logURL.path) {
            FileManager.default.createFile(atPath: logURL.path, contents: nil)
        }
        backendLog?.closeFile()
        backendLog = try FileHandle(forWritingTo: logURL)
        backendLog?.seekToEndOfFile()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        process.arguments = ["-u", script.path]
        process.currentDirectoryURL = resources
        process.standardOutput = backendLog
        process.standardError = backendLog
        process.standardInput = FileHandle.nullDevice
        try process.run()
        backend = process
        didStartBackend = true
    }

    private func runLaunchctl(_ arguments: [String]) throws -> Int32 {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        process.arguments = arguments
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try process.run()
        process.waitUntilExit()
        return process.terminationStatus
    }

    @objc private func reload() {
        // Re-check health even if the last navigation succeeded: fetch failures
        // inside a loaded page do not generate WKNavigationDelegate errors.
        didStartBackend = false
        connect()
    }

    @objc private func showWindow() {
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
        notifyOpeningArrival()
    }

    @objc private func openDataFolder() {
        try? FileManager.default.createDirectory(at: dataDirectory, withIntermediateDirectories: true)
        NSWorkspace.shared.open(dataDirectory)
    }

    @objc private func showAbout() {
        NSApplication.shared.orderFrontStandardAboutPanel(options: [
            .applicationName: applicationTitle,
            .applicationVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.3",
            .credits: NSAttributedString(string: "把每段专注，变成看得见的成长。\n独立本地应用，非番茄 ToDo 官方产品。")
        ])
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if navigationAction.shouldPerformDownload,
           (url.scheme == "blob" || url.scheme == "data" || (url.host == "127.0.0.1" && url.port == 18473)) {
            decisionHandler(.download)
            return
        }
        if url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" {
            decisionHandler(.allow)
        } else if url.scheme == "http" && url.host == "127.0.0.1" && url.port == 18473 {
            decisionHandler(.allow)
        } else {
            if ["http", "https", "mailto"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            if url.host == "127.0.0.1" && url.port == 18473 { webView.load(navigationAction.request) }
            else if ["http", "https", "mailto"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let response = navigationResponse.response as? HTTPURLResponse
        let disposition = response?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        decisionHandler(disposition.lowercased().contains("attachment") || !navigationResponse.canShowMIMEType ? .download : .allow)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.title = "保存学习记录"
        panel.nameFieldStringValue = suggestedFilename
        panel.canCreateDirectories = true
        panel.beginSheetModal(for: window) { result in
            guard result == .OK, let destination = panel.url else { completionHandler(nil); return }
            let temporary = destination.deletingLastPathComponent()
                .appendingPathComponent(".focusquest-\(UUID().uuidString).download")
            self.downloads[ObjectIdentifier(download)] = (temporary, destination)
            completionHandler(temporary)
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let item = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        do {
            if FileManager.default.fileExists(atPath: item.destination.path) {
                _ = try FileManager.default.replaceItemAt(item.destination, withItemAt: item.temporary)
            } else {
                try FileManager.default.moveItem(at: item.temporary, to: item.destination)
            }
        } catch {
            try? FileManager.default.removeItem(at: item.temporary)
            showSaveError(error)
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let item = downloads.removeValue(forKey: ObjectIdentifier(download)) {
            try? FileManager.default.removeItem(at: item.temporary)
        }
        if (error as NSError).code == NSURLErrorCancelled { return }
        showSaveError(error)
    }

    private func showSaveError(_ error: Error) {
        let alert = NSAlert()
        alert.messageText = "文件暂时未能保存"
        alert.informativeText = "请重新导出并选择可以写入的文件夹。\n\(error.localizedDescription)"
        alert.addButton(withTitle: "好的")
        alert.beginSheetModal(for: window, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = applicationTitle
        alert.informativeText = message
        alert.addButton(withTitle: "好的")
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = applicationTitle
        alert.informativeText = message
        alert.addButton(withTitle: "确定")
        alert.addButton(withTitle: "取消")
        alert.beginSheetModal(for: window) { result in completionHandler(result == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled, !waiting else { return }
        ready = false
        didStartBackend = false
        showStatus("连接暂时中断", detail: "本机服务没有响应，按 ⌘R 尝试重新连接。学习数据保存在本机，不会因为窗口断开而删除。")
    }
}
