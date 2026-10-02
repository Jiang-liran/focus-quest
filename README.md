# 专注远征 Focus Quest

专注远征把番茄 ToDo 已完成的学习时间记录到本机，显示四科学习进度、目标和复盘，并提供收藏、营地与小游戏。当前可编辑开发项目版本为 **1.49.15，构建号 80**。

本私有仓库用于代码备份和换电脑恢复。仓库地址：[Jiang-liran/focus-quest](https://github.com/Jiang-liran/focus-quest)。

仓库恢复了从 **1.0 / build 1** 到 **1.49.15 / build 80** 的 80 个版本的已发布 Python、HTML、CSS 和 JavaScript 运行源码。历史提交由保存下来的应用提取、按版本重新建立，**不代表原始开发过程中的 Git 提交**。旧版 Swift 源码、各版构建脚本和测试没有完整留存；80 个版本的原始应用安装包另存为 GitHub Release 附件，用来恢复原始可执行程序。最新版包含完整可编辑项目和构建脚本。

个人学习数据库、番茄账号数据、日历快照和配置、同步数据及工作过程中的私人备份均不上传 GitHub。代码恢复与个人存档恢复是两件事：若要保留钱包、收藏、奖励领取状态和学习历史，请另存私人数据库备份。

## 换电脑恢复

| 路线 | 适合情况 | 入口 |
| --- | --- | --- |
| 从 Release 安装 | 希望直接使用已保存的应用，或恢复某一旧版原始程序 | [Releases](https://github.com/Jiang-liran/focus-quest/releases) |
| 从源码构建 | 希望编辑、检查或在新 Mac 重新构建最新版 | 下方命令与[换电脑恢复指南](docs/换电脑恢复指南.md) |

Release 安装和源码构建都需要本机 `/usr/bin/python3`。主程序支持 macOS 12 以上；当前手机日历桥支持 Apple Silicon、macOS 14 以上。源码构建还需要 Xcode Command Line Tools。直接安装保存的旧版应用时，还应确认它的架构和 macOS 最低要求适合新电脑。

```sh
git clone https://github.com/Jiang-liran/focus-quest.git
cd focus-quest
bash outputs/focus-quest/macos/build.sh
mkdir -p "$HOME/Applications"
/usr/bin/ditto -x -k "outputs/专注远征.zip" "$HOME/Applications"
bash outputs/focus-quest/macos/install-service.sh "$HOME/Applications/专注远征.app"
open "$HOME/Applications/专注远征.app"
```

如果要导入旧电脑的私人存档，请在第一次打开应用和启用后台服务前，按[换电脑恢复指南](docs/换电脑恢复指南.md)恢复数据库。

## 项目目录

| 路径 | 内容 |
| --- | --- |
| `outputs/focus-quest/` | 最新后端、规则模块、完整静态界面、原生 Mac 窗口、构建与备份脚本、测试和功能文档 |
| `outputs/手机同步诊断/` | iPhone 日历自动同步所需的独立 AppKit/EventKit 辅助程序源码、服务脚本与测试 |
| `docs/换电脑恢复指南.md` | Release 安装、源码构建、私人存档迁移、电脑与手机重新连接 |
| `docs/版本恢复说明.md` | 80 个恢复版本的来源、历史提交含义、原始程序与源码恢复的边界 |

主程序只监听 `127.0.0.1:18473`，默认只读 `~/Library/Application Support/tomatodo/tomatodo_db.json`。个人存档位于 `~/Library/Application Support/FocusQuest/`。手机通道只读取明确选定的日历和任务名称白名单；新电脑需要重新确认日历权限与配置。

## 私人存档备份与开发验证

从仓库根目录生成一致 SQLite 备份，目标必须放在仓库之外的私人位置：

```sh
bash outputs/focus-quest/macos/backup-data.sh "/私人备份目录/专注远征备份.sqlite3"
```

Python 后端只依赖标准库。开发测试使用 Python 和支持 `node --test` 的 Node，无须 npm 安装；测试入口为：

```sh
cd outputs/focus-quest
/usr/bin/python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/test_*.cjs
```

构建、服务安装与数据库迁移的完整说明见[换电脑恢复指南](docs/换电脑恢复指南.md)。原有[使用说明](outputs/focus-quest/使用说明.md)中的“本机已启用”描述旧电脑状态，在新 Mac 上仍需重新安装后台服务。

## 查看历史与以后备份

[版本索引](docs/版本索引.md)列出全部80版，点击版本可以查看当版源码，点击比较可查看相邻版本的改动。最新安装包在[v1.49.15 Release](https://github.com/Jiang-liran/focus-quest/releases/tag/v1.49.15)，前79版应用在[v1.0历史安装包归档](https://github.com/Jiang-liran/focus-quest/releases/tag/v1.0)。

本次上传完成后，本机原项目目录也会关联这个仓库。后续改动需要提交并推送后，GitHub才会保存；仅在本机编辑不会自动上传。更新完成并通过对应验证后，可在仓库根目录运行：

```sh
git status
git add outputs/focus-quest outputs/手机同步诊断 README.md docs tools
git commit -m "说明本次更新的内容"
git push origin main
```

新发布版本可添加相应版本标签，并将新的安装ZIP上传到Release。请继续把个人数据库备份放在仓库之外。

最新Release还提供 `focus-quest-full-history.bundle`，可一次下载完整源码Git历史，在本机用 `git clone focus-quest-full-history.bundle focus-quest` 还原。它不包含安装ZIP和个人存档；安装包单独在Releases保存。

备份验证：619项Python测试、966项Node测试全部通过；主应用和日历桥从备份源码构建成功，日历桥纯逻辑测试通过；80版安装包解压后的签名与资源哈希全部核对。详细测试适配见[备份核验说明](docs/备份核验说明.md)。
