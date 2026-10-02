"""End-to-end polling check using only a temporary source and temporary archive."""
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from datetime import datetime
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


SERVER_PATH = Path(__file__).resolve().parents[1] / "outputs/focus-quest/server.py"


class LiveCaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="focus-quest-integration-")
        self.root = Path(self.temp.name)
        self.source = self.root / "temporary-tomatodo.json"
        self.data_dir = self.root / "temporary-archive"
        self.process = None
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            self.port = sock.getsockname()[1]
        self.base_url = f"http://127.0.0.1:{self.port}"

    def tearDown(self):
        self.stop_server()
        self.temp.cleanup()

    def write_source(self, records):
        pending = self.source.with_suffix(".pending")
        pending.write_text(json.dumps({"PCRecord": records}, ensure_ascii=False), encoding="utf-8")
        os.replace(pending, self.source)

    def start_server(self):
        self.process = subprocess.Popen(
            [sys.executable, str(SERVER_PATH), "--port", str(self.port),
             "--data-dir", str(self.data_dir), "--source", str(self.source)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        self.wait_for(lambda state: state["sync"]["connected"], timeout=5)

    def stop_server(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=6)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=3)
        self.process = None

    def get_state(self):
        with urlopen(self.base_url + "/api/state", timeout=2) as response:
            return json.load(response)

    def wait_for(self, predicate, timeout=8):
        deadline = time.monotonic() + timeout
        last_state = None
        while time.monotonic() < deadline:
            if self.process and self.process.poll() is not None:
                self.fail(f"server exited unexpectedly: {self.process.returncode}")
            try:
                last_state = self.get_state()
                if predicate(last_state):
                    return last_state
            except (URLError, TimeoutError, ConnectionError):
                pass
            time.sleep(0.15)
        self.fail(f"timed out waiting for automatic polling; last state: {last_state}")

    def test_real_poll_new_task_exactly_once_and_restart_persistence(self):
        # Everything is synthetic and isolated. The production source and
        # ~/Library/Application Support/FocusQuest are never opened.
        now_ms = int(datetime.now().timestamp() * 1000)
        first = {"id": 1, "name": "临时测试数学", "time": 30,
                 "startDate": now_ms - 30 * 60_000, "createDate": now_ms,
                 "isComplete": 1, "i6": 0, "s4": ""}
        second = {"id": 2, "name": "临时测试408", "time": 15,
                  "startDate": now_ms - 15 * 60_000, "createDate": now_ms + 1,
                  "isComplete": 1, "i6": 0, "s4": ""}
        self.write_source([first])
        self.start_server()
        initial = self.get_state()
        self.assertEqual(initial["allTime"]["records"], 1)
        self.assertEqual(initial["allTime"]["minutes"], 30)
        self.assertEqual(initial["sync"]["sourcePath"], str(self.source))

        # No POST /api/sync: only the real 3-second background poll may import it.
        self.write_source([first, second])
        captured = self.wait_for(lambda state: state["allTime"]["records"] == 2)
        self.assertEqual(captured["allTime"]["minutes"], 45)
        self.assertEqual(captured["totals"]["xp"], 45)
        second_key = f"2:{second['startDate']}"
        self.assertEqual(sum(item["id"] == second_key for item in captured["latestRecords"]), 1)
        self.assertEqual(captured["revision"], initial["revision"] + 1)

        # A duplicate copy plus changed sync metadata must add zero minutes.
        second["isSync"] = 1
        self.write_source([first, second, dict(second)])
        checked_at = captured["sync"]["lastCheck"]
        repeated = self.wait_for(lambda state: state["sync"]["lastCheck"] != checked_at)
        self.assertEqual(repeated["allTime"]["records"], 2)
        self.assertEqual(repeated["totals"]["xp"], 45)
        self.assertEqual(repeated["revision"], captured["revision"])

        # Removing the source's newest copy and restarting the real process
        # must retain the independently saved completed task.
        self.stop_server()
        self.write_source([first])
        source_snapshot = self.source.read_bytes()
        self.start_server()
        restored = self.get_state()
        self.assertEqual(restored["allTime"]["records"], 2)
        self.assertEqual(restored["allTime"]["minutes"], 45)
        self.assertEqual(restored["revision"], captured["revision"])
        self.assertEqual(self.source.read_bytes(), source_snapshot)
        self.assertTrue((self.data_dir / "focus-quest.sqlite3").is_file())


if __name__ == "__main__":
    unittest.main()
