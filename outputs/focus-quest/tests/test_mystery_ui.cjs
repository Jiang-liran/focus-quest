const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const source = fs.readFileSync(require.resolve('../static/mystery.js'), 'utf8');
const art = require('../static/mystery-art.js');
const currencyArt = require('../static/currency-art.js');
const copy = value => JSON.parse(JSON.stringify(value));
const now = '2026-09-25T20:00:00.000100+08:00';

function mystery(patch = {}) {
  return {
    enabled: true, unlocked: false, status: 'locked', day: '2026-09-25', target: 480, minutes: 300,
    subjects: [
      {id: 'math', name: '数学', target: 180, minutes: 90, eligible: false, pendingMinutes: 0},
      {id: 'cs', name: '408', target: 180, minutes: 120, eligible: true, pendingMinutes: 0},
      {id: 'politics', name: '政治', target: 60, minutes: 40, eligible: true, pendingMinutes: 0},
      {id: 'english', name: '英语', target: 60, minutes: 50, eligible: true, pendingMinutes: 0},
    ],
    pendingMinutes: 0, todayMinutes: 0, todaySettledMinutes: 0,
    reward: {coins: 0, diamonds: 0}, baseReward: {coins: 0, diamonds: 0}, giftReward: {coins: 0, diamonds: 0},
    nextGift: {index: 1, progressMinutes: 0, coins: 20, diamonds: 1}, pendingGifts: [], history: [], ...patch,
  };
}

function ready(patch = {}) {
  return mystery({
    unlocked: true, status: 'ready', minutes: 555, pendingMinutes: 75, todayMinutes: 75,
    subjects: mystery().subjects.map((s, i) => ({...s, eligible: true, minutes: s.target + 1, pendingMinutes: [30, 15, 15, 15][i]})),
    reward: {coins: 360, diamonds: 8}, baseReward: {coins: 300, diamonds: 5}, giftReward: {coins: 60, diamonds: 3},
    nextGift: {index: 3, progressMinutes: 15, coins: 60, diamonds: 3},
    pendingGifts: [{day: '2026-09-25', index: 1, coins: 20, diamonds: 1}, {day: '2026-09-25', index: 2, coins: 40, diamonds: 2}], ...patch,
  });
}

function snapshot(m = mystery(), patch = {}) { return {now, mystery: m, ...patch}; }

function harness(extras = {}) {
  const calls = {requests: [], sounds: [], toasts: [], refresh: [], renders: [], accepted: []}, elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, innerHTML: '', textContent: '', hidden: false, disabled: false, dataset: {}, listeners: new Map(), open: false, shown: 0,
      addEventListener(type, callback) { const listeners = this.listeners.get(type) || []; listeners.push(callback); this.listeners.set(type, listeners); },
      showModal() { this.open = true; this.shown++; },
      close() { this.open = false; for (const callback of this.listeners.get('close') || []) callback({target: this}); },
    });
    return elements.get(id);
  };
  const bridge = {
    api(path, body) { return new Promise((resolve, reject) => calls.requests.push({path, body: copy(body), resolve, reject})); },
    playSound(cue, options) { calls.sounds.push({cue, ...copy(options)}); },
    toast(...args) { calls.toasts.push(args); },
    async refresh(force) { calls.refresh.push(force); },
    renderQuests(data) { calls.renders.push(copy(data)); },
    acceptReceipt(data) { calls.accepted.push(copy(data)); },
  };
  const context = vm.createContext({document: {getElementById: element}, crypto, FocusMysteryArt: art, ...extras});
  vm.runInContext(source, context);
  const api = context.FocusMystery;
  api.init(bridge);
  const fire = (id, {targetId = id, giftIndex} = {}) => {
    const target = {
      id: targetId, dataset: giftIndex === undefined ? {} : {mysteryGift: String(giftIndex)},
      closest(selector) { return selector === `#${this.id}` || (selector === '[data-mystery-gift]' && 'mysteryGift' in this.dataset) ? this : null; },
    };
    return (element(id).listeners.get('click') || []).map(callback => callback({target}));
  };
  const open = () => fire('mystery-quest', {targetId: 'mystery-submit'});
  const confirm = () => fire('mystery-confirm')[0];
  return {api, calls, bridge, element, fire, open, confirm};
}

function delivery(request, patch = {}) {
  return {requestId: request.body.requestId, alreadyClaimed: false, minutes: 76,
    coins: 364, diamonds: 7, gifts: ready().pendingGifts, submittedAt: '2026-09-25T20:00:01+08:00', ...patch};
}

function acknowledge(request, receiptPatch = {}, statePatch = {}, extra = {}) {
  const receipt = delivery(request, receiptPatch);
  request.resolve(snapshot(mystery({unlocked: true, status: 'active', minutes: 556, todayMinutes: 76,
    todaySettledMinutes: 76, history: [receipt], ...statePatch}), {now: '2026-09-25T20:00:01+08:00', receipt, ...extra}));
  return receipt;
}

test('shared currency art preserves actual mystery rewards, historic receipts and plain-text toast delivery',async()=>{
  const h=harness({FocusCurrencyArt:currencyArt});h.api.render(snapshot(ready()));
  const html=h.element('mystery-quest').innerHTML;assert.match(html,/data-currency="coins"/);assert.match(html,/data-currency="diamonds"/);assert.match(html,/300 金币/);assert.match(html,/5 钻石/);
  h.open();const promise=h.confirm();acknowledge(h.calls.requests[0],{coins:480,diamonds:10});await promise;
  const receipt=h.element('mystery-dialog-body').innerHTML;assert.match(receipt,/data-currency="coins"/);assert.match(receipt,/480 金币/);assert.match(receipt,/10 钻石/);
  assert.equal(h.calls.toasts[0][1],'+480 金币 · 10 钻石');assert.equal(h.calls.requests.length,1);
});

test('missing mystery data hides the NPC and a low total goal explains the eight-hour requirement', () => {
  const h = harness();
  h.api.render({now});
  assert.equal(h.element('mystery-quest').hidden, true);
  h.api.render(snapshot(mystery({enabled: false, status: 'disabled', target: 479})));
  const html = h.element('mystery-quest').innerHTML;
  assert.equal(h.element('mystery-quest').hidden, false);
  assert.equal(h.element('mystery-quest').dataset.status, 'disabled');
  assert.match(html, /每日总目标不少于 <strong>8 小时<\/strong>/);
  assert.match(html,/篝火营地找目标 NPC 调整/);
  assert.doesNotMatch(html,/远征设置中调整/);
  assert.match(html, /目标未开启/);
  assert.match(html, /id="mystery-submit" disabled/);
  h.open();
  assert.equal(h.element('mystery-dialog').open, false);
  assert.equal(h.calls.requests.length, 0);
});

test('locked NPC lists the total and each strict subject threshold without treating exactly half as eligible', () => {
  const h = harness();
  h.api.render(snapshot());
  const html = h.element('mystery-quest').innerHTML;
  assert.match(html, /等待星灯亮起/);
  assert.match(html, /<li class=""><span><i aria-hidden="true">◇<\/i>数学<\/span>/);
  assert.match(html, /90 分钟 <small>\/ 超过 90 分钟/);
  assert.match(html, /<li class="met"><span><i aria-hidden="true">✦<\/i>408<\/span>/);
  assert.match(html, /所有条件同时达成之后的新增专注/);
  assert.match(html, /id="mystery-submit" disabled/);
  assert.doesNotMatch(html, /mystery-disabled/);
  assert.equal(h.calls.requests.length, 0);
});

test('unlocked NPC shows the server daily totals and waits when there is no unclaimed reward', () => {
  const h = harness();
  h.api.render(snapshot(mystery({unlocked: true, status: 'active', minutes: 550, todayMinutes: 70, todaySettledMinutes: 70,
    nextGift: {index: 3, progressMinutes: 10, coins: 60, diamonds: 3}})));
  const html = h.element('mystery-quest').innerHTML;
  assert.match(html, /mystery-portrait awake/);
  assert.match(html, /拾星已到访/);
  assert.match(html, /今日余辉 <strong>70 分钟/);
  assert.match(html, /今日已交付 <strong>70 分钟/);
  assert.match(html, /普通委托中未交付的先前进度仍保留/);
  assert.match(html, /今日第 3 份星礼/);
  assert.match(html, /额外 60 金币 · 3 钻石/);
  assert.match(html, /aria-valuenow="10"/);
  assert.match(html, /id="mystery-submit" disabled/);
  assert.doesNotMatch(html, /<ul class="mystery-conditions">/);
  h.open();
  assert.equal(h.element('mystery-dialog').open, false);
});

test('ready NPC previews base earnings and gift rewards separately without making a request', () => {
  const h = harness();
  h.api.render(snapshot(ready()));
  const html = h.element('mystery-quest').innerHTML;
  assert.match(html, /有余辉待交付/);
  assert.match(html, /本次基础收益<\/span><strong>300 金币 · 5 钻石/);
  assert.match(html, /2 份礼盒额外加赠<\/span><strong>60 金币 · 3 钻石/);
  assert.match(html, /交付余辉 · 360 金币 · 8 钻石/);
  assert.match(html, /数学 <b>30 分钟/);
  assert.match(html, /aria-valuenow="15"/);
  assert.match(h.element('quest-invitation-text').textContent, /75 分钟.*余辉收获/);
  assert.doesNotMatch(html, /id="mystery-submit" disabled/);
  h.open();
  assert.equal(h.element('mystery-dialog').open, true);
  assert.match(h.element('mystery-dialog-body').innerHTML, /金币、钻石在交付时结算；抽奖券在打开星礼时收好，同盒两种券一次领完，不会重复领取/);
  assert.equal(h.calls.requests.length, 0);
  assert.deepEqual(h.calls.sounds, []);
});

test('previous-day pending rewards remain claimable while today is below the unlock requirement', () => {
  const h = harness();
  h.api.render(snapshot(ready({enabled: false, unlocked: false, target: 420, minutes: 0, todayMinutes: 0, todaySettledMinutes: 0,
    nextGift: {index: 1, progressMinutes: 0, coins: 20, diamonds: 1},
    pendingGifts: [{day: '2026-09-24', index: 2, coins: 40, diamonds: 2}]})));
  const html = h.element('mystery-quest').innerHTML;
  assert.match(html, /有余辉待交付/);
  assert.match(html, /含过往未领取/);
  assert.match(html, /每日总目标不少于 <strong>8 小时/);
  assert.doesNotMatch(html, /id="mystery-submit" disabled/);
  h.open();
  assert.equal(h.element('mystery-dialog').open, true);
  assert.match(h.element('mystery-dialog-body').innerHTML, /交付 <strong>75 分钟/);
  assert.equal(h.calls.requests.length, 0);
});

test('subject names, receipt dates and gift dates are escaped in every HTML view', async () => {
  const h = harness(), attack = '<img src=x onerror="evil()">';
  h.api.render(snapshot(ready({unlocked: false, subjects: [{id: 'math', name: attack, target: 180, minutes: 90, eligible: false, pendingMinutes: 75}],
    history: [{submittedAt: attack, minutes: 10, coins: 40, diamonds: 0, gifts: []}]})));
  const html = h.element('mystery-quest').innerHTML;
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&quot;evil\(\)&quot;/);
  h.open();
  const pending = h.confirm();
  acknowledge(h.calls.requests[0], {gifts: [{day: attack, index: 1, coins: 20, diamonds: 1}]});
  await pending;
  const receipt = h.element('mystery-dialog-body').innerHTML;
  assert.doesNotMatch(receipt, /<img/);
  assert.match(receipt, /&lt;img src=x onerror=&quot;evil\(\)&quot;&gt;/);
});

test('explicit confirmation sends one UUID-only request and concurrent clicks stay single-flight', async () => {
  const h = harness();
  h.api.render(snapshot(ready()));
  h.open();
  assert.equal(h.calls.requests.length, 0);
  const pending = h.confirm();
  h.confirm();h.open();
  assert.equal(h.calls.requests.length, 1);
  assert.equal(h.element('mystery-confirm').disabled, true);
  assert.equal(h.element('mystery-dialog').shown, 1);
  const request = h.calls.requests[0];
  assert.equal(request.path, '/api/quests/mystery/submit');
  assert.deepEqual(Object.keys(request.body), ['requestId']);
  assert.match(request.body.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  acknowledge(request);
  await pending;
  assert.equal(h.element('mystery-confirm').disabled, false);
  assert.equal(h.calls.renders.length, 1);
  assert.deepEqual(h.calls.refresh, [true]);
});

test('uncertain failures keep the same UUID on retry even after a settled snapshot arrives', async () => {
  const h = harness();
  h.api.render(snapshot(ready()));h.open();
  const first = h.confirm(), original = h.calls.requests[0];
  original.reject(new Error('连接中断，交付状态待确认'));
  await first;
  assert.equal(h.element('mystery-dialog').open, true);
  assert.equal(h.element('mystery-dialog-error').hidden, false);
  assert.match(h.element('mystery-dialog-error').textContent, /交付状态待确认/);
  assert.equal(h.element('mystery-confirm').textContent, '重试确认交付');
  assert.deepEqual(h.calls.sounds, []);
  assert.deepEqual(h.calls.toasts, []);
  h.api.render(snapshot(mystery({unlocked: true, status: 'active'}), {now: '2026-09-25T20:00:00.000200+08:00'}));
  const retry = h.confirm();
  assert.equal(h.calls.requests.length, 2);
  assert.equal(h.calls.requests[1].body.requestId, original.body.requestId);
  acknowledge(h.calls.requests[1], {alreadyClaimed: true});
  await retry;
  assert.equal(h.element('mystery-dialog-error').hidden, true);
  assert.equal(h.element('mystery-dialog-title').textContent, '这份余辉已收好');
  assert.deepEqual(h.calls.sounds, []);
});

test('a response without a receipt is retried with the original UUID instead of implying successful delivery', async () => {
  const h = harness();
  h.api.render(snapshot(ready()));h.open();
  const first = h.confirm(), original = h.calls.requests[0];
  original.resolve(snapshot(mystery({unlocked: true, status: 'active'})));
  await first;
  assert.match(h.element('mystery-dialog-error').textContent, /回执暂未返回/);
  assert.deepEqual(h.calls.sounds, []);
  assert.deepEqual(h.calls.toasts, []);
  const retry = h.confirm();
  assert.equal(h.calls.requests[1].body.requestId, original.body.requestId);
  acknowledge(h.calls.requests[1], {alreadyClaimed: true});
  await retry;
  assert.deepEqual(h.calls.sounds, []);
});

test('success displays actual receipt amounts and opening gifts never claims or plays the reward again', async () => {
  const h = harness();
  h.api.render(snapshot(ready()));h.open();
  const pending = h.confirm(), request = h.calls.requests[0];
  acknowledge(request, {minutes: 90, coins: 480, diamonds: 10,
    gifts: [{day: '2026-09-25', index: 4, coins: 80, diamonds: 4}, {day: '2026-09-24', index: 5, coins: 100, diamonds: 5}]});
  await pending;
  const body = h.element('mystery-dialog-body');
  assert.match(body.innerHTML, /\+480 金币 · 10 钻石/);
  assert.match(body.innerHTML, /90 分钟 已交付/);
  assert.doesNotMatch(body.innerHTML, /\+360 金币/);
  assert.match(body.innerHTML, /轻触打开星礼/);
  assert.equal(h.calls.toasts[0][1], '+480 金币 · 10 钻石');
  assert.deepEqual(h.calls.sounds, [{cue: 'victory', key: `mystery:${request.body.requestId}`}]);
  assert.match(body.innerHTML, /data-mystery-gift="0" aria-expanded="false"/);
  h.fire('mystery-dialog-body', {giftIndex: 0});
  assert.match(body.innerHTML, /data-mystery-gift="0" aria-expanded="true"/);
  assert.match(body.innerHTML, /data-tier="4" data-opened="true"/);
  assert.match(body.innerHTML, /80 金币 · 4 钻石/);
  assert.match(body.innerHTML, /data-mystery-gift="1" aria-expanded="false"/);
  const once = body.innerHTML;
  for (const giftIndex of [0, -1, 2, 'bad', .5]) h.fire('mystery-dialog-body', {giftIndex});
  assert.equal(body.innerHTML, once);
  h.fire('mystery-dialog-body', {giftIndex: 1});
  assert.match(body.innerHTML, /100 金币 · 5 钻石/);
  assert.match(body.innerHTML, /第 5 盒/);
  assert.equal(h.calls.requests.length, 1);
  assert.equal(h.calls.sounds.length, 1);
  assert.equal(h.calls.toasts.length, 1);
  assert.deepEqual(h.calls.refresh, [true]);
});

test('a successful delivery survives refresh failure and the receipt dismissal does not submit again', async () => {
  const h = harness();
  h.bridge.refresh = async force => { h.calls.refresh.push(force); throw new Error('refresh offline'); };
  h.api.render(snapshot(ready()));h.open();
  const pending = h.confirm(), request = h.calls.requests[0];
  acknowledge(request, {gifts: [], minutes: 5, coins: 20, diamonds: 0});
  await pending;
  assert.equal(h.element('mystery-dialog-error').hidden, true);
  assert.equal(h.element('mystery-confirm').textContent, '收下这份回响');
  assert.match(h.element('mystery-dialog-body').innerHTML, /\+20 金币 · 0 钻石/);
  assert.deepEqual(h.calls.sounds, [{cue: 'delivery', key: `mystery:${request.body.requestId}`}]);
  assert.equal(h.calls.toasts.length, 1);
  await h.confirm();
  assert.equal(h.element('mystery-dialog').open, false);
  assert.equal(h.calls.requests.length, 1);
  assert.deepEqual(h.calls.refresh, [true]);
});

test('the next delivery gets a fresh UUID and clears opened gifts from the previous receipt', async () => {
  const h = harness();
  h.api.render(snapshot(ready()));h.open();
  const first = h.confirm(), original = h.calls.requests[0];
  acknowledge(original);await first;
  h.fire('mystery-dialog-body', {giftIndex: 0});
  await h.confirm();
  h.api.render(snapshot(ready(), {now: '2026-09-25T20:30:00+08:00'}));h.open();
  const next = h.confirm(), nextRequest = h.calls.requests[1];
  assert.notEqual(nextRequest.body.requestId, original.body.requestId);
  acknowledge(nextRequest);await next;
  assert.match(h.element('mystery-dialog-body').innerHTML, /data-mystery-gift="0" aria-expanded="false"/);
});

test('an already-claimed receipt and repeated snapshots remain silent', async () => {
  const h = harness();
  h.api.render(snapshot(ready()));h.open();
  const pending = h.confirm(), request = h.calls.requests[0];
  const receipt = acknowledge(request, {alreadyClaimed: true});await pending;
  h.api.render(snapshot(mystery(), {now: '2026-09-25T20:00:02+08:00', receipt}));
  h.api.render(snapshot(mystery(), {now: '2026-09-25T20:00:03+08:00', receipt}));
  assert.deepEqual(h.calls.sounds, []);
  assert.match(h.element('mystery-dialog-body').innerHTML, /\+364 金币 · 7 钻石/);
  assert.equal(h.element('mystery-dialog-title').textContent, '这份余辉已收好');
});

test('older snapshots are ignored including updates within the same millisecond', () => {
  const h = harness();
  h.api.render(snapshot(ready(), {now: '2026-09-25T20:00:00.000200+08:00'}));
  const original = h.element('mystery-quest').innerHTML;
  h.api.render(snapshot(mystery(), {now: '2026-09-25T20:00:00.000100+08:00'}));
  h.api.render({now: '2026-09-25T19:59:59.999999+08:00'});
  assert.equal(h.element('mystery-quest').innerHTML, original);
  assert.equal(h.element('mystery-quest').hidden, false);
  assert.equal(h.element('mystery-quest').dataset.status, 'ready');
  h.api.render(snapshot(mystery(), {now: '2026-09-25T20:00:00.000300+08:00'}));
  assert.equal(h.element('mystery-quest').dataset.status, 'locked');
  assert.notEqual(h.element('mystery-quest').innerHTML, original);
});

test('UUID unavailability does not fall back to an unsafe mutation identifier', () => {
  const h = harness({crypto: {}});
  h.api.render(snapshot(ready()));h.open();
  assert.equal(h.element('mystery-dialog').open, false);
  assert.equal(h.calls.requests.length, 0);
  assert.equal(h.calls.toasts[0][0], '暂时无法交付');
  assert.equal(h.calls.toasts[0][2], true);
});


test('upgraded diamond carry can be claimed without resubmitting settled study minutes', async () => {
  const h = harness();
  h.api.render(snapshot(ready({pendingMinutes: 0, subjects: mystery().subjects,
    reward: {coins: 0, diamonds: 6}, baseReward: {coins: 0, diamonds: 6},
    giftReward: {coins: 0, diamonds: 0}, pendingGifts: []})));
  const html = h.element('mystery-quest').innerHTML;
  assert.match(html, /钻石进度待领取/);
  assert.match(html, /交付余辉 · 0 金币 · 6 钻石/);
  assert.match(html, /统一为每科累计 15 分钟得 1 钻石/);
  assert.doesNotMatch(html, /id="mystery-submit" disabled/);
  assert.match(h.element('quest-invitation-text').textContent, /先前积累的进度换算为钻石/);
  h.open();
  assert.match(h.element('mystery-dialog-body').innerHTML, /领取此前积累的钻石进度/);
  const pending = h.confirm();
  acknowledge(h.calls.requests[0], {minutes: 0, coins: 0, diamonds: 6, gifts: []});
  await pending;
  assert.match(h.element('mystery-dialog-body').innerHTML, /此前积累的钻石已兑换/);
  assert.match(h.element('mystery-quest').innerHTML, /id="mystery-submit" disabled/);
  assert.equal(h.calls.requests.length, 1);
  assert.equal(h.calls.sounds.length, 1);
});

const settle = () => new Promise(resolve => setImmediate(resolve));
function ticketState(gifts = ready().pendingGifts, claimed = [], patch = {}) {
  return {now: '2026-09-25T20:00:01+08:00', revision: 10, tickets: {coin: claimed.length, diamond: 0},
    starGifts: gifts.filter(g => g.index <= 4).map(g => ({day: g.day, index: g.index,
      machine: g.index <= 2 ? 'coin' : 'diamond', claimed: claimed.includes(g.index)})), ...patch};
}
async function deliveredWithTickets(h, gifts = ready().pendingGifts) {
  h.api.render(snapshot(ready()));h.open();
  const pending = h.confirm(), request = h.calls.requests.at(-1);
  acknowledge(request, {gifts}, {}, {lottery: ticketState(gifts)});
  await pending;
}
function acknowledgeStar(request, patch = {}) {
  const {day, index} = request.body, machine = index <= 2 ? 'coin' : 'diamond';
  request.resolve({now: '2026-09-25T20:00:02+08:00', alreadyProcessed: false,
    result: {type: 'starGift', day, index, machine}, lottery: ticketState(undefined, [index], {revision: 11}),
    quests: {now: '2026-09-25T20:00:02+08:00', wallet: {coins: 364, diamonds: 7}},
    ticketGrants: [{machine, count: 1, source: 'mystery-gift', label: `第 ${index} 份星礼`}], ...patch});
}

test('opening an eligible star gift sends exact identity and accepts its ticket once without re-crediting currencies', async () => {
  const h = harness();await deliveredWithTickets(h);
  const before = h.calls.sounds.length;
  assert.match(h.element('mystery-dialog-body').innerHTML, /内含 1 张金币抽奖券/);
  h.fire('mystery-dialog-body', {giftIndex: 0});
  h.fire('mystery-dialog-body', {giftIndex: 0});
  h.fire('mystery-dialog-body', {giftIndex: 1});
  assert.equal(h.calls.requests.length, 2);
  const request = h.calls.requests[1];
  assert.equal(request.path, '/api/lottery/star-gift');
  assert.deepEqual(Object.keys(request.body), ['day', 'index', 'requestId']);
  assert.equal(request.body.day, '2026-09-25');assert.equal(request.body.index, 1);
  assert.match(request.body.requestId, /^[0-9a-f-]{36}$/);
  assert.match(h.element('mystery-dialog-body').innerHTML, /正在开启/);
  acknowledgeStar(request);await settle();
  assert.equal(h.calls.accepted.length, 1);
  assert.equal(h.calls.accepted[0].lottery.tickets.coin, 1);
  assert.match(h.element('mystery-dialog-body').innerHTML, /data-mystery-gift="0" aria-expanded="true"/);
  assert.match(h.element('mystery-dialog-body').innerHTML, /已收好 1 张金币抽奖券/);
  assert.equal(h.calls.sounds.length, before+1);
  h.fire('mystery-dialog-body', {giftIndex: 0});
  assert.equal(h.calls.requests.length, 2);
});

test('uncertain star opening retries with the same UUID and acknowledged retries stay silent', async () => {
  const h = harness();await deliveredWithTickets(h);
  const sounds = h.calls.sounds.length, toasts = h.calls.toasts.length;
  h.fire('mystery-dialog-body', {giftIndex: 0});
  const request = h.calls.requests[1];request.reject(new Error('暂时断开，领取状态待确认'));await settle();
  assert.equal(h.element('mystery-dialog-error').hidden, false);
  assert.match(h.element('mystery-dialog-error').textContent, /领取状态待确认/);
  assert.match(h.element('mystery-dialog-body').innerHTML, /data-mystery-gift="0" aria-expanded="false"/);
  assert.equal(h.calls.sounds.length, sounds);
  h.fire('mystery-dialog-body', {giftIndex: 0});
  const retry = h.calls.requests[2];assert.equal(retry.body.requestId, request.body.requestId);
  acknowledgeStar(retry, {alreadyProcessed: true, ticketGrants: []});await settle();
  assert.equal(h.element('mystery-dialog-error').hidden, true);
  assert.equal(h.calls.accepted.length, 1);
  assert.equal(h.calls.sounds.length, sounds);assert.equal(h.calls.toasts.length, toasts);
  assert.match(h.element('mystery-dialog-body').innerHTML, /aria-expanded="true"/);
});

test('a delayed star receipt after dismissal updates the shared wallet but never reopens the dialog', async () => {
  const h = harness();await deliveredWithTickets(h);
  const shown = h.element('mystery-dialog').shown;
  h.fire('mystery-dialog-body', {giftIndex: 0});const request = h.calls.requests[1];
  h.element('mystery-dialog').close();
  acknowledgeStar(request);await settle();
  assert.equal(h.element('mystery-dialog').open, false);assert.equal(h.element('mystery-dialog').shown, shown);
  assert.equal(h.calls.accepted.length, 1);assert.equal(h.calls.accepted[0].quests.wallet.coins, 364);
});

test('a new delivery dialog waits for a dismissed pending star request so its gift buttons cannot become stuck', async () => {
  const h = harness();await deliveredWithTickets(h);
  h.fire('mystery-dialog-body', {giftIndex: 0});const request = h.calls.requests[1];
  h.element('mystery-dialog').close();
  h.api.render(snapshot(ready(), {now: '2026-09-25T20:30:00+08:00'}));h.open();
  assert.equal(h.element('mystery-dialog').open, false, 'a pending gift cannot contaminate a new receipt');
  acknowledgeStar(request);await settle();
  h.open();assert.equal(h.element('mystery-dialog').open, true);
  const pending = h.confirm(), deliveryRequest = h.calls.requests[2];
  const gifts = [{day: '2026-09-25', index: 3, coins: 60, diamonds: 3}];
  acknowledge(deliveryRequest, {gifts}, {}, {now: '2026-09-25T20:31:00+08:00', lottery: ticketState(gifts, [], {revision: 12, now:'2026-09-25T20:31:00+08:00'})});
  await pending;
  assert.doesNotMatch(h.element('mystery-dialog-body').innerHTML, /aria-expanded="false" disabled/);
  h.fire('mystery-dialog-body', {giftIndex: 0});
  assert.equal(h.calls.requests[3].body.index, 3);
  acknowledgeStar(h.calls.requests[3], {lottery: ticketState(gifts, [3], {revision: 13, now:'2026-09-25T20:32:00+08:00'})});await settle();
});

test('an incomplete star receipt keeps its UUID and does not claim success without the claimed gift marker', async () => {
  const h = harness();await deliveredWithTickets(h);
  h.fire('mystery-dialog-body', {giftIndex: 0});const request = h.calls.requests[1];
  acknowledgeStar(request, {lottery: ticketState()});await settle();
  assert.equal(h.calls.accepted.length, 0);
  assert.equal(h.element('mystery-dialog-error').hidden, false);
  h.fire('mystery-dialog-body', {giftIndex: 0});const retry = h.calls.requests[2];
  assert.equal(retry.body.requestId, request.body.requestId);
  acknowledgeStar(retry);await settle();
  assert.equal(h.calls.accepted.length, 1);
});

function modernGift(index,patch={}){
  const [coinTickets,diamondTickets]=[[1,0],[1,1],[2,1],[2,2],[2,2],[2,2]][index-1];
  return {day:'2026-09-25',index,coins:20*index,diamonds:index,lotteryTickets:{coinTickets,diamondTickets},...patch};
}
function modernTicketState(gifts,claimed=[],patch={}){
  const totals={coin:0,diamond:0};
  for(const g of gifts)if(claimed.includes(g.index)){totals.coin+=g.lotteryTickets.coinTickets;totals.diamond+=g.lotteryTickets.diamondTickets;}
  return {now:'2026-09-25T20:00:01+08:00',revision:10,tickets:totals,
    starGifts:gifts.map(g=>({day:g.day,index:g.index,machine:g.index<=2?'coin':'diamond',claimed:claimed.includes(g.index),lotteryTickets:g.lotteryTickets})),...patch};
}
async function deliveredModern(h,gifts){
  h.api.render(snapshot(ready({pendingGifts:gifts,giftLimit:6,todayGiftCount:gifts.length,
    todayGiftLimitReached:gifts.length===6,nextGift:gifts.length===6?null:modernGift(gifts.length+1,{progressMinutes:0})})));h.open();
  const pending=h.confirm();acknowledge(h.calls.requests[0],{gifts},{},{lottery:modernTicketState(gifts)});await pending;
}
function modernStarResponse(request,gifts,patch={}){
  const row=gifts.find(g=>g.day===request.body.day&&g.index===request.body.index),machine=row.index<=2?'coin':'diamond';
  return {now:'2026-09-25T20:00:02+08:00',alreadyProcessed:false,
    result:{type:'starGift',day:row.day,index:row.index,machine,lotteryTickets:row.lotteryTickets},
    lottery:modernTicketState(gifts,[row.index],{revision:11}),quests:{now:'2026-09-25T20:00:02+08:00',wallet:{coins:364,diamonds:7}},
    ticketGrants:[['coin','coinTickets'],['diamond','diamondTickets']].filter(([,key])=>row.lotteryTickets[key]>0).map(([machine,key])=>({machine,count:row.lotteryTickets[key],source:'mystery-gift'})),...patch};
}

test('the sixth gift quota removes any next-gift hint but keeps pending boxes and base income deliverable', async()=>{
  const h=harness(),gifts=Array.from({length:6},(_,i)=>modernGift(i+1));
  h.api.render(snapshot(ready({giftLimit:6,todayGiftCount:6,todayGiftLimitReached:true,nextGift:null,
    todayMinutes:240,pendingMinutes:240,pendingGifts:gifts,baseReward:{coins:960,diamonds:16},giftReward:{coins:420,diamonds:21},reward:{coins:1380,diamonds:37}})));
  const html=h.element('mystery-quest').innerHTML;
  assert.match(html,/今日六份星礼已备齐/);assert.match(html,/6 \/ 6 份/);assert.match(html,/余辉基础收益继续累计/);
  assert.match(html,/尚未领取的仍会为你保留/);assert.doesNotMatch(html,/今日第 [17] 份星礼|下一份余辉礼盒|今日六份.*已领取|总.*11 小时/);
  assert.match(html,/6 份礼盒额外加赠/);assert.match(html,/交付余辉 · 1,380 金币 · 37 钻石/);
  assert.doesNotMatch(html,/id="mystery-submit" disabled/);
  h.open();assert.match(h.element('mystery-dialog-body').innerHTML,/礼盒内含：10 张金币抽奖券 · 8 张钻石抽奖券/);
  const pending=h.confirm(),request=h.calls.requests[0];
  acknowledge(request,{minutes:240,coins:1380,diamonds:37,gifts},
    {giftLimit:6,todayGiftCount:6,todayGiftLimitReached:true,nextGift:null},{lottery:modernTicketState(gifts)});await pending;
  assert.match(h.element('mystery-quest').innerHTML,/今日六份星礼已备齐/);
  assert.equal((h.element('mystery-dialog-body').innerHTML.match(/data-mystery-gift=/g)||[]).length,6);
});

test('gift quota and progress follow server fields rather than deriving completion from total minutes',()=>{
  const h=harness();h.api.render(snapshot(ready({todayMinutes:9999,giftLimit:6,todayGiftCount:5,todayGiftLimitReached:false,
    nextGift:modernGift(6,{progressMinutes:45})})));
  let html=h.element('mystery-quest').innerHTML;
  assert.match(html,/今日第 6 份星礼/);assert.match(html,/额外 120 金币 · 6 钻石/);
  assert.match(html,/打开再领 2 张金币抽奖券 · 2 张钻石抽奖券/);
  assert.match(html,/aria-valuenow="30"/);assert.match(html,/width:100%/);assert.doesNotMatch(html,/width:150%|45 分钟 \/ 30|六份星礼已备齐/);
  h.api.render(snapshot(ready({giftLimit:6,todayGiftCount:6,todayGiftLimitReached:true,nextGift:modernGift(6,{index:7,progressMinutes:20})}),{now:'2026-09-25T20:00:02+08:00'}));
  html=h.element('mystery-quest').innerHTML;assert.match(html,/今日六份星礼已备齐/);assert.doesNotMatch(html,/今日第 7 份|下一份余辉礼盒/);
});

test('null next-gift state and old over-quota count never invent a new first or seventh gift',()=>{
  const h=harness();h.api.render(snapshot(ready({giftLimit:6,todayGiftCount:8,todayGiftLimitReached:true,nextGift:null})));
  assert.match(h.element('mystery-quest').innerHTML,/6 \/ 6 份/);
  assert.doesNotMatch(h.element('mystery-quest').innerHTML,/今日第 1 份|今日第 7 份|今日第 8 份/);
  h.api.render(snapshot(ready({giftLimit:6,nextGift:null}),{now:'2026-09-25T20:00:02+08:00'}));
  assert.doesNotMatch(h.element('mystery-quest').innerHTML,/今日第 1 份|下一份余辉礼盒/);
});

for(const index of [2,6])test(`opening mixed mystery gift ${index} displays and receives both ticket kinds in one call`,async()=>{
  const h=harness(),gifts=[modernGift(index)];await deliveredModern(h,gifts);
  const expected=index===2?'1 张金币抽奖券 · 1 张钻石抽奖券':'2 张金币抽奖券 · 2 张钻石抽奖券';
  assert.ok(h.element('mystery-dialog-body').innerHTML.includes('内含 '+expected));
  const before=h.calls.sounds.length;h.fire('mystery-dialog-body',{giftIndex:0});h.fire('mystery-dialog-body',{giftIndex:0});
  assert.equal(h.calls.requests.length,2);const request=h.calls.requests[1];assert.equal(request.body.index,index);
  request.resolve(modernStarResponse(request,gifts));await settle();
  assert.equal(h.calls.accepted.length,1);assert.ok(h.element('mystery-dialog-body').innerHTML.includes('已收好 '+expected));
  assert.equal(h.calls.accepted[0].lottery.tickets.coin,gifts[0].lotteryTickets.coinTickets);
  assert.equal(h.calls.accepted[0].lottery.tickets.diamond,gifts[0].lotteryTickets.diamondTickets);
  assert.ok(h.calls.toasts.at(-1)[1].includes(expected));assert.equal(h.calls.sounds.length,before+1);
  h.fire('mystery-dialog-body',{giftIndex:0});assert.equal(h.calls.requests.length,2);
});

test('mixed mystery opening retains its UUID until both kinds and the claimed-box proof are complete',async()=>{
  const h=harness(),gifts=[modernGift(6)];await deliveredModern(h,gifts);const before=h.calls.sounds.length;
  h.fire('mystery-dialog-body',{giftIndex:0});const request=h.calls.requests[1];
  request.resolve(modernStarResponse(request,gifts,{ticketGrants:[{machine:'coin',count:2}]}));await settle();
  assert.equal(h.calls.accepted.length,0);assert.equal(h.calls.sounds.length,before);assert.equal(h.element('mystery-dialog-error').hidden,false);
  assert.match(h.element('mystery-dialog-body').innerHTML,/aria-expanded="false"/);
  h.fire('mystery-dialog-body',{giftIndex:0});const retry=h.calls.requests[2];assert.equal(retry.body.requestId,request.body.requestId);
  retry.resolve(modernStarResponse(retry,gifts,{alreadyProcessed:true,ticketGrants:[]}));await settle();
  assert.equal(h.calls.accepted.length,1);assert.equal(h.calls.sounds.length,before);assert.match(h.element('mystery-dialog-body').innerHTML,/aria-expanded="true"/);
});

for(const modern of [false,true])test(`legacy opened mystery gift replay ${modern?'reports actual old amounts':'preserves a result without modern fields'} without receiving new mixed tickets`,async()=>{
  const h=harness(),gifts=[modernGift(2)];await deliveredModern(h,gifts);const before=h.calls.sounds.length,toastCount=h.calls.toasts.length;
  h.fire('mystery-dialog-body',{giftIndex:0});const request=h.calls.requests[1],vector={coinTickets:1,diamondTickets:0};
  const oldResult={type:'starGift',day:gifts[0].day,index:2,machine:'coin',...(modern?{lotteryTickets:vector}:{})};
  const oldState=modernTicketState(gifts,[2]);oldState.starGifts[0].lotteryTickets=vector;oldState.tickets={coin:1,diamond:0};
  request.resolve(modernStarResponse(request,gifts,{result:oldResult,lottery:oldState,alreadyProcessed:true,ticketGrants:[]}));await settle();
  assert.equal(h.calls.accepted.length,1);assert.equal(h.calls.sounds.length,before);assert.equal(h.calls.toasts.length,toastCount);
  assert.match(h.element('mystery-dialog-body').innerHTML,/已收好 1 张金币抽奖券/);
  assert.doesNotMatch(h.element('mystery-dialog-body').innerHTML,/已收好 1 张金币抽奖券 · 1 张钻石/);
});

test('old seventh and eighth receipt gifts preserve their currency history without new ticket promises or mutations',async()=>{
  const h=harness();h.api.render(snapshot(ready()));h.open();const pending=h.confirm();
  acknowledge(h.calls.requests[0],{gifts:[{day:'2026-09-24',index:7,coins:140,diamonds:7},{day:'2026-09-24',index:8,coins:160,diamonds:8}]});await pending;
  h.fire('mystery-dialog-body',{giftIndex:0});h.fire('mystery-dialog-body',{giftIndex:1});
  assert.match(h.element('mystery-dialog-body').innerHTML,/140 金币 · 7 钻石/);assert.match(h.element('mystery-dialog-body').innerHTML,/160 金币 · 8 钻石/);
  assert.doesNotMatch(h.element('mystery-dialog-body').innerHTML,/已收好.*抽奖券|内含.*抽奖券/);assert.equal(h.calls.requests.length,1);
});

test('a modern gift missing shared lottery identity waits for synchronization rather than pretending tickets were opened',async()=>{
  const h=harness(),gifts=[modernGift(6)];h.api.render(snapshot(ready()));h.open();const pending=h.confirm();
  acknowledge(h.calls.requests[0],{gifts});await pending;h.fire('mystery-dialog-body',{giftIndex:0});await settle();
  assert.equal(h.calls.requests.length,1);assert.match(h.element('mystery-dialog-body').innerHTML,/aria-expanded="false"/);
  assert.match(h.element('mystery-dialog-error').textContent,/星礼状态尚未同步/);assert.equal(h.element('mystery-dialog-error').hidden,false);
});

test('a malformed modern gift vector cannot fall back to a one-ticket opening',async()=>{
  const h=harness(),gifts=[modernGift(6,{lotteryTickets:{coinTickets:'<img>',diamondTickets:2}})];
  await deliveredModern(h,gifts);h.fire('mystery-dialog-body',{giftIndex:0});await settle();
  assert.equal(h.calls.requests.length,1);assert.doesNotMatch(h.element('mystery-dialog-body').innerHTML,/<img|内含 1 张/);
  assert.equal(h.element('mystery-dialog-error').hidden,false);
});

test('root lottery receipt merge rejects an older response within the same millisecond', () => {
  const app = fs.readFileSync(require.resolve('../static/app.js'), 'utf8');
  const start = app.indexOf('function acceptLotteryReceipt(result){');
  const end = app.indexOf('\nglobalThis.FocusMystery?.init', start);
  assert.ok(start >= 0 && end > start);
  const original = {quests: {now: '2026-09-25T20:00:00.000200+08:00', wallet: {coins: 900, diamonds: 9}},
    lottery: {revision: 11, tickets: {coin: 3, diamond: 1}}};
  const context = vm.createContext({state: copy(original), requestSequence: 7, inFlight: true,
    FocusQuests: {render() {}}, FocusQuickSkins: {render() {}}, FocusCitadel: {applyEquipment() {}}});
  vm.runInContext(app.slice(start, end), context);
  context.acceptLotteryReceipt({now: '2026-09-25T20:00:00.000100+08:00',
    quests: {now: '2026-09-25T20:00:00.000100+08:00', wallet: {coins: 800, diamonds: 8}},
    lottery: {revision: 10, tickets: {coin: 2, diamond: 1}}});
  assert.deepEqual(copy(context.state), original);
  assert.equal(context.requestSequence, 7);assert.equal(context.inFlight, true);
});

test('a newer root lottery receipt immediately merges wallet and collection and invalidates older polls', () => {
  const app = fs.readFileSync(require.resolve('../static/app.js'), 'utf8');
  const start = app.indexOf('function acceptLotteryReceipt(result){');
  const end = app.indexOf('\nglobalThis.FocusMystery?.init', start);
  const calls = [];
  const context = vm.createContext({state: {date: '2026-09-24', today: '2026-09-25', records: ['unchanged'],
      quests: {now: '2026-09-25T20:00:00.000100+08:00', wallet: {coins: 900, diamonds: 9}}},
    requestSequence: 7, inFlight: true,
    FocusQuests: {render(snapshot) {calls.push(['quests', copy(snapshot)]);}},
    FocusQuickSkins: {render(snapshot) {calls.push(['skins', copy(snapshot)]);}},
    FocusCitadel: {applyEquipment(equipped, now) {calls.push(['equipment', copy(equipped), now]);}}});
  vm.runInContext(app.slice(start, end), context);
  const lottery = {revision: 11, tickets: {coin: 3, diamond: 1}}, quests = {
    now: '2026-09-25T20:00:00.000200+08:00', wallet: {coins: 920, diamonds: 9},
    equipped: {bar: 'bar-mint'}, catalog: [{id: 'bar-skyexpress', owned: true}], lottery};
  context.acceptLotteryReceipt({quests, lottery, now: quests.now});
  assert.deepEqual(copy(context.state.quests), quests);assert.deepEqual(copy(context.state.lottery), lottery);
  assert.equal(context.state.date, '2026-09-24');assert.deepEqual(copy(context.state.records), ['unchanged']);
  assert.equal(context.requestSequence, 8);assert.equal(context.inFlight, false);
  assert.deepEqual(calls.map(call => call[0]), ['quests', 'skins', 'equipment']);
});
