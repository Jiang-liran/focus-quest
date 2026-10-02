"""Persistent admissions, safe legacy migration and atomic lottery exchange."""
import importlib.util
import json
import sqlite3
import tempfile
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("play_ticket_server", Path(__file__).resolve().parents[1]/"server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
NOW = datetime(2026, 10, 1, 18, tzinfo=timezone(timedelta(hours=8)))


def uid():
    return str(uuid.uuid4())


class PlayTicketTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name)/"data"
        self.source = Path(self.temp.name)/"absent.json"
        self.store = self.open_store()

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def open_store(self):
        with patch.object(server, "quest_clock", side_effect=lambda value=None: value or NOW):
            return server.FocusStore(self.data, self.source)

    def add(self, minutes, now=NOW, end=None):
        identity = uid()
        end = end or now-timedelta(minutes=1)
        with self.store.db:
            self.store.db.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?)", (identity, identity, "数学做题", minutes,
                int((end-timedelta(minutes=minutes)).timestamp()*1000), int(end.timestamp()*1000), now.date().isoformat(), "tomatodo"))
        return identity

    def fund(self, amount=1000):
        with self.store.db:
            self.store.db.execute("INSERT INTO wallet_ledger VALUES (?,?,0,?)", ("fixture:"+uid(), amount, int(NOW.timestamp()*1000)))

    def play(self, now=NOW):
        active = self.store.start_arcade("mines-beginner", uid(), now)["active"]
        return self.store.finish_arcade(active["id"], active["version"], now)

    def legacy(self):
        with self.store.db:
            for table in ("arcade_play_ticket_ledger", "arcade_ticket_earnings", "arcade_ticket_record_credits", "arcade_ticket_merge_credits"):
                self.store.db.execute("DELETE FROM "+table)
            self.store.db.execute("DELETE FROM meta WHERE key=?", (server.PLAY_TICKETS_START_META,))
        self.store._play_ticket_sync_cache = None

    def rows(self):
        return {row[0]: [tuple(record) for record in self.store.db.execute('SELECT * FROM "'+row[0]+'" ORDER BY rowid')]
                for row in self.store.db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}

    def test_migration_preserves_today_unused_only_and_does_not_backfill_expired_dates(self):
        self.add(120)
        self.add(240, NOW-timedelta(days=1))
        self.fund()
        for _ in range(2):
            self.store.buy_arcade_ticket(uid(), NOW)
        for _ in range(3):
            self.play()
        self.legacy()
        old = {table: values for table, values in self.rows().items() if table not in
               {"meta", "arcade_play_ticket_ledger", "arcade_ticket_earnings", "arcade_ticket_record_credits", "arcade_ticket_merge_credits"}}
        state = self.store.arcade_state(NOW)
        self.assertEqual((state["earned"], state["purchased"], state["used"], state["available"]), (4, 2, 3, 3))
        self.assertTrue(state["persistentTickets"])
        self.assertEqual(state["playsRemaining"], 8)
        self.assertEqual(self.store._meta(server.PLAY_TICKETS_START_META), "2026-10-01")
        for table, values in old.items():
            self.assertEqual(self.rows()[table], values)
        self.store.close(); self.store = self.open_store()
        self.assertEqual(self.store.arcade_state(NOW)["available"], 3)
        self.assertEqual(self.store.arcade_state(NOW+timedelta(days=1))["available"], 3)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM arcade_ticket_earnings").fetchone()[0], 1)

    def test_deleted_legacy_study_restore_does_not_recreate_spent_tickets(self):
        record = self.add(90)
        for _ in range(2): self.play()
        with self.store.db:
            self.store.db.execute("INSERT INTO record_lifecycle VALUES (?,?,?,?)", (record, NOW.isoformat(), "manual", "delete"))
        self.legacy()
        self.assertEqual(self.store.arcade_state(NOW)["available"], 0)
        with self.store.db: self.store.db.execute("DELETE FROM record_lifecycle")
        self.assertEqual(self.store.arcade_state(NOW)["available"], 0)
        self.add(60)
        self.assertEqual(self.store.arcade_state(NOW)["available"], 2)

    def test_unused_study_and_purchased_tickets_survive_midnight_and_restart(self):
        self.add(90); self.fund(50)
        self.store.buy_arcade_ticket(uid(), NOW)
        self.play()
        self.assertEqual(self.store.arcade_state(NOW)["available"], 3)
        self.store.close(); self.store = self.open_store()
        tomorrow = NOW+timedelta(days=1)
        state = self.store.arcade_state(tomorrow)
        self.assertEqual((state["earned"], state["purchased"], state["used"], state["available"]), (0, 0, 0, 3))
        self.assertEqual(self.play(tomorrow)["available"], 2)

    def test_unvisited_post_upgrade_dates_accrue_from_headless_sync(self):
        self.store.arcade_state(NOW)
        for days, minutes in ((1, 60), (2, 270), (3, 29.99)):
            self.add(minutes, NOW+timedelta(days=days))
        with patch.object(server, "quest_clock", side_effect=lambda value=None: value or NOW+timedelta(days=3)):
            self.store.import_sources(only_if_changed=True)
        self.assertEqual(self.store._play_ticket_balance(), 10)
        state = self.store.arcade_state(NOW+timedelta(days=3))
        self.assertEqual((state["earned"], state["available"]), (0, 10))
        self.assertEqual(state["nextTicketMinutes"], 0.01)

    def test_deletion_restore_duration_and_date_edits_cannot_remint(self):
        record = self.add(120)
        state = self.store.arcade_state(NOW)
        self.assertEqual(state["available"], 4)
        with self.store.db:
            self.store.db.execute("INSERT INTO record_lifecycle VALUES (?,?,?,?)", (record, NOW.isoformat(), "manual", "delete"))
        state = self.store.arcade_state(NOW)
        self.assertEqual((state["available"], state["studyMinutes"], state["nextTicketMinutes"]), (4, 0, 30))
        with self.store.db:
            self.store.db.execute("DELETE FROM record_lifecycle")
            self.store.db.execute("UPDATE records SET minutes=30 WHERE id=?", (record,))
        self.assertEqual(self.store.arcade_state(NOW)["available"], 4)
        tomorrow = NOW+timedelta(days=1)
        with self.store.db:
            self.store.db.execute("UPDATE records SET minutes=120,day=?,end_ms=? WHERE id=?", (tomorrow.date().isoformat(), int(tomorrow.timestamp()*1000), record))
        self.assertEqual(self.store.arcade_state(tomorrow)["available"], 4)
        self.add(30, tomorrow)
        self.assertEqual(self.store.arcade_state(tomorrow)["available"], 5)

    def test_future_completion_invalidates_cache_without_revision_change(self):
        self.store.arcade_state(NOW)
        self.add(30, end=NOW+timedelta(minutes=1))
        self.assertEqual(self.store.arcade_state(NOW)["available"], 0)
        revision = self.store._meta("revision")
        self.assertEqual(self.store.arcade_state(NOW+timedelta(seconds=59))["available"], 0)
        self.assertEqual(self.store._meta("revision"), revision)
        self.assertEqual(self.store.arcade_state(NOW+timedelta(minutes=1))["available"], 1)

    def test_new_study_after_deletion_earns_next_ticket_after_thirty_minutes(self):
        record = self.add(120)
        self.store.arcade_state(NOW)
        with self.store.db:
            self.store.db.execute("INSERT INTO record_lifecycle VALUES (?,?,?,?)", (record, NOW.isoformat(), "manual", "delete"))
        self.add(29.99)
        state = self.store.arcade_state(NOW)
        self.assertEqual((state["available"], state["nextTicketMinutes"]), (4, 0.01))
        self.add(0.01)
        self.assertEqual(self.store.arcade_state(NOW)["available"], 5)
        with self.store.db: self.store.db.execute("DELETE FROM record_lifecycle")
        self.assertEqual(self.store.arcade_state(NOW)["available"], 5)

    def test_unchanged_polls_do_not_write_or_rescan_record_credit_issuance(self):
        self.add(60); self.store.arcade_state(NOW)
        changes, statements = self.store.db.total_changes, []
        self.store.db.set_trace_callback(statements.append)
        try:
            for _ in range(4): self.store.arcade_state(NOW+timedelta(seconds=1))
        finally: self.store.db.set_trace_callback(None)
        self.assertEqual(self.store.db.total_changes, changes)
        self.assertFalse(any("LEFT JOIN arcade_ticket_record_credits" in sql for sql in statements))

    def test_history_merge_inherits_all_already_credited_duration(self):
        ids = [self.add(amount) for amount in (20, 10, 66)]
        self.assertEqual(self.store.arcade_state(NOW)["available"], 3)
        with self.store._quest_transaction():
            authority = dict(self.store.db.execute("SELECT * FROM records WHERE id=?", (ids[0],)).fetchone())
            authority["minutes"] = 96
            self.store._merge_history_records(ids, authority)
            self.store._bump_revision()
        self.assertEqual(self.store.arcade_state(NOW)["available"], 3)
        self.assertEqual(self.store.arcade_state(NOW)["ticketProgressMinutes"], 96)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM arcade_ticket_merge_credits").fetchone()[0], 2)

    def test_accumulated_balance_still_obeys_eleven_games_per_day(self):
        self.add(240); self.store.arcade_state(NOW)
        tomorrow = NOW+timedelta(days=1)
        self.add(240, tomorrow)
        self.assertEqual(self.store.arcade_state(tomorrow)["available"], 16)
        for _ in range(11): state = self.play(tomorrow)
        self.assertEqual((state["available"], state["playsRemaining"], state["canPlay"]), (5, 0, False))
        with self.assertRaisesRegex(ValueError, "明天"):
            self.store.start_arcade("mines-beginner", uid(), tomorrow)
        exchanged = self.store.exchange_play_tickets("diamond", uid(), tomorrow)
        self.assertEqual(exchanged["arcade"]["available"], 1)
        self.assertEqual(exchanged["lottery"]["tickets"]["diamond"], 1)

    def test_exchange_costs_balances_caps_and_payloads_are_server_authoritative(self):
        self.add(240)
        self.fund()
        self.store.lottery_state(NOW)
        wallet = self.store._wallet()
        for machine, cost in (("coin", 2), ("diamond", 4)):
            result = self.store.exchange_play_tickets(machine, uid(), NOW)
            self.assertEqual(result["result"], {"type": "ticket", "machine": machine, "amount": 1,
                "source": "playTicketExchange", "playTicketsSpent": cost})
            self.assertEqual(result["lottery"], result["quests"]["lottery"])
            self.assertEqual(result["lottery"]["playTickets"]["available"], result["arcade"]["available"])
            self.assertEqual(self.store._wallet(), wallet)
            row = next(row for row in result["lottery"]["machines"] if row["id"] == machine)
            self.assertEqual((row["purchasesToday"], row["purchasesRemaining"]), (0, 10))
            self.assertEqual(row["exchange"]["cost"], cost)
        self.assertEqual(result["arcade"]["available"], 2)
        self.assertEqual(result["lottery"]["tickets"], {"coin": 1, "diamond": 1})
        before = self.rows()
        with self.assertRaisesRegex(ValueError, "4 张"):
            self.store.exchange_play_tickets("diamond", uid(), NOW)
        self.assertEqual(self.rows(), before)

    def test_exchange_has_no_daily_cap_and_retries_survive_restart_midnight(self):
        self.add(240); self.store.arcade_state(NOW)
        tomorrow = NOW+timedelta(days=1)
        self.add(240, tomorrow)
        request = uid()
        first = self.store.exchange_play_tickets("coin", request, tomorrow)
        for _ in range(5): self.store.exchange_play_tickets("coin", uid(), tomorrow)
        self.assertEqual(self.store.arcade_state(tomorrow)["available"], 4)
        self.store.close(); self.store = self.open_store()
        retry = self.store.exchange_play_tickets("coin", request, tomorrow+timedelta(days=1))
        self.assertTrue(retry["alreadyProcessed"])
        self.assertEqual(retry["result"], first["result"])
        self.assertEqual(retry["lottery"]["tickets"]["coin"], 6)
        self.assertEqual(retry["arcade"]["available"], 4)
        with self.assertRaises(ValueError): self.store.exchange_play_tickets("diamond", request, tomorrow)
        with self.assertRaises(ValueError): self.store.buy_lottery_ticket("coin", request, tomorrow)

    def test_exchange_failure_rolls_back_both_tickets_request_and_revision(self):
        self.add(60); self.store.lottery_state(NOW)
        with self.store.db:
            self.store.db.execute("CREATE TRIGGER reject_exchange BEFORE INSERT ON lottery_ticket_ledger WHEN NEW.source='play-ticket-exchange' BEGIN SELECT RAISE(ABORT,'fixture'); END")
        before, request = self.rows(), uid()
        with self.assertRaises(sqlite3.IntegrityError): self.store.exchange_play_tickets("coin", request, NOW)
        self.assertEqual(self.rows(), before)
        with self.store.db: self.store.db.execute("DROP TRIGGER reject_exchange")
        self.assertEqual(self.store.exchange_play_tickets("coin", request, NOW)["arcade"]["available"], 0)

    def test_game_and_purchase_ledger_failures_roll_back_all_related_writes(self):
        self.add(30); self.fund(50); self.store.arcade_state(NOW)
        for source, operation in (("game", lambda: self.store.start_arcade("mines-beginner", uid(), NOW)),
                                  ("purchase", lambda: self.store.buy_arcade_ticket(uid(), NOW))):
            with self.store.db:
                self.store.db.execute(f"CREATE TRIGGER reject_play_ticket BEFORE INSERT ON arcade_play_ticket_ledger WHEN NEW.source='{source}' BEGIN SELECT RAISE(ABORT,'fixture'); END")
            before = self.rows()
            with self.assertRaises(sqlite3.IntegrityError): operation()
            self.assertEqual(self.rows(), before)
            with self.store.db: self.store.db.execute("DROP TRIGGER reject_play_ticket")

    def test_concurrent_first_migration_issues_the_existing_balance_once(self):
        self.add(120)
        other, barrier = self.open_store(), threading.Barrier(2)
        def snapshot(store):
            barrier.wait()
            return store.arcade_state(NOW)
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(snapshot, (self.store, other)))
            self.assertEqual([result["available"] for result in results], [4, 4])
            self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM arcade_play_ticket_ledger").fetchone()[0], 1)
            self.assertEqual(self.store._play_ticket_balance(), 4)
        finally: other.close()

    def test_purchase_cap_resets_daily_while_purchased_ticket_inventory_accumulates(self):
        self.fund(300)
        for days in (0, 1):
            current = NOW+timedelta(days=days)
            for _ in range(3): state = self.store.buy_arcade_ticket(uid(), current)
            self.assertEqual((state["available"], state["purchased"], state["purchaseRemaining"]), ((days+1)*3, 3, 0))
            with self.assertRaisesRegex(ValueError, "3 张"): self.store.buy_arcade_ticket(uid(), current)
        self.assertEqual(self.store._wallet()["coins"], 0)

    def test_competing_game_and_exchange_cannot_spend_the_same_admissions(self):
        self.add(60); self.store.lottery_state(NOW)
        other, barrier = self.open_store(), threading.Barrier(2)
        def execute(store, game):
            barrier.wait()
            try:
                return store.start_arcade("mines-beginner", uid(), NOW) if game else store.exchange_play_tickets("coin", uid(), NOW)
            except ValueError: return None
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda pair: execute(*pair), ((self.store, True), (other, False))))
            self.assertEqual(sum(result is not None for result in results), 1)
            state = self.store.arcade_state(NOW)
            self.assertEqual(state["available"], 1 if results[0] else 0)
            self.assertEqual(self.store.lottery_state(NOW)["tickets"]["coin"], 0 if results[0] else 1)
        finally: other.close()

    def test_same_exchange_id_concurrently_debits_and_grants_once(self):
        self.add(120); self.store.lottery_state(NOW)
        other, barrier, request = self.open_store(), threading.Barrier(2), uid()
        def exchange(store):
            barrier.wait()
            return store.exchange_play_tickets("diamond", request, NOW)
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(exchange, (self.store, other)))
            self.assertEqual(results[0]["result"], results[1]["result"])
            self.assertEqual(sum(result["alreadyProcessed"] for result in results), 1)
            self.assertEqual(self.store.arcade_state(NOW)["available"], 0)
            self.assertEqual(self.store.lottery_state(NOW)["tickets"]["diamond"], 1)
        finally: other.close()

    def test_http_exchange_rejects_extra_fields_query_and_cross_origin(self):
        self.add(60); self.store.lottery_state(NOW)
        http = server.FocusHTTPServer(("127.0.0.1", 0), server.make_handler(self.store))
        thread = threading.Thread(target=http.serve_forever, daemon=True); thread.start()
        def post(body, path="/api/lottery/exchange", origin=None):
            conn = HTTPConnection("127.0.0.1", http.server_address[1], timeout=3)
            conn.request("POST", path, json.dumps(body), {"Content-Type": "application/json", "Origin": origin or f"http://127.0.0.1:{http.server_address[1]}"})
            response = conn.getresponse(); result = response.status, json.loads(response.read()); conn.close(); return result
        try:
            with patch.object(server, "quest_clock", side_effect=lambda value=None: value or NOW):
                payload = {"machine": "coin", "requestId": uid()}
                for extra in ("cost", "amount", "playTicketsSpent", "coins"):
                    self.assertEqual(post(dict(payload, **{extra: 0}))[0], 400)
                self.assertEqual(post(payload, "/api/lottery/exchange?cost=0")[0], 400)
                self.assertEqual(post(payload, origin="https://other.example")[0], 403)
                status, result = post(payload)
                self.assertEqual(status, 200)
                self.assertEqual(result["arcade"]["available"], 0)
                self.assertEqual(result["lottery"]["tickets"]["coin"], 1)
                self.assertTrue(post(payload)[1]["alreadyProcessed"])
        finally: http.shutdown(); http.server_close(); thread.join()


if __name__ == "__main__":
    unittest.main()
