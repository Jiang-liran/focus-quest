const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../static/quests.js'), 'utf8');
const artSource = fs.readFileSync(require.resolve('../static/quest-art.js'), 'utf8');
const lotterySource = fs.readFileSync(require.resolve('../static/lottery.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const now = '2026-09-23T09:00:00.000100+08:00';

function quest(patch = {}) {
  return {subject: 'math', name: '数学', period: 'morning', target: 90,
    minutes: 0, percent: 0, status: 'available',
    opensAt: '2026-09-23T00:00:00+08:00', deadline: '2026-09-23T12:00:00+08:00',
    submitDeadline: '2026-09-23T12:30:00+08:00',
    reward: {coins: 0, diamonds: 0}, baseReward: {coins: 180, diamonds: 2}, ...patch};
}
function item(patch = {}) {
  return {id: 'bar-aurora', slot: 'bar', name: '极光流彩', description: '把专注变成流动的光。',
    coins: 240, diamonds: 0, currency: 'coins', owned: false, equipped: false, ...patch};
}
function snapshot(patch = {}) {
  return {day: '2026-09-23', now, wallet: {coins: 500, diamonds: 5},
    quests: [quest(), quest({subject: 'cs', name: '408', period: 'afternoon', status: 'locked', opensAt: '2026-09-23T12:00:00+08:00'})],
    catalog: [item(), item({id: 'bar-default', name: '初始光芒', coins: 0, diamonds: 0, currency: 'free', owned: true, equipped: true})],
    equipped: {bar: 'bar-default', fx: 'fx-default', avatar: 'avatar-default'}, history: [], exchange: {coinsPerDiamond:75,maxDiamonds:6,maxPerExchange:1000,history:[]}, ...patch};
}

function continuousQuest(patch = {}) {
  const subject = patch.subject || 'math';
  const subjectNames = {math: '数学', cs: '408', politics: '政治', english: '英语'};
  const recommendedPeriod = ['math', 'politics'].includes(subject) ? 'morning' : 'afternoon';
  const minutes = patch.minutes || 0, settledMinutes = patch.settledMinutes || 0;
  const target = patch.target || 90, progressMinutes = patch.progressMinutes ?? minutes;
  return quest({continuous: true, subject, name: subjectNames[subject], period: 'anytime',
    recommended: {period: recommendedPeriod, label: recommendedPeriod === 'morning' ? '推荐上午' : '推荐下午', bonus: false, active: false},
    opensAt: null, deadline: null, submitDeadline: null, acceptedAt: null,
    minutes, settledMinutes, totalMinutes: minutes + settledMinutes, progressMinutes,
    percent: progressMinutes / target * 100, progressPercent: progressMinutes / target * 100,
    firstCompleted: false, paidCoins: 0, paidDiamonds: 0, ...patch});
}

function continuousSnapshot(patch = {}) {
  return snapshot({quests: ['math', 'politics', 'cs', 'english'].map(subject => continuousQuest({subject})), ...patch});
}

function roundTicketsState(totalRounds = 0) {
  return {roundTickets: {featureStartMs: 1, totalRounds, diamondTickets: Math.floor(totalRounds / 3),
    roundsTowardNextDiamond: totalRounds % 3, roundsToNextDiamond: 3 - totalRounds % 3,
    subjects: ['math', 'cs', 'politics', 'english'].map(id => ({id,
      target: ['math', 'cs'].includes(id) ? 60 : 30, completedRounds: 0, carryMinutes: 0,
      minutesToNextRound: ['math', 'cs'].includes(id) ? 60 : 30}))}};
}

function harness(extras = {}) {
  const elements = new Map(), calls = {requests: [], refresh: [], toasts: [], sounds: []};
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, textContent: '', innerHTML: '', disabled: false, hidden: false, open: false, shown: 0,
      value: id === 'exchange-amount' ? '1' : '', dataset: {}, attributes: {}, listeners: new Map(), classes: new Set(),
      classList: {toggle(name, enabled) { if (enabled) element(id).classes.add(name); else element(id).classes.delete(name); }},
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, callback) {
        const listeners = this.listeners.get(name) || [];
        listeners.push(callback); this.listeners.set(name, listeners);
      },
      scrollIntoView() {},
      showModal() { this.open = true; this.shown++; },
      close() { this.open = false; for (const callback of this.listeners.get('close') || []) callback({target: this}); },
    });
    return elements.get(id);
  };
  const filters = ['all', 'bar', 'fx', 'avatar', 'banner', 'theme', 'interface', 'companion', 'relic', 'portal', 'island', 'camp', 'fire', 'tent', 'campgear', 'campglow', 'chatframe'].map(slot => {
    const button = element(`filter-${slot}`); button.dataset.shopFilter = slot; return button;
  });
  const markets = ['coins','diamonds','owned','limited'].map(market=>{const button=element(`market-${market}`);button.dataset.shopMarket=market;return button;});
  const areas = ['all','journey','camp','interface'].map(area=>{const button=element(`area-${area}`);button.dataset.shopArea=area;return button;});
  const document = {documentElement: {dataset: {}}, getElementById: element,
    querySelectorAll(selector) { if(selector==='[data-shop-market]')return markets;if(selector==='[data-shop-area]')return areas;assert.equal(selector, '[data-shop-filter]'); return filters; }};
  const bridge = {
    api(path, body) { return new Promise((resolve, reject) => calls.requests.push({path, body, resolve, reject})); },
    async refresh(force) { calls.refresh.push(force); },
    toast(...args) { calls.toasts.push(args); },
    playSound(cue, options = {}) { calls.sounds.push({cue, ...JSON.parse(JSON.stringify(options))}); },
  };
  const sandbox = {document, crypto: require('node:crypto').webcrypto, ...extras};
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(artSource, context);
  vm.runInContext(source, context);
  const api = context.FocusQuests;
  const fire = (id, dataset = {}) => {
    const target = {dataset, closest() { return this; }};
    return (element(id).listeners.get('click') || []).map(callback => callback({target}));
  };
  api.init(bridge);
  return {api, element, calls, bridge, document, fire, context};
}

test('homepage layout market, collection and purchase preview use the actual island artwork without entering the city', () => {
  const art=require('../static/shop-art.js');
  const h=harness({ShopArt:{...art,apply(){}},FocusCitadel:{preview(){throw new Error('homepage decor must not preview in the city');}}});
  const catalog=[item({id:'island-default',slot:'island',name:'素岛原貌',coins:0,currency:'free',owned:true,equipped:true}),
    item({id:'island-lanterns',slot:'island',name:'旅途灯径',coins:240}),
    item({id:'island-garden',slot:'island',name:'苔石花庭',coins:420}),
    item({id:'island-pavilion',slot:'island',name:'观星歇亭',coins:0,diamonds:10,currency:'diamonds'})];
  const data=snapshot({catalog,equipped:{...snapshot().equipped,island:'island-default',theme:'theme-ocean',companion:'companion-fox'},wallet:{coins:660,diamonds:10}});
  h.api.render(data);h.fire('filter-island');
  assert.match(h.element('shop-catalog').innerHTML,/旅途灯径/);
  assert.doesNotMatch(h.element('shop-catalog').innerHTML,/观星歇亭|素岛原貌/);
  h.fire('shop-catalog',{shopAction:'preview',item:'island-lanterns'});
  const artwork=h.element('quest-action-art').innerHTML;
  assert.ok(artwork.includes(art.islandPreview('island-lanterns',data.equipped)));
  assert.equal(h.element('quest-action-dialog').classes.has('island-item-dialog'),true);
  h.element('quest-action-dialog').close();h.fire('shop-catalog',{shopAction:'buy',item:'island-lanterns'});
  assert.equal(h.element('quest-action-art').innerHTML,artwork);
  assert.equal(h.calls.requests.length,0);
  h.element('quest-action-dialog').close();h.fire('market-diamonds');
  assert.match(h.element('shop-catalog').innerHTML,/观星歇亭/);
  h.fire('market-owned');assert.match(h.element('shop-catalog').innerHTML,/素岛原貌/);
  assert.equal(data.equipped.island,'island-default');
});

test('all 30 real city cosmetics render through the rainy-city shop bridge with the other five slots retained', () => {
  const variants = {theme: ['default', 'forest', 'ocean', 'sakura', 'aurora'], fx: ['default', 'fireflies', 'petals', 'snow', 'meteor', 'nebula'],
    avatar: ['default', 'ranger', 'voyager', 'alchemist', 'star', 'royal'], companion: ['default', 'fox', 'owl', 'whale', 'dragon'],
    relic: ['default', 'lotus', 'orrery', 'hourglass'], portal: ['default', 'moon', 'archive', 'cosmos']};
  const catalog = Object.entries(variants).flatMap(([slot, values]) => values.map(variant => item({id: `${slot}-${variant}`, slot,
    name: `${slot}-${variant}`, owned: variant === 'default', coins: variant === 'default' ? 0 : 20})));
  const equipped = Object.freeze({theme: 'theme-sakura', fx: 'fx-fireflies', avatar: 'avatar-royal',
    companion: 'companion-owl', relic: 'relic-hourglass', portal: 'portal-cosmos', bar: 'bar-mint', camp: 'camp-lake'});
  const data = snapshot({catalog, equipped});
  const full = {date: data.day, today: data.day, totals: {minutes: 39, target: 480},
    subjects: ['math', 'cs', 'politics', 'english'].map(id => ({id, minutes: id === 'math' ? 39 : 0, target: ['math', 'cs'].includes(id) ? 180 : 60})),
    settings: {motion: false}, records: [], quests: data};
  const before = JSON.stringify(full);
  const h = harness({FocusRainCityArt: require('../static/rain-city-art.js')});
  h.element('citadel-view').hidden = true;
  vm.runInContext(fs.readFileSync(require.resolve('../static/citadel.js'), 'utf8'), h.context);
  h.context.FocusCitadel.render(full);
  h.api.render(data);
  for (const product of catalog) {
    h.fire('shop-catalog', {shopAction: 'preview', item: product.id});
    const html = h.element('quest-action-art').innerHTML;
    assert.match(html, /citadel-full-preview/);
    assert.match(html, /<svg class="citadel-art rain-city-art"/);
    assert.match(html, /星辉城 · 雨夜街景/);
    assert.match(html, /data-interactive="false"/);
    assert.doesNotMatch(html, /role="button"|tabindex="0"|citadel-hit-area/);
    for (const slot of Object.keys(variants)) {
      const expected = slot === product.slot ? product.id : equipped[slot];
      if (slot === 'theme') assert.ok(html.includes(`data-city-theme="${expected}"`), `${product.id} lost ${expected}`);
      else if (expected.endsWith('-default') && slot !== 'avatar') assert.doesNotMatch(html, new RegExp(`data-citadel-equipment="${slot}-`));
      else assert.ok(html.includes(`data-citadel-equipment="${expected}"`), `${product.id} lost ${expected}`);
    }
    assert.equal(h.element('quest-action-dialog').classes.has('citadel-item-dialog'), true);
    h.element('quest-action-dialog').close();
    if (!product.owned) {
      h.fire('shop-catalog', {shopAction: 'buy', item: product.id});
      // Each SVG owns unique gradient IDs so simultaneous previews cannot cross-link.
      const normalizeIds = value => value.replace(/rain-city-\d+/g, 'rain-city-instance');
      assert.equal(normalizeIds(h.element('quest-action-art').innerHTML), normalizeIds(html));
      h.element('quest-action-dialog').close();
    }
  }
  assert.equal(catalog.length, 30);
  assert.equal(h.calls.requests.length, 0);
  assert.equal(h.element('citadel-view').hidden, true);
  assert.equal(h.element('shop-coins').textContent, '500');
  assert.equal(JSON.stringify(full), before);
});

for (const [slot, id] of [['theme', 'theme-ocean'], ['fx', 'fx-snow'], ['avatar', 'avatar-ranger'],
  ['companion', 'companion-fox'], ['relic', 'relic-lotus'], ['portal', 'portal-moon']]) {
  test(`${slot} preview and purchase confirmation share the full citadel with existing equipment`, () => {
    const previews = [];
    const h = harness({FocusCitadel: {
      preview(itemId, equipped) {
        previews.push({itemId, equipped: JSON.parse(JSON.stringify(equipped))});
        const combined = {...equipped, [slot]: itemId};
        // The bridge renders the same detailed city, replacing only this slot.
        return `<div class="citadel-full-preview"><svg data-scene='${JSON.stringify(combined)}'></svg></div>`;
      },
    }});
    const equipped = Object.freeze({bar: 'bar-mint', fx: 'fx-meteor', avatar: 'avatar-royal',
      theme: 'theme-forest', companion: 'companion-owl', relic: 'relic-hourglass', portal: 'portal-cosmos', camp: 'camp-lake'});
    h.api.render(snapshot({equipped, catalog: [item({id, slot, coins: 20})]}));
    h.fire('shop-catalog', {shopAction: 'preview', item: id});
    const previewArt = h.element('quest-action-art').innerHTML;
    assert.match(previewArt, /citadel-full-preview/);
    assert.equal(h.element('quest-action-dialog').classes.has('citadel-item-dialog'), true);
    assert.equal(h.element('quest-action-confirm').hidden, true);
    assert.match(previewArt, new RegExp(id));
    for (const [key, value] of Object.entries(equipped)) if (key !== slot) assert.ok(previewArt.includes(value));
    assert.deepEqual(previews[0], {itemId: id, equipped});
    assert.equal(h.calls.requests.length, 0);
    h.element('quest-action-dialog').close();
    h.fire('shop-catalog', {shopAction: 'buy', item: id});
    assert.equal(h.element('quest-action-art').innerHTML, previewArt);
    assert.equal(h.element('quest-action-confirm').textContent, '确认购买');
    assert.match(h.element('quest-action-body').innerHTML, /购买后余额：480 金币/);
    assert.equal(h.calls.requests.length, 0);
    assert.equal(h.document.documentElement.dataset[slot], equipped[slot]);
  });
}

test('missing or empty detailed city previews fall back to existing swatches without a wide-dialog class', () => {
  for (const citadel of [undefined, {preview: () => ''}, {preview: () => null}]) {
    const h = harness({FocusCitadel: citadel, ShopArt: {apply() {}, preview: id => `<svg data-fallback="${id}"></svg>`}});
    h.api.render(snapshot({catalog: [item({id: 'theme-forest', slot: 'theme'})]}));
    h.fire('shop-catalog', {shopAction: 'preview', item: 'theme-forest'});
    assert.match(h.element('quest-action-art').innerHTML, /data-fallback="theme-forest"/);
    assert.equal(h.element('quest-action-dialog').classes.has('citadel-item-dialog'), false);
    assert.equal(h.calls.requests.length, 0);
  }
});

test('citadel, campfire and ordinary action dialogs do not leak one another’s layout classes', () => {
  const previews = [];
  const h = harness({FocusCitadel: {preview: id => { previews.push(id); return '<div class="citadel-full-preview"></div>'; }}});
  h.api.render(snapshot({catalog: [item({id: 'theme-forest', slot: 'theme'}), item({id: 'camp-pine', slot: 'camp'}), item()]}));
  h.fire('shop-catalog', {shopAction: 'preview', item: 'camp-pine'});
  assert.equal(h.element('quest-action-dialog').classes.has('campfire-item-dialog'), true);
  assert.equal(h.element('quest-action-dialog').classes.has('citadel-item-dialog'), false);
  h.fire('shop-catalog', {shopAction: 'preview', item: 'theme-forest'});
  assert.equal(h.element('quest-action-dialog').classes.has('campfire-item-dialog'), false);
  assert.equal(h.element('quest-action-dialog').classes.has('citadel-item-dialog'), true);
  h.fire('shop-catalog', {shopAction: 'preview', item: 'bar-aurora'});
  assert.equal(h.element('quest-action-dialog').classes.has('citadel-item-dialog'), false);
  h.fire('quest-board', {questAction: 'accept', subject: 'math'});
  assert.equal(h.element('quest-action-dialog').classes.has('citadel-item-dialog'), false);
  assert.deepEqual(previews, ['theme-forest']);
});

test('city equipment receives accepted authoritative snapshots and rejects stale microsecond polls', () => {
  const applied = [];
  const h = harness({FocusCitadel: {applyEquipment(equipped, timestamp) { applied.push({equipped: {...equipped}, timestamp}); }}});
  const newer = snapshot({now: '2026-09-23T09:00:02.123900+08:00', equipped: {theme: 'theme-ocean'}});
  h.api.render(newer);
  h.api.render(snapshot({now: '2026-09-23T09:00:02.123100+08:00', equipped: {theme: 'theme-forest'}}));
  assert.equal(applied.length, 1);
  assert.deepEqual(applied[0], {equipped: {theme: 'theme-ocean'}, timestamp: newer.now});
});

test('task actions follow all six server states and unavailable states have no action', () => {
  const h = harness();
  for (const [status, action, label] of [
    ['available', 'accept', '接取委托'], ['ready', 'submit', '交付委托'],
    ['locked', null, '发布'], ['active', null, '等待达标'], ['expired', null, '已过今日期限'],
    ['claimed', null, '奖励已收下'], ['unknown', null, '暂不可用'],
  ]) {
    const result = h.api.actionFor(quest({status, minutes: status === 'ready' ? 90 : 0}));
    assert.equal(result.action, action);
    assert.ok(result.label.includes(label));
  }
});

test('99.99% remains an active task with no turn-in button and progress never rounds up to 100%', () => {
  const h = harness();
  for (const percent of [99.99, 100]) {
    // The server may already round percent to 100; completed minutes stay authoritative.
    const html = h.api.taskMarkup(quest({status: 'active', minutes: 89.999, percent}));
    assert.doesNotMatch(html, /data-quest-action="submit"|可以交付|交付委托/);
    assert.match(html, /等待达标/);
    assert.match(html, /aria-valuenow="99\.9"/);
    assert.doesNotMatch(html, />100%<|aria-valuenow="100"/);
  }
});

test('insufficient coins or diamonds disables buying while owned items remain equipable', () => {
  const h = harness();
  for (const wallet of [{coins: 239, diamonds: 10}, {coins: 0, diamonds: 0}]) {
    const markup = h.api.itemMarkup(item(), wallet);
    assert.match(markup, /data-shop-action="buy"[^>]*disabled>余额不足/);
    const owned = h.api.itemMarkup(item({owned: true}), wallet);
    assert.match(owned, /data-shop-action="equip"[^>]*>装备</);
    assert.doesNotMatch(owned, /data-shop-action="equip"[^>]*disabled/);
  }
  assert.match(h.api.itemMarkup(item(), {coins: 240, diamonds: 0}), />购买</);
  assert.match(h.api.itemMarkup(item({coins:0,diamonds:12,currency:'diamonds'}),{coins:10000,diamonds:11}),/disabled>余额不足/);
  assert.match(h.api.itemMarkup(item({coins:0,diamonds:12,currency:'diamonds'}),{coins:0,diamonds:12}),/>购买</);
  assert.match(h.api.itemMarkup(item({owned: true, equipped: true}), {coins: 0, diamonds: 0}), /data-shop-action="equip"[^>]*disabled>已装备/);
});

test('task, catalog and historical names are escaped in text and attribute contexts', () => {
  const h = harness();
  const attack = '<img src=x onerror="evil()"> & \'quoted\'';
  const markup = h.api.taskMarkup(quest({name: attack, subject: 'math" autofocus onfocus="evil()'}));
  assert.ok(markup.includes('&lt;img src=x onerror=&quot;evil()&quot;&gt; &amp; &#39;quoted&#39;'));
  assert.doesNotMatch(markup, /<img|data-subject="math" autofocus/);
  const product = h.api.itemMarkup(item({name: attack, description: attack, id: 'id" onclick="evil()'}), {coins: 500, diamonds: 5});
  assert.doesNotMatch(product, /<img|data-item="id" onclick/);
  assert.match(product, /data-item="id&quot; onclick=&quot;evil\(\)"/);
  h.api.render(snapshot({history: [{name: attack, day: attack, minutes: 90, coins: 180, diamonds: 2, submittedAt: now}]}));
  assert.doesNotMatch(h.element('quest-history').innerHTML, /<img/);
  assert.match(h.element('quest-history').innerHTML, /&lt;img/);
});

test('init is idempotent, rendering updates every wallet and equipped skin, and filters only affect catalog', () => {
  const h = harness();
  h.api.init(h.bridge);
  assert.equal(h.element('quest-board').listeners.get('click').length, 1);
  assert.equal(h.element('quest-action-confirm').listeners.get('click').length, 1);
  const data = snapshot({catalog: [item(), item({id: 'avatar-scholar', slot: 'avatar', name: '星空衣装'})]});
  h.api.render(data);
  for (const prefix of ['wallet-side', 'quest', 'shop']) {
    assert.equal(h.element(`${prefix}-coins`).textContent, '500');
    assert.equal(h.element(`${prefix}-diamonds`).textContent, '5');
  }
  assert.deepEqual(h.document.documentElement.dataset, data.equipped);
  assert.match(h.element('quest-board').innerHTML, /司晨/);
  assert.match(h.element('quest-board').innerHTML, /逐光/);
  assert.match(h.element('shop-keeper').innerHTML, /data-role="shop"/);
  h.fire('filter-avatar');
  assert.match(h.element('shop-catalog').innerHTML, /星空衣装/);
  assert.doesNotMatch(h.element('shop-catalog').innerHTML, /极光流彩/);
  assert.equal(h.element('filter-avatar').attributes['aria-pressed'], 'true');
  assert.equal(h.element('filter-all').attributes['aria-pressed'], 'false');
  assert.equal(h.calls.requests.length, 0);
});

test('polling preserves card DOM despite browser-normalized SVG, while changed business data still updates', () => {
  const h = harness();
  const writes = {'quest-board': 0, 'shop-catalog': 0};
  const originals = {};
  for (const id of Object.keys(writes)) {
    const node = h.element(id);
    Object.defineProperty(node, 'innerHTML', {
      configurable: true,
      get() {
        // The browser expands self-closing SVG elements and boolean attributes.
        return (originals[id] || '').replace(/<(path|circle|ellipse|rect)([^>]*?)\/>/g, '<$1$2></$1>')
          .replace(/ disabled(?=[ >])/g, ' disabled=""');
      },
      set(value) { originals[id] = value; writes[id]++; node.focusedDescendant = null; },
    });
  }
  const initial = snapshot({catalog: [item(), item({id: 'avatar-scholar', slot: 'avatar', name: '星空衣装'})]});
  h.api.render(initial);
  const focusedCard = {id: 'focused-shop-preview'};
  h.element('shop-catalog').focusedDescendant = focusedCard;
  assert.notEqual(h.element('quest-board').innerHTML, originals['quest-board']);
  assert.notEqual(h.element('shop-catalog').innerHTML, originals['shop-catalog']);
  for (const seconds of ['03', '06']) h.api.render({...initial, now: `2026-09-23T09:00:${seconds}+08:00`});
  assert.deepEqual(writes, {'quest-board': 1, 'shop-catalog': 1});
  assert.equal(h.element('shop-catalog').focusedDescendant, focusedCard, 'unchanged polls keep the focused preview/card node');

  const progress = {...initial, now: '2026-09-23T09:00:09+08:00',
    quests: [quest({status: 'active', minutes: 10, percent: 10 / 90 * 100}), initial.quests[1]]};
  h.api.render(progress);
  assert.deepEqual(writes, {'quest-board': 2, 'shop-catalog': 1});
  assert.match(h.element('quest-board').innerHTML, />10<small>分钟/);
  const purchased = {...progress, now: '2026-09-23T09:00:12+08:00',
    catalog: [item({owned: true}), initial.catalog[1]]};
  h.api.render(purchased);
  assert.deepEqual(writes, {'quest-board': 2, 'shop-catalog': 2});
  assert.match(h.element('shop-catalog').innerHTML, /data-shop-action="equip" data-item="bar-aurora"/);
  h.api.render({...purchased, now: '2026-09-23T09:00:15+08:00'});
  assert.deepEqual(writes, {'quest-board': 2, 'shop-catalog': 2});
});

test('buying requires funds and confirmation; repeated confirm clicks create only one mutation', async () => {
  const h = harness();
  h.api.render(snapshot({wallet: {coins: 10, diamonds: 0}}));
  h.fire('shop-catalog', {shopAction: 'buy', item: 'bar-aurora'});
  assert.equal(h.element('quest-action-dialog').shown, 0);
  assert.equal(h.calls.requests.length, 0);
  h.api.render(snapshot({now: '2026-09-23T09:00:01+08:00'}));
  h.fire('shop-catalog', {shopAction: 'buy', item: 'bar-aurora'});
  assert.equal(h.element('quest-action-dialog').open, true);
  assert.match(h.element('quest-action-body').innerHTML, /购买后余额：260 金币 · 5 钻石/);
  assert.equal(h.calls.requests.length, 0);
  const [first] = h.fire('quest-action-confirm');
  const [second] = h.fire('quest-action-confirm');
  h.fire('shop-catalog', {shopAction: 'buy', item: 'bar-aurora'});
  assert.equal(h.calls.requests.length, 1);
  assert.equal(h.element('quest-action-confirm').disabled, true);
  assert.equal(h.calls.requests[0].path, '/api/shop/buy');
  assert.equal(JSON.stringify(h.calls.requests[0].body), JSON.stringify({itemId: 'bar-aurora'}));
  const purchased = snapshot({now: '2026-09-23T09:00:02+08:00', wallet: {coins: 260, diamonds: 5}, catalog: [item({owned: true})]});
  h.calls.requests[0].resolve(purchased);
  await Promise.all([first, second]);
  assert.equal(h.element('quest-action-dialog').open, false);
  assert.equal(h.element('quest-action-confirm').disabled, false);
  assert.equal(h.element('shop-coins').textContent, '260');
  assert.equal(h.calls.toasts.length, 1);
  assert.deepEqual(h.calls.refresh, [true]);
  h.fire('shop-catalog', {shopAction: 'buy', item: 'bar-aurora'});
  assert.equal(h.calls.requests.length, 1, 'a stale buy control cannot buy an owned item again');
});

test('owned equipment can be equipped with an empty wallet; old polls cannot undo its result', async () => {
  const h = harness();
  const old = snapshot({wallet: {coins: 0, diamonds: 0}, catalog: [item({owned: true})]});
  h.api.render(old);
  h.fire('shop-catalog', {shopAction: 'equip', item: 'bar-aurora'});
  h.fire('shop-catalog', {shopAction: 'equip', item: 'bar-aurora'});
  assert.equal(h.calls.requests.length, 1);
  assert.equal(h.calls.requests[0].path, '/api/shop/equip');
  const updated = snapshot({now: '2026-09-23T09:00:02.123900+08:00', wallet: {coins: 0, diamonds: 0},
    catalog: [item({owned: true, equipped: true})], equipped: {...old.equipped, bar: 'bar-aurora'}});
  h.calls.requests[0].resolve(updated);
  await flush();
  h.api.render(snapshot({now: '2026-09-23T09:00:01+08:00'}));
  assert.equal(h.document.documentElement.dataset.bar, 'bar-aurora');
  assert.equal(h.element('shop-coins').textContent, '0');
  assert.equal(h.calls.requests.length, 1);
});

test('late poll within the same millisecond cannot restore an old balance or outfit', () => {
  const h = harness();
  const newer = snapshot({now: '2026-09-23T09:00:02.123900+08:00', wallet: {coins: 260, diamonds: 5},
    equipped: {bar: 'bar-aurora', fx: 'fx-default', avatar: 'avatar-default'}});
  h.api.render(newer);
  h.api.render(snapshot({now: '2026-09-23T09:00:02.123100+08:00'}));
  assert.equal(h.document.documentElement.dataset.bar, 'bar-aurora');
  assert.equal(h.element('shop-coins').textContent, '260');
  assert.equal(h.element('shop-diamonds').textContent, '5');
});

test('accept/turn-in mutations are explicit and cancel/preview never mutate state', async () => {
  const h = harness();
  h.api.render(snapshot());
  h.fire('quest-board', {questAction: 'submit', subject: 'math'});
  assert.equal(h.element('quest-action-dialog').shown, 0);
  h.fire('quest-board', {questAction: 'accept', subject: 'math'});
  assert.equal(h.element('quest-action-dialog').open, true);
  assert.match(h.element('quest-action-body').innerHTML, /从接取这一刻开始累计/);
  h.element('quest-action-dialog').close();
  await Promise.all(h.fire('quest-action-confirm'));
  assert.equal(h.calls.requests.length, 0);
  h.fire('shop-catalog', {shopAction: 'preview', item: 'bar-aurora'});
  assert.equal(h.element('quest-action-confirm').hidden, true);
  await Promise.all(h.fire('quest-action-confirm'));
  assert.equal(h.calls.requests.length, 0);
  assert.equal(h.document.documentElement.dataset.bar, 'bar-default');
  h.element('quest-action-dialog').close();
  const ready = quest({status: 'ready', minutes: 120, percent: 133.333, reward: {coins: 240, diamonds: 2}});
  h.api.render(snapshot({now: '2026-09-23T11:30:00+08:00', quests: [ready]}));
  h.fire('quest-board', {questAction: 'submit', subject: 'math'});
  const [submission] = h.fire('quest-action-confirm');
  h.fire('quest-action-confirm');
  assert.equal(h.calls.requests.length, 1);
  assert.equal(h.calls.requests[0].path, '/api/quests/submit');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.requests[0].body)), {subject: 'math'});
  h.calls.requests[0].resolve(snapshot({now: '2026-09-23T11:30:01+08:00', wallet: {coins: 740, diamonds: 7},
    quests: [{...ready, status: 'claimed', submittedAt: '2026-09-23T11:30:01+08:00'}],
    receipt: {subject: 'math', name: '数学', minutes: 120, coins: 240, diamonds: 2,
      submittedAt: '2026-09-23T11:30:01+08:00', requestId: h.calls.requests[0].body.requestId, alreadyClaimed: false}}));
  await submission;
  assert.match(h.calls.toasts[0][0], /委托交付/);
  assert.match(h.calls.toasts[0][1], /240 金币 · \+2 钻石/);
  assert.equal(h.element('quest-coins').textContent, '740');
});

test('a rejected purchase preserves the confirmation for retry and releases busy controls', async () => {
  const h = harness();
  h.api.render(snapshot());
  h.fire('shop-catalog', {shopAction: 'buy', item: 'bar-aurora'});
  const [purchase] = h.fire('quest-action-confirm');
  h.calls.requests[0].reject(new Error('余额已变化，请刷新后重试'));
  await purchase;
  assert.equal(h.element('quest-action-dialog').open, true);
  assert.equal(h.element('quest-action-error').hidden, false);
  assert.match(h.element('quest-action-error').textContent, /余额已变化/);
  assert.equal(h.element('quest-action-confirm').disabled, false);
  assert.equal(h.element('shop-coins').textContent, '500');
  assert.equal(h.calls.toasts.length, 0);
  assert.deepEqual(h.calls.sounds, [], 'a failed purchase must not sound successful');
  const [retry] = h.fire('quest-action-confirm');
  assert.equal(h.calls.requests.length, 2);
  h.calls.requests[1].resolve(snapshot({now: '2026-09-23T09:00:03+08:00', wallet: {coins: 260, diamonds: 5}, catalog: [item({owned: true})]}));
  await retry;
  assert.equal(h.element('quest-action-dialog').open, false);
});


test('separate markets use a single tender, hide irrelevant categories and retain default outfits in collection', () => {
  const h=harness();
  h.api.render(snapshot({catalog:[item(),item({id:'theme-ocean',slot:'theme',name:'潮汐之境',coins:0,diamonds:36,currency:'diamonds'}),item({id:'theme-default',slot:'theme',name:'初始星岛',coins:0,diamonds:0,currency:'free',owned:true,equipped:true})]}));
  assert.match(h.element('shop-catalog').innerHTML,/极光流彩/);
  assert.doesNotMatch(h.element('shop-catalog').innerHTML,/潮汐之境|初始星岛|diamond-mark/);
  assert.equal(h.element('filter-theme').hidden,true);
  h.fire('market-diamonds');
  assert.match(h.element('shop-catalog').innerHTML,/潮汐之境/);
  assert.doesNotMatch(h.element('shop-catalog').innerHTML,/极光流彩|coin-mark/);
  assert.equal(h.element('filter-theme').hidden,false);
  h.fire('filter-theme');
  h.fire('market-owned');
  assert.match(h.element('shop-catalog').innerHTML,/初始星岛/);
  assert.doesNotMatch(h.element('shop-catalog').innerHTML,/潮汐之境/);
  assert.equal(h.element('market-owned').attributes['aria-pressed'],'true');
  assert.equal(h.calls.requests.length,0);
});

test('exchange rejects decimals and over-budget amounts without changing wallet; polling preserves entered quantity', () => {
  const h=harness();h.api.render(snapshot());
  for(const value of ['0','-1','1.5','1001','7','']){
    h.element('exchange-amount').value=value;
    h.api.render(snapshot());
    assert.equal(h.element('exchange-open').disabled,true,value);
    h.fire('exchange-open');
    assert.equal(h.element('quest-action-dialog').shown,0);
  }
  h.element('exchange-amount').value='5';
  h.api.render(snapshot({now:'2026-09-23T09:00:03+08:00'}));
  assert.equal(h.element('exchange-amount').value,'5');
  assert.equal(h.element('exchange-open').disabled,false);
  assert.match(h.element('exchange-cost').textContent,/375/);
  assert.equal(h.calls.requests.length,0);
});

test('exchange asks for exact confirmation, uses one UUID across retry, and displays authoritative result and history', async () => {
  const h=harness();h.api.render(snapshot());h.element('exchange-amount').value='5';
  h.fire('exchange-open');
  assert.match(h.element('quest-action-body').innerHTML,/375 金币/);
  assert.match(h.element('quest-action-body').innerHTML,/兑换后余额：125 金币 · 10 钻石/);
  assert.equal(h.calls.requests.length,0);
  const [first]=h.fire('quest-action-confirm');h.fire('quest-action-confirm');
  assert.equal(h.calls.requests.length,1);
  const job=h.calls.requests[0];
  assert.equal(job.path,'/api/shop/exchange');assert.equal(job.body.diamonds,5);
  assert.match(job.body.requestId,/^[0-9a-f-]{36}$/);
  job.reject(new Error('连接中断，请重试'));await first;
  assert.equal(h.element('quest-action-dialog').open,true);
  const [retry]=h.fire('quest-action-confirm');
  assert.equal(h.calls.requests[1].body.requestId,job.body.requestId);
  h.calls.requests[1].resolve(snapshot({now:'2026-09-23T09:00:04+08:00',wallet:{coins:125,diamonds:10},receipt:{alreadyExchanged:true,coins:375},exchange:{coinsPerDiamond:75,maxDiamonds:1,history:[{diamonds:5,coins:375,createdAt:now}]}}));
  await retry;
  assert.equal(h.element('quest-action-dialog').open,false);
  assert.equal(h.element('shop-coins').textContent,'125');assert.equal(h.element('shop-diamonds').textContent,'10');
  assert.match(h.element('exchange-history').innerHTML,/−375 金币/);
  assert.match(h.element('exchange-history').innerHTML,/\+5 钻石/);
  assert.equal(h.calls.toasts[0][0],'兑换已确认');
});

test('all four continuous commissions remain available with identical base rewards outside recommended hours', () => {
  const h = harness();
  for (const hour of ['07', '15', '23']) {
    h.api.render(continuousSnapshot({now: `2026-09-23T${hour}:00:00+08:00`}));
    const board = h.element('quest-board').innerHTML;
    assert.equal((board.match(/data-quest-action="accept"/g) || []).length, 4);
    assert.match(board, /常练时段|此刻推荐/);
    assert.doesNotMatch(board, /交付截止|学习截止|已过期|今日期限|学习窗口|停止累计|不再追加/);
    for (const subject of ['math', 'politics', 'cs', 'english']) {
      const q = continuousQuest({subject});
      assert.equal(h.api.actionFor(q).action, 'accept');
      const inactive = h.api.taskMarkup(q);
      const recommended = h.api.taskMarkup({...q, recommended: {...q.recommended, active: true}});
      const reward = /<div class="q-reward">([\s\S]*?)<\/div>/;
      assert.equal(inactive.match(reward)?.[1], recommended.match(reward)?.[1], 'recommendation does not alter displayed reward');
      assert.match(inactive, /180/);
      assert.match(inactive, /data-quest-action="accept"/);
    }
  }
  assert.equal(h.calls.requests.length, 0);
});

function firstRound(patch = {}) {
  return {enabled: true, featureStartMs: 1790211600000, day: '2026-09-24', period: 'morning',
    windowLabel: '00:00–12:00', opensAt: '2026-09-24T00:00:00+08:00', deadline: '2026-09-24T12:00:00+08:00',
    eligibleFrom: '2026-09-24T08:00:00+08:00', target: 60, minutes: 0, percent: 0, status: 'active',
    claimedAt: null, reward: {coins: 60, diamonds: 1}, pendingCount: 0, pendingCoins: 0, pendingDiamonds: 0, pending: [], ...patch};
}

test('first-round card reports all server states without changing the continuous base action', () => {
  const h = harness();
  for (const [status, label] of [['unaccepted', '接取后开始'], ['upcoming', '尚未开始'], ['active', '慢慢积累'],
    ['ready', '已达成 · 待领取'], ['claimed', '今日已领取'], ['ended', '时段已结束']]) {
    const q = continuousQuest({status: status === 'unaccepted' ? 'available' : 'active', bonus: firstRound({status})});
    const markup = h.api.taskMarkup(q);
    assert.match(markup, /晨光首轮/); assert.ok(markup.includes(label));
    assert.match(markup, /00:00–12:00/); assert.match(markup, /每天一次/);
    assert.match(markup, /额外 <b>60<\/b> 金币 · <b>1<\/b> 钻石/);
    assert.equal(h.api.actionFor(q).action, status === 'unaccepted' ? 'accept' : null, 'only the server commission status determines a mutation');
  }
  const ended = continuousQuest({status: 'ready', firstCompleted: true, minutes: 15, reward: {coins: 30, diamonds: 0}, bonus: firstRound({status: 'ended'})});
  assert.match(h.api.taskMarkup(ended), /data-quest-action="submit"/);
  assert.match(h.api.taskMarkup(ended), /基础奖励照常/);
  const afternoon = h.api.taskMarkup(continuousQuest({subject: 'english', bonus: firstRound({period: 'afternoon', target: 30,
    windowLabel: '12:00–18:00', reward: {coins: 30, diamonds: 1}, status: 'upcoming'})}));
  assert.match(afternoon, /午后首轮/); assert.match(afternoon, /12:00–18:00/); assert.match(afternoon, /额外 <b>30<\/b> 金币/);
});

test('first-round progress uses precise minutes and never rounds an unfinished round into a completion', () => {
  const h = harness();
  const markup = h.api.taskMarkup(continuousQuest({bonus: firstRound({minutes: 59.999, percent: 100})}));
  const panel = markup.match(/<section class="q-first-round[\s\S]*?<\/section>/)[0];
  assert.match(panel, /aria-valuenow="99\.9"/);
  assert.match(panel, /data-skin-slots="bar" tabindex="0"/, 'the additional round supports the same right-click and keyboard appearance controls');
  assert.doesNotMatch(panel, /aria-valuenow="100"|已达成/);
  assert.match(panel, /慢慢积累/);
  assert.match(markup, /data-skin-slots="bar"/, 'the main progress bar remains available for quick appearance changes');
});

test('past-day first rounds remain visible and bonus-only claims use the usual explicit submit action', () => {
  const h = harness();
  const old = {day: '2026-09-23', target: 60, minutes: 60, coins: 60, diamonds: 1};
  const q = continuousQuest({status: 'ready', firstCompleted: true, minutes: 0,
    reward: {coins: 60, diamonds: 1}, rewardBreakdown: {base: {coins: 0, diamonds: 0}, bonus: {coins: 60, diamonds: 1}},
    bonus: firstRound({status: 'claimed', claimedAt: '2026-09-24T10:00:00+08:00', pending: [old], pendingCount: 1, pendingCoins: 60, pendingDiamonds: 1})});
  h.api.render(continuousSnapshot({day: '2026-09-24', now: '2026-09-24T23:00:00+08:00', quests: [q]}));
  const board = h.element('quest-board').innerHTML;
  assert.match(board, /今日已领取/); assert.match(board, /过往 1 天的首轮待领取/);
  assert.match(board, /data-quest-action="submit"/);
  assert.equal(h.calls.requests.length, 0);
  h.fire('quest-board', {questAction: 'submit', subject: 'math'});
  const body = h.element('quest-action-body').innerHTML;
  assert.match(body, /之前的基础奖励已经结算/);
  assert.match(body, /基础奖励 <b>0 金币 · 0 钻石/);
  assert.match(body, /首轮加赠 <b>60 金币 · 1 钻石/);
  assert.match(body, /2026-09-23/); assert.match(body, /与这次交付时间无关/);
  assert.equal(h.calls.requests.length, 0, 'opening the claim is review-only');
});

test('acceptance explains additional first-round rewards without limiting when a base commission may start', () => {
  const h = harness();
  const q = continuousQuest({subject: 'cs', target: 60, bonus: firstRound({period: 'afternoon', windowLabel: '12:00–18:00', status: 'ended'})});
  h.api.render(continuousSnapshot({now: '2026-09-24T23:00:00+08:00', quests: [q]}));
  h.fire('quest-board', {questAction: 'accept', subject: 'cs'});
  const body = h.element('quest-action-body').innerHTML;
  assert.match(body, /基础奖励始终相同/); assert.match(body, /午后首轮/); assert.match(body, /接取后累计 60 分钟/);
  assert.match(body, /每天每科一次/); assert.match(body, /晚些再领取/);
  assert.doesNotMatch(body, /全天同等奖励|奖励与时段无关|截止|已过期/);
  assert.equal(h.element('quest-action-confirm').hidden, false);
});

test('current first-round cards show authoritative ticket previews separately from ordinary complete rounds', () => {
  const h=harness();
  const active=continuousQuest({bonus:firstRound({lotteryTickets:{coinTickets:0,diamondTickets:0}})});
  assert.match(h.api.taskMarkup(active),/当日新首轮领取另赠 1 张金币抽奖券/);
  const ready=continuousQuest({status:'ready',firstCompleted:true,minutes:0,
    bonus:firstRound({status:'ready',lotteryTickets:{coinTickets:1,diamondTickets:1}}),
    roundTickets:{rounds:0,coinTickets:0,diamondTickets:0}});
  const markup=h.api.taskMarkup(ready);
  assert.match(markup,/本次首轮另得 1 张金币抽奖券 · 1 张钻石抽奖券，交付时一起收好/);
  assert.match(markup,/普通委托每交付完整 90 分钟，得 1 张金币抽奖券/);
  assert.doesNotMatch(markup,/本次交付完成/);
  assert.equal(h.calls.requests.length,0);
});

test('mentor periods explain same-learning-day diamond tickets for the correct two subjects', () => {
  const h=harness(),quests=['math','politics','cs','english'].map(subject=>continuousQuest({subject,
    bonus:firstRound({period:['math','politics'].includes(subject)?'morning':'afternoon',
      lotteryTickets:{coinTickets:0,diamondTickets:0}})}));
  h.api.render(continuousSnapshot({quests}));
  const markup=h.element('quest-board').innerHTML;
  assert.equal((markup.match(/同日数学、政治首轮领齐 · 1 张钻石抽奖券/g)||[]).length,1);
  assert.equal((markup.match(/同日408、英语首轮领齐 · 1 张钻石抽奖券/g)||[]).length,1);
  assert.doesNotMatch(markup,/四科首轮全部领齐|首轮领齐 · 1 张金币抽奖券/);
  h.api.render(continuousSnapshot());
  assert.doesNotMatch(h.element('quest-board').innerHTML,/首轮领齐 · 1 张钻石抽奖券/);
});

test('new first-round acceptance distinguishes single-subject, period-pair and ordinary-round tickets', () => {
  const h=harness();
  for(const subject of ['math','politics','cs','english']){
    const period=['math','politics'].includes(subject)?'morning':'afternoon',pair=period==='morning'?'数学、政治':'408、英语';
    const q=continuousQuest({subject,bonus:firstRound({period,status:'unaccepted',
      lotteryTickets:{coinTickets:0,diamondTickets:0}}),roundTickets:{rounds:0,coinTickets:0,diamondTickets:0}});
    h.api.render(continuousSnapshot({quests:[q]}));h.fire('quest-board',{questAction:'accept',subject});
    const html=h.element('quest-action-body').innerHTML;
    assert.match(html,/当日每科首轮领取另赠 1 张金币抽奖券/);
    assert.match(html,new RegExp(`同一学习日的${pair}首轮都领取，再赠 1 张钻石抽奖券`));
    assert.match(html,/首轮赠券与普通委托轮次赠券分别计算/);
    assert.match(html,/四科合计每交付 3 轮，再得 1 张钻石抽奖券/);
    h.element('quest-action-dialog').close();
  }
  assert.equal(h.calls.requests.length,0);
});

test('bonus-only multi-day claims show only the server ticket preview rather than the number of pending dates', () => {
  const h=harness(),pending=['2026-09-21','2026-09-22','2026-09-23'].map(day=>({day,coins:60,diamonds:1}));
  const q=continuousQuest({status:'ready',firstCompleted:true,minutes:0,reward:{coins:180,diamonds:3},
    bonus:firstRound({status:'claimed',pending,lotteryTickets:{coinTickets:1,diamondTickets:2}}),
    roundTickets:{rounds:0,coinTickets:0,diamondTickets:0}});
  h.api.render(continuousSnapshot({quests:[q]}));
  assert.match(h.element('quest-board').innerHTML,/本次首轮另得 1 张金币抽奖券 · 2 张钻石抽奖券/);
  assert.doesNotMatch(h.element('quest-board').innerHTML,/3 张金币抽奖券/);
  h.fire('quest-board',{questAction:'submit',subject:'math'});
  const html=h.element('quest-action-body').innerHTML;
  assert.match(html,/本次首轮另得 <strong>1 张金币抽奖券 · 2 张钻石抽奖券/);
  assert.match(html,/历史首轮按本次实际可领数量结算/);
  assert.match(html,/2026-09-21、2026-09-22、2026-09-23/);
  assert.doesNotMatch(html,/本次普通委托另得|3 张金币抽奖券/);
  assert.equal(h.calls.requests.length,0);
});

test('old, zero and malformed first-round ticket previews do not promise historical tickets or alter claim eligibility', () => {
  const h=harness();
  for(const lotteryTickets of [undefined,{coinTickets:0,diamondTickets:0},{coinTickets:-1,diamondTickets:1},
    {coinTickets:1,diamondTickets:'<img>'},{coinTickets:1.5,diamondTickets:0}]){
    const q=continuousQuest({status:'ready',firstCompleted:true,minutes:0,reward:{coins:60,diamonds:1},
      bonus:firstRound({status:'claimed',pending:[{day:'2026-09-22'}],lotteryTickets})});
    h.api.render(continuousSnapshot({quests:[q]}));
    const markup=h.element('quest-board').innerHTML;
    assert.doesNotMatch(markup,/本次首轮另得|当日新首轮|<img|NaN/);
    assert.match(markup,/data-quest-action="submit"/);
    h.fire('quest-board',{questAction:'submit',subject:'math'});
    assert.doesNotMatch(h.element('quest-action-body').innerHTML,/本次首轮另得|<img|NaN/);
    h.element('quest-action-dialog').close();
  }
  const legacy=continuousQuest({bonus:firstRound()});
  h.api.render(continuousSnapshot({quests:[legacy]}));h.fire('quest-board',{questAction:'accept',subject:'math'});
  assert.doesNotMatch(h.element('quest-action-body').innerHTML,/每科首轮领取另赠/);
  assert.match(h.element('quest-action-body').innerHTML,/额外获得 60 金币 · 1 钻石/);
  assert.equal(h.calls.requests.length,0);
});

test('first-round delivery uses actual receipt ticket counts and accepts new diamond period grants without a complete ordinary round', async () => {
  const h=harness();vm.runInContext(lotterySource,h.context);
  const q=continuousQuest({status:'ready',firstCompleted:true,minutes:0,reward:{coins:60,diamonds:1},
    bonus:firstRound({status:'ready',lotteryTickets:{coinTickets:2,diamondTickets:2}}),
    roundTickets:{rounds:0,coinTickets:0,diamondTickets:0}});
  h.api.render(continuousSnapshot({quests:[q]}));h.fire('quest-board',{questAction:'submit',subject:'math'});
  assert.match(h.element('quest-action-body').innerHTML,/本次首轮另得 <strong>2 张金币抽奖券 · 2 张钻石抽奖券/);
  const [done]=h.fire('quest-action-confirm'),request=h.calls.requests[0];
  request.resolve(continuousSnapshot({now:'2026-09-23T09:00:01+08:00',quests:[{...q,status:'active',minutes:0}],
    receipt:{requestId:request.body.requestId,coins:60,diamonds:1,alreadyClaimed:false,
      baseReward:{coins:0,diamonds:0},bonusReward:{coins:60,diamonds:1},roundTickets:{rounds:0,coinTickets:0,diamondTickets:0}},
    ticketGrants:[{machine:'coin',count:1,source:'timed-subject'},{machine:'diamond',count:1,source:'timed-morning'}]}));
  await done;
  const toast=h.calls.toasts[0][1];
  assert.match(toast,/\+1 金币抽奖券 · \+1 钻石抽奖券/);
  assert.doesNotMatch(toast,/\+2 金币抽奖券|\+2 钻石抽奖券|本次完整交付/);
  assert.equal(h.calls.requests.length,1);assert.equal(h.calls.sounds.length,1);
});

test('submit toast and ledger use server totals with separate base and first-round amounts, including late records', async () => {
  const h = harness();
  const pending = {day: '2026-09-23', subject: 'math', target: 60, minutes: 60, coins: 60, diamonds: 1};
  const q = continuousQuest({status: 'ready', firstCompleted: true, minutes: 60, reward: {coins: 180, diamonds: 3},
    rewardBreakdown: {base: {coins: 120, diamonds: 2}, bonus: {coins: 60, diamonds: 1}}, bonus: firstRound({pending: [pending], pendingCount: 1})});
  h.api.render(continuousSnapshot({day: '2026-09-24', now: '2026-09-24T20:00:00+08:00', quests: [q]}));
  h.fire('quest-board', {questAction: 'submit', subject: 'math'});
  assert.match(h.element('quest-action-body').innerHTML, /> 180 <small>金币/);
  assert.match(h.element('quest-action-body').innerHTML, /基础奖励 <b>120 金币 · 2 钻石/);
  const [submit] = h.fire('quest-action-confirm');
  const receipt = {subject: 'math', name: '数学', day: '2026-09-24', minutes: 61, coins: 182, diamonds: 3,
    submittedAt: '2026-09-24T20:00:01+08:00', baseReward: {coins: 122, diamonds: 2}, bonusReward: {coins: 60, diamonds: 1}, bonuses: [pending]};
  h.calls.requests[0].resolve(continuousSnapshot({day: '2026-09-24', now: '2026-09-24T20:00:01+08:00',
    quests: [{...q, status: 'active', minutes: 0, reward: {coins: 0, diamonds: 0}}], receipt, history: [receipt]}));
  await submit;
  assert.match(h.calls.toasts[0][1], /^\+182 金币 · \+3 钻石/);
  assert.match(h.calls.toasts[0][1], /基础 122 金币 · 2 钻石，首轮加赠 60 金币 · 1 钻石/);
  const history = h.element('quest-history').innerHTML;
  assert.match(history, /> 182 <small>金币/); assert.match(history, /基础奖励 <b>122 金币 · 2 钻石/);
  assert.match(history, /首轮加赠 <b>60 金币 · 1 钻石/); assert.match(history, /首轮归属 2026-09-23/);
});

test('bonus day and window values are safely rendered while old reward history remains readable', () => {
  const h = harness(), attack = '<img src=x onerror="evil()">';
  const q = continuousQuest({status: 'ready', reward: {coins: 60, diamonds: 1},
    bonus: firstRound({windowLabel: attack, pending: [{day: attack, coins: 60, diamonds: 1}]})});
  h.api.render(continuousSnapshot({quests: [q], history: [
    {name: '数学', day: '2026-09-23', minutes: 60, coins: 120, diamonds: 2, submittedAt: now},
    {name: '数学', day: '2026-09-24', minutes: 0, coins: 60, diamonds: 1, submittedAt: now,
      baseReward: {coins: 0, diamonds: 0}, bonusReward: {coins: 60, diamonds: 1}, bonuses: [{day: attack}]},
  ]}));
  h.fire('quest-board', {questAction: 'submit', subject: 'math'});
  for (const id of ['quest-board', 'quest-action-body', 'quest-history']) {
    assert.doesNotMatch(h.element(id).innerHTML, /<img/); assert.match(h.element(id).innerHTML, /&lt;img/);
  }
  assert.match(h.element('quest-history').innerHTML, /> 120 <small>金币/);
  assert.match(h.element('quest-history').innerHTML, /补领首轮/);
});

test('continuous first target uses precise progress, while subsequent small increments can be delivered', () => {
  const h = harness();
  for (const rounded of [99.99, 100]) {
    const initial = h.api.taskMarkup(continuousQuest({status: 'active', minutes: 89.999,
      progressMinutes: 89.999, progressPercent: rounded, percent: rounded}));
    assert.doesNotMatch(initial, /data-quest-action="submit"|aria-valuenow="100"|>100%</);
    assert.match(initial, /aria-valuenow="99\.9"/);
  }
  const q = continuousQuest({status: 'ready', firstCompleted: true, minutes: 15,
    settledMinutes: 90, totalMinutes: 105, progressMinutes: 15, paidCoins: 180, paidDiamonds: 2,
    reward: {coins: 30, diamonds: 0}});
  assert.equal(h.api.actionFor(q).action, 'submit');
  const subsequent = h.api.taskMarkup(q);
  assert.match(subsequent, /data-quest-action="submit"/);
  assert.match(subsequent, /aria-valuenow="16\.6"/);
  assert.match(subsequent, /> 30 <small>金币/);
  assert.match(subsequent, /> 0 <small>钻石/);
  assert.doesNotMatch(subsequent, /等待达标|停止累计|不再追加/);
  assert.equal(h.api.actionFor({...q, status: 'active', minutes: 0, reward: {coins: 0, diamonds: 0}}).action, null);
});

test('continuous progress is independent of pending minutes and persists across midnight', () => {
  const h = harness();
  const active = continuousQuest({status: 'active', minutes: 65, progressMinutes: 65,
    acceptedAt: '2026-09-23T23:00:00+08:00'});
  h.api.render(continuousSnapshot({now: '2026-09-23T23:59:59+08:00', quests: [active]}));
  h.api.render(continuousSnapshot({day: '2026-09-24', now: '2026-09-24T00:00:01+08:00', quests: [active]}));
  assert.doesNotMatch(h.element('quest-board').innerHTML, /data-quest-action="accept"|已过期|截止/);
  assert.match(h.element('quest-board').innerHTML, />65<small>分钟/);
  assert.match(h.element('quest-board').innerHTML, /aria-valuenow="72\.2"/);
  const nextRound = continuousQuest({status: 'ready', firstCompleted: true, minutes: 15,
    settledMinutes: 105, todaySettledMinutes: 15, totalMinutes: 120, progressMinutes: 30,
    reward: {coins: 30, diamonds: 0}, paidCoins: 210, paidDiamonds: 2});
  h.api.render(continuousSnapshot({day: '2026-09-24', now: '2026-09-24T01:00:00+08:00', quests: [nextRound]}));
  const board = h.element('quest-board').innerHTML;
  assert.match(board, />30<small>分钟/);
  assert.match(board, /待交付专注 <b>15 分钟/);
  assert.match(board, /aria-valuenow="33\.3"/, 'diamond progress includes previous sub-target settlement');
  assert.match(board, /今日已交付 <b>15 分钟/);
  assert.doesNotMatch(board, /aria-valuenow="100"/, 'total accumulated minutes are not the current diamond round');
  assert.equal(h.calls.requests.length, 0, 'crossing midnight never automatically accepts or claims a commission');
});

test('continuous acceptance is explicit, single-flight, and never sends a submit UUID or time cutoff', async () => {
  const h = harness();
  h.api.render(continuousSnapshot({now: '2026-09-23T23:00:00+08:00'}));
  h.fire('quest-board', {questAction: 'accept', subject: 'cs'});
  const body = h.element('quest-action-body').innerHTML;
  assert.match(body, /接取|接下/);
  assert.doesNotMatch(body, /截止|过期|不再追加|仅.*下午/);
  assert.equal(h.calls.requests.length, 0);
  const [accept] = h.fire('quest-action-confirm');
  h.fire('quest-action-confirm');
  assert.equal(h.calls.requests.length, 1);
  assert.equal(h.calls.requests[0].path, '/api/quests/accept');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.requests[0].body)), {subject: 'cs'});
  h.calls.requests[0].resolve(continuousSnapshot({now: '2026-09-23T23:00:01+08:00',
    quests: [continuousQuest({subject: 'cs', status: 'active', acceptedAt: '2026-09-23T23:00:01+08:00'})]}));
  await accept;
  assert.equal(h.element('quest-action-dialog').open, false);
  assert.doesNotMatch(h.element('quest-board').innerHTML, /data-quest-action="accept"/);
  assert.deepEqual(h.calls.refresh, [true]);
});

test('continuous claims retain request IDs on retry, toast the receipt, and use a new ID for the next increment', async () => {
  const h = harness();
  const ready = continuousQuest({status: 'ready', firstCompleted: true, minutes: 120, progressMinutes: 120,
    reward: {coins: 240, diamonds: 2}});
  h.api.render(continuousSnapshot({now: '2026-09-23T23:30:00+08:00', quests: [ready]}));
  h.fire('quest-board', {questAction: 'submit', subject: 'math'});
  assert.doesNotMatch(h.element('quest-action-body').innerHTML, /截止|过期|停止累计|不再追加/);
  const [first] = h.fire('quest-action-confirm');
  h.fire('quest-action-confirm');
  assert.equal(h.calls.requests.length, 1);
  const firstJob = h.calls.requests[0];
  assert.equal(firstJob.path, '/api/quests/submit');
  assert.deepEqual(Object.keys(firstJob.body).sort(), ['requestId', 'subject']);
  assert.equal(firstJob.body.subject, 'math');
  assert.match(firstJob.body.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  firstJob.reject(new Error('连接中断，交付状态待确认'));
  await first;
  assert.equal(h.element('quest-action-dialog').open, true);
  assert.equal(h.element('quest-action-confirm').disabled, false);
  assert.match(h.element('quest-action-error').textContent, /交付状态待确认/);
  assert.equal(h.calls.toasts.length, 0);
  assert.deepEqual(h.calls.sounds, []);

  // Another poll can arrive after the server committed an unacknowledged claim.
  // The retry must still ask for the original receipt, not create a new claim.
  const settled = continuousQuest({status: 'active', firstCompleted: true, minutes: 0,
    settledMinutes: 120, totalMinutes: 120, progressMinutes: 30,
    reward: {coins: 0, diamonds: 0}, paidCoins: 240, paidDiamonds: 2});
  h.api.render(continuousSnapshot({now: '2026-09-23T23:30:02+08:00', quests: [settled], wallet: {coins: 740, diamonds: 7}}));
  const [retry] = h.fire('quest-action-confirm');
  assert.equal(h.calls.requests.length, 2);
  assert.equal(h.calls.requests[1].body.requestId, firstJob.body.requestId);
  h.calls.requests[1].resolve(continuousSnapshot({now: '2026-09-23T23:30:03+08:00',
    quests: [settled], wallet: {coins: 740, diamonds: 7},
    receipt: {subject: 'math', name: '数学', minutes: 120, coins: 240, diamonds: 2,
      submittedAt: '2026-09-23T23:30:01+08:00', requestId: firstJob.body.requestId, alreadyClaimed: true}}));
  await retry;
  assert.equal(h.element('quest-action-dialog').open, false);
  assert.match(h.calls.toasts[0][1], /\+240 金币 · \+2 钻石/);
  assert.equal(h.element('quest-coins').textContent, '740');
  assert.deepEqual(h.calls.sounds, [], 'an already-claimed retry confirms the old receipt silently');
  assert.doesNotMatch(h.element('quest-board').innerHTML, /data-quest-action="accept"|data-quest-action="submit"/);

  // The next fifteen minutes are deliverable even though they are less than
  // the first ninety-minute target, and they belong to a distinct mutation.
  const incremental = continuousQuest({status: 'ready', firstCompleted: true, minutes: 15,
    settledMinutes: 120, totalMinutes: 135, progressMinutes: 45,
    reward: {coins: 30, diamonds: 0}, paidCoins: 240, paidDiamonds: 2});
  h.api.render(continuousSnapshot({day: '2026-09-24', now: '2026-09-24T00:15:00+08:00', quests: [incremental]}));
  h.fire('quest-board', {questAction: 'submit', subject: 'math'});
  const [next] = h.fire('quest-action-confirm');
  assert.equal(h.calls.requests.length, 3);
  assert.notEqual(h.calls.requests[2].body.requestId, firstJob.body.requestId);
  h.calls.requests[2].resolve(continuousSnapshot({day: '2026-09-24', now: '2026-09-24T00:15:01+08:00',
    quests: [{...incremental, status: 'active', minutes: 0, settledMinutes: 135, reward: {coins: 0, diamonds: 0}}],
    wallet: {coins: 770, diamonds: 7},
    receipt: {subject: 'math', name: '数学', minutes: 15, coins: 30, diamonds: 0,
      submittedAt: '2026-09-24T00:15:01+08:00', requestId: h.calls.requests[2].body.requestId, alreadyClaimed: false}}));
  await next;
  assert.match(h.calls.toasts[1][1], /\+30 金币 · \+0 钻石/);
  assert.equal(h.element('quest-coins').textContent, '770');
  assert.deepEqual(h.calls.sounds, [{cue:'delivery',key:`delivery:${h.calls.requests[2].body.requestId}`}]);
});

test('successful delivery, purchase and exchange sound only for a new confirmed receipt, never an idempotent replay', async () => {
  for (const action of ['submit','buy','exchange']) for (const duplicate of [false,true]) {
    const h=harness(), ready=continuousQuest({status:'ready',minutes:90,reward:{coins:180,diamonds:2}});
    h.api.render(continuousSnapshot({quests:[ready]}));
    if(action==='submit')h.fire('quest-board',{questAction:'submit',subject:'math'});
    else if(action==='buy')h.fire('shop-catalog',{shopAction:'buy',item:'bar-aurora'});
    else {h.element('exchange-amount').value='1';h.fire('exchange-open');}
    assert.deepEqual(h.calls.sounds, [], 'opening a confirmation is silent');
    const [pending]=h.fire('quest-action-confirm');h.fire('quest-action-confirm');assert.equal(h.calls.requests.length,1);
    const request=h.calls.requests[0],receipt=action==='submit'?{requestId:request.body.requestId,alreadyClaimed:duplicate,coins:180,diamonds:2}:
      action==='buy'?{itemId:'bar-aurora',alreadyOwned:duplicate,coins:duplicate?0:240,diamonds:0}:
      {requestId:request.body.requestId,alreadyExchanged:duplicate,coins:75,diamonds:1};
    const result=continuousSnapshot({now:'2026-09-23T09:00:01+08:00',quests:[{...ready,status:'active',minutes:0}],
      catalog:[item({owned:true})],receipt});
    request.resolve(result);await pending;
    assert.equal(h.calls.sounds.length,duplicate?0:1,`${action}: duplicate=${duplicate}`);
    if(!duplicate){
      assert.equal(h.calls.sounds[0].cue,action==='submit'?'delivery':'purchase');
      if(action!=='exchange')assert.equal(h.calls.sounds[0].key,action==='submit'?`delivery:${request.body.requestId}`:'purchase:bar-aurora');
    }
    h.api.render(result);h.api.render({...result,now:'2026-09-23T09:00:02+08:00'});
    assert.equal(h.calls.sounds.length,duplicate?0:1,'receipt-bearing poll snapshots do not replay action sounds');
  }
});

test('shop browsing, preview, cancel, acceptance and failed submit/exchange never play success sounds', async () => {
  const h=harness();h.api.render(snapshot());h.api.render(snapshot({now:'2026-09-23T09:00:01+08:00'}));
  h.fire('shop-catalog',{shopAction:'preview',item:'bar-aurora'});h.element('quest-action-dialog').close();
  h.fire('shop-catalog',{shopAction:'buy',item:'bar-aurora'});h.element('quest-action-dialog').close();
  h.fire('quest-board',{questAction:'accept',subject:'math'});const [accepted]=h.fire('quest-action-confirm');
  h.calls.requests[0].resolve(snapshot({now:'2026-09-23T09:00:02+08:00',quests:[quest({status:'active'})]}));await accepted;
  assert.deepEqual(h.calls.sounds,[]);
  for(const action of ['submit','exchange']){
    const failed=harness();failed.api.render(continuousSnapshot({quests:[continuousQuest({status:'ready',minutes:90,reward:{coins:180,diamonds:2}})]}));
    if(action==='submit')failed.fire('quest-board',{questAction:'submit',subject:'math'});else failed.fire('exchange-open');
    const [pending]=failed.fire('quest-action-confirm');failed.calls.requests[0].reject(new Error('offline'));await pending;
    assert.deepEqual(failed.calls.sounds,[],action);
  }
});

test('shop equip audio requires a changed, confirmed outfit and survives a poll arriving before acknowledgement', async () => {
  const h=harness(),initial=snapshot({catalog:[item({owned:true})]});h.api.render(initial);
  h.fire('shop-catalog',{shopAction:'equip',item:'bar-aurora'});h.fire('shop-catalog',{shopAction:'equip',item:'bar-aurora'});
  assert.equal(h.calls.requests.length,1);assert.deepEqual(h.calls.sounds,[]);
  const result=snapshot({now:'2026-09-23T09:00:01.000100+08:00',catalog:[item({owned:true,equipped:true})],equipped:{...initial.equipped,bar:'bar-aurora'}});
  h.api.render(result);assert.deepEqual(h.calls.sounds,[],'poll is not the successful action response');
  h.calls.requests[0].resolve({...result,now:'2026-09-23T09:00:01.000200+08:00'});await flush();
  assert.deepEqual(h.calls.sounds,[{cue:'equip'}]);
  h.fire('shop-catalog',{shopAction:'equip',item:'bar-aurora'});await flush();
  if(h.calls.requests.length>1){h.calls.requests[1].resolve({...result,now:'2026-09-23T09:00:02+08:00'});await flush();}
  assert.deepEqual(h.calls.sounds,[{cue:'equip'}],'equipping the current appearance again is silent');
  for(const failure of ['reject','mismatch']){
    const f=harness();f.api.render(initial);f.fire('shop-catalog',{shopAction:'equip',item:'bar-aurora'});
    if(failure==='reject')f.calls.requests[0].reject(new Error('offline'));else f.calls.requests[0].resolve({...initial,now:'2026-09-23T09:00:03+08:00'});
    await flush();assert.deepEqual(f.calls.sounds,[],failure);
  }
});


test('the delivered focus label uses only the server local-day amount, with safe empty compatibility', () => {
  const h=harness();
  for(const today of [undefined,null,0,37.5]){
    const q=continuousQuest({settledMinutes:480,todaySettledMinutes:today,minutes:15,progressMinutes:45});
    const markup=h.api.taskMarkup(q);
    assert.match(markup,new RegExp(`今日已交付 <b>${today||0} 分钟`));
    assert.doesNotMatch(markup,/已交付专注|今日已交付 <b>480/);
    assert.match(markup,/待交付专注 <b>15 分钟/);
    assert.equal(q.settledMinutes,480);
  }
});

function interfaceCatalog(){
  return [item({id:'interface-default',slot:'interface',name:'原初星夜',coins:0,currency:'free',owned:true,equipped:true}),
    item({id:'interface-forest',slot:'interface',name:'松风书斋',coins:1200}),
    item({id:'interface-paper',slot:'interface',name:'月白手札',coins:0,diamonds:32,currency:'diamonds'}),
    item({id:'theme-forest',slot:'theme',name:'旧有森林环境'}),item({id:'camp-pine',slot:'camp',name:'松间营地'})];
}
function interfaceHarness(){
  const art=require('../static/shop-art.js');const h=harness({ShopArt:{...art,apply(){}}});
  vm.runInContext(fs.readFileSync(require.resolve('../static/interface-themes.js'),'utf8'),h.context);
  return h;
}

test('interface shop area filters coins diamonds and collection independently from island environments',()=>{
  const h=interfaceHarness();h.api.render(snapshot({catalog:interfaceCatalog(),equipped:{interface:'interface-default',theme:'theme-forest'},wallet:{coins:2000,diamonds:40}}));
  h.fire('area-interface');assert.match(h.element('shop-catalog').innerHTML,/松风书斋/);assert.doesNotMatch(h.element('shop-catalog').innerHTML,/旧有森林环境|松间营地|月白手札/);
  assert.match(h.element('shop-market-description').textContent,/独立装备/);
  h.fire('market-diamonds');assert.match(h.element('shop-catalog').innerHTML,/月白手札/);assert.doesNotMatch(h.element('shop-catalog').innerHTML,/松风书斋/);
  h.fire('market-owned');assert.match(h.element('shop-catalog').innerHTML,/原初星夜/);
  h.fire('area-journey');h.fire('market-coins');assert.match(h.element('shop-catalog').innerHTML,/旧有森林环境/);assert.doesNotMatch(h.element('shop-catalog').innerHTML,/松风书斋|松间营地/);
  h.fire('equipped-slots',{loadoutSlot:'interface'});assert.match(h.element('shop-catalog').innerHTML,/原初星夜/);
});

test('interface preview and cancel never charge or equip, and polling retains the preview with original equipment',()=>{
  const h=interfaceHarness();const data=snapshot({catalog:interfaceCatalog(),wallet:{coins:2000,diamonds:40},equipped:{interface:'interface-default',theme:'theme-ocean',avatar:'avatar-royal',island:'island-garden'}});
  h.api.render(data);h.fire('shop-catalog',{shopAction:'preview',item:'interface-paper'});
  const preview=h.element('quest-action-art').innerHTML;
  assert.match(preview,/interface-full-preview/);assert.match(preview,/data-island-decoration="island-garden"/);
  assert.equal(h.element('quest-action-dialog').classes.has('interface-item-dialog'),true);
  assert.equal(h.element('quest-action-confirm').hidden,true);assert.equal(h.calls.requests.length,0);
  h.api.render({...data,now:'2026-09-23T09:00:03.000100+08:00'});
  assert.equal(h.element('quest-action-art').innerHTML,preview);assert.equal(h.document.documentElement.dataset.interface,'interface-default');
  h.element('quest-action-dialog').close();assert.equal(h.calls.requests.length,0);
  assert.equal(h.document.documentElement.dataset.theme,'theme-ocean');assert.equal(h.document.documentElement.dataset.avatar,'avatar-royal');
  h.fire('shop-catalog',{shopAction:'preview',item:'theme-forest'});assert.equal(h.element('quest-action-dialog').classes.has('interface-item-dialog'),false);
});

test('interface purchase and equip use existing single-item endpoints and preserve every other slot',async()=>{
  const h=interfaceHarness();const data=snapshot({catalog:interfaceCatalog(),wallet:{coins:2000,diamonds:40},equipped:{interface:'interface-default',theme:'theme-ocean',island:'island-palace',bar:'bar-comet',fx:'fx-snow'}});
  h.api.render(data);h.fire('shop-catalog',{shopAction:'buy',item:'interface-forest'});
  assert.match(h.element('quest-action-body').innerHTML,/购买后余额：800 金币/);assert.equal(h.calls.requests.length,0);
  h.fire('quest-action-confirm');h.fire('quest-action-confirm');assert.equal(h.calls.requests.length,1);
  assert.equal(h.calls.requests[0].path,'/api/shop/buy');assert.deepEqual(JSON.parse(JSON.stringify(h.calls.requests[0].body)),{itemId:'interface-forest'});
  const purchased={...data,now:'2026-09-23T09:00:01.000100+08:00',wallet:{coins:800,diamonds:40},catalog:data.catalog.map(i=>i.id==='interface-forest'?{...i,owned:true}:i),receipt:{itemId:'interface-forest'}};
  h.calls.requests[0].resolve(purchased);await flush();assert.equal(h.document.documentElement.dataset.interface,'interface-default');
  assert.match(h.api.itemMarkup(purchased.catalog[1],purchased.wallet),/已购买/);
  h.fire('shop-catalog',{shopAction:'equip',item:'interface-forest'});assert.equal(h.calls.requests[1].path,'/api/shop/equip');
  const equipped={...purchased,now:'2026-09-23T09:00:02.000100+08:00',equipped:{...data.equipped,interface:'interface-forest'}};
  h.calls.requests[1].resolve(equipped);await flush();
  h.api.render(purchased);assert.equal(h.document.documentElement.dataset.interface,'interface-forest','older poll cannot undo equip');
  for(const [slot,id] of Object.entries(data.equipped))if(slot!=='interface')assert.equal(h.document.documentElement.dataset[slot],id);
  assert.equal(h.calls.requests.length,2);assert.equal(h.calls.sounds.filter(s=>s.cue==='equip').length,1);
});

test('interface preview blocks unknown ids and insufficient balance without requests',()=>{
  const h=interfaceHarness();h.api.render(snapshot({catalog:[...interfaceCatalog(),item({id:'interface-missing',slot:'interface'})]}));
  h.fire('shop-catalog',{shopAction:'buy',item:'interface-forest'});assert.equal(h.element('quest-action-dialog').open,false);
  h.fire('shop-catalog',{shopAction:'preview',item:'interface-missing'});assert.equal(h.element('quest-action-dialog').open,false);
  assert.equal(h.calls.requests.length,0);
});

test('reverse exchange exposes fixed one-diamond trades and refuses missing quota, exhaustion, or an empty wallet',()=>{
  for(const [reverse,diamonds] of [[undefined,8],[{limit:5,used:5,remaining:0},8],[{limit:5,used:0,remaining:5},0]]){
    const h=harness();h.api.render(snapshot({wallet:{coins:500,diamonds},exchange:{coinsPerDiamond:75,history:[],reverse}}));
    assert.equal(h.element('exchange-reverse-open').disabled,true);
    h.fire('exchange-reverse-open');assert.equal(h.element('quest-action-dialog').shown,0);assert.equal(h.calls.requests.length,0);
  }
  const h=harness();h.api.render(snapshot({exchange:{coinsPerDiamond:75,history:[],reverse:{limit:5,used:2,remaining:3}}}));
  assert.equal(h.element('exchange-reverse-open').disabled,false);
  assert.match(h.element('exchange-reverse-status').textContent,/3 \/ 5/);
  h.element('exchange-amount').value='999';h.fire('exchange-reverse-open');
  assert.match(h.element('quest-action-body').innerHTML,/1 颗钻石/);
  assert.match(h.element('quest-action-body').innerHTML,/75 金币/);
  assert.match(h.element('quest-action-body').innerHTML,/今天还可兑换 2 次/);
  assert.match(h.element('quest-action-body').innerHTML,/575 金币 · 4 钻石/);
  assert.equal(h.calls.requests.length,0);
  h.element('quest-action-dialog').close();h.fire('quest-action-confirm');assert.equal(h.calls.requests.length,0);
});

test('reverse exchange keeps its request UUID on retry, blocks double clicks and uses the authoritative quota',async()=>{
  const h=harness(),exchange={coinsPerDiamond:75,history:[],reverse:{limit:5,used:4,remaining:1}};
  h.api.render(snapshot({exchange}));h.fire('exchange-reverse-open');
  const [first]=h.fire('quest-action-confirm');h.fire('quest-action-confirm');
  assert.equal(h.calls.requests.length,1);const req=h.calls.requests[0];
  assert.equal(req.path,'/api/shop/exchange-coins');assert.deepEqual(Object.keys(req.body),['requestId']);
  assert.equal(h.element('exchange-reverse-open').disabled,true);
  req.reject(new Error('连接中断'));await first;
  const [retry]=h.fire('quest-action-confirm');assert.equal(h.calls.requests[1].body.requestId,req.body.requestId);
  h.calls.requests[1].resolve(snapshot({now:'2026-09-23T09:00:04+08:00',wallet:{coins:575,diamonds:4},
    receipt:{direction:'diamonds-to-coins',alreadyExchanged:true,requestId:req.body.requestId,coins:75,diamonds:1},
    exchange:{...exchange,reverse:{limit:5,used:5,remaining:0},history:[{createdAt:now,coins:75,diamonds:1,direction:'diamonds-to-coins'}]}}));
  await retry;assert.equal(h.element('exchange-reverse-open').disabled,true);
  assert.equal(h.element('shop-coins').textContent,'575');assert.equal(h.element('shop-diamonds').textContent,'4');
  assert.match(h.element('exchange-history').innerHTML,/−1 钻石/);assert.match(h.element('exchange-history').innerHTML,/\+75 金币/);
  assert.equal(h.calls.sounds.length,0);assert.equal(h.calls.toasts[0][0],'兑换已确认');
  h.api.render(snapshot({exchange}));assert.equal(h.element('exchange-reverse-open').disabled,true,'older poll cannot restore spent quota');
  h.api.render(snapshot({now:'2026-09-24T00:00:01+08:00',day:'2026-09-24',wallet:{coins:575,diamonds:4},exchange:{...exchange,reverse:{limit:5,used:0,remaining:5}}}));
  assert.equal(h.element('exchange-reverse-open').disabled,false);assert.match(h.element('exchange-reverse-status').textContent,/5 \/ 5/);
});

test('new reverse receipts sound once and mixed exchange history preserves both currencies',async()=>{
  const h=harness(),exchange={coinsPerDiamond:75,history:[{createdAt:now,diamonds:2,coins:150}],reverse:{limit:5,used:0,remaining:5}};
  h.api.render(snapshot({exchange}));h.fire('exchange-reverse-open');const [done]=h.fire('quest-action-confirm');
  const req=h.calls.requests[0];h.calls.requests[0].resolve(snapshot({now:'2026-09-23T09:00:04+08:00',wallet:{coins:575,diamonds:4},
    receipt:{direction:'diamonds-to-coins',alreadyExchanged:false,requestId:req.body.requestId,coins:75,diamonds:1},
    exchange:{...exchange,reverse:{limit:5,used:1,remaining:4},history:[{createdAt:now,diamonds:1,coins:75,direction:'diamonds-to-coins'},...exchange.history]}}));await done;
  assert.deepEqual(h.calls.sounds,[{cue:'purchase',key:`exchange:${req.body.requestId}`}]);
  assert.match(h.element('exchange-history').innerHTML,/−1 钻石/);assert.match(h.element('exchange-history').innerHTML,/\+75 金币/);
  assert.match(h.element('exchange-history').innerHTML,/−150 金币/);assert.match(h.element('exchange-history').innerHTML,/\+2 钻石/);
  assert.match(h.calls.toasts[0][1],/使用 1 钻石，今日还可兑换 4 次/);
});


test('all ten bar products use the shared full-size preview without equipping or charging',()=>{
  const ids=['default','mint','aurora','comet','tide','prism','koi','fox','whale','dragon'].map(v=>'bar-'+v),previews=[],decorated=[];
  const h=harness({FocusProgressBars:{has:id=>ids.includes(id),fullPreview(id){previews.push(id);return `<div class="progress-bar-full-preview" data-full-bar="${id}"></div>`;},decorate(scope){decorated.push(scope.id||'document');}}});
  const catalog=ids.map((id,i)=>item({id,name:id,coins:i<6?100:0,diamonds:i<6?0:25,currency:i<6?'coins':'diamonds',owned:i===0,equipped:i===0}));h.api.render(snapshot({catalog}));
  for(const id of ids){h.fire('shop-catalog',{shopAction:'preview',item:id});assert.match(h.element('quest-action-art').innerHTML,new RegExp(`data-full-bar="${id}"`));assert.equal(h.element('quest-action-dialog').classes.has('progress-bar-item-dialog'),true);h.element('quest-action-dialog').close();}
  assert.deepEqual(previews,ids);assert.equal(h.calls.requests.length,0);assert.equal(h.document.documentElement.dataset.bar,'bar-default');assert.ok(decorated.includes('quest-board'));assert.ok(decorated.includes('quest-action-dialog'));assert.ok(decorated.includes('document'));
});
test('quest polling preserves an owned hover bar while newly rendered task bars are decorated',()=>{
  const applied=[],decorated=[];let hovered='bar-fox';
  const h=harness({ShopArt:{apply(eq){applied.push(eq.bar);},preview(){return '';}},FocusProgressBars:{decorate(scope){decorated.push(scope.id||'document');}},FocusQuickSkins:{previewBar:()=>hovered,render(){}}});
  const initial=snapshot({catalog:[item({id:'bar-default',coins:0,owned:true}),item({id:'bar-fox',coins:0,diamonds:25,owned:true})]});
  h.api.render(initial);h.api.render({...initial,now:'2026-09-23T09:00:01.000100+08:00'});assert.deepEqual(applied,['bar-fox','bar-fox']);assert.equal(h.document.documentElement.dataset.bar,'bar-fox');assert.equal(initial.equipped.bar,'bar-default');
  hovered=null;h.api.render({...initial,now:'2026-09-23T09:00:02.000100+08:00'});assert.equal(applied.at(-1),'bar-default');
  hovered='bar-fox';h.api.render({...initial,now:'2026-09-23T09:00:03.000100+08:00',catalog:initial.catalog.map(i=>({...i,owned:i.id==='bar-default'}))});assert.equal(applied.at(-1),'bar-default');assert.equal(h.calls.requests.length,0);
});


test('unchanged shop polls preserve SVG thumbnail identities even when the renderer uses unique gradient IDs',()=>{
  let drawings=0;const h=harness({ShopArt:{apply(){},preview:id=>`<svg data-bar="${id}" id="unique-${++drawings}"></svg>`}});const initial=snapshot();h.api.render(initial);const original=h.element('shop-catalog').innerHTML,count=drawings;
  for(let i=0;i<100;i++)h.api.render({...initial,now:`2026-09-23T09:00:01.${String(i+100).padStart(6,'0')}+08:00`});
  assert.equal(h.element('shop-catalog').innerHTML,original);assert.equal(drawings,count);
  h.api.render({...initial,now:'2026-09-23T09:00:02.000000+08:00',wallet:{coins:20,diamonds:0}});assert.ok(drawings>count);assert.match(h.element('shop-catalog').innerHTML,/余额不足/);
});


test('lottery-only collections stay out of currency shops, cannot be purchased, and preserve pity copy through filters', () => {
  const h=harness();
  const rare=item({id:'island-celestialpalace',slot:'island',name:'穹顶星都',coins:0,diamonds:99,currency:'diamonds',lotteryOnly:true,lotteryMachine:'diamond'});
  h.api.render(snapshot({catalog:[item(),rare],wallet:{coins:99999,diamonds:9999}}));
  assert.doesNotMatch(h.element('shop-catalog').innerHTML,/穹顶星都/);
  h.fire('market-diamonds');assert.doesNotMatch(h.element('shop-catalog').innerHTML,/穹顶星都/);
  h.fire('market-limited');assert.match(h.element('shop-catalog').innerHTML,/穹顶星都/);
  assert.match(h.element('shop-catalog').innerHTML,/只能通过抽奖获得/);
  assert.doesNotMatch(h.element('shop-catalog').innerHTML,/99/);
  assert.match(h.element('shop-catalog').innerHTML,/data-shop-action="buy"[^>]*disabled/);
  h.fire('filter-island');assert.match(h.element('shop-market-description').textContent,/25抽保底/);
  h.fire('shop-catalog',{shopAction:'buy',item:rare.id});
  assert.equal(h.element('quest-action-dialog').open,false);assert.equal(h.calls.requests.length,0);
});

test('ordinary products retain normal currency prices with no purchase-only badge even on old catalog snapshots',()=>{
  const h=harness();
  const coin=item({id:'companion-cat',name:'窗边小猫',slot:'companion',coins:110,lotteryExclusive:true});
  const diamond=item({id:'bar-music',name:'星河八音盒',coins:0,diamonds:28,currency:'diamonds',lotteryExclusive:true});
  const limited=item({id:'bar-galaxy',name:'无垠星河',coins:0,diamonds:99,currency:'diamonds',lotteryOnly:true,lotteryMachine:'diamond'});
  h.api.render(snapshot({catalog:[coin,diamond,limited],wallet:{coins:500,diamonds:50}}));
  assert.match(h.element('shop-catalog').innerHTML,/窗边小猫/);assert.match(h.element('shop-catalog').innerHTML,/110 <small>金币<\/small>/);
  assert.doesNotMatch(h.element('shop-catalog').innerHTML,/商店专藏|仅能购买|不进入抽奖池/);
  h.fire('market-diamonds');assert.match(h.element('shop-catalog').innerHTML,/星河八音盒/);assert.match(h.element('shop-catalog').innerHTML,/28 <small>钻石<\/small>/);
  assert.doesNotMatch(h.element('shop-catalog').innerHTML,/商店专藏|无垠星河/);
  h.fire('shop-catalog',{shopAction:'buy',item:diamond.id});assert.match(h.element('quest-action-body').innerHTML,/28 <small>钻石<\/small>/);
  assert.doesNotMatch(h.element('quest-action-body').innerHTML,/商店专藏/);h.element('quest-action-dialog').close();
  h.fire('market-limited');assert.match(h.element('shop-catalog').innerHTML,/钻石机限定 <small>只能通过抽奖获得/);
  assert.equal(h.calls.requests.length,0);
});

test('a won collection shortcut opens the matching owned category without spending currency', () => {
  const h=harness();
  h.api.render(snapshot({catalog:[item(),item({id:'island-celestialpalace',slot:'island',name:'穹顶星都',owned:true,lotteryOnly:true,lotteryMachine:'diamond'})]}));
  h.api.browseCollection('island');
  assert.equal(h.element('market-owned').attributes['aria-pressed'],'true');
  assert.equal(h.element('filter-island').attributes['aria-pressed'],'true');
  assert.match(h.element('shop-catalog').innerHTML,/穹顶星都/);
  assert.match(h.element('shop-catalog').innerHTML,/已收藏/);
  assert.doesNotMatch(h.element('shop-catalog').innerHTML,/极光流彩/);
  assert.equal(h.calls.requests.length,0);
});

test('ordinary commission acceptance explains standard-round tickets and persistent combined progress', () => {
  const h=harness();
  for(const subject of ['math','cs','politics','english']){
    const target=['math','cs'].includes(subject)?60:30;
    const q=continuousQuest({subject,target,roundTickets:{rounds:0,coinTickets:0,diamondTickets:0}});
    h.api.render(continuousSnapshot({quests:[q],lottery:roundTicketsState(2)}));
    assert.match(h.element('quest-board').innerHTML,new RegExp(`普通委托每交付完整 ${target} 分钟，得 1 张金币抽奖券`));
    h.fire('quest-board',{questAction:'accept',subject});
    const html=h.element('quest-action-body').innerHTML;
    assert.match(html,new RegExp(`每交付完整 ${target} 分钟，得 1 张金币抽奖券`));
    assert.match(html,/四科合计每交付 3 轮，再得 1 张钻石抽奖券/);
    assert.match(html,/轮次与零头跨天、重启保留，旧完整轮次不补发/);
    assert.match(html,/累计交付 2 轮，再交付 1 轮可得 1 张钻石抽奖券/);
    h.element('quest-action-dialog').close();
  }
  assert.equal(h.calls.requests.length,0);
});

test('partial-minute turn-ins display the authoritative new round preview without deriving it from pending minutes', () => {
  const h=harness(),q=continuousQuest({target:60,status:'ready',firstCompleted:true,minutes:15,
    progressMinutes:60,settledMinutes:45,reward:{coins:30,diamonds:2},
    roundTickets:{rounds:1,coinTickets:1,diamondTickets:1}});
  h.api.render(continuousSnapshot({quests:[q],lottery:roundTicketsState(2)}));
  assert.match(h.element('quest-board').innerHTML,/本次交付完成 1 轮，另得 1 张金币抽奖券 · 1 张钻石抽奖券/);
  h.fire('quest-board',{questAction:'submit',subject:'math'});
  assert.match(h.element('quest-action-body').innerHTML,/本次普通委托另得 <strong>1 张金币抽奖券 · 1 张钻石抽奖券/);
  assert.match(h.element('quest-action-body').innerHTML,/15 分钟数学/);
  assert.equal(h.calls.requests.length,0);
});

test('incomplete rounds and bonus-only turn-ins never promise a newly completed ordinary round', () => {
  const h=harness();
  for(const q of [
    continuousQuest({target:60,status:'ready',firstCompleted:true,minutes:59.999,progressMinutes:59.999,
      roundTickets:{rounds:0,coinTickets:0,diamondTickets:0}}),
    continuousQuest({target:60,status:'ready',firstCompleted:true,minutes:0,reward:{coins:60,diamonds:1},
      bonus:firstRound({status:'ready',pending:[{day:'2026-09-23'}]}),
      roundTickets:{rounds:0,coinTickets:0,diamondTickets:0}})
  ]){
    h.api.render(continuousSnapshot({quests:[q],lottery:roundTicketsState(0)}));
    assert.doesNotMatch(h.element('quest-board').innerHTML,/本次交付完成/);
    h.fire('quest-board',{questAction:'submit',subject:'math'});
    assert.doesNotMatch(h.element('quest-action-body').innerHTML,/本次普通委托另得/);
    assert.match(h.element('quest-action-body').innerHTML,/每交付完整 60 分钟/);
    h.element('quest-action-dialog').close();
  }
  assert.equal(h.calls.requests.length,0);
});

test('ordinary and timed tickets share the receipt toast while total rounds use the accepted server snapshot', async () => {
  const h=harness();vm.runInContext(lotterySource,h.context);
  const q=continuousQuest({target:60,status:'ready',firstCompleted:true,minutes:120,
    reward:{coins:240,diamonds:4},roundTickets:{rounds:2,coinTickets:2,diamondTickets:1}});
  h.api.render(continuousSnapshot({quests:[q],lottery:roundTicketsState(2)}));
  h.fire('quest-board',{questAction:'submit',subject:'math'});const [done]=h.fire('quest-action-confirm');
  const request=h.calls.requests[0];
  h.calls.requests[0].resolve(continuousSnapshot({now:'2026-09-23T09:00:01+08:00',lottery:roundTicketsState(5),
    quests:[{...q,status:'active',minutes:0,roundTickets:{rounds:0,coinTickets:0,diamondTickets:0}}],
    receipt:{requestId:request.body.requestId,coins:240,diamonds:4,alreadyClaimed:false,
      roundTickets:{rounds:3,coinTickets:3,diamondTickets:1}},
    ticketGrants:[{machine:'coin',count:3,source:'quest-round'},
      {machine:'coin',count:1,source:'timed-morning'},{machine:'diamond',count:1,source:'quest-round-three'}]}));
  await done;
  const toast=h.calls.toasts[0][1];
  assert.match(toast,/\+4 金币抽奖券 · \+1 钻石抽奖券/);
  assert.match(toast,/本次完整交付 3 轮/,'the receipt replaces the earlier 2-round preview');
  assert.match(toast,/累计交付 5 轮，再交付 1 轮/);
  assert.equal(h.calls.sounds.length,1);
  assert.equal(h.calls.requests.length,1);
});

test('confirmation retries show previously received round tickets without granting or replaying them', async () => {
  const h=harness();vm.runInContext(lotterySource,h.context);
  const q=continuousQuest({target:60,status:'ready',firstCompleted:true,minutes:60,reward:{coins:120,diamonds:2},
    roundTickets:{rounds:1,coinTickets:1,diamondTickets:0}});
  h.api.render(continuousSnapshot({quests:[q],lottery:roundTicketsState(3)}));
  h.fire('quest-board',{questAction:'submit',subject:'math'});const [failed]=h.fire('quest-action-confirm');
  const original=h.calls.requests[0];original.reject(new Error('连接中断'));await failed;
  h.api.render(continuousSnapshot({now:'2026-09-24T09:00:02.000200+08:00',day:'2026-09-24',
    quests:[{...q,status:'active',minutes:0}],lottery:roundTicketsState(7)}));
  const [done]=h.fire('quest-action-confirm');assert.equal(h.calls.requests[1].body.requestId,original.body.requestId);
  h.calls.requests[1].resolve(continuousSnapshot({now:'2026-09-24T09:00:02.000100+08:00',day:'2026-09-24',
    quests:[{...q,status:'active',minutes:0}],lottery:roundTicketsState(4),ticketGrants:[],
    receipt:{requestId:original.body.requestId,coins:120,diamonds:2,alreadyClaimed:true,
      roundTickets:{rounds:1,coinTickets:1,diamondTickets:0}}}));
  await done;
  assert.match(h.calls.toasts[0][0],/这次交付已确认/);
  assert.match(h.calls.toasts[0][1],/该次已收好 1 张金币抽奖券/);
  assert.doesNotMatch(h.calls.toasts[0][1],/\+1 金币抽奖券/);
  assert.match(h.calls.toasts[0][1],/累计交付 7 轮，再交付 2 轮/,'a late receipt must not rewind the latest total');
  assert.equal(h.calls.sounds.length,0);
});

test('old settled history and malformed round fields cannot invent voucher rewards', () => {
  const h=harness();
  const q=continuousQuest({target:60,settledMinutes:60000,totalMinutes:60000,status:'available',
    roundTickets:{rounds:'<img>',coinTickets:1,diamondTickets:1}});
  h.api.render(continuousSnapshot({quests:[q],lottery:{roundTickets:{totalRounds:-1,roundsToNextDiamond:0}},
    history:[{name:'数学',day:'2026-09-22',minutes:60000,coins:120000,diamonds:2000,submittedAt:now}]}));
  h.fire('quest-board',{questAction:'accept',subject:'math'});
  assert.doesNotMatch(h.element('quest-board').innerHTML,/本次交付完成|<img|NaN/);
  assert.doesNotMatch(h.element('quest-action-body').innerHTML,/本次普通委托另得|累计交付 -1|<img|NaN/);
  assert.match(h.element('quest-action-body').innerHTML,/旧完整轮次不补发/);
  assert.equal(h.calls.requests.length,0);
});

test('the commission board has one permanent diamond-ticket progress ribbon that advances after an authoritative response',()=>{
  const h=harness();h.api.render(continuousSnapshot({lottery:roundTicketsState(2)}));
  const host=h.element('quest-round-progress');assert.equal(host.hidden,false);assert.match(host.innerHTML,/再交付 <b>1<\/b> 轮，收下 1 张钻石抽奖券/);
  assert.match(host.innerHTML,/累计已交付 2 轮/);assert.match(host.innerHTML,/轮次与零头跨日保留/);assert.match(host.innerHTML,/本组三轮委托已完成 2 轮/);
  h.api.render(continuousSnapshot({now:'2026-09-23T09:01:00+08:00',lottery:roundTicketsState(3)}));
  assert.match(host.innerHTML,/再交付 <b>3<\/b> 轮/);assert.match(host.innerHTML,/累计已交付 3 轮/);
  h.api.render(continuousSnapshot({now:'2026-09-23T09:00:59+08:00',lottery:roundTicketsState(1)}));assert.match(host.innerHTML,/累计已交付 3 轮/);
  assert.equal(h.calls.requests.length,0);
});

test('the commission voucher ribbon remains absent for old servers and invalid counters',()=>{
  const h=harness();h.api.render(continuousSnapshot());assert.equal(h.element('quest-round-progress').hidden,true);
  h.api.render(continuousSnapshot({now:'2026-09-23T09:01:00+08:00',lottery:{roundTickets:{totalRounds:'<img>',roundsToNextDiamond:0}}}));
  assert.equal(h.element('quest-round-progress').hidden,true);assert.doesNotMatch(h.element('quest-round-progress').innerHTML,/<img|NaN/);
});

test('shop prices and commission prizes use the shared currency glyphs without nesting legacy currency wrappers',()=>{
  const h=harness({FocusCurrencyArt:require('../static/currency-art.js')});h.api.render(continuousSnapshot({lottery:roundTicketsState(2)}));
  const card=h.element('quest-board').innerHTML,catalog=h.element('shop-catalog').innerHTML;
  assert.match(card,/class="currency-icon currency-icon-coins coin-mark"/);assert.match(card,/class="currency-icon currency-icon-diamonds diamond-mark"/);
  assert.match(catalog,/class="currency-icon currency-icon-coins coin-mark"/);assert.doesNotMatch(card,/<span class="coin-mark"><span|<span class="diamond-mark"><span/);
  assert.equal(h.calls.requests.length,0);
});
