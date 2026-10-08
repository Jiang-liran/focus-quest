"""Optional island rebuilds preserve independent decorations and legacy ownership."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
spec = importlib.util.spec_from_file_location('architecture_server', Path(__file__).resolve().parents[1] / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

class ArchitectureShopTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = server.FocusStore(self.root / 'data', self.root / 'absent.json')
    def tearDown(self):
        self.store.close()
        self.temp.cleanup()
    def test_optional_drawable_and_independent_equipment(self):
        before = self.store.quest_state()
        for kind in ('archipelago','homeland'):
            self.assertEqual(before['equipped'][kind],kind+'-default')
            for style,pool in [('harbor','coinItem'),('starglass','diamondItem')]:
                item_id=kind+'-'+style
                self.assertIn(item_id,{i['id'] for i in self.store._lottery_pools()[pool]})
                with self.assertRaises(ValueError):self.store.equip_item(item_id)
        with self.store.db:self.store.db.execute("INSERT INTO wallet_ledger VALUES ('architecture-test',10000,1000,0)")
        for item in ['island-pavilion','relic-lotus','companion-owl','portal-moon','archipelago-harbor','homeland-starglass']:
            self.store.buy_item(item);self.store.equip_item(item)
        selected=self.store.quest_state()['equipped']
        self.store.equip_item('archipelago-default')
        result=self.store.equip_item('homeland-default')
        for slot in ['island','relic','companion','portal']:self.assertEqual(result['equipped'][slot],selected[slot])
        self.assertEqual(result['equipped']['archipelago'],'archipelago-default')
        self.assertEqual(result['equipped']['homeland'],'homeland-default')
        self.assertTrue(next(i for i in result['catalog'] if i['id']=='archipelago-harbor')['owned'])
    def test_upgrade_only_adds_free_defaults(self):
        with self.store.db:self.store.db.execute("INSERT INTO wallet_ledger VALUES ('archive-fixture',2400,100,0)")
        self.store.buy_item('island-garden');self.store.equip_item('island-garden')
        with self.store.db:self.store.db.execute("DELETE FROM shop_equipment WHERE slot IN ('archipelago','homeland')")
        before=self.store.quest_state()
        ledger=list(map(tuple,self.store.db.execute('SELECT * FROM wallet_ledger ORDER BY rowid')))
        self.store.close();self.store=server.FocusStore(self.root/'data',self.root/'absent.json')
        state=self.store.quest_state()
        self.assertEqual(state['wallet'],before['wallet'])
        self.assertEqual(list(map(tuple,self.store.db.execute('SELECT * FROM wallet_ledger ORDER BY rowid'))),ledger)
        self.assertEqual(state['equipped']['island'],'island-garden')
        items=[i for i in state['catalog'] if i['slot'] in ('homeland','archipelago')]
        self.assertEqual(len(items),6)
        self.assertEqual({i['id'] for i in items if i['owned']},{'homeland-default','archipelago-default'})
    def test_individual_slots_purchase_mix_restore_and_restart_without_touching_study_or_other_equipment(self):
        slots=('campusmath','campuscs','campuspolitics','campusenglish')
        state=self.store.quest_state()
        for slot in slots:
            self.assertEqual(state['equipped'][slot],slot+'-default')
            items=[i for i in state['catalog'] if i['slot']==slot]
            self.assertEqual(len(items),5)
            self.assertEqual(sum(i['owned'] for i in items),2)
            for item in items:
                if item['coins'] or item['diamonds']:
                    pool='coinItem' if item['coins'] else 'diamondItem'
                    self.assertIn(item['id'],{i['id'] for i in self.store._lottery_pools()[pool]})
                    with self.assertRaises(ValueError):self.store.equip_item(item['id'])
        with self.store.db:self.store.db.execute("INSERT INTO wallet_ledger VALUES ('individual-fixture',10000,1000,0)")
        records=list(map(tuple,self.store.db.execute('SELECT * FROM records')))
        self.store.buy_item('archipelago-starglass');self.store.equip_item('archipelago-starglass')
        for item_id in ['campusmath-spiral','campuscs-workshop','campuspolitics-archive','campusenglish-greenhouse']:
            self.store.buy_item(item_id);before=self.store.quest_state()['equipped'];self.store.equip_item(item_id)
            after=self.store.quest_state()['equipped'];slot=server.SHOP_ITEMS[item_id]['slot']
            self.assertEqual({k:v for k,v in before.items() if k!=slot},{k:v for k,v in after.items() if k!=slot})
        before=self.store.quest_state()
        self.store.close();self.store=server.FocusStore(self.root/'data',self.root/'absent.json')
        after=self.store.quest_state()
        self.assertEqual(before['wallet'],after['wallet']);self.assertEqual(before['equipped'],after['equipped'])
        self.assertEqual(records,list(map(tuple,self.store.db.execute('SELECT * FROM records'))))
        self.store.equip_item('campuspolitics-original');after=self.store.equip_item('campusenglish-default')
        self.assertEqual(after['equipped']['archipelago'],'archipelago-starglass')
        self.assertEqual(after['equipped']['campusmath'],'campusmath-spiral')
        self.assertEqual(after['equipped']['campuscs'],'campuscs-workshop')
        self.assertEqual(before['wallet'],after['wallet'])
    def test_legacy_migration_only_adds_four_follow_suite_defaults(self):
        slots=('campusmath','campuscs','campuspolitics','campusenglish')
        with self.store.db:
            self.store.db.execute("INSERT INTO wallet_ledger VALUES ('legacy-style-fixture',4000,100,0)")
            self.store.db.executemany('DELETE FROM shop_equipment WHERE slot=?',[(s,) for s in slots])
        self.store.buy_item('archipelago-harbor');self.store.equip_item('archipelago-harbor')
        before=self.store.quest_state();ledger=list(map(tuple,self.store.db.execute('SELECT * FROM wallet_ledger')))
        self.store.close();self.store=server.FocusStore(self.root/'data',self.root/'absent.json')
        after=self.store.quest_state()
        self.assertEqual(before['wallet'],after['wallet'])
        self.assertEqual(ledger,list(map(tuple,self.store.db.execute('SELECT * FROM wallet_ledger'))))
        for slot in slots:self.assertEqual(after['equipped'].pop(slot),slot+'-default')
        self.assertEqual(before['equipped'],after['equipped'])
if __name__=='__main__':unittest.main()
