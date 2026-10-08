const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sources = ['record-time.js', 'subject-island-styles.js', 'island-architecture.js', 'expedition-model.js', 'expedition.js']
  .map(name => fs.readFileSync(require.resolve(`../static/${name}`), 'utf8'));
const day = '2026-09-24';
const copy = value => JSON.parse(JSON.stringify(value));
function record(id, minutes, subject = 'math', patch = {}) {
  return {id: String(id), name: `复习${subject}`, subject, minutes, day,
    start: `${day}T08:00:00+08:00`, end: `${day}T09:${String(Number(id) || 0).padStart(2, '0')}:00+08:00`, ...patch};
}
function snapshot(records = [record(1, 60), record(2, 30, 'cs')], patch = {}) {
  const subjects = [['math', '数学', 180], ['cs', '408', 180], ['politics', '政治', 60], ['english', '英语', 60]]
    .map(([id, name, target]) => ({id, name, target, minutes: records.filter(r => r.subject === id).reduce((sum, r) => sum + r.minutes, 0)}));
  return {date: day, today: day, settings: {motion: true}, subjects, records: records.slice().reverse(),
    dayRecordCount: records.length, totals: {minutes: records.reduce((sum, r) => sum + r.minutes, 0), target: 480}, ...patch};
}

// The real controller and presentation model run together. Only browser/clock
// boundaries and SVG drawing are stubbed; timers can also be fired after cancel
// to expose callbacks that incorrectly overwrite a newer scene.
function harness({reducedMotion = false, home = true, appIntegration = false, arcade = false, city = false} = {}) {
  const elements = new Map(), timers = new Map(), allTimers = new Map(), docListeners = new Map();
  const calls = {hero: [], world: [], resonance: [], stopPreview: 0, quickClose: 0, requests: [], storageWrites: 0, arcadeOpen: [], arcadeEnter: 0, arcadeLeave: 0, cityOpen: []};
  const responses = [], saved = new Map();
  let serial = 0, api, cityBridge = null, cityOpen = false;
  const document = {activeElement: null, hidden: false};
  const mediaListeners = [];
  const media = {matches: reducedMotion, addEventListener(type, fn) { assert.equal(type, 'change'); mediaListeners.push(fn); }};
  const datasetName = name => name.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const decode = text => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  class Element {
    constructor(tag = 'div', id = '') {
      this.tagName = tag.toUpperCase(); this.id = id; this.children = []; this.parent = null;
      this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this.hidden = false;
      this.disabled = false; this.open = false; this._html = ''; this._text = ''; this.htmlWrites = 0;
      this.style = {setProperty() {}}; const classes = new Set();
      this.classList = {add: name => classes.add(name), remove: name => classes.delete(name),
        contains: name => classes.has(name), toggle(name, force) { const next = force ?? !classes.has(name); if (next) classes.add(name); else classes.delete(name); return next; }};
    }
    get isConnected() { return this.id ? elements.get(this.id) === this : Boolean(this.parent?.isConnected); }
    get innerHTML() { return this._html; }
    set innerHTML(value) {
      if (this.children.some(child => child.contains(document.activeElement))) document.activeElement = null;
      this.children.forEach(child => { child.parent = null; }); this.children = [];
      this._html = String(value); this.htmlWrites++;
      for (const match of this._html.matchAll(/<(button|g)\b([^>]*)>/g)) {
        if (!/data-expedition-(?:subject|discovery|frame)/.test(match[2])) continue;
        const node = new Element(match[1]); node.parent = this;
        for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) node.setAttribute(attr[1], decode(attr[2]));
        node.disabled = /\sdisabled(?:\s|$)/.test(match[2]); this.children.push(node);
      }
    }
    get textContent() { return this._text; }
    set textContent(value) { this._text = String(value); }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name.startsWith('data-')) this.dataset[datasetName(name)] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    hasAttribute(name) { return this.getAttribute(name) !== null; }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    matches(selector) {
      if (selector === 'dialog[open]') return this.tagName === 'DIALOG' && this.open;
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      const match = selector.match(/^\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
      return Boolean(match && this.getAttribute(match[1]) !== null && (match[2] === undefined || this.getAttribute(match[1]) === match[2]));
    }
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(type, fn) { const listeners = this.listeners.get(type) || []; listeners.push(fn); this.listeners.set(type, listeners); }
    focus() { document.activeElement = this; }
    click() { if (!this.disabled) dispatch(this, 'click'); }
  }
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element(id.includes('dialog') ? 'dialog' : 'div', id));
    return elements.get(id);
  };
  document.getElementById = element;
  document.documentElement = element('html');
  document.body = element('body');
  document.querySelectorAll = selector => [...elements.values()].flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]);
  document.querySelector = selector => selector === '.total-progress' ? element('total-progress') : document.querySelectorAll(selector)[0] || null;
  document.addEventListener = (type, fn) => { const listeners = docListeners.get(type) || []; listeners.push(fn); docListeners.set(type, listeners); };
  function dispatch(node, type, patch = {}) {
    const event = {target: node, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...patch};
    for (let current = node; current; current = current.parent) for (const fn of current.listeners.get(type) || []) fn(event);
    return event;
  }
  const context = vm.createContext({document, window: {scrollTo() {}}, matchMedia: () => media,
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, {fn, delay}); allTimers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    localStorage: {getItem(key) { if (!appIntegration) throw new Error('Expedition must not read reward/preference storage'); return saved.get(key) || null; },
      setItem(key, value) { if (!appIntegration) throw new Error('Expedition must not write storage'); saved.set(key, value); calls.storageWrites++; }},
    async fetch(path, options) { if (!appIntegration) throw new Error('Expedition must not request or mutate server data');
      calls.requests.push({path, options}); assert.equal(options.method, undefined); assert.ok(responses.length); return {ok: true, json: async () => responses.shift()}; },
    FocusCitadel: city ? {
      init(bridge) { cityBridge = bridge; }, render() {}, isOpen() { return cityOpen; },
      open(anchor) { calls.cityOpen.push(anchor?.id || anchor?.dataset?.expeditionDiscovery); cityOpen = true;
        cityBridge?.leaveExpedition?.(); cityBridge?.onOpen?.(); return true; },
      close() { cityOpen = false; },
    } : undefined,
    FocusArcade: arcade ? {
      render() {},
      open(venue) { calls.arcadeOpen.push(venue); if (appIntegration) vm.runInContext("switchView('achievements')", context); },
      enter() { calls.arcadeEnter++; },
      leave() { calls.arcadeLeave++; },
    } : undefined,
    FocusQuickSkins: {close() { calls.quickClose++; }},
    FocusExpeditionArt: {world(model) { calls.world.push(copy(model)); return model.subjects.map(s => `<g data-expedition-subject="${s.id}" role="button" tabindex="0"></g>`).join(''); },
      resonance(model) { calls.resonance.push(copy(model)); return model.resonance.active ? '<svg data-four-subject-resonance="true"></svg>' : ''; }},
  });
  sources.forEach(source => vm.runInContext(source, context)); api = context.FocusExpedition;
  const run = code => vm.runInContext(code, context);
  if (appIntegration) {
    vm.runInContext(fs.readFileSync(require.resolve('../static/effects.js'), 'utf8'), context);
    const appSource = fs.readFileSync(require.resolve('../static/app.js'), 'utf8');
    const app = appSource.split("\ndocument.querySelectorAll('[data-view]')")[0];
    vm.runInContext(app, context);
    if (city) {
      const init = appSource.split('\n').find(line => line.startsWith('globalThis.FocusCitadel?.init('));
      assert.ok(init, 'the real app must connect city navigation and replay cleanup');
      vm.runInContext(init, context);
    }
    element('journey-path').getTotalLength = () => 100;
    element('journey-path').getPointAtLength = amount => ({x: 171 + amount, y: 220});
    run(`renderCalendarPending=renderAdvice=renderWeek=renderActivities=renderRecords=renderAchievements=updateViewTitle=maybeDailyOpening=()=>{};
      FocusExpedition.init({renderHero,stopPreview:stopScenePreview,isHome:()=>currentView==='today'});`);
  } else api.init({renderHero() { calls.hero.push(copy(api.visualModel())); }, stopPreview() { calls.stopPreview++; }, isHome: () => home});
  for (const id of ['expedition-subjects', 'expedition-world', 'expedition-discoveries', 'expedition-trail']) element(id).parent = element('quest-hero');
  element('expedition-discoveries').hidden = true;
  return {api, calls, element, document, media, timers, dispatch, run,
    async refresh(data) {
      const complete = {...data, sync: {connected: true, pollSeconds: 3}, allTime: {records: data.dayRecordCount}, weekly: {start: '2026-09-21'},
        settings: {...data.settings, sound: false}, totals: {...data.totals, percent: data.totals.minutes / data.totals.target * 100,
          level: 1, levelXp: data.totals.minutes, levelTarget: 120}};
      responses.push(complete); await run('refresh(false,true)');
      assert.equal(element('error-banner').hidden, true, 'real refresh must not swallow a rendering failure as a connection error');
    },
    button(container, name, value) { const node = element(container).querySelector(`[data-expedition-${name}="${value}"]`); assert.ok(node, `${container} ${name}=${value}`); return node; },
    docEvent(type, patch = {}) { const event = {defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...patch}; for (const fn of docListeners.get(type) || []) fn(event); return event; },
    tick(id = [...timers.keys()][0]) { assert.ok(timers.has(id), 'timer is pending'); const {fn} = timers.get(id); timers.delete(id); fn(); },
    stale(id) { assert.ok(allTimers.has(id)); allTimers.get(id)(); },
    setReduced(value) { media.matches = value; mediaListeners.forEach(fn => fn({matches: value})); },
    mode: () => element('quest-hero').dataset.expeditionMode,
    visual: () => copy(api.visualModel()),
  };
}

test('live rendering is read-only, keeps exact over-goal facts and avoids redrawing unchanged islands', () => {
  const h = harness(), state = snapshot([record(1, 240)]), before = JSON.stringify(state);
  h.api.render(state);
  assert.equal(h.mode(), 'live'); assert.equal(h.visual(), null);
  assert.match(h.element('expedition-subjects').innerHTML, /133\.3%/);
  const focus = h.button('expedition-world', 'subject', 'math'); focus.focus();
  const draws = h.calls.world.length, htmlWrites = h.element('expedition-subjects').htmlWrites;
  h.api.render({...state, revision: 2});
  assert.equal(h.calls.world.length, draws); assert.equal(h.element('expedition-subjects').htmlWrites, htmlWrites);
  assert.equal(h.document.activeElement, focus); assert.equal(JSON.stringify(state), before);
  assert.equal(h.element('expedition-replay-controls').hidden, true);
});

test('fractional minutes just below a subject goal remain unfinished with honest time and remaining progress', () => {
  const h = harness(); h.api.render(snapshot([record(1, 179.99)]));
  const math = h.button('expedition-subjects', 'subject', 'math'); math.click();
  assert.equal(h.calls.world.at(-1).subjects.find(subject => subject.id === 'math').complete, false);
  assert.equal(math.getAttribute('class'), '');
  assert.equal(h.element('expedition-detail-kicker').textContent, '数学 · 建设中的岛屿');
  assert.match(h.element('expedition-subjects').innerHTML, /99\.9%/);
  assert.match(h.element('expedition-next').textContent, /2小时59分59秒 \/ 3小时 · 99\.9%/);
  assert.match(h.element('expedition-next').textContent, /建成还需 (?:不足)?1秒/);
  assert.doesNotMatch(h.element('expedition-next').textContent, /2小时60|100%|建成还需 0|安心欣赏/);
  assert.equal(h.element('expedition-world-count').textContent, '四科共鸣 0 / 4');
});

test('subject and discovery selection survives live polls without losing the keyboard focus target', () => {
  const h = harness(); h.api.render(snapshot());
  const math = h.button('expedition-subjects', 'subject', 'math'); math.focus(); math.click();
  assert.equal(h.element('expedition-detail-title').textContent, '观测台');
  assert.equal(h.document.activeElement?.dataset.expeditionSubject, 'math');
  h.api.render(snapshot([record(1, 70), record(2, 30, 'cs')]));
  assert.equal(h.document.activeElement?.dataset.expeditionSubject, 'math');
  assert.match(h.element('expedition-next').textContent, /1小时10分钟/);
  const island = h.button('expedition-world', 'subject', 'cs'); island.focus();
  h.api.render(snapshot([record(1, 80), record(2, 30, 'cs')]));
  assert.equal(h.document.activeElement?.dataset.expeditionSubject, 'cs');
  h.element('expedition-discover-toggle').click();
  const unlocked = h.button('expedition-discoveries', 'discovery', 'glow-shore'); unlocked.focus(); unlocked.click();
  assert.equal(h.element('expedition-detail-title').textContent, '萤石浅滩');
  assert.equal(h.document.activeElement?.dataset.expeditionDiscovery, 'glow-shore');
  const locked = h.button('expedition-discoveries', 'discovery', 'home-beacon'); assert.equal(locked.disabled, true); locked.click();
  assert.equal(h.element('expedition-detail-title').textContent, '萤石浅滩');
});

test('replay uses real chronological records, stays on its frozen frame during polling, and exits to the newest facts', () => {
  const h = harness(), original = snapshot(), before = JSON.stringify(original);
  h.api.render(original); h.element('expedition-replay').click();
  assert.equal(h.mode(), 'replay'); assert.equal(h.visual().minutes, 0);
  assert.equal(h.calls.stopPreview, 1); assert.equal(h.calls.quickClose, 1); assert.equal(h.timers.size, 1);
  h.tick(); assert.equal(h.visual().minutes, 60); assert.match(h.element('expedition-frame-copy').textContent, /复习math/);
  h.api.render(snapshot([record(1, 60), record(2, 30, 'cs'), record(3, 15, 'english')], {totals: {minutes: 105, target: 600}}));
  assert.equal(h.visual().minutes, 60); assert.equal(h.visual().target, 480);
  assert.match(h.element('expedition-log-summary').textContent, /2 段/);
  h.element('expedition-live').click();
  assert.equal(h.mode(), 'live'); assert.equal(h.visual(), null); assert.equal(h.timers.size, 0);
  assert.equal(h.calls.world.at(-1).minutes, 105); assert.equal(h.calls.world.at(-1).target, 600);
  assert.match(h.element('expedition-log-summary').textContent, /3 段/); assert.equal(JSON.stringify(original), before);
});

test('pause, stop, date changes and leaving reject cancelled timer callbacks', () => {
  const h = harness(); h.api.render(snapshot()); h.api.startReplay();
  let timer = [...h.timers.keys()][0]; h.api.pause(); const draws = h.calls.hero.length;
  h.stale(timer); assert.equal(h.calls.hero.length, draws); assert.equal(h.visual().minutes, 0);
  h.element('expedition-play').click(); timer = [...h.timers.keys()][0]; h.api.stop();
  h.stale(timer); assert.equal(h.mode(), 'live'); assert.equal(h.visual(), null);
  h.api.startReplay(); timer = [...h.timers.keys()][0];
  h.api.render(snapshot([], {date: '2026-09-23'})); h.stale(timer);
  assert.equal(h.mode(), 'live'); assert.equal(h.timers.size, 0); assert.match(h.element('expedition-detail-kicker').textContent, /路标/);
  h.api.render(snapshot()); h.api.startReplay(); h.element('expedition-immerse').click(); timer = [...h.timers.keys()][0];
  h.api.leave(); h.stale(timer);
  assert.equal(h.mode(), 'live'); assert.equal(h.element('quest-hero').classList.contains('expedition-immersive'), false);
});

test('scrubbing and manual steps pause playback, clamp positions, and replay from the end starts over', () => {
  const h = harness(); h.api.render(snapshot()); h.api.startReplay();
  h.element('expedition-scrub').value = 999; h.dispatch(h.element('expedition-scrub'), 'input');
  assert.equal(h.visual().minutes, 90); assert.equal(h.timers.size, 0); assert.equal(h.element('expedition-step').disabled, true);
  h.element('expedition-play').click(); assert.equal(h.visual().minutes, 0); assert.equal(h.timers.size, 1);
  h.element('expedition-step').click(); assert.equal(h.visual().minutes, 60); assert.equal(h.timers.size, 0);
  h.element('expedition-scrub').value = -20; h.dispatch(h.element('expedition-scrub'), 'input');
  assert.equal(h.visual().minutes, 0);
  h.button('expedition-trail', 'frame', '2').click();
  assert.equal(h.visual().minutes, 90); assert.equal(h.timers.size, 0);
});

test('an explicit growth preview cancels replay and a new replay clears the legacy preview through the bridge', () => {
  const h = harness(); h.api.render(snapshot()); h.api.startReplay(); const timer = [...h.timers.keys()][0];
  h.api.preview(75); assert.equal(h.mode(), 'preview'); assert.equal(h.visual().minutes, 360); assert.equal(h.timers.size, 0);
  h.stale(timer); assert.equal(h.mode(), 'preview'); assert.equal(h.visual().percent, 75);
  h.api.render(snapshot([record(1, 60)], {totals: {minutes: 60, target: 600}}));
  assert.equal(h.visual().minutes, 450); assert.equal(h.visual().percent, 75);
  const stopped = h.calls.stopPreview; h.api.startReplay();
  assert.equal(h.calls.stopPreview, stopped + 1); assert.equal(h.mode(), 'replay'); assert.equal(h.visual().minutes, 0);
  h.api.preview(null); assert.equal(h.mode(), 'live'); assert.equal(h.visual(), null);
});

test('a trail click during replay uses the frozen frames even after a poll changes the records', () => {
  const h = harness(); h.api.render(snapshot()); h.api.startReplay(); h.api.pause();
  const before = h.calls.stopPreview;
  h.api.render(snapshot([record(0, 15, 'english'), record(1, 60), record(2, 30, 'cs'), record(3, 20, 'politics')]));
  h.button('expedition-trail', 'frame', '1').click();
  assert.equal(h.visual().minutes, 60, 'frame 1 remains the original math completion rather than the newly inserted English record');
  assert.equal(h.visual().subjects.find(s => s.id === 'math').minutes, 60);
  assert.equal(h.visual().subjects.find(s => s.id === 'english').minutes, 0);
  assert.equal(h.calls.stopPreview, before, 'seeking within a replay does not restart it');
  assert.equal(h.timers.size, 0); assert.match(h.element('expedition-frame-number').textContent, /2 \/ 3/);
  h.element('expedition-live').click(); assert.match(h.element('expedition-log-summary').textContent, /4 段/);
});

test('reduced motion and motion settings allow manual frames but stop auto-play immediately', () => {
  const h = harness({reducedMotion: true}); h.api.render(snapshot()); h.api.startReplay();
  assert.equal(h.timers.size, 0); assert.equal(h.element('expedition-play').disabled, true);
  assert.match(h.element('expedition-frame-copy').textContent, /逐幕/);
  h.element('expedition-step').click(); assert.equal(h.visual().minutes, 60);
  h.setReduced(false); h.element('expedition-play').click(); assert.equal(h.timers.size, 1);
  const timer = [...h.timers.keys()][0]; h.setReduced(true); h.stale(timer);
  assert.equal(h.visual().minutes, 60); assert.equal(h.timers.size, 0);
  h.setReduced(false); h.api.render(snapshot()); h.element('expedition-play').click();
  assert.equal(h.timers.size, 1); h.api.render(snapshot(undefined, {settings: {motion: false}}));
  assert.equal(h.timers.size, 0); assert.equal(h.element('expedition-play').disabled, true);
});

test('hidden documents pause and Escape respects open dialogs and already handled quick-skin events', () => {
  const h = harness(); h.api.render(snapshot()); h.api.startReplay();
  h.document.hidden = true; h.docEvent('visibilitychange'); assert.equal(h.timers.size, 0);
  h.docEvent('keydown', {key: 'Escape', defaultPrevented: true}); assert.equal(h.mode(), 'replay');
  h.element('test-dialog').open = true; h.docEvent('keydown', {key: 'Escape'}); assert.equal(h.mode(), 'replay');
  h.element('test-dialog').open = false; h.element('expedition-immerse').click();
  const event = h.docEvent('keydown', {key: 'Escape'}); assert.equal(event.defaultPrevented, true);
  assert.equal(h.mode(), 'replay'); assert.equal(h.element('quest-hero').classList.contains('expedition-immersive'), false);
  h.docEvent('keydown', {key: 'Escape'}); assert.equal(h.mode(), 'live');
});

test('partial historical records explain their baseline, group to at most 24 frames and end at authoritative totals', () => {
  const historical = '2026-09-22';
  const records = Array.from({length: 100}, (_, i) => record(i + 1, 1, 'math', {day: historical,
    end: new Date(Date.parse(`${historical}T01:00:00Z`) + i * 60000).toISOString()}));
  const state = snapshot(records, {date: historical, dayRecordCount: 110, totals: {minutes: 150, target: 480},
    subjects: [{id: 'math', target: 180, minutes: 150}]});
  const h = harness({reducedMotion: true}); h.api.render(state); h.api.startReplay();
  assert.equal(h.visual().minutes, 50); assert.match(h.element('expedition-frame-copy').textContent, /较早记录已计入起点/);
  assert.match(h.element('expedition-log-summary').textContent, /110 段/);
  assert.ok(Number(h.element('expedition-scrub').max) < 24);
  h.element('expedition-scrub').value = 100; h.dispatch(h.element('expedition-scrub'), 'input');
  assert.equal(h.visual().minutes, 150); assert.equal(h.visual().subjects[0].minutes, 150);
  assert.equal(h.visual().date, historical); assert.equal(h.visual().isHistorical, true);
});

test('empty or inconsistent snapshots cannot start replay and dynamic task names are rendered as text', () => {
  const h = harness(); h.api.render(snapshot([])); h.api.startReplay();
  assert.equal(h.mode(), 'live'); assert.equal(h.element('expedition-replay').disabled, true);
  h.api.render(snapshot([record(1, 60)], {totals: {minutes: 5, target: 480}})); h.api.startReplay();
  assert.equal(h.mode(), 'live'); assert.match(h.element('expedition-log-summary').textContent, /核对/);
  const unsafe = '<img src=x onerror="steal()"> & </button><script>steal()</script>';
  h.api.render(snapshot([record(1, 60, 'math', {name: unsafe})])); h.api.startReplay(1, false);
  assert.ok(h.element('expedition-frame-copy').textContent.includes(unsafe));
  assert.equal(h.element('expedition-frame-copy').htmlWrites, 0);
  assert.doesNotMatch(h.element('expedition-trail').innerHTML, /<img|<script/);
});

test('arrival cues use only new records from the selected current day and never intrude on replay or history', () => {
  const h = harness(), current = snapshot(); h.api.render(current);
  h.api.noteArrival([record(3, 10), record(4, 20, 'cs', {day: '2026-09-23'})], current);
  assert.match(h.element('expedition-arrival').textContent, /1 段.*10分钟/);
  assert.equal(h.element('expedition-arrival').hidden, false);
  assert.equal(h.element('expedition-canvas').classList.contains('receiving-focus'), true);
  const timer = [...h.timers.keys()][0]; h.api.startReplay(); assert.equal(h.element('expedition-arrival').hidden, true);
  h.api.noteArrival([record(3, 10)], current); assert.equal(h.element('expedition-arrival').hidden, true);
  h.stale(timer); assert.equal(h.mode(), 'replay');
  h.api.render(snapshot([], {date: '2026-09-23'}));
  h.api.noteArrival([record(3, 10)], {...current, date: '2026-09-23'}); assert.equal(h.element('expedition-arrival').hidden, true);
  const reduced = harness({reducedMotion: true}); reduced.api.render(current); reduced.api.noteArrival([record(3, 10)], current);
  assert.equal(reduced.element('expedition-arrival').hidden, false); assert.equal(reduced.element('expedition-canvas').classList.contains('receiving-focus'), false);
  const away = harness({home: false}); away.api.render(current); away.api.noteArrival([record(3, 10)], current);
  assert.equal(away.element('expedition-arrival').textContent, '');
});

test('real app refresh, hero and scene honor replay without changing rewards, and legacy preview and date navigation release it', async () => {
  const h = harness({appIntegration: true}); await h.refresh(snapshot());
  assert.equal(h.element('total-percent').textContent, '18.8%');
  assert.equal(h.element('scene-energy').textContent, '18.8%');
  const baselineWrites = h.calls.storageWrites;
  const liveFacts = h.run('JSON.stringify({state,seen:[...seenRecords],claims:[...effectClaims()]})');
  h.api.startReplay(1, false);
  assert.equal(h.element('total-time').innerHTML, '1<small>小时</small>');
  assert.equal(h.element('total-percent').textContent, '12.5%');
  assert.equal(h.element('scene-energy').textContent, '12.5%');
  assert.equal(h.run('JSON.stringify({state,seen:[...seenRecords],claims:[...effectClaims()]})'), liveFacts);
  assert.equal(h.calls.requests.length, 1); assert.equal(h.calls.storageWrites, baselineWrites);
  await h.refresh(snapshot([record(1, 60), record(2, 30, 'cs'), record(3, 30, 'english')]));
  assert.equal(h.run('state.totals.minutes'), 120);
  assert.equal(h.element('total-percent').textContent, '12.5%'); assert.equal(h.element('scene-energy').textContent, '12.5%');
  assert.equal(h.element('scene-subjects').innerHTML.includes('stroke-dashoffset="50"'), false, 'live English progress cannot leak into the replay sigils');
  h.api.stop(); assert.equal(h.element('total-percent').textContent, '25%'); assert.equal(h.element('scene-energy').textContent, '25%');
  assert.ok(h.element('scene-subjects').innerHTML.includes('stroke-dashoffset="50"'));
  h.run('previewScene(75)'); assert.equal(h.mode(), 'preview'); assert.equal(h.element('total-percent').textContent, '75%');
  h.api.startReplay(); assert.equal(h.run('scenePreviewPercent'), null); assert.equal(h.element('effects-preview').hidden, true);
  assert.equal(h.element('total-percent').textContent, '0%');
  const timer = [...h.timers.keys()][0]; h.run('previewScene(40)'); h.stale(timer);
  assert.equal(h.mode(), 'preview'); assert.equal(h.element('total-percent').textContent, '40%');
  h.run('stopScenePreview()'); assert.equal(h.element('total-percent').textContent, '25%');
  h.api.startReplay(); h.run("switchView('history')"); assert.equal(h.mode(), 'live');
  assert.equal([...h.timers.values()].filter(timer => timer.delay > 0).length, 0, 'no replay or arrival timer survives navigation');
  assert.equal(h.document.body.dataset.page, 'history');
  assert.equal(h.calls.requests.length, 2); assert.equal(h.calls.storageWrites, baselineWrites);
});


test('the discovery entry opens the rain city without starting gameplay or writing study', () => {
  const h = harness({arcade: true, city: true}), state = snapshot(), before = JSON.stringify(state);
  h.api.render(state);
  h.element('expedition-discover-toggle').click();
  assert.deepEqual(h.calls.cityOpen, ['expedition-discover-toggle']);
  assert.deepEqual(h.calls.arcadeOpen, [], 'visiting the city must not enter any game');
  assert.equal(h.element('expedition-discoveries').hidden, true, 'city entry does not open the retired book');
  assert.equal(h.calls.requests.length, 0);
  assert.equal(h.calls.storageWrites, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(JSON.stringify(state), before);
});

test('legacy discovered regions all route to the city while four subject islands remain inspectable', () => {
  const h = harness({arcade: true, city: true});
  h.api.render(snapshot([record(1, 480)]));
  const ids = ['mist-camp', 'glow-shore', 'chime-bridge', 'mirror-gallery', 'cloud-library', 'orbit-terrace', 'home-beacon'];
  for (const id of ids) h.button('expedition-discoveries', 'discovery', id).click();
  assert.deepEqual(h.calls.cityOpen, ids);
  assert.deepEqual(h.calls.arcadeOpen, []);
  h.button('expedition-world', 'subject', 'cs').click();
  assert.equal(h.element('expedition-detail-title').textContent, '逻辑工坊');
  assert.deepEqual(h.calls.cityOpen, ids, 'an island click still inspects that subject without entering the city');
  assert.deepEqual(h.calls.arcadeOpen, []);
  assert.equal(h.calls.storageWrites, 0);
  assert.equal(h.calls.requests.length, 0);
});

test('opening the city through the real app bridge cancels replay without issuing game or study writes', async () => {
  const h = harness({appIntegration: true, arcade: true, city: true});
  await h.refresh(snapshot());
  const requests = h.calls.requests.length, writes = h.calls.storageWrites;
  const liveFacts = h.run('JSON.stringify({state,seen:[...seenRecords],claims:[...effectClaims()]})');
  h.api.startReplay(1, true);
  const timer = [...h.timers.keys()][0];
  assert.equal(h.mode(), 'replay');
  h.element('expedition-discover-toggle').click();
  assert.deepEqual(h.calls.cityOpen, ['expedition-discover-toggle']);
  assert.deepEqual(h.calls.arcadeOpen, []);
  assert.equal(h.run('currentView'), 'today', 'the city overlays the homepage rather than the game lobby');
  assert.equal(h.calls.arcadeEnter, 0);
  assert.equal(h.mode(), 'live');
  assert.equal(h.timers.size, 0);
  h.stale(timer);
  assert.equal(h.mode(), 'live');
  assert.equal(h.calls.requests.length, requests);
  assert.equal(h.calls.storageWrites, writes);
  assert.equal(h.run('JSON.stringify({state,seen:[...seenRecords],claims:[...effectClaims()]})'), liveFacts);
});


function allFourSnapshot(patch = {}) {
  return snapshot([record(1, 180), record(2, 180, 'cs'), record(3, 60, 'politics'), record(4, 60, 'english')], patch);
}
function resonanceTimer(h) { return [...h.timers.entries()].find(([, timer]) => timer.delay === 5600)?.[0]; }
function resonanceActive(h) { return h.element('expedition-canvas').dataset.resonance === 'true'; }
function resonanceEntering(h) { return h.element('expedition-canvas').classList.contains('resonance-arriving'); }

test('all-four completion entrances once and polling preserves its overlay and timer', () => {
  const h = harness(); h.api.render(snapshot());
  assert.equal(resonanceActive(h), false);
  const complete = allFourSnapshot({totals: {minutes: 480, target: 600}}), before = JSON.stringify(complete);
  h.api.render(complete);
  assert.equal(resonanceActive(h), true, 'subject completion must not wait for the larger total goal');
  assert.equal(resonanceEntering(h), true);
  const timer = resonanceTimer(h); assert.ok(timer);
  const writes = h.element('expedition-resonance').htmlWrites;
  h.api.render({...complete, revision: 2});
  assert.equal(resonanceTimer(h), timer, 'a 3-second poll must not restart the entrance');
  assert.equal(h.element('expedition-resonance').htmlWrites, writes);
  h.tick(timer);
  assert.equal(resonanceEntering(h), false);
  assert.equal(resonanceActive(h), true, 'the completed scene remains after the entrance');
  h.api.render({...complete, revision: 3});
  assert.equal(resonanceTimer(h), undefined);
  assert.equal(h.element('expedition-resonance').htmlWrites, writes);
  assert.equal(JSON.stringify(complete), before);
  assert.equal(h.calls.requests.length, 0); assert.equal(h.calls.storageWrites, 0);
});

test('total completion alone cannot activate resonance, and goal edits immediately withdraw it', () => {
  const h = harness();
  h.api.render(snapshot([record(1, 300), record(2, 180, 'cs'), record(3, 60, 'politics'), record(4, 59.999, 'english')]));
  assert.equal(resonanceActive(h), false); assert.equal(resonanceTimer(h), undefined);
  h.api.render(allFourSnapshot()); const timer = resonanceTimer(h);
  assert.equal(resonanceActive(h), true);
  const changed = allFourSnapshot(); changed.subjects[3].target = 90;
  h.api.render(changed);
  assert.equal(resonanceActive(h), false); assert.equal(resonanceEntering(h), false); assert.equal(resonanceTimer(h), undefined);
  h.stale(timer); assert.equal(resonanceActive(h), false);
  h.api.render(allFourSnapshot()); assert.equal(resonanceEntering(h), true);
  const removed = allFourSnapshot(); removed.subjects[0].minutes = 179.999;
  h.api.render(removed); assert.equal(resonanceActive(h), false);
});

test('explicit all-four preview can replay its entrance and returning live preserves the real facts', () => {
  const h = harness(), current = snapshot(), before = JSON.stringify(current); h.api.render(current);
  h.api.preview(100); assert.equal(resonanceActive(h), true); assert.equal(resonanceEntering(h), true);
  const first = resonanceTimer(h); assert.ok(first);
  h.api.preview(100); const second = resonanceTimer(h); assert.ok(second); assert.notEqual(second, first);
  h.stale(first); assert.equal(resonanceEntering(h), true, 'a cancelled old entrance cannot end the new preview');
  h.api.preview(null);
  assert.equal(h.mode(), 'live'); assert.equal(resonanceActive(h), false); assert.equal(resonanceEntering(h), false);
  assert.equal(resonanceTimer(h), undefined); h.stale(second); assert.equal(resonanceActive(h), false);
  assert.equal(JSON.stringify(current), before); assert.equal(h.calls.requests.length, 0); assert.equal(h.calls.storageWrites, 0);
});

test('replay resonance follows its frozen subject frame and live mode restores newer data', () => {
  const h = harness({reducedMotion: true}); h.api.render(allFourSnapshot()); assert.equal(resonanceActive(h), true);
  h.api.startReplay(0, false); assert.equal(resonanceActive(h), false);
  h.element('expedition-scrub').value = 3; h.dispatch(h.element('expedition-scrub'), 'input');
  assert.equal(h.visual().resonance.completed, 3); assert.equal(resonanceActive(h), false);
  h.element('expedition-step').click(); assert.equal(resonanceActive(h), true);
  h.api.render(snapshot()); assert.equal(resonanceActive(h), true, 'polling cannot replace the displayed replay frame');
  h.api.stop(); assert.equal(resonanceActive(h), false); assert.equal(resonanceTimer(h), undefined);
});

test('motion settings and reduced-motion changes keep a static completed scene without an entrance timer', () => {
  for (const h of [harness({reducedMotion: true}), harness()]) {
    h.api.render(allFourSnapshot({settings: {motion: false}}));
    assert.equal(resonanceActive(h), true); assert.equal(resonanceEntering(h), false); assert.equal(resonanceTimer(h), undefined);
  }
  const h = harness(); h.api.render(allFourSnapshot()); const timer = resonanceTimer(h); assert.ok(timer);
  h.setReduced(true); assert.equal(resonanceEntering(h), false); assert.equal(resonanceTimer(h), undefined);
  h.stale(timer); assert.equal(resonanceActive(h), true);
});

test('hidden pages and non-home views never start a four-subject entrance', () => {
  const away = harness({home: false}); away.api.render(allFourSnapshot());
  assert.equal(resonanceEntering(away), false); assert.equal(resonanceTimer(away), undefined);
  const hidden = harness(); hidden.document.hidden = true; hidden.api.render(allFourSnapshot());
  assert.equal(resonanceEntering(hidden), false); assert.equal(resonanceTimer(hidden), undefined);
  const h = harness(); h.api.render(allFourSnapshot()); const timer = resonanceTimer(h);
  h.document.hidden = true; h.docEvent('visibilitychange');
  assert.equal(resonanceEntering(h), false); assert.equal(resonanceTimer(h), undefined);
  h.stale(timer); assert.equal(resonanceActive(h), true);
});

test('leaving or changing dates cancels the resonance entrance without stale callbacks affecting the next scene', () => {
  const h = harness(); h.api.render(allFourSnapshot()); const first = resonanceTimer(h); assert.ok(first);
  h.api.leave(); assert.equal(resonanceEntering(h), false); assert.equal(resonanceTimer(h), undefined);
  h.stale(first); assert.equal(resonanceEntering(h), false);
  h.api.preview(100); const second = resonanceTimer(h); assert.ok(second);
  h.api.render(snapshot([], {date: '2026-09-23'}));
  assert.equal(h.mode(), 'live'); assert.equal(resonanceActive(h), false); assert.equal(resonanceTimer(h), undefined);
  h.stale(second); assert.equal(resonanceEntering(h), false);
  const historical = allFourSnapshot({date: '2026-09-22'}); h.api.render(historical);
  assert.equal(resonanceActive(h), true, 'historical days retain their actual four-subject accomplishment');
});


test('celebration dialogs defer the all-four entrance until visible, resume interruptions, and release pending work on leave', () => {
  const h = harness(); h.api.render(snapshot());
  const dialog = h.element('celebration-dialog'); dialog.open = true;
  h.api.render(allFourSnapshot());
  assert.equal(resonanceActive(h), true); assert.equal(resonanceEntering(h), false); assert.equal(resonanceTimer(h), undefined);
  h.api.render(allFourSnapshot()); h.api.resumeResonance();
  assert.equal(resonanceTimer(h), undefined, 'polls or resume calls cannot consume the entrance under an open dialog');
  dialog.open = false; h.api.resumeResonance();
  const first = resonanceTimer(h); assert.ok(first); assert.equal(resonanceEntering(h), true);
  h.api.render(allFourSnapshot()); assert.equal(resonanceTimer(h), first);
  dialog.open = true; h.api.deferResonance();
  assert.equal(resonanceEntering(h), false); assert.equal(resonanceTimer(h), undefined);
  h.stale(first); assert.equal(resonanceEntering(h), false);
  dialog.open = false; h.api.resumeResonance();
  const second = resonanceTimer(h); assert.ok(second); assert.notEqual(second, first);
  h.stale(first); assert.equal(resonanceEntering(h), true, 'the original timeout cannot stop a resumed entrance');
  h.tick(second); h.api.resumeResonance(); assert.equal(resonanceTimer(h), undefined, 'a finished entrance is not replayed by unrelated dialog closes');
  h.api.preview(100); dialog.open = true; h.api.deferResonance(); h.api.leave();
  dialog.open = false; h.api.resumeResonance();
  assert.equal(resonanceEntering(h), false); assert.equal(resonanceTimer(h), undefined, 'leaving discards a deferred entrance');
});

test('quiet target changes retain completed scenery while cancelling deferred four-subject entrance',()=>{
  const h=harness();h.api.render(snapshot());
  const dialog=h.element('goal-daily-dialog');dialog.open=true;
  h.api.render(allFourSnapshot());assert.equal(resonanceActive(h),true);assert.equal(resonanceTimer(h),undefined);
  const edited=allFourSnapshot();edited.subjects[0].target=170;edited.totals.target=470;
  h.api.render(edited,{quiet:true});dialog.open=false;h.api.resumeResonance();
  assert.equal(resonanceActive(h),true);assert.equal(resonanceEntering(h),false);assert.equal(resonanceTimer(h),undefined);
  h.api.render({...edited,revision:3});assert.equal(resonanceTimer(h),undefined,'ordinary polls cannot replay the quiet baseline');
  const raised=allFourSnapshot();raised.subjects[0].target=200;raised.totals.target=500;
  h.api.render(raised,{quiet:true});assert.equal(resonanceActive(h),false);
  const completed=copy(raised);completed.subjects[0].minutes=200;completed.totals.minutes=500;
  h.api.render(completed);assert.equal(resonanceEntering(h),true,'a real subsequent study crossing still animates');
});

test('app identifies a pure target edit as a quiet baseline and clears queued old celebrations',async()=>{
  const h=harness({appIntegration:true});
  const unfinished=allFourSnapshot();unfinished.subjects[0].target=240;unfinished.totals.target=540;
  await h.refresh(unfinished);assert.equal(resonanceActive(h),false);
  h.run("celebrationQueue=[{title:'old goal pending'}]");
  await h.refresh(allFourSnapshot());
  assert.equal(h.run('celebrationQueue.length'),0);assert.equal(resonanceActive(h),true);assert.equal(resonanceEntering(h),false);assert.equal(resonanceTimer(h),undefined);
  assert.equal(h.calls.requests.length,2);assert.ok(h.calls.requests.every(r=>r.options.method===undefined));
});

test('replay trail and frame copy preserve each record start, end and duration',()=>{
  const h=harness();h.api.render(snapshot([record(1,30,'math',{start:'2026-09-24T08:15:00+08:00',end:'2026-09-24T08:45:00+08:00'})]));
  const trail=h.element('expedition-trail').innerHTML;assert.match(trail,/08:15/);assert.match(trail,/08:45/);assert.match(trail,/30分钟/);
  h.api.startReplay(1,false);assert.match(h.element('expedition-frame-copy').textContent,/08:15 → 08:45/);
});


test('architecture preview updates all four islands without changing study records or unrelated equipment', () => {
  const h=harness();
  const state=snapshot(undefined,{quests:{equipped:{archipelago:'archipelago-default',homeland:'homeland-harbor',island:'island-pavilion',companion:'companion-owl'}}});
  const before=JSON.stringify(state);
  h.api.render(state);
  const initial=h.calls.world.length;
  h.api.previewEquipment({archipelago:'archipelago-harbor',fx:'fx-sakura'});
  assert.equal(h.calls.world.length,initial+1);
  assert.equal(h.calls.world.at(-1).equipped.archipelago,'archipelago-harbor');
  assert.equal(h.calls.world.at(-1).equipped.companion,'companion-owl');
  assert.equal(h.calls.world.at(-1).subjects[0].landmark,'航图观测院');
  assert.match(h.element('expedition-subjects').innerHTML,/潮汐机巧坊/);
  h.api.render(copy(state));
  h.api.previewEquipment({archipelago:'archipelago-harbor',fx:'fx-snow'});
  assert.equal(h.calls.world.length,initial+1,'polls and other equipment must preserve architecture animation phase');
  h.api.previewEquipment(state.quests.equipped);
  assert.equal(h.calls.world.at(-1).equipped.archipelago,'archipelago-default');
  assert.equal(h.calls.world.length,initial+2);
  assert.equal(JSON.stringify(state),before);
  assert.equal(h.calls.storageWrites,0);
});

test('newly equipped architecture follows snapshot changes after preview closes, including history preview', () => {
  const h=harness(),state=snapshot(undefined,{quests:{equipped:{archipelago:'archipelago-harbor'}}});
  h.api.render(state);
  h.api.previewEquipment(state.quests.equipped);
  const next={...state,quests:{equipped:{archipelago:'archipelago-starglass'}}};
  h.api.render(next);
  assert.equal(h.calls.world.at(-1).equipped.archipelago,'archipelago-starglass');
  h.api.preview(0);
  assert.equal(h.calls.world.at(-1).equipped.archipelago,'archipelago-starglass');
  assert.equal(h.calls.world.at(-1).subjects[2].landmark,'群星议会庭');
  assert.equal(h.calls.world.at(-1).subjects[0].progress,0);
  h.api.previewEquipment({archipelago:'evil" onload="bad'});
  assert.equal(h.calls.world.at(-1).equipped.archipelago,'archipelago-starglass');
  h.api.previewEquipment({archipelago:'archipelago-harbor'});
  h.api.previewEquipment(null);
  assert.equal(h.calls.world.at(-1).equipped.archipelago,'archipelago-starglass');
});
