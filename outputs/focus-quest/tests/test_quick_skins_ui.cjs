const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));
const slots = ['bar', 'fx', 'avatar', 'banner', 'theme', 'companion', 'relic', 'portal', 'island', 'camp', 'fire', 'tent', 'campgear', 'campglow', 'chatframe', 'camptrail', 'campmark'];

function snapshot(patch = {}) {
  return {now: '2026-09-24T15:00:00.000100+08:00', wallet: {coins: 1234, diamonds: 10},
    equipped: Object.fromEntries(slots.map(slot => [slot, `${slot}-default`])),
    catalog: slots.flatMap(slot => ['default', 'one', 'two', 'locked'].map(kind => ({
      id: `${slot}-${kind}`, slot, name: `${slot} ${kind}`, description: `${slot} description`,
      owned: kind !== 'locked', equipped: kind === 'default', currency: kind === 'default' ? 'free' : 'coins',
      coins: kind === 'default' ? 0 : 100, diamonds: 0,
    }))), ...patch};
}

function harness() {
  const elements = new Map(), documentListeners = new Map(), windowListeners = new Map();
  const calls = {requests: [], refresh: [], toasts: [], paints: [], campPreviews: [], questRenders: [], sounds: []};
  let api;
  const document = {activeElement: null};
  const camel = value => value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  const unescape = value => String(value).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  class Element {
    constructor(tag = 'div', id = '') {
      this.id = id; this.tagName = tag.toUpperCase(); this.parentElement = null; this.children = [];
      this.attributes = {}; this.dataset = {}; this.listeners = new Map(); this.hidden = false; this.disabled = false;
      this.style = {setProperty(name, value) { this[name] = value; }};
      this._html = ''; this._text = ''; this.classes = new Set(); this.className = ''; this.offsetWidth = 340; this.offsetHeight = 380;
      this.classList = {add: (...names) => names.forEach(name => this.classes.add(name)), remove: (...names) => names.forEach(name => this.classes.delete(name)),
        contains: name => this.classes.has(name) || this.className.split(/\s+/).includes(name),
        toggle: (name, on) => { if (on ?? !this.classes.has(name)) this.classes.add(name); else this.classes.delete(name); }};
    }
    get isConnected() { return this === document.body || Boolean(this.parentElement?.isConnected); }
    get innerHTML() { return this._html; }
    set innerHTML(value) {
      this._html = String(value); this.children.forEach(child => { child.parentElement = null; }); this.children = [];
      for (const match of this._html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
        const button = new Element('button');
        for (const attr of match[1].matchAll(/([a-zA-Z-]+)(?:="([^"]*)"|='([^']*)')?/g)) button.setAttribute(attr[1], unescape(attr[2] ?? attr[3] ?? ''));
        button._text = unescape(match[2].replace(/<[^>]*>/g, '')); this.append(button);
      }
    }
    get textContent() { return this._text; }
    set textContent(value) { this._text = String(value); this.children = []; }
    append(...children) { children.forEach(child => { child.parentElement = this; this.children.push(child); }); }
    appendChild(child) { this.append(child); return child; }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name.startsWith('data-')) this.dataset[camel(name.slice(5))] = String(value);
      if (name === 'disabled') this.disabled = true;
      if (name === 'id') this.id = value;
      if (name === 'class') this.className = value;
    }
    getAttribute(name) { return this.attributes[name] ?? null; }
    hasAttribute(name) { return name.startsWith('data-') ? camel(name.slice(5)) in this.dataset : name in this.attributes; }
    removeAttribute(name) { delete this.attributes[name]; if (name === 'disabled') this.disabled = false; }
    addEventListener(name, fn) { const handlers = this.listeners.get(name) || []; handlers.push(fn); this.listeners.set(name, handlers); }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim();
        if (part.includes(':not([disabled])')) return !this.disabled && this.matches(part.replace(':not([disabled])', ''));
        if (part.includes(':not(:disabled)')) return !this.disabled && this.matches(part.replace(':not(:disabled)', ''));
        if (part.startsWith('#')) return this.id === part.slice(1);
        if (part.startsWith('.')) return this.classList.contains(part.slice(1));
        const attr = part.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
        if (attr) {
          const value = attr[1].startsWith('data-') ? this.dataset[camel(attr[1].slice(5))] : this.attributes[attr[1]];
          return value !== undefined && (attr[2] === undefined || value === attr[2]);
        }
        return this.tagName.toLowerCase() === part.toLowerCase();
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() { return {left: 30, top: 40, right: 370, bottom: 420, width: this.offsetWidth, height: this.offsetHeight}; }
    focus() { document.activeElement = this; this.dispatch('focus'); }
    click() { this.dispatch('click'); }
    dispatch(type, props = {}) {
      const event = makeEvent(type, this, props); for (const fn of this.listeners.get(type) || []) fn(event);
      if (!['mouseenter', 'mouseleave', 'focus', 'blur'].includes(type)) {
        for (let parent = this.parentElement; parent && !event.stopped; parent = parent.parentElement) for (const fn of parent.listeners.get(type) || []) fn(event);
        if (!event.stopped) for (const fn of documentListeners.get(type) || []) fn(event);
      }
      return event;
    }
  }
  const makeEvent = (type, target, props = {}) => ({type, target, relatedTarget: null, clientX: 100, clientY: 100,
    prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; }, ...props});
  const element = id => { if (!elements.has(id)) elements.set(id, new Element('div', id)); return elements.get(id); };
  document.body = element('body'); document.documentElement = element('html'); document.documentElement.append(document.body);
  document.getElementById = element; document.createElement = tag => new Element(tag);
  document.addEventListener = (type, fn) => { const handlers = documentListeners.get(type) || []; handlers.push(fn); documentListeners.set(type, handlers); };
  document.querySelectorAll = selector => document.documentElement.querySelectorAll(selector);
  document.querySelector = selector => document.querySelectorAll(selector)[0] || null;
  const menu = element('quick-skins'); menu.hidden = true; menu.setAttribute('role', 'dialog'); document.body.append(menu);
  for (const id of ['quick-skin-tabs', 'quick-skin-items', 'quick-skin-status', 'quick-skin-close']) menu.append(element(id));
  const bridge = {
    api(path, body) { return new Promise((resolve, reject) => calls.requests.push({path, body: copy(body), resolve, reject})); },
    async refresh(force) { calls.refresh.push(force); }, toast(...args) { calls.toasts.push(args); },
    playSound(cue, options = {}) { calls.sounds.push({cue, ...copy(options)}); },
  };
  const sandbox = {document, innerWidth: 1000, innerHeight: 700, requestAnimationFrame: fn => fn(), setTimeout, clearTimeout,
    matchMedia: () => ({matches: true}),
    addEventListener(type, fn) { const handlers = windowListeners.get(type) || []; handlers.push(fn); windowListeners.set(type, handlers); },
    ShopArt: {preview: id => `<svg data-preview="${id}"></svg>`, apply(equipped) { calls.paints.push(copy(equipped)); }},
    FocusCampfire: {previewEquipment(overrides) { calls.campPreviews.push(copy(overrides)); }},
    FocusQuests: {render(next) { calls.questRenders.push(copy(next)); api.render(next); }},
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../static/quick-skins.js'), 'utf8'), context);
  api = context.FocusQuickSkins; api.init(bridge);
  const fireDocument = (type, target = document.body, props = {}) => {
    const event = makeEvent(type, target, props); for (const fn of documentListeners.get(type) || []) fn(event); return event;
  };
  return {api, calls, element, document, menu, bridge, fireDocument, context,
    item(id) { const result = element('quick-skin-items').querySelectorAll('[data-quick-item]').find(node => node.dataset.quickItem === id); assert.ok(result, `Missing menu item ${id}`); return result; },
    tab(slot) { const result = element('quick-skin-tabs').querySelectorAll('[data-quick-slot]').find(node => node.dataset.quickSlot === slot); assert.ok(result, `Missing slot ${slot}`); return result; },
    node({id, className = '', slots: skinSlots, block = false, parent = document.body} = {}) {
      const node = id ? element(id) : new Element(); node.className = className;
      if (skinSlots) node.dataset.skinSlots = skinSlots; if (block) node.dataset.skinBlock = ''; parent.append(node); return node;
    },
    latestPaint() { return calls.paints.at(-1); },
  };
}

test('quick menu contains only owned items and the default for the selected part, and never opens the shop', () => {
  const h = harness(); h.api.render(snapshot()); h.api.open(['camp'], {x: 60, y: 70});
  assert.equal(h.menu.hidden, false);
  const items = h.element('quick-skin-items').querySelectorAll('[data-quick-item]').map(node => node.dataset.quickItem);
  assert.deepEqual(items, ['camp-default', 'camp-one', 'camp-two']);
  assert.equal(h.element('quick-skin-items').innerHTML.includes('camp-locked'), false);
  assert.equal(h.calls.requests.length, 0); assert.equal(h.calls.questRenders.length, 0);
  assert.equal(h.menu.attributes.role, 'dialog');
});

test('homepage layout has an owned-only right-click menu and restores its original empty default', () => {
  const h=harness();h.api.render(snapshot());
  const scene=h.node({slots:'island theme fx'}),decor=h.node({slots:'island',parent:scene});
  h.fireDocument('contextmenu',decor,{clientX:60,clientY:70});
  assert.equal(h.menu.hidden,false);
  assert.match(h.element('quick-skin-title').textContent,/主岛布置/);
  const items=h.element('quick-skin-items').querySelectorAll('[data-quick-item]').map(node=>node.dataset.quickItem);
  assert.deepEqual(items,['island-default','island-one','island-two']);
  assert.equal(h.calls.requests.length,0);
  h.api.close();
  assert.equal(h.calls.paints.at(-1).island,'island-default');
});

test('roadside fire context menu uses the stable entry and restores its focus after preview replaces the inner artwork', () => {
  const h = harness(), initial = snapshot(); h.api.render(initial);
  const island = h.node({className: 'quest-scene', slots: 'island theme fx avatar'});
  const entry = h.node({id: 'campfire-room-open', slots: 'fire', parent: island}); entry.setAttribute('tabindex', '0');
  const art = h.node({id: 'campfire-entrance-art', parent: entry});
  const oldInner = h.node({slots: 'fire', parent: art}), flame = h.node({parent: oldInner});
  let draws = 0;
  h.context.FocusCampfire.previewEquipment = overrides => {
    h.calls.campPreviews.push(copy(overrides)); draws++;
    art.innerHTML = '<svg aria-hidden="true"></svg>';
  };
  const event = h.fireDocument('contextmenu', flame, {button: 2});
  assert.equal(event.prevented, true); assert.equal(h.menu.hidden, false);
  assert.match(h.element('quick-skin-title').textContent, /篝火样式/);
  assert.deepEqual(h.element('quick-skin-items').querySelectorAll('[data-quick-item]').map(node => node.dataset.quickItem), ['fire-default', 'fire-one', 'fire-two']);
  assert.equal(h.element('quick-skin-tabs').hidden, true, 'the parent island multi-slot menu must not win');
  assert.equal(oldInner.isConnected, false, 'opening already paints and can replace the clicked nested flame');
  h.item('fire-one').dispatch('mouseenter'); assert.equal(h.latestPaint().fire, 'fire-one');
  h.fireDocument('keydown', h.item('fire-one'), {key: 'Escape'});
  assert.equal(h.menu.hidden, true); assert.equal(h.latestPaint().fire, 'fire-default');
  assert.equal(h.document.activeElement, entry); assert.equal(entry.isConnected, true);
  assert.ok(draws >= 3); assert.equal(h.calls.requests.length, 0); assert.deepEqual(initial.wallet, {coins: 1234, diamonds: 10});
});

test('keyboard context-menu commands on the roadside entry select fire and return focus without entering camp', () => {
  const h = harness(); h.api.render(snapshot());
  const island = h.node({slots: 'island theme fx'}), entry = h.node({id: 'campfire-room-open', slots: 'fire', parent: island});
  let opened = 0; entry.addEventListener('click', () => opened++);
  for (const keys of [{key: 'ContextMenu'}, {key: 'F10', shiftKey: true}]) {
    entry.focus(); const event = h.fireDocument('keydown', entry, keys);
    assert.equal(event.prevented, true); assert.match(h.element('quick-skin-title').textContent, /篝火样式/);
    h.api.close(); assert.equal(h.document.activeElement, entry);
  }
  assert.equal(opened, 0); assert.equal(h.calls.requests.length, 0);
});

test('Escape restores focus inside the camp after a hover replaces its original SVG hotspot', () => {
  const h = harness(); h.api.render(snapshot());
  const card = h.node({id: 'advice-card'}), scene = h.node({id: 'campfire-scene', parent: card});
  const svg = h.node({parent: scene}), part = h.node({slots: 'fire', parent: svg});
  const close = h.node({id: 'campfire-room-close'});
  h.context.FocusCampfireRoom = {isOpen: () => true};
  h.context.FocusCampfire.previewEquipment = overrides => {
    h.calls.campPreviews.push(copy(overrides));
    if (overrides) { scene.children = []; svg.parentElement = null; }
  };
  h.api.open('fire', {anchor: part}); h.item('fire-one').focus();
  assert.equal(part.isConnected, false); assert.equal(part.closest('#advice-card'), null);
  h.fireDocument('keydown', h.item('fire-one'), {key: 'Escape'});
  assert.equal(h.menu.hidden, true); assert.equal(h.document.activeElement, close);
  assert.equal(h.calls.campPreviews.at(-1), null); assert.equal(h.calls.requests.length, 0);
});

test('camp menu keeps a stable return control but falls back if an SVG hotspot cannot receive focus', () => {
  const h = harness(); h.api.render(snapshot());
  const card = h.node({id: 'advice-card'}), control = h.node({parent: card}), close = h.node({id: 'campfire-room-close'});
  h.context.FocusCampfireRoom = {isOpen: () => true};
  h.api.open('camp', {anchor: control}); h.api.close(); assert.equal(h.document.activeElement, control);
  const svgPart = h.node({slots: 'fire', parent: card}); svgPart.focus = () => {};
  h.api.open('fire', {anchor: svgPart}); h.api.close(); assert.equal(h.document.activeElement, close);
});

test('closing the camp menu for navigation never steals focus and a later non-camp menu resets its origin', () => {
  const h = harness(); h.api.render(snapshot());
  const card = h.node({id: 'advice-card'}), part = h.node({parent: card});
  const destination = h.node({id: 'destination'}); h.node({id: 'campfire-room-close'});
  h.context.FocusCampfireRoom = {isOpen: () => true};
  h.api.open('camp', {anchor: part}); part.parentElement = null; card.children = [];
  destination.focus(); h.api.close(false); assert.equal(h.document.activeElement, destination);
  h.api.open('theme', {anchor: destination}); h.api.close(); assert.equal(h.document.activeElement, destination);
});

test('hover is temporary, polling retains it, and leaving restores the latest authoritative equipment', () => {
  const h = harness(); const initial = snapshot(); h.api.render(initial); h.api.open(['camp']);
  h.item('camp-one').dispatch('mouseenter');
  assert.equal(h.latestPaint().camp, 'camp-one');
  assert.equal(h.calls.campPreviews.at(-1).camp, 'camp-one');
  const fresh = snapshot({now: '2026-09-24T15:00:01.000100+08:00', equipped: {...initial.equipped, camp: 'camp-two', fire: 'fire-two'}});
  h.api.render(fresh);
  assert.equal(h.latestPaint().camp, 'camp-one');
  assert.equal(h.latestPaint().fire, 'fire-two');
  h.item('camp-one').dispatch('mouseleave');
  assert.equal(h.latestPaint().camp, 'camp-two');
  assert.equal(h.latestPaint().fire, 'fire-two');
  assert.equal(h.calls.campPreviews.at(-1), null);
  assert.equal(initial.equipped.camp, 'camp-default');
  assert.equal(fresh.equipped.camp, 'camp-two');
  assert.deepEqual(initial.wallet, {coins: 1234, diamonds: 10});
  assert.equal(h.calls.requests.length, 0);
  assert.deepEqual(h.calls.sounds, [], 'temporary preview and authoritative polls are silent');
});

test('changing parts replaces a previous hover preview instead of accumulating temporary equipment', () => {
  const h = harness(); const initial = snapshot(); h.api.render(initial); h.api.open(['camp', 'fire']);
  h.item('camp-one').dispatch('mouseenter'); assert.equal(h.latestPaint().camp, 'camp-one');
  h.tab('fire').click(); h.item('fire-one').dispatch('mouseenter');
  assert.equal(h.latestPaint().camp, 'camp-default'); assert.equal(h.latestPaint().fire, 'fire-one');
  h.api.close(); assert.equal(h.menu.hidden, true);
  assert.equal(h.latestPaint().camp, 'camp-default'); assert.equal(h.latestPaint().fire, 'fire-default');
  assert.equal(h.calls.requests.length, 0);
});

test('context targeting prefers the direct part, supports a multi-part container, and excludes all NPC portraits', () => {
  const h = harness(); h.api.render(snapshot());
  const container = h.node({slots: 'camp fire tent campgear campglow chatframe'});
  const direct = h.node({slots: 'tent', parent: container});
  assert.equal(h.fireDocument('contextmenu', direct).prevented, true);
  assert.deepEqual(h.element('quick-skin-items').querySelectorAll('[data-quick-item]').map(node => node.dataset.quickItem), ['tent-default', 'tent-one', 'tent-two']);
  h.api.close(); h.fireDocument('contextmenu', container);
  assert.equal(h.element('quick-skin-tabs').querySelectorAll('[data-quick-slot]').length, 6);
  for (const options of [{className: 'campfire-speaker'}, {className: 'campfire-character'}, {className: 'q-portrait'}, {id: 'shop-keeper'}, {block: true}]) {
    h.api.close(); const npc = h.node({...options, parent: container});
    const child = h.node({parent: npc}); h.fireDocument('contextmenu', child);
    assert.equal(h.menu.hidden, true, `${JSON.stringify(options)} must not fall through to the surrounding camp`);
  }
  h.api.open(['npc']); assert.equal(h.menu.hidden, true);
  assert.equal(h.calls.requests.length, 0);
});

test('Escape, the close control and clicking outside dismiss preview and restore live equipment', () => {
  const h = harness(); const data = snapshot(); h.api.render(data);
  for (const dismiss of [() => h.fireDocument('keydown', h.menu, {key: 'Escape'}),
    () => h.element('quick-skin-close').click(), () => h.fireDocument('pointerdown')]) {
    h.api.open(['bar']); h.item('bar-one').dispatch('mouseenter'); assert.equal(h.latestPaint().bar, 'bar-one');
    dismiss(); assert.equal(h.menu.hidden, true); assert.equal(h.latestPaint().bar, 'bar-default');
    assert.equal(h.calls.campPreviews.at(-1), null);
  }
});

test('keyboard navigation moves between available options and focus previews without submitting an equip request', () => {
  const h = harness(); h.api.render(snapshot()); h.api.open(['bar']);
  h.item('bar-one').focus(); assert.equal(h.latestPaint().bar, 'bar-one');
  const down = h.fireDocument('keydown', h.document.activeElement, {key: 'ArrowDown'});
  assert.equal(down.prevented, true);
  assert.equal(h.document.activeElement.dataset.quickItem, 'bar-two');
  assert.equal(h.latestPaint().bar, 'bar-two');
  const up = h.fireDocument('keydown', h.document.activeElement, {key: 'ArrowUp'});
  assert.equal(up.prevented, true); assert.equal(h.document.activeElement.dataset.quickItem, 'bar-one');
  assert.equal(h.calls.requests.length, 0);
});

test('equip is single-flight and the confirmed result survives closing the menu and a late same-millisecond poll', async () => {
  const h = harness(); const initial = snapshot(); h.api.render(initial); h.api.open(['camp']);
  const candidate = h.item('camp-one'); candidate.dispatch('mouseenter'); candidate.click(); candidate.click();
  assert.equal(h.calls.requests.length, 1);
  assert.deepEqual(h.calls.sounds, [], 'the request has not been acknowledged');
  assert.equal(h.calls.requests[0].path, '/api/shop/equip');
  assert.deepEqual(h.calls.requests[0].body, {itemId: 'camp-one'});
  h.api.close();
  const equipped = snapshot({now: '2026-09-24T15:00:00.000900+08:00', equipped: {...initial.equipped, camp: 'camp-one'}});
  h.calls.requests[0].resolve(equipped); await flush();
  assert.equal(h.latestPaint().camp, 'camp-one');
  assert.equal(h.calls.questRenders.length, 1);
  assert.equal(h.menu.hidden, true); assert.deepEqual(h.calls.refresh, [true]);
  h.api.render(snapshot({now: '2026-09-24T15:00:00.000500+08:00'}));
  assert.equal(h.latestPaint().camp, 'camp-one');
  assert.equal(h.calls.requests.length, 1);
  assert.deepEqual(equipped.wallet, initial.wallet, 'equipping does not spend currency');
  assert.deepEqual(h.calls.sounds, [{cue:'equip'}], 'one successful mutation sounds once despite rendering through two controllers');
});

test('failed equip clears the preview, restores newer polled equipment and reports the failure without a local unlock', async () => {
  const h = harness(); const initial = snapshot(); h.api.render(initial); h.api.open(['fire']);
  h.item('fire-one').dispatch('mouseenter'); h.item('fire-one').click();
  assert.equal(h.calls.requests.length, 1);
  const fresh = snapshot({now: '2026-09-24T15:00:01.000100+08:00', equipped: {...initial.equipped, fire: 'fire-two'}});
  h.api.render(fresh);
  h.calls.requests[0].reject(new Error('暂时无法更新装备')); await flush();
  assert.equal(h.latestPaint().fire, 'fire-two');
  assert.equal(h.calls.campPreviews.at(-1), null);
  assert.equal(h.calls.questRenders.length, 0);
  assert.ok(h.element('quick-skin-status').textContent.includes('暂时无法更新装备')
    || h.calls.toasts.some(args => args.some(value => String(value).includes('暂时无法更新装备'))));
  assert.deepEqual(h.calls.refresh, [true]);
  assert.equal(fresh.equipped.fire, 'fire-two');
  assert.deepEqual(h.calls.sounds, []);
});

test('ordinary polls preserve the focused menu button, active preview and listener count', () => {
  const h = harness(); const initial = snapshot(); h.api.render(initial); h.api.open(['bar']);
  const candidate = h.item('bar-one'); candidate.focus();
  for (let i = 1; i <= 3; i++) h.api.render(snapshot({now: `2026-09-24T15:00:0${i}.000100+08:00`, wallet: {coins: 1234 + i, diamonds: 10}}));
  assert.equal(h.item('bar-one'), candidate);
  assert.equal(h.document.activeElement, candidate);
  assert.equal(candidate.listeners.get('click').length, 1);
  assert.equal(h.latestPaint().bar, 'bar-one');
  assert.equal(h.calls.requests.length, 0);
  assert.deepEqual(h.calls.sounds, []);
});

test('quick equip sounds only after a changed outfit is confirmed, even if a matching poll arrives first', async () => {
  const h=harness(),initial=snapshot();h.api.render(initial);h.api.open('fire');
  h.item('fire-default').click();assert.equal(h.calls.requests.length,0);assert.deepEqual(h.calls.sounds,[]);
  h.api.open('fire');h.item('fire-one').click();
  const confirmed=snapshot({now:'2026-09-24T15:00:01.000100+08:00',equipped:{...initial.equipped,fire:'fire-one'}});
  h.api.render(confirmed);assert.deepEqual(h.calls.sounds,[]);
  h.calls.requests[0].resolve({...confirmed,now:'2026-09-24T15:00:01.000200+08:00'});await flush();
  assert.deepEqual(h.calls.sounds,[{cue:'equip'}]);
  h.api.open('fire');h.item('fire-one').click();assert.equal(h.calls.requests.length,1);assert.deepEqual(h.calls.sounds,[{cue:'equip'}]);
  h.api.open('fire');h.item('fire-two').click();
  h.calls.requests[1].resolve({...confirmed,now:'2026-09-24T15:00:02.000100+08:00'});await flush();
  assert.deepEqual(h.calls.sounds,[{cue:'equip'}],'a response that does not confirm the requested outfit is silent');
});

test('keyboard context menu and explicit appearance controls choose parts without a shop transition and clamp the menu onscreen', () => {
  const h = harness(); h.api.render(snapshot());
  const target = h.node({slots: 'bar fx'});
  const key = h.fireDocument('keydown', target, {key: 'F10', shiftKey: true});
  assert.equal(key.prevented, true); assert.equal(h.menu.hidden, false);
  assert.equal(h.element('quick-skin-tabs').querySelectorAll('[data-quick-slot]').length, 2);
  h.api.close(); const button = h.node(); button.dataset.skinOpen = 'avatar'; button.click();
  assert.equal(h.menu.hidden, false); assert.ok(h.item('avatar-default'));
  h.api.open(['camp'], {x: 9999, y: 9999});
  assert.ok(parseInt(h.menu.style.left) + h.menu.offsetWidth <= 1000);
  assert.ok(parseInt(h.menu.style.top) + h.menu.offsetHeight <= 700);
  assert.equal(h.calls.requests.length, 0); assert.equal(h.calls.questRenders.length, 0);
});

test('keyboard End keeps its preview through scroll-induced mouseenter and mouseleave until the pointer actually moves', () => {
  const h = harness(); h.api.render(snapshot()); h.api.open(['bar']);
  h.item('bar-one').dispatch('mouseenter');
  h.fireDocument('keydown', h.document.activeElement, {key: 'End'});
  assert.equal(h.document.activeElement.dataset.quickItem, 'bar-two');
  assert.equal(h.latestPaint().bar, 'bar-two');
  // Keyboard focus can scroll the list under an unmoving pointer, causing
  // enter/leave events on different rows without the user changing input mode.
  h.item('bar-one').dispatch('mouseenter');
  h.item('bar-two').dispatch('mouseleave');
  assert.equal(h.latestPaint().bar, 'bar-two');
  assert.match(h.element('quick-skin-status').textContent, /bar two/);
  h.item('bar-one').dispatch('mousemove', {movementX: 1, movementY: 0});
  assert.equal(h.latestPaint().bar, 'bar-one', 'real pointer motion resumes hover preview');
  h.item('bar-one').dispatch('mouseleave');
  assert.equal(h.latestPaint().bar, 'bar-default');
  assert.equal(h.calls.requests.length, 0);
});

test('reopening a keyboard-used menu starts in pointer mode so the first hovered row previews normally', () => {
  const h = harness(); h.api.render(snapshot()); h.api.open(['camp']);
  h.fireDocument('keydown', h.document.activeElement, {key: 'End'});
  assert.equal(h.latestPaint().camp, 'camp-two');
  h.api.close(); h.api.open(['camp']);
  h.item('camp-one').dispatch('mouseenter');
  assert.equal(h.latestPaint().camp, 'camp-one');
  h.item('camp-one').dispatch('mouseleave');
  assert.equal(h.latestPaint().camp, 'camp-default');
  assert.equal(h.calls.requests.length, 0);
});

test('a confirmed equip releases controls before refresh finishes and a refresh failure never reports equip failure', async () => {
  const h = harness(), initial = snapshot(), refreshes = [];
  h.bridge.refresh = force => new Promise((resolve, reject) => {
    h.calls.refresh.push(force); refreshes.push({resolve, reject});
  });
  h.api.render(initial); h.api.open(['camp']); h.item('camp-one').click();
  const first = snapshot({now: '2026-09-24T15:00:01.000100+08:00', equipped: {...initial.equipped, camp: 'camp-one'}});
  h.calls.requests[0].resolve(first); await flush();
  assert.equal(refreshes.length, 1);
  assert.equal(h.latestPaint().camp, 'camp-one');
  assert.equal(h.menu.hidden, true);
  assert.deepEqual(h.calls.toasts.map(args => args[0]), ['外观已更新']);

  // A slow follow-up read must not keep the successful mutation's busy lock.
  h.api.open(['fire']);
  assert.equal(h.menu.hidden, false, 'another menu opens while the old refresh is pending');
  h.item('fire-one').click();
  assert.equal(h.calls.requests.length, 2, 'the next equip is allowed before refresh resolves');
  refreshes[0].reject(new Error('刷新连接断开')); await flush();
  assert.deepEqual(h.calls.toasts.map(args => args[0]), ['外观已更新']);
  assert.equal(h.latestPaint().camp, 'camp-one');
  assert.equal(h.latestPaint().fire, 'fire-one', 'the old refresh failure cannot cancel a newer pending preview');

  const second = snapshot({now: '2026-09-24T15:00:02.000100+08:00', equipped: {...first.equipped, fire: 'fire-one'}});
  h.calls.requests[1].resolve(second); await flush();
  assert.equal(refreshes.length, 2);
  refreshes[1].resolve(); await flush();
  assert.deepEqual(h.calls.toasts.map(args => args[0]), ['外观已更新', '外观已更新']);
  assert.equal(h.calls.questRenders.length, 2);
  assert.equal(h.latestPaint().camp, 'camp-one'); assert.equal(h.latestPaint().fire, 'fire-one');
  assert.equal(h.menu.hidden, true);
  assert.deepEqual(h.calls.sounds,[{cue:'equip'},{cue:'equip'}], 'refresh failure does not repeat the earlier successful equip cue');
});


test('camp world right-click recognizes both new slots and restores the rebuilt semantic station', () => {
  const h=harness(), initial=snapshot();
  initial.equipped.camptrail='trail-default';
  initial.catalog=initial.catalog.filter(i=>i.slot!=='camptrail').concat([
    {id:'trail-default',slot:'camptrail',name:'泥土归途',owned:true,coins:0,diamonds:0},
    {id:'trail-stone',slot:'camptrail',name:'青石步道',owned:true,coins:240,diamonds:0},
    {id:'trail-stars',slot:'camptrail',name:'星砂小径',owned:false,coins:0,diamonds:10},
  ]);
  h.api.render(initial);
  const room=h.node({id:'campfire-room'}), old=h.node({className:'camp-world-art',parent:room});
  const hotspot=h.node({slots:'camptrail',parent:old});hotspot.dataset.campPlace='trail';
  const close=h.node({id:'campfire-room-close',parent:room});
  h.context.FocusCampfireRoom={isOpen:()=>true};
  let replacement;
  h.context.FocusCampfire.previewEquipment=overrides=>{
    h.calls.campPreviews.push(copy(overrides));
    old.parentElement=null;room.children=[];
    replacement=h.node({slots:'camptrail',parent:room});replacement.dataset.campPlace='trail';
    room.append(close);
  };
  h.fireDocument('contextmenu',hotspot);
  assert.match(h.element('quick-skin-title').textContent,/营地小径/);
  assert.deepEqual(h.element('quick-skin-items').querySelectorAll('[data-quick-item]').map(x=>x.dataset.quickItem),['trail-default','trail-stone']);
  h.item('trail-stone').dispatch('mouseenter');
  assert.equal(h.calls.campPreviews.at(-1).camptrail,'trail-stone');
  h.api.close();
  assert.equal(h.document.activeElement,replacement);
  assert.equal(h.calls.requests.length,0);
  assert.equal(h.calls.paints.at(-1).camptrail,'trail-default');
  h.api.open('campmark');
  assert.match(h.element('quick-skin-title').textContent,/营地地标/);
});

function interfaceQuickHarness(){
  const h=harness();vm.runInContext(fs.readFileSync(require.resolve('../static/interface-themes.js'),'utf8'),h.context);
  const initial=snapshot();
  initial.equipped={...initial.equipped,interface:'interface-default',theme:'theme-two',island:'island-two'};
  initial.catalog.push(...['default','forest','tide','paper','unknown'].map(kind=>({id:'interface-'+kind,slot:'interface',name:'界面 '+kind,coins:kind==='default'?0:1200,diamonds:0,owned:kind!=='paper',equipped:kind==='default'})));
  h.api.render(initial);return {...h,initial};
}

test('interface right-click preview survives polling and Escape restores original theme and all old decor',()=>{
  const h=interfaceQuickHarness();const brand=h.node({slots:'interface'});
  h.fireDocument('contextmenu',brand);assert.match(h.element('quick-skin-title').textContent,/界面主题/);
  assert.deepEqual(h.element('quick-skin-items').querySelectorAll('[data-quick-item]').map(n=>n.dataset.quickItem),['interface-default','interface-forest','interface-tide']);
  h.item('interface-forest').dispatch('mouseenter');assert.equal(h.document.documentElement.dataset.interface,'interface-forest');
  h.api.render({...h.initial,now:'2026-09-24T15:00:02.000100+08:00'});assert.equal(h.document.documentElement.dataset.interface,'interface-forest');
  assert.equal(h.document.documentElement.dataset.theme,'theme-two');assert.equal(h.document.documentElement.dataset.island,'island-two');
  h.fireDocument('keydown',h.item('interface-forest'),{key:'Escape'});assert.equal(h.document.documentElement.dataset.interface,'interface-default');
  assert.equal(h.document.activeElement,brand);assert.equal(h.calls.requests.length,0);
});

test('interface quick equipment sends one equip and retains it after older snapshots',async()=>{
  const h=interfaceQuickHarness();h.api.open('interface');h.item('interface-tide').click();h.item('interface-tide').click();
  assert.equal(h.calls.requests.length,1);assert.equal(h.calls.requests[0].path,'/api/shop/equip');assert.deepEqual(h.calls.requests[0].body,{itemId:'interface-tide'});
  const result={...h.initial,now:'2026-09-24T15:00:02.000100+08:00',equipped:{...h.initial.equipped,interface:'interface-tide'}};
  h.calls.requests[0].resolve(result);await flush();h.api.render(h.initial);
  assert.equal(h.document.documentElement.dataset.interface,'interface-tide');assert.equal(h.menu.hidden,true);assert.equal(h.document.documentElement.dataset.theme,'theme-two');
});

test('interface quick preview on outside close and failed equip restores saved appearance',async()=>{
  const h=interfaceQuickHarness();h.api.open('interface');h.item('interface-forest').dispatch('mouseenter');
  h.fireDocument('pointerdown',h.document.body);assert.equal(h.document.documentElement.dataset.interface,'interface-default');
  h.api.open('interface');h.item('interface-forest').click();h.calls.requests[0].reject(new Error('network'));await flush();
  assert.equal(h.document.documentElement.dataset.interface,'interface-default');assert.equal(h.document.documentElement.dataset.island,'island-two');assert.equal(h.calls.sounds.length,0);
});


test('all redesigned bar thumbnails, hover previews and cancel use the same progress renderer',()=>{
  const h=harness(),ids=['default','mint','aurora','comet','tide','prism','koi','fox','whale','dragon'].map(v=>'bar-'+v),drawn=[];
  h.context.FocusProgressBars={has:id=>ids.includes(id),preview:id=>`<svg data-shared-bar="${id}"></svg>`,decorate(scope){assert.equal(scope,h.document);drawn.push(h.document.documentElement.dataset.bar);}};
  const initial=snapshot({catalog:ids.map(id=>({id,slot:'bar',name:id,owned:true,coins:0,diamonds:id==='bar-default'?0:25})),equipped:{...snapshot().equipped,bar:'bar-prism'}});
  h.api.render(initial);h.api.open(['bar']);assert.equal(h.api.previewBar(),null);
  for(const id of ids){assert.match(h.element('quick-skin-items').innerHTML,new RegExp(`data-shared-bar="${id}"`));h.item(id).dispatch('mouseenter');assert.equal(drawn.at(-1),id);assert.equal(h.api.previewBar(),id);h.item(id).dispatch('mouseleave');assert.equal(drawn.at(-1),'bar-prism');assert.equal(h.api.previewBar(),null);}
  h.item('bar-fox').dispatch('mouseenter');h.api.render({...initial,now:'2026-09-24T15:00:01.000100+08:00'});assert.equal(drawn.at(-1),'bar-fox');h.api.close();assert.equal(drawn.at(-1),'bar-prism');assert.equal(h.calls.requests.length,0);assert.equal(initial.equipped.bar,'bar-prism');
});
test('new premium bar quick equip is submitted once and failed requests restore the saved bar',async()=>{
  const h=harness(),drawn=[];h.context.FocusProgressBars={has:id=>['bar-default','bar-koi'].includes(id),preview:id=>`<svg data-shared-bar="${id}"></svg>`,decorate(){drawn.push(h.document.documentElement.dataset.bar);}};
  const initial=snapshot({catalog:[{id:'bar-default',slot:'bar',name:'初始',owned:true,coins:0,diamonds:0},{id:'bar-koi',slot:'bar',name:'锦鲤',owned:true,coins:0,diamonds:25}]});
  h.api.render(initial);h.api.open(['bar']);const target=h.item('bar-koi');target.dispatch('mouseenter');target.click();target.click();assert.equal(h.calls.requests.length,1);assert.deepEqual(h.calls.requests[0].body,{itemId:'bar-koi'});h.calls.requests[0].reject(new Error('offline'));await flush();assert.equal(drawn.at(-1),'bar-default');assert.equal(h.api.previewBar(),null);assert.deepEqual(initial.wallet,{coins:1234,diamonds:10});assert.equal(h.calls.sounds.length,0);
});
