"""Daily start rewards use actual starting instants, isolated test databases only."""
import importlib.util, json, tempfile, unittest, uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('early_server',Path(__file__).resolve().parents[1]/'server.py')
server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
TZ=timezone(timedelta(hours=8))
DAY=datetime(2026,10,5,tzinfo=TZ)
def at(h=0,m=0,day=0):return DAY+timedelta(days=day,hours=h,minutes=m)
def ms(t):return int(t.timestamp()*1000)
class EarlyStartTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.source=self.root/'source.json';self.source.write_text(json.dumps({'PCRecord':[],'PCToDo':[]}))
        self.store=server.FocusStore(self.root/'data',self.source)
        # The fixture runs in October 5, independent of the host's real date.
        # Both features must already exist before its simulated rewards occur.
        with self.store.db:
            self.store._set_meta(server.EARLY_START_META,ms(at()))
            self.store._set_meta(server.LOTTERY_START_META,ms(at()))
    def tearDown(self):self.store.close();self.tmp.cleanup()
    def add(self,start,end=None,name='数学听课',source='tomatodo',minutes=None):
        end=end or start+timedelta(minutes=25);key=str(uuid.uuid4())
        with self.store.db:self.store.db.execute('INSERT INTO records VALUES (?,?,?,?,?,?,?,?)',(key,key,name,(end-start).total_seconds()/60 if minutes is None else minutes,ms(start),ms(end),end.date().isoformat(),source))
        return key
    def sync(self,now=None):self.store._sync_early_start_rewards(now or at(23));return self.store.early_start_state(now or at(23))
    def reward(self):return self.store._wallet()
    def tickets(self):
        return {kind:self.store.db.execute('SELECT COALESCE(SUM(amount),0) FROM lottery_ticket_ledger WHERE machine=?',(kind,)).fetchone()[0] for kind in ('coin','diamond')}
    def test_exact_hour_boundaries_and_start_not_completion(self):
        for hour,minute,expected in [(6,30,(90,2)),(7,59,(90,2)),(8,0,(60,1)),(8,59,(60,1)),(9,0,(30,1)),(9,59,(30,1)),(10,0,(0,0))]:
            with self.subTest(hour=hour,minute=minute):
                self.store.db.execute('DELETE FROM records');self.store.db.execute('DELETE FROM early_start_rewards');self.store.db.execute("DELETE FROM wallet_ledger WHERE reference LIKE 'early-start:%'");self.store.db.execute("DELETE FROM lottery_ticket_ledger WHERE reference LIKE 'early-start:%'");self.store.db.commit()
                self.add(at(hour,minute),at(11));r=self.sync()
                self.assertEqual((r['reward']['coins'],r['reward']['diamonds']),expected)
                self.assertEqual(r['firstStart'],server.iso_ms(ms(at(hour,minute))))
                expected_tickets=(1,1) if hour<8 else (0,1) if hour<9 else (1,0) if hour<10 else (0,0)
                self.assertEqual(r['lotteryTickets'],dict(zip(('coinTickets','diamondTickets'),expected_tickets)))
                self.assertEqual(self.tickets(),dict(zip(('coin','diamond'),expected_tickets)))
    def test_earliest_start_wins_even_when_it_finishes_last(self):
        self.add(at(9),at(9,25));self.add(at(7,20),at(11))
        self.assertEqual(self.sync()['reward'],{'coins':90,'diamonds':2})
    def test_late_earlier_sync_tops_up_only_gap_and_is_idempotent(self):
        self.add(at(9,15));self.assertEqual(self.sync()['reward'],{'coins':30,'diamonds':1})
        self.add(at(7,45),at(11));self.assertEqual(self.sync()['reward'],{'coins':90,'diamonds':2})
        for _ in range(10):self.sync()
        self.assertEqual(self.reward(),{'coins':90,'diamonds':2})
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM wallet_ledger WHERE reference LIKE 'early-start:%'").fetchone()[0],1)
        self.assertEqual(self.tickets(),{'coin':1,'diamond':1})
    def test_words_count_and_future_zero_unmapped_and_trash_do_not(self):
        self.add(at(6),at(6,30),name='其他事情')
        deleted=self.add(at(6,30));self.store.move_record(deleted)
        self.add(at(6,40),at(7),minutes=0)
        self.add(at(6,50),at(13))
        self.add(at(8,30),name='背单词')
        self.assertEqual(self.sync(at(12))['reward'],{'coins':60,'diamonds':1})
        self.assertEqual(self.sync(at(14))['reward'],{'coins':90,'diamonds':2})
    def test_cross_midnight_belongs_to_start_day_and_new_day_has_own_start(self):
        self.add(at(23,40),at(0,10,1));self.sync(at(1,0,1))
        self.assertEqual(self.reward(),{'coins':0,'diamonds':0})
        self.assertEqual(self.tickets(),{'coin':0,'diamond':0})
        self.add(at(7,30,1));r=self.sync(at(9,0,1))
        self.assertEqual(r['reward'],{'coins':90,'diamonds':2});self.assertEqual(r['day'],'2026-10-06')
    def test_login_and_greeting_preview_do_not_grant_rewards(self):
        self.add(at(7))
        for _ in range(3):self.store.opening(now=at(9));self.store.claim_opening(now=at(9))
        self.assertEqual(self.reward(),{'coins':0,'diamonds':0})
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM early_start_rewards').fetchone()[0],0)
        self.assertEqual(self.sync()['reward'],{'coins':90,'diamonds':2})
    def test_installation_does_not_backfill_existing_completed_days(self):
        with self.store.db:self.store._set_meta(server.EARLY_START_META,ms(at(12)))
        self.add(at(7));self.add(at(7,0,-1));self.sync()
        self.assertEqual(self.reward(),{'coins':0,'diamonds':0})
        self.assertEqual(self.store.early_start_state(at(13))['status'],'prior')
        self.add(at(7,30,1));self.assertEqual(self.sync(at(9,0,1))['reward'],{'coins':90,'diamonds':2})
    def test_claim_survives_restart_and_trash_without_second_reward(self):
        key=self.add(at(7,30));self.sync();self.store.move_record(key)
        self.store.close();self.store=server.FocusStore(self.root/'data',self.source)
        self.add(at(8,30));self.sync()
        self.assertEqual(self.reward(),{'coins':90,'diamonds':2})
        self.assertEqual(self.tickets(),{'coin':1,'diamond':1})
    def test_concurrent_connections_credit_one_learning_day(self):
        self.add(at(7,45));stores=[server.FocusStore(self.root/'data',self.source) for _ in range(4)]
        try:
            with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(lambda store:store._sync_early_start_rewards(at(12)),stores))
            self.assertEqual(self.reward(),{'coins':90,'diamonds':2})
            self.assertEqual(self.tickets(),{'coin':1,'diamond':1})
            self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM early_start_rewards').fetchone()[0],1)
        finally:
            for store in stores:store.close()
    def test_reading_a_history_date_rewards_today_without_spending_study_records(self):
        self.add(at(7,30),name='背单词');before=[tuple(r) for r in self.store.db.execute('SELECT * FROM records')]
        result=self.store.state('2026-10-04',now=at(9))
        self.assertEqual(result['quests']['earlyStart']['day'],'2026-10-05')
        self.assertEqual(result['quests']['wallet'],{'coins':90,'diamonds':2})
        self.assertEqual(result['quests']['lottery']['tickets'],{'coin':1,'diamond':1})
        self.assertTrue(any(row['source']=='early-start' for row in result['quests']['lottery']['grants']))
        self.assertEqual([tuple(r) for r in self.store.db.execute('SELECT * FROM records')],before)
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM quest_allocations').fetchone()[0],0)
    def test_stable_polling_skips_archive_scan_and_external_changes_invalidate_cache(self):
        self.add(at(9));self.sync(at(12));queries=[]
        self.store.db.set_trace_callback(queries.append)
        for _ in range(20):self.sync(at(12,1))
        self.store.db.set_trace_callback(None)
        self.assertFalse(any('SELECT DISTINCT start_ms' in q for q in queries))
        other=server.FocusStore(self.root/'data',self.source)
        try:
            key='late-earlier';start,end=at(7),at(8)
            with other.db:other.db.execute('INSERT INTO records VALUES (?,?,?,?,?,?,?,?)',(key,key,'数学听课',60,ms(start),ms(end),start.date().isoformat(),'tomatodo'))
            self.assertEqual(self.sync(at(12,2))['reward'],{'coins':90,'diamonds':2})
        finally:other.close()
    def test_earlier_evidence_preserves_spent_tickets_without_duplicate_grants(self):
        self.add(at(9,15));self.sync()
        with self.store.db:self.store.db.execute('INSERT INTO lottery_ticket_ledger VALUES (?,?,?,?,?,?)',('fixture:spent','coin',-1,ms(at(12)),'fixture','spent'))
        self.add(at(8,15));state=self.sync()
        self.assertEqual(state['lotteryTickets'],{'coinTickets':1,'diamondTickets':1})
        self.assertEqual(self.tickets(),{'coin':0,'diamond':1})
        self.add(at(7,15));self.sync()
        self.assertEqual(self.tickets(),{'coin':0,'diamond':1})
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM lottery_ticket_ledger WHERE source='early-start'").fetchone()[0],2)
    def test_ticket_failure_rolls_back_currency_and_receipt_together(self):
        self.add(at(7));original=self.store._grant_lottery_ticket
        def fail_second(reference,machine,*args):
            if machine=='diamond':raise RuntimeError('test grant failure')
            return original(reference,machine,*args)
        with patch.object(self.store,'_grant_lottery_ticket',side_effect=fail_second):
            with self.assertRaises(RuntimeError):self.sync()
        self.assertEqual(self.reward(),{'coins':0,'diamonds':0})
        self.assertEqual(self.tickets(),{'coin':0,'diamond':0})
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM early_start_rewards').fetchone()[0],0)
        self.sync();self.assertEqual(self.tickets(),{'coin':1,'diamond':1})
    def test_previous_currency_receipt_gets_missing_tickets_once_after_upgrade(self):
        key=self.add(at(7))
        with self.store.db:
            self.store.db.execute('INSERT INTO early_start_rewards VALUES (?,?,?,?,?,?)',('2026-10-05',key,ms(at(7)),90,2,ms(at(10))))
            self.store.db.execute('INSERT INTO wallet_ledger VALUES (?,?,?,?)',('early-start:2026-10-05',90,2,ms(at(10))))
        for _ in range(3):self.sync()
        self.assertEqual(self.reward(),{'coins':90,'diamonds':2})
        self.assertEqual(self.tickets(),{'coin':1,'diamond':1})
if __name__=='__main__':unittest.main()
