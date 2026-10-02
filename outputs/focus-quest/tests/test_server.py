import copy
import importlib.util
import json
import tempfile
import threading
import unittest
from unittest.mock import patch as mock_patch
from datetime import datetime, timedelta
from http.client import HTTPConnection
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / "server.py"
spec = importlib.util.spec_from_file_location("focus_server", MODULE)
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


def epoch(value):
    return int(value.timestamp() * 1000)


def record(rid=1, name="复习数学", minutes=120, end=None, **overrides):
    end = end or datetime(2026, 9, 23, 10)
    result = {"id": rid, "name": name, "time": minutes,
              "startDate": epoch(end - timedelta(minutes=minutes)),
              "createDate": epoch(end), "isComplete": 1, "i6": 0, "s4": ""}
    result.update(overrides)
    return result


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.source = self.root / "tomatodo.json"
        self.store = server.FocusStore(self.root / "data", self.source)

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def write(self, records):
        self.source.write_text(json.dumps({"PCRecord": records}, ensure_ascii=False), encoding="utf-8")

    def state(self, hour=15):
        return self.store.state("2026-09-23", now=datetime(2026, 9, 23, hour))

    def test_minutes_progress_xp_and_classification(self):
        self.write([record(1, minutes=240), record(2, name="408 操作系统", minutes=120),
                    record(3, name="背单词", minutes=20), record(4, name="一段未命名学习", minutes=5)])
        original = self.source.read_bytes()
        self.assertEqual(self.store.import_source(), 4)
        state = self.state()
        self.assertEqual(state["subjects"][0]["percent"], 133.3)
        self.assertEqual(state["subjects"][1]["minutes"], 120)
        self.assertEqual(state["subjects"][3]["minutes"], 20)
        self.assertEqual(state["totals"]["minutes"], 385)
        self.assertEqual(state["totals"]["target"], 480)
        self.assertEqual(state["totals"]["level"], 4)
        self.assertEqual(state["totals"]["levelXp"], 25)
        self.assertEqual(state["unmapped"], ["一段未命名学习"])
        self.assertEqual(self.source.read_bytes(), original)
        self.store.update_settings({"mapping": {"一段未命名学习": "politics"}})
        self.assertEqual(self.state()["subjects"][2]["minutes"], 5)
        self.assertEqual(self.state()["unmapped"], [])

    def test_user_total_examples(self):
        self.write([record(minutes=120)])
        self.store.import_source()
        self.assertEqual(self.state()["totals"]["percent"], 25)
        self.write([record(minutes=360)])
        # Preserve start identity when correcting an existing duration.
        data = json.loads(self.source.read_text())
        data["PCRecord"][0]["startDate"] = record(minutes=120)["startDate"]
        self.source.write_text(json.dumps(data))
        self.store.import_source()
        self.assertEqual(self.state()["totals"]["percent"], 75)
        self.assertEqual(self.state()["allTime"]["records"], 1)

    def test_stable_dedup_sync_flags_and_edits(self):
        item = record()
        self.write([item])
        self.assertEqual(self.store.import_source(), 1)
        revision = self.store.revision
        item.update(isSync=1, device="private-device", account="private-account")
        self.write([item])
        self.assertEqual(self.store.import_source(), 0)
        self.assertEqual(self.store.revision, revision)
        item["time"] = 150
        item["name"] = "408"
        self.write([item])
        self.assertEqual(self.store.import_source(), 1)
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.assertEqual(self.state()["subjects"][1]["minutes"], 150)
        self.assertNotIn("private-account", json.dumps(self.state()))
        self.assertNotIn("account", [col[1] for col in self.store.db.execute("PRAGMA table_info(records)")])

    def test_midnight_archive_day_and_actual_finish(self):
        archive = datetime(2026, 9, 22, 23, 59, 59)
        actual = datetime(2026, 9, 23, 0, 18)
        item = record(minutes=25, end=actual, createDate=epoch(archive), i6=1, s4=str(actual.timestamp()))
        self.write([item])
        self.store.import_source()
        state = self.store.state("2026-09-22")
        self.assertEqual(state["totals"]["minutes"], 25)
        self.assertEqual(state["records"][0]["day"], "2026-09-22")
        self.assertTrue(state["records"][0]["end"].startswith("2026-09-23T00:18"))
        self.assertEqual(self.state()["totals"]["minutes"], 0)

    def test_missing_or_malformed_source_never_deletes_saved_history(self):
        self.write([record()])
        self.store.import_source()
        self.source.write_text('{"PCRecord": [')
        self.store.import_source()
        self.assertFalse(self.state()["sync"]["connected"])
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.source.unlink()
        self.store.import_source()
        self.assertEqual(self.state()["totals"]["minutes"], 120)
        self.write([])
        self.store.import_source()
        self.assertTrue(self.state()["sync"]["connected"])
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.store.close()
        self.store = server.FocusStore(self.root / "data", self.source)
        self.assertEqual(self.state()["totals"]["minutes"], 120)

    def test_filter_invalid_and_incomplete(self):
        self.write([record(1), record(2, isComplete=0), record(3, minutes=0),
                    record(4, time=-5), record(5, startDate="not-time"), {"id": 6}])
        self.store.import_source()
        self.assertEqual(self.state()["allTime"]["records"], 1)
        self.assertIsNone(server.normalize_record(record(7, time=float("nan"))))
        self.assertIsNone(server.normalize_record(record(8, time=True)))
        self.assertIsNone(server.normalize_record(record(9, time=float("inf"))))

    def test_settings_validation_merge_and_persistence(self):
        # Date the legacy goal epoch on the day represented by this fixture.
        with mock_patch.object(server, "quest_clock", return_value=datetime(2026, 9, 23, 8).astimezone()):
            self.store.update_settings({"targets": {"math": 240}, "sound": True})
        self.store.update_settings({"mapping": {"高数练习": "math"}})
        self.assertEqual(self.state()["totals"]["target"], 540)
        for patch in ({"targets": {"math": float("nan")}}, {"targets": {"math": 0}},
                      {"targets": {"math": True}}, {"targets": {"math": 2.5}},
                      {"targets": {"math": 1440}}, {"targets": {"evil": 10}},
                      {"mapping": {"a": "no-such-subject"}}, {"mapping": {"a": []}},
                      {"targets": {"math": 10**400}}, {"motion": "false"}, {"unexpected": 1}):
            with self.assertRaises(ValueError):
                self.store.update_settings(patch)
        self.store.close()
        self.store = server.FocusStore(self.root / "data", self.source)
        self.assertEqual(self.state()["settings"]["targets"]["math"], 240)
        self.assertTrue(self.state()["settings"]["sound"])
        self.assertEqual(self.state()["settings"]["mapping"], {"高数练习": "math"})

    def test_advice_morning_early_afternoon_and_balance(self):
        records = [record(minutes=40, end=datetime(2026, 9, 23, 9))]
        self.write(records)
        self.store.import_source()
        self.assertEqual(self.state(hour=11)["advice"]["id"], "start")
        records.append(record(2, minutes=320, end=datetime(2026, 9, 23, 12)))
        self.write(records)
        self.store.import_source()
        self.assertEqual(self.state(hour=13)["advice"]["id"], "early-progress")
        with mock_patch.object(server, "quest_clock", return_value=datetime(2026, 9, 23, 8).astimezone()):
            self.store.update_settings({"targets": {"math": 360, "cs": 180, "politics": 180, "english": 180}})
        records.append(record(3, name="408", minutes=180, end=datetime(2026, 9, 23, 14)))
        self.write(records)
        self.store.import_source()
        self.assertEqual(self.state(hour=16)["advice"]["id"], "balance")
        self.assertIn("政治", self.state(hour=16)["advice"]["text"])
        self.assertIn("英语", self.state(hour=16)["advice"]["text"])
        self.assertEqual(self.store.state("2026-09-22")["advice"]["id"], "history")

    def test_completed_goal_takes_priority_over_missing_subjects(self):
        self.write([record(1, minutes=240), record(2, name="408", minutes=240)])
        self.store.import_source()
        state = self.state(hour=16)
        self.assertEqual(state["advice"]["id"], "complete")
        self.assertIn("已经足够", state["advice"]["text"])
        self.assertIn("下次安排", state["advice"]["text"])
        self.assertIn("政治", state["advice"]["text"])
        self.assertIn("英语", state["advice"]["text"])

    def test_night_advice_does_not_push_more_study(self):
        self.write([record(1, minutes=180), record(2, name="408", minutes=180)])
        self.store.import_source()
        for hour in (0, 3, 6, 22, 23):
            self.assertEqual(self.state(hour=hour)["advice"]["id"], "night-rest")
        self.assertEqual(self.state(hour=16)["advice"]["id"], "balance")

    def test_early_progress_at_eleven(self):
        self.write([record(1, minutes=300, end=datetime(2026, 9, 23, 10))])
        self.store.import_source()
        self.assertEqual(self.state(hour=11)["advice"]["id"], "early-progress")

    def test_recent_continuous_work_rest(self):
        self.write([record(1, minutes=60, end=datetime(2026, 9, 23, 10, 0)),
                    record(2, minutes=60, end=datetime(2026, 9, 23, 11, 10))])
        self.store.import_source()
        recent = self.store.state("2026-09-23", now=datetime(2026, 9, 23, 11, 20))
        self.assertEqual(recent["advice"]["id"], "rest")
        self.assertNotEqual(self.state(hour=16)["advice"]["id"], "rest")

    def test_csv_and_record_limit(self):
        self.write([record(i, name="=1+2" if i == 1 else "数学", minutes=1) for i in range(1, 106)])
        self.store.import_source()
        self.assertEqual(len(self.state()["records"]), 100)
        self.assertEqual(self.state()["dayRecordCount"], 105)
        self.assertEqual(self.state()["totals"]["minutes"], 105)
        exported = self.store.export_csv().decode("utf-8-sig")
        self.assertEqual(len(exported.splitlines()), 106)
        self.assertIn("'=1+2", exported)

    def test_latest_records_and_names_independent_of_selected_day(self):
        self.write([record(1, name="历史任务", end=datetime(2026, 9, 22, 10))] +
                   [record(i, name="数学", minutes=1, end=datetime(2026, 9, 23, 10, i)) for i in range(2, 24)])
        self.store.import_source()
        state = self.store.state("2026-09-22")
        self.assertEqual(state["taskNames"], ["历史任务", "数学"])
        self.assertEqual(state["dayRecordCount"], 1)
        self.assertEqual(len(state["records"]), 1)
        self.assertEqual(len(state["latestRecords"]), 20)
        self.assertEqual(state["latestRecords"][0]["day"], "2026-09-23")
        self.assertEqual(set(state["latestRecords"][0]), set(state["records"][0]))
        self.assertEqual(state["latestRecords"][0]["end"], server.iso_ms(epoch(datetime(2026, 9, 23, 10, 23))))


class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.source = self.root / "source.json"
        self.source.write_text('{"PCRecord": []}')
        self.store = server.FocusStore(self.root / "data", self.source)
        static = self.root / "static"
        static.mkdir()
        (static / "index.html").write_text("<h1>Focus Quest</h1>")
        (self.root / "private.txt").write_text("private")
        self.http = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store, static))
        self.port = self.http.server_address[1]
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.store.close()
        self.tmp.cleanup()

    def request(self, method, path, body=None, headers=None):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=3)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        result = response.status, response.read()
        connection.close()
        return result

    def test_api_and_static(self):
        status, body = self.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {"ok": True})
        self.assertEqual(self.request("GET", "/")[0], 200)
        self.assertEqual(self.request("GET", "/../private.txt")[0], 404)
        self.assertEqual(self.request("GET", "/%2e%2e/private.txt")[0], 404)
        self.assertEqual(self.request("GET", "/api/state?date=invalid")[0], 400)

    def test_host_origin_and_json_validation(self):
        self.assertEqual(self.request("GET", "/api/state", headers={"Host": "evil.example"})[0], 403)
        valid = {"Content-Type": "application/json", "Origin": f"http://127.0.0.1:{self.port}"}
        self.assertEqual(self.request("POST", "/api/settings", '{"motion":false}', valid)[0], 200)
        invalid = dict(valid, Origin="https://evil.example")
        self.assertEqual(self.request("POST", "/api/settings", '{}', invalid)[0], 403)
        self.assertEqual(self.request("POST", "/api/settings", '{"targets":{"math":NaN}}', valid)[0], 400)
        self.assertEqual(self.request("POST", "/api/settings", '{}', {"Content-Type": "text/plain"})[0], 415)
        self.assertFalse(self.store.settings["motion"])


if __name__ == "__main__":
    unittest.main()
