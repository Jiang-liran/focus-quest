# 日历采集辅助程序

`专注日历诊断.app` 使用 Apple EventKit 只读访问日历，应用身份为 `com.local.focusquest.calendarprobe`。它独立于专注远征主程序，不创建、修改或删除任何日历事件。主程序负责导入和去重；本程序只生成本机快照。

## 前台诊断与权限

打开应用后，点击“读取日历列表”才会请求 macOS 日历完整读取权限。系统没有单独的只读授权等级；本程序获得完整读取权限后仍只执行查询。

列表只展示日历名称与来源。手动选择一个日历，再点击“读取最近 1 天”，可查看该日历过去 24 小时的记录。界面最多显示 10 条标题、起止时间及备注摘要；完整诊断文件独立保存在 `~/Library/Application Support/FocusQuest/calendar-diagnostics/`，文件名唯一，不覆盖原有样本，权限为 `0600`。

这些人工诊断文件不会作为自动同步输入。诊断中的日历跨度需与番茄真实计时对照，不能仅凭起止时间断定暂停、休息或中断情况下的有效专注时长。

## 持续采集

程序读取 `~/Library/Application Support/FocusQuest/calendar-bridge-config.json`，配置格式如下。实际 `allowedTitles` 应列出获准同步的完整任务名称；采用精确匹配，不做关键词猜测。

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "calendarID": "明确选择的单个日历标识",
  "allowedTitles": ["408做题", "复习数学"],
  "lookbackDays": 90
}
```

每 30 秒重新读取配置和日历，EventKit 报告变更后也会刷新。回看范围允许 1 至 90 天。只查询配置的一个日历，并仅输出满足以下全部条件的事件：任务名称精确匹配白名单、非全天、不带重复规则且不是分离的重复实例、已经开始、跨度大于 0 且不超过 24 小时、与回看范围相交。普通重复课表不会因标题相同而进入快照。重复判断不使用 `occurrenceDate`，因为实测普通记录也可能具有该值。

已经结束的事件放入 `events`，当前处于 `start <= now < end` 的事件放入 `pendingEvents`。后者只用于说明“已发现，等待结束”，不加入学习统计。到结束时点后的下一次采集会自动将其归入 `events`。尚未到开始时间的普通计划不输出。

辅助程序另以 1 秒间隔只读检查 `calendar-bridge-refresh.json`。该请求由主程序的手动刷新操作生成，格式为 `{schemaVersion:1, requestedAt:"ISO 8601 UTC（Z）", requestID:"UUID"}`。读取限制为最多 4 KB 的普通文件；支持秒或小数秒时间，接受过去 5 分钟至未来 30 秒内的请求，并对已处理 UUID 去重。无效或未变化请求不会触发日历查询，不会删除或改写请求文件；常规 30 秒刷新保持不变。

自动快照不包含备注、地址或其他日历内容。输出固定为 `~/Library/Application Support/FocusQuest/calendar-bridge-snapshot.json`，使用权限 `0600` 的临时文件、文件同步和原子重命名替换，避免读到半份 JSON。GUI 与后台实例使用同一文件锁串行查询和写入。

快照协议：

```text
schemaVersion: 1
kind: focus_calendar_snapshot
generatedAt: ISO 8601 UTC（Z）
status: ok | error | disabled
error: 可选错误说明
calendar: {calendarID, title, sourceTitle}
requestedStart, requestedEnd: ISO 8601 UTC（Z）
events: [{calendarID, calendarItemIdentifier, eventIdentifier?, externalIdentifier?,
          title, start, end, isAllDay:false}]
pendingEvents: [同 events 的事件字段，只包含已经开始但尚未结束的记录]
```

配置不存在或关闭时输出 `disabled`；权限不足、日历消失、配置无效时输出 `error`。这两种状态的 `events` 和 `pendingEvents` 均为空；主程序应检查状态及快照时间，不能将错误快照当成成功同步或清空已有记录。无法获得日历信息时，`calendar.title` 和 `sourceTitle` 为空字符串。

后台运行不会自动申请权限。缺少权限时需打开诊断窗口，点击“读取日历列表”，由用户确认系统提示。应用名称和 bundle ID 保持稳定，但重新签名后的升级是否保留授权由 macOS 决定，必须实测。

## 构建和安装服务

要求 Apple Silicon Mac、macOS 14 或更新版本。运行 `bash build.sh` 编译 AppKit/EventKit 程序。构建在 `/private/tmp` 中签名并严格验证，然后输出应用与 ZIP；ZIP 保留未被文件同步系统添加元数据的干净签名副本。

建议将 ZIP 中应用解压安装至 `~/Applications/专注日历诊断.app`，然后执行：

```sh
bash install-service.sh "$HOME/Applications/专注日历诊断.app"
```

安装脚本先验证签名，再注册当前用户 LaunchAgent `com.local.focusquest.calendarbridge`。服务直接运行应用内部可执行文件并带 `--background`，无常规窗口或 Dock 激活。设置包括 `RunAtLoad`、`KeepAlive`、`ThrottleInterval:30`、`ProcessType:Background`；日志位于 `~/Library/Application Support/FocusQuest/calendar-bridge.log`，权限 `0600`。

前台打开应用时，存在有效开启的配置也会采集。SIGTERM、SIGINT 和正常退出会清理定时器及 EventKit 监听。应用停止不改写最后快照，主程序应通过 `generatedAt` 识别暂停或失联。

运行 `bash uninstall-service.sh` 停止并删除 LaunchAgent。它保留应用、配置、快照、诊断和学习存档；若诊断窗口仍开着，该前台进程仍可按配置采集，可退出窗口或将配置的 `enabled` 改为 `false` 停止采集。

## 文件与验证

- `CalendarProbeApp.swift`：前台诊断窗口、后台模式与生命周期。
- `CalendarBridge.swift`：配置验证、受限查询、快照协议和原子写入。
- `BridgeTests.swift`：纯逻辑过滤与本地临时文件测试，不创建或查询 EventKit 仓库。
- `AppInfo.plist`：图形应用身份及真实用途说明。
- `CalendarProbe.swift` / `Info.plist`：先前的独立命令行诊断源码，保留用于追溯，不参与当前应用构建。

当前构建已通过 Swift 编译和严格签名检查。完成/待结束时点转换、过滤、配置验证、刷新请求去重/时限/大小限制、快照结构、ISO 日期、原子替换及文件权限使用独立临时目录测试；不会将测试内容写入真实同步快照。
