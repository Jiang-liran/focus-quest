const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise app.js's real render/claim/preview/dialog code. Only unrelated page
// rendering and the browser/HTTP boundaries are stubbed, with no startup timers.
const source = fs.readFileSync(require.resolve('../static/app.js'), 'utf8');
const appFunctions = source.split("\ndocument.querySelectorAll('[data-view]')")[0];
assert.ok(appFunctions.includes('async function maybeDailyOpening('));
assert.ok(appFunctions.includes('async function previewOpening('));
const openingCopy = fs.readFileSync(require.resolve('../static/opening.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const earlyCopy=fs.readFileSync(require.resolve('../static/early-start.js'),'utf8');

function harness() {
  let now = Date.parse('2026-09-23T08:15:00');
  const elements = new Map(), pending = [], requests = [], toasts = [];
  const classList = () => ({toggle() {}, remove() {}, add() {}});
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, textContent: '', innerHTML: '', value: '', checked: false,
      hidden: false, disabled: false, open: false, shown: 0, dataset: {},
      style: {setProperty() {}}, classList: classList(), setAttribute() {},
      showModal() { this.open = true; this.shown++; },
      close() { this.open = false; },
    });
    return elements.get(id);
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const document = {
    hidden: false, documentElement: {classList: classList()}, getElementById: element,
    querySelector(selector) {
      assert.equal(selector, 'dialog[open]');
      return [...elements.values()].find(value => value.id.endsWith('-dialog') && value.open) || null;
    },
  };
  const context = vm.createContext({
    Date: Clock, document, toasts,
    fetch: (path, options) => new Promise((resolve, reject) => {
      const request = {path, options, resolve, reject};
      pending.push(request); requests.push(request);
    }),
  });
  vm.runInContext(openingCopy, context);
  vm.runInContext(appFunctions, context);
  const run = code => vm.runInContext(code, context);
  run(`
    state={date:localDay(),today:localDay(),
      totals:{minutes:0,target:480,level:1,levelXp:0,levelTarget:120},
      settings:{motion:true,sound:false},sync:{connected:true,pollSeconds:3},allTime:{records:0}};
    renderCalendarPending=renderHero=renderAdvice=renderWeek=
      renderActivities=renderRecords=renderAchievements=updateViewTitle=()=>{};
    toast=(title,detail,isError)=>toasts.push({title,detail,isError});
  `);
  const respond = (path, data, ok = true) => {
    const index = pending.findIndex(request => request.path === path);
    assert.notEqual(index, -1, `Expected a pending request for ${path}`);
    const [request] = pending.splice(index, 1);
    request.resolve({ok, json: async () => data});
  };
  const opening = (patch = {}) => ({day: run('localDay()'), now: new Date(now).toISOString(),
    minutes: 0, target: 480, seen: true, show: true, ...patch});
  return {run, element, document, requests, pending, respond, opening, toasts,
    advance(milliseconds) { now += milliseconds; }};
}

function earlyReceipt(h){
  h.run(earlyCopy);
  h.run(`state.quests={earlyStart:{day:localDay(),status:'awarded',firstStart:localDay()+'T07:30:00+08:00',tier:8,reward:{coins:90,diamonds:2},lotteryTickets:{coinTickets:1,diamondTickets:1}}}`);
}
test('morning arrival follows the welcome and is acknowledged independently of achievement effects',async()=>{
  const h=harness();earlyReceipt(h);h.run('render()');
  assert.equal(h.element('early-start-notice-dialog').shown,0);
  h.respond('/api/opening/claim',h.opening());await flush();
  assert.equal(h.element('opening-dialog').shown,1);assert.equal(h.element('early-start-notice-dialog').shown,0);
  h.element('opening-dialog').close();h.run('maybeDailyOpening()');
  assert.equal(h.element('early-start-notice-dialog').shown,1);assert.match(h.element('early-start-notice-content').innerHTML,/金币抽奖券/);
  h.element('early-start-notice-dialog').close();h.run('render();noteOpeningArrival();playNextCelebration()');
  assert.equal(h.element('early-start-notice-dialog').shown,1);assert.equal(h.requests.length,1);
});
test('first focus payment is noticed on any page, including when motion is disabled',async()=>{
  const h=harness();h.run('render()');h.respond('/api/opening/claim',h.opening({show:false}));await flush();
  earlyReceipt(h);h.run("state.settings.motion=false;currentView='review';render()");
  assert.equal(h.element('early-start-notice-dialog').shown,1);
});
test('weekly confirmation, hidden apps, games and room scenes defer rather than consume the receipt',()=>{
  const h=harness();earlyReceipt(h);h.run('openingPending=false');
  for(const blocked of ["FocusGoals={required:()=>true}","FocusRuntime={isVisible:()=>false}","currentView='achievements'","FocusCitadel={isOpen:()=>true}","FocusCampfireRoom={isOpen:()=>true}","FocusReturnTrail={isOpen:()=>true}"]){
    h.run("FocusGoals=FocusRuntime=FocusCitadel=FocusCampfireRoom=FocusReturnTrail=undefined;currentView='today';"+blocked+";FocusEarlyStart.observe(state);maybeEarlyStartNotice()");
    assert.equal(h.element('early-start-notice-dialog').shown,0,blocked);assert.ok(h.run('FocusEarlyStart.pendingNotice()'));
  }
  h.run('FocusReturnTrail=undefined;maybeEarlyStartNotice()');assert.equal(h.element('early-start-notice-dialog').shown,1);
});
test('a failed welcome request does not withhold the already paid morning reward during retry backoff',async()=>{
  const h=harness();earlyReceipt(h);h.run('render()');h.pending.shift().reject(Error('offline'));await flush();
  assert.equal(h.element('early-start-notice-dialog').shown,1);assert.equal(h.requests.length,1);
});
test('waking across midnight does not show yesterday’s unread receipt before the new state loads',()=>{
  const h=harness();earlyReceipt(h);h.run('openingPending=false;FocusEarlyStart.observe(state)');
  h.advance(24*60*60*1000);h.run('maybeEarlyStartNotice()');
  assert.equal(h.element('early-start-notice-dialog').shown,0);
  h.run("state.today=localDay();state.quests.earlyStart={day:localDay(),status:'waiting'};render()");
  assert.equal(h.element('early-start-notice-dialog').shown,0);
});

test('first render claims once and repeat renders/focus cannot repeat the daily dialog', async () => {
  const h = harness();
  h.run('render();render();noteOpeningArrival()');
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].path, '/api/opening/claim');
  assert.equal(h.requests[0].options.method, 'POST');
  assert.equal(h.requests[0].options.body, '{}');
  h.respond('/api/opening/claim', h.opening());
  await flush();
  assert.equal(h.element('opening-dialog').shown, 1);
  assert.equal(h.element('opening-dialog').dataset.preview, 'false');
  assert.ok(h.element('opening-title').textContent.length > 0);
  assert.equal(h.run('openingBusy'), false);
  h.element('opening-dialog').close();
  h.run('render();noteOpeningArrival();render()');
  assert.equal(h.requests.length, 1);
  assert.equal(h.element('opening-dialog').shown, 1);
});

test('server acknowledgement that another window already claimed today shows no dialog', async () => {
  const h = harness();
  h.run('render()');
  h.respond('/api/opening/claim', h.opening({show: false}));
  await flush();
  h.run('render();noteOpeningArrival()');
  assert.equal(h.element('opening-dialog').shown, 0);
  assert.equal(h.requests.length, 1);
});

test('hidden windows and an existing settings dialog defer even the first claim', async () => {
  const h = harness();
  h.document.hidden = true;
  h.run('render()');
  assert.equal(h.requests.length, 0);
  h.document.hidden = false;
  h.element('settings-dialog').open = true;
  h.run('noteOpeningArrival();render()');
  assert.equal(h.requests.length, 0);
  h.element('settings-dialog').close();
  h.run('maybeDailyOpening()');
  assert.equal(h.requests.length, 1);
  h.respond('/api/opening/claim', h.opening());
  await flush();
  assert.equal(h.element('opening-dialog').shown, 1);
});

test('a successful in-flight claim waits for visibility and other dialogs without claiming again', async () => {
  const h = harness();
  h.run('render()');
  h.document.hidden = true;
  h.respond('/api/opening/claim', h.opening());
  await flush();
  assert.equal(h.element('opening-dialog').shown, 0);
  assert.equal(h.run('openingReady.day'), h.run('localDay()'));
  h.document.hidden = false;
  h.element('settings-dialog').open = true;
  h.run('noteOpeningArrival()');
  assert.equal(h.element('opening-dialog').shown, 0);
  h.element('settings-dialog').close();
  h.run('maybeDailyOpening()');
  assert.equal(h.element('opening-dialog').shown, 1);
  assert.equal(h.requests.length, 1);
});

test('preview only reads context and preserves unsaved settings and the daily claim state', async () => {
  const h = harness();
  h.element('settings-dialog').open = true;
  h.element('weekly-target-input').value = '42';
  h.element('target-math').value = '4.5';
  h.element('motion-input').checked = false;
  h.element('sound-input').checked = true;
  h.element('mapping-fields').innerHTML = 'unsaved task mappings';
  const before = h.run('JSON.stringify({state,openingPending,openingCheckedDay,seen:[...seenRecords]})');
  const preview = h.run('previewOpening()');
  assert.equal(h.element('opening-preview').disabled, true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].path, '/api/opening');
  assert.equal(h.requests[0].options.method, undefined);
  assert.equal(h.requests[0].options.body, undefined);
  h.respond('/api/opening', h.opening({seen: false, show: undefined, minutes: 90}));
  await preview;
  assert.equal(h.element('opening-dialog').shown, 1);
  assert.equal(h.element('opening-dialog').dataset.preview, 'true');
  assert.match(h.element('opening-note').textContent, /不占用每日首次/);
  assert.equal(h.element('opening-done').textContent, '返回设置');
  assert.equal(h.element('settings-dialog').open, true);
  h.element('opening-dialog').close();
  assert.equal(h.element('weekly-target-input').value, '42');
  assert.equal(h.element('target-math').value, '4.5');
  assert.equal(h.element('motion-input').checked, false);
  assert.equal(h.element('sound-input').checked, true);
  assert.equal(h.element('mapping-fields').innerHTML, 'unsaved task mappings');
  assert.equal(h.run('JSON.stringify({state,openingPending,openingCheckedDay,seen:[...seenRecords]})'), before);
  assert.equal(h.element('opening-preview').disabled, false);
  assert.equal(h.toasts.length, 0);
});

test('closing settings while preview is loading does not reopen a surprise dialog', async () => {
  const h = harness();
  h.element('settings-dialog').open = true;
  const preview = h.run('previewOpening()');
  h.element('settings-dialog').close();
  h.respond('/api/opening', h.opening({seen: false}));
  await preview;
  assert.equal(h.element('opening-dialog').shown, 0);
  assert.equal(h.element('opening-preview').disabled, false);
  assert.equal(h.run('openingCheckedDay'), null);
});

test('failed automatic claim leaves learning usable and retries after the backoff', async () => {
  const h = harness();
  h.run('render()');
  h.respond('/api/opening/claim', {error: '暂时无法读取'}, false);
  await flush();
  assert.equal(h.run('openingBusy'), false);
  assert.equal(h.run('openingPending'), true);
  assert.equal(h.element('opening-dialog').shown, 0);
  assert.equal(h.toasts.length, 0, 'optional automatic copy must not interrupt learning with an error dialog');
  h.advance(29999);
  h.run('render();noteOpeningArrival()');
  assert.equal(h.requests.length, 1);
  h.advance(2);
  h.run('render()');
  assert.equal(h.requests.length, 2);
  h.respond('/api/opening/claim', h.opening());
  await flush();
  assert.equal(h.element('opening-dialog').shown, 1);
  assert.equal(h.run('openingRetryAt'), 0);
});

test('failed preview reenables its button and a later click can succeed without consuming claim', async () => {
  const h = harness();
  h.element('settings-dialog').open = true;
  const failed = h.run('previewOpening()');
  h.respond('/api/opening', {error: '服务暂不可用'}, false);
  await failed;
  assert.equal(h.element('opening-preview').disabled, false);
  assert.equal(h.toasts.length, 1);
  assert.equal(h.toasts[0].isError, true);
  const retry = h.run('previewOpening()');
  h.respond('/api/opening', h.opening());
  await retry;
  assert.equal(h.element('opening-dialog').shown, 1);
  assert.equal(h.run('openingCheckedDay'), null);
  assert.ok(h.requests.every(request => request.path === '/api/opening' && !request.options.method));
});

test('an activation on a new day asks the backend again and uses the new day context', async () => {
  const h = harness();
  h.run('render()');
  h.respond('/api/opening/claim', h.opening());
  await flush();
  h.element('opening-dialog').close();
  const yesterday = h.run('openingCheckedDay');
  h.advance(24 * 60 * 60 * 1000);
  h.run('noteOpeningArrival()');
  assert.equal(h.requests.length, 2);
  h.respond('/api/opening/claim', h.opening());
  await flush();
  assert.notEqual(h.run('openingCheckedDay'), yesterday);
  assert.equal(h.element('opening-dialog').shown, 2);
});
