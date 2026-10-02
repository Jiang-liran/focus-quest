const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const flush = () => new Promise(resolve => setImmediate(resolve));
const campSlots = ['camp', 'fire', 'tent', 'campgear', 'campglow', 'chatframe', 'camptrail', 'campmark'];
const otherSlots = ['bar', 'fx', 'avatar', 'banner', 'theme', 'companion', 'relic', 'portal'];
const defaults = Object.fromEntries([...otherSlots, ...campSlots].map(slot => [slot, `${slot}-default`]));
const source = name => fs.readFileSync(require.resolve(`../static/${name}`), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));

function catalog() {
  return [...otherSlots, ...campSlots].flatMap(slot => [
    {id: `${slot}-default`, slot, name: `${slot}初始`, description: `初始${slot}`, coins: 0, diamonds: 0, currency: 'free', owned: true, equipped: true},
    {id: `${slot}-one`, slot, name: `${slot}金币一`, description: `${slot}金币描述`, coins: 100, diamonds: 0, currency: 'coins', owned: false, equipped: false},
    {id: `${slot}-two`, slot, name: `${slot}金币二`, description: `${slot}金币描述二`, coins: 200, diamonds: 0, currency: 'coins', owned: false, equipped: false},
    {id: `${slot}-three`, slot, name: `${slot}钻石一`, description: `${slot}钻石描述`, coins: 0, diamonds: 2, currency: 'diamonds', owned: false, equipped: false},
    {id: `${slot}-four`, slot, name: `${slot}钻石二`, description: `${slot}钻石描述二`, coins: 0, diamonds: 4, currency: 'diamonds', owned: false, equipped: false},
  ]);
}
function state(patch = {}) {
  return {day: '2026-09-24', now: '2026-09-24T10:00:00.000100+08:00', wallet: {coins: 500, diamonds: 20},
    quests: [], catalog: catalog(), equipped: {...defaults}, history: [],
    exchange: {coinsPerDiamond: 75, maxDiamonds: 6, maxPerExchange: 1000, history: []}, ...patch};
}
function full(quests) {
  return {date: '2026-09-24', today: '2026-09-24', settings: {motion: false},
    advice: {id: 'pace', title: '留一点余地', text: '按自己的安排继续。'}, totals: {minutes: 60, target: 480}, quests};
}

function harness() {
  const elements = new Map(), all = [], calls = {requests: [], refresh: [], toasts: [], scene: [], preview: [], apply: []};
  const document = {activeElement: null};
  class Element {
    constructor(tag = 'div', id = '') {
      this.id = id; this.tagName = tag.toUpperCase(); this.dataset = {}; this.children = []; this.parent = null;
      this.attributes = {}; this.classes = new Set(); this.className = ''; this.listeners = new Map();
      this._html = ''; this._text = ''; this.htmlWrites = 0; this.open = false; this.hidden = false; this.disabled = false;
      this.value = id === 'exchange-amount' ? '1' : '';
      this.style = {values: {}, setProperty(name, value) { this.values[name] = value; }};
      this.classList = {toggle: (name, enabled) => { if (enabled ?? !this.classes.has(name)) this.classes.add(name); else this.classes.delete(name); },
        add: (...names) => names.forEach(name => this.classes.add(name)), remove: (...names) => names.forEach(name => this.classes.delete(name))};
      all.push(this);
    }
    get innerHTML() { return this._html; }
    set innerHTML(value) { this._html = String(value); this.htmlWrites++; this.replaceChildren(); }
    get textContent() { return this._text; }
    set textContent(value) { this._text = String(value); this.replaceChildren(); }
    replaceChildren() {
      if (this.children.some(child => child.contains(document.activeElement))) document.activeElement = null;
      this.children.forEach(child => { child.parent = null; }); this.children = [];
    }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name]; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(name, fn) { const handlers = this.listeners.get(name) || []; handlers.push(fn); this.listeners.set(name, handlers); }
    click() { return (this.listeners.get('click') || []).map(fn => fn({target: this})); }
    focus() { document.activeElement = this; }
    scrollIntoView(options) { this.scrolled = options; }
    showModal() { this.open = true; }
    close() { this.open = false; (this.listeners.get('close') || []).forEach(fn => fn({target: this})); }
    querySelector(selector) {
      for (const child of this.children) {
        if (selector.startsWith('.') && child.className.split(/\s+/).includes(selector.slice(1))) return child;
        const found = child.querySelector(selector); if (found) return found;
      }
      return null;
    }
  }
  const element = id => { if (!elements.has(id)) elements.set(id, new Element('div', id)); return elements.get(id); };
  const attributeDataset = attribute => attribute.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  document.documentElement = element('document-root');
  document.getElementById = element;
  document.createElement = tag => new Element(tag);
  document.querySelectorAll = selector => {
    if (selector === '.campfire-character') return element('campfire-characters').children;
    const match = selector.match(/^\[(data-[a-z-]+)\]$/);
    assert.ok(match, `unsupported selector ${selector}`);
    const key = attributeDataset(match[1]); return all.filter(node => key in node.dataset);
  };
  for (const name of ['all', ...otherSlots, ...campSlots]) element(`filter-${name}`).dataset.shopFilter = name;
  for (const name of ['coins', 'diamonds', 'owned']) element(`market-${name}`).dataset.shopMarket = name;
  for (const name of ['relax', 'story', 'advice']) element(`topic-${name}`).dataset.campfireTopic = name;
  const html = source('index.html');
  // Read the implemented group attribute and values, rather than baking a UI naming choice into this harness.
  for (const match of html.matchAll(/<button\b[^>]*\b(data-shop-(?!market\b|filter\b|action\b)[a-z-]+)="([^"]+)"[^>]*>/g)) {
    const [, attribute, value] = match;
    element(`group-${value}`).dataset[attributeDataset(attribute)] = value;
  }
  const normalize = equipped => Object.fromEntries(campSlots.map(slot => [slot, equipped?.[slot] || defaults[slot]]));
  const scene = equipped => { const normalized = normalize(equipped); calls.scene.push(copy(normalized)); return `<svg data-test-camp-scene='${JSON.stringify(normalized)}'></svg>`; };
  const preview = (id, equipped) => { calls.preview.push({id, equipped: copy(equipped || {})}); return `<svg data-test-camp-preview="${typeof id === 'string' ? id : id?.id}"></svg>`; };
  const bridge = {
    api(path, body) { return new Promise((resolve, reject) => calls.requests.push({path, body, resolve, reject})); },
    async refresh(force) { calls.refresh.push(force); },
    toast(...args) { calls.toasts.push(args); },
  };
  const sandbox = {document, crypto: require('node:crypto').webcrypto, matchMedia: () => ({matches: true}),
    localStorage: {getItem() { return null; }, setItem() {}},
    FocusCampfireShopArt: {normalize, scene, preview},
    FocusCampfireArt: {scene: () => '<svg data-test="original-camp"></svg>', avatar: (id, outfit) => `<svg data-test-character="${id}" data-outfit="${outfit}"></svg>`},
    QuestArt: {avatar: (role, outfit) => `<svg data-role="${role}" data-outfit="${outfit}"></svg>`},
    ShopArt: {preview: id => `<svg data-test-island-preview="${id}"></svg>`, apply: equipped => calls.apply.push(copy(equipped))},
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  for (const name of ['advice.js', 'campfire-dialogue.js', 'campfire.js', 'quests.js']) vm.runInContext(source(name), context);
  const fire = (id, dataset = {}) => {
    const target = {dataset, closest() { return this; }};
    return (element(id).listeners.get('click') || []).map(fn => fn({target}));
  };
  context.FocusQuests.init(bridge);
  return {shop: context.FocusQuests, camp: context.FocusCampfire, element, document, calls, fire, all, context,
    render(next) { context.FocusCampfire.render(full(next)); context.FocusQuests.render(next); },
  };
}

test('camp shop separates eight camp categories from journey goods across coins, diamonds and free owned defaults', () => {
  const h = harness(); h.render(state()); h.fire('group-camp');
  assert.equal(h.element('group-camp').attributes['aria-pressed'], 'true');
  for (const slot of campSlots) {
    assert.equal(h.element(`filter-${slot}`).hidden, false);
    assert.ok(h.element('shop-catalog').innerHTML.includes(`${slot}金币一`));
    assert.ok(!h.element('shop-catalog').innerHTML.includes(`${slot}钻石一`));
  }
  for (const slot of otherSlots) assert.equal(h.element(`filter-${slot}`).hidden, true);
  assert.match(h.element('shop-result-count').textContent, /16/);
  h.fire('filter-fire');
  assert.match(h.element('shop-result-count').textContent, /2/);
  assert.match(h.element('shop-catalog').innerHTML, /fire金币一/);
  assert.doesNotMatch(h.element('shop-catalog').innerHTML, /tent金币一/);
  h.fire('market-diamonds');
  assert.match(h.element('shop-result-count').textContent, /16/);
  assert.match(h.element('shop-catalog').innerHTML, /chatframe钻石一/);
  assert.doesNotMatch(h.element('shop-catalog').innerHTML, /金币一/);
  h.fire('market-owned');
  assert.match(h.element('shop-result-count').textContent, /8/);
  for (const slot of campSlots) assert.ok(h.element('shop-catalog').innerHTML.includes(`${slot}初始`));
  assert.doesNotMatch(h.element('shop-catalog').innerHTML, /bar初始/);
  h.fire('group-journey');
  assert.match(h.element('shop-result-count').textContent, /8/);
  assert.match(h.element('shop-catalog').innerHTML, /bar初始/);
  assert.doesNotMatch(h.element('shop-catalog').innerHTML, /camp初始/);
  h.fire('group-all');
  assert.match(h.element('shop-result-count').textContent, /16/);
  h.fire('market-coins');
  assert.match(h.element('shop-result-count').textContent, /32/);
  assert.equal(h.calls.requests.length, 0, 'browsing never creates purchases');
});

test('camp entry resets prior market/filter and loadout links choose the matching area in owned collection', () => {
  const h = harness(); h.render(state());
  h.fire('group-journey'); h.fire('market-owned'); h.fire('filter-avatar');
  h.shop.browseCamp();
  assert.equal(h.element('group-camp').attributes['aria-pressed'], 'true');
  assert.equal(h.element('market-coins').attributes['aria-pressed'], 'true');
  assert.equal(h.element('filter-all').attributes['aria-pressed'], 'true');
  assert.match(h.element('shop-result-count').textContent, /16/);
  h.fire('equipped-slots', {loadoutSlot: 'chatframe'});
  assert.equal(h.element('group-camp').attributes['aria-pressed'], 'true');
  assert.equal(h.element('market-owned').attributes['aria-pressed'], 'true');
  assert.equal(h.element('filter-chatframe').attributes['aria-pressed'], 'true');
  assert.match(h.element('shop-catalog').innerHTML, /chatframe初始/);
  assert.doesNotMatch(h.element('shop-catalog').innerHTML, /tent初始/);
  h.fire('equipped-slots', {loadoutSlot: 'avatar'});
  assert.equal(h.element('group-journey').attributes['aria-pressed'], 'true');
  assert.equal(h.element('market-owned').attributes['aria-pressed'], 'true');
  assert.equal(h.element('filter-avatar').attributes['aria-pressed'], 'true');
  assert.match(h.element('shop-catalog').innerHTML, /avatar初始/);
  assert.equal(h.calls.requests.length, 0);
});

test('each camp preview uses camp art without charging, applying an outfit or changing the live camp', () => {
  const h = harness(); const initial = state(); h.render(initial);
  const documentEquipment = {...h.document.documentElement.dataset};
  const scene = h.element('campfire-scene').innerHTML;
  const liveDraws = h.calls.scene.length, applies = h.calls.apply.length;
  for (const slot of campSlots) {
    const before = h.calls.preview.length;
    h.fire('shop-catalog', {shopAction: 'preview', item: `${slot}-one`});
    assert.equal(h.element('quest-action-dialog').open, true);
    assert.equal(h.element('quest-action-confirm').hidden, true);
    assert.equal(h.element('quest-action-dialog').classes.has('campfire-item-dialog'), true);
    assert.ok(h.calls.preview.length > before || /data-test-camp-scene/.test(h.element('quest-action-art').innerHTML), `${slot} uses camp rendering`);
    assert.match(h.element('quest-action-art').innerHTML, /campfire-full-preview/);
    assert.match(h.element('quest-action-art').innerHTML, /campfire-preview-line/);
    assert.equal(h.calls.scene.at(-1)[slot], `${slot}-one`, 'the full preview shows the proposed change');
    for (const other of campSlots.filter(candidate => candidate !== slot)) assert.equal(h.calls.scene.at(-1)[other], defaults[other]);
    assert.doesNotMatch(h.element('quest-action-art').innerHTML, /data-test-island-preview/);
    assert.match(h.element('quest-action-body').innerHTML, /不花费|不会扣除|不扣|不改变/);
    assert.equal(h.calls.requests.length, 0);
    assert.deepEqual(h.document.documentElement.dataset, documentEquipment);
    assert.equal(h.element('campfire-scene').innerHTML, scene);
    h.element('quest-action-dialog').close();
  }
  assert.equal(h.calls.apply.length, applies, 'previews never apply equipment');
  assert.equal(h.element('shop-coins').textContent, '500');
  assert.equal(h.element('shop-diamonds').textContent, '20');
  assert.ok(h.calls.scene.length >= liveDraws);
  assert.deepEqual(initial.equipped, defaults, 'preview must not mutate the snapshot supplied by the server');
  h.fire('shop-catalog', {shopAction: 'preview', item: 'bar-one'});
  assert.equal(h.element('quest-action-dialog').classes.has('campfire-item-dialog'), false, 'the next ordinary preview restores its normal dialog layout');
  assert.match(h.element('quest-action-art').innerHTML, /data-test-island-preview/);
});

test('camp renders cache normalized equipment and preserve conversation, nodes and focus through polling and decoration changes', () => {
  const h = harness(); const initial = state(); h.render(initial);
  h.camp.choose('wanderer','story');
  const conversationControl=h.element('campfire-next');conversationControl.focus();
  const dialogueNode=h.element('advice-text');
  const text = h.element('advice-text').textContent;
  const firstDraws = h.element('campfire-scene').htmlWrites;
  for (const now of ['2026-09-24T10:00:03.000100+08:00', '2026-09-24T10:00:06.000100+08:00']) h.render({...initial, now});
  assert.equal(h.element('campfire-scene').htmlWrites, firstDraws);
  for (let i = 0; i < campSlots.length; i++) {
    const slot = campSlots[i], now = `2026-09-24T10:00:${String(10 + i).padStart(2, '0')}.000100+08:00`;
    h.render({...initial, now, equipped: {...defaults, [slot]: `${slot}-one`}});
    assert.equal(h.element('advice-text').textContent, text);
    assert.equal(h.element('advice-card').dataset.chatframe,slot==='chatframe'?'chatframe-one':defaults.chatframe);
    assert.equal(h.document.activeElement, conversationControl);
    assert.equal(h.element('advice-text'),dialogueNode);
  }
  assert.ok(h.element('campfire-scene').htmlWrites > firstDraws);
  assert.equal(h.element('advice-card').dataset.chatframe, defaults.chatframe);
});

test('equip response updates the camp immediately and an older full app poll in the same millisecond cannot revert it', async () => {
  const h = harness();
  const initial = state();
  initial.catalog.find(item => item.id === 'camp-one').owned = true;
  h.render(initial);
  h.fire('shop-catalog', {shopAction: 'equip', item: 'camp-one'});
  assert.equal(h.calls.requests.length, 1);
  assert.equal(h.calls.requests[0].path, '/api/shop/equip');
  assert.deepEqual(copy(h.calls.requests[0].body), {itemId: 'camp-one'});
  const equipped = {...initial, now: '2026-09-24T10:00:00.000900+08:00', equipped: {...defaults, camp: 'camp-one'},
    catalog: initial.catalog.map(item => ({...item, equipped: item.slot === 'camp' ? item.id === 'camp-one' : item.equipped}))};
  h.calls.requests[0].resolve(equipped); await flush();
  assert.match(h.element('campfire-scene').innerHTML, /camp-one/, 'no full refresh response is required to show the outfit');
  assert.equal(h.document.documentElement.dataset.camp, 'camp-one');
  const draws = h.element('campfire-scene').htmlWrites;
  h.render({...initial, now: '2026-09-24T10:00:00.000500+08:00'});
  assert.match(h.element('campfire-scene').innerHTML, /camp-one/);
  assert.equal(h.document.documentElement.dataset.camp, 'camp-one');
  assert.equal(h.element('campfire-scene').htmlWrites, draws, 'the rejected old response cannot briefly repaint the old camp');
  const changedElsewhere = {...equipped, now: '2026-09-24T10:00:01.000100+08:00', equipped: {...defaults, camp: 'camp-two'}};
  h.render(changedElsewhere);
  assert.match(h.element('campfire-scene').innerHTML, /camp-two/, 'newer authoritative equipment still applies');
});

test('a purchase only adds the camp item to collection; equipping remains a separate action', async () => {
  const h = harness(); const initial = state(); h.render(initial);
  h.fire('shop-catalog', {shopAction: 'buy', item: 'tent-one'});
  assert.equal(h.calls.requests.length, 0);
  assert.equal(h.element('quest-action-confirm').hidden, false);
  const [first] = h.fire('quest-action-confirm');
  const [second] = h.fire('quest-action-confirm');
  assert.equal(h.calls.requests.length, 1);
  assert.equal(h.calls.requests[0].path, '/api/shop/buy');
  const bought = {...initial, now: '2026-09-24T10:00:01.000100+08:00', wallet: {coins: 400, diamonds: 20},
    catalog: initial.catalog.map(item => item.id === 'tent-one' ? {...item, owned: true} : item)};
  h.calls.requests[0].resolve(bought); await Promise.all([first, second]);
  assert.equal(h.element('shop-coins').textContent, '400');
  assert.equal(h.document.documentElement.dataset.tent, 'tent-default');
  assert.doesNotMatch(h.element('campfire-scene').innerHTML, /tent-one/);
  assert.equal(h.element('quest-action-dialog').open, false);
  assert.equal(h.calls.requests.length, 1);
});

test('live camp preview survives full app polling and cancelling restores the newest real decor without losing conversation', () => {
  const h = harness(); const initial = state(); h.render(initial);
  h.camp.choose('hearth','relax');
  const character = h.element('campfire-next'); character.focus();
  const dialogue = h.element('advice-text').textContent;
  h.camp.previewEquipment({camp: 'camp-one', chatframe: 'chatframe-one'});
  assert.match(h.element('campfire-scene').innerHTML, /camp-one/);
  assert.equal(h.element('advice-card').dataset.chatframe, 'chatframe-one');
  const updated = {...initial, now: '2026-09-24T10:00:01.000900+08:00',
    equipped: {...defaults, camp: 'camp-two', fire: 'fire-two', chatframe: 'chatframe-two'}};
  h.render(updated);
  assert.match(h.element('campfire-scene').innerHTML, /camp-one/);
  assert.match(h.element('campfire-scene').innerHTML, /fire-two/);
  assert.equal(h.element('advice-card').dataset.chatframe, 'chatframe-one');
  h.render({...initial, now: '2026-09-24T10:00:01.000100+08:00'});
  h.camp.previewEquipment(null);
  assert.match(h.element('campfire-scene').innerHTML, /camp-two/);
  assert.match(h.element('campfire-scene').innerHTML, /fire-two/);
  assert.equal(h.element('advice-card').dataset.chatframe, 'chatframe-two');
  assert.equal(h.element('advice-text').textContent, dialogue);
  assert.equal(h.document.activeElement, character);
  assert.equal(h.calls.requests.length, 0);
  assert.equal(initial.equipped.camp, 'camp-default');
  assert.equal(updated.equipped.camp, 'camp-two');
});


test('late-loaded world art renders the same preserved camp combination for preview and purchase confirmation', () => {
  const h=harness(), initial=state();
  initial.equipped={...defaults,camp:'camp-four',tent:'tent-two',campmark:'campmark-three',camptrail:'camptrail-two'};
  h.render(initial);
  const before=copy(initial.equipped), applies=h.calls.apply.length, worlds=[];
  h.context.FocusCampWorldArt={scene(equipment,options){worlds.push({equipment:copy(equipment),options:copy(options)});return '<svg class="camp-world-art" data-preview="world"></svg>';}};
  for(const action of ['preview','buy']){
    h.fire('shop-catalog',{shopAction:action,item:'camptrail-one'});
    assert.match(h.element('quest-action-art').innerHTML,/camp-world-art/);
    assert.match(h.element('quest-action-art').innerHTML,/campfire-preview-line/);
    assert.deepEqual(worlds.at(-1).equipment,Object.fromEntries(campSlots.map(slot=>[slot,slot==='camptrail'?'camptrail-one':initial.equipped[slot]])));
    assert.deepEqual(worlds.at(-1).options,{interactive:false});
    assert.equal(h.element('quest-action-dialog').classes.has('campfire-item-dialog'),true);
    h.element('quest-action-dialog').close();
  }
  assert.deepEqual(initial.equipped,before);
  assert.equal(h.calls.requests.length,0);
  assert.equal(h.calls.apply.length,applies);
});
