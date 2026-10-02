const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {harness, snapshot, copy, time} = require('./arcade_harness.cjs');

const source = fs.readFileSync(require.resolve('../static/app.js'), 'utf8');
const day = '2026-09-25';
const venues = [
  ['beginner', '初级', 9, 9, 10],
  ['intermediate', '中级', 16, 16, 40],
  ['expert', '高级', 30, 16, 99],
].map(([id, name, width, height, mines]) => ({
  id: 'mines-' + id, type: 'minesweeper', family: 'logic', name: '经典扫雷 · ' + name,
  subtitle: `${width} × ${height} · ${mines} 雷`, description: '翻开所有安全格。',
  width, height, mines, bestSeconds: null, plays: 0, wins: 0,
}));
const activeGame = () => ({
  id: 'retained-mines-game', type: 'minesweeper', venue: 'mines-beginner', version: 7,
  status: 'active', expiresAt: null, maxSteps: null, startedAt: time(0), result: null,
  state: {width: 9, height: 9, mines: 10, difficulty: 'beginner', phase: 'playing',
    cells: Array.from({length: 9}, (_, y) => Array.from({length: 9}, (_, x) =>
      x === 1 && y === 1 ? {state: 'open', number: 2} : {state: 'covered'})),
    flags: 0, remainingMines: 10, opened: 1, safeCells: 71, questions: true,
    elapsedSeconds: 0, clockStartedAt: time(0)},
});

// Exercise real app navigation with real Arcade/Minesweeper controllers. City
// rendering is a boundary double; its own suite covers the slide and camera.
function appHarness({active = null, required = false} = {}) {
  const h = harness({__mines: true});
  const Element = h.element('arcade-root').constructor;
  const element = (id, attrs = {}) => h.element(id) || new Element('div', {id, ...attrs});
  const pages = ['today', 'quests', 'review', 'shop', 'history', 'achievements'];
  const views = pages.map(id => element('view-' + id));
  const nav = [...pages.filter(id => id !== 'achievements'), 'city']
    .map(id => element('nav-' + id, {'data-view': id}));
  h.document.body = element('app-body'); h.document.body.dataset.page = 'today';
  h.document.documentElement = element('app-html');
  const queryAll = h.document.querySelectorAll.bind(h.document);
  h.document.querySelectorAll = selector => selector === '.view' ? views
    : selector === '[data-view]' ? nav
    : /^\[data-view="([^"]+)"\]$/.test(selector)
      ? nav.filter(n => n.dataset.view === selector.match(/"([^"]+)"/)[1]) : queryAll(selector);
  const getById = h.document.getElementById;
  const absent = new Set(['arcade-pill-icon', 'arcade-pill-title', 'arcade-pill-status', 'arcade-pill-meta', 'arcade-open']);
  ['page-crumb', 'page-title', 'page-subtitle', 'greeting-eyebrow', 'date-button', 'header-today',
    'date-picker', 'city-open', 'city-pill-icon', 'citadel-enter', 'campfire-room-open'].forEach(id => element(id));
  h.document.getElementById = id => absent.has(id) ? null : getById(id);
  const calls = {cityOpens: 0, cityCloses: 0, stops: 0, expeditionLeaves: 0, reviewLeaves: 0, thumbnails: 0};
  let city = false, cityBridge, goalRequired = required;
  h.context.FocusCitadel = {
    init(callbacks) { cityBridge = callbacks; },
    isOpen: () => city,
    open() { if (city) return false; city = true; calls.cityOpens++; cityBridge.onOpen?.(); return true; },
    close() { if (!city) return false; city = false; calls.cityCloses++; cityBridge.afterClose?.(); return true; },
  };
  h.context.FocusGoals = {required: () => goalRequired};
  h.context.FocusQuickSkins = {close() {}};
  h.context.FocusCampfireRoom = {close() {}, isOpen: () => false};
  h.context.FocusExpedition = {stop() { calls.stops++; }, leave() { calls.expeditionLeaves++; }};
  h.context.FocusReviewHeatmap = {onLeave() { calls.reviewLeaves++; }, onEnter() {}};
  h.context.FocusRainCityArt = {thumbnail(eq) { calls.thumbnails++; return `<svg data-theme="${eq.theme}"></svg>`; }};
  h.context.window = {scrollTo() {}};
  h.context.setTimeout = () => 1;
  h.context.fetch = () => { throw new Error('Navigation must not mutate records, tickets or wallet'); };
  vm.runInContext(source.split("\ndocument.querySelectorAll('[data-view]')")[0], h.context);
  vm.runInContext(source.match(/^globalThis\.FocusCitadel\?\.init\(.+$/m)[0], h.context);
  const run = code => vm.runInContext(code, h.context);
  h.context.fixture = {date: day, today: day, quests: {equipped: {theme: 'theme-ocean'}}};
  run('state=fixture; currentView="today";');
  h.bridge.openPage = page => { h.context.destination = page; run('switchView(destination)'); };
  h.bridge.isVisible = () => run('currentView==="achievements"');
  h.api.leave();
  const arcade = snapshot({venues: copy(venues), active, available: 3, used: 1});
  h.api.render(arcade);
  return {...h, element, callsApp: calls, nav, views, arcade, run,
    go(page) { h.context.destination = page; run('switchView(destination)'); },
    cityAction() { cityBridge.openArcade(); },
    closeCity() { h.context.FocusCitadel.close(); },
    isCity: () => city,
    requireGoal(value) { goalRequired = value; },
  };
}

test('sidebar city opens over home from another page and highlights one city destination', () => {
  const h = appHarness(); h.go('review'); h.go('city');
  assert.equal(h.run('currentView'), 'today');
  assert.equal(h.document.body.dataset.page, 'today');
  assert.equal(h.isCity(), true);
  assert.equal(h.callsApp.reviewLeaves, 1);
  assert.deepEqual(h.nav.filter(n => n.getAttribute('aria-current') === 'page').map(n => n.dataset.view), ['city']);
  assert.deepEqual(h.views.filter(n => !n.hidden).map(n => n.id), ['view-today']);
  h.closeCity();
  assert.deepEqual(h.nav.filter(n => n.getAttribute('aria-current') === 'page').map(n => n.dataset.view), ['today']);
  assert.equal(h.calls.requests.length, 0);
});

test('arcade is a city destination, and returning to the city preserves an active minesweeper board and ticket', () => {
  const active = activeGame(), h = appHarness({active});
  h.go('city'); h.cityAction();
  assert.equal(h.isCity(), false); assert.equal(h.run('currentView'), 'achievements');
  assert.equal(h.element('page-title').textContent, '星海游乐场');
  assert.deepEqual(h.nav.filter(n => n.getAttribute('aria-current') === 'page').map(n => n.dataset.view), ['city']);
  const board = h.element('mines-host'), html = board.innerHTML;
  const timersWhilePlaying = h.timers.size;
  h.go('city');
  assert.equal(h.isCity(), true); assert.equal(h.run('currentView'), 'today');
  assert.equal(h.timers.size, 0, 'the hidden game must release its clock');
  assert.ok(timersWhilePlaying > 0);
  assert.equal(h.element('mines-host'), board); assert.equal(board.innerHTML, html);
  assert.equal(h.calls.requests.length, 0, 'returning is neither finish nor restart');
  assert.equal(h.arcade.available, 3); assert.deepEqual(h.arcade.active, active);
  h.cityAction();
  assert.equal(h.element('mines-host'), board);
  assert.ok(h.document.querySelector('[data-mines-cell="1,1"]'));
  assert.equal(h.calls.requests.length, 0);
});

test('legacy game entry still selects the requested difficulty without spending a ticket', () => {
  const h = appHarness(); h.go('city'); h.api.open('mines-expert');
  assert.equal(h.isCity(), false); assert.equal(h.run('currentView'), 'achievements');
  const chosen = h.document.querySelector('[data-arcade-venue="mines-expert"]');
  assert.equal(chosen.getAttribute('aria-pressed'), 'true');
  assert.match(h.element('arcade-content').innerHTML, /经典扫雷 · 高级/);
  assert.equal(h.calls.requests.length, 0);
});

test('the mandatory weekly goal cannot be bypassed by either city entry', () => {
  const h = appHarness(); h.go('review'); h.requireGoal(true);
  assert.equal(h.run('openCity()'), false); h.go('city');
  assert.equal(h.isCity(), false); assert.equal(h.run('currentView'), 'review');
  assert.equal(h.callsApp.cityOpens, 0); assert.equal(h.calls.requests.length, 0);
  h.requireGoal(false); h.run('state=null;');
  assert.equal(h.run('openCity()'), false);
});

test('the city entry is independent of game polling and only redraws when appearance changes', () => {
  const h = appHarness({active: activeGame()});
  h.run('renderCityEntry()');
  const card = h.element('city-pill-icon'), html = card.innerHTML;
  h.api.render({...h.arcade, now: time(200)}); h.run('renderCityEntry()');
  assert.equal(card.innerHTML, html); assert.equal(h.callsApp.thumbnails, 1);
  h.go('achievements'); h.advance(2000);
  assert.equal(card.innerHTML, html);
  h.run('state.quests.equipped.theme="theme-forest";renderCityEntry()');
  assert.match(card.innerHTML, /theme-forest/); assert.equal(h.callsApp.thumbnails, 2);
  assert.equal(h.calls.requests.length, 0);
});
