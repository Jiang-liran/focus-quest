const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the production state/requests/rendering, with only HTTP and DOM stubbed.
// The event-registration boundary avoids starting app timers in the test process.
const source = fs.readFileSync(require.resolve('../static/app.js'), 'utf8');
const appFunctions = source.split("\ndocument.querySelectorAll('[data-view]')")[0];
assert.ok(appFunctions.includes('async function refresh('));
assert.ok(appFunctions.includes('function stepDate('));
const flush = () => new Promise(resolve => setImmediate(resolve));

function week(start, minutes) {
  const day = new Date(`${start}T12:00:00Z`);
  const days = Array.from({length: 7}, (_, offset) => {
    const date = new Date(day);
    date.setUTCDate(day.getUTCDate() + offset);
    return {date: date.toISOString().slice(0, 10), minutes: offset === 2 ? minutes : 0};
  });
  return {start, end: days[6].date, minutes, target: 3000,
    percent: minutes / 30, activeDays: minutes > 0 ? 1 : 0, days};
}

function state(date, weekly) {
  return {date, today: '2026-09-23', weekly, totals: {target: 480}};
}

function harness(initial, cachedWeek = null) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {textContent: '', innerHTML: '',
      hidden: false, disabled: false, style: {}, dataset: {},
      setAttribute() {}, classList: {remove() {}}});
    return elements.get(id);
  };
  const requests = [];
  const context = vm.createContext({
    document: {getElementById: element}, initial, cachedWeek,
    fetch: path => new Promise(resolve => requests.push({path, resolve})),
  });
  vm.runInContext(appFunctions, context);
  vm.runInContext(`
    state=initial;weekChartState=cachedWeek;
    selectedDate=state.date===state.today?null:state.date;
    checkNewRecords=()=>{};
    render=()=>renderWeek();
  `, context);
  const run = code => vm.runInContext(code, context);
  const respond = (path, data) => {
    const index = requests.findIndex(request => request.path === path);
    assert.notEqual(index, -1, `Expected pending request for ${path}`);
    const [request] = requests.splice(index, 1);
    request.resolve({ok: true, json: async () => data});
  };
  return {run, element, respond, requests};
}

test('polling updates the chart after browsing away and back to the main week', async () => {
  const h = harness(state('2026-09-23', week('2026-09-21', 150)), week('2026-09-21', 150));
  const refresh = h.run('refresh()');
  h.respond('/api/state', state('2026-09-23', week('2026-09-21', 180)));
  await refresh;
  assert.equal(h.element('weekly-total').textContent, '累计 3小时');
  assert.equal(h.element('weekly-minutes').innerHTML, '3<small>小时</small>');
  assert.match(h.element('week-chart').innerHTML, /2026-09-23：3小时/);
  assert.equal(h.run('weekChartState'), null);
  assert.equal(h.requests.length, 0, 'matching main week needs no extra request');
});

test('a current-week chart stays live while the main date remains historical', async () => {
  const h = harness(state('2026-09-16', week('2026-09-14', 90)), week('2026-09-21', 150));
  const refresh = h.run('refresh()');
  h.respond('/api/state?date=2026-09-16', state('2026-09-16', week('2026-09-14', 90)));
  await flush();
  h.respond('/api/state?date=2026-09-21', state('2026-09-21', week('2026-09-21', 180)));
  await refresh;
  assert.equal(h.run('state.date'), '2026-09-16');
  assert.equal(h.run('selectedDate'), '2026-09-16');
  assert.equal(h.element('weekly-minutes').innerHTML, '1<small>小时</small>30<small>分钟</small>');
  assert.equal(h.element('weekly-total').textContent, '累计 3小时');
  assert.match(h.element('week-chart').innerHTML, /2026-09-23：3小时/);
  assert.equal(h.element('week-chart-title').textContent, '本周足迹');
});

test('choosing a date cancels the effect of an older week-navigation response', async () => {
  const h = harness(state('2026-09-23', week('2026-09-21', 150)));
  const oldBrowse = h.run("browseWeek('2026-09-07')");
  h.run("chooseDate('2026-09-15')");
  h.respond('/api/state?date=2026-09-15', state('2026-09-15', week('2026-09-14', 90)));
  await flush();
  h.respond('/api/state?date=2026-09-07', state('2026-09-07', week('2026-09-07', 600)));
  await oldBrowse;
  assert.equal(h.run('state.date'), '2026-09-15');
  assert.equal(h.run('weekChartState'), null);
  assert.equal(h.run('weekChartLoading'), false);
  assert.match(h.element('week-chart-range').textContent, /^2026\.09\.14/);
});

test('a late chart poll cannot overwrite a newer week selected by an arrow', async () => {
  const h = harness(state('2026-09-16', week('2026-09-14', 90)), week('2026-09-21', 150));
  const oldRefresh = h.run('refresh()');
  h.respond('/api/state?date=2026-09-16', state('2026-09-16', week('2026-09-14', 90)));
  await flush();
  const newBrowse = h.run("browseWeek('2026-09-07')");
  h.respond('/api/state?date=2026-09-07', state('2026-09-07', week('2026-09-07', 600)));
  await newBrowse;
  h.respond('/api/state?date=2026-09-21', state('2026-09-21', week('2026-09-21', 180)));
  await oldRefresh;
  assert.equal(h.run('weekChartState.start'), '2026-09-07');
  assert.equal(h.element('weekly-total').textContent, '累计 10小时');
  assert.equal(h.run('state.date'), '2026-09-16');
});

test('a date change also cancels an in-flight independent chart poll', async () => {
  const h = harness(state('2026-09-16', week('2026-09-14', 90)), week('2026-09-21', 150));
  const oldRefresh = h.run('refresh()');
  h.respond('/api/state?date=2026-09-16', state('2026-09-16', week('2026-09-14', 90)));
  await flush();
  h.run("chooseDate('2026-09-08')");
  h.respond('/api/state?date=2026-09-08', state('2026-09-08', week('2026-09-07', 600)));
  await flush();
  h.respond('/api/state?date=2026-09-21', state('2026-09-21', week('2026-09-21', 180)));
  await oldRefresh;
  assert.equal(h.run('state.date'), '2026-09-08');
  assert.equal(h.run('weekChartState'), null);
  assert.equal(h.element('weekly-total').textContent, '累计 10小时');
  assert.equal(h.run('inFlight'), false);
});
