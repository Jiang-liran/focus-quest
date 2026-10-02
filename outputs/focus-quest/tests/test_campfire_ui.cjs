const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sources = ['advice.js', 'campfire-dialogue.js', 'campfire.js']
  .map(name => fs.readFileSync(require.resolve(`../static/${name}`), 'utf8'));
const storageKey = 'focus-quest-campfire-v1';

function snapshot(patch = {}) {
  return {date: '2026-09-24', today: '2026-09-24', settings: {motion: true},
    totals: {minutes: 80, target: 480},
    advice: {id: 'pace', title: '留一点余地', text: '已记录 80 分钟，接下来按自己的安排继续。', tone: 'neutral'},
    quests: {equipped: {npc: 'npc-default'}}, ...patch};
}

function harness({stored = null, storageReadFails = false, storageWriteFails = false, reducedMotion = false} = {}) {
  const elements = new Map(), all = [], writes = [], calls = {random: 0, scene: 0, avatars: [], animations: [], cancelled: 0, selected: [], states: []};
  let value = typeof stored === 'string' ? stored : JSON.stringify(stored);
  const document = {activeElement: null};
  class Element {
    constructor(tag = 'div', id = '') {
      this.tagName = tag.toUpperCase(); this.id = id; this.children = []; this.parent = null;
      this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this.className = '';
      this._text = ''; this._html = ''; this.textWrites = 0; this.htmlWrites = 0;
      this.style = {values: {}, setProperty(name, val) { this.values[name] = val; }};
      all.push(this);
    }
    get textContent() { return this._text; }
    set textContent(text) { this._text = String(text); this.textWrites++; this.replaceChildren(); }
    get innerHTML() { return this._html; }
    set innerHTML(html) { this._html = String(html); this.htmlWrites++; this.replaceChildren(); }
    replaceChildren() {
      if (this.children.some(child => child.contains(document.activeElement))) document.activeElement = null;
      this.children.forEach(child => { child.parent = null; }); this.children = [];
    }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
    setAttribute(name, val) { this.attributes[name] = String(val); }
    addEventListener(name, fn) { const handlers = this.listeners.get(name) || []; handlers.push(fn); this.listeners.set(name, handlers); }
    click() { for (const fn of this.listeners.get('click') || []) fn({target: this}); }
    focus() { document.activeElement = this; }
    querySelector(selector) {
      for (const child of this.children) {
        if (selector.startsWith('.') && child.className.split(/\s+/).includes(selector.slice(1))) return child;
        const found = child.querySelector(selector); if (found) return found;
      }
      return null;
    }
    getAnimations() { return [{cancel() { calls.cancelled++; }}]; }
    animate(keyframes, options) { calls.animations.push({node: this, keyframes, options}); }
  }
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element('div', id));
    return elements.get(id);
  };
  const topicButtons = ['relax', 'story', 'advice'].map(topic => {
    const button = element(`topic-${topic}`); button.dataset.campfireTopic = topic; return button;
  });
  document.getElementById = element;
  document.createElement = tag => new Element(tag);
  document.querySelectorAll = selector => {
    if (selector === '[data-campfire-topic]') return topicButtons;
    if (selector === '.campfire-character') return element('campfire-characters').children;
    throw new Error(`Unexpected selector: ${selector}`);
  };
  const math = Object.create(Math);
  math.random = () => { calls.random++; return 0; };
  const sandbox = {document, Math: math,
    matchMedia(query) { assert.equal(query, '(prefers-reduced-motion: reduce)'); return {matches: reducedMotion}; },
    localStorage: {
      getItem(key) { assert.equal(key, storageKey); if (storageReadFails) throw new Error('Storage denied'); return value; },
      setItem(key, next) { assert.equal(key, storageKey); if (storageWriteFails) throw new Error('Storage full'); value = next; writes.push(next); },
    },
    FocusCampfireArt: {
      scene() { calls.scene++; return '<svg data-test="scene"></svg>'; },
      avatar(character, outfit) { calls.avatars.push({character, outfit}); return `<svg data-character="${character}" data-outfit="${outfit}"></svg>`; },
    },
    FocusCampfireRoom: {
      selectCharacter(id) { calls.selected.push(id); },
      renderState(state) { calls.states.push(state); },
    },
  };
  const context = vm.createContext(sandbox);
  sources.forEach(source => vm.runInContext(source, context));
  return {api: context.FocusCampfire, dialogue: context.FocusCampfireDialogue, document, element, all, calls, writes,
    saved: () => JSON.parse(value),
    lastId: () => JSON.parse(value).recent.at(-1),
    chooseCharacter(id, topic = 'relax') { context.FocusCampfire.choose(id, topic); },
    clickTopic(id) { element(`topic-${id}`).click(); },
  };
}

test('first visit opens hearth relaxation and delegates world selection without recreating character cards', () => {
  const h = harness();
  h.api.render(snapshot());
  assert.equal(h.element('advice-card').dataset.character, 'hearth');
  assert.equal(h.element('advice-topic').textContent, '歇一会儿');
  assert.equal(h.calls.selected.at(-1), 'hearth');
  assert.equal(h.element('campfire-characters').children.length, 0);
  assert.ok(h.lastId().startsWith('campfire:hearth:relax:'));
  assert.equal(h.calls.scene, 1);
  assert.equal(h.calls.states.length, 1);
  assert.equal(h.element('topic-relax').attributes['aria-pressed'], 'true');
  assert.equal(h.element('topic-story').attributes['aria-pressed'], 'false');
  assert.equal(h.element('topic-advice').attributes['aria-pressed'], 'false');
});

test('all four characters and three topic controls select the matching speaker, conversation and preference', () => {
  const h = harness(); h.api.render(snapshot());
  for (const id of ['guide', 'hearth', 'wanderer', 'stargazer']) {
    h.chooseCharacter(id);
    const character = h.dialogue.characters.find(item => item.id === id);
    assert.equal(h.element('campfire-name').textContent, character.name);
    assert.equal(h.element('campfire-role').textContent, character.title);
    assert.equal(h.element('advice-card').dataset.character, id);
    assert.equal(h.element('advice-card').style.values['--campfire-accent'], character.accent);
    for (const topic of ['relax', 'story', 'advice']) {
      h.clickTopic(topic);
      assert.equal(h.saved().character, id); assert.equal(h.saved().topic, topic);
      const valid = h.dialogue.buildLines(snapshot(), id, topic).map(line => line.id);
      assert.ok(valid.includes(h.lastId()));
      for (const other of ['relax', 'story', 'advice']) assert.equal(h.element(`topic-${other}`).attributes['aria-pressed'], String(other === topic));
    }
    assert.equal(h.calls.selected.at(-1), id);
  }
});

test('the public world selection API is safe before first state and normalizes invalid characters and topics', () => {
  const h = harness();
  assert.doesNotThrow(() => h.api.choose('guide', 'advice'));
  assert.equal(h.writes.length, 0, 'a station cannot invent a conversation before state is available');
  h.api.render(snapshot());
  for (const [character, topic] of [['__proto__', 'constructor'], [null, null], ['missing', 'missing']]) {
    h.api.choose(character, topic);
    assert.equal(h.saved().character, 'hearth'); assert.equal(h.saved().topic, 'relax');
    assert.equal(h.calls.selected.at(-1), 'hearth');
    assert.ok(h.lastId().startsWith('campfire:hearth:relax:'));
  }
});

test('polling keeps selected world character, conversation, focus and handlers without randomizing or rewriting art', () => {
  const h = harness(); h.api.render(snapshot()); h.chooseCharacter('wanderer', 'story');
  const button = h.element('topic-story'), line = h.element('advice-text').textContent, id = h.lastId();
  button.focus();
  const before = {random: h.calls.random, avatars: h.calls.avatars.length, writes: h.writes.length,
    textWrites: h.element('advice-text').textWrites, portrait: h.element('campfire-portrait').htmlWrites};
  for (let i = 0; i < 4; i++) h.api.render(snapshot({revision: i + 1, totals: {minutes: 81 + i, target: 480}}));
  assert.equal(h.lastId(), id); assert.equal(h.element('advice-text').textContent, line);
  assert.equal(h.document.activeElement, button);
  assert.equal(h.calls.selected.at(-1), 'wanderer');
  assert.equal(h.calls.states.length, 5);
  assert.equal(h.calls.states.at(-1).totals.minutes, 84);
  assert.equal(h.element('campfire-scene').htmlWrites, 1);
  assert.deepEqual({random: h.calls.random, avatars: h.calls.avatars.length, writes: h.writes.length,
    textWrites: h.element('advice-text').textWrites, portrait: h.element('campfire-portrait').htmlWrites}, before);
  assert.equal(h.element('advice-next').listeners.get('click').length, 1);
  for (const topic of ['relax', 'story', 'advice']) assert.equal(h.element(`topic-${topic}`).listeners.get('click').length, 1);
});

test('successive conversations exclude all of the previous eight lines, including after storage restoration', () => {
  let h = harness(); h.api.render(snapshot());
  const shown = [h.lastId()];
  for (let i = 0; i < 24; i++) {
    h.element('advice-next').click();
    assert.ok(!shown.slice(-8).includes(h.lastId()), `${h.lastId()} repeated inside the recent window`);
    shown.push(h.lastId());
  }
  const stored = h.saved(); h = harness({stored}); h.api.render(snapshot());
  assert.ok(!shown.slice(-8).includes(h.lastId()), 'a reload still respects recent conversations');
});

test('a restored history longer than eight moves a revisited older line to the newest position before next', () => {
  const recent = Array.from({length: 10}, (_, index) => `campfire:hearth:relax:${String(index + 1).padStart(2, '0')}`);
  const h = harness({stored: {character: 'hearth', topic: 'relax', recent}});
  h.api.render(snapshot());
  const first = h.dialogue.buildLines(snapshot(), 'hearth', 'relax')[0];
  assert.equal(h.element('advice-text').textContent, first.text, 'the oldest entry is outside the last-eight exclusion');
  assert.equal(h.lastId(), first.id, 'the restored older line must now count as the most recent conversation');
  assert.equal(h.saved().recent.filter(id => id === first.id).length, 1);
  h.element('advice-next').click();
  assert.notEqual(h.element('advice-text').textContent, first.text);
  assert.notEqual(h.lastId(), first.id);
});

test('stored preferences restore and malformed, unavailable or full localStorage leaves the conversation usable', () => {
  const restored = harness({stored: {character: 'stargazer', topic: 'story', recent: [null, 7, 'campfire:stargazer:story:01']}});
  restored.api.render(snapshot());
  assert.equal(restored.element('advice-card').dataset.character, 'stargazer');
  assert.equal(restored.element('advice-topic').textContent, '听段见闻');
  assert.notEqual(restored.lastId(), 'campfire:stargazer:story:01');
  assert.ok(restored.saved().recent.every(id => typeof id === 'string'));
  for (const options of [{stored: '{bad json'}, {stored: {character: 'missing', topic: '__proto__'}},
    {storageReadFails: true}, {storageWriteFails: true}, {storageReadFails: true, storageWriteFails: true}]) {
    const h = harness(options);
    assert.doesNotThrow(() => h.api.render(snapshot()));
    assert.equal(h.element('advice-card').dataset.character, 'hearth');
    assert.equal(h.element('advice-topic').textContent, '歇一会儿');
    const initial = h.element('advice-text').textContent;
    assert.doesNotThrow(() => h.element('advice-next').click());
    assert.ok(h.element('advice-text').textContent);
    assert.notEqual(h.element('advice-text').textContent, initial);
    assert.doesNotThrow(() => { h.chooseCharacter('guide', 'advice'); });
  }
});

test('the suggestion shortcut chooses a guide state line and later polls refresh its facts without another random selection', () => {
  const h = harness(); h.api.render(snapshot()); h.chooseCharacter('hearth');
  h.api.suggest(snapshot());
  assert.equal(h.element('advice-card').dataset.character, 'guide');
  assert.equal(h.element('advice-topic').textContent, '聊聊学习');
  assert.ok(h.lastId().startsWith('campfire:guide:state:'));
  assert.equal(h.element('advice-text').textContent, snapshot().advice.text);
  assert.match(h.element('campfire-context').textContent, /2026-09-24/);
  const random = h.calls.random;
  const fresh = snapshot({advice: {id: 'pace', title: '留一点余地', text: '已记录 100 分钟，稍后按安排继续。', tone: 'neutral'}});
  h.api.render(fresh);
  assert.equal(h.calls.random, random);
  assert.equal(h.element('advice-text').textContent, fresh.advice.text);
  const history = snapshot({date: '2026-09-20', advice: {id: 'pace', title: '回看那一天', text: '这一天记录了 25 分钟。', tone: 'neutral'}});
  h.api.render(history);
  assert.equal(h.element('advice-text').textContent, history.advice.text);
  assert.match(h.element('campfire-context').textContent, /2026-09-20/);
  assert.doesNotMatch(h.element('advice-text').textContent, /100/);
});

test('dynamic titles, text and date context remain textContent rather than executable markup', () => {
  const h = harness(); const attack = '<img src=x onerror="evil()"> & <script>evil()</script>';
  h.api.suggest(snapshot({date: attack, today: attack, advice: {id: 'unsafe', title: attack, text: attack}}));
  assert.equal(h.element('advice-title').textContent, attack);
  assert.equal(h.element('advice-text').textContent, attack);
  assert.ok(h.element('campfire-context').textContent.includes(attack));
  for (const id of ['advice-title', 'advice-text', 'campfire-context']) assert.equal(h.element(id).htmlWrites, 0);
  assert.ok(h.all.every(node => !node.innerHTML.includes(attack)));
});

test('legacy NPC equipment cannot change character portraits or replace a focused conversation control', () => {
  const h = harness(); h.api.render(snapshot()); h.chooseCharacter('stargazer');
  const button = h.element('topic-relax'), line = h.element('advice-text').textContent;
  button.focus();
  const random = h.calls.random, count = h.calls.avatars.length;
  h.api.render(snapshot({quests: {equipped: {npc: 'npc-astral'}}}));
  assert.equal(h.calls.avatars.length, count, 'removed NPC outfits do not redraw or replace the characters');
  assert.ok(h.calls.avatars.every(call => !call.outfit || call.outfit === 'npc-default'));
  assert.equal(h.document.activeElement, button);
  assert.equal(h.calls.selected.at(-1), 'stargazer');
  assert.equal(h.element('advice-card').dataset.character, 'stargazer');
  assert.equal(h.element('advice-text').textContent, line);
  assert.equal(h.calls.random, random);
  assert.equal(h.calls.scene, 1);
  const nextCount = h.calls.avatars.length;
  h.api.render(snapshot({quests: {equipped: {npc: 'npc-astral'}}}));
  assert.equal(h.calls.avatars.length, nextCount);
});

test('conversation animation honors both app motion settings and reduced-motion preference', () => {
  for (const [motion, reducedMotion, expected] of [[true, false, 2], [false, false, 0], [true, true, 0], [false, true, 0]]) {
    const h = harness({reducedMotion}), state = snapshot({settings: {motion}});
    h.api.render(state);
    assert.equal(h.calls.animations.length, 0, 'background renders never animate the conversation');
    h.element('advice-next').click(); h.api.suggest(state);
    assert.equal(h.calls.animations.length, expected);
    assert.equal(h.calls.cancelled, expected);
    assert.ok(h.calls.animations.every(call => call.node === h.element('advice-line')));
  }
});
