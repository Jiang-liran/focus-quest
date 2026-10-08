"""Catalog breadth, honest price partitions, and permanent equipment integration."""
import importlib.util
import hashlib
import json
import shutil
import subprocess
import tempfile
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from shop_catalog_expansion import (SHOP_CATALOG_EXTRA, SHOP_ITEM_META,
                                    SHOP_LOTTERY_EXCLUSIVE_IDS,
                                    SHOP_LOTTERY_ONLY_BY_MACHINE, SHOP_LOTTERY_ONLY_IDS)

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('catalog_expansion_server', ROOT / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
NOW = datetime(2026, 9, 30, 18, tzinfo=timezone(timedelta(hours=8)))


class ExpansionCatalogTests(unittest.TestCase):
    def test_broad_catalog_is_single_currency_and_contains_affordable_midrange_and_top_collections(self):
        ids = [row[0] for row in SHOP_CATALOG_EXTRA]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(server.SHOP_ITEMS), 434)
        self.assertEqual(len(SHOP_CATALOG_EXTRA), 304)
        purchasable = [row for row in SHOP_CATALOG_EXTRA if row[0] not in SHOP_LOTTERY_ONLY_IDS]
        self.assertGreaterEqual(len(purchasable), 100)
        self.assertGreaterEqual(len({row[1] for row in purchasable}), 15)
        for row in SHOP_CATALOG_EXTRA:
            self.assertRegex(row[0], r'^[a-z0-9-]+$')
            self.assertIn(row[1], server.SHOP_CATEGORIES)
            self.assertGreater(len(row[2]), 1)
            self.assertGreaterEqual(len(row[3]), 10)
            self.assertNotEqual(bool(row[4]), bool(row[5]))
            self.assertGreater(row[4] + row[5], 0)
        coins = [r[4] for r in purchasable if r[4]]
        diamonds = [r[5] for r in purchasable if r[5]]
        self.assertLessEqual(min(coins), 50)
        self.assertGreaterEqual(sum(n <= 400 for n in coins), 30)
        self.assertGreaterEqual(max(coins), 2000)
        self.assertLessEqual(min(diamonds), 3)
        self.assertGreaterEqual(sum(n <= 12 for n in diamonds), 20)
        self.assertGreaterEqual(max(diamonds), 70)

    def test_rarest_draw_collections_are_separate_and_all_ordinary_products_are_drawable(self):
        self.assertEqual(len(SHOP_LOTTERY_ONLY_IDS), 36)
        self.assertEqual({k: len(v) for k, v in SHOP_LOTTERY_ONLY_BY_MACHINE.items()}, {'coin': 18, 'diamond': 18})
        self.assertEqual(SHOP_LOTTERY_EXCLUSIVE_IDS, frozenset())
        for machine, ids in SHOP_LOTTERY_ONLY_BY_MACHINE.items():
            for id in ids:
                self.assertTrue(SHOP_ITEM_META[id]['lotteryOnly'])
                self.assertEqual(SHOP_ITEM_META[id]['lotteryMachine'], machine)
                self.assertFalse(SHOP_ITEM_META[id]['lotteryEligible'])
        for id, meta in SHOP_ITEM_META.items():
            self.assertFalse(meta['lotteryExclusive'])
            self.assertEqual(meta['lotteryEligible'], id not in SHOP_LOTTERY_ONLY_IDS)
        with tempfile.TemporaryDirectory() as temp:
            store = server.FocusStore(Path(temp) / 'data', Path(temp) / 'absent.json')
            try:
                state = store.quest_state(NOW)
                self.assertEqual(len(state['equipped']), 24)
                for item in state['catalog']:
                    if item['id'] in {r[0] for r in SHOP_CATALOG_EXTRA}:
                        self.assertFalse(item['owned'])
                for id in SHOP_LOTTERY_ONLY_IDS:
                    with self.assertRaises(ValueError):
                        store.buy_item(id, NOW)
                    with self.assertRaises(ValueError):
                        store.equip_item(id, NOW)
            finally:
                store.close()

    def test_existing_descriptors_and_lottery_metadata_match_reviewed_catalog(self):
        # This limited-only expansion preserves every existing descriptor,
        # identity, price and lottery flag, including all 24 older collections.
        legacy = SHOP_CATALOG_EXTRA[:232]
        self.assertEqual(hashlib.sha256(json.dumps(legacy, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest(),
                         '7d95335084f92722f45f9a3c5d22160b37c1a3f9e60ec91f41ddb60a97bd5407')
        metadata = {row[0]: SHOP_ITEM_META[row[0]] for row in legacy}
        self.assertEqual(hashlib.sha256(json.dumps(metadata, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
                         'a0e5dcb534b149b352028f3bf3cccf20760014d8c5f726723948ffb3d72436f0')

    def test_old_full_collections_gain_only_new_unowned_prizes_without_resetting_pity_or_equipment(self):
        new_ids = {row[0] for row in SHOP_CATALOG_EXTRA[232:]}
        self.assertEqual(len(new_ids), 72)
        with tempfile.TemporaryDirectory() as temp:
            data, source = Path(temp)/'data', Path(temp)/'absent.json'
            store = server.FocusStore(data, source)
            try:
                with store.db:
                    for item in server.SHOP_ITEMS.values():
                        if item['id'] not in new_ids and (item['coins'] or item['diamonds']):
                            store.db.execute('INSERT INTO shop_purchases VALUES (?,?)', (item['id'], int(NOW.timestamp()*1000)))
                    store.db.execute("INSERT INTO lottery_pity VALUES ('coin',29),('diamond',19)")
                    store.db.execute('INSERT INTO wallet_ledger VALUES (?,?,?,?)',
                                     ('fixture:retained-wallet', 735, 21, int(NOW.timestamp()*1000)))
                    for machine, amount in (('coin', 4), ('diamond', 3)):
                        store.db.execute('INSERT INTO lottery_ticket_ledger VALUES (?,?,?,?,?,?)',
                                         ('fixture:'+machine, machine, amount, int(NOW.timestamp()*1000), 'fixture', 'Fixture'))
                store.equip_item('bar-cat', NOW)
                equipment = dict(store.quest_state(NOW)['equipped'])
                # Prime the independent permanent play-ticket wallet before
                # auditing a restart; it is unrelated to catalog expansion.
                store.lottery_state(NOW)
                purchases = [tuple(row) for row in store.db.execute('SELECT * FROM shop_purchases ORDER BY rowid')]
                tickets = [tuple(row) for row in store.db.execute('SELECT * FROM lottery_ticket_ledger ORDER BY rowid')]
                store.close()
                store = server.FocusStore(data, source)
                self.assertEqual([tuple(row) for row in store.db.execute('SELECT * FROM shop_purchases ORDER BY rowid')], purchases)
                self.assertEqual([tuple(row) for row in store.db.execute('SELECT * FROM lottery_ticket_ledger ORDER BY rowid')], tickets)
                self.assertEqual(store.quest_state(NOW)['equipped'], equipment)
                self.assertEqual(store._wallet(), {'coins': 735, 'diamonds': 21})
                self.assertEqual(store.lottery_state(NOW)['tickets'], {'coin': 4, 'diamond': 3})
                pools = store._lottery_pools()
                self.assertEqual({item['id'] for items in pools.values() for item in items}, new_ids)
                self.assertEqual(len(pools['coinItem'])+len(pools['diamondItem']), 60)
                self.assertEqual((len(pools['coinLimited']), len(pools['diamondLimited'])), (6, 6))
                for row in store.lottery_state(NOW)['machines']:
                    self.assertEqual(row['pity']['count'], 29 if row['id'] == 'coin' else 19)
                    self.assertEqual(row['pool']['lotteryOnlyTotal'], 18)
                    self.assertFalse(row['pity']['allCollected'])
            finally:
                store.close()

    def test_new_limited_prizes_are_uniformly_selectable_and_draw_equip_receipts_survive_restart(self):
        new_ids = {row[0] for row in SHOP_CATALOG_EXTRA[232:244]}
        with tempfile.TemporaryDirectory() as temp, patch.object(server, 'quest_clock', side_effect=lambda value=None: value or NOW):
            data, source = Path(temp)/'data', Path(temp)/'absent.json'
            store = server.FocusStore(data, source)
            receipts = []
            try:
                with store.db:
                    for item in server.SHOP_ITEMS.values():
                        if item['id'] not in new_ids and (item['coins'] or item['diamonds']):
                            store.db.execute('INSERT INTO shop_purchases VALUES (?,?)', (item['id'], int(NOW.timestamp()*1000)))
                    store.db.execute('INSERT INTO wallet_ledger VALUES (?,?,?,?)',
                                     ('fixture:retained-wallet', 735, 21, int(NOW.timestamp()*1000)))
                    for machine in ('coin', 'diamond'):
                        store.db.execute('INSERT INTO lottery_ticket_ledger VALUES (?,?,?,?,?,?)',
                                         ('fixture:'+machine, machine, 6, int(NOW.timestamp()*1000), 'fixture', 'Fixture'))
                eq = dict(store.quest_state(NOW)['equipped'])
                for machine, limit in server.lottery_rules.PITY_LIMITS.items():
                    pool = store._lottery_pools()[machine+'Limited']
                    # All six candidates occupy one equally sized random index;
                    # neither the first display item nor an acquisition order wins.
                    for index, item in enumerate(pool):
                        with patch.object(server.lottery_rules.secrets, 'randbelow', return_value=index) as random:
                            picked = server.lottery_rules.draw(machine, {machine+'Limited': pool}, force_limited=True)
                        random.assert_called_once_with(6)
                        self.assertEqual(picked['item']['id'], item['id'])
                    for _ in range(6):
                        pool = store._lottery_pools()[machine+'Limited']
                        item = pool[-1]
                        with store.db:
                            store.db.execute('INSERT OR REPLACE INTO lottery_pity VALUES (?,?)', (machine, limit-1))
                        request = str(uuid.uuid4())
                        with patch.object(server.lottery_rules.secrets, 'randbelow', return_value=len(pool)-1) as random:
                            receipt = store.draw_lottery(machine, request, NOW)['result']
                        random.assert_called_once_with(len(pool))
                        self.assertEqual(receipt['item']['id'], item['id'])
                        self.assertTrue(receipt['limited'] and receipt['pityTriggered'])
                        self.assertEqual(receipt['type'], 'item')
                        self.assertFalse(receipt.get('fallback', False))
                        self.assertNotIn(item['id'], {row['id'] for row in store._lottery_pools()[machine+'Limited']})
                        state = store.equip_item(item['id'], NOW)
                        eq = {**eq, item['slot']: item['id']}
                        self.assertEqual(state['equipped'], eq)
                        receipts.append((machine, request, receipt))
                self.assertEqual({receipt['item']['id'] for _, _, receipt in receipts}, new_ids)
                self.assertEqual(store.lottery_state(NOW)['tickets'], {'coin': 0, 'diamond': 0})
                self.assertEqual(store._wallet(), {'coins': 735, 'diamonds': 21})
                store.close()
                store = server.FocusStore(data, source)
                tomorrow = NOW+timedelta(days=1)
                self.assertEqual(store.quest_state(tomorrow)['equipped'], eq)
                for machine, request, receipt in receipts:
                    with patch.object(server.lottery_rules, 'draw', side_effect=AssertionError('saved result must not reroll')):
                        retry = store.draw_lottery(machine, request, tomorrow)
                    self.assertTrue(retry['alreadyProcessed'])
                    self.assertEqual(retry['result'], receipt)
                self.assertEqual(store.lottery_state(tomorrow)['tickets'], {'coin': 0, 'diamond': 0})
                self.assertEqual(store._wallet(), {'coins': 735, 'diamonds': 21})
                for machine in store.lottery_state(tomorrow)['machines']:
                    self.assertEqual(machine['pity']['count'], 0)
                    self.assertTrue(machine['pity']['allCollected'])
                    self.assertEqual(machine['pool']['lotteryOnlyItems'], 0)
            finally:
                store.close()

    def test_every_ordinary_new_product_can_be_equipped_and_reopened_without_changing_other_positions(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp) / 'data'
            source = Path(temp) / 'absent.json'
            store = server.FocusStore(data, source)
            try:
                with store.db:
                    store.db.execute('INSERT INTO wallet_ledger VALUES (?,?,?,?)', ('fixture:catalog', 1000000, 10000, int(NOW.timestamp()*1000)))
                eq = store.quest_state(NOW)['equipped']
                for id, slot, *_ in SHOP_CATALOG_EXTRA:
                    if id in SHOP_LOTTERY_ONLY_IDS:
                        continue
                    store.buy_item(id, NOW)
                    state = store.equip_item(id, NOW)
                    eq = {**eq, slot: id}
                    self.assertEqual(state['equipped'], eq)
                store.close()
                store = server.FocusStore(data, source)
                self.assertEqual(store.quest_state(NOW)['equipped'], eq)
            finally:
                store.close()

    def test_reworked_ordinary_cosmetics_keep_existing_ownership_equipment_prices_and_drawability(self):
        changed = [('bar-koi', '荷塘涟漪', 16), ('bar-whale', '潮间水母', 20),
                   ('bar-dragon', '纸鸢长风', 24), ('companion-whale', '海湾小海牛', 36),
                   ('companion-dragon', '苔石蜥蜴', 48), ('relic-orrery', '黄铜日晷', 32)]
        with tempfile.TemporaryDirectory() as temp:
            data, source = Path(temp)/'data', Path(temp)/'absent.json'
            store = server.FocusStore(data, source)
            try:
                pool = {item['id'] for item in store._lottery_pools()['diamondItem']}
                with store.db:
                    store.db.execute('INSERT INTO wallet_ledger VALUES (?,?,?,?)',
                                     ('fixture:existing-wallet', 715, 23, int(NOW.timestamp()*1000)))
                    for id, name, diamonds in changed:
                        item = server.SHOP_ITEMS[id]
                        self.assertEqual((item['name'], item['coins'], item['diamonds']), (name, 0, diamonds))
                        self.assertFalse(item.get('lotteryOnly', False))
                        self.assertIn(id, pool)
                        store.db.execute('INSERT INTO shop_purchases VALUES (?,?)', (id, int(NOW.timestamp()*1000)))
                eq = dict(store.quest_state(NOW)['equipped'])
                for id, _, _ in changed:
                    eq[server.SHOP_ITEMS[id]['slot']] = id
                    self.assertEqual(store.equip_item(id, NOW)['equipped'], eq)
                purchases = [tuple(row) for row in store.db.execute('SELECT * FROM shop_purchases ORDER BY item_id')]
                store.close()
                store = server.FocusStore(data, source)
                self.assertEqual(store.quest_state(NOW)['equipped'], eq)
                self.assertEqual(store._wallet(), {'coins': 715, 'diamonds': 23})
                self.assertEqual([tuple(row) for row in store.db.execute('SELECT * FROM shop_purchases ORDER BY item_id')], purchases)
                self.assertFalse({id for id, _, _ in changed} & {item['id'] for item in store._lottery_pools()['diamondItem']})
            finally:
                store.close()

    def test_backend_and_frontend_descriptors_have_exact_matching_identifiers_and_prices(self):
        node = shutil.which('node') or str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node')
        result = subprocess.run([node, '-e', "process.stdout.write(JSON.stringify(require('./static/shop-expansion.js').entries))"],
                                cwd=ROOT, text=True, capture_output=True, check=True)
        front = json.loads(result.stdout)
        self.assertEqual([(r['id'], r['slot'], r['name'], r['description'], r['coins'], r['diamonds']) for r in front], list(SHOP_CATALOG_EXTRA))
        self.assertEqual({r['id'] for r in front if r['lotteryOnly']}, SHOP_LOTTERY_ONLY_IDS)
