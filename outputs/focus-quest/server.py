#!/usr/bin/env python3
"""Focus Quest: local-only, read-only TomatoTodo importer and study dashboard.

No third-party packages are required. Records stay recoverable in a separate
SQLite archive; confirmed source deletions move them out of active statistics.
Daily goals and confirmed weekly goals retain their date-specific history.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import io
import json
import math
import mimetypes
import os
import signal
import sqlite3
import threading
import time
import tempfile
import uuid
from contextlib import contextmanager, nullcontext
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

_arcade_spec = importlib.util.spec_from_file_location("focusquest_arcade_rules", Path(__file__).with_name("arcade_rules.py"))
arcade_rules = importlib.util.module_from_spec(_arcade_spec)
_arcade_spec.loader.exec_module(arcade_rules)
_lottery_spec = importlib.util.spec_from_file_location("focusquest_lottery_rules", Path(__file__).with_name("lottery_rules.py"))
lottery_rules = importlib.util.module_from_spec(_lottery_spec)
_lottery_spec.loader.exec_module(lottery_rules)
_shop_spec = importlib.util.spec_from_file_location("focusquest_shop_expansion", Path(__file__).with_name("shop_catalog_expansion.py"))
shop_expansion = importlib.util.module_from_spec(_shop_spec)
_shop_spec.loader.exec_module(shop_expansion)

DEFAULT_SOURCE = Path.home() / "Library/Application Support/tomatodo/tomatodo_db.json"
DEFAULT_DATA = Path.home() / "Library/Application Support/FocusQuest"
STATIC_DIR = Path(__file__).resolve().parent / "static"
POLL_SECONDS = 3
CALENDAR_STALE_SECONDS = 180
SUBJECTS = (
    ("math", "数学", "#65e4b4"),
    ("cs", "408", "#ab9bff"),
    ("politics", "政治", "#ffbd79"),
    ("english", "英语", "#75c9ff"),
)
SUBJECT_IDS = {s[0] for s in SUBJECTS}
# Short, self-checked learning actions. They never award time or currency.
ACTION_TEMPLATES = {
    "math-practice": {"subject": "math", "title": "把一道例题，变成自己的解法", "estimatedMinutes": 15,
        "steps": ["选一道刚学过方法的题，合上例题与答案，独立写出解题过程。", "对照答案，圈出第一处卡住或走偏的位置，不只看最终结果。", "遮住答案重做卡点，并用一句话写出下次如何识别这个方法。"],
        "prompt": "这道题的识别线索是什么？我最先卡在哪一步？"},
    "math-recall": {"subject": "math", "title": "给一个公式补上使用边界", "estimatedMinutes": 10,
        "steps": ["不翻书，写出一个常用公式或定理，以及你记得的适用条件。", "打开笔记核对条件，补一个不能直接使用它的反例。", "用自己的话解释：遇到什么线索可以用它，缺少什么条件就要停下。"],
        "prompt": "这个公式最容易漏掉的条件是什么？"},
    "cs-practice": {"subject": "cs", "title": "让一个 408 概念跑起来", "estimatedMinutes": 15,
        "steps": ["选一个刚学过的算法、协议或系统过程，自己画出数据流或状态变化。", "代入一个小例子，逐步走一遍，并标出关键数据如何变化。", "对照教材找出遗漏的一步，再不看资料解释为什么需要这一步。"],
        "prompt": "哪个状态变化最容易被我跳过？它为什么必不可少？"},
    "cs-recall": {"subject": "cs", "title": "把相近概念放在一起辨清", "estimatedMinutes": 10,
        "steps": ["挑两个容易混淆的概念，不查资料，分别写下作用和使用场景。", "翻书核对，用同一个例子比较它们的输入、过程与结果。", "合上资料，写出一道能区分这两个概念的判断题，并解释答案。"],
        "prompt": "区分这两个概念，最关键的一个问题是什么？"},
    "politics-practice": {"subject": "politics", "title": "从选项里找出真正的分歧", "estimatedMinutes": 10,
        "steps": ["选一道相关选择题，不看解析，写出选择答案的理由。", "逐项判断：它对应什么知识点，错在条件、主体还是表述范围。", "核对解析，合上答案后用一句话纠正最有迷惑性的选项。"],
        "prompt": "哪一个限定词改变了这道题的判断？"},
    "politics-recall": {"subject": "politics", "title": "闭卷搭出一页政治提纲", "estimatedMinutes": 10,
        "steps": ["选一个刚学过的小节，合上资料，写下主题与三个关键词。", "按原因、内容、意义或逻辑关系，把关键词连成简短提纲。", "对照资料补齐一个遗漏，再合上书复述一次这条逻辑。"],
        "prompt": "我漏掉的关键词是什么？它与前后内容如何相连？"},
    "english-practice": {"subject": "english", "title": "拆开一句真正没读懂的长句", "estimatedMinutes": 15,
        "steps": ["从正在读的文章选一个长句，先不看译文，圈出主语、谓语和连接词。", "分开主干与修饰成分，自己写出一句通顺的中文意思。", "对照译文找出理解偏差，再遮住译文重新解释原句的结构。"],
        "prompt": "让我误解这句话的，是哪个结构或词义？"},
    "english-recall": {"subject": "english", "title": "让几个熟词真正能被想起来", "estimatedMinutes": 10,
        "steps": ["从今天材料中选五个词或短语，只看英文，主动写出语境中的意思。", "核对原文，把没想起来或意思偏了的词单独标出。", "遮住解释再回忆一次，并为最不熟的一项写一个短语或例句。"],
        "prompt": "哪一个词脱离选项后我就想不起来？我给它补了什么语境？"},
}
ACTIVITY_TYPES = (
    ("lecture", "听课"),
    ("practice", "做题"),
    ("other", "复习 / 其他"),
)
ACTIVITY_IDS = {item[0] for item in ACTIVITY_TYPES}
# These exact task names were confirmed by the user to mean attending lessons.
# Other tasks containing “复习” are intentionally left unclassified.
CONFIRMED_LECTURE_TASKS = {"复习数学", "复习408", "复习政治", "复习英语"}
DEFAULT_SETTINGS = {
    "targets": {"math": 180, "cs": 180, "politics": 60, "english": 60},
    "weeklyTarget": 3000,
    "mapping": {}, "activityMapping": {}, "motion": True, "sound": False,
}
QUEST_DEFINITIONS = (
    {"subject": "math", "name": "数学 · 推演晨光", "period": "morning", "target": 60, "openHour": 0, "deadlineHour": 12},
    {"subject": "politics", "name": "政治 · 思辨札记", "period": "morning", "target": 30, "openHour": 0, "deadlineHour": 12},
    {"subject": "cs", "name": "408 · 解构星图", "period": "afternoon", "target": 60, "openHour": 12, "deadlineHour": 18},
    {"subject": "english", "name": "英语 · 译读回响", "period": "afternoon", "target": 30, "openHour": 12, "deadlineHour": 18},
)
SHOP_CATALOG = (
    ("bar-default", "bar", "初旅刻度", "用精细的路程刻度，留下每一段专注走过的位置", 0, 0),
    ("bar-mint", "bar", "薄荷新芽", "嫩芽沿进度探出，枝叶随着积累慢慢生长", 120, 0),
    ("bar-aurora", "bar", "极光流转", "垂落的极光丝带轻轻起伏，沿学习进度铺开", 240, 0),
    ("bar-comet", "bar", "彗星轨迹", "彗星引领进度向前，身后留下拖尾与细碎星尘", 360, 0),
    ("bar-tide", "bar", "潮汐回响", "让可见的水流与层层波纹，在专注积累中缓缓推进", 480, 0),
    ("bar-prism", "bar", "棱镜虹光", "RGB 玻璃光轨中虹彩交汇，双束辉光与明亮光芯随专注流动", 0, 12),
    ("bar-koi", "bar", "锦鲤清渠", "荷叶点缀清浅水渠，锦鲤伴着水波游向进度前沿", 0, 16),
    ("bar-fox", "bar", "狐伴花径", "小狐狸沿盛开的花径轻跑，陪伴每一步学习进度", 0, 18),
    ("bar-whale", "bar", "星鲸漫游", "星鲸随进度游过星河，身后留下安静的星光涟漪", 0, 20),
    ("bar-dragon", "bar", "云龙巡天", "云龙引领层叠云带向前，鳞光沿着专注的轨迹流动", 0, 24),
    ("fx-default", "fx", "初旅星光", "保留雨夜星辉城的柔和灯光与群岛原有的细碎星光", 0, 0),
    ("fx-fireflies", "fx", "萤火微光", "让轻盈萤火点缀星辉城的建筑与庭院", 180, 0),
    ("fx-petals", "fx", "花瓣来信", "让零星花瓣掠过星辉城，添一层柔和景色", 300, 0),
    ("fx-snow", "fx", "静雪漫舞", "用安静雪意装点星辉城的城楼与夜空", 420, 0),
    ("fx-meteor", "fx", "流星庆典", "在星辉城上空铺开流星划过的光迹", 0, 12),
    ("fx-nebula", "fx", "星云呼吸", "以层叠星云光彩环绕星辉城的天际", 0, 18),
    ("avatar-default", "avatar", "初旅行装", "朴素旅装随主线每完成25%增添细节，100%呈现完整模样", 0, 0),
    ("avatar-ranger", "avatar", "知识游侠", "游侠行装随主线每完成25%逐阶强化，100%呈现完整模样", 180, 0),
    ("avatar-voyager", "avatar", "远航行者", "远航行装随主线每完成25%逐阶强化，100%呈现完整模样", 300, 0),
    ("avatar-alchemist", "avatar", "灵感炼金师", "炼金师衣装随主线每完成25%逐阶强化，100%呈现完整模样", 420, 0),
    ("avatar-star", "avatar", "星辉旅者", "星色旅装随主线每完成25%逐阶强化，100%呈现完整模样", 0, 12),
    ("avatar-royal", "avatar", "晨曦冠冕", "冠冕行装随主线每完成25%逐阶强化，100%呈现完整模样", 0, 18),
    ("banner-default", "banner", "营地素纹", "星辉城入口与旅人装扮卡片原有的铭牌边框", 0, 0),
    ("banner-leaf", "banner", "青叶纹章", "让清新叶纹在旅人铭牌边框上舒展", 120, 0),
    ("banner-parchment", "banner", "羊皮书页", "用泛黄书页般的卡片边框衬托每一步成长", 240, 0),
    ("banner-obsidian", "banner", "曜石纹章", "用沉静深色的铭牌边框衬托旅人行装", 360, 0),
    ("banner-celestial", "banner", "天穹星纹", "让星轨在旅人卡片的铭牌纹章中交汇", 0, 10),
    ("banner-sovereign", "banner", "远征王徽", "把坚持的轨迹镌刻在自己的铭牌边框上", 0, 16),
    ("theme-default", "theme", "初始星岛", "保留星辉城的静谧雨夜与首页群岛熟悉的星空环境", 0, 0),
    ("theme-forest", "theme", "森间秘境", "让雨夜星辉城染上幽绿的林间色调，同时装点首页群岛环境", 0, 24),
    ("theme-ocean", "theme", "深海回廊", "让雨夜星辉城映入深蓝海光，同时装点首页群岛环境", 0, 36),
    ("theme-sakura", "theme", "樱色晴空", "让雨夜星辉城泛起柔和樱色，同时为首页群岛铺开樱色天幕", 0, 48),
    ("theme-aurora", "theme", "极夜天幕", "让雨夜星辉城带上极光的冷色光晕，同时装点首页群岛天际", 0, 60),
    ("interface-default", "interface", "原初星夜", "保留熟悉的紫色夜幕与界面纹理，可与所有装饰、时装和特效搭配", 0, 0),
    ("interface-forest", "interface", "松风书斋", "让界面浸入松绿与暖木色，以枝叶边饰和书斋纹理装点卡片；保留已装备的装饰与特效", 1200, 0),
    ("interface-tide", "interface", "潮汐航图", "为界面换上深蓝海色、航图网格与罗盘细节；保留已装备的装饰与特效", 1800, 0),
    ("interface-amber", "interface", "琥珀工坊", "让琥珀暖光、黄铜边框与工坊刻度贯穿界面；保留已装备的装饰与特效", 0, 24),
    ("interface-paper", "interface", "月白手札", "用月白纸面、墨色文字与手札页边带来明亮界面；保留已装备的装饰与特效", 0, 32),
    ("interface-rain", "interface", "夜雨窗灯", "深蓝玻璃窗卡片配雨痕与暖灯角，按钮像窗边的小灯牌", 690, 0),
    ("interface-ember", "interface", "炉边织毯", "暖棕织毯纹理配缝线边框与柔软圆角，像在炉边翻看手记", 480, 0),
    ("interface-ink", "interface", "墨山行记", "浅纸面铺开墨线山形，章印角标与书签按钮组成安静行记", 860, 0),
    ("interface-garden", "interface", "玻璃花房", "浅薄荷玻璃卡片映入温室窗格与叶纹，花房标签点缀按钮", 0, 18),
    ("interface-observatory", "interface", "星图档案", "靛蓝星轨与档案标签贯穿卡片，刻度细框像一张观测记录", 0, 24),
    ("interface-neon", "interface", "雨巷电台", "黑蓝玻璃配双色霓虹切角与频谱细纹，按钮像雨巷电台面板", 0, 36),
    ("companion-default", "companion", "独自出发", "独自停留在雨夜星辉城的桥边，暂不携带随行伙伴", 0, 0),
    ("companion-fox", "companion", "萤尾灵狐", "让萤尾灵狐陪旅人停留在星辉城桥边，点缀雨夜街景", 0, 16),
    ("companion-owl", "companion", "书卷夜枭", "让书卷夜枭陪旅人停留在星辉城桥边，点缀雨夜街景", 0, 24),
    ("companion-whale", "companion", "浮空星鲸", "让浮空星鲸陪着旅人，游弋于星辉城桥边的灯影间", 0, 36),
    ("companion-dragon", "companion", "晨光幼龙", "让晨光幼龙陪旅人停留在星辉城桥边，点缀雨夜街景", 0, 48),
    ("relic-default", "relic", "初始晶台", "保留星织小铺原有的朴素陈设，不额外添置展品", 0, 0),
    ("relic-lotus", "relic", "映月莲台", "在星织小铺橱窗陈列映月莲台，让莲瓣映出柔和光影", 0, 20),
    ("relic-orrery", "relic", "群星仪轨", "在星织小铺橱窗陈列群星仪轨，为雨夜添一处静谧星景", 0, 32),
    ("relic-hourglass", "relic", "时砂圣坛", "在星织小铺橱窗陈列时砂圣坛，收藏灯下流逝的时光", 0, 44),
    ("portal-default", "portal", "未开启", "保留星辉城归途车站原有的门庭，不另添门景", 0, 0),
    ("portal-moon", "portal", "月门微光", "以柔和的月光门景装点星辉城归途车站的门庭", 0, 24),
    ("portal-archive", "portal", "典藏之门", "以典藏书库式门景装点星辉城归途车站的门庭", 0, 36),
    ("portal-cosmos", "portal", "寰宇裂隙", "以遥望宇宙的裂隙门景装点星辉城归途车站的门庭", 0, 48),
    ("island-default", "island", "素岛原貌", "保留首页主岛原有风景，不添加布置", 0, 0),
    ("island-lanterns", "island", "旅途灯径", "整套灯径布置，以左前矮灯与石径点亮首页主岛，留出篝火归途", 240, 0),
    ("island-garden", "island", "苔石花庭", "整套花庭布置，以左前花箱、苔石与低矮花簇装点首页主岛", 420, 0),
    ("island-pavilion", "island", "观星歇亭", "整套歇亭布置，以后侧小亭与前景花箱留出首页主岛的观星角落", 0, 10),
    ("island-supplies", "island", "行旅书箱", "整套行旅布置，在首页主岛左前收好书箱与补给，留下启程的小角落", 160, 0),
    ("island-banners", "island", "风信旌旗", "整套旌旗布置，以前景矮灯与后侧旗架为首页主岛添一份远行气息", 640, 0),
    ("island-fountain", "island", "月泉水庭", "整套水庭布置，用前景花箱与后侧小泉庭装点首页主岛", 0, 14),
    ("island-library", "island", "灯廊书院", "整套书院布置，以左前书箱与后侧灯廊书院留住首页主岛的书香", 0, 20),
    ("island-observatory", "island", "星轨仪台", "整套观星布置，让前景矮灯与后侧星轨仪台映衬首页主岛夜色", 0, 28),
    ("island-arcade", "island", "流光回廊", "整套回廊布置，以前景花箱与后侧层叠灯廊丰富首页主岛", 0, 38),
    ("island-palace", "island", "云顶星苑", "整套星苑布置，以前景花箱、矮灯与后侧精巧楼苑装点首页主岛", 0, 52),
    ("trail-default", "camptrail", "泥土归途", "保留营地区域原有的泥土小径，通向歇脚处", 0, 0),
    ("trail-stone", "camptrail", "青石步道", "以朴素青石铺出营地小径，连接帐篷与火边", 240, 0),
    ("trail-stars", "camptrail", "星砂小径", "让细碎星砂沿营地小径发亮，点缀归途", 0, 10),
    ("campmark-default", "campmark", "归途路牌", "保留营地入口熟悉的木路牌", 0, 0),
    ("campmark-chimes", "campmark", "风铃木架", "在营地入口立起木架与风铃，作为安静的地标陈设", 360, 0),
    ("campmark-moon", "campmark", "月相仪", "在营地区域安放一座小月相仪，留一处看星的位置", 0, 18),
    ("camp-default", "camp", "初旅营地", "保留营地区域原有的平缓土地与远景", 0, 0),
    ("camp-pine", "camp", "松间歇脚", "让营地区域的远景与地面融入安静松林", 0, 18),
    ("camp-lake", "camp", "湖畔微澜", "让湖岸与远山环绕营地区域，留一处歇脚的地方", 0, 28),
    ("camp-snow", "camp", "雪原守夜", "用雪地与远山围起一片温暖的营地区域", 0, 40),
    ("camp-aurora", "camp", "极光停泊", "为整片营地区域铺开柔和的极光夜色", 0, 54),
    ("fire-default", "fire", "初旅篝火", "营地里最初那簇熟悉的暖色火光", 0, 0),
    ("fire-copper", "fire", "铜炉暖焰", "用温润的铜色火炉围起一簇小火", 180, 0),
    ("fire-lantern", "fire", "灯笼火座", "让灯笼式火座为营地围坐处留下一圈暖光", 300, 0),
    ("fire-blue", "fire", "幽蓝炉火", "给火焰换上一层安静的蓝色光彩", 0, 12),
    ("fire-star", "fire", "星焰小憩", "把点点星色装进火边的微光里", 0, 18),
    ("tent-default", "tent", "朴素行帐", "保留营地歇脚处原有的简朴帐篷", 0, 0),
    ("tent-patchwork", "tent", "补丁小帐", "用拼接布片给帐篷添一点旅途的生活气息", 180, 0),
    ("tent-ranger", "tent", "游侠行帐", "在篝火旁支起便于远行的游侠帐篷", 300, 0),
    ("tent-canopy", "tent", "林间篷亭", "换上一座适合停下来闲坐的轻巧篷亭", 420, 0),
    ("tent-observatory", "tent", "观星帐屋", "让帐篷带上小小观星站的模样", 0, 16),
    ("campgear-default", "campgear", "轻装休憩", "保留篝火边原有的简单陈设", 0, 0),
    ("campgear-tea", "campgear", "暖茶小桌", "在火边摆好茶壶与杯子，添一处闲聊的小桌", 120, 0),
    ("campgear-books", "campgear", "旧书一角", "让几册旧书与随手的笔记留在篝火旁", 240, 0),
    ("campgear-picnic", "campgear", "野餐闲席", "铺开野餐小席，为营地添一点生活里的滋味", 360, 0),
    ("campgear-music", "campgear", "旅途琴架", "把旅途乐器摆在火边，作为一件安静的陈设", 0, 12),
    ("campglow-default", "campglow", "夜色澄净", "保留营地区域原有的澄净夜色", 0, 0),
    ("campglow-fireflies", "campglow", "萤火作伴", "让轻盈萤光点缀营地区域的草地与帐篷", 180, 0),
    ("campglow-petals", "campglow", "花瓣晚风", "让零星花瓣掠过营地区域的小径与草地", 300, 0),
    ("campglow-snow", "campglow", "细雪轻落", "给篝火周围添一层轻轻落下的雪意", 0, 12),
    ("campglow-stardust", "campglow", "星尘入夜", "用细碎星光点缀营地里的夜色", 0, 18),
    ("chatframe-default", "chatframe", "营地素笺", "保留营地伙伴对话原有的简洁外观", 0, 0),
    ("chatframe-linen", "chatframe", "亚麻轻语", "给对话卡片换上柔和的亚麻纹理边饰", 120, 0),
    ("chatframe-wood", "chatframe", "木纹闲话", "用温暖木纹装点每一段火边闲谈", 240, 0),
    ("chatframe-parchment", "chatframe", "旅途信笺", "让对话像写在一张随身的旧信纸上", 360, 0),
    ("chatframe-constellation", "chatframe", "星图低语", "让小小星图沿着对话卡片边缘铺开", 0, 12),
)
SHOP_CATALOG = SHOP_CATALOG + shop_expansion.SHOP_CATALOG_EXTRA
SHOP_ITEMS = {item[0]: dict(zip(("id", "slot", "name", "description", "coins", "diamonds"), item))
              for item in SHOP_CATALOG}
for _item_id, _metadata in shop_expansion.SHOP_ITEM_META.items():
    SHOP_ITEMS[_item_id].update(_metadata)
SHOP_CATEGORIES = {"bar": "进度条", "fx": "星岛特效", "avatar": "我的时装",
                   "banner": "旅人铭牌", "theme": "星岛环境", "interface": "界面主题", "companion": "随行伙伴",
                   "relic": "星岛圣物", "portal": "远征之门", "island": "主岛布置", "camp": "营地地貌",
                   "fire": "篝火样式", "tent": "歇脚帐篷", "campgear": "营地陈设",
                   "campglow": "营地氛围", "chatframe": "对话外观", "camptrail": "营地小径", "campmark": "营地地标"}
LEGACY_SHOP_ITEM_IDS = ("bar-aurora", "bar-comet", "fx-fireflies", "fx-meteor", "npc-scholar",
                        "npc-astral", "avatar-ranger", "avatar-star")
EXCHANGE_COINS_PER_DIAMOND = 75
EXCHANGE_MAX_DIAMONDS = 1000
SHOP_PRICING_MIGRATION = "shopPricing:v18"
SHOP_NPC_REMOVAL_MIGRATION = "shopNpcRemoval:v1"
GOAL_HISTORY_START_META = "goalHistory:featureStartMs:v1"
GOAL_HISTORY_WEEKLY_META = "goalHistory:weeklySuggestion:v1"
GOAL_HISTORY_DEFAULTS_META = "goalHistory:dailyDefaults:v1"
DAILY_GOAL_CHANGE_LIMIT = 2
REVERSE_EXCHANGE_DAILY_LIMIT = 5
METHOD_REWARD_TIERS = {
    "practice": {"name": "落笔试锋", "coins": 20, "diamonds": 0},
    "mastery": {"name": "学以致用", "coins": 40, "diamonds": 1},
}
METHOD_COMPLETION_BONUS = {"name": "融会贯通", "coins": 200, "diamonds": 4}
CITY_LIFE_LIMITS = {"notes": 200, "storedNotes": 1000, "outfits": 8, "storedOutfits": 64}
CITY_NOTE_TYPES = {"note", "question", "quote", "plan"}
TIMED_BONUS_START_META = "questTimedBonus:featureStartMs"
MYSTERY_START_META = "questMystery:featureStartMs"
MYSTERY_DIAMOND_CADENCE_META = "questMystery:diamondCadence15m:v1"
LOTTERY_START_META = "lottery:featureStartMs:v1"
LOTTERY_ROUNDS_META = "lottery:roundTickets:v1"
PLAY_TICKETS_START_META = "arcade:persistentTicketsStartDay:v1"
PLAY_TICKET_EXCHANGE_COSTS = {"coin": 2, "diamond": 4}
RETIRED_NPC_ITEM_IDS = ("npc-default", "npc-scholar", "npc-tea", "npc-copper", "npc-astral", "npc-phoenix")
# These are historical upgrade prices, not purchasable catalog entries. Old
# archives still need the v1.8 difference credited before the final net refund.
RETIRED_NPC_V18_PRICES = {"npc-scholar": {"coins": 180, "diamonds": 0},
                         "npc-astral": {"coins": 0, "diamonds": 12}}
HISTORY_SOURCE = "history_xlsx"
HISTORY_FIELDS = ("name", "minutes", "start_ms", "end_ms", "day")


def quest_clock(now=None):
    current = now or datetime.now().astimezone()
    if not isinstance(current, datetime) or current.tzinfo is None or current.utcoffset() is None:
        raise ValueError("委托时间必须包含时区")
    return current


def quest_window(definition, current):
    midnight = current.replace(hour=0, minute=0, second=0, microsecond=0)
    opens = midnight + timedelta(hours=definition["openHour"])
    deadline = midnight + timedelta(hours=definition["deadlineHour"])
    return opens, deadline, deadline + timedelta(minutes=30)


def finite_number(value, *, minimum=0, maximum=10**16):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("必须使用有效数字")
    if value < minimum or value > maximum or not math.isfinite(value):
        raise ValueError("数字超出允许范围")
    return value


def iso_ms(timestamp_ms):
    return datetime.fromtimestamp(timestamp_ms / 1000).astimezone().isoformat(timespec="seconds")


def now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def parse_day(value):
    if not isinstance(value, str) or len(value) != 10:
        raise ValueError("日期应为 YYYY-MM-DD")
    result = date.fromisoformat(value)
    if result.isoformat() != value:
        raise ValueError("日期应为 YYYY-MM-DD")
    return result


def percent(minutes, target):
    return round(minutes / target * 100, 1) if target else 0


def classify(name, mapping):
    if name in mapping:
        return mapping[name]
    if "数学" in name:
        return "math"
    if any(word in name for word in ("408", "数据结构", "操作系统", "计组", "计算机组成", "计算机网络")):
        return "cs"
    if "政治" in name:
        return "politics"
    if any(word in name for word in ("英语", "单词")):
        return "english"
    return "other"


def classify_activity(name, mapping):
    if name in mapping:
        return mapping[name]
    if name in CONFIRMED_LECTURE_TASKS:
        return "lecture"
    lecture = any(word in name for word in ("听课", "听讲", "网课", "课程", "看课", "看视频"))
    practice = any(word in name for word in ("做题", "刷题", "练题", "练习", "习题", "真题"))
    if lecture == practice:
        return "other"
    return "lecture" if lecture else "practice"


def normalize_record(record):
    """Extract only study fields; never copy credentials/device/account data."""
    if not isinstance(record, dict) or record.get("isComplete") != 1:
        return None
    try:
        minutes = finite_number(record.get("time"), minimum=0, maximum=1440 * 365)
        if minutes <= 0:
            return None
        name = record.get("name")
        if not isinstance(name, str) or not name.strip():
            return None
        source_id = record.get("id")
        if isinstance(source_id, bool) or not isinstance(source_id, (str, int)) or not str(source_id):
            return None
        start_ms = int(finite_number(record.get("startDate"), minimum=1, maximum=32503680000000))
        create_ms = int(finite_number(record.get("createDate"), minimum=1, maximum=32503680000000))
        completed_ms = create_ms
        # TomatoTodo moves a midnight-closing record's createDate to the
        # archive day. Preserve that day; s4 is the actual end in epoch seconds.
        if record.get("i6") and record.get("s4"):
            try:
                actual_end = float(record["s4"])
                finite_number(actual_end, minimum=1, maximum=32503680000)
                completed_ms = int(actual_end * 1000)
            except (ValueError, TypeError, OverflowError):
                pass
        day = datetime.fromtimestamp(create_ms / 1000).astimezone().date().isoformat()
        # Also validate supported platform datetime ranges.
        iso_ms(start_ms)
        iso_ms(completed_ms)
        key = f"{source_id}:{start_ms}"
        return (key, str(source_id), name.strip(), float(minutes), start_ms, completed_ms, day, "tomatodo")
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def calendar_timestamp(value):
    """Calendar bridge timestamps must include a timezone; never guess one."""
    if not isinstance(value, str) or len(value) > 50:
        raise ValueError("日历时间格式无效")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("日历时间缺少时区")
    timestamp = int(parsed.timestamp() * 1000)
    finite_number(timestamp, minimum=1, maximum=32503680000000)
    return timestamp


def normalize_calendar_record(event, calendar_id, allowed_titles, now_ms, range_start, range_end, *, pending=False):
    """Validate named study events; pending items are only used for status."""
    if not isinstance(event, dict):
        return None
    try:
        if (event.get("calendarID") != calendar_id or event.get("isAllDay") is not False
                or event.get("isRecurring") is True):
            return None
        title = event.get("title")
        if not isinstance(title, str) or title not in allowed_titles:
            return None
        item_id = event.get("calendarItemIdentifier")
        if not isinstance(item_id, str) or not item_id or len(item_id) > 2000:
            return None
        start_ms, end_ms = calendar_timestamp(event.get("start")), calendar_timestamp(event.get("end"))
        duration = end_ms - start_ms
        if not 1000 <= duration <= 86_400_000:
            return None
        if pending:
            if not start_ms <= now_ms < end_ms or end_ms > now_ms + 86_400_000:
                return None
        elif end_ms > now_ms:
            return None
        if end_ms <= range_start or (start_ms > range_end if pending else start_ms >= range_end):
            return None
        external_id = event.get("externalIdentifier")
        if external_id is not None and (not isinstance(external_id, str) or len(external_id) > 2000):
            return None
        # iCloud's external UID survives a full EventKit cache refresh, unlike
        # calendarItemIdentifier. Tomato writes independent, nonrecurring events.
        identity = ["external", external_id] if external_id else ["item", item_id]
        source_key = json.dumps([calendar_id] + identity, ensure_ascii=False, separators=(",", ":"))
        key = "calendar:" + hashlib.sha256(source_key.encode("utf-8")).hexdigest()
        day = datetime.fromtimestamp(end_ms / 1000).astimezone().date().isoformat()
        return (key, source_key, title, round(duration / 60_000, 8), start_ms, end_ms, day, "calendar")
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def validate_settings(current, patch):
    if not isinstance(patch, dict) or set(patch) - set(DEFAULT_SETTINGS):
        raise ValueError("设置字段无效")
    result = json.loads(json.dumps(current))
    if "targets" in patch:
        targets = patch["targets"]
        if not isinstance(targets, dict) or set(targets) - SUBJECT_IDS:
            raise ValueError("科目目标字段无效")
        for subject, value in targets.items():
            finite_number(value, minimum=1, maximum=1440)
            if int(value) != value:
                raise ValueError("目标请使用整数分钟")
            result["targets"][subject] = int(value)
        if sum(result["targets"].values()) > 1440:
            raise ValueError("每日目标合计不能超过 24 小时")
    if "weeklyTarget" in patch:
        value = finite_number(patch["weeklyTarget"], minimum=1, maximum=10080)
        if int(value) != value:
            raise ValueError("周目标请使用整数分钟")
        result["weeklyTarget"] = int(value)
    if "mapping" in patch:
        mapping = patch["mapping"]
        if not isinstance(mapping, dict) or len(mapping) > 5000:
            raise ValueError("任务分类字段无效")
        for name, subject in mapping.items():
            if not isinstance(name, str) or not name.strip() or len(name) > 500:
                raise ValueError("任务名称无效")
            if subject is None:
                result["mapping"].pop(name, None)
            elif not isinstance(subject, str) or (subject not in SUBJECT_IDS and subject != "other"):
                raise ValueError("任务分类无效")
            else:
                result["mapping"][name] = subject
        if len(result["mapping"]) > 5000:
            raise ValueError("任务分类数量过多")
    if "activityMapping" in patch:
        mapping = patch["activityMapping"]
        if not isinstance(mapping, dict) or len(mapping) > 5000:
            raise ValueError("学习方式分类字段无效")
        for name, activity in mapping.items():
            if not isinstance(name, str) or not name.strip() or len(name) > 500:
                raise ValueError("任务名称无效")
            if activity is None:
                result["activityMapping"].pop(name, None)
            elif not isinstance(activity, str) or activity not in ACTIVITY_IDS:
                raise ValueError("学习方式分类无效")
            else:
                result["activityMapping"][name] = activity
        if len(result["activityMapping"]) > 5000:
            raise ValueError("学习方式分类数量过多")
    for key in ("motion", "sound"):
        if key in patch:
            if type(patch[key]) is not bool:
                raise ValueError("开关设置必须为 true 或 false")
            result[key] = patch[key]
    return result


def make_advice(day, subjects, minutes, records, now=None):
    now = now or datetime.now().astimezone()
    if day != now.date().isoformat():
        return {"id": "history", "title": "每一段专注，都留下了足迹", "text": "这是历史学习记录。进度按当前目标计算，回看积累，也为下一次出发积蓄力量。", "tone": "neutral"}
    by_id = {subject["id"]: subject for subject in subjects}
    missing = [s["name"] for s in subjects if s["minutes"] == 0]
    if minutes >= sum(s["target"] for s in subjects):
        balance_note = f"{ '、'.join(missing) }可以在下次安排中优先留出时间。" if missing else ""
        return {"id": "complete", "title": "今日远征完成", "text": "总时长目标已达成，今天的投入已经足够。安心收下成果，也给休息留出位置。" + balance_note + "超额学习会被记录，不是新的义务。", "tone": "success"}
    if now.hour >= 22 or now.hour < 7:
        return {"id": "night-rest", "title": "夜深了，先安心休息", "text": "今天的投入都已保存。现在不必追赶进度，先睡个好觉，未完成的安排留到下一次出发。", "tone": "rest"}
    # A recent chain of completed sessions with gaps <= 15 min is a useful
    # gentle rest signal, without interpreting an old morning chain as current.
    ordered = sorted(records, key=lambda r: r["end_ms"], reverse=True)
    if ordered and -60_000 <= now.timestamp() * 1000 - ordered[0]["end_ms"] <= 30 * 60_000:
        chain_minutes = ordered[0]["minutes"]
        earliest = ordered[0]["start_ms"]
        for item in ordered[1:]:
            if earliest - item["end_ms"] > 15 * 60_000:
                break
            chain_minutes += item["minutes"]
            earliest = min(earliest, item["start_ms"])
        if chain_minutes >= 120:
            return {"id": "rest", "title": "连战两小时，先回营补给", "text": "最近已经连续投入了至少两小时。起身走走、喝点水，让下一段专注更轻松。", "tone": "rest"}
    if 11 <= now.hour <= 14 and minutes >= 300:
        return {"id": "early-progress", "title": "今天推进得很棒，记得恢复体力", "text": "这么早就已经专注了至少五小时。安心吃饭、休息，不必把进度变成压力。", "tone": "rest"}
    if missing and by_id["math"]["minutes"] >= by_id["math"]["target"] and by_id["cs"]["minutes"] >= by_id["cs"]["target"]:
        return {"id": "balance", "title": "主力已就位，照顾一下其他科目", "text": f"数学和 408 已完成目标，{ '、'.join(missing) }还没有学习记录。下一轮可以给它们留一点时间。", "tone": "balance"}
    if 11 <= now.hour < 14 and minutes < 60:
        return {"id": "start", "title": "现在开始，依然来得及", "text": "上午的专注还不到一小时。先开一个 25 分钟的小任务，把注意力从分心的事情上收回来。", "tone": "nudge"}
    if missing and minutes >= 180:
        return {"id": "balance-light", "title": "下一站，也可以换一门科目", "text": f"你已经积累了不少专注。{ '、'.join(missing) }还未开始，换换科目也能给大脑一点新鲜感。", "tone": "balance"}
    if minutes == 0:
        return {"id": "ready", "title": "今天的第一段旅程，等你出发", "text": "在番茄 ToDo 完成一个计时任务，学习进度就会自动记录。从一小段专注开始。", "tone": "neutral"}
    return {"id": "steady", "title": "稳稳推进，也留心真正学会了什么", "text": "每一分钟都已记入学习进度。下一小段可以独立做题或闭卷回忆，专注之后也记得休息。", "tone": "neutral"}


def make_activity_advice(day, subject, daily_minutes, daily_target, now, overall_advice=None):
    """Offer a lightweight time-allocation heuristic, not a learning diagnosis."""
    name = subject["name"]
    historical = day != now.date().isoformat()
    period = "这一天" if historical else "今天"
    if historical:
        next_step = "下次学习时，可以安排 25 分钟做题，检验听课内容。"
    elif daily_minutes >= daily_target:
        next_step = "今天的总目标已达成，先安心休息；下次学习时再安排 25 分钟做题。"
    elif now.hour >= 22 or now.hour < 7:
        next_step = "现在先休息，下一天的学习中可安排 25 分钟做题。"
    elif overall_advice and overall_advice["tone"] == "rest":
        next_step = "先休息、恢复精力；之后的学习中再安排 25 分钟做题。"
    else:
        next_step = "下一段可以安排 25 分钟做题，把听到的方法用起来。"
    lecture, practice = subject["lecture"], subject["practice"]
    if lecture >= 60 and practice < lecture * 0.5:
        return {"id": "lecture-heavy", "title": f"{name}听课偏多",
                "text": f"{period}已记录的{name}听课至少 1 小时，做题时长不足听课的一半。{next_step}",
                "tone": "balance"}
    if subject["minutes"] == 0:
        return {"id": "no-records", "title": f"{name}暂无完成记录",
                "text": f"{period}还没有{name}的完成记录。完成任务后，听课与做题时间会自动统计。",
                "tone": "neutral"}
    if lecture + practice == 0:
        return {"id": "unclassified", "title": f"{name}的学习方式等待记录",
                "text": f"{period}暂无可区分的{name}听课或做题记录。可在设置中给含糊任务指定学习方式；复习、背诵等也可以保留为其他。",
                "tone": "neutral"}
    if practice >= 60 and lecture == 0:
        return {"id": "practice-focused", "title": f"{name}做题已有积累",
                "text": f"{period}记录以做题为主。下次复盘时可整理错因、回看不熟悉的知识点，无需为了凑比例增加听课。",
                "tone": "neutral"}
    return {"id": "steady", "title": f"{name}按自己的节奏推进",
            "text": f"{period}的听课与做题时间已记录。下次安排可结合题目掌握情况调整，不必追求固定比例。",
            "tone": "neutral"}


def activity_summary(day, daily, settings, daily_minutes, daily_target, now, overall_advice=None):
    totals = {aid: 0 for aid in ACTIVITY_IDS}
    by_subject = {sid: {"id": sid, "name": name, "minutes": 0,
                        "lecture": 0, "practice": 0, "other": 0}
                  for sid, name, _ in SUBJECTS}
    for record in daily:
        sid = classify(record["name"], settings["mapping"])
        activity = classify_activity(record["name"], settings["activityMapping"])
        totals[activity] += record["minutes"]
        if sid not in by_subject:
            by_subject[sid] = {"id": "other", "name": "待分类科目", "minutes": 0,
                               "lecture": 0, "practice": 0, "other": 0}
        by_subject[sid][activity] += record["minutes"]
        by_subject[sid]["minutes"] += record["minutes"]
    subjects = list(by_subject.values())
    for subject in subjects:
        for key in ("minutes", "lecture", "practice", "other"):
            subject[key] = round(subject[key], 4)
        identified = subject["lecture"] + subject["practice"]
        subject["practiceShare"] = percent(subject["practice"], identified) if identified else None
        subject["advice"] = make_activity_advice(day, subject, daily_minutes, daily_target, now, overall_advice)
    heavy = [subject for subject in subjects if subject["advice"]["id"] == "lecture-heavy"]
    if heavy:
        # Surface the largest lecture/practice gap; each subject retains its own advice.
        advice = dict(max(heavy, key=lambda item: item["lecture"] - item["practice"])["advice"])
    elif daily_minutes == 0:
        advice = {"id": "no-records", "title": "所选日期暂无完成记录",
                  "text": "完成任务后，听课与做题时间会自动统计。",
                  "tone": "neutral"}
    elif totals["lecture"] + totals["practice"] == 0:
        advice = {"id": "unclassified", "title": "给学习方式补上标签",
                  "text": "暂无可区分的听课或做题记录。可在设置中给含糊任务指定学习方式，复习、背诵等也可以保留为其他。",
                  "tone": "neutral"}
    else:
        advice = {"id": "steady", "title": "学习方式已记录，按掌握情况调整",
                  "text": "听课帮助理解，做题帮助检验。下次安排可结合各科掌握情况和错题反馈调整，不必追求固定比例。",
                  "tone": "neutral"}
    advice["text"] += " 建议仅依据已记录时长，不评判学习效果。"
    return {"totals": {key: round(value, 4) for key, value in totals.items()},
            "subjects": subjects, "advice": advice}


class FocusStore:
    def __init__(self, data_dir=DEFAULT_DATA, source=DEFAULT_SOURCE, *, quest_lower_bound="accepted"):
        if quest_lower_bound not in ("accepted", "opens"):
            raise ValueError("委托计时下界无效")
        self.quest_lower_bound = quest_lower_bound
        self.data_dir = Path(data_dir).expanduser()
        self.source = Path(source).expanduser()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(str(self.data_dir / "focus-quest.sqlite3"), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS records (
                id TEXT PRIMARY KEY, source_id TEXT NOT NULL, name TEXT NOT NULL,
                minutes REAL NOT NULL, start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL,
                day TEXT NOT NULL, source TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS records_day ON records(day);
            CREATE TABLE IF NOT EXISTS record_aliases (
                source TEXT NOT NULL, source_key TEXT NOT NULL, record_id TEXT NOT NULL,
                PRIMARY KEY (source, source_key)
            );
            CREATE INDEX IF NOT EXISTS record_aliases_record ON record_aliases(record_id);
            CREATE TABLE IF NOT EXISTS source_presence (
                source TEXT NOT NULL, source_key TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
                missing_count INTEGER NOT NULL DEFAULT 0, last_snapshot TEXT,
                PRIMARY KEY (source, source_key)
            );
            CREATE TABLE IF NOT EXISTS record_lifecycle (
                record_id TEXT PRIMARY KEY, deleted_at TEXT, reason TEXT, manual_action TEXT
            );
            CREATE TABLE IF NOT EXISTS record_merges (
                removed_id TEXT PRIMARY KEY, canonical_id TEXT NOT NULL,
                merged_at TEXT NOT NULL, original_records TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS records_match ON records(source,name,start_ms);
            CREATE TABLE IF NOT EXISTS daily_openings (
                day TEXT PRIMARY KEY, shown_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS quest_acceptances (
                day TEXT NOT NULL, subject TEXT NOT NULL, accepted_ms INTEGER NOT NULL,
                lower_ms INTEGER NOT NULL, lower_bound TEXT NOT NULL,
                PRIMARY KEY(day,subject)
            );
            CREATE TABLE IF NOT EXISTS quest_receipts (
                day TEXT NOT NULL, subject TEXT NOT NULL, name TEXT NOT NULL,
                minutes REAL NOT NULL, coins INTEGER NOT NULL, diamonds INTEGER NOT NULL,
                submitted_ms INTEGER NOT NULL, PRIMARY KEY(day,subject)
            );
            CREATE TABLE IF NOT EXISTS quest_allocations (
                day TEXT NOT NULL, subject TEXT NOT NULL, record_id TEXT NOT NULL,
                start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, minutes REAL NOT NULL,
                PRIMARY KEY(day,subject,record_id,start_ms,end_ms)
            );
            CREATE TABLE IF NOT EXISTS quest_tracks (
                subject TEXT PRIMARY KEY, accepted_ms INTEGER NOT NULL,
                continuous_ms INTEGER NOT NULL, settled_minutes REAL NOT NULL DEFAULT 0,
                paid_coins INTEGER NOT NULL DEFAULT 0, paid_diamonds INTEGER NOT NULL DEFAULT 0,
                coin_offset INTEGER NOT NULL DEFAULT 0, diamond_offset INTEGER NOT NULL DEFAULT 0,
                first_completed INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS quest_legacy_windows (
                subject TEXT NOT NULL, start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL,
                PRIMARY KEY(subject,start_ms,end_ms)
            );
            CREATE TABLE IF NOT EXISTS quest_deliveries (
                request_id TEXT PRIMARY KEY, subject TEXT NOT NULL, name TEXT NOT NULL,
                minutes REAL NOT NULL, coins INTEGER NOT NULL, diamonds INTEGER NOT NULL,
                submitted_ms INTEGER NOT NULL, total_minutes REAL NOT NULL,
                allocations TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS quest_delivery_subject ON quest_deliveries(subject,submitted_ms);
            CREATE TABLE IF NOT EXISTS quest_bonus_receipts (
                day TEXT NOT NULL, subject TEXT NOT NULL, request_id TEXT NOT NULL,
                minutes REAL NOT NULL, coins INTEGER NOT NULL, diamonds INTEGER NOT NULL,
                submitted_ms INTEGER NOT NULL, allocations TEXT NOT NULL,
                PRIMARY KEY(day,subject)
            );
            CREATE INDEX IF NOT EXISTS quest_bonus_request ON quest_bonus_receipts(request_id);
            CREATE INDEX IF NOT EXISTS quest_bonus_subject ON quest_bonus_receipts(subject,day);
            CREATE INDEX IF NOT EXISTS quest_allocation_end ON quest_allocations(end_ms,start_ms);
            CREATE TABLE IF NOT EXISTS mystery_goal_epochs (
                effective_ms INTEGER PRIMARY KEY, settings TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS mystery_deliveries (
                request_id TEXT PRIMARY KEY, submitted_ms INTEGER NOT NULL, receipt TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS mystery_allocations (
                request_id TEXT NOT NULL, day TEXT NOT NULL, subject TEXT NOT NULL,
                record_id TEXT NOT NULL, start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL,
                minutes REAL NOT NULL,
                PRIMARY KEY(request_id,record_id,start_ms,end_ms)
            );
            CREATE INDEX IF NOT EXISTS mystery_allocation_time ON mystery_allocations(end_ms,start_ms);
            CREATE TABLE IF NOT EXISTS mystery_tracks (
                subject TEXT PRIMARY KEY, settled_minutes REAL NOT NULL DEFAULT 0,
                paid_coins INTEGER NOT NULL DEFAULT 0, paid_diamonds INTEGER NOT NULL DEFAULT 0,
                diamond_offset INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS mystery_gifts (
                day TEXT NOT NULL, gift_index INTEGER NOT NULL, request_id TEXT NOT NULL,
                coins INTEGER NOT NULL, diamonds INTEGER NOT NULL,
                PRIMARY KEY(day,gift_index)
            );
            CREATE TABLE IF NOT EXISTS wallet_ledger (
                reference TEXT PRIMARY KEY, coins INTEGER NOT NULL, diamonds INTEGER NOT NULL,
                created_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS island_reward_claims (
                day TEXT NOT NULL, island TEXT NOT NULL,
                coins INTEGER NOT NULL, diamonds INTEGER NOT NULL, claimed_ms INTEGER NOT NULL,
                PRIMARY KEY(day,island),
                CHECK(island IN ('math','cs','politics','english','main'))
            );
            CREATE TABLE IF NOT EXISTS method_reward_claims (
                day TEXT NOT NULL, subject TEXT NOT NULL, tier TEXT NOT NULL,
                coins INTEGER NOT NULL, diamonds INTEGER NOT NULL, claimed_ms INTEGER NOT NULL,
                PRIMARY KEY(day,subject,tier),
                CHECK(subject IN ('math','cs','politics','english')),
                CHECK(tier IN ('practice','mastery'))
            );
            CREATE TABLE IF NOT EXISTS method_completion_claims (
                day TEXT PRIMARY KEY, coins INTEGER NOT NULL, diamonds INTEGER NOT NULL,
                claimed_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS shop_purchases (
                item_id TEXT PRIMARY KEY, purchased_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS lottery_ticket_ledger (
                reference TEXT PRIMARY KEY, machine TEXT NOT NULL, amount INTEGER NOT NULL,
                created_ms INTEGER NOT NULL, source TEXT NOT NULL, label TEXT NOT NULL,
                CHECK(machine IN ('coin','diamond'))
            );
            CREATE TABLE IF NOT EXISTS lottery_requests (
                request_id TEXT PRIMARY KEY, kind TEXT NOT NULL, machine TEXT NOT NULL,
                day TEXT NOT NULL, created_ms INTEGER NOT NULL, result TEXT NOT NULL,
                CHECK(kind IN ('buy','draw','starGift')), CHECK(machine IN ('coin','diamond'))
            );
            CREATE INDEX IF NOT EXISTS lottery_request_day ON lottery_requests(kind,machine,day);
            CREATE TABLE IF NOT EXISTS lottery_play_ticket_exchanges (
                request_id TEXT PRIMARY KEY, machine TEXT NOT NULL CHECK(machine IN ('coin','diamond')),
                day TEXT NOT NULL, created_ms INTEGER NOT NULL, result TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS lottery_pity (
                machine TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0,
                CHECK(machine IN ('coin','diamond')), CHECK(count>=0)
            );
            CREATE TABLE IF NOT EXISTS shop_equipment (
                slot TEXT PRIMARY KEY, item_id TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS shop_exchanges (
                request_id TEXT PRIMARY KEY, diamonds INTEGER NOT NULL,
                coins INTEGER NOT NULL, created_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS history_rows (
                source_key TEXT PRIMARY KEY, name TEXT NOT NULL, minutes REAL NOT NULL,
                start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, day TEXT NOT NULL,
                last_batch TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS history_links (
                source_key TEXT NOT NULL, record_id TEXT NOT NULL,
                PRIMARY KEY(source_key,record_id)
            );
            CREATE INDEX IF NOT EXISTS history_links_record ON history_links(record_id);
            CREATE TABLE IF NOT EXISTS history_overrides (
                record_id TEXT PRIMARY KEY, name TEXT NOT NULL, minutes REAL NOT NULL,
                start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, day TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS history_batches (
                batch_id TEXT PRIMARY KEY, filename TEXT NOT NULL, input_hash TEXT NOT NULL,
                imported_at TEXT NOT NULL, prefer_history INTEGER NOT NULL, receipt TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS study_actions (
                id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL,
                card_id TEXT NOT NULL, snapshot TEXT NOT NULL,
                checked TEXT NOT NULL DEFAULT '[false,false,false]', note TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL CHECK(status IN ('active','completed','parked')),
                version INTEGER NOT NULL DEFAULT 1, started_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, completed_at TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS study_actions_one_active
                ON study_actions(status) WHERE status='active';
            CREATE TABLE IF NOT EXISTS arcade_sessions (
                id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL,
                day TEXT NOT NULL, venue TEXT NOT NULL, game_type TEXT NOT NULL,
                seed TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
                started_at TEXT NOT NULL, expires_at TEXT NOT NULL,
                ended_at TEXT, status TEXT NOT NULL, game_state TEXT NOT NULL,
                steps INTEGER NOT NULL DEFAULT 0, max_steps INTEGER NOT NULL,
                result TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS arcade_one_active
                ON arcade_sessions(status) WHERE status='active';
            CREATE INDEX IF NOT EXISTS arcade_day ON arcade_sessions(day);
            CREATE TABLE IF NOT EXISTS arcade_ticket_purchases (
                request_id TEXT PRIMARY KEY, day TEXT NOT NULL,
                coins INTEGER NOT NULL, created_ms INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS arcade_ticket_purchase_day ON arcade_ticket_purchases(day);
            CREATE TABLE IF NOT EXISTS arcade_play_ticket_ledger (
                reference TEXT PRIMARY KEY, amount INTEGER NOT NULL CHECK(amount!=0),
                created_ms INTEGER NOT NULL, source TEXT NOT NULL, label TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS arcade_ticket_earnings (
                day TEXT PRIMARY KEY, issued INTEGER NOT NULL CHECK(issued>=0),
                legacy_minutes REAL NOT NULL DEFAULT 0 CHECK(legacy_minutes>=0)
            );
            CREATE TABLE IF NOT EXISTS arcade_ticket_record_credits (
                record_id TEXT PRIMARY KEY, day TEXT NOT NULL,
                minutes REAL NOT NULL CHECK(minutes>=0),
                credited_minutes REAL NOT NULL CHECK(credited_minutes>=0)
            );
            CREATE INDEX IF NOT EXISTS arcade_ticket_credit_day ON arcade_ticket_record_credits(day);
            CREATE TABLE IF NOT EXISTS arcade_ticket_merge_credits (
                removed_id TEXT PRIMARY KEY, canonical_id TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS arcade_moves (
                session_id TEXT NOT NULL, version INTEGER NOT NULL,
                move TEXT NOT NULL, PRIMARY KEY(session_id,version)
            );
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS goal_days (
                day TEXT PRIMARY KEY, targets TEXT NOT NULL, changes INTEGER NOT NULL DEFAULT 0,
                created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS goal_weeks (
                week_start TEXT PRIMARY KEY, target INTEGER NOT NULL, confirmed_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS goal_requests (
                request_id TEXT PRIMARY KEY, kind TEXT NOT NULL, period TEXT NOT NULL,
                payload TEXT NOT NULL, created_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS shop_reverse_exchanges (
                request_id TEXT PRIMARY KEY, day TEXT NOT NULL, created_ms INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS reverse_exchange_day ON shop_reverse_exchanges(day);
            CREATE TABLE IF NOT EXISTS city_notes (
                id TEXT PRIMARY KEY, type TEXT NOT NULL, text TEXT NOT NULL, day TEXT,
                done INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
                created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL,
                CHECK(type IN ('note','question','quote','plan')),
                CHECK(done IN (0,1)), CHECK(archived IN (0,1))
            );
            CREATE TABLE IF NOT EXISTS city_outfits (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, equipped TEXT NOT NULL,
                archived INTEGER NOT NULL DEFAULT 0,
                created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL,
                CHECK(archived IN (0,1))
            );
            CREATE TABLE IF NOT EXISTS city_life_requests (
                request_id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL,
                item_id TEXT NOT NULL, created_ms INTEGER NOT NULL
            );
        """)
        # Upgrade old archives without changing record IDs or dropping history.
        with self.db:
            for item in SHOP_ITEMS.values():
                if not item["coins"] and not item["diamonds"]:
                    self.db.execute("INSERT OR IGNORE INTO shop_equipment VALUES (?,?)", (item["slot"], item["id"]))
            for row in self.db.execute("SELECT * FROM records").fetchall():
                # A confirmed history correction may change canonical times.
                # Existing source aliases still identify the original session.
                if self.db.execute("SELECT 1 FROM record_aliases WHERE source=? AND record_id=?",
                                   (row["source"], row["id"])).fetchone():
                    continue
                key = row["source_id"] if row["source"] == "calendar" else f'{row["source_id"]}:{row["start_ms"]}'
                self.db.execute("INSERT OR IGNORE INTO record_aliases VALUES (?,?,?)", (row["source"], key, row["id"]))
            self.db.execute("""INSERT OR IGNORE INTO source_presence(source,source_key)
                               SELECT source,source_key FROM record_aliases""")
        self._migrate_shop_v18()
        self._migrate_remove_npc_outfits()
        self._migrate_continuous_quests()
        self._initialize_timed_bonus()
        self.settings = json.loads(json.dumps(DEFAULT_SETTINGS))
        stored = self._meta("settings")
        if stored:
            self.settings = validate_settings(self.settings, json.loads(stored))
            # Materialize defaults once when opening an archive from version 1.
            if self.settings != json.loads(stored):
                with self.db:
                    self._set_meta("settings", json.dumps(self.settings, ensure_ascii=False, allow_nan=False))
        self._initialize_mystery()
        self._migrate_mystery_diamond_cadence()
        self._initialize_lottery()
        self.revision = int(self._meta("revision") or 0)
        self._initialize_goals()
        self._ensure_goal_days(quest_clock())
        # Repair duplicates saved by older versions even when either source is
        # currently unavailable. Original rows remain in the merge journal.
        with self.db:
            if self._reconcile_sources() + self._reconcile_history_sources():
                self._bump_revision()
        self.sync = {"connected": False, "sourcePath": str(self.source), "lastCheck": None,
                     "lastImport": self._meta("lastImport"), "error": None,
                     "importedCount": self._active_count(),
                     "pollSeconds": POLL_SECONDS}
        self.calendar_config = self.data_dir / "calendar-bridge-config.json"
        self.calendar_snapshot = self.data_dir / "calendar-bridge-snapshot.json"
        self.calendar_refresh_request = self.data_dir / "calendar-bridge-refresh.json"
        self.source_task_names = set()
        self.calendar_sync = {"enabled": False, "connected": False, "calendarName": None,
                              "lastCheck": None, "lastImport": self._meta("calendarLastImport"),
                              "snapshotAt": None, "error": None, "importedCount": 0,
                              "ignoredCount": 0, "pollSeconds": 30,
                              "pendingCount": 0, "pendingRecords": []}

    @contextmanager
    def _quest_transaction(self):
        """Serialize the check and write across threads AND SQLite connections."""
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                yield
                self.db.commit()
            except BaseException:
                self.db.rollback()
                self._play_ticket_sync_cache = None
                raise

    def _wallet(self):
        row = self.db.execute("SELECT COALESCE(SUM(coins),0),COALESCE(SUM(diamonds),0) FROM wallet_ledger").fetchone()
        return {"coins": row[0], "diamonds": row[1]}

    def _initialize_lottery(self, now=None):
        # A feature epoch is installation time, not midnight: opening an old
        # archive never mints tickets for previously opened gifts or bonuses.
        with self.lock, self.db:
            if self._meta(LOTTERY_START_META) is None:
                self._set_meta(LOTTERY_START_META, int(quest_clock(now).timestamp()*1000))
            if self._meta(LOTTERY_ROUNDS_META) is None:
                self._set_meta(LOTTERY_ROUNDS_META, json.dumps({
                    "featureStartMs": int(quest_clock(now).timestamp()*1000), "totalRounds": 0,
                    "subjects": {sid: 0 for sid, _, _ in SUBJECTS}}, sort_keys=True))

    def _grant_lottery_ticket(self, reference, machine, source, label, current, count=1):
        created_ms = int(current.timestamp()*1000)
        if created_ms < int(self._meta(LOTTERY_START_META)):
            return None
        if type(count) is not int or count <= 0:
            raise ValueError("抽奖券奖励必须为正整数")
        cursor = self.db.execute("INSERT OR IGNORE INTO lottery_ticket_ledger VALUES (?,?,?,?,?,?)",
                                 (reference, machine, count, created_ms, source, label))
        return {"machine": machine, "count": count, "source": source, "label": label} if cursor.rowcount else None

    def _round_ticket_state(self):
        progress = json.loads(self._meta(LOTTERY_ROUNDS_META))
        total = progress["totalRounds"]
        settled = {row[0]: row[1] for row in self.db.execute("SELECT subject,settled_minutes FROM quest_tracks")}
        subjects = []
        for sid, name, _ in SUBJECTS:
            target = self._quest_definition(sid)["target"]
            minutes = settled.get(sid, 0)
            carry = max(0, minutes-math.floor(minutes/target+1e-10)*target)
            subjects.append({"id": sid, "name": name, "target": target,
                "completedRounds": progress["subjects"].get(sid, 0), "carryMinutes": round(carry, 4),
                "minutesToNextRound": round(target-carry, 4)})
        return {"featureStartMs": progress["featureStartMs"], "totalRounds": total,
                "diamondTickets": total//3, "roundsTowardNextDiamond": total%3,
                "roundsToNextDiamond": 3-total%3, "subjects": subjects}

    def _round_lottery_tickets(self, definition, old_minutes, new_minutes, request_id, current):
        # The delivery and its base-time allocation already own these minutes.
        # Count only newly completed ordinary rounds, preserving fractional
        # carry while never minting tickets for pre-upgrade completed rounds.
        progress = json.loads(self._meta(LOTTERY_ROUNDS_META))
        if int(current.timestamp()*1000) < progress["featureStartMs"] or new_minutes <= old_minutes:
            return []
        target = definition["target"]
        rounds = math.floor(new_minutes/target+1e-10)-math.floor(old_minutes/target+1e-10)
        if rounds <= 0:
            return []
        previous_total = progress["totalRounds"]
        progress["totalRounds"] += rounds
        progress["subjects"][definition["subject"]] += rounds
        diamonds = progress["totalRounds"]//3-previous_total//3
        grants = []
        for machine, count, source, label in (
            ("coin", rounds, "quest-round", f"{definition['name']} · 完整委托 {rounds} 轮"),
            ("diamond", diamonds, "quest-round-three", "普通委托累计三轮")):
            if count:
                grant = self._grant_lottery_ticket(f"round:{request_id}:{machine}", machine, source, label, current, count)
                if grant is None:
                    raise ValueError("这轮委托的抽奖券已经发放，请重试原交付请求")
                grants.append(grant)
        self._set_meta(LOTTERY_ROUNDS_META, json.dumps(progress, sort_keys=True))
        return grants

    def _round_ticket_receipt(self, request_id):
        rewards = {machine: 0 for machine in ("coin", "diamond")}
        if request_id:
            for machine in rewards:
                row = self.db.execute("SELECT amount FROM lottery_ticket_ledger WHERE reference=?",
                                      (f"round:{request_id}:{machine}",)).fetchone()
                rewards[machine] = row[0] if row else 0
        return {"rounds": rewards["coin"], "coinTickets": rewards["coin"], "diamondTickets": rewards["diamond"]}

    def _round_ticket_preview(self, definition, old_minutes, new_minutes, current):
        progress = json.loads(self._meta(LOTTERY_ROUNDS_META))
        target = definition["target"]
        rounds = max(0, math.floor(new_minutes/target+1e-10)-math.floor(old_minutes/target+1e-10))
        if int(current.timestamp()*1000) < progress["featureStartMs"]:
            rounds = 0
        total = progress["totalRounds"]
        return {"rounds": rounds, "coinTickets": rounds, "diamondTickets": (total+rounds)//3-total//3}

    def _timed_lottery_tickets(self, day, current):
        # Period completion is based on claimed first-round bonuses. All
        # constituents must have been claimed since this feature was installed;
        # the final receipt cannot turn a pre-upgrade archive into free tickets.
        epoch = int(self._meta(LOTTERY_START_META))
        completed = {row[0] for row in self.db.execute(
            "SELECT subject FROM quest_bonus_receipts WHERE day=? AND submitted_ms>=?", (day, epoch))}
        grants = []
        for subjects, machine, key, label in (
            ({"math", "politics"}, "coin", "morning", "上午双科首轮加赠"),
            ({"cs", "english"}, "coin", "afternoon", "下午双科首轮加赠"),
            (SUBJECT_IDS, "diamond", "all", "四科首轮加赠")):
            if subjects <= completed:
                grant = self._grant_lottery_ticket(f"timed:{day}:{key}", machine, f"timed-{key}", label, current)
                if grant:
                    grants.append(grant)
        return grants

    @staticmethod
    def _lottery_machine(machine):
        if not isinstance(machine, str) or machine not in lottery_rules.PRICES:
            raise ValueError("请选择金币或钻石抽奖机")
        return machine

    def _lottery_pools(self):
        owned = {row[0] for row in self.db.execute("SELECT item_id FROM shop_purchases")}
        pools = {"coinItem": [], "diamondItem": [], "coinLimited": [], "diamondLimited": []}
        for item in SHOP_ITEMS.values():
            if item["id"] in owned:
                continue
            if item.get("lotteryOnly", False):
                machine = item.get("lotteryMachine")
                if machine in lottery_rules.PRICES:
                    pools[machine+"Limited"].append(item)
                continue
            if item["diamonds"] > 0:
                pools["diamondItem"].append(item)
            elif item["coins"] > 0:
                pools["coinItem"].append(item)
        return pools

    def lottery_state(self, now=None):
        with self.lock:
            current = quest_clock(now)
            day = current.date().isoformat()
            play_tickets = self._sync_play_tickets(current)
            tickets = {machine: 0 for machine in lottery_rules.PRICES}
            for row in self.db.execute("SELECT machine,SUM(amount) FROM lottery_ticket_ledger GROUP BY machine"):
                tickets[row[0]] = row[1]
            purchased = {row[0]: row[1] for row in self.db.execute(
                "SELECT machine,COUNT(*) FROM lottery_requests WHERE kind='buy' AND day=? GROUP BY machine", (day,))}
            wallet, pools = self._wallet(), self._lottery_pools()
            owned = {row[0] for row in self.db.execute("SELECT item_id FROM shop_purchases")}
            machines = []
            for machine, name, ticket_name in (("coin", "金币抽奖机", "金币抽奖券"), ("diamond", "钻石抽奖机", "钻石抽奖券")):
                price = lottery_rules.PRICES[machine]
                used = purchased.get(machine, 0)
                remaining = max(0, lottery_rules.PURCHASE_LIMIT-used)
                pity_row = self.db.execute("SELECT count FROM lottery_pity WHERE machine=?", (machine,)).fetchone()
                pity_count = pity_row[0] if pity_row else 0
                limited_total = sum(item.get("lotteryOnly", False) and item.get("lotteryMachine") == machine for item in SHOP_ITEMS.values())
                machines.append({"id": machine, "name": name, "ticketName": ticket_name,
                    "price": dict(price), "purchasesToday": used, "purchaseLimit": lottery_rules.PURCHASE_LIMIT,
                    "purchasesRemaining": remaining,
                    "canBuy": remaining > 0 and all(wallet[key] >= amount for key, amount in price.items()),
                    "canDraw": tickets[machine] > 0, "odds": lottery_rules.odds_for(machine),
                    "exchange": {"cost": PLAY_TICKET_EXCHANGE_COSTS[machine],
                                 "canExchange": play_tickets >= PLAY_TICKET_EXCHANGE_COSTS[machine]},
                    "pool": {"coinItems": len(pools["coinItem"]) if machine == "coin" else 0,
                             "diamondItems": len(pools["diamondItem"]), "exclusiveItems": 0,
                             "lotteryOnlyItems": len(pools[machine+"Limited"]), "lotteryOnlyTotal": limited_total},
                    "pity": {"count": pity_count, "limit": lottery_rules.PITY_LIMITS[machine],
                             "remaining": max(1, lottery_rules.PITY_LIMITS[machine]-pity_count),
                             "allCollected": limited_total > 0 and not pools[machine+"Limited"]},
                    "collection": [dict(item, owned=item["id"] in owned) for item in SHOP_ITEMS.values()
                                   if item.get("lotteryOnly", False) and item.get("lotteryMachine") == machine],
                    "currencyExpected": lottery_rules.currency_expectation(machine),
                    "fullPoolCurrencyExpected": lottery_rules.currency_expectation(machine, exhausted=True)})
            history = [{"requestId": row["request_id"], "machine": row["machine"],
                        "drawnAt": iso_ms(row["created_ms"]), "result": json.loads(row["result"])}
                       for row in self.db.execute("SELECT * FROM lottery_requests WHERE kind='draw' ORDER BY created_ms DESC,rowid DESC LIMIT 20")]
            grants = [{"machine": row["machine"], "count": row["amount"], "source": row["source"],
                       "label": row["label"], "grantedAt": iso_ms(row["created_ms"])}
                      for row in self.db.execute("SELECT * FROM lottery_ticket_ledger WHERE amount>0 ORDER BY created_ms DESC,rowid DESC LIMIT 20")]
            star_gifts = [{"day": row["day"], "index": row["gift_index"],
                           "machine": "coin" if row["gift_index"] <= 2 else "diamond",
                           "claimed": row["claimed"] is not None}
                          for row in self.db.execute("""SELECT g.day,g.gift_index,t.reference AS claimed FROM mystery_gifts g
                              JOIN mystery_deliveries d ON d.request_id=g.request_id
                              LEFT JOIN lottery_ticket_ledger t ON t.reference='mystery:'||g.day||':'||g.gift_index
                              WHERE g.gift_index BETWEEN 1 AND 4 AND d.submitted_ms>=?
                              ORDER BY g.day DESC,g.gift_index""", (int(self._meta(LOTTERY_START_META)),))]
            return {"day": day, "now": current.isoformat(), "revision": int(self._meta("revision") or 0),
                    "featureStartMs": int(self._meta(LOTTERY_START_META)), "tickets": tickets, "wallet": wallet,
                    "playTickets": {"available": play_tickets, "persistent": True},
                    "machines": machines, "history": history, "grants": grants, "starGifts": star_gifts,
                    "roundTickets": self._round_ticket_state(),
                    "persistentTickets": True, "onlyUnownedItems": True, "shopExclusiveItemsExcluded": False}

    def _lottery_request(self, machine, request_id, kind, now=None):
        machine = self._lottery_machine(machine)
        request_id = self._action_uuid(request_id)
        with self._quest_transaction():
            current = quest_clock(now)
            previous = self.db.execute("SELECT * FROM lottery_requests WHERE request_id=?", (request_id,)).fetchone()
            if previous is None:
                exchange = self.db.execute("SELECT * FROM lottery_play_ticket_exchanges WHERE request_id=?", (request_id,)).fetchone()
                previous = dict(exchange, kind="exchange") if exchange else None
            if previous is not None:
                if previous["kind"] != kind or previous["machine"] != machine:
                    raise ValueError("同一个抽奖请求标识不能更改机器或操作")
                result = json.loads(previous["result"])
            else:
                stamp, day = int(current.timestamp()*1000), current.date().isoformat()
                if kind == "buy":
                    count = self.db.execute("SELECT COUNT(*) FROM lottery_requests WHERE kind='buy' AND machine=? AND day=?",
                                            (machine, day)).fetchone()[0]
                    if count >= lottery_rules.PURCHASE_LIMIT:
                        raise ValueError(f"这台机器今天已购买 {lottery_rules.PURCHASE_LIMIT} 张抽奖券，明天再来看看吧")
                    price, wallet = lottery_rules.PRICES[machine], self._wallet()
                    if any(wallet[key] < amount for key, amount in price.items()):
                        raise ValueError("金币或钻石不足，先收下学习奖励再来吧")
                    result = {"type": "ticket", "machine": machine, "amount": 1, "price": dict(price)}
                    self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                                    (f"lottery-buy:{request_id}", -price["coins"], -price["diamonds"], stamp))
                    self.db.execute("INSERT INTO lottery_ticket_ledger VALUES (?,?,1,?,?,?)",
                                    (f"lottery-buy:{request_id}", machine, stamp, "purchase", "购买抽奖券"))
                elif kind == "exchange":
                    cost = PLAY_TICKET_EXCHANGE_COSTS[machine]
                    if self._sync_play_tickets(current) < cost:
                        raise ValueError(f"游玩券不足，需要 {cost} 张游玩券兑换一张对应抽奖券")
                    result = {"type": "ticket", "machine": machine, "amount": 1,
                              "source": "playTicketExchange", "playTicketsSpent": cost}
                    self.db.execute("INSERT INTO arcade_play_ticket_ledger VALUES (?,?,?,?,?)",
                                    (f"lottery-exchange:{request_id}", -cost, stamp, "exchange", "兑换抽奖券"))
                    self.db.execute("INSERT INTO lottery_ticket_ledger VALUES (?,?,1,?,?,?)",
                                    (f"lottery-exchange:{request_id}", machine, stamp, "play-ticket-exchange", "游玩券兑换"))
                else:
                    balance = self.db.execute("SELECT COALESCE(SUM(amount),0) FROM lottery_ticket_ledger WHERE machine=?", (machine,)).fetchone()[0]
                    if balance < 1:
                        raise ValueError("需要一张对应的抽奖券才能启动这台机器")
                    pity_row = self.db.execute("SELECT count FROM lottery_pity WHERE machine=?", (machine,)).fetchone()
                    pity_count = pity_row[0] if pity_row else 0
                    result = lottery_rules.draw(machine, self._lottery_pools(),
                                                force_limited=pity_count+1 >= lottery_rules.PITY_LIMITS[machine])
                    self.db.execute("INSERT INTO lottery_pity VALUES (?,?) ON CONFLICT(machine) DO UPDATE SET count=excluded.count",
                                    (machine, 0 if result["limited"] else pity_count+1))
                    self.db.execute("INSERT INTO lottery_ticket_ledger VALUES (?,?,-1,?,?,?)",
                                    (f"lottery-draw:{request_id}", machine, stamp, "draw", "使用抽奖券"))
                    if result["type"] == "item":
                        self.db.execute("INSERT INTO shop_purchases VALUES (?,?)", (result["item"]["id"], stamp))
                    else:
                        self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                                        (f"lottery-draw:{request_id}", result["coins"], result["diamonds"], stamp))
                if kind == "exchange":
                    self.db.execute("INSERT INTO lottery_play_ticket_exchanges VALUES (?,?,?,?,?)",
                        (request_id, machine, day, stamp, json.dumps(result, ensure_ascii=False, allow_nan=False)))
                else:
                    self.db.execute("INSERT INTO lottery_requests VALUES (?,?,?,?,?,?)",
                        (request_id, kind, machine, day, stamp, json.dumps(result, ensure_ascii=False, allow_nan=False)))
                self._bump_revision()
            if kind == "exchange":
                self._arcade_expire(current)
            return {"lottery": self.lottery_state(current), "quests": self.quest_state(current),
                    **({"arcade": self._arcade_snapshot(current)} if kind == "exchange" else {}),
                    "result": result, "alreadyProcessed": previous is not None, "now": current.isoformat()}

    def buy_lottery_ticket(self, machine, request_id, now=None):
        return self._lottery_request(machine, request_id, "buy", now)

    def draw_lottery(self, machine, request_id, now=None):
        return self._lottery_request(machine, request_id, "draw", now)

    def exchange_play_tickets(self, machine, request_id, now=None):
        return self._lottery_request(machine, request_id, "exchange", now)

    def open_lottery_star_gift(self, day, index, request_id, now=None):
        parse_day(day)
        if type(index) is not int or index not in (1, 2, 3, 4):
            raise ValueError("请选择拾星处第 1 至第 4 份星礼")
        request_id = self._action_uuid(request_id)
        machine = "coin" if index <= 2 else "diamond"
        with self._quest_transaction():
            current = quest_clock(now)
            if self.db.execute("SELECT 1 FROM lottery_play_ticket_exchanges WHERE request_id=?", (request_id,)).fetchone():
                raise ValueError("同一个抽奖请求标识不能更改机器或操作")
            previous = self.db.execute("SELECT * FROM lottery_requests WHERE request_id=?", (request_id,)).fetchone()
            result = {"type": "starGift", "machine": machine, "day": day, "index": index}
            ticket_grants, already_claimed = [], False
            if previous:
                if previous["kind"] != "starGift" or json.loads(previous["result"]) != result:
                    raise ValueError("同一个星礼请求标识不能更改礼物或操作")
            else:
                eligible = self.db.execute("""SELECT 1 FROM mystery_gifts g JOIN mystery_deliveries d ON d.request_id=g.request_id
                    WHERE g.day=? AND g.gift_index=? AND d.submitted_ms>=?""",
                    (day, index, int(self._meta(LOTTERY_START_META)))).fetchone()
                if eligible is None:
                    raise ValueError("这份星礼尚未获得；请先向拾星交付达标后新增的专注")
                reference = f"mystery:{day}:{index}"
                already_claimed = self.db.execute("SELECT 1 FROM lottery_ticket_ledger WHERE reference=?", (reference,)).fetchone() is not None
                if not already_claimed:
                    grant = self._grant_lottery_ticket(reference, machine, "mystery-gift", f"拾星 · 第 {index} 份星礼", current)
                    if grant is None:
                        raise ValueError("系统时间早于抽奖功能开启时间，请检查电脑日期")
                    ticket_grants.append(grant)
                    self._bump_revision()
                self.db.execute("INSERT INTO lottery_requests VALUES (?,?,?,?,?,?)",
                    (request_id, "starGift", machine, current.date().isoformat(), int(current.timestamp()*1000),
                     json.dumps(result, ensure_ascii=False, allow_nan=False)))
            return {"lottery": self.lottery_state(current), "quests": self.quest_state(current), "result": result,
                    "ticketGrants": ticket_grants, "alreadyProcessed": previous is not None or already_claimed,
                    "now": current.isoformat()}

    def _migrate_shop_v18(self):
        """Refund only pre-upgrade purchases, never retroactively charge more.

        The migration marker is written even for an empty shop. New-price
        purchases therefore cannot be mistaken for old ones on later starts.
        Both per-item receipts and the completion marker commit atomically.
        """
        with self._quest_transaction():
            if self._meta(SHOP_PRICING_MIGRATION) is not None:
                return
            current = quest_clock()
            for item_id in LEGACY_SHOP_ITEM_IDS:
                row = self.db.execute("""SELECT SUM(l.coins) AS coins,SUM(l.diamonds) AS diamonds FROM shop_purchases p
                    JOIN wallet_ledger l ON l.reference IN ('purchase:'||p.item_id,'buy:'||p.item_id)
                    WHERE p.item_id=? GROUP BY p.item_id""", (item_id,)).fetchone()
                if row is None:
                    continue
                item = SHOP_ITEMS.get(item_id) or RETIRED_NPC_V18_PRICES[item_id]
                coins = max(max(-row["coins"], 0) - item["coins"], 0)
                diamonds = max(max(-row["diamonds"], 0) - item["diamonds"], 0)
                if coins or diamonds:
                    self.db.execute("INSERT OR IGNORE INTO wallet_ledger VALUES (?,?,?,?)",
                                    (f"pricing:v18:{item_id}", coins, diamonds, int(current.timestamp() * 1000)))
            self._set_meta(SHOP_PRICING_MIGRATION, current.isoformat())

    def _migrate_remove_npc_outfits(self):
        """Retire NPC clothing and refund its remaining actual purchase cost.

        Both the v1.8 refund and this retirement receipt remain in the ledger.
        Ownership rows stay for auditing, but no retired item is usable again.
        """
        with self._quest_transaction():
            if self._meta(SHOP_NPC_REMOVAL_MIGRATION) is not None:
                self.db.execute("DELETE FROM shop_equipment WHERE slot='npc'")
                return
            current = quest_clock()
            for item_id in RETIRED_NPC_ITEM_IDS:
                if not self.db.execute("SELECT 1 FROM shop_purchases WHERE item_id=?", (item_id,)).fetchone():
                    continue
                # Current archives use purchase:; accept the older buy: spelling
                # too. Price tags are deliberately not used to invent refunds.
                spending = self.db.execute("""SELECT COALESCE(SUM(MIN(coins,0)),0),
                    COALESCE(SUM(MIN(diamonds,0)),0) FROM wallet_ledger
                    WHERE reference IN (?,?)""", (f"purchase:{item_id}", f"buy:{item_id}")).fetchone()
                returned = self.db.execute("SELECT coins,diamonds FROM wallet_ledger WHERE reference=?",
                                           (f"pricing:v18:{item_id}",)).fetchone()
                coins = max(0, -spending[0] - (max(0, returned[0]) if returned else 0))
                diamonds = max(0, -spending[1] - (max(0, returned[1]) if returned else 0))
                if coins or diamonds:
                    self.db.execute("INSERT OR IGNORE INTO wallet_ledger VALUES (?,?,?,?)",
                        (f"retired:npc-outfit:{item_id}", coins, diamonds, int(current.timestamp() * 1000)))
            self.db.execute("DELETE FROM shop_equipment WHERE slot='npc'")
            self._set_meta(SHOP_NPC_REMOVAL_MIGRATION, current.isoformat())

    def _migrate_continuous_quests(self, now=None):
        """Keep old rewards immutable and carry only previously eligible study.

        Unclaimed old intervals remain eligible, including late-arriving source
        records. The continuous interval begins at upgrade time; unrelated study
        outside the old accepted windows does not become a retroactive reward.
        Reward offsets preserve fractional remainders without paying the old
        per-day rounding differences again during the migration.
        """
        with self._quest_transaction():
            if self._meta("continuous_quests_v1") is not None:
                return
            current = quest_clock(now)
            current_ms = int(current.timestamp() * 1000)
            for definition in QUEST_DEFINITIONS:
                subject = definition["subject"]
                acceptances = self.db.execute("SELECT * FROM quest_acceptances WHERE subject=? ORDER BY accepted_ms", (subject,)).fetchall()
                receipts = self.db.execute("SELECT * FROM quest_receipts WHERE subject=? ORDER BY submitted_ms", (subject,)).fetchall()
                if not acceptances and not receipts:
                    continue
                accepted_ms = min([row["accepted_ms"] for row in acceptances] + [row["submitted_ms"] for row in receipts])
                settled = round(sum(row["minutes"] for row in receipts), 8)
                coins = sum(row["coins"] for row in receipts)
                diamonds = sum(row["diamonds"] for row in receipts)
                coin_offset = math.floor(settled * 2 + 1e-8) - coins
                diamond_offset = math.floor(settled / definition["target"] + 1e-10) * 2 - diamonds
                self.db.execute("INSERT OR IGNORE INTO quest_tracks VALUES (?,?,?,?,?,?,?,?,?)",
                                (subject, accepted_ms, current_ms, settled, coins, diamonds,
                                 coin_offset, diamond_offset, int(bool(receipts))))
                for acceptance in acceptances:
                    # Old acceptances were dated in the server's local zone.
                    day_start = datetime.combine(parse_day(acceptance["day"]), datetime.min.time()).astimezone()
                    deadline = day_start + timedelta(hours=definition["deadlineHour"])
                    lower, upper = acceptance["lower_ms"], min(int(deadline.timestamp() * 1000), current_ms)
                    if upper > lower:
                        self.db.execute("INSERT OR IGNORE INTO quest_legacy_windows VALUES (?,?,?)", (subject, lower, upper))
            self._set_meta("continuous_quests_v1", current.isoformat())

    def _initialize_timed_bonus(self, now=None):
        with self._quest_transaction():
            if self._meta(TIMED_BONUS_START_META) is None:
                current = quest_clock(now)
                # Preserve today's accepted study at upgrade, but do not grant
                # bonuses retroactively for earlier days in the saved archive.
                midnight = datetime.combine(current.date(), datetime.min.time()).astimezone()
                self._set_meta(TIMED_BONUS_START_META, int(midnight.timestamp() * 1000))

    @staticmethod
    def _mystery_goal_settings(settings):
        return {key: settings[key] for key in ("targets", "mapping")}

    def _save_mystery_epoch(self, settings, effective_ms):
        self.db.execute("INSERT OR REPLACE INTO mystery_goal_epochs VALUES (?,?)",
                        (effective_ms, json.dumps(self._mystery_goal_settings(settings), ensure_ascii=False, sort_keys=True)))

    def _initialize_mystery(self, now=None):
        with self._quest_transaction():
            if self._meta(MYSTERY_START_META) is None:
                started = int(quest_clock(now).timestamp() * 1000)
                self._set_meta(MYSTERY_START_META, started)
                self._save_mystery_epoch(self.settings, started)

    def _migrate_mystery_diamond_cadence(self):
        with self._quest_transaction():
            columns = {row[1] for row in self.db.execute("PRAGMA table_info(mystery_tracks)")}
            if "diamond_offset" not in columns:
                self.db.execute("ALTER TABLE mystery_tracks ADD COLUMN diamond_offset INTEGER NOT NULL DEFAULT 0")
            if self._meta(MYSTERY_DIAMOND_CADENCE_META) is not None:
                return
            # Old politics/English awards spent 30 minutes for 4 diamonds.
            # Preserve that payout without making future study repay it, while
            # retaining all previously unexchanged minutes at the new cadence.
            self.db.execute("UPDATE mystery_tracks SET diamond_offset=-paid_diamonds/2 WHERE subject IN ('politics','english')")
            self._set_meta(MYSTERY_DIAMOND_CADENCE_META, "1")

    def _initialize_goals(self, now=None):
        """One-time forward-only goal migration; never mint or rewrite rewards."""
        with self._quest_transaction():
            if self._meta(GOAL_HISTORY_START_META) is not None:
                return
            current = quest_clock(now)
            started = int(current.timestamp() * 1000)
            self._set_meta(GOAL_HISTORY_START_META, started)
            self._set_meta(GOAL_HISTORY_WEEKLY_META, self.settings["weeklyTarget"])
            self._set_meta(GOAL_HISTORY_DEFAULTS_META, json.dumps(DEFAULT_SETTINGS["targets"], sort_keys=True))
            self.db.execute("INSERT OR IGNORE INTO goal_days VALUES (?,?,0,?,?)",
                (current.date().isoformat(), json.dumps(DEFAULT_SETTINGS["targets"], sort_keys=True), started, started))
            effective = dict(self.settings, targets=dict(DEFAULT_SETTINGS["targets"]))
            self._save_mystery_epoch(effective, started)

    def _goal_defaults(self):
        return json.loads(self._meta(GOAL_HISTORY_DEFAULTS_META) or json.dumps(DEFAULT_SETTINGS["targets"]))

    def _ensure_goal_days(self, current):
        """Freeze missed default days once, including when the app was closed."""
        with self.lock:
            started = datetime.fromtimestamp(int(self._meta(GOAL_HISTORY_START_META))/1000, current.tzinfo).date()
            latest = self.db.execute("SELECT MAX(day) FROM goal_days").fetchone()[0]
            cursor = max(started, parse_day(latest)+timedelta(days=1)) if latest else started
            if cursor > current.date():
                return
            with nullcontext() if self.db.in_transaction else self.db:
                encoded = json.dumps(self._goal_defaults(), sort_keys=True)
                while cursor <= current.date():
                    midnight = int(datetime.combine(cursor, datetime.min.time(), current.tzinfo).timestamp()*1000)
                    self.db.execute("INSERT OR IGNORE INTO goal_days VALUES (?,?,0,?,?)", (cursor.isoformat(), encoded, midnight, midnight))
                    cursor += timedelta(days=1)

    @staticmethod
    def _goal_week_start(day):
        selected = parse_day(day)
        return (selected - timedelta(days=selected.weekday())).isoformat()

    def _daily_goal(self, day, current):
        selected = parse_day(day)
        row = self.db.execute("SELECT * FROM goal_days WHERE day=?", (day,)).fetchone()
        started = int(self._meta(GOAL_HISTORY_START_META))
        feature_day = datetime.fromtimestamp(started / 1000, current.tzinfo).date()
        source, estimated, changes = "default", False, 0
        if row:
            targets, changes = json.loads(row["targets"]), row["changes"]
            source = "recorded" if changes else "default"
        elif selected >= feature_day:
            targets = self._goal_defaults()
        else:
            # Old global settings did not record a daily snapshot. Only an
            # actual goal epoch before that day's end supplies historical facts.
            end = int(datetime.combine(selected + timedelta(days=1), datetime.min.time(), current.tzinfo).timestamp() * 1000)
            epoch = self.db.execute("SELECT settings FROM mystery_goal_epochs WHERE effective_ms<? AND effective_ms<? ORDER BY effective_ms DESC LIMIT 1",
                                    (end, started)).fetchone()
            if epoch:
                targets, source = json.loads(epoch[0])["targets"], "legacy-recorded"
            else:
                # The user chose 8h / 3-3-1-1 as the historical rule for days
                # without an archive. Keep its provenance explicit, independent
                # of today's changes, and leave reward epochs/receipts intact.
                targets, source = {"math": 180, "cs": 180, "politics": 60, "english": 60}, "historical-default"
        return {"day": day, "targets": targets, "total": sum(targets.values()),
                "changesUsed": changes, "changesRemaining": max(0, DAILY_GOAL_CHANGE_LIMIT-changes) if day == current.date().isoformat() else 0,
                "changeLimit": DAILY_GOAL_CHANGE_LIMIT, "defaultTargets": self._goal_defaults(),
                "targetEstimated": estimated, "targetSource": source}

    def _weekly_goal(self, week_start, current):
        start = parse_day(week_start)
        row = self.db.execute("SELECT * FROM goal_weeks WHERE week_start=?", (week_start,)).fetchone()
        suggested = int(self._meta(GOAL_HISTORY_WEEKLY_META) or self.settings["weeklyTarget"])
        is_current = week_start == self._goal_week_start(current.date().isoformat())
        return {"weekStart": week_start, "weekEnd": (start+timedelta(days=6)).isoformat(),
                "target": row["target"] if row else suggested, "confirmed": bool(row), "locked": bool(row),
                "confirmedAt": iso_ms(row["confirmed_ms"]) if row else None,
                "targetEstimated": not bool(row), "targetSource": "confirmed" if row else "suggested" if is_current else "estimated"}

    def goals_state(self, now=None):
        with self.lock:
            current = quest_clock(now)
            self._ensure_goal_days(current)
            today = current.date().isoformat()
            weekly = self._weekly_goal(self._goal_week_start(today), current)
            return {"today": today, "daily": self._daily_goal(today, current), "weekly": weekly,
                    "weeklyRequired": not weekly["confirmed"]}

    def _goal_request(self, request_id, kind, period, payload):
        request_id = self._action_uuid(request_id)
        encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        existing = self.db.execute("SELECT * FROM goal_requests WHERE request_id=?", (request_id,)).fetchone()
        if existing and (existing["kind"] != kind or existing["period"] != period or existing["payload"] != encoded):
            raise ValueError("同一个目标请求标识不能修改内容")
        return request_id, encoded, existing

    def set_daily_goal(self, targets, day, request_id, now=None):
        if not isinstance(targets, dict) or set(targets) != SUBJECT_IDS:
            raise ValueError("请同时填写四科的今日目标")
        validated = validate_settings(DEFAULT_SETTINGS, {"targets": targets})["targets"]
        parse_day(day)
        with self._quest_transaction():
            current = quest_clock(now)
            request_id, encoded, existing = self._goal_request(request_id, "daily", day, validated)
            if not existing:
                if day != current.date().isoformat():
                    raise ValueError("日期已变化，请重新查看今天的目标；过去目标不能修改")
                goal = self._daily_goal(day, current)
                if goal["targets"] == validated:
                    raise ValueError("目标没有变化，本次不占用调整次数")
                if goal["changesUsed"] >= DAILY_GOAL_CHANGE_LIMIT:
                    raise ValueError("今日已调整两次，明天会恢复默认目标")
                now_ms = int(current.timestamp()*1000)
                self.db.execute("""INSERT INTO goal_days VALUES (?,?,?,?,?) ON CONFLICT(day) DO UPDATE SET
                    targets=excluded.targets,changes=excluded.changes,updated_ms=excluded.updated_ms""",
                    (day, json.dumps(validated, sort_keys=True), goal["changesUsed"]+1, now_ms, now_ms))
                self.db.execute("INSERT INTO goal_requests VALUES (?,?,?,?,?)", (request_id, "daily", day, encoded, now_ms))
                self._save_mystery_epoch(dict(self.settings, targets=validated), now_ms)
                self._bump_revision()
            return dict(self.goals_state(current), receipt={"requestId": request_id, "kind": "daily", "alreadyApplied": bool(existing)})

    def set_weekly_goal(self, target, week_start, request_id, now=None):
        target = validate_settings(DEFAULT_SETTINGS, {"weeklyTarget": target})["weeklyTarget"]
        if self._goal_week_start(week_start) != week_start:
            raise ValueError("周目标必须从周一开始")
        with self._quest_transaction():
            current = quest_clock(now)
            request_id, encoded, existing = self._goal_request(request_id, "weekly", week_start, target)
            if not existing:
                if week_start != self._goal_week_start(current.date().isoformat()):
                    raise ValueError("已进入另一周，请重新填写本周目标；过去周目标不能修改")
                if self.db.execute("SELECT 1 FROM goal_weeks WHERE week_start=?", (week_start,)).fetchone():
                    raise ValueError("本周目标已经确认，不能再修改")
                now_ms = int(current.timestamp()*1000)
                self.db.execute("INSERT INTO goal_weeks VALUES (?,?,?)", (week_start, target, now_ms))
                self.db.execute("INSERT INTO goal_requests VALUES (?,?,?,?,?)", (request_id, "weekly", week_start, encoded, now_ms))
                self._bump_revision()
            return dict(self.goals_state(current), receipt={"requestId": request_id, "kind": "weekly", "alreadyApplied": bool(existing)})

    def island_rewards_state(self, selected_day=None, now=None, records=None):
        """Read daily island gifts without allocating study or writing receipts.

        Historical dates retain their claim markers but cannot mint old gifts.
        The optional records are the already filtered active rows from state().
        Eligibility uses unrounded completed minutes, not displayed percentages.
        """
        with self.lock:
            current = quest_clock(now)
            today = current.date().isoformat()
            day = selected_day if selected_day is not None else today
            parse_day(day)
            goal = self._daily_goal(day, current)
            now_ms = int(current.timestamp()*1000)
            if records is None:
                records = self.db.execute("""SELECT r.* FROM records r WHERE r.day=?
                    AND r.end_ms<=? AND NOT EXISTS (SELECT 1 FROM record_lifecycle l
                        WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)""", (day, now_ms)).fetchall()
            completed = [row for row in records if row["day"] == day and row["end_ms"] <= now_ms]
            totals = {sid: [] for sid in SUBJECT_IDS}
            for row in completed:
                subject = classify(row["name"], self.settings["mapping"])
                if subject in totals:
                    totals[subject].append(row["minutes"])
            claims = {row["island"]: row for row in self.db.execute(
                "SELECT * FROM island_reward_claims WHERE day=?", (day,))}

            def gift(island, eligible, coins, diamonds):
                claimed = island in claims
                return {"id": island, "eligible": eligible, "claimed": claimed,
                        "available": day == today and eligible and not claimed,
                        "claimedAt": iso_ms(claims[island]["claimed_ms"]) if claimed else None,
                        "reward": {"coins": coins, "diamonds": diamonds}}

            subjects = []
            for sid, name, _ in SUBJECTS:
                minutes = math.fsum(totals[sid])
                target = goal["targets"][sid]
                eligible = day <= today and not goal["targetEstimated"] and minutes >= target
                subjects.append(dict(gift(sid, eligible, 30, 1), name=name,
                                     minutes=round(minutes, 4), target=target))
            minutes = math.fsum(row["minutes"] for row in completed)
            main = dict(gift("main", all(item["eligible"] for item in subjects)
                            and minutes >= goal["total"], 100, 4),
                        name="四科同行", minutes=round(minutes, 4), target=goal["total"])
            return {"day": day, "today": today, "isToday": day == today,
                    "subjects": subjects, "main": main,
                    "availableCount": sum(item["available"] for item in [*subjects, main])}

    def claim_island_reward(self, day, island, now=None):
        parse_day(day)
        if not isinstance(island, str) or island not in SUBJECT_IDS | {"main"}:
            raise ValueError("请选择四科岛屿或主岛的礼盒")
        with self._quest_transaction():
            # Resolve the clock after acquiring the write lock: a click queued
            # before midnight must not claim yesterday's gift after midnight.
            current = quest_clock(now)
            if day != current.date().isoformat():
                raise ValueError("日期已变化，请回到今天领取礼盒；礼盒仅限当天领取")
            existing = self.db.execute("SELECT 1 FROM island_reward_claims WHERE day=? AND island=?",
                                       (day, island)).fetchone()
            reward = {"coins": 0, "diamonds": 0}
            ticket_grants = []
            if not existing:
                state = self.island_rewards_state(day, current)
                item = state["main"] if island == "main" else next(
                    item for item in state["subjects"] if item["id"] == island)
                if not item["available"]:
                    raise ValueError("这份礼盒还在准备，完成对应的今日目标后再来领取吧")
                reward = item["reward"]
                created_ms = int(current.timestamp()*1000)
                self.db.execute("INSERT INTO island_reward_claims VALUES (?,?,?,?,?)",
                                (day, island, reward["coins"], reward["diamonds"], created_ms))
                self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                                (f"island-gift:{day}:{island}", reward["coins"], reward["diamonds"], created_ms))
                grant = self._grant_lottery_ticket(f"island:{day}:{island}", "diamond" if island == "main" else "coin",
                    "island-main" if island == "main" else "island-subject", "四科同行礼盒" if island == "main" else f"{item['name']}每日礼盒", current)
                if grant:
                    ticket_grants.append(grant)
                self._bump_revision()
            return {"islandRewards": self.island_rewards_state(day, current), "wallet": self._wallet(),
                    "reward": reward, "alreadyClaimed": bool(existing), "island": island, "day": day,
                    "lottery": self.lottery_state(current), "ticketGrants": ticket_grants}

    def method_rewards_state(self, selected_day=None, now=None, records=None):
        """Observe completed active study; method gifts never allocate its time.

        Ingestion already canonicalizes records across desktop/calendar sources.
        Counting canonical active rows also lets corrected mappings or deleted
        records change eligibility while preserving a previously issued receipt.
        """
        with self.lock:
            current = quest_clock(now)
            today = current.date().isoformat()
            day = selected_day if selected_day is not None else today
            parse_day(day)
            now_ms = int(current.timestamp()*1000)
            if records is None:
                records = self.db.execute("""SELECT r.* FROM records r WHERE r.day=?
                    AND r.end_ms<=? AND NOT EXISTS (SELECT 1 FROM record_lifecycle l
                        WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)""", (day, now_ms)).fetchall()
            totals = {sid: {activity: [] for activity in ("lecture", "practice", "other")}
                      for sid in SUBJECT_IDS}
            for row in records:
                if row["day"] != day or row["end_ms"] > now_ms:
                    continue
                subject = classify(row["name"], self.settings["mapping"])
                if subject in totals:
                    activity = classify_activity(row["name"], self.settings["activityMapping"])
                    totals[subject][activity].append(row["minutes"])
            claims = {(row["subject"], row["tier"]): row for row in self.db.execute(
                "SELECT * FROM method_reward_claims WHERE day=?", (day,))}
            subjects = []
            for sid, name, color in SUBJECTS:
                amounts = {activity: math.fsum(values) for activity, values in totals[sid].items()}
                lecture, practice = amounts["lecture"], amounts["practice"]
                eligible = {"practice": day <= today and practice >= 20,
                            "mastery": day <= today and ((lecture >= 20 and practice >= 30) or practice >= 60)}
                rewards = []
                for tier, definition in METHOD_REWARD_TIERS.items():
                    claim = claims.get((sid, tier))
                    rewards.append({"id": tier, "name": definition["name"], "eligible": eligible[tier],
                                    "available": day == today and eligible[tier] and claim is None,
                                    "claimed": claim is not None,
                                    "claimedAt": iso_ms(claim["claimed_ms"]) if claim is not None else None,
                                    "reward": {"coins": definition["coins"], "diamonds": definition["diamonds"]}})
                subjects.append({"id": sid, "name": name, "color": color,
                                 **{activity: round(value, 4) for activity, value in amounts.items()},
                                 "rewards": rewards})
            bonus_claim = self.db.execute("SELECT * FROM method_completion_claims WHERE day=?", (day,)).fetchone()
            completed = sum(reward["eligible"] for subject in subjects for reward in subject["rewards"])
            bonus_eligible = completed == len(SUBJECTS)*len(METHOD_REWARD_TIERS)
            bonus = {"name": METHOD_COMPLETION_BONUS["name"], "eligible": bonus_eligible,
                     "available": day == today and bonus_eligible and bonus_claim is None,
                     "claimed": bonus_claim is not None,
                     "claimedAt": iso_ms(bonus_claim["claimed_ms"]) if bonus_claim is not None else None,
                     "completedCount": completed, "requiredCount": 8,
                     "reward": {key: METHOD_COMPLETION_BONUS[key] for key in ("coins", "diamonds")}}
            return {"day": day, "today": today, "isToday": day == today, "subjects": subjects,
                    "completionBonus": bonus,
                    "availableCount": sum(reward["available"] for subject in subjects for reward in subject["rewards"])+int(bonus["available"]),
                    "claimedCount": len(claims)+int(bonus_claim is not None),
                    "claimedTotals": {key: sum(claim[key] for claim in claims.values())+(bonus_claim[key] if bonus_claim else 0) for key in ("coins", "diamonds")},
                    "subjectDailyCap": {"coins": 240, "diamonds": 4},
                    "dailyCap": {key: len(SUBJECTS)*sum(tier[key] for tier in METHOD_REWARD_TIERS.values())+METHOD_COMPLETION_BONUS[key] for key in ("coins", "diamonds")}}

    def claim_method_reward(self, day, subject, tier, now=None):
        parse_day(day)
        if not isinstance(subject, str) or subject not in SUBJECT_IDS:
            raise ValueError("请选择数学、408、政治或英语的学习方式奖励")
        if not isinstance(tier, str) or tier not in METHOD_REWARD_TIERS:
            raise ValueError("请选择落笔试锋或学以致用奖励")
        with self._quest_transaction():
            # The queued request is checked after the write lock, including midnight.
            current = quest_clock(now)
            if day != current.date().isoformat():
                raise ValueError("日期已变化，请回到今天领取；学习方式奖励仅限当天领取")
            existing = self.db.execute("SELECT 1 FROM method_reward_claims WHERE day=? AND subject=? AND tier=?",
                                       (day, subject, tier)).fetchone()
            reward = {"coins": 0, "diamonds": 0}
            if not existing:
                state = self.method_rewards_state(day, current)
                row = next(item for item in state["subjects"] if item["id"] == subject)
                item = next(item for item in row["rewards"] if item["id"] == tier)
                if not item["available"]:
                    raise ValueError("这份心意还在准备，完成对应的听课与做题安排后再来吧")
                reward = item["reward"]
                created_ms = int(current.timestamp()*1000)
                self.db.execute("INSERT INTO method_reward_claims VALUES (?,?,?,?,?,?)",
                                (day, subject, tier, reward["coins"], reward["diamonds"], created_ms))
                self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                                (f"method-gift:{day}:{subject}:{tier}", reward["coins"], reward["diamonds"], created_ms))
                self._bump_revision()
            return {"day": day, "subject": subject, "tier": tier, "reward": reward,
                    "wallet": self._wallet(), "methodRewards": self.method_rewards_state(day, current),
                    "alreadyClaimed": bool(existing), "now": current.isoformat()}

    def claim_method_completion(self, day, now=None):
        parse_day(day)
        with self._quest_transaction():
            current = quest_clock(now)
            if day != current.date().isoformat():
                raise ValueError("日期已变化，请回到今天领取；研习额外奖赏仅限当天领取")
            existing = self.db.execute("SELECT 1 FROM method_completion_claims WHERE day=?", (day,)).fetchone()
            reward = {"coins": 0, "diamonds": 0}
            ticket_grants = []
            if not existing:
                bonus = self.method_rewards_state(day, current)["completionBonus"]
                if not bonus["available"]:
                    raise ValueError("四科的两档研习任务全部完成后，再来收下融会贯通的奖赏吧")
                reward = bonus["reward"]
                created_ms = int(current.timestamp()*1000)
                self.db.execute("INSERT INTO method_completion_claims VALUES (?,?,?,?)",
                                (day, reward["coins"], reward["diamonds"], created_ms))
                self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                                (f"method-completion:{day}", reward["coins"], reward["diamonds"], created_ms))
                grant = self._grant_lottery_ticket(f"method:{day}:completion", "diamond", "method-completion", "融会贯通奖赏", current)
                if grant:
                    ticket_grants.append(grant)
                self._bump_revision()
            return {"day": day, "subject": "all", "tier": "completion", "reward": reward,
                    "wallet": self._wallet(), "methodRewards": self.method_rewards_state(day, current),
                    "alreadyClaimed": bool(existing), "now": current.isoformat(),
                    "lottery": self.lottery_state(current), "ticketGrants": ticket_grants}

    def _goal_mystery_epochs(self, current):
        """Insert midnight resets into the temporal projection, including days
        the app was closed. Actual intra-day epochs retain their exact times.
        """
        now_ms = int(current.timestamp()*1000)
        rows = [(row["effective_ms"], json.loads(row["settings"])) for row in
                self.db.execute("SELECT * FROM mystery_goal_epochs WHERE effective_ms<=? ORDER BY effective_ms", (now_ms,))]
        started = int(self._meta(GOAL_HISTORY_START_META))
        if now_ms <= started:
            return rows
        first = datetime.fromtimestamp(started / 1000, current.tzinfo).date() + timedelta(days=1)
        reset = first
        synthetic = []
        defaults = self._goal_defaults()
        cursor, mapping = 0, dict(self.settings["mapping"])
        while reset <= current.date():
            point = int(datetime.combine(reset, datetime.min.time(), current.tzinfo).timestamp()*1000)
            while cursor < len(rows) and rows[cursor][0] < point:
                mapping = rows[cursor][1]["mapping"]
                cursor += 1
            synthetic.append((point, {"targets": dict(defaults), "mapping": dict(mapping)}))
            reset += timedelta(days=1)
        # An actual update at midnight follows the reset at that same instant.
        return sorted(synthetic + rows, key=lambda item: item[0])

    def heatmap(self, period="month", anchor=None, now=None):
        current = quest_clock(now)
        selected = parse_day(anchor or current.date().isoformat())
        if period == "week":
            start = selected-timedelta(days=selected.weekday())
            end = start+timedelta(days=6)
        elif period == "month":
            start = selected.replace(day=1)
            end = (start.replace(day=28)+timedelta(days=4)).replace(day=1)-timedelta(days=1)
        elif period == "year":
            start, end = date(selected.year, 1, 1), date(selected.year, 12, 31)
        else:
            raise ValueError("热力图范围应为 week、month 或 year")
        with self.lock:
            self._ensure_goal_days(current)
            totals, subjects = {}, {}
            week_first = start-timedelta(days=start.weekday())
            week_last = end+timedelta(days=6-end.weekday())
            for row in self.db.execute("""SELECT r.day,r.name,r.minutes FROM records r WHERE r.day>=? AND r.day<=? AND r.end_ms<=?
                AND NOT EXISTS (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)""",
                (week_first.isoformat(), week_last.isoformat(), int(current.timestamp()*1000))):
                day = row["day"]
                totals[day] = totals.get(day, 0)+row["minutes"]
                sid = classify(row["name"], self.settings["mapping"])
                counts = subjects.setdefault(day, {})
                counts[sid] = counts.get(sid, 0)+row["minutes"]
            days = []
            cursor = start
            while cursor <= end:
                day = cursor.isoformat()
                goal = self._daily_goal(day, current)
                minutes = round(totals.get(day, 0), 4)
                unknown = goal["targetEstimated"] or cursor > current.date()
                breakdown = [{"id": sid, "name": name, "minutes": round(subjects.get(day, {}).get(sid, 0), 4),
                    "target": goal["targets"][sid], "percent": percent(subjects.get(day, {}).get(sid, 0), goal["targets"][sid]),
                    "achieved": None if unknown else subjects.get(day, {}).get(sid, 0) >= goal["targets"][sid]} for sid, name, _ in SUBJECTS]
                days.append({"date": day, "minutes": minutes, "target": goal["total"], "targets": goal["targets"],
                    "percent": percent(minutes, goal["total"]), "achieved": None if unknown else minutes >= goal["total"],
                    "targetEstimated": goal["targetEstimated"], "targetSource": goal["targetSource"],
                    "future": cursor > current.date(), "subjects": breakdown})
                cursor += timedelta(days=1)
            weeks, cursor = [], week_first
            while cursor <= week_last:
                goal = self._weekly_goal(cursor.isoformat(), current)
                minutes = round(sum(totals.get((cursor+timedelta(days=offset)).isoformat(), 0) for offset in range(7)), 4)
                weeks.append(dict(goal, minutes=minutes, percent=percent(minutes, goal["target"]),
                                  achieved=None if goal["targetEstimated"] or cursor > current.date() else minutes >= goal["target"]))
                cursor += timedelta(days=7)
            return {"period": period, "anchor": selected.isoformat(), "today": current.date().isoformat(),
                    "start": start.isoformat(), "end": end.isoformat(), "days": days, "weeks": weeks,
                    "revision": self.revision, "summary": {"minutes": round(sum(row["minutes"] for row in days if not row["future"]), 4),
                        "activeDays": sum(row["minutes"] > 0 and not row["future"] for row in days), "achievedDays": sum(row["achieved"] is True for row in days),
                        "knownGoalDays": sum(not row["targetEstimated"] and not row["future"] for row in days),
                        "estimatedGoalDays": sum(row["targetEstimated"] and not row["future"] for row in days)}}

    @staticmethod
    def _unused_slices(slices, used):
        for used_start, used_end in used:
            remainder = []
            for start, end in slices:
                if used_end <= start or used_start >= end:
                    remainder.append((start, end))
                else:
                    if start < used_start:
                        remainder.append((start, used_start))
                    if used_end < end:
                        remainder.append((used_end, end))
            slices = remainder
        return slices

    @staticmethod
    def _mystery_threshold(items, threshold, strict=False):
        """First instant a cumulative effective-minute curve passes a target.

        Half-target equality alone never unlocks. Once it is strictly exceeded,
        the boundary itself has zero duration and may safely start a time slice.
        """
        total = sum(item["minutes"] for item in items)
        if (strict and total <= threshold + 1e-9) or (not strict and total + 1e-9 < threshold):
            return None
        events = {}
        for item in items:
            span = item["end_ms"] - item["start_ms"]
            if span <= 0 or item["minutes"] <= 0:
                continue
            density = item["minutes"] / span
            events[item["start_ms"]] = events.get(item["start_ms"], 0) + density
            events[item["end_ms"]] = events.get(item["end_ms"], 0) - density
        accumulated, rate, previous = 0, 0, None
        for point, change in sorted(events.items()):
            if previous is not None and rate > 0:
                gain = (point - previous) * rate
                reached = accumulated + gain > threshold + 1e-9 if strict else accumulated + gain + 1e-9 >= threshold
                if reached:
                    # A strict half-target must pass within this increasing
                    # segment. Equality at its end cannot unlock a later gap.
                    # Integer millisecond boundaries prevent paying a tiny
                    # pre-unlock fraction due to floating-point interpolation.
                    return min(point, math.ceil(previous + (threshold - accumulated) / rate - 1e-7))
                accumulated += gain
            rate += change
            previous = point
        return None

    def _reward_allocation_context(self):
        """Resolve ownership through source merges without re-paying clock drift.

        Desktop/calendar endpoints may differ by up to five seconds. If a paid
        slice reached the original session edge, its mask also covers a merged
        canonical edge. Interior cuts remain exact (acceptance/unlock times).
        The original settlement amounts and receipts are never rewritten.
        """
        merges, originals = {}, {}
        for row in self.db.execute("SELECT removed_id,canonical_id,original_records FROM record_merges"):
            merges[row["removed_id"]] = row["canonical_id"]
            try:
                journal = json.loads(row["original_records"])
                records = journal.get("records", []) if isinstance(journal, dict) else []
                if not {"tomatodo", "calendar"}.issubset({record.get("source") for record in records}):
                    continue
                for record in records:
                    originals.setdefault(record["id"], []).append((record["start_ms"], record["end_ms"]))
            except (ValueError, TypeError, KeyError):
                continue
        def canonical(identity):
            seen = set()
            while identity in merges and identity not in seen:
                seen.add(identity)
                identity = merges[identity]
            return identity
        bounds = {row["id"]: (row["start_ms"], row["end_ms"]) for row in
                  self.db.execute("SELECT id,start_ms,end_ms FROM records")}
        def interval(row):
            identity = canonical(row["record_id"])
            start, end = row["start_ms"], row["end_ms"]
            canonical_bounds = bounds.get(identity)
            if canonical_bounds:
                new_start, new_end = canonical_bounds
                for old_start, old_end in originals.get(row["record_id"], []):
                    if abs(new_start - old_start) <= 5000 and abs(new_end - old_end) <= 5000:
                        if start <= old_start < end:
                            start = min(start, new_start)
                        if start < old_end <= end:
                            end = max(end, new_end)
            return start, end
        return canonical, interval

    def _mystery_plan(self, current):
        """Pure projection: no unlocks, time reservations or money on GET.

        Goal epochs apply only forward in time. Old pending rewards survive a
        later target change, but lowering then restoring a goal cannot convert
        the intervening study retroactively. Canonical ownership always wins
        over newly discovered or reclassified eligibility.
        """
        now_ms = int(current.timestamp() * 1000)
        feature_ms = int(self._meta(MYSTERY_START_META))
        today = current.date().isoformat()
        feature_day = datetime.fromtimestamp(feature_ms / 1000, current.tzinfo).date()
        day_start = datetime.combine(feature_day, datetime.min.time(), current.tzinfo)
        epochs = self._goal_mystery_epochs(current)
        rows = self.db.execute("""SELECT r.* FROM records r WHERE r.end_ms<=? AND r.end_ms>?
            AND r.end_ms>r.start_ms AND r.minutes>0 AND NOT EXISTS
            (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)""",
            (now_ms, int(day_start.timestamp() * 1000))).fetchall()
        days = {today: []}
        for row in rows:
            span = row["end_ms"] - row["start_ms"]
            density = min(row["minutes"], span / 60000) / span
            first = max(row["start_ms"], int(day_start.timestamp() * 1000))
            day = datetime.fromtimestamp(first / 1000, current.tzinfo).date()
            final_day = datetime.fromtimestamp((row["end_ms"] - 1) / 1000, current.tzinfo).date()
            while day <= final_day:
                midnight = datetime.combine(day, datetime.min.time(), current.tzinfo)
                start = max(first, int(midnight.timestamp() * 1000))
                end = min(row["end_ms"], int((midnight + timedelta(days=1)).timestamp() * 1000))
                if end > start:
                    days.setdefault(day.isoformat(), []).append({"record_id": row["id"], "name": row["name"],
                        "source": row["source"], "start_ms": start, "end_ms": end, "minutes": density * (end - start)})
                day += timedelta(days=1)
        candidates, unlocked_today = [], None
        day_bounds = {key: (int(datetime.combine(parse_day(key), datetime.min.time(), current.tzinfo).timestamp()*1000),
                            int(datetime.combine(parse_day(key)+timedelta(days=1), datetime.min.time(), current.tzinfo).timestamp()*1000)) for key in days}
        active_goals = self._mystery_goal_settings(self.settings)
        if epochs:
            active_goals = epochs[-1][1]
        for index, (effective_ms, goals) in enumerate(epochs):
            target = sum(goals["targets"].values())
            if target < 480 or any(goals["targets"].get(subject, 0) <= 0 for subject in SUBJECT_IDS):
                continue
            until_ms = epochs[index + 1][0] if index + 1 < len(epochs) else now_ms
            for day_key, items in days.items():
                if not items:
                    continue
                start_day, end_day = day_bounds[day_key]
                if until_ms <= start_day or effective_ms >= end_day:
                    continue
                if max(item["end_ms"] for item in items) <= max(feature_ms, effective_ms):
                    # Still inspect today's already-met target to show an
                    # active NPC at installation, without granting old study.
                    if day_key != today or index != len(epochs) - 1:
                        continue
                total_cross = self._mystery_threshold(items, target)
                crossings = [self._mystery_threshold([item for item in items
                    if classify(item["name"], goals["mapping"]) == subject], goals["targets"][subject] / 2, True)
                    for subject in SUBJECT_IDS]
                if total_cross is None or any(point is None for point in crossings):
                    continue
                unlock = max(total_cross, *crossings, effective_ms, feature_ms)
                if day_key == today and index == len(epochs) - 1 and unlock <= now_ms:
                    unlocked_today = unlock
                for item in items:
                    # Spreadsheet archives can establish achievement, but do
                    # not mint new currency merely by importing old history.
                    subject = classify(item["name"], goals["mapping"])
                    if subject not in SUBJECT_IDS or item["source"] == HISTORY_SOURCE:
                        continue
                    start, end = max(item["start_ms"], unlock), min(item["end_ms"], until_ms)
                    if end > start:
                        candidates.append({"record_id": item["record_id"], "day": day_key, "subject": subject,
                            "start_ms": start, "end_ms": end,
                            "minutes": item["minutes"] * (end - start) / (item["end_ms"] - item["start_ms"])})
        canonical, allocation_interval = self._reward_allocation_context()
        occupied = {}
        for row in self.db.execute("""SELECT record_id,start_ms,end_ms FROM quest_allocations
            UNION ALL SELECT record_id,start_ms,end_ms FROM mystery_allocations"""):
            occupied.setdefault(canonical(row["record_id"]), []).append(allocation_interval(row))
        pending = []
        for item in sorted(candidates, key=lambda value: (value["start_ms"], value["end_ms"], value["record_id"])):
            identity = canonical(item["record_id"])
            used = occupied.setdefault(identity, [])
            slices = self._unused_slices([(item["start_ms"], item["end_ms"])], used)
            density = item["minutes"] / (item["end_ms"] - item["start_ms"])
            pending.extend(dict(item, record_id=identity, start_ms=start, end_ms=end, minutes=density * (end - start))
                           for start, end in slices if end > start)
            used.extend(slices)
        return {"pending": pending, "todayRecords": days.get(today, []), "goals": active_goals,
                "unlockedAt": unlocked_today, "featureStartMs": feature_ms}

    def _mystery_state(self, current, plan=None):
        plan = plan if plan is not None else self._mystery_plan(current)
        today, pending = current.date().isoformat(), plan["pending"]
        goals, today_records = plan["goals"], plan["todayRecords"]
        tracks = {row["subject"]: row for row in self.db.execute("SELECT * FROM mystery_tracks")}
        grouped = {}
        for row in self.db.execute("SELECT day,subject,SUM(minutes) AS minutes FROM mystery_allocations GROUP BY day,subject"):
            grouped.setdefault(row["day"], {}).setdefault(row["subject"], {"settledMinutes": 0, "pendingMinutes": 0})["settledMinutes"] = row["minutes"]
        for item in pending:
            entry = grouped.setdefault(item["day"], {}).setdefault(item["subject"], {"settledMinutes": 0, "pendingMinutes": 0})
            entry["pendingMinutes"] += item["minutes"]
        claimed_gifts = {}
        for row in self.db.execute("SELECT day,MAX(gift_index) AS last FROM mystery_gifts GROUP BY day"):
            claimed_gifts[row["day"]] = row["last"]
        gifts, day_rows = [], []
        for day_key, entries in sorted(grouped.items()):
            settled = sum(entry["settledMinutes"] for entry in entries.values())
            available = sum(entry["pendingMinutes"] for entry in entries.values())
            count = math.floor((settled + available) / 30 + 1e-10)
            boxes = [{"day": day_key, "index": index, "coins": index * 20, "diamonds": index}
                     for index in range(claimed_gifts.get(day_key, 0) + 1, count + 1)]
            gifts.extend(boxes)
            day_rows.append({"day": day_key, "minutes": round(settled + available, 4),
                "settledMinutes": round(settled, 4), "pendingMinutes": round(available, 4), "pendingGifts": boxes,
                "subjects": [{"id": subject, "name": next(name for sid, name, _ in SUBJECTS if sid == subject),
                    **{key: round(value, 4) for key, value in entry.items()}} for subject, entry in entries.items()]})
        subjects, base = [], {"coins": 0, "diamonds": 0}
        for sid, name, _ in SUBJECTS:
            track = tracks.get(sid)
            settled = track["settled_minutes"] if track else 0
            available = sum(item["minutes"] for item in pending if item["subject"] == sid)
            total = round(settled + available, 8)
            block = 15
            coins = max(0, math.floor(total * 4 + 1e-8) - (track["paid_coins"] if track else 0))
            diamonds = max(0, math.floor(total / block + 1e-10)
                           - (track["paid_diamonds"] + track["diamond_offset"] if track else 0))
            base["coins"] += coins
            base["diamonds"] += diamonds
            minutes = sum(item["minutes"] for item in today_records if classify(item["name"], goals["mapping"]) == sid)
            target = goals["targets"][sid]
            subjects.append({"id": sid, "subject": sid, "name": name, "target": target, "minutes": round(minutes, 4),
                "eligible": target > 0 and minutes > target / 2 + 1e-9,
                "pendingMinutes": round(available, 4), "settledMinutes": round(settled, 4),
                "carryMinutes": round(total % block, 4), "blockMinutes": block,
                "reward": {"coins": coins, "diamonds": diamonds}})
        gift_reward = {"coins": sum(gift["coins"] for gift in gifts), "diamonds": sum(gift["diamonds"] for gift in gifts)}
        reward = {key: base[key] + gift_reward[key] for key in base}
        midnight = current.replace(hour=0, minute=0, second=0, microsecond=0)
        today_settled = self.db.execute("""SELECT COALESCE(SUM(a.minutes),0) FROM mystery_allocations a
            JOIN mystery_deliveries d ON d.request_id=a.request_id WHERE d.submitted_ms>=? AND d.submitted_ms<?""",
            (int(midnight.timestamp() * 1000), int((midnight + timedelta(days=1)).timestamp() * 1000))).fetchone()[0]
        today_day = next((row for row in day_rows if row["day"] == today), None)
        today_minutes = sum(entry["settledMinutes"] + entry["pendingMinutes"] for entry in grouped.get(today, {}).values())
        earned_count = math.floor(today_minutes / 30 + 1e-10)
        next_index = max(claimed_gifts.get(today, 0), earned_count) + 1
        target = sum(goals["targets"].values())
        enabled = target >= 480 and all(goals["targets"].get(sid, 0) > 0 for sid in SUBJECT_IDS)
        unlocked = enabled and plan["unlockedAt"] is not None
        ready = reward["coins"] > 0 or reward["diamonds"] > 0
        history = [dict(json.loads(row["receipt"]), alreadyClaimed=True) for row in
                   self.db.execute("SELECT receipt FROM mystery_deliveries ORDER BY submitted_ms DESC,rowid DESC LIMIT 20")]
        return {"enabled": enabled, "unlocked": unlocked, "status": "ready" if ready else "active" if unlocked else "locked" if enabled else "disabled",
            "day": today, "minimumTarget": 480, "target": target, "minutes": round(sum(item["minutes"] for item in today_records), 4),
            "featureStartMs": plan["featureStartMs"], "unlockedAt": iso_ms(plan["unlockedAt"]) if unlocked else None,
            "subjects": subjects, "pendingMinutes": round(sum(item["minutes"] for item in pending), 4),
            "todayMinutes": round(today_minutes, 4), "todaySettledMinutes": round(today_settled, 4),
            "todayPendingMinutes": today_day["pendingMinutes"] if today_day else 0,
            "reward": reward, "baseReward": base, "giftReward": gift_reward,
            "nextGift": {"index": next_index, "progressMinutes": round(max(0, today_minutes - earned_count * 30), 4),
                         "target": 30, "coins": next_index * 20, "diamonds": next_index},
            "pendingGifts": gifts, "days": day_rows, "history": history}

    def submit_mystery(self, request_id, now=None):
        request_id = self._quest_request_id(request_id)
        with self._quest_transaction():
            current = quest_clock(now)
            existing = self.db.execute("SELECT receipt FROM mystery_deliveries WHERE request_id=?", (request_id,)).fetchone()
            if existing:
                result = self.quest_state(current)
                result["receipt"] = dict(json.loads(existing["receipt"]), alreadyClaimed=True)
                return result
            plan = self._mystery_plan(current)
            summary = self._mystery_state(current, plan)
            if summary["status"] != "ready":
                raise ValueError("尚无可交付的余辉专注；同时达标后新增的四科学习会自动计入")
            submitted_ms = int(current.timestamp() * 1000)
            receipt = {"type": "mystery", "kind": "mystery", "requestId": request_id,
                "day": current.date().isoformat(), "submittedAt": current.isoformat(),
                "name": "拾星 · 余辉守望者", "minutes": summary["pendingMinutes"],
                **summary["reward"], "baseReward": summary["baseReward"], "giftReward": summary["giftReward"],
                "gifts": summary["pendingGifts"], "alreadyClaimed": False,
                "subjects": [{"id": row["id"], "name": row["name"], "minutes": row["pendingMinutes"], "reward": row["reward"]}
                             for row in summary["subjects"] if row["pendingMinutes"] > 0 or any(row["reward"].values())]}
            self.db.execute("INSERT INTO mystery_deliveries VALUES (?,?,?)",
                (request_id, submitted_ms, json.dumps(receipt, ensure_ascii=False, allow_nan=False)))
            self.db.executemany("INSERT INTO mystery_allocations VALUES (?,?,?,?,?,?,?)",
                [(request_id, item["day"], item["subject"], item["record_id"], item["start_ms"], item["end_ms"], item["minutes"])
                 for item in plan["pending"]])
            for row in summary["subjects"]:
                # Keep full precision for carry, independent of UI rounding or
                # number of submissions. Fractional coins carry forward too.
                minutes = sum(item["minutes"] for item in plan["pending"] if item["subject"] == row["id"])
                if minutes <= 0 and not any(row["reward"].values()):
                    continue
                self.db.execute("""INSERT INTO mystery_tracks (subject,settled_minutes,paid_coins,paid_diamonds)
                    VALUES (?,?,?,?) ON CONFLICT(subject) DO UPDATE SET
                    settled_minutes=settled_minutes+excluded.settled_minutes,
                    paid_coins=paid_coins+excluded.paid_coins,paid_diamonds=paid_diamonds+excluded.paid_diamonds""",
                    (row["id"], minutes, row["reward"]["coins"], row["reward"]["diamonds"]))
            self.db.executemany("INSERT INTO mystery_gifts VALUES (?,?,?,?,?)",
                [(gift["day"], gift["index"], request_id, gift["coins"], gift["diamonds"]) for gift in summary["pendingGifts"]])
            self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                (f"quest-mystery:{request_id}", receipt["coins"], receipt["diamonds"], submitted_ms))
            # The existing star currencies settle here. Its lottery ticket is
            # a separate, explicit gift-opening event, recoverable from either
            # the 拾星 gift scene or the matching lottery machine.
            result = self.quest_state(current)
            result["receipt"] = receipt
            result["ticketGrants"] = []
            return result

    def _exchange_state(self, wallet, current=None):
        current = quest_clock(current)
        history = [{"diamonds": row["diamonds"], "coins": row["coins"], "direction": row["direction"], "createdAt": iso_ms(row["created_ms"])}
                   for row in self.db.execute("""SELECT request_id,diamonds,coins,created_ms,'coins-to-diamonds' AS direction FROM shop_exchanges
                       UNION ALL SELECT request_id,1,75,created_ms,'diamonds-to-coins' FROM shop_reverse_exchanges
                       ORDER BY created_ms DESC,request_id DESC LIMIT 10""")]
        used = self.db.execute("SELECT COUNT(*) FROM shop_reverse_exchanges WHERE day=?", (current.date().isoformat(),)).fetchone()[0]
        remaining = max(0, REVERSE_EXCHANGE_DAILY_LIMIT-used)
        return {"coinsPerDiamond": EXCHANGE_COINS_PER_DIAMOND,
                "maxDiamonds": wallet["coins"] // EXCHANGE_COINS_PER_DIAMOND,
                "maxPerExchange": EXCHANGE_MAX_DIAMONDS, "history": history,
                "reverse": {"limit": REVERSE_EXCHANGE_DAILY_LIMIT, "used": used, "remaining": remaining,
                            "coinsPerDiamond": EXCHANGE_COINS_PER_DIAMOND, "maxDiamonds": min(wallet["diamonds"], remaining)}}

    def _quest_definition(self, subject):
        if not isinstance(subject, str) or subject not in SUBJECT_IDS:
            raise ValueError("请选择有效的委托科目")
        return next(item for item in QUEST_DEFINITIONS if item["subject"] == subject)

    def _quest_contributions(self, subject, lower_ms, upper_ms, now_ms, mystery_plan=None):
        """Allocate only finished, active canonical records to unused time slices.

        A paused timer's effective minutes are distributed proportionally over
        its actual span, and cannot exceed that span. Persisting the intervals
        also prevents a later remapping from spending the same study twice.
        """
        if upper_ms <= lower_ms:
            return []
        canonical, allocation_interval = self._reward_allocation_context()
        allocated = {}
        for row in self.db.execute("SELECT record_id,start_ms,end_ms FROM quest_allocations WHERE end_ms>? AND start_ms<?",
                                   (lower_ms, upper_ms)):
            allocated.setdefault(canonical(row["record_id"]), []).append(allocation_interval(row))
        # Both reward channels own canonical time globally. Unclaimed mystery
        # slices are reserved too, so submitting ordinary commissions first
        # cannot consume their double-rate study.
        for row in self.db.execute("SELECT record_id,start_ms,end_ms FROM mystery_allocations WHERE end_ms>? AND start_ms<?",
                                   (lower_ms, upper_ms)):
            allocated.setdefault(canonical(row["record_id"]), []).append(allocation_interval(row))
        plan = mystery_plan if mystery_plan is not None else self._mystery_plan(datetime.fromtimestamp(now_ms / 1000).astimezone())
        for item in plan["pending"]:
            allocated.setdefault(canonical(item["record_id"]), []).append((item["start_ms"], item["end_ms"]))
        rows = self.db.execute("""SELECT r.* FROM records r WHERE r.end_ms<=? AND r.end_ms>?
            AND r.start_ms<? AND r.end_ms>r.start_ms AND NOT EXISTS
            (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)""",
            (now_ms, lower_ms, upper_ms)).fetchall()
        contributions = []
        for row in rows:
            if classify(row["name"], self.settings["mapping"]) != subject:
                continue
            span = row["end_ms"] - row["start_ms"]
            valid_minutes = min(row["minutes"], span / 60_000)
            slices = [(max(lower_ms, row["start_ms"]), min(upper_ms, row["end_ms"], now_ms))]
            for used_start, used_end in allocated.get(row["id"], []):
                remainder = []
                for start, end in slices:
                    if used_end <= start or used_start >= end:
                        remainder.append((start, end))
                    else:
                        if start < used_start:
                            remainder.append((start, used_start))
                        if used_end < end:
                            remainder.append((used_end, end))
                slices = remainder
            for start, end in slices:
                if end > start:
                    contributions.append({"record_id": row["id"], "start_ms": start, "end_ms": end,
                                          "minutes": valid_minutes * (end - start) / span})
        return contributions

    def _continuous_contributions(self, subject, track, now_ms, mystery_plan=None):
        if track is None:
            return []
        windows = [(track["continuous_ms"], now_ms)]
        windows.extend((row[0], min(row[1], now_ms)) for row in self.db.execute(
            "SELECT start_ms,end_ms FROM quest_legacy_windows WHERE subject=?", (subject,)))
        merged = []
        for start, end in sorted(windows):
            if end <= start:
                continue
            if merged and start <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
            else:
                merged.append((start, end))
        return [item for start, end in merged
                for item in self._quest_contributions(subject, start, end, now_ms, mystery_plan)]

    @staticmethod
    def _bonus_window(definition, day):
        # Convert each local wall-clock boundary separately, including on DST
        # transition days. No date or clock is accepted from the HTTP client.
        midnight = datetime.combine(parse_day(day), datetime.min.time())
        opens = (midnight + timedelta(hours=definition["openHour"])).astimezone()
        deadline = (midnight + timedelta(hours=definition["deadlineHour"])).astimezone()
        return opens, deadline

    def _bonus_evidence(self, subject, lower_ms, now_ms, pending):
        """Combine immutable settled ownership with currently unallocated study.

        Base rewards and bonus rewards have separate ledgers. A half-round that
        was delivered earlier must still qualify toward this day's first round.
        If old source identities were merged, the earliest settled allocation
        owns overlapping time; remapping cannot award a second subject's bonus.
        """
        if now_ms <= lower_ms:
            return []
        canonical, allocation_interval = self._reward_allocation_context()
        def subtract(slices, used):
            for used_start, used_end in used:
                remainder = []
                for start, end in slices:
                    if used_end <= start or used_start >= end:
                        remainder.append((start, end))
                    else:
                        if start < used_start:
                            remainder.append((start, used_start))
                        if used_end < end:
                            remainder.append((used_end, end))
                slices = remainder
            return slices
        occupied, evidence = {}, []
        for row in self.db.execute("SELECT record_id,start_ms,end_ms FROM mystery_allocations WHERE end_ms>? AND start_ms<?", (lower_ms, now_ms)):
            occupied.setdefault(canonical(row["record_id"]), []).append(allocation_interval(row))
        for row in self.db.execute("""SELECT record_id,subject,start_ms,end_ms,minutes FROM quest_allocations
            WHERE end_ms>? AND start_ms<? ORDER BY rowid""", (lower_ms, now_ms)):
            span = row["end_ms"] - row["start_ms"]
            if span <= 0:
                continue
            record_id = canonical(row["record_id"])
            start, end = max(row["start_ms"], lower_ms), min(row["end_ms"], now_ms)
            used = occupied.setdefault(record_id, [])
            slices = subtract([(start, end)], used)
            used.extend(slices)
            if row["subject"] == subject:
                density = min(max(0, row["minutes"]), span / 60000) / span
                evidence.extend({"record_id": record_id, "start_ms": begin, "end_ms": finish,
                                 "minutes": density * (finish - begin), "source": "settled"}
                                for begin, finish in slices if finish > begin)
        for item in pending:
            start, end = max(item["start_ms"], lower_ms), min(item["end_ms"], now_ms)
            span = item["end_ms"] - item["start_ms"]
            if end <= start or span <= 0:
                continue
            record_id = canonical(item["record_id"])
            # Pending base contributions already exclude the global allocations;
            # applying the ownership mask again keeps this helper self-contained.
            slices = subtract([(start, end)], occupied.get(record_id, []))
            density = min(max(0, item["minutes"]), span / 60000) / span
            evidence.extend({"record_id": record_id, "start_ms": begin, "end_ms": finish,
                             "minutes": density * (finish - begin), "source": "pending"}
                            for begin, finish in slices if finish > begin)
        return evidence

    def _quest_bonus(self, definition, track, contributions, current):
        subject, today = definition["subject"], current.date().isoformat()
        feature_ms = int(self._meta(TIMED_BONUS_START_META))
        now_ms = int(current.timestamp() * 1000)
        lower_ms = max(feature_ms, track["accepted_ms"]) if track else feature_ms
        evidence = self._bonus_evidence(subject, lower_ms, now_ms, contributions) if track else []
        grouped = {}
        # Only dates touched by new eligible evidence are visited, rather than
        # querying every day since installation or scanning the year archive.
        for item in evidence:
            day = datetime.fromtimestamp(item["start_ms"] / 1000).astimezone().date()
            last = datetime.fromtimestamp((item["end_ms"] - 1) / 1000).astimezone().date()
            while day <= last:
                day_key = day.isoformat()
                opens, deadline = self._bonus_window(definition, day_key)
                start = max(item["start_ms"], lower_ms, int(opens.timestamp() * 1000))
                end = min(item["end_ms"], now_ms, int(deadline.timestamp() * 1000))
                if end > start:
                    minutes = item["minutes"] * (end - start) / (item["end_ms"] - item["start_ms"])
                    grouped.setdefault(day_key, []).append(dict(item, start_ms=start, end_ms=end, minutes=minutes))
                day += timedelta(days=1)
        claimed = {row["day"]: row for row in self.db.execute("SELECT * FROM quest_bonus_receipts WHERE subject=?", (subject,))}
        eligible = []
        for day_key, slices in sorted(grouped.items()):
            minutes = round(sum(item["minutes"] for item in slices), 8)
            if day_key in claimed or minutes + 1e-8 < definition["target"]:
                continue
            opens, deadline = self._bonus_window(definition, day_key)
            eligible.append({"day": day_key, "subject": subject, "minutes": minutes, "target": definition["target"],
                             "coins": definition["target"], "diamonds": 1,
                             "opensAt": opens.isoformat(), "deadline": deadline.isoformat(), "allocations": slices})
        opens, deadline = self._bonus_window(definition, today)
        receipt = claimed.get(today)
        minutes = receipt["minutes"] if receipt else round(sum(item["minutes"] for item in grouped.get(today, [])), 8)
        if receipt:
            status = "claimed"
        elif not track:
            status = "unaccepted"
        elif minutes + 1e-8 >= definition["target"]:
            status = "ready"
        elif current < opens:
            status = "upcoming"
        elif current >= deadline:
            status = "ended"
        else:
            status = "active"
        pending = [{key: value for key, value in item.items() if key != "allocations"} for item in eligible]
        result = {"enabled": True, "featureStartMs": feature_ms, "day": today, "period": definition["period"],
                  "windowLabel": "00:00–12:00" if definition["period"] == "morning" else "12:00–18:00",
                  "opensAt": opens.isoformat(), "deadline": deadline.isoformat(),
                  "eligibleFrom": iso_ms(max(lower_ms, int(opens.timestamp() * 1000))),
                  "target": definition["target"], "minutes": round(minutes, 4), "percent": percent(minutes, definition["target"]),
                  "status": status, "claimedAt": iso_ms(receipt["submitted_ms"]) if receipt else None,
                  "reward": {"coins": definition["target"], "diamonds": 1}, "pending": pending,
                  "pendingCount": len(pending), "pendingCoins": sum(item["coins"] for item in pending),
                  "pendingDiamonds": sum(item["diamonds"] for item in pending)}
        return result, eligible

    def _bonus_breakdown(self, request_id, coins, diamonds):
        bonuses = [{"day": row["day"], "subject": row["subject"], "minutes": round(row["minutes"], 4),
                    "target": self._quest_definition(row["subject"])["target"],
                    "coins": row["coins"], "diamonds": row["diamonds"]}
                   for row in self.db.execute("SELECT * FROM quest_bonus_receipts WHERE request_id=? ORDER BY day,subject", (request_id,))] if request_id else []
        bonus_reward = {"coins": sum(item["coins"] for item in bonuses), "diamonds": sum(item["diamonds"] for item in bonuses)}
        return {"baseReward": {"coins": coins - bonus_reward["coins"], "diamonds": diamonds - bonus_reward["diamonds"]},
                "bonusReward": bonus_reward, "bonuses": bonuses}

    def _today_settled_minutes(self, subject, current):
        # Delivery time defines the day, even when its study or legacy receipt
        # belongs to an earlier date. Do not derive this from capped history.
        day_start = current.replace(hour=0, minute=0, second=0, microsecond=0)
        start_ms = int(day_start.timestamp() * 1000)
        end_ms = int((day_start + timedelta(days=1)).timestamp() * 1000)
        total = self.db.execute("""SELECT COALESCE(SUM(minutes),0) FROM (
            SELECT minutes FROM quest_deliveries
                WHERE subject=? AND submitted_ms>=? AND submitted_ms<?
            UNION ALL SELECT minutes FROM quest_receipts
                WHERE subject=? AND submitted_ms>=? AND submitted_ms<?
            )""", (subject, start_ms, end_ms, subject, start_ms, end_ms)).fetchone()[0]
        return round(total, 4)

    def _quest_row(self, definition, current, mystery_plan=None):
        subject = definition["subject"]
        track = self.db.execute("SELECT * FROM quest_tracks WHERE subject=?", (subject,)).fetchone()
        contributions = self._continuous_contributions(subject, track, int(current.timestamp() * 1000), mystery_plan)
        minutes = round(sum(item["minutes"] for item in contributions), 8)
        settled = track["settled_minutes"] if track else 0
        paid_coins = track["paid_coins"] if track else 0
        paid_diamonds = track["paid_diamonds"] if track else 0
        coin_offset = track["coin_offset"] if track else 0
        diamond_offset = track["diamond_offset"] if track else 0
        total = round(settled + minutes, 8)
        reward = {"coins": max(0, math.floor(total * 2 + 1e-8) - coin_offset - paid_coins),
                  "diamonds": max(0, math.floor(total / definition["target"] + 1e-10) * 2 - diamond_offset - paid_diamonds)}
        first_completed = bool(track and track["first_completed"])
        base_ready = bool(track and minutes > 0 and reward["coins"] >= 1
                          and (first_completed or total + 1e-8 >= definition["target"]))
        bonus, _ = self._quest_bonus(definition, track, contributions, current)
        bonus_reward = {"coins": bonus["pendingCoins"], "diamonds": bonus["pendingDiamonds"]}
        base_reward = reward if base_ready or not bonus["pendingCount"] else {"coins": 0, "diamonds": 0}
        reward = {key: base_reward[key] + bonus_reward[key] for key in ("coins", "diamonds")}
        ready = base_ready or bool(bonus["pendingCount"])
        progress = max(0, total - (paid_diamonds + diamond_offset) / 2 * definition["target"])
        latest = self.db.execute("SELECT submitted_ms FROM quest_deliveries WHERE subject=? ORDER BY submitted_ms DESC,rowid DESC LIMIT 1", (subject,)).fetchone()
        if latest is None:
            latest = self.db.execute("SELECT submitted_ms FROM quest_receipts WHERE subject=? ORDER BY submitted_ms DESC LIMIT 1", (subject,)).fetchone()
        result = {"subject": subject, "name": definition["name"], "period": "anytime", "continuous": True,
                  "recommended": {"period": definition["period"], "label": "上午可优先安排" if definition["period"] == "morning" else "下午可优先安排", "bonus": True,
                                  "active": definition["openHour"] <= current.hour < definition["deadlineHour"]},
                  "target": definition["target"], "opensAt": None, "deadline": None, "submitDeadline": None,
                  "acceptedAt": iso_ms(track["accepted_ms"]) if track else None,
                  "submittedAt": iso_ms(latest[0]) if latest else None,
                  "lowerBound": "accepted", "eligibleFrom": iso_ms(track["accepted_ms"]) if track else None,
                  "status": "ready" if ready else "active" if track else "available",
                  "minutes": round(minutes, 4), "settledMinutes": round(settled, 4), "totalMinutes": round(total, 4),
                  "todaySettledMinutes": self._today_settled_minutes(subject, current),
                  "progressMinutes": round(progress, 4), "progressPercent": percent(progress, definition["target"]),
                  "percent": percent(progress, definition["target"]), "firstCompleted": first_completed,
                  "paidCoins": paid_coins, "paidDiamonds": paid_diamonds,
                  "roundTickets": self._round_ticket_preview(definition, settled, total if base_ready else settled, current),
                  "reward": reward, "baseReward": {"coins": definition["target"] * 2, "diamonds": 2},
                  "baseReady": base_ready, "rewardBreakdown": {"base": base_reward, "bonus": bonus_reward}, "bonus": bonus}
        return result, contributions, minutes

    def quest_state(self, now=None):
        with self.lock:
            current = quest_clock(now)
            owned = {row[0] for row in self.db.execute("SELECT item_id FROM shop_purchases")}
            equipped = {row[0]: row[1] for row in self.db.execute("SELECT slot,item_id FROM shop_equipment WHERE slot<>'npc'")}
            catalog = [dict(item, currency="coins" if item["coins"] else "diamonds" if item["diamonds"] else "free",
                            category=SHOP_CATEGORIES[item["slot"]],
                            owned=item["id"] in owned or (item["coins"] == 0 and item["diamonds"] == 0),
                            equipped=equipped.get(item["slot"]) == item["id"]) for item in SHOP_ITEMS.values()]
            history = [{"day": row["day"] or datetime.fromtimestamp(row["submitted_ms"] / 1000).astimezone().date().isoformat(),
                        "requestId": row["request_id"], "subject": row["subject"], "name": row["name"],
                        "minutes": round(row["minutes"], 4), "coins": row["coins"], "diamonds": row["diamonds"],
                        "submittedAt": iso_ms(row["submitted_ms"]),
                        **self._bonus_breakdown(row["request_id"], row["coins"], row["diamonds"])}
                       for row in self.db.execute("""SELECT day,subject,name,minutes,coins,diamonds,submitted_ms,NULL AS request_id
                           FROM quest_receipts UNION ALL SELECT NULL,subject,name,minutes,coins,diamonds,submitted_ms,request_id
                           FROM quest_deliveries ORDER BY submitted_ms DESC,subject LIMIT 20""")]
            wallet = self._wallet()
            mystery_plan = self._mystery_plan(current)
            return {"day": current.date().isoformat(), "now": current.isoformat(), "wallet": wallet,
                    "mystery": self._mystery_state(current, mystery_plan),
                    "quests": [self._quest_row(definition, current, mystery_plan)[0] for definition in QUEST_DEFINITIONS],
                    "catalog": catalog, "equipped": equipped, "history": history, "exchange": self._exchange_state(wallet, current),
                    "lottery": self.lottery_state(current)}

    def accept_quest(self, subject, now=None):
        self._quest_definition(subject)
        with self._quest_transaction():
            current = quest_clock(now)
            accepted_ms = int(current.timestamp() * 1000)
            self.db.execute("INSERT OR IGNORE INTO quest_tracks(subject,accepted_ms,continuous_ms) VALUES (?,?,?)",
                            (subject, accepted_ms, accepted_ms))
            return self.quest_state(current)

    @staticmethod
    def _quest_request_id(value):
        if not isinstance(value, str) or len(value) != 36:
            raise ValueError("交付请求标识必须为 UUID 字符串")
        try:
            canonical = str(uuid.UUID(value))
        except (ValueError, AttributeError):
            raise ValueError("交付请求标识必须为 UUID 字符串") from None
        if value.lower() != canonical:
            raise ValueError("交付请求标识必须为 UUID 字符串")
        return canonical

    def _delivery_receipt(self, row, already_claimed):
        return {"requestId": row["request_id"], "day": datetime.fromtimestamp(row["submitted_ms"] / 1000).astimezone().date().isoformat(),
                "subject": row["subject"], "name": row["name"], "minutes": round(row["minutes"], 4),
                "coins": row["coins"], "diamonds": row["diamonds"], "totalMinutes": round(row["total_minutes"], 4),
                "submittedAt": iso_ms(row["submitted_ms"]), "alreadyClaimed": already_claimed,
                "roundTickets": self._round_ticket_receipt(row["request_id"]),
                **self._bonus_breakdown(row["request_id"], row["coins"], row["diamonds"])}

    def submit_quest(self, subject, now=None, request_id=None):
        definition = self._quest_definition(subject)
        explicit_request = request_id is not None
        request_id = self._quest_request_id(request_id) if explicit_request else str(uuid.uuid4())
        with self._quest_transaction():
            current = quest_clock(now)
            existing = self.db.execute("SELECT * FROM quest_deliveries WHERE request_id=?", (request_id,)).fetchone()
            ticket_grants = []
            if existing is not None and existing["subject"] != subject:
                raise ValueError("同一个交付请求标识不能更改科目")
            if existing is None:
                row, contributions, minutes = self._quest_row(definition, current)
                if row["status"] != "ready":
                    # Python callers historically retried without an ID. HTTP
                    # always requires a stable UUID and never uses this fallback.
                    previous = self.db.execute("SELECT * FROM quest_deliveries WHERE subject=? ORDER BY submitted_ms DESC,rowid DESC LIMIT 1", (subject,)).fetchone()
                    if not explicit_request and minutes == 0 and previous:
                        result = self.quest_state(current)
                        result["receipt"] = self._delivery_receipt(previous, True)
                        return result
                    raise ValueError("首次交付需达到目标；之后有新增金币或已达标时段奖励即可交付")
                submitted_ms = int(current.timestamp() * 1000)
                track = self.db.execute("SELECT * FROM quest_tracks WHERE subject=?", (subject,)).fetchone()
                _, bonuses = self._quest_bonus(definition, track, contributions, current)
                base_reward = row["rewardBreakdown"]["base"] if row["baseReady"] else {"coins": 0, "diamonds": 0}
                if not row["baseReady"]:
                    minutes, contributions = 0, []
                total = round(track["settled_minutes"] + minutes, 8)
                reward = row["reward"]
                self.db.execute("INSERT INTO quest_deliveries VALUES (?,?,?,?,?,?,?,?,?)",
                    (request_id, subject, definition["name"], minutes, reward["coins"], reward["diamonds"], submitted_ms,
                     total, json.dumps(contributions, ensure_ascii=False, allow_nan=False)))
                self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                                (f"quest-continuous:{request_id}", base_reward["coins"], base_reward["diamonds"], submitted_ms))
                self.db.executemany("INSERT INTO quest_allocations VALUES (?,?,?,?,?,?)",
                    [(current.date().isoformat(), subject, item["record_id"], item["start_ms"], item["end_ms"], item["minutes"])
                     for item in contributions])
                self.db.execute("""UPDATE quest_tracks SET settled_minutes=?,paid_coins=paid_coins+?,
                    paid_diamonds=paid_diamonds+?,first_completed=MAX(first_completed,?) WHERE subject=?""",
                    (total, base_reward["coins"], base_reward["diamonds"], int(row["baseReady"]), subject))
                for bonus in bonuses:
                    self.db.execute("INSERT INTO quest_bonus_receipts VALUES (?,?,?,?,?,?,?,?)",
                        (bonus["day"], subject, request_id, bonus["minutes"], bonus["coins"], bonus["diamonds"], submitted_ms,
                         json.dumps(bonus["allocations"], ensure_ascii=False, allow_nan=False)))
                    self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                        (f"quest-bonus:{bonus['day']}:{subject}", bonus["coins"], bonus["diamonds"], submitted_ms))
                for day in sorted({bonus["day"] for bonus in bonuses}):
                    ticket_grants.extend(self._timed_lottery_tickets(day, current))
                if minutes > 0:
                    ticket_grants.extend(self._round_lottery_tickets(definition, track["settled_minutes"], total, request_id, current))
                if ticket_grants:
                    self._bump_revision()
            result = self.quest_state(current)
            receipt = existing or self.db.execute("SELECT * FROM quest_deliveries WHERE request_id=?", (request_id,)).fetchone()
            result["receipt"] = self._delivery_receipt(receipt, existing is not None)
            result["ticketGrants"] = ticket_grants
            return result

    def _shop_item(self, item_id):
        if not isinstance(item_id, str) or item_id not in SHOP_ITEMS:
            raise ValueError("商品不存在")
        return SHOP_ITEMS[item_id]

    def buy_item(self, item_id, now=None):
        item = self._shop_item(item_id)
        if item.get("lotteryOnly", False):
            raise ValueError("这是抽奖限定藏品，只能在对应抽奖机中获得")
        with self._quest_transaction():
            current = quest_clock(now)
            already_owned = (item["coins"] == 0 and item["diamonds"] == 0) or self.db.execute(
                "SELECT 1 FROM shop_purchases WHERE item_id=?", (item_id,)).fetchone() is not None
            if not already_owned:
                wallet = self._wallet()
                if wallet["coins"] < item["coins"] or wallet["diamonds"] < item["diamonds"]:
                    raise ValueError("金币或钻石不足，完成并提交委托后再来看看")
                purchased_ms = int(current.timestamp() * 1000)
                self.db.execute("INSERT INTO shop_purchases VALUES (?,?)", (item_id, purchased_ms))
                self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                                (f"purchase:{item_id}", -item["coins"], -item["diamonds"], purchased_ms))
            result = self.quest_state(current)
            result["receipt"] = {"itemId": item_id, "alreadyOwned": already_owned,
                                 "coins": 0 if already_owned else item["coins"],
                                 "diamonds": 0 if already_owned else item["diamonds"]}
            return result

    def equip_item(self, item_id, now=None):
        item = self._shop_item(item_id)
        with self._quest_transaction():
            current = quest_clock(now)
            owned = (item["coins"] == 0 and item["diamonds"] == 0) or self.db.execute(
                "SELECT 1 FROM shop_purchases WHERE item_id=?", (item_id,)).fetchone() is not None
            if not owned:
                raise ValueError("请先购买这件装扮")
            self.db.execute("INSERT INTO shop_equipment VALUES (?,?) ON CONFLICT(slot) DO UPDATE SET item_id=excluded.item_id",
                            (item["slot"], item_id))
            return self.quest_state(current)

    def city_life_state(self):
        """Small, explicitly requested personal notes; never part of study polling."""
        with self.lock:
            notes = [{"id": row["id"], "type": row["type"], "text": row["text"], "day": row["day"],
                      "done": bool(row["done"]), "archived": bool(row["archived"]),
                      "createdAt": iso_ms(row["created_ms"]), "updatedAt": iso_ms(row["updated_ms"])}
                     for row in self.db.execute("SELECT * FROM city_notes ORDER BY updated_ms DESC,rowid DESC")]
            outfits = [{"id": row["id"], "name": row["name"], "equipped": json.loads(row["equipped"]),
                        "archived": bool(row["archived"]), "createdAt": iso_ms(row["created_ms"]),
                        "updatedAt": iso_ms(row["updated_ms"])}
                       for row in self.db.execute("SELECT * FROM city_outfits ORDER BY updated_ms DESC,rowid DESC")]
            return {"notes": notes, "outfits": outfits, "limits": dict(CITY_LIFE_LIMITS),
                    "revision": self.db.execute("SELECT COUNT(*) FROM city_life_requests").fetchone()[0]}

    @staticmethod
    def _city_id(value):
        if not isinstance(value, str) or len(value) != 36:
            raise ValueError("城市记录和请求标识必须为 UUID 字符串")
        try:
            canonical = str(uuid.UUID(value))
        except (ValueError, AttributeError):
            raise ValueError("城市记录和请求标识必须为 UUID 字符串") from None
        if value.lower() != canonical:
            raise ValueError("城市记录和请求标识必须为 UUID 字符串")
        return canonical

    @staticmethod
    def _city_text(value, maximum, label):
        if not isinstance(value, str):
            raise ValueError(f"{label}请填写文字")
        value = value.strip()
        if not 1 <= len(value) <= maximum or any(
                (ord(char) < 32 and char not in "\n\r\t") or 0xd800 <= ord(char) <= 0xdfff for char in value):
            raise ValueError(f"{label}请填写 1 至 {maximum} 个字，不支持控制字符")
        return value

    def _city_payload(self, payload, required, optional=()):
        if not isinstance(payload, dict) or not set(required).issubset(payload) or set(payload) - (set(required) | set(optional)):
            raise ValueError("城市生活参数无效；请仅提供本次操作需要的内容")
        result = dict(payload)
        result["requestId"] = self._city_id(result["requestId"])
        for key in ("noteId", "outfitId"):
            if key in result:
                result[key] = self._city_id(result[key])
        for key in ("done", "archived"):
            if key in result and type(result[key]) is not bool:
                raise ValueError("完成和归档状态必须为布尔值")
        if "type" in result and (not isinstance(result["type"], str) or result["type"] not in CITY_NOTE_TYPES):
            raise ValueError("请选择便笺、待想清楚、摘句或明日行囊")
        if "text" in result:
            result["text"] = self._city_text(result["text"], 1000, "便笺")
        if "day" in result and result["day"] is not None:
            parse_day(result["day"])
        return result

    def _city_mutate(self, kind, payload, change, now=None, with_quests=False):
        request_id = payload["requestId"]
        # Preserve omitted dates in the signature: retrying tomorrow must return
        # the original plan rather than create another one with a new default day.
        signature = json.dumps({key: value for key, value in payload.items() if key != "requestId"},
                               sort_keys=True, ensure_ascii=False, allow_nan=False)
        with self._quest_transaction():
            current = quest_clock(now)
            existing = self.db.execute("SELECT * FROM city_life_requests WHERE request_id=?", (request_id,)).fetchone()
            if existing:
                if existing["kind"] != kind or existing["payload"] != signature:
                    raise ValueError("同一个保存请求不能改变内容；请刷新后重试")
                item_id = existing["item_id"]
            else:
                item_id = change(current)
                self.db.execute("INSERT INTO city_life_requests VALUES (?,?,?,?,?)",
                                (request_id, kind, signature, item_id, int(current.timestamp()*1000)))
            result = {"cityLife": self.city_life_state(), "receipt": {
                "requestId": request_id, "id": item_id, "kind": kind, "alreadyApplied": existing is not None}}
            if with_quests:
                result["quests"] = self.quest_state(current)
            return result

    def _city_capacity(self, table, active_limit, total_limit=None):
        # table names are internal constants, never supplied by the caller.
        count, active = self.db.execute(f"SELECT COUNT(*),COALESCE(SUM(archived=0),0) FROM {table}").fetchone()
        if active >= active_limit:
            raise ValueError(f"最多保留 {active_limit} 份未归档内容，请先归档一份")
        if total_limit is not None and count >= total_limit:
            raise ValueError(f"本地收藏已达到 {total_limit} 份存储上限，现有内容仍可查看和编辑")

    def city_life_note(self, payload, now=None):
        payload = self._city_payload(payload, ("type", "text", "requestId"), ("day",))
        def save(current):
            self._city_capacity("city_notes", CITY_LIFE_LIMITS["notes"], CITY_LIFE_LIMITS["storedNotes"])
            day = payload.get("day")
            if day is None and payload["type"] == "plan":
                day = (current.date()+timedelta(days=1)).isoformat()
            item_id, stamp = str(uuid.uuid4()), int(current.timestamp()*1000)
            self.db.execute("INSERT INTO city_notes VALUES (?,?,?,?,0,0,?,?)",
                            (item_id, payload["type"], payload["text"], day, stamp, stamp))
            return item_id
        return self._city_mutate("note", payload, save, now)

    def city_life_note_update(self, payload, now=None):
        payload = self._city_payload(payload, ("noteId", "requestId"), ("text", "type", "day", "done", "archived"))
        if len(payload) <= 2:
            raise ValueError("请提供要修改的便笺内容或状态")
        def update(current):
            row = self.db.execute("SELECT * FROM city_notes WHERE id=?", (payload["noteId"],)).fetchone()
            if row is None:
                raise ValueError("这份便笺不存在，请刷新书屋")
            archived = payload.get("archived", bool(row["archived"]))
            if row["archived"] and not archived:
                self._city_capacity("city_notes", CITY_LIFE_LIMITS["notes"])
            kind, day = payload.get("type", row["type"]), payload.get("day", row["day"])
            if kind == "plan" and day is None:
                day = (current.date()+timedelta(days=1)).isoformat()
            self.db.execute("UPDATE city_notes SET type=?,text=?,day=?,done=?,archived=?,updated_ms=? WHERE id=?",
                (kind, payload.get("text", row["text"]), day, payload.get("done", bool(row["done"])), archived,
                 int(current.timestamp()*1000), row["id"]))
            return row["id"]
        return self._city_mutate("note-update", payload, update, now)

    def _city_equipment(self, equipped):
        if not isinstance(equipped, dict) or not equipped or set(equipped) - set(SHOP_CATEGORIES):
            raise ValueError("请选择至少一种现有装扮分类")
        result = {}
        for slot, item_id in equipped.items():
            item = self._shop_item(item_id)
            if item["slot"] != slot:
                raise ValueError("装扮与所选分类不匹配")
            owned = not item["coins"] and not item["diamonds"] or self.db.execute(
                "SELECT 1 FROM shop_purchases WHERE item_id=?", (item_id,)).fetchone() is not None
            if not owned:
                raise ValueError("搭配只能使用已经拥有的装扮，请先购买")
            result[slot] = item_id
        return result

    def city_life_outfit(self, payload, now=None):
        payload = self._city_payload(payload, ("name", "equipped", "requestId"))
        payload["name"] = self._city_text(payload["name"], 30, "搭配名称")
        if not isinstance(payload["equipped"], dict):
            raise ValueError("搭配装扮应为分类与物品的对应表")
        def save(current):
            equipped = self._city_equipment(payload["equipped"])
            self._city_capacity("city_outfits", CITY_LIFE_LIMITS["outfits"], CITY_LIFE_LIMITS["storedOutfits"])
            item_id, stamp = str(uuid.uuid4()), int(current.timestamp()*1000)
            self.db.execute("INSERT INTO city_outfits VALUES (?,?,?,0,?,?)",
                            (item_id, payload["name"], json.dumps(equipped, sort_keys=True), stamp, stamp))
            return item_id
        return self._city_mutate("outfit", payload, save, now)

    def city_life_outfit_apply(self, payload, now=None):
        payload = self._city_payload(payload, ("outfitId", "requestId"))
        def apply(current):
            row = self.db.execute("SELECT * FROM city_outfits WHERE id=?", (payload["outfitId"],)).fetchone()
            if row is None or row["archived"]:
                raise ValueError("请先从收藏中恢复这套搭配")
            # Revalidate every slot before writing any: applying a collection
            # must never bypass ownership or partially equip an invalid outfit.
            equipped = self._city_equipment(json.loads(row["equipped"]))
            for slot, item_id in equipped.items():
                self.db.execute("INSERT INTO shop_equipment VALUES (?,?) ON CONFLICT(slot) DO UPDATE SET item_id=excluded.item_id",
                                (slot, item_id))
            return row["id"]
        return self._city_mutate("outfit-apply", payload, apply, now, with_quests=True)

    def city_life_outfit_archive(self, payload, now=None):
        payload = self._city_payload(payload, ("outfitId", "archived", "requestId"))
        def archive(current):
            row = self.db.execute("SELECT * FROM city_outfits WHERE id=?", (payload["outfitId"],)).fetchone()
            if row is None:
                raise ValueError("这套搭配不存在，请刷新小铺")
            if row["archived"] and not payload["archived"]:
                self._city_capacity("city_outfits", CITY_LIFE_LIMITS["outfits"])
            self.db.execute("UPDATE city_outfits SET archived=?,updated_ms=? WHERE id=?",
                            (payload["archived"], int(current.timestamp()*1000), row["id"]))
            return row["id"]
        return self._city_mutate("outfit-archive", payload, archive, now)

    def exchange_diamonds(self, diamonds, request_id, now=None):
        if type(diamonds) is not int or not 1 <= diamonds <= EXCHANGE_MAX_DIAMONDS:
            raise ValueError("兑换钻石数量必须为 1 至 1000 的整数")
        if not isinstance(request_id, str) or len(request_id) != 36:
            raise ValueError("兑换请求标识必须为 UUID 字符串")
        try:
            canonical_id = str(uuid.UUID(request_id))
        except (ValueError, AttributeError):
            raise ValueError("兑换请求标识必须为 UUID 字符串") from None
        if request_id.lower() != canonical_id:
            raise ValueError("兑换请求标识必须为 UUID 字符串")
        with self._quest_transaction():
            current = quest_clock(now)
            if self.db.execute("SELECT 1 FROM shop_reverse_exchanges WHERE request_id=?", (canonical_id,)).fetchone():
                raise ValueError("同一个兑换请求标识不能改变兑换方向")
            existing = self.db.execute("SELECT * FROM shop_exchanges WHERE request_id=?", (canonical_id,)).fetchone()
            if existing is not None:
                if existing["diamonds"] != diamonds:
                    raise ValueError("同一个兑换请求标识不能更改钻石数量")
                coins, created_ms = existing["coins"], existing["created_ms"]
            else:
                coins = diamonds * EXCHANGE_COINS_PER_DIAMOND
                if self._wallet()["coins"] < coins:
                    raise ValueError("金币不足，无法完成这次兑换")
                created_ms = int(current.timestamp() * 1000)
                self.db.execute("INSERT INTO shop_exchanges VALUES (?,?,?,?)", (canonical_id, diamonds, coins, created_ms))
                self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                                (f"exchange:{canonical_id}", -coins, diamonds, created_ms))
            result = self.quest_state(current)
            result["receipt"] = {"requestId": canonical_id, "diamonds": diamonds, "coins": coins,
                                 "createdAt": iso_ms(created_ms), "alreadyExchanged": existing is not None,
                                 "direction": "coins-to-diamonds"}
            return result

    def exchange_coins(self, request_id, now=None):
        request_id = self._action_uuid(request_id)
        with self._quest_transaction():
            current = quest_clock(now)
            if self.db.execute("SELECT 1 FROM shop_exchanges WHERE request_id=?", (request_id,)).fetchone():
                raise ValueError("同一个兑换请求标识不能改变兑换方向")
            existing = self.db.execute("SELECT * FROM shop_reverse_exchanges WHERE request_id=?", (request_id,)).fetchone()
            if existing:
                created_ms = existing["created_ms"]
            else:
                day = current.date().isoformat()
                used = self.db.execute("SELECT COUNT(*) FROM shop_reverse_exchanges WHERE day=?", (day,)).fetchone()[0]
                if used >= REVERSE_EXCHANGE_DAILY_LIMIT:
                    raise ValueError("今天已完成 5 次钻石兑换金币，明天再来吧")
                if self._wallet()["diamonds"] < 1:
                    raise ValueError("需要 1 颗钻石才能兑换金币")
                created_ms = int(current.timestamp()*1000)
                self.db.execute("INSERT INTO shop_reverse_exchanges VALUES (?,?,?)", (request_id, day, created_ms))
                self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)", (f"exchange-reverse:{request_id}", EXCHANGE_COINS_PER_DIAMOND, -1, created_ms))
            return dict(self.quest_state(current), receipt={"requestId": request_id, "coins": EXCHANGE_COINS_PER_DIAMOND,
                "diamonds": 1, "direction": "diamonds-to-coins", "createdAt": iso_ms(created_ms), "alreadyExchanged": bool(existing)})

    def _meta(self, key):
        item = self.db.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return item[0] if item else None

    def _set_meta(self, key, value):
        self.db.execute("INSERT INTO meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))

    def _bump_revision(self):
        self.revision = int(self._meta("revision") or 0) + 1
        self._set_meta("revision", self.revision)

    def _opening_state(self, current):
        day = current.date().isoformat()
        row = self.db.execute("""SELECT COALESCE(SUM(r.minutes),0) AS minutes,
            EXISTS(SELECT 1 FROM daily_openings WHERE day=?) AS seen
            FROM records r WHERE r.day=? AND NOT EXISTS
                (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)""",
            (day, day)).fetchone()
        return {"day": day, "now": current.isoformat(), "minutes": round(row["minutes"], 4),
                "target": self._daily_goal(day, current)["total"], "seen": bool(row["seen"])}

    def opening(self, now=None):
        """Read today's greeting context without consuming its first opening."""
        with self.lock:
            current = now or datetime.now().astimezone()
            if current.tzinfo is None or current.utcoffset() is None:
                raise ValueError("开场时间必须包含时区")
            return self._opening_state(current)

    def claim_opening(self, now=None):
        """Atomically show one daily opening, independently of record revision."""
        with self.lock, self.db:
            current = now or datetime.now().astimezone()
            if current.tzinfo is None or current.utcoffset() is None:
                raise ValueError("开场时间必须包含时区")
            claimed = self.db.execute("INSERT OR IGNORE INTO daily_openings(day,shown_at) VALUES (?,?)",
                                      (current.date().isoformat(), current.isoformat())).rowcount == 1
            return dict(self._opening_state(current), show=claimed)

    def _active_count(self, source=None):
        sql = """SELECT COUNT(*) FROM records r WHERE NOT EXISTS
                 (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)"""
        if source:
            sql += " AND EXISTS (SELECT 1 FROM record_aliases a WHERE a.record_id=r.id AND a.source=?)"
        return self.db.execute(sql, (source,) if source else ()).fetchone()[0]

    def _history_canonical_id(self, record_id):
        if not isinstance(record_id, str) or not record_id or len(record_id) > 5000:
            raise ValueError("历史匹配记录标识无效")
        visited = set()
        while record_id not in visited:
            visited.add(record_id)
            redirect = self.db.execute("SELECT canonical_id FROM record_merges WHERE removed_id=?", (record_id,)).fetchone()
            if not redirect:
                break
            record_id = redirect[0]
        if not self.db.execute("SELECT 1 FROM records WHERE id=?", (record_id,)).fetchone():
            raise ValueError("历史匹配指向不存在的记录")
        return record_id

    def _history_redirect(self, removed_id, survivor_id):
        self.db.execute("""INSERT OR IGNORE INTO history_links(source_key,record_id)
            SELECT source_key,? FROM history_links WHERE record_id=?""", (survivor_id, removed_id))
        self.db.execute("DELETE FROM history_links WHERE record_id=?", (removed_id,))
        removed = self.db.execute("SELECT * FROM history_overrides WHERE record_id=?", (removed_id,)).fetchone()
        if removed:
            self.db.execute("INSERT OR IGNORE INTO history_overrides VALUES (?,?,?,?,?,?)",
                            (survivor_id,) + tuple(removed[field] for field in HISTORY_FIELDS))
            self.db.execute("DELETE FROM history_overrides WHERE record_id=?", (removed_id,))

    def _history_overlay(self, record):
        override = self.db.execute("SELECT * FROM history_overrides WHERE record_id=?", (record[0],)).fetchone()
        if not override:
            return record
        existing = self.db.execute("SELECT * FROM records WHERE id=?", (record[0],)).fetchone()
        # Keep provenance stable; aliases retain each live source's true keys.
        source_id, source = (existing["source_id"], existing["source"]) if existing else (record[1], record[7])
        return (record[0], source_id, override["name"], override["minutes"],
                override["start_ms"], override["end_ms"], override["day"], source)

    def _set_history_override(self, record_id, fields):
        values = tuple(fields[field] for field in HISTORY_FIELDS)
        self.db.execute("""INSERT INTO history_overrides VALUES (?,?,?,?,?,?)
            ON CONFLICT(record_id) DO UPDATE SET name=excluded.name,minutes=excluded.minutes,
            start_ms=excluded.start_ms,end_ms=excluded.end_ms,day=excluded.day""", (record_id,) + values)
        self.db.execute("UPDATE records SET name=?,minutes=?,start_ms=?,end_ms=?,day=? WHERE id=?", values + (record_id,))

    def _history_has_allocations(self, record_ids):
        record_ids = set(record_ids)
        for row in self.db.execute("SELECT record_id FROM quest_allocations UNION SELECT record_id FROM mystery_allocations"):
            try:
                if self._history_canonical_id(row[0]) in record_ids:
                    return True
            except ValueError:
                # An orphaned allocation cannot safely establish a new match.
                if row[0] in record_ids:
                    return True
        return False

    def _merge_history_records(self, record_ids, authority=None, *, preserve_override=True):
        """Merge reviewed copies, retaining the oldest identity and all tombstones."""
        ids = sorted({self._history_canonical_id(record_id) for record_id in record_ids})
        if len(ids) == 1:
            return ids[0], 0
        if self._history_has_allocations(ids):
            raise ValueError("待合并记录已有委托结算分配，不能自动合并")
        marks = ",".join("?" for _ in ids)
        rows = self.db.execute(f"SELECT rowid AS arrival_order,* FROM records WHERE id IN ({marks}) ORDER BY rowid", ids).fetchall()
        lifecycle = self.db.execute(f"SELECT * FROM record_lifecycle WHERE record_id IN ({marks})", ids).fetchall()
        manual = [row for row in lifecycle if row["manual_action"] in ("delete", "keep")]
        if len({row["manual_action"] for row in manual}) > 1:
            raise ValueError("待合并记录存在人工删除与保留冲突")
        deleted = [row for row in lifecycle if row["deleted_at"] is not None]
        if deleted and any(row["manual_action"] == "keep" for row in manual):
            raise ValueError("待合并记录的删除状态与人工保留冲突")
        survivor = rows[0]
        if authority is None:
            authority = dict(survivor)
        old_overrides = self.db.execute(f"SELECT * FROM history_overrides WHERE record_id IN ({marks})", ids).fetchall()
        journal = json.dumps({"records": [dict(row) for row in rows], "lifecycle": [dict(row) for row in lifecycle],
                              "history_overrides": [dict(row) for row in old_overrides]}, ensure_ascii=False, allow_nan=False)
        for removed in rows[1:]:
            self.db.execute("INSERT INTO record_merges VALUES (?,?,?,?)", (removed["id"], survivor["id"], now_iso(), journal))
            self.db.execute("UPDATE record_aliases SET record_id=? WHERE record_id=?", (survivor["id"], removed["id"]))
            self._history_redirect(removed["id"], survivor["id"])
            self.db.execute("DELETE FROM records WHERE id=?", (removed["id"],))
        self.db.execute(f"DELETE FROM record_lifecycle WHERE record_id IN ({marks})", ids)
        if deleted:
            selected = next((row for row in deleted if row["manual_action"] == "delete"), deleted[0])
            self.db.execute("INSERT INTO record_lifecycle VALUES (?,?,?,?)",
                            (survivor["id"], selected["deleted_at"], selected["reason"], selected["manual_action"]))
        elif manual:
            self.db.execute("INSERT INTO record_lifecycle VALUES (?,NULL,NULL,?)", (survivor["id"], manual[0]["manual_action"]))
        if preserve_override:
            self._set_history_override(survivor["id"], authority)
        else:
            self.db.execute("UPDATE records SET name=?,minutes=?,start_ms=?,end_ms=?,day=? WHERE id=?",
                            tuple(authority[field] for field in HISTORY_FIELDS) + (survivor["id"],))
        return survivor["id"], len(rows) - 1

    @staticmethod
    def _validated_history_rows(records):
        if not isinstance(records, (list, tuple)) or len(records) > 100_000:
            raise ValueError("历史记录列表无效")
        normalized, keys = [], set()
        for row in records:
            if not isinstance(row, dict):
                raise ValueError("历史记录字段无效")
            name, key = row.get("name"), row.get("source_key")
            if not isinstance(name, str) or not name.strip() or len(name) > 500:
                raise ValueError("历史任务名称无效")
            if not isinstance(key, str) or not key or len(key) > 5000 or key in keys:
                raise ValueError("历史记录 source_key 无效或重复")
            minutes = finite_number(row.get("minutes"), minimum=0, maximum=525600)
            if minutes <= 0:
                raise ValueError("历史学习分钟必须大于零")
            times = {}
            for field in ("start_ms", "end_ms"):
                value = finite_number(row.get(field), minimum=1, maximum=32503680000000)
                if int(value) != value:
                    raise ValueError("历史时间必须为整数毫秒")
                times[field] = int(value)
                iso_ms(times[field])
            if times["end_ms"] < times["start_ms"]:
                raise ValueError("历史结束时间不能早于开始时间")
            day = parse_day(row.get("day")).isoformat()
            normalized.append(dict(source_key=key, name=name.strip(), minutes=float(minutes), day=day, **times))
            keys.add(key)
        return normalized

    def import_history(self, records, resolutions, batch_id, filename, prefer_history=False):
        """Import a reviewed, normalized spreadsheet batch without reading it.

        Exact history links take precedence over resolutions and conservative
        mutually-unique minute-bucket matches. Evidence attached to an existing
        live record is deliberately not an additional source-presence vote.
        """
        rows = self._validated_history_rows(records)
        if not isinstance(resolutions, dict) or set(resolutions) - {row["source_key"] for row in rows}:
            raise ValueError("历史匹配清单无效")
        for key, ids in resolutions.items():
            if not isinstance(ids, (list, tuple)) or not ids or any(not isinstance(value, str) or not value for value in ids):
                raise ValueError("历史匹配必须列出有效记录标识")
        if type(prefer_history) is not bool:
            raise ValueError("历史优先策略必须为布尔值")
        if not isinstance(batch_id, str) or not batch_id or len(batch_id) > 500:
            raise ValueError("历史批次标识无效")
        if not isinstance(filename, str) or not filename or len(filename) > 1000:
            raise ValueError("历史文件名无效")
        payload = {"records": sorted(rows, key=lambda row: row["source_key"]),
                   "resolutions": {key: sorted(set(ids)) for key, ids in sorted(resolutions.items())},
                   "filename": filename, "prefer_history": prefer_history}
        digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
        with self._quest_transaction():
            previous = self.db.execute("SELECT * FROM history_batches WHERE batch_id=?", (batch_id,)).fetchone()
            if previous:
                if previous["input_hash"] != digest:
                    raise ValueError("同一历史批次不能更改导入内容或策略")
                return dict(json.loads(previous["receipt"]), alreadyImported=True)
            before_minutes = self.db.execute("""SELECT COALESCE(SUM(r.minutes),0) FROM records r WHERE NOT EXISTS
                (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)""").fetchone()[0]
            existing = [dict(row) for row in self.db.execute("SELECT * FROM records")]
            bucket_index = {}
            for item in existing:
                bucket_index.setdefault((item["name"], item["start_ms"] // 60000, item["end_ms"] // 60000), []).append(item["id"])
            targets, used, unassigned = {}, {}, []
            for row in rows:
                key = row["source_key"]
                linked = [item[0] for item in self.db.execute("SELECT record_id FROM history_links WHERE source_key=?", (key,))]
                selected = sorted({self._history_canonical_id(value) for value in (linked or resolutions.get(key, []))})
                if linked and key in resolutions and set(selected) != {self._history_canonical_id(value) for value in resolutions[key]}:
                    raise ValueError("已导入历史的匹配关系与新清单冲突")
                if selected:
                    targets[key] = selected
                    for record_id in selected:
                        if record_id in used and used[record_id] != key:
                            raise ValueError("多条历史记录匹配到同一旧记录，请先核对")
                        used[record_id] = key
                else:
                    unassigned.append(row)
            candidates, reverse = {}, {}
            for row in unassigned:
                key = row["source_key"]
                matches = bucket_index.get((row["name"], row["start_ms"] // 60000, row["end_ms"] // 60000), [])
                candidates[key] = matches
                for record_id in matches:
                    reverse.setdefault(record_id, []).append(key)
            for row in unassigned:
                key, matches = row["source_key"], candidates[row["source_key"]]
                if matches and (len(matches) != 1 or len(reverse[matches[0]]) != 1 or matches[0] in used):
                    raise ValueError("历史自动匹配存在歧义，请提供明确匹配清单")
                targets[key] = matches
                if matches:
                    used[matches[0]] = key
            receipt = {"batchId": batch_id, "filename": filename, "preferHistory": prefer_history,
                       "rows": len(rows), "added": 0, "matched": 0, "revised": 0, "merged": 0,
                       "ignoredDeleted": 0, "alreadyImported": False, "beforeMinutes": round(before_minutes, 8)}
            for row in rows:
                key, ids = row["source_key"], targets[row["source_key"]]
                self.db.execute("""INSERT INTO history_rows VALUES (?,?,?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET
                    name=excluded.name,minutes=excluded.minutes,start_ms=excluded.start_ms,end_ms=excluded.end_ms,
                    day=excluded.day,last_batch=excluded.last_batch""",
                    (key,) + tuple(row[field] for field in HISTORY_FIELDS) + (batch_id,))
                if not ids:
                    identity = HISTORY_SOURCE + ":" + hashlib.sha256(key.encode()).hexdigest()
                    record_id = f"{identity}:{row['start_ms']}"
                    self._upsert_record((record_id, identity, row["name"], row["minutes"], row["start_ms"], row["end_ms"], row["day"], HISTORY_SOURCE))
                    ids = [record_id]
                    receipt["added"] += 1
                else:
                    receipt["matched"] += 1
                    marks = ",".join("?" for _ in ids)
                    deleted = self.db.execute(f"SELECT 1 FROM record_lifecycle WHERE record_id IN ({marks}) AND deleted_at IS NOT NULL LIMIT 1", ids).fetchone()
                    if deleted:
                        receipt["ignoredDeleted"] += 1
                    elif prefer_history:
                        originals = self.db.execute(f"SELECT rowid AS arrival_order,* FROM records WHERE id IN ({marks}) ORDER BY rowid", ids).fetchall()
                        fields = dict(row)
                        # Preserve sub-minute precision only when a single old
                        # session is in exactly the spreadsheet's minute bucket.
                        if len(originals) == 1:
                            for field in ("start_ms", "end_ms"):
                                if originals[0][field] // 60000 == row[field] // 60000:
                                    fields[field] = originals[0][field]
                        changed = len(originals) > 1 or any(originals[0][field] != fields[field] for field in HISTORY_FIELDS)
                        if len(ids) > 1:
                            survivor, merged = self._merge_history_records(ids, fields)
                            ids = [survivor]
                            receipt["merged"] += merged
                        else:
                            self._set_history_override(ids[0], fields)
                        receipt["revised"] += int(changed)
                for record_id in ids:
                    self.db.execute("INSERT OR IGNORE INTO history_links VALUES (?,?)", (key, record_id))
            after_minutes = self.db.execute("""SELECT COALESCE(SUM(r.minutes),0) FROM records r WHERE NOT EXISTS
                (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)""").fetchone()[0]
            receipt.update(afterMinutes=round(after_minutes, 8), minuteDelta=round(after_minutes - before_minutes, 8), importedAt=now_iso())
            self.db.execute("INSERT INTO history_batches VALUES (?,?,?,?,?,?)",
                            (batch_id, filename, digest, receipt["importedAt"], int(prefer_history), json.dumps(receipt, ensure_ascii=False, allow_nan=False)))
            self._bump_revision()
            return receipt

    def _reconcile_history_sources(self):
        """Join new live echoes only when history-minute candidates are unique."""
        # Keep live timestamps bare so records_match(source,name,start_ms)
        # supports range probes instead of a full records x history scan.
        pairs = {tuple(row) for row in self.db.execute("""SELECT DISTINCT l.record_id,r.id
            FROM history_rows h JOIN history_links l USING(source_key)
            JOIN records r INDEXED BY records_match ON r.source IN ('tomatodo','calendar') AND r.name=h.name
                AND r.start_ms BETWEEN (h.start_ms/60000)*60000 AND (h.start_ms/60000)*60000+59999
                AND r.end_ms BETWEEN (h.end_ms/60000)*60000 AND (h.end_ms/60000)*60000+59999
            WHERE r.id<>l.record_id AND (r.source='calendar' OR ABS(r.minutes-h.minutes)<=0.00000001)
                AND NOT EXISTS (SELECT 1 FROM history_links already WHERE already.record_id=r.id)
                AND NOT EXISTS (SELECT 1 FROM history_links other
                                WHERE other.source_key=h.source_key AND other.record_id<>l.record_id)""")}
        candidates = {}
        for old, incoming in pairs:
            candidates.setdefault(old, set()).add(incoming)
            candidates.setdefault(incoming, set()).add(old)
        changed = 0
        for old, incoming in sorted(pairs):
            if len(candidates[old]) != 1 or len(candidates[incoming]) != 1:
                continue
            original = self.db.execute("SELECT * FROM records WHERE id=?", (old,)).fetchone()
            if not original or not self.db.execute("SELECT 1 FROM records WHERE id=?", (incoming,)).fetchone():
                continue
            override = self.db.execute("SELECT 1 FROM history_overrides WHERE record_id=?", (old,)).fetchone()
            try:
                survivor, count = self._merge_history_records([old, incoming], dict(original),
                    preserve_override=original["source"] == HISTORY_SOURCE or bool(override))
                # A history-only archive needs a durable presence vote. Once
                # a live source confirms the same session, its aliases take
                # over deletion tracking, including later desktop/phone trash.
                self.db.execute("""UPDATE source_presence SET active=0,missing_count=0
                    WHERE source=? AND source_key IN
                        (SELECT source_key FROM record_aliases WHERE source=? AND record_id=?)""",
                    (HISTORY_SOURCE, HISTORY_SOURCE, survivor))
                changed += count
            except ValueError:
                # Conflicting explicit lifecycle choices or settled intervals
                # remain separate for a reviewed resolution, never a guess.
                continue
        return changed

    def _reset_missing(self, source):
        self.db.execute("UPDATE source_presence SET missing_count=0 WHERE source=? AND missing_count<>0", (source,))

    def _observe_source(self, source, seen, token, eligible=lambda row: True):
        """Two healthy observations confirm absence; each source has its own vote."""
        rows = self.db.execute("""SELECT a.source_key,a.record_id,r.name,r.start_ms,r.end_ms,
                p.active,p.missing_count,p.last_snapshot FROM record_aliases a
                JOIN records r ON r.id=a.record_id
                JOIN source_presence p ON p.source=a.source AND p.source_key=a.source_key
                WHERE a.source=?""", (source,)).fetchall()
        for row in rows:
            # Calendar timestamps are monotonically increasing; rereading the
            # same cached file or an older replay is not a new observation.
            if row["last_snapshot"] == token or (source == "calendar" and row["last_snapshot"] is not None
                                                  and int(token) <= int(row["last_snapshot"])):
                continue
            if row["source_key"] in seen:
                self.db.execute("""UPDATE source_presence SET active=1,missing_count=0,last_snapshot=?
                                   WHERE source=? AND source_key=?""", (token, source, row["source_key"]))
            elif eligible(row):
                missing = min(2, row["missing_count"] + 1)
                self.db.execute("""UPDATE source_presence SET active=?,missing_count=?,last_snapshot=?
                                   WHERE source=? AND source_key=?""",
                                (0 if missing >= 2 else row["active"], missing, token, source, row["source_key"]))
            else:
                self.db.execute("""UPDATE source_presence SET missing_count=0,last_snapshot=?
                                   WHERE source=? AND source_key=?""", (token, source, row["source_key"]))
        changed = 0
        rows = self.db.execute("""SELECT r.id,l.deleted_at,l.manual_action,
                EXISTS(SELECT 1 FROM record_aliases a JOIN source_presence p
                  ON a.source=p.source AND a.source_key=p.source_key
                  WHERE a.record_id=r.id AND p.active=1) AS source_active
                FROM records r LEFT JOIN record_lifecycle l ON l.record_id=r.id""").fetchall()
        for row in rows:
            if row["manual_action"] in ("delete", "keep"):
                continue
            deleted = not row["source_active"]
            if deleted != bool(row["deleted_at"]):
                self.db.execute("""INSERT INTO record_lifecycle VALUES (?,?,?,NULL)
                    ON CONFLICT(record_id) DO UPDATE SET deleted_at=excluded.deleted_at,reason=excluded.reason""",
                    (row["id"], now_iso() if deleted else None, "source_missing" if deleted else None))
                changed += 1
        return changed

    def close(self):
        with self.lock:
            self.db.close()

    def _read_source(self):
        last_error = None
        for attempt in range(3):
            try:
                before = self.source.stat()
                with self.source.open("r", encoding="utf-8-sig") as handle:
                    document = json.load(handle, parse_constant=lambda value: (_ for _ in ()).throw(ValueError("JSON 数字无效")))
                after = self.source.stat()
                if (before.st_mtime_ns, before.st_size) != (after.st_mtime_ns, after.st_size):
                    raise ValueError("源文件正在更新，请稍后重试")
                if not isinstance(document, dict) or not isinstance(document.get("PCRecord"), list):
                    raise ValueError("未找到番茄 ToDo 的 PCRecord 记录数组")
                templates = document.get("PCToDo", [])
                if isinstance(templates, list):
                    self.source_task_names = {item["name"].strip() for item in templates
                                              if isinstance(item, dict) and isinstance(item.get("name"), str)
                                              and 0 < len(item["name"].strip()) <= 500}
                return document["PCRecord"]
            except (OSError, ValueError, UnicodeError) as error:
                last_error = error
                if attempt < 2:
                    time.sleep(0.03)
        raise last_error

    def _upsert_record(self, record):
        """Update exact source identities; fuzzy matching happens after the batch."""
        source, source_key = record[7], record[1] if record[7] == "calendar" else record[0]
        alias = self.db.execute("SELECT record_id FROM record_aliases WHERE source=? AND source_key=?",
                                (source, source_key)).fetchone()
        record_id = alias[0] if alias else record[0]
        previous = self.db.execute("SELECT * FROM records WHERE id=?", (record_id,)).fetchone()
        self.db.execute("INSERT OR IGNORE INTO record_aliases VALUES (?,?,?)", (source, source_key, record_id))
        self.db.execute("INSERT OR IGNORE INTO source_presence(source,source_key) VALUES (?,?)", (source, source_key))
        # A matching desktop record includes Tomato's measured focus minutes,
        # which are more authoritative than a calendar event's elapsed span.
        if previous is not None and source == "calendar" and previous["source"] in ("tomatodo", HISTORY_SOURCE):
            return 0
        record = self._history_overlay((record_id,) + record[1:])
        if previous is not None and tuple(previous) == record:
            return 0
        self.db.execute("""INSERT INTO records VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id,
            name=excluded.name, minutes=excluded.minutes, start_ms=excluded.start_ms,
            end_ms=excluded.end_ms, day=excluded.day, source=excluded.source""", record)
        return 1

    def _upsert_records(self, records):
        # Compare the committed result, not intermediate inserts, so a calendar
        # echo is neither a new reward nor a revision on every repeated poll.
        query = """SELECT r.*,l.deleted_at,l.reason,l.manual_action FROM records r
                   LEFT JOIN record_lifecycle l ON l.record_id=r.id"""
        before = {row[0]: tuple(row) for row in self.db.execute(query)}
        for record in records:
            self._upsert_record(record)
        self._reconcile_sources()
        self._reconcile_history_sources()
        after = {row[0]: tuple(row) for row in self.db.execute(query)}
        return sum(before.get(key) != after.get(key) for key in before.keys() | after.keys())

    def _reconcile_sources(self):
        """Match only mutually unique cross-source sessions, preserving first ID.

        Calendar elapsed seconds are not measured focus minutes: pauses and
        Tomato's whole-minute precision make duration equality inappropriate.
        Both endpoints must still agree within five seconds and overlap.
        Build all candidates before merging to avoid order-dependent guesses.
        """
        pairs = self.db.execute("""SELECT d.id AS desktop_id,c.id AS calendar_id
            FROM records d JOIN records c ON c.source='calendar' AND c.name=d.name
                AND c.start_ms BETWEEN d.start_ms-5000 AND d.start_ms+5000
                AND ABS(c.end_ms-d.end_ms)<=5000
                AND MAX(c.start_ms,d.start_ms)<MIN(c.end_ms,d.end_ms)
            WHERE d.source='tomatodo'
                AND NOT EXISTS (SELECT 1 FROM record_aliases a
                    WHERE a.record_id=d.id AND a.source='calendar')
                AND NOT EXISTS (SELECT 1 FROM record_aliases a
                    WHERE a.record_id=c.id AND a.source='tomatodo')""").fetchall()
        candidates = {}
        for pair in pairs:
            desktop_id, calendar_id = pair
            candidates.setdefault(desktop_id, []).append(calendar_id)
            candidates.setdefault(calendar_id, []).append(desktop_id)
        merged = 0
        for desktop_id, calendar_id in pairs:
            if len(candidates[desktop_id]) != 1 or len(candidates[calendar_id]) != 1:
                continue
            rows = self.db.execute("SELECT rowid AS arrival_order,* FROM records WHERE id IN (?,?) ORDER BY rowid",
                                   (desktop_id, calendar_id)).fetchall()
            lifecycle = self.db.execute("SELECT * FROM record_lifecycle WHERE record_id IN (?,?)",
                                        (desktop_id, calendar_id)).fetchall()
            manual = [row for row in lifecycle if row['manual_action'] in ('delete', 'keep')]
            if len({row['manual_action'] for row in manual}) > 1:
                # Conflicting explicit actions need a human choice, not a guess.
                continue
            overrides = self.db.execute("SELECT * FROM history_overrides WHERE record_id IN (?,?)",
                                        (desktop_id, calendar_id)).fetchall()
            if len({tuple(row[field] for field in HISTORY_FIELDS) for row in overrides}) > 1:
                continue
            survivor, removed = rows
            desktop = next(row for row in rows if row['source'] == 'tomatodo')
            journal = json.dumps({'records': [dict(row) for row in rows],
                                  'lifecycle': [dict(row) for row in lifecycle]}, ensure_ascii=False)
            self.db.execute("INSERT INTO record_merges VALUES (?,?,?,?)",
                            (removed['id'], survivor['id'], now_iso(), journal))
            self.db.execute("UPDATE record_aliases SET record_id=? WHERE record_id=?",
                            (survivor['id'], removed['id']))
            self._history_redirect(removed['id'], survivor['id'])
            # Keep source_presence unchanged: each source retains its own
            # confirmed presence/absence and last-observed snapshot.
            active = self.db.execute("""SELECT 1 FROM record_aliases a JOIN source_presence p
                ON a.source=p.source AND a.source_key=p.source_key
                WHERE a.record_id=? AND p.active=1 LIMIT 1""", (survivor['id'],)).fetchone()
            if manual:
                deleted_at, reason, action = (manual[0][key] for key in ('deleted_at', 'reason', 'manual_action'))
            else:
                deleted_at = None if active else next((row['deleted_at'] for row in lifecycle if row['deleted_at']), now_iso())
                reason, action = ('source_missing' if deleted_at else None), None
            self.db.execute("DELETE FROM record_lifecycle WHERE record_id IN (?,?)", (desktop_id, calendar_id))
            self.db.execute("INSERT INTO record_lifecycle VALUES (?,?,?,?)", (survivor['id'], deleted_at, reason, action))
            self.db.execute("UPDATE records SET source_id=?,name=?,minutes=?,start_ms=?,end_ms=?,day=?,source=? WHERE id=?",
                            tuple(desktop[key] for key in ('source_id', 'name', 'minutes', 'start_ms', 'end_ms', 'day', 'source'))
                            + (survivor['id'],))
            self.db.execute("DELETE FROM records WHERE id=?", (removed['id'],))
            override = self.db.execute("SELECT * FROM history_overrides WHERE record_id=?", (survivor['id'],)).fetchone()
            if override:
                self._set_history_override(survivor['id'], override)
            merged += 1
        return merged

    def import_source(self):
        with self.lock:
            self.sync["lastCheck"] = now_iso()
            try:
                source_records = self._read_source()
                records = [normalized for item in source_records if (normalized := normalize_record(item))]
                changed = 0
                with self.db:
                    changed += self._upsert_records(records)
                    # Zero-minute/incomplete source rows still prove presence.
                    # Any unidentifiable row makes absence detection unsafe.
                    seen = set()
                    healthy = True
                    for item in source_records:
                        try:
                            rid = item["id"]
                            if isinstance(rid, bool) or not isinstance(rid, (str, int)) or not str(rid):
                                raise ValueError("记录标识无效")
                            start = int(finite_number(item["startDate"], minimum=1, maximum=32503680000000))
                            finite_number(item["createDate"], minimum=1, maximum=32503680000000)
                            finite_number(item["time"], minimum=0, maximum=1440 * 365)
                            if (not isinstance(item["name"], str) or not item["name"].strip()
                                    or type(item["isComplete"]) is not int or item["isComplete"] not in (0, 1)):
                                raise ValueError("记录字段无效")
                            seen.add(f"{rid}:{start}")
                        except (KeyError, TypeError, ValueError, OverflowError):
                            healthy = False
                    if healthy:
                        changed += self._observe_source("tomatodo", seen, str(uuid.uuid4()))
                    else:
                        self._reset_missing("tomatodo")
                    if changed:
                        self.sync["lastImport"] = now_iso()
                        self._set_meta("lastImport", self.sync["lastImport"])
                        self._bump_revision()
                self.sync.update(connected=True, error=None, importedCount=self._active_count())
                return changed
            except (OSError, ValueError, UnicodeError, sqlite3.Error) as error:
                with self.db:
                    self._reset_missing("tomatodo")
                if isinstance(error, FileNotFoundError):
                    message = "暂时找不到番茄 ToDo 本地记录；已保存的学习记录仍然保留。"
                elif isinstance(error, PermissionError):
                    message = "暂时无法读取番茄 ToDo 本地记录，请检查文件读取权限。"
                else:
                    message = f"暂时无法读取记录，将自动重试：{error}"
                self.sync.update(connected=False, error=message)
                return 0

    @staticmethod
    def _read_bridge_json(path):
        if path.stat().st_size > 20_000_000:
            raise ValueError("日历同步文件过大")
        with path.open("r", encoding="utf-8") as handle:
            value = json.load(handle, parse_constant=lambda value: (_ for _ in ()).throw(ValueError("JSON 数字无效")))
        if not isinstance(value, dict) or type(value.get("schemaVersion")) is not int or value["schemaVersion"] != 1:
            raise ValueError("日历同步文件版本无效")
        return value

    def _refresh_calendar_titles(self, config):
        titles = config.get("allowedTitles")
        if not isinstance(titles, list) or len(titles) > 5000 or any(
                not isinstance(title, str) or not title.strip() or len(title) > 500 for title in titles):
            raise ValueError("日历任务名称列表无效")
        allowed = set(titles) | self.source_task_names | {
            row[0] for row in self.db.execute("SELECT DISTINCT name FROM records") if 0 < len(row[0]) <= 500}
        if len(allowed) > 5000:
            raise ValueError("日历任务名称数量过多")
        if allowed != set(titles):
            # Replace atomically so the native collector cannot see half a JSON.
            # Preserve selected calendar, enable switch and any helper options.
            latest = self._read_bridge_json(self.calendar_config)
            if latest == config:
                config = dict(config, allowedTitles=sorted(allowed))
                descriptor, temporary = tempfile.mkstemp(prefix=".calendar-config-", dir=self.data_dir)
                try:
                    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                        json.dump(config, handle, ensure_ascii=False, allow_nan=False)
                    os.replace(temporary, self.calendar_config)
                finally:
                    if os.path.exists(temporary):
                        os.unlink(temporary)
        return allowed

    def import_calendar(self, now=None):
        with self.lock:
            self.calendar_sync["lastCheck"] = now_iso()
            self.calendar_sync.update(pendingCount=0, pendingRecords=[])
            self.calendar_sync["importedCount"] = self._active_count("calendar")
            if not self.calendar_config.exists():
                with self.db:
                    self._reset_missing("calendar")
                self.calendar_sync.update(enabled=False, connected=False, error=None, calendarName=None)
                return 0
            try:
                config = self._read_bridge_json(self.calendar_config)
                if type(config.get("enabled")) is not bool:
                    raise ValueError("日历同步开关无效")
                self.calendar_sync["enabled"] = config["enabled"]
                if not config["enabled"]:
                    with self.db:
                        self._reset_missing("calendar")
                    self.calendar_sync.update(connected=False, error=None)
                    return 0
                calendar_id = config.get("calendarID")
                if not isinstance(calendar_id, str) or not calendar_id or len(calendar_id) > 2000:
                    raise ValueError("尚未选择用于同步的日历")
                allowed = self._refresh_calendar_titles(config)
                observed_allowed = set(config["allowedTitles"])
                snapshot = self._read_bridge_json(self.calendar_snapshot)
                if snapshot.get("kind") != "focus_calendar_snapshot":
                    raise ValueError("日历快照类型无效")
                if snapshot.get("status") != "ok":
                    message = snapshot.get("error")
                    raise ValueError(message[:500] if isinstance(message, str) and message else "手机日历同步暂未运行")
                calendar = snapshot.get("calendar")
                if not isinstance(calendar, dict) or calendar.get("calendarID") != calendar_id:
                    raise ValueError("日历快照与所选日历不一致，等待重新读取")
                now_ms = int((now or datetime.now().astimezone()).timestamp() * 1000)
                generated_ms = calendar_timestamp(snapshot.get("generatedAt"))
                if generated_ms > now_ms + 60_000:
                    raise ValueError("日历快照的生成时间无效")
                range_start = calendar_timestamp(snapshot.get("requestedStart"))
                range_end = calendar_timestamp(snapshot.get("requestedEnd"))
                if range_end <= range_start or range_end - range_start > 367 * 86_400_000:
                    raise ValueError("日历快照查询范围无效")
                events = snapshot.get("events")
                if not isinstance(events, list) or len(events) > 50000:
                    raise ValueError("日历快照记录列表无效")
                pending_events = snapshot.get("pendingEvents", [])
                if not isinstance(pending_events, list) or len(pending_events) > 50000:
                    raise ValueError("日历快照待结束记录列表无效")
                pending_records = {}
                for event in pending_events:
                    pending_record = normalize_calendar_record(event, calendar_id, allowed, now_ms,
                                                               range_start, range_end, pending=True)
                    if pending_record:
                        if pending_record[0] in pending_records and pending_records[pending_record[0]] != pending_record:
                            raise ValueError("日历快照包含冲突的待结束记录")
                        pending_records[pending_record[0]] = pending_record
                records = [record for event in events if (record := normalize_calendar_record(
                    event, calendar_id, allowed, now_ms, range_start, range_end))]
                # Duplicate identifiers with conflicting values are ambiguous:
                # reject the whole snapshot rather than oscillating the archive.
                unique = {}
                for record in records:
                    if record[0] in unique and unique[record[0]] != record:
                        raise ValueError("日历快照包含冲突的重复记录")
                    unique[record[0]] = record
                # Validate the whole collection at the moment the helper read it.
                # In particular, an old pending item is still evidence that the
                # event exists even if its end passed while this file was cached.
                observed = [normalize_calendar_record(event, calendar_id, allowed, generated_ms,
                            range_start, range_end, pending=is_pending)
                            for values, is_pending in ((events, False), (pending_events, True)) for event in values]
                healthy = all(item is not None for item in observed)
                stale = now_ms - generated_ms > CALENDAR_STALE_SECONDS * 1000
                def covered(row):
                    try:
                        identity = json.loads(row["source_key"])
                    except (TypeError, ValueError):
                        return False
                    return (isinstance(identity, list) and identity and identity[0] == calendar_id
                            and row["name"] in observed_allowed
                            and range_start <= row["start_ms"] < row["end_ms"] <= min(range_end, generated_ms))
                changed = 0
                with self.db:
                    changed += self._upsert_records(unique.values())
                    if healthy and not stale:
                        changed += self._observe_source("calendar", {item[1] for item in observed}, str(generated_ms), covered)
                    else:
                        self._reset_missing("calendar")
                    if changed:
                        self.calendar_sync["lastImport"] = now_iso()
                        self._set_meta("calendarLastImport", self.calendar_sync["lastImport"])
                        self._bump_revision()
                title = calendar.get("title")
                self.calendar_sync.update(connected=not stale, calendarName=title[:500] if isinstance(title, str) else None,
                    snapshotAt=snapshot["generatedAt"], ignoredCount=len(events) - len(records),
                    pendingCount=len(pending_records),
                    pendingRecords=[{"name": item[2], "start": iso_ms(item[4]), "end": iso_ms(item[5]), "minutes": item[3]}
                                    for item in sorted(pending_records.values(), key=lambda item: (item[5], item[0]))[:10]],
                    error="日历读取暂未更新；已保存的记录仍然保留，唤醒 Mac 后会继续同步。" if stale else None,
                    importedCount=self._active_count("calendar"))
                self.sync["importedCount"] = self._active_count()
                return changed
            except (OSError, ValueError, UnicodeError, sqlite3.Error, OverflowError) as error:
                with self.db:
                    self._reset_missing("calendar")
                message = "等待手机日历同步服务读取记录。" if isinstance(error, FileNotFoundError) else f"日历同步将自动重试：{error}"
                self.calendar_sync.update(connected=False, error=message)
                return 0

    def _source_poll_signature(self):
        """Small invalidation token; never retain the source document/credentials."""
        files = []
        for path in (self.source, self.calendar_config, self.calendar_snapshot):
            try:
                stat = path.stat()
                files.append((stat.st_dev, stat.st_ino, stat.st_size,
                              stat.st_mtime_ns, stat.st_ctime_ns))
            except FileNotFoundError:
                files.append(None)
            except OSError as error:
                # Let the importer report/retry inaccessible source files rather
                # than terminating the background polling thread here.
                files.append(("unavailable", error.errno))
        # Local writes and writes made by another connection both invalidate.
        return (tuple(files), self.db.total_changes,
                self.db.execute("PRAGMA data_version").fetchone()[0])

    def import_sources(self, *, only_if_changed=False):
        with self.lock:
            self._sync_play_tickets(quest_clock())
            signature = self._source_poll_signature()
            cached = getattr(self, "_source_poll_cache", None)
            elapsed = time.monotonic() - cached[1] if cached else None
            calendar_fresh = not self.calendar_sync["enabled"]
            if self.calendar_sync["connected"] and self.calendar_sync.get("snapshotAt"):
                calendar_fresh = (datetime.now().astimezone().timestamp() * 1000
                                  - calendar_timestamp(self.calendar_sync["snapshotAt"])
                                  <= CALENDAR_STALE_SECONDS * 1000)
            if (only_if_changed and cached and signature == cached[0]
                    and 0 <= elapsed < 30 and calendar_fresh):
                # The helper still writes a new snapshot every 30 seconds.
                # Keep checking its files every three seconds, but avoid thousands
                # of SQL reads/writes for an unchanged, already reconciled archive.
                self.sync["lastCheck"] = self.calendar_sync["lastCheck"] = now_iso()
                return 0
            before_files = signature[0]
            changed = self.import_source() + self.import_calendar()
            self._sync_play_tickets(quest_clock())
            after = self._source_poll_signature()
            pending_desktop_deletion = self.db.execute("""SELECT 1 FROM source_presence
                WHERE source='tomatodo' AND missing_count=1 LIMIT 1""").fetchone()
            if (before_files == after[0] and self.sync["connected"]
                    and self.calendar_sync["error"] is None
                    and not self.calendar_sync["pendingCount"]
                    and not self.calendar_sync["ignoredCount"]
                    and not pending_desktop_deletion):
                self._source_poll_cache = (after, time.monotonic())
            else:
                self._source_poll_cache = None
            return changed

    def request_calendar_refresh(self):
        """Ask the native helper to read EventKit; ordinary archive polls do not."""
        with self.lock:
            try:
                config = self._read_bridge_json(self.calendar_config)
            except (OSError, ValueError, UnicodeError):
                return {"calendarRequested": False}
            if config.get("enabled") is not True:
                return {"calendarRequested": False}
            request = {"schemaVersion": 1,
                       "requestedAt": datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z"),
                       "requestID": str(uuid.uuid4())}
            descriptor, temporary = tempfile.mkstemp(prefix=".calendar-refresh-", dir=self.data_dir)
            try:
                with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                    json.dump(request, handle, ensure_ascii=False, allow_nan=False)
                os.replace(temporary, self.calendar_refresh_request)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
            return {"calendarRequested": True, "requestID": request["requestID"], "requestedAt": request["requestedAt"]}

    def update_settings(self, patch):
        with self.lock, self.db:
            updated = validate_settings(self.settings, patch)
            if self._mystery_goal_settings(updated) != self._mystery_goal_settings(self.settings):
                current = quest_clock()
                effective = updated
                if "targets" not in patch:
                    effective = dict(updated, targets=self._daily_goal(current.date().isoformat(), current)["targets"])
                self._save_mystery_epoch(effective, int(current.timestamp() * 1000))
            self._set_meta("settings", json.dumps(updated, ensure_ascii=False, allow_nan=False))
            self._bump_revision()
            self.settings = updated
            return updated

    def move_record(self, record_id, *, restore=False):
        if not isinstance(record_id, str) or not record_id or len(record_id) > 5000:
            raise ValueError("记录标识无效")
        with self.lock, self.db:
            redirected = self.db.execute("SELECT canonical_id FROM record_merges WHERE removed_id=?", (record_id,)).fetchone()
            if redirected:
                record_id = redirected[0]
            if not self.db.execute("SELECT 1 FROM records WHERE id=?", (record_id,)).fetchone():
                raise ValueError("找不到这条学习记录")
            # Explicit restoration pins this local copy, even if both source
            # records remain deleted. Explicit trashing blocks reimport forever
            # unless the user later restores this same record.
            self.db.execute("""INSERT INTO record_lifecycle VALUES (?,?,?,?)
                ON CONFLICT(record_id) DO UPDATE SET deleted_at=excluded.deleted_at,
                reason=excluded.reason,manual_action=excluded.manual_action""",
                (record_id, None if restore else now_iso(), None if restore else "manual", "keep" if restore else "delete"))
            self._bump_revision()
            self.sync["importedCount"] = self._active_count()
            self.calendar_sync["importedCount"] = self._active_count("calendar")

    def _serialize_record(self, row):
        return {"id": row["id"], "name": row["name"], "subject": classify(row["name"], self.settings["mapping"]),
                "activity": classify_activity(row["name"], self.settings["activityMapping"]),
                "minutes": row["minutes"], "start": iso_ms(row["start_ms"]), "end": iso_ms(row["end_ms"]),
                "day": row["day"], "source": row["source"]}

    def trash(self):
        with self.lock:
            count = self.db.execute("SELECT COUNT(*) FROM record_lifecycle WHERE deleted_at IS NOT NULL").fetchone()[0]
            records = [dict(self._serialize_record(row), deletedAt=row["deleted_at"], deletionReason=row["reason"],
                            manualDeleted=row["manual_action"] == "delete") for row in self.db.execute("""
                SELECT r.*,l.deleted_at,l.reason,l.manual_action FROM records r
                JOIN record_lifecycle l ON l.record_id=r.id WHERE l.deleted_at IS NOT NULL
                ORDER BY l.deleted_at DESC,r.end_ms DESC,r.id DESC LIMIT 100""")]
            return {"count": count, "records": records}

    def _action_recommendations(self, current):
        """Use all completed active records today, independent of the UI date."""
        totals = {sid: {"minutes": 0, "lecture": 0, "practice": 0} for sid in SUBJECT_IDS}
        for row in self.db.execute("""SELECT r.name,r.minutes FROM records r
                WHERE r.day=? AND r.end_ms<=? AND NOT EXISTS
                (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)""",
                (current.date().isoformat(), int(current.timestamp() * 1000))):
            subject = classify(row["name"], self.settings["mapping"])
            if subject not in totals:
                continue
            total = totals[subject]
            total["minutes"] += row["minutes"]
            activity = classify_activity(row["name"], self.settings["activityMapping"])
            if activity in ("lecture", "practice"):
                total[activity] += row["minutes"]
        choices = []
        for index, (subject, name, _) in enumerate(SUBJECTS):
            total = totals[subject]
            target = self._daily_goal(current.date().isoformat(), current)["targets"][subject]
            heavy = total["lecture"] >= 30 and total["practice"] < total["lecture"] / 2
            if heavy:
                mode = "practice"
                why = f"今天{name}听课 {total['lecture']:g} 分钟，做题 {total['practice']:g} 分钟。用一个小练习检验刚听到的内容。"
            elif total["practice"] > 0 and total["practice"] >= total["lecture"]:
                mode = "recall"
                why = f"今天{name}已有 {total['practice']:g} 分钟做题记录。换成主动回忆，看看哪些方法已能独立说清。"
            elif total["minutes"] == 0:
                mode = "practice" if subject in ("math", "cs") else "recall"
                why = f"今天{name}还没有完成记录。先选一个具体的小行动，给这门课一个轻巧的起点。"
            else:
                mode = "practice" if subject in ("math", "cs", "english") else "recall"
                why = f"今天{name}已记录 {total['minutes']:g} 分钟。试着离开资料做一次检验，把不确定的地方找出来。"
            card_id = subject + "-" + mode
            gap = max(0, 1 - total["minutes"] / target)
            choices.append((gap + (0.65 if heavy else 0), -index,
                            {"id": card_id, **ACTION_TEMPLATES[card_id], "why": why}))
        return [json.loads(json.dumps(item[2], ensure_ascii=False))
                for item in sorted(choices, key=lambda item: item[:2], reverse=True)]

    @staticmethod
    def _serialize_action(row):
        return {**json.loads(row["snapshot"]), "id": row["id"], "cardId": row["card_id"],
                "checked": json.loads(row["checked"]), "note": row["note"],
                "status": row["status"], "version": row["version"],
                "startedAt": row["started_at"], "updatedAt": row["updated_at"],
                "completedAt": row["completed_at"]}

    def actions_state(self, now=None):
        current = quest_clock(now)
        with self.lock:
            active = self.db.execute("SELECT * FROM study_actions WHERE status='active'").fetchone()
            history = self.db.execute("""SELECT * FROM study_actions WHERE status!='active'
                    ORDER BY updated_at DESC,id DESC LIMIT 20""").fetchall()
            return {"now": current.isoformat(timespec="microseconds"), "today": current.date().isoformat(),
                    "recommendations": self._action_recommendations(current),
                    "active": self._serialize_action(active) if active else None,
                    "history": [self._serialize_action(row) for row in history]}

    @staticmethod
    def _action_uuid(value):
        if not isinstance(value, str) or len(value) != 36:
            raise ValueError("行动标识必须为 UUID 字符串")
        try:
            canonical = str(uuid.UUID(value))
        except (ValueError, AttributeError):
            raise ValueError("行动标识必须为 UUID 字符串") from None
        if value.lower() != canonical:
            raise ValueError("行动标识必须为 UUID 字符串")
        return canonical

    @staticmethod
    def _action_version(version):
        if type(version) is not int or not 1 <= version <= 2 ** 53 - 1:
            raise ValueError("行动版本无效，请刷新后重试")
        return version

    def start_action(self, card_id, request_id, now=None):
        if not isinstance(card_id, str) or card_id not in ACTION_TEMPLATES:
            raise ValueError("行动卡片不存在")
        request_id = self._action_uuid(request_id)
        current = quest_clock(now)
        with self._quest_transaction():
            existing = self.db.execute("SELECT card_id FROM study_actions WHERE request_id=?", (request_id,)).fetchone()
            if existing:
                if existing["card_id"] != card_id:
                    raise ValueError("同一个请求标识不能用于不同的行动")
                return self.actions_state(current)
            if self.db.execute("SELECT 1 FROM study_actions WHERE status='active'").fetchone():
                raise ValueError("先完成或暂放当前行动，再开始新的行动")
            card = next((item for item in self._action_recommendations(current) if item["id"] == card_id), None)
            if card is None:
                # A recommendation may change while its card is being read.
                # It remains a valid action, with an honest neutral rationale.
                card = {"id": card_id, **ACTION_TEMPLATES[card_id],
                        "why": "这是你选择的学习检验。按自己的需要完成三步，不必追求固定时长。"}
            timestamp = current.isoformat(timespec="microseconds")
            self.db.execute("""INSERT INTO study_actions
                (id,request_id,card_id,snapshot,status,started_at,updated_at) VALUES (?,?,?,?,'active',?,?)""",
                (str(uuid.uuid4()), request_id, card_id, json.dumps(card, ensure_ascii=False), timestamp, timestamp))
            return self.actions_state(current)

    def update_action(self, action_id, version, checked, note, now=None):
        action_id, version = self._action_uuid(action_id), self._action_version(version)
        if not isinstance(checked, list) or len(checked) != 3 or any(type(value) is not bool for value in checked):
            raise ValueError("请提供三个步骤的完成状态，必须为 true 或 false")
        if not isinstance(note, str) or len(note) > 1000:
            raise ValueError("行动心得最多 1000 字")
        current = quest_clock(now)
        with self._quest_transaction():
            row = self.db.execute("SELECT * FROM study_actions WHERE id=?", (action_id,)).fetchone()
            if not row or row["status"] != "active":
                raise ValueError("这个行动已经结束或不存在，请刷新后查看")
            if row["version"] != version:
                raise ValueError("行动已在另一处更新，请刷新后重试")
            self.db.execute("""UPDATE study_actions SET checked=?,note=?,version=version+1,updated_at=? WHERE id=?""",
                (json.dumps(checked), note, current.isoformat(timespec="microseconds"), action_id))
            return self.actions_state(current)

    def _finish_action(self, action_id, version, status, now=None):
        action_id, version = self._action_uuid(action_id), self._action_version(version)
        current = quest_clock(now)
        with self._quest_transaction():
            row = self.db.execute("SELECT * FROM study_actions WHERE id=?", (action_id,)).fetchone()
            if not row:
                raise ValueError("行动不存在")
            if row["status"] == status:
                return self.actions_state(current)
            if row["status"] != "active":
                raise ValueError("这个行动已经结束，请刷新后查看")
            if row["version"] != version:
                raise ValueError("行动已在另一处更新，请刷新后重试")
            if status == "completed" and not all(json.loads(row["checked"])):
                raise ValueError("请先勾选完成三个步骤，再收下这次行动")
            timestamp = current.isoformat(timespec="microseconds")
            self.db.execute("""UPDATE study_actions SET status=?,version=version+1,updated_at=?,completed_at=? WHERE id=?""",
                (status, timestamp, timestamp if status == "completed" else None, action_id))
            return self.actions_state(current)

    def complete_action(self, action_id, version, now=None):
        return self._finish_action(action_id, version, "completed", now)

    def park_action(self, action_id, version, now=None):
        return self._finish_action(action_id, version, "parked", now)

    @staticmethod
    def _serialize_arcade(row, current=None):
        state = arcade_rules.public_state(row["game_type"], json.loads(row["game_state"]),
                                         current.timestamp() if current else None)
        if row["game_type"] == "survivor" and row["status"] != "active":
            # History postcards show the finished build, not a frozen battlefield.
            # Keep the complete simulation in SQLite for durable saves.
            for key in ("enemies", "shots", "gems", "pickups", "effects", "obstacles", "choices"):
                state.pop(key, None)
        return {"id": row["id"], "venue": row["venue"], "type": row["game_type"],
                # This is an opaque session label, never the private generation seed.
                "seed": row["id"][:8], "version": row["version"],
                "startedAt": row["started_at"], "expiresAt": None if row["game_type"] == "minesweeper" else row["expires_at"],
                "endedAt": row["ended_at"], "status": row["status"],
                "state": state,
                "steps": row["steps"], "maxSteps": None if row["game_type"] == "minesweeper" else row["max_steps"],
                "result": json.loads(row["result"]) if row["result"] else None}

    def _arcade_expire(self, current):
        rows = self.db.execute("SELECT * FROM arcade_sessions WHERE status='active'").fetchall()
        for row in rows:
            if row["game_type"] == "minesweeper":
                # Classic Minesweeper has a stopwatch, not an expiry timer.
                # Its already-spent admission remains assigned to its start day.
                continue
            if row["game_type"] in ("voyage", "dice"):
                self._arcade_end(row, "abandoned", {"won": False, "score": 0, "medal": 0,
                    "reason": "该玩法已收起。历史战绩与已获得奖励保留，可前往星海幸存者开始新冒险。"}, current)
            elif row["day"] != current.date().isoformat() or current >= datetime.fromisoformat(row["expires_at"]):
                self._arcade_end(row, "expired", {"won": False, "score": 0, "medal": 0,
                    "reason": "休息时间到了。本轮已收起，下次再来岛上散步。"}, current)

    def _play_ticket_balance(self):
        return max(0, self.db.execute("SELECT COALESCE(SUM(amount),0) FROM arcade_play_ticket_ledger").fetchone()[0])

    def _sync_play_tickets(self, current):
        # Never commit the caller's game/lottery transaction early.
        with self.lock:
            if not self.db.in_transaction:
                with self._quest_transaction():
                    self._sync_play_ticket_issuance(current)
            else:
                self._sync_play_ticket_issuance(current)
            return self._play_ticket_balance()

    def _sync_play_ticket_issuance(self, current):
        day, stamp = current.date().isoformat(), int(current.timestamp()*1000)
        signature = (self.db.total_changes, self.db.execute("PRAGMA data_version").fetchone()[0], day)
        cached = getattr(self, "_play_ticket_sync_cache", None)
        if (cached and cached[0] == signature and stamp >= cached[1]
                and (cached[2] is None or stamp < cached[2])):
            return
        rules, changed = arcade_rules.RULES, False
        epoch = self._meta(PLAY_TICKETS_START_META)
        if epoch is None:
            # Only today's unused old admissions survive. Mark observed rows,
            # including deleted ones, so restoring old study cannot remint.
            rows = self.db.execute("""SELECT r.*, EXISTS(SELECT 1 FROM record_lifecycle l
                WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL) AS deleted
                FROM records r WHERE r.day=? AND r.end_ms<=?""", (day, stamp)).fetchall()
            minutes = sum(max(0, float(row["minutes"])) for row in rows if not row["deleted"])
            earned = min(rules["maxTickets"], math.floor((minutes+1e-8)/rules["ticketMinutes"]))
            purchased = self.db.execute("SELECT COUNT(*) FROM arcade_ticket_purchases WHERE day=?", (day,)).fetchone()[0]
            used = self.db.execute("SELECT COUNT(*) FROM arcade_sessions WHERE day=?", (day,)).fetchone()[0]
            study_spent = min(rules["maxTickets"], max(0, used-purchased))
            available = max(0, earned+purchased-used)
            self._set_meta(PLAY_TICKETS_START_META, day)
            self.db.execute("INSERT INTO arcade_ticket_earnings VALUES (?,?,?)",
                            (day, max(earned, study_spent), max(0, study_spent*rules["ticketMinutes"]-minutes)))
            for row in rows:
                amount = max(0, float(row["minutes"]))
                self.db.execute("INSERT INTO arcade_ticket_record_credits VALUES (?,?,?,?)",
                                (row["id"], day, amount, 0 if row["deleted"] else amount))
            if available:
                self.db.execute("INSERT INTO arcade_play_ticket_ledger VALUES (?,?,?,?,?)",
                                ("migration:"+day, available, stamp, "migration", "保留升级当日未使用游玩券"))
            epoch, changed = day, True
        # Source deduplication and history consolidation must inherit already
        # credited duration, including chains of canonical record redirects.
        transfers = self.db.execute("""SELECT c.*,m.canonical_id FROM arcade_ticket_record_credits c
            JOIN record_merges m ON m.removed_id=c.record_id
            WHERE NOT EXISTS (SELECT 1 FROM arcade_ticket_merge_credits t WHERE t.removed_id=c.record_id)""").fetchall()
        for row in transfers:
            canonical = self._history_canonical_id(row["canonical_id"])
            saved = self.db.execute("SELECT 1 FROM arcade_ticket_record_credits WHERE record_id=?", (canonical,)).fetchone()
            if saved:
                self.db.execute("UPDATE arcade_ticket_record_credits SET minutes=minutes+? WHERE record_id=?", (row["minutes"], canonical))
            else:
                self.db.execute("INSERT INTO arcade_ticket_record_credits VALUES (?,?,?,0)", (canonical, row["day"], row["minutes"]))
            self.db.execute("INSERT INTO arcade_ticket_merge_credits VALUES (?,?)", (row["record_id"], canonical))
            changed = True
        # A credited record keeps its first date even when corrected later.
        rows = self.db.execute("""SELECT r.id,r.day,r.minutes,c.day AS credited_day,
                c.minutes AS previous_minutes,c.credited_minutes
            FROM records r LEFT JOIN arcade_ticket_record_credits c ON c.record_id=r.id
            WHERE r.day>=? AND r.day<=? AND r.end_ms<=?
                AND (c.record_id IS NULL OR r.minutes>c.minutes)
                AND NOT EXISTS (SELECT 1 FROM record_lifecycle l
                    WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)""", (epoch, day, stamp)).fetchall()
        affected = set()
        for row in rows:
            amount = max(0, float(row["minutes"]))
            if row["previous_minutes"] is None:
                self.db.execute("INSERT INTO arcade_ticket_record_credits VALUES (?,?,?,?)",
                                (row["id"], row["day"], amount, amount))
                affected.add(row["day"])
            else:
                self.db.execute("UPDATE arcade_ticket_record_credits SET minutes=?,credited_minutes=credited_minutes+? WHERE record_id=?",
                                (amount, amount-row["previous_minutes"], row["id"]))
                affected.add(row["credited_day"])
            changed = True
        for earned_day in affected:
            saved = self.db.execute("SELECT issued,legacy_minutes FROM arcade_ticket_earnings WHERE day=?", (earned_day,)).fetchone()
            issued, legacy = (saved[0], saved[1]) if saved else (0, 0)
            minutes = self.db.execute("SELECT COALESCE(SUM(credited_minutes),0) FROM arcade_ticket_record_credits WHERE day=?", (earned_day,)).fetchone()[0]+legacy
            earned = min(rules["maxTickets"], math.floor((minutes+1e-8)/rules["ticketMinutes"]))
            for number in range(issued+1, earned+1):
                self.db.execute("INSERT INTO arcade_play_ticket_ledger VALUES (?,?,?,?,?)",
                                (f"study:{earned_day}:{number}", 1, stamp, "study", "学习获得游玩券"))
            if not saved:
                self.db.execute("INSERT INTO arcade_ticket_earnings VALUES (?,?,0)", (earned_day, earned))
            elif earned > issued:
                self.db.execute("UPDATE arcade_ticket_earnings SET issued=? WHERE day=?", (earned, earned_day))
        if changed:
            self._bump_revision()
        future = self.db.execute("""SELECT MIN(r.end_ms) FROM records r WHERE r.day>=? AND r.end_ms>?
            AND NOT EXISTS (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)""", (epoch, stamp)).fetchone()[0]
        self._play_ticket_sync_cache = ((self.db.total_changes, self.db.execute("PRAGMA data_version").fetchone()[0], day), stamp, future)

    def _arcade_budget(self, current):
        day = current.date().isoformat()
        minutes = self.db.execute("""SELECT COALESCE(SUM(r.minutes),0) FROM records r
            WHERE r.day=? AND r.end_ms<=? AND NOT EXISTS
            (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)""",
            (day, int(current.timestamp()*1000))).fetchone()[0]
        minutes = max(0, float(minutes))
        rules = arcade_rules.RULES
        available = self._sync_play_tickets(current)
        earning_row = self.db.execute("SELECT issued FROM arcade_ticket_earnings WHERE day=?", (day,)).fetchone()
        earned = earning_row[0] if earning_row else 0
        progress = self.db.execute("""SELECT COALESCE(SUM(c.credited_minutes),0)+COALESCE(
            (SELECT legacy_minutes FROM arcade_ticket_earnings WHERE day=?),0)
            FROM arcade_ticket_record_credits c WHERE c.day=?""", (day, day)).fetchone()[0]
        used = self.db.execute("SELECT COUNT(*) FROM arcade_sessions WHERE day=?", (day,)).fetchone()[0]
        reward = self.db.execute("""SELECT COALESCE(SUM(l.coins),0),COALESCE(SUM(l.diamonds),0)
            FROM arcade_sessions s JOIN wallet_ledger l ON l.reference='arcade:'||s.id WHERE s.day=?""", (day,)).fetchone()
        purchased = self.db.execute("SELECT COUNT(*) FROM arcade_ticket_purchases WHERE day=?", (day,)).fetchone()[0]
        plays_remaining = max(0, rules["maxTickets"]+rules["maxPurchasedTickets"]-used)
        return {"studyMinutes": round(minutes, 4), "earned": earned, "used": used,
                "purchased": purchased, "purchasePrice": rules["purchasePrice"],
                "purchaseRemaining": max(0, rules["maxPurchasedTickets"]-purchased),
                "available": available, "persistentTickets": True,
                "playsRemaining": plays_remaining, "canPlay": available > 0 and plays_remaining > 0,
                "ticketProgressMinutes": round(progress, 4),
                "nextTicketMinutes": 0 if earned >= rules["maxTickets"] else
                    round(max(0, (earned+1)*rules["ticketMinutes"]-progress), 4),
                "rewardToday": {"coins": reward[0], "diamonds": reward[1]}}

    def _arcade_snapshot(self, current):
        active = self.db.execute("SELECT * FROM arcade_sessions WHERE status='active'").fetchone()
        rows = self.db.execute("SELECT * FROM arcade_sessions WHERE status!='active' ORDER BY ended_at DESC,rowid DESC LIMIT 14").fetchall()
        history = [self._serialize_arcade(row, current) for row in rows]
        # Only completed runs change the collection. Real-time pulses never scan
        # historical entity arrays; lightweight active replies bypass this path.
        signature = tuple(self.db.execute("SELECT COUNT(*),COALESCE(SUM(version),0) FROM arcade_sessions WHERE status!='active'").fetchone())
        cached = getattr(self, "_arcade_collection_cache", None)
        collect = cached is None or cached[0] != signature
        venue_stats, weapons, evolutions, heroes = {}, {}, {}, {}
        for row in self.db.execute("""SELECT venue,status,result,game_type,
                CASE WHEN ? AND game_type='survivor' AND status!='active' THEN game_state ELSE '{}' END AS game_state
                FROM arcade_sessions""", (collect,)):
            stats = venue_stats.setdefault(row["venue"], {"plays": 0, "wins": 0, "bestScore": 0, "bestMedal": 0})
            stats["plays"] += 1
            if row["status"] in ("won", "lost"):
                result = json.loads(row["result"])
                stats["wins"] += row["status"] == "won"
                stats["bestScore"] = max(stats["bestScore"], result["score"])
                stats["bestMedal"] = max(stats["bestMedal"], result["medal"])
                if row["game_type"] == "minesweeper" and row["status"] == "won":
                    seconds = result.get("elapsedSeconds")
                    if isinstance(seconds, (int, float)) and seconds >= 0:
                        stats["bestSeconds"] = min(stats.get("bestSeconds", seconds), seconds)
            if collect and row["game_type"] == "survivor" and row["status"] != "active":
                public = arcade_rules.public_state("survivor", json.loads(row["game_state"]))
                for item in public.get("weapons", []):
                    identity = item["id"]
                    existing = weapons.setdefault(identity, {"id": identity, "name": item.get("name", identity),
                        "description": item.get("description", ""), "level": 0})
                    existing["level"] = max(existing["level"], item.get("level", 1))
                    if item.get("evolved"):
                        evolutions.setdefault(identity, {"id": identity,
                            "name": item.get("evolutionName", item.get("name", identity)),
                            "description": item.get("description", "")})
                hero = public.get("hero")
                hero_id = hero.get("id") if isinstance(hero, dict) else hero
                if isinstance(hero_id, str) and hero_id:
                    info = hero if isinstance(hero, dict) else next((h for h in public.get("heroes", []) if h["id"] == hero_id), {})
                    record = heroes.setdefault(hero_id, {"id": hero_id, "name": info.get("name", hero_id), "wins": 0})
                    record["wins"] += row["status"] == "won"
        if collect:
            collection = {"weapons": sorted(weapons.values(), key=lambda item: item["id"]),
                          "evolutions": sorted(evolutions.values(), key=lambda item: item["id"]),
                          "heroes": sorted(heroes.values(), key=lambda item: item["id"])}
            self._arcade_collection_cache = (signature, collection)
        else:
            collection = cached[1]
        venues = [{**v, **venue_stats.get(v["id"], {"plays": 0, "wins": 0, "bestScore": 0, "bestMedal": 0})}
                  for v in arcade_rules.VENUES]
        for venue in venues:
            if venue["type"] == "minesweeper":
                venue.setdefault("bestSeconds", None)
        return {"today": current.date().isoformat(), "now": current.isoformat(timespec="microseconds"),
                "rules": dict(arcade_rules.RULES, maxDailyPlays=arcade_rules.RULES["maxTickets"]+arcade_rules.RULES["maxPurchasedTickets"]), **self._arcade_budget(current),
                "revision": int(self._meta("revision") or 0),
                "active": self._serialize_arcade(active, current) if active else None,
                "lastResult": history[0] if history else None, "history": history, "venues": venues,
                "collection": collection, "wallet": self._wallet()}

    def arcade_state(self, now=None):
        current = quest_clock(now)
        with self._quest_transaction():
            self._arcade_expire(current)
            return self._arcade_snapshot(current)

    @staticmethod
    def _survivor_reward(result, won):
        if not won:
            return [], {"coins": 0, "diamonds": 0}
        # The result is produced only by the server simulation, never by a
        # client score payload. Present each earned component in the receipt.
        kills, level = max(0, result.get("kills", 0)), max(1, result.get("level", 1))
        breakdown = [{"label": "守夜成功", "coins": 20, "diamonds": 1},
                     {"label": "击杀星潮", "coins": min(20, kills//40), "diamonds": 0},
                     {"label": "成长奖励", "coins": min(10, (level-1)//2), "diamonds": 0}]
        if result.get("bossKilled"):
            breakdown.append({"label": "击败黯星领主", "coins": 10, "diamonds": 1})
        if level >= 20:
            breakdown.append({"label": "达到 20 级", "coins": 0, "diamonds": 1})
        return breakdown, {"coins": sum(item["coins"] for item in breakdown),
                           "diamonds": sum(item["diamonds"] for item in breakdown)}

    def _arcade_end(self, row, status, result, current):
        coins, diamonds = 0, 0
        if row["game_type"] == "minesweeper":
            # Fetch the just-updated board: the caller's row may precede the
            # winning move. Persist the frozen clock for history and reloads.
            latest = self.db.execute("SELECT game_state FROM arcade_sessions WHERE id=?", (row["id"],)).fetchone()
            board = json.loads(latest["game_state"])
            board["_elapsedSeconds"] = arcade_rules.minesweeper_rules.elapsed_seconds(board, current.timestamp())
            if status == "abandoned":
                board["phase"] = "abandoned"
            self.db.execute("UPDATE arcade_sessions SET game_state=? WHERE id=?", (json.dumps(board, ensure_ascii=False), row["id"]))
            config = arcade_rules.minesweeper_rules.DIFFICULTIES[board["difficulty"]]
            gross = {"coins": config["coins"] if status == "won" else 0,
                     "diamonds": config["diamonds"] if status == "won" else 0}
            result = dict(result, elapsedSeconds=board["_elapsedSeconds"], difficulty=board["difficulty"],
                          grossReward=gross, rewardDay=row["day"],
                          rewardBreakdown=[{"label": "经典扫雷通关", **gross}] if status == "won" else [])
        if row["game_type"] == "survivor":
            breakdown, gross = self._survivor_reward(result, status == "won")
            result = dict(result, rewardBreakdown=breakdown, grossReward=gross)
        if status in ("won", "lost"):
            budget, rules = self._arcade_budget(current), arcade_rules.RULES
            if row["game_type"] in ("survivor", "minesweeper"):
                expected_coins, expected_diamonds = gross["coins"], gross["diamonds"]
            else:
                expected_coins = rules["winCoins"] if status == "won" else rules["lossCoins"]
                expected_diamonds = rules["winDiamonds"] if status == "won" else 0
            reward_today = budget["rewardToday"]
            if row["game_type"] == "minesweeper" and row["day"] != current.date().isoformat():
                # Cross-day completion draws only from its original day's
                # remaining allowance, as do the admission and history row.
                earned = self.db.execute("""SELECT COALESCE(SUM(l.coins),0),COALESCE(SUM(l.diamonds),0)
                    FROM arcade_sessions s JOIN wallet_ledger l ON l.reference='arcade:'||s.id WHERE s.day=?""", (row["day"],)).fetchone()
                reward_today = {"coins": earned[0], "diamonds": earned[1]}
            coins = min(expected_coins, max(0, rules["dailyCoins"]-reward_today["coins"]))
            diamonds = min(expected_diamonds, max(0, rules["dailyDiamonds"]-reward_today["diamonds"]))
            self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                ("arcade:"+row["id"], coins, diamonds, int(current.timestamp()*1000)))
        result = dict(result, coins=coins, diamonds=diamonds)
        self.db.execute("""UPDATE arcade_sessions SET status=?,result=?,ended_at=?,version=version+1 WHERE id=? AND status='active'""",
            (status, json.dumps(result, ensure_ascii=False), current.isoformat(timespec="microseconds"), row["id"]))

    def start_arcade(self, venue, request_id, now=None):
        if not isinstance(venue, str) or venue not in arcade_rules.CATALOG:
            raise ValueError("这处游乐地点不存在")
        request_id = self._action_uuid(request_id)
        current = quest_clock(now)
        with self._quest_transaction():
            self._arcade_expire(current)
            previous = self.db.execute("SELECT venue FROM arcade_sessions WHERE request_id=?", (request_id,)).fetchone()
            if previous:
                if previous["venue"] != venue:
                    raise ValueError("同一个请求标识不能用于不同地点")
                return self._arcade_snapshot(current)
            if self.db.execute("SELECT 1 FROM arcade_sessions WHERE status='active'").fetchone():
                raise ValueError("还有一局正在进行，先继续或结束它吧")
            budget = self._arcade_budget(current)
            if budget["playsRemaining"] <= 0:
                raise ValueError("今天的游玩次数已经全部用完，游玩券会保留，明天再来岛上散步吧")
            if budget["available"] <= 0:
                if budget["used"] >= arcade_rules.RULES["maxTickets"] + arcade_rules.RULES["maxPurchasedTickets"]:
                    raise ValueError("今天的游玩次数已经全部用完，明天再来岛上散步吧")
                if budget["earned"] >= arcade_rules.RULES["maxTickets"]:
                    raise ValueError("今天的学习游玩次数已用完，可用金币购买额外次数，或明天再来")
                raise ValueError("暂时没有可用游玩次数，完成下一段学习后再来看看")
            seed = uuid.uuid4().hex
            state, max_steps = arcade_rules.create(venue, seed)
            if arcade_rules.CATALOG[venue]["type"] == "survivor":
                state["_lastTick"] = current.timestamp()
            midnight = (current+timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            expires = min(current+timedelta(seconds=arcade_rules.RULES["roundSeconds"]), midnight)
            session_id = str(uuid.uuid4())
            self.db.execute("""INSERT INTO arcade_sessions
                (id,request_id,day,venue,game_type,seed,started_at,expires_at,status,game_state,max_steps)
                VALUES (?,?,?,?,?,?,?,?,'active',?,?)""",
                (session_id, request_id, current.date().isoformat(), venue, arcade_rules.CATALOG[venue]["type"],
                 seed, current.isoformat(timespec="microseconds"), "" if arcade_rules.CATALOG[venue]["type"] == "minesweeper" else expires.isoformat(timespec="microseconds"),
                 json.dumps(state, ensure_ascii=False), max_steps))
            self.db.execute("INSERT INTO arcade_play_ticket_ledger VALUES (?,?,?,?,?)",
                            ("game:"+session_id, -1, int(current.timestamp()*1000), "game", "使用一张游玩券"))
            self._bump_revision()
            return self._arcade_snapshot(current)

    def buy_arcade_ticket(self, request_id, now=None):
        request_id = self._action_uuid(request_id)
        current = quest_clock(now)
        with self._quest_transaction():
            self._arcade_expire(current)
            previous = self.db.execute("SELECT 1 FROM arcade_ticket_purchases WHERE request_id=?", (request_id,)).fetchone()
            if previous:
                return self._arcade_snapshot(current)
            budget = self._arcade_budget(current)
            if budget["purchaseRemaining"] <= 0:
                raise ValueError("今天已购买 3 张额外游玩券，明天再来吧")
            price = arcade_rules.RULES["purchasePrice"]
            if self._wallet()["coins"] < price:
                raise ValueError(f"金币不足，需要 {price} 金币购买一张游玩券")
            self.db.execute("INSERT INTO arcade_ticket_purchases VALUES (?,?,?,?)",
                (request_id, current.date().isoformat(), price, int(current.timestamp()*1000)))
            self.db.execute("INSERT INTO wallet_ledger VALUES (?,?,?,?)",
                ("arcade-ticket:"+request_id, -price, 0, int(current.timestamp()*1000)))
            self.db.execute("INSERT INTO arcade_play_ticket_ledger VALUES (?,?,?,?,?)",
                            ("purchase:"+request_id, 1, int(current.timestamp()*1000), "purchase", "购买游玩券"))
            self._bump_revision()
            return self._arcade_snapshot(current)

    def _arcade_reply(self, current, session_id=None, compact=False):
        if compact:
            row = self.db.execute("SELECT * FROM arcade_sessions WHERE id=? AND status='active'", (session_id,)).fetchone()
            if row:
                available = self._play_ticket_balance()
                used = self.db.execute("SELECT COUNT(*) FROM arcade_sessions WHERE day=?", (current.date().isoformat(),)).fetchone()[0]
                plays_remaining = max(0, arcade_rules.RULES["maxTickets"]+arcade_rules.RULES["maxPurchasedTickets"]-used)
                return {"compact": True, "today": current.date().isoformat(),
                        "revision": int(self._meta("revision") or 0),
                        "available": available, "persistentTickets": True,
                        "playsRemaining": plays_remaining, "canPlay": available > 0 and plays_remaining > 0,
                        "now": current.isoformat(timespec="microseconds"), "active": self._serialize_arcade(row, current)}
        return self._arcade_snapshot(current)

    def pulse_arcade(self, session_id, version, move, now=None):
        return self.move_arcade(session_id, version, move, now, compact=True)

    def move_arcade(self, session_id, version, move, now=None, compact=False):
        session_id, version = self._action_uuid(session_id), self._action_version(version)
        if not isinstance(move, dict):
            raise ValueError("请提供有效的游戏操作")
        encoded = json.dumps(move, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        current = quest_clock(now)
        with self._quest_transaction():
            self._arcade_expire(current)
            row = self.db.execute("SELECT * FROM arcade_sessions WHERE id=?", (session_id,)).fetchone()
            if not row:
                raise ValueError("这局游戏不存在")
            if compact and row["game_type"] != "survivor":
                raise ValueError("实时操作仅用于星海幸存者")
            previous = self.db.execute("SELECT move FROM arcade_moves WHERE session_id=? AND version=?", (session_id, version)).fetchone()
            if previous:
                if previous["move"] != encoded:
                    raise ValueError("这一操作已处理，请刷新后继续")
                return self._arcade_reply(current, session_id, compact)
            if row["status"] != "active":
                return self._arcade_reply(current, session_id, compact)
            if row["version"] != version:
                raise ValueError("游戏已在另一处更新，请刷新后继续")
            original = json.loads(row["game_state"])
            action = move
            if row["game_type"] == "survivor":
                # Client inputs describe intent only. Simulation time always
                # comes from the server clock, capped after pauses/disconnects.
                if any(not isinstance(key, str) or key.startswith("_") or key in ("elapsed", "dt", "time", "score", "coins", "diamonds") for key in move):
                    raise ValueError("游戏时间和奖励由服务器决定")
                stamp = current.timestamp()
                previous_stamp = original.get("_lastTick", stamp)
                elapsed = min(.5, max(0, stamp-previous_stamp))
                action = dict(move)
                if move.get("kind") == "tick":
                    action["elapsed"] = elapsed
            state, steps, result = arcade_rules.move(row["game_type"], original, row["steps"], row["max_steps"], action)
            if row["game_type"] == "minesweeper":
                if original["phase"] == "ready" and state["phase"] != "ready":
                    state["_clockStartedAt"] = current.timestamp()
                if state["_clockStartedAt"] is not None:
                    state["_elapsedSeconds"] = round(max(original.get("_elapsedSeconds", 0),
                                                        current.timestamp() - state["_clockStartedAt"]), 3)
            if row["game_type"] == "survivor":
                # Never move this baseline backward, even if the system clock
                # was adjusted. Repeated requests cannot simulate extra time.
                state["_lastTick"] = max(current.timestamp(), original.get("_lastTick", current.timestamp()))
            self.db.execute("INSERT INTO arcade_moves VALUES (?,?,?)", (session_id, version, encoded))
            self.db.execute("UPDATE arcade_sessions SET game_state=?,steps=?,version=version+1 WHERE id=?",
                (json.dumps(state, ensure_ascii=False, allow_nan=False), steps, session_id))
            if result is not None:
                self._arcade_end(row, "won" if result["won"] else "lost", result, current)
            return self._arcade_reply(current, session_id, compact)

    def finish_arcade(self, session_id, version, now=None):
        session_id, version = self._action_uuid(session_id), self._action_version(version)
        current = quest_clock(now)
        with self._quest_transaction():
            self._arcade_expire(current)
            row = self.db.execute("SELECT * FROM arcade_sessions WHERE id=?", (session_id,)).fetchone()
            if not row:
                raise ValueError("这局游戏不存在")
            if row["status"] == "active":
                if row["version"] != version:
                    raise ValueError("游戏已在另一处更新，请刷新后继续")
                self._arcade_end(row, "abandoned", {"won": False, "score": 0, "medal": 0,
                    "reason": "这次散步先到这里，游玩次数已使用，未结算奖励。"}, current)
            return self._arcade_snapshot(current)

    def state(self, selected_day=None, now=None):
        now = now or datetime.now().astimezone()
        if now.tzinfo is None:
            now = now.astimezone()
        selected_day = selected_day or now.date().isoformat()
        selected = parse_day(selected_day)
        with self.lock:
            self._sync_play_tickets(quest_clock(now))
            self._ensure_goal_days(now)
            self.revision = int(self._meta("revision") or 0)
            all_records = [dict(row) for row in self.db.execute("""SELECT r.* FROM records r
                WHERE NOT EXISTS (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)
                ORDER BY end_ms DESC,id DESC""")]
            task_names = sorted(row[0] for row in self.db.execute("SELECT DISTINCT name FROM records"))
            settings = json.loads(json.dumps(self.settings))
            selected_goal = self._daily_goal(selected_day, now)
            settings["targets"] = selected_goal["targets"]
            daily = [row for row in all_records if row["day"] == selected_day]
            minutes = round(sum(row["minutes"] for row in daily), 4)
            all_minutes = round(sum(row["minutes"] for row in all_records), 4)
            totals_by_subject = {subject: 0 for subject in SUBJECT_IDS}
            for row in daily:
                subject = classify(row["name"], settings["mapping"])
                if subject in totals_by_subject:
                    totals_by_subject[subject] += row["minutes"]
            subjects = [{"id": sid, "name": name, "color": color, "minutes": round(totals_by_subject[sid], 4),
                         "target": settings["targets"][sid], "percent": percent(totals_by_subject[sid], settings["targets"][sid])}
                        for sid, name, color in SUBJECTS]
            target = sum(settings["targets"].values())
            advice = make_advice(selected_day, subjects, minutes, daily, now)
            # No multipliers: rewards reflect actual completed minutes.
            xp = math.floor(all_minutes)
            level = xp // 120 + 1
            serialize = self._serialize_record
            serialized = [serialize(row) for row in daily[:100]]
            weekly_totals = {}
            for row in all_records:
                weekly_totals[row["day"]] = weekly_totals.get(row["day"], 0) + row["minutes"]
            completed_week_totals = {}
            for row in all_records:
                if row["end_ms"] <= int(now.timestamp()*1000) and row["day"] <= now.date().isoformat():
                    completed_week_totals[row["day"]] = completed_week_totals.get(row["day"], 0)+row["minutes"]
            def week_day(day):
                key = day.isoformat()
                goal = self._daily_goal(key, now)
                amount = round(completed_week_totals.get(key, 0), 4)
                return {"date": key, "minutes": amount, "target": goal["total"], "targets": goal["targets"],
                        "targetEstimated": goal["targetEstimated"], "targetSource": goal["targetSource"],
                        "achieved": None if goal["targetEstimated"] or day > now.date() else amount >= goal["total"]}
            week = [week_day(selected-timedelta(days=offset)) for offset in range(6, -1, -1)]
            week_start = selected - timedelta(days=selected.weekday())
            week_days = [week_day(week_start+timedelta(days=offset)) for offset in range(7)]
            weekly_goal = self._weekly_goal(week_start.isoformat(), now)
            settings["weeklyTarget"] = weekly_goal["target"]
            week_minutes = round(sum(item["minutes"] for item in week_days), 4)
            weekly = {**weekly_goal, "date": selected_day, "start": week_days[0]["date"], "end": week_days[-1]["date"],
                      "minutes": week_minutes, "target": settings["weeklyTarget"],
                      "percent": percent(week_minutes, settings["weeklyTarget"]), "days": week_days,
                      "achieved": None if weekly_goal["targetEstimated"] or week_start > now.date() else week_minutes >= settings["weeklyTarget"],
                      "activeDays": sum(item["minutes"] > 0 for item in week_days)}
            badges = [
                {"id": "first", "name": "初次出征", "description": "完成第一个专注任务", "earned": bool(all_records)},
                {"id": "hours-10", "name": "专注学徒", "description": "累计专注 10 小时", "earned": all_minutes >= 600},
                {"id": "hours-50", "name": "知识游侠", "description": "累计专注 50 小时", "earned": all_minutes >= 3000},
                {"id": "hours-100", "name": "百时守护者", "description": "累计专注 100 小时", "earned": all_minutes >= 6000},
                {"id": "balanced", "name": "四科同行", "description": "所选日期四科各专注至少 15 分钟", "earned": all(s["minutes"] >= 15 for s in subjects)},
                {"id": "all-complete", "name": "全线通关", "description": "所选日期完成全部科目目标", "earned": all(s["minutes"] >= s["target"] for s in subjects)},
            ]
            return {"date": selected_day, "today": now.date().isoformat(),
                    "totals": {"minutes": minutes, "target": target, "percent": percent(minutes, target), "xp": xp,
                               "level": level, "levelXp": xp % 120, "levelTarget": 120},
                    "subjects": subjects, "records": serialized, "week": week, "weekly": weekly,
                    "goals": self.goals_state(now), "selectedGoal": selected_goal, "heatmapRevision": self.revision,
                    "islandRewards": self.island_rewards_state(selected_day, now, daily),
                    "methodRewards": self.method_rewards_state(selected_day, now, daily),
                    "activities": activity_summary(selected_day, daily, settings, minutes, target, now, advice),
                    "activityTypes": [{"id": aid, "name": name} for aid, name in ACTIVITY_TYPES],
                    "taskActivities": {name: classify_activity(name, settings["activityMapping"])
                                       for name in task_names},
                    "taskNames": task_names,
                    "dayRecordCount": len(daily),
                    "latestRecords": [serialize(row) for row in all_records[:20]],
                    "allTime": {"minutes": all_minutes, "records": len(all_records), "activeDays": len(weekly_totals)},
                    "badges": badges, "advice": advice,
                    "sync": dict(self.sync, importedCount=len(all_records)),
                    "calendarSync": dict(self.calendar_sync, importedCount=self._active_count("calendar")), "settings": settings,
                    "unmapped": sorted({row["name"] for row in all_records if classify(row["name"], settings["mapping"]) == "other"}),
                    "trash": self.trash(), "quests": self.quest_state(now.astimezone()),
                    "actions": self.actions_state(now.astimezone()),
                    "arcade": self.arcade_state(now.astimezone()), "lottery": self.lottery_state(now.astimezone()),
                    "revision": self.revision}

    def interface_mode(self):
        """One collector and one archive serve both the current and v1.0 UI."""
        with self.lock:
            mode = self._meta("interface_mode")
            return mode if mode in ("modern", "classic") else "modern"

    def set_interface_mode(self, mode):
        if not isinstance(mode, str) or mode not in ("modern", "classic"):
            raise ValueError("请选择最新版或第一版")
        with self.lock, self.db:
            if self._meta("interface_mode") != mode:
                self._set_meta("interface_mode", mode)
        return {"mode": mode, "url": "/"}

    def export_csv(self):
        with self.lock:
            stream = io.StringIO(newline="")
            writer = csv.writer(stream)
            writer.writerow(["记录ID", "日期", "任务", "科目", "学习方式", "分钟", "开始时间", "完成时间", "来源"])
            names = {sid: name for sid, name, _ in SUBJECTS} | {"other": "待分类"}
            activity_names = dict(ACTIVITY_TYPES)
            for row in self.db.execute("""SELECT r.* FROM records r WHERE NOT EXISTS
                (SELECT 1 FROM record_lifecycle l WHERE l.record_id=r.id AND l.deleted_at IS NOT NULL)
                ORDER BY day,end_ms"""):
                # Escape spreadsheet formulas in user-controlled names/IDs.
                def safe(value):
                    value = str(value)
                    return "'" + value if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value
                writer.writerow([safe(row["id"]), row["day"], safe(row["name"]), names[classify(row["name"], self.settings["mapping"])],
                                 activity_names[classify_activity(row["name"], self.settings["activityMapping"])],
                                 row["minutes"], iso_ms(row["start_ms"]), iso_ms(row["end_ms"]), row["source"]])
            return ("\ufeff" + stream.getvalue()).encode("utf-8")


class FocusHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 32


def make_handler(store, static_dir=STATIC_DIR):
    static_dir = Path(static_dir).resolve()

    class Handler(BaseHTTPRequestHandler):
        server_version = "FocusQuest/1.0"

        def log_message(self, fmt, *args):
            if args and str(args[1] if len(args) > 1 else "").startswith("5"):
                super().log_message(fmt, *args)

        def _send(self, status, payload, content_type="application/json; charset=utf-8", filename=None):
            if isinstance(payload, (dict, list)):
                payload = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
            elif isinstance(payload, str):
                payload = payload.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
            if filename:
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)

        def _authorized(self, writing=False):
            port = self.server.server_address[1]
            hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
            if port == 80:
                hosts.update(("127.0.0.1", "localhost"))
            if self.headers.get("Host", "").lower() not in hosts:
                self._send(403, {"error": "仅允许本机访问"})
                return False
            origin = self.headers.get("Origin")
            if writing and (origin and origin.lower() not in {f"http://{host}" for host in hosts}):
                self._send(403, {"error": "不允许跨站修改"})
                return False
            if writing and self.headers.get("Sec-Fetch-Site") == "cross-site":
                self._send(403, {"error": "不允许跨站修改"})
                return False
            return True

        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            if not self._authorized():
                return
            try:
                url = urlsplit(self.path)
                if url.path == "/api/health":
                    self._send(200, {"ok": True})
                elif url.path == "/api/interface":
                    if url.query:
                        raise ValueError("版本选择不接受查询参数")
                    self._send(200, {"mode": store.interface_mode(), "url": "/"})
                elif url.path == "/api/state":
                    query = parse_qs(url.query)
                    self._send(200, store.state(query.get("date", [None])[0]))
                elif url.path == "/api/goals":
                    if url.query:
                        raise ValueError("目标管理只使用电脑当前日期，不接受查询参数")
                    self._send(200, store.goals_state())
                elif url.path == "/api/heatmap":
                    query = parse_qs(url.query, keep_blank_values=True)
                    if set(query) - {"period", "anchor"} or any(len(values) != 1 for values in query.values()):
                        raise ValueError("热力图查询参数无效")
                    self._send(200, store.heatmap(query.get("period", ["month"])[0], query.get("anchor", [None])[0]))
                elif url.path == "/api/opening":
                    if url.query:
                        raise ValueError("开场使用电脑当前日期和时间，不接受查询参数")
                    self._send(200, store.opening())
                elif url.path == "/api/quests":
                    if url.query:
                        raise ValueError("委托使用电脑当前日期和时间，不接受查询参数")
                    self._send(200, store.quest_state())
                elif url.path == "/api/actions":
                    if url.query:
                        raise ValueError("行动罗盘使用电脑当前日期和时间，不接受查询参数")
                    self._send(200, store.actions_state())
                elif url.path == "/api/city-life":
                    if url.query:
                        raise ValueError("城市生活不接受查询参数")
                    self._send(200, store.city_life_state())
                elif url.path == "/api/arcade":
                    if url.query:
                        raise ValueError("游乐记只使用电脑当前日期和时间，不接受查询参数")
                    self._send(200, store.arcade_state())
                elif url.path == "/api/lottery":
                    if url.query:
                        raise ValueError("抽奖机只使用电脑当前日期和时间，不接受查询参数")
                    self._send(200, store.lottery_state())
                elif url.path == "/api/export":
                    self._send(200, store.export_csv(), "text/csv; charset=utf-8", "focus-quest-records.csv")
                elif url.path == "/api/trash":
                    self._send(200, store.trash())
                elif url.path.startswith("/api/"):
                    self._send(404, {"error": "接口不存在"})
                else:
                    requested = unquote(url.path).lstrip("/")
                    if not requested:
                        requested = "classic/index.html" if store.interface_mode() == "classic" else "index.html"
                    elif requested == "classic/":
                        requested = "classic/index.html"
                    path = (static_dir / requested).resolve()
                    if static_dir not in path.parents or not path.is_file():
                        self._send(404, {"error": "页面不存在"})
                        return
                    kind = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
                    if kind.startswith("text/") or kind == "application/javascript":
                        kind += "; charset=utf-8"
                    self._send(200, path.read_bytes(), kind)
            except (ValueError, OverflowError) as error:
                self._send(400, {"error": str(error)})
            except (OSError, sqlite3.Error):
                self._send(500, {"error": "本地数据暂时无法读取"})

        def do_POST(self):
            if not self._authorized(writing=True):
                return
            try:
                url = urlsplit(self.path)
                path = url.path
                quest_actions = {"/api/quests/accept": ("subject", store.accept_quest),
                                 "/api/shop/buy": ("itemId", store.buy_item),
                                 "/api/shop/equip": ("itemId", store.equip_item)}
                study_actions = {"/api/actions/start": (("cardId", "requestId"), store.start_action),
                                 "/api/actions/update": (("id", "version", "checked", "note"), store.update_action),
                                 "/api/actions/complete": (("id", "version"), store.complete_action),
                                 "/api/actions/park": (("id", "version"), store.park_action)}
                goal_actions = {"/api/goals/daily": (("targets", "day", "requestId"), store.set_daily_goal),
                                "/api/goals/weekly": (("target", "weekStart", "requestId"), store.set_weekly_goal)}
                arcade_actions = {"/api/arcade/start": (("venue", "requestId"), store.start_arcade),
                                  "/api/arcade/move": (("id", "version", "move"), store.move_arcade),
                                  "/api/arcade/pulse": (("id", "version", "move"), store.pulse_arcade),
                                  "/api/arcade/tickets/buy": (("requestId",), store.buy_arcade_ticket),
                                  "/api/arcade/finish": (("id", "version"), store.finish_arcade)}
                lottery_actions = {"/api/lottery/buy": store.buy_lottery_ticket,
                                   "/api/lottery/draw": store.draw_lottery,
                                   "/api/lottery/exchange": store.exchange_play_tickets,
                                   "/api/lottery/star-gift": store.open_lottery_star_gift}
                city_actions = {"/api/city-life/note": store.city_life_note,
                                "/api/city-life/note-update": store.city_life_note_update,
                                "/api/city-life/outfit": store.city_life_outfit,
                                "/api/city-life/outfit-apply": store.city_life_outfit_apply,
                                "/api/city-life/outfit-archive": store.city_life_outfit_archive}
                if path not in ("/api/interface", "/api/settings", "/api/sync", "/api/records/trash", "/api/records/restore", "/api/opening/claim", "/api/shop/exchange", "/api/shop/exchange-coins", "/api/quests/submit", "/api/quests/mystery/submit", "/api/island-rewards/claim", "/api/method-rewards/claim", "/api/method-rewards/completion") and path not in quest_actions and path not in study_actions and path not in arcade_actions and path not in goal_actions and path not in city_actions and path not in lottery_actions:
                    self._send(404, {"error": "接口不存在"})
                    return
                length = int(self.headers.get("Content-Length", "0"))
                if length < 0 or length > 1_000_000:
                    self._send(413, {"error": "请求过大"})
                    return
                if self.headers.get_content_type() != "application/json":
                    self._send(415, {"error": "请使用 application/json"})
                    return
                raw = self.rfile.read(length)
                payload = json.loads(raw or b"{}", parse_constant=lambda value: (_ for _ in ()).throw(ValueError("JSON 数字无效")))
                if not isinstance(payload, dict):
                    raise ValueError("请求必须为 JSON 对象")
                if path == "/api/interface":
                    if url.query or set(payload) != {"mode"}:
                        raise ValueError("请仅提供要切换的版本")
                    self._send(200, store.set_interface_mode(payload["mode"]))
                elif path in city_actions:
                    if url.query:
                        raise ValueError("城市生活修改不接受查询参数")
                    self._send(200, city_actions[path](payload))
                elif path in goal_actions:
                    fields, action = goal_actions[path]
                    if url.query or set(payload) != set(fields):
                        raise ValueError("目标参数无效；请仅提供目标、日期和请求标识")
                    self._send(200, action(*(payload[field] for field in fields)))
                elif path == "/api/island-rewards/claim":
                    if url.query or set(payload) != {"day", "island"}:
                        raise ValueError("请仅提供页面日期与岛屿；礼盒资格与奖励由服务器决定")
                    self._send(200, store.claim_island_reward(payload["day"], payload["island"]))
                elif path == "/api/method-rewards/claim":
                    if url.query or set(payload) != {"day", "subject", "tier"}:
                        raise ValueError("请仅提供页面日期、科目与奖励档位；资格和金额由服务器决定")
                    self._send(200, store.claim_method_reward(payload["day"], payload["subject"], payload["tier"]))
                elif path == "/api/method-rewards/completion":
                    if url.query or set(payload) != {"day"}:
                        raise ValueError("请仅提供页面日期；四科研习资格与额外奖赏由服务器决定")
                    self._send(200, store.claim_method_completion(payload["day"]))
                elif path in lottery_actions:
                    fields = ("day", "index", "requestId") if path.endswith("/star-gift") else ("machine", "requestId")
                    if url.query or set(payload) != set(fields):
                        raise ValueError("请仅提供星礼日期、份数与 UUID 请求标识" if path.endswith("/star-gift") else
                                         "请仅提供抽奖机与 UUID 请求标识；奖券、概率及奖品由服务器决定")
                    self._send(200, lottery_actions[path](*(payload[field] for field in fields)))
                elif path in arcade_actions:
                    fields, action = arcade_actions[path]
                    if url.query or set(payload) != set(fields):
                        raise ValueError("游乐参数无效；时间、次数与奖励由服务器决定")
                    self._send(200, action(*(payload[field] for field in fields)))
                elif path in study_actions:
                    fields, action = study_actions[path]
                    if url.query or set(payload) != set(fields):
                        raise ValueError("行动参数无效；请仅提供该操作所需的标识、版本和内容")
                    self._send(200, action(*(payload[field] for field in fields)))
                elif path == "/api/shop/exchange":
                    if url.query or set(payload) != {"diamonds", "requestId"}:
                        raise ValueError("请仅提供兑换钻石数量和请求标识，价格与时间由服务器确定")
                    self._send(200, store.exchange_diamonds(payload["diamonds"], payload["requestId"]))
                elif path == "/api/shop/exchange-coins":
                    if url.query or set(payload) != {"requestId"}:
                        raise ValueError("请仅提供请求标识；每次 1 钻石兑换 75 金币，每日最多 5 次")
                    self._send(200, store.exchange_coins(payload["requestId"]))
                elif path == "/api/quests/mystery/submit":
                    if url.query or set(payload) != {"requestId"}:
                        raise ValueError("请仅提供 UUID 请求标识；神秘委托时间、科目和奖励由服务器确定")
                    self._send(200, store.submit_mystery(payload["requestId"]))
                elif path == "/api/quests/submit":
                    if url.query or set(payload) != {"subject", "requestId"}:
                        raise ValueError("请仅提供交付科目和 UUID 请求标识，时间与奖励由服务器确定")
                    request_id = store._quest_request_id(payload["requestId"])
                    self._send(200, store.submit_quest(payload["subject"], request_id=request_id))
                elif path in quest_actions:
                    field, action = quest_actions[path]
                    if url.query or set(payload) != {field}:
                        raise ValueError("请仅提供操作标识；委托日期、时间和奖励由服务器确定")
                    self._send(200, action(payload[field]))
                elif path == "/api/settings":
                    if url.query or "targets" in payload or "weeklyTarget" in payload:
                        raise ValueError("每日和每周目标请到目标向导处设定；设置页面不能修改目标")
                    store.update_settings(payload)
                    self._send(200, store.state())
                elif path == "/api/opening/claim":
                    if not raw or payload or url.query:
                        raise ValueError("开场认领仅接受空 JSON 对象，不接受日期或时间参数")
                    self._send(200, store.claim_opening())
                elif path in ("/api/records/trash", "/api/records/restore"):
                    if set(payload) != {"id"}:
                        raise ValueError("请提供要操作的记录标识")
                    store.move_record(payload["id"], restore=path.endswith("/restore"))
                    self._send(200, store.state())
                else:
                    store.import_sources()
                    request = store.request_calendar_refresh()
                    self._send(200, dict(store.state(), refreshRequest=request))
            except (ValueError, UnicodeError) as error:
                self._send(400, {"error": str(error)})
            except (sqlite3.Error, OSError):
                self._send(500, {"error": "本地数据暂时无法保存"})

    return Handler


def main(argv=None):
    parser = argparse.ArgumentParser(description="Focus Quest · 本地学习远征")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--port", type=int, default=18473)
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")
    store = FocusStore(args.data_dir, args.source)
    server = FocusHTTPServer(("127.0.0.1", args.port), make_handler(store))
    stop = threading.Event()
    store.import_sources()

    def poll():
        while not stop.wait(POLL_SECONDS):
            store.import_sources(only_if_changed=True)

    poller = threading.Thread(target=poll, name="tomatodo-read-only-import", daemon=True)
    poller.start()

    def shutdown(signum, frame):
        stop.set()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    print(f"Focus Quest 已启动：http://127.0.0.1:{args.port}", flush=True)
    print(f"只读同步：{store.source}", flush=True)
    print(f"本地存档：{store.data_dir}", flush=True)
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        stop.set()
        server.server_close()
        poller.join(timeout=5)
        store.close()


if __name__ == "__main__":
    main()
