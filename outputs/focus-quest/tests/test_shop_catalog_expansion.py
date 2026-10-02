"""Catalog breadth, honest price partitions, and permanent equipment integration."""
import importlib.util
import hashlib
import json
import re
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

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
        self.assertEqual(len(server.SHOP_ITEMS), 336)
        self.assertEqual(len(SHOP_CATALOG_EXTRA), 232)
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
        self.assertEqual(len(SHOP_LOTTERY_ONLY_IDS), 24)
        self.assertEqual({k: len(v) for k, v in SHOP_LOTTERY_ONLY_BY_MACHINE.items()}, {'coin': 12, 'diamond': 12})
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
                self.assertEqual(len(state['equipped']), 18)
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
        # v1.49.15 intentionally updates effect descriptions to match their
        # natural motion; identities, prices and lottery metadata stay locked.
        legacy = SHOP_CATALOG_EXTRA[:136]
        self.assertEqual(hashlib.sha256(json.dumps(legacy, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest(),
                         '1cdd2edd31a56e20bba56d1f790908622865dd59b94a23a2c4ff2acdc1e22c16')
        metadata = {row[0]: SHOP_ITEM_META[row[0]] for row in legacy}
        self.assertEqual(hashlib.sha256(json.dumps(metadata, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
                         '36a5ddb67ab4f5eb510c7b71e82a7845accb4858d319f4a7c5bdef5dca9bc639')

    def test_old_full_collections_gain_only_new_unowned_prizes_without_resetting_pity_or_equipment(self):
        new_ids = {row[0] for row in SHOP_CATALOG_EXTRA[136:]}
        self.assertEqual(len(new_ids), 96)
        with tempfile.TemporaryDirectory() as temp:
            data, source = Path(temp)/'data', Path(temp)/'absent.json'
            store = server.FocusStore(data, source)
            try:
                with store.db:
                    for item in server.SHOP_ITEMS.values():
                        if item['id'] not in new_ids and (item['coins'] or item['diamonds']):
                            store.db.execute('INSERT INTO shop_purchases VALUES (?,?)', (item['id'], int(NOW.timestamp()*1000)))
                    store.db.execute("INSERT INTO lottery_pity VALUES ('coin',29),('diamond',19)")
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
                pools = store._lottery_pools()
                self.assertEqual({item['id'] for items in pools.values() for item in items}, new_ids)
                self.assertEqual(len(pools['coinItem'])+len(pools['diamondItem']), 84)
                self.assertEqual((len(pools['coinLimited']), len(pools['diamondLimited'])), (6, 6))
                for row in store.lottery_state(NOW)['machines']:
                    self.assertEqual(row['pity']['count'], 29 if row['id'] == 'coin' else 19)
                    self.assertEqual(row['pool']['lotteryOnlyTotal'], 12)
                    self.assertFalse(row['pity']['allCollected'])
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

    def test_backend_and_frontend_descriptors_have_exact_matching_identifiers_and_prices(self):
        code = (ROOT/'static/shop-expansion.js').read_text()
        front = json.loads(re.search(r'const rawEntries=(\[.*?\]);', code).group(1))
        self.assertEqual([(r['id'], r['slot'], r['name'], r['description'], r['coins'], r['diamonds']) for r in front], list(SHOP_CATALOG_EXTRA))
        self.assertEqual({r['id'] for r in front if r['lotteryOnly']}, SHOP_LOTTERY_ONLY_IDS)
