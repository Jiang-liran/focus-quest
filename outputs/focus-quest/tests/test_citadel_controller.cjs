const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));
const day = '2026-09-24';
const slots = ['theme', 'fx', 'avatar', 'companion', 'relic', 'portal'];
const placeIds = ['library', 'tea', 'observatory', 'atelier', 'arcade', 'station'];
const source = name => fs.readFileSync(require.resolve(`../static/${name}`), 'utf8');
function snapshot(minutes = 120, patch = {}) {
  const equipped = Object.fromEntries(slots.map(slot => [slot, `${slot}-default`]));
  return {date: day, today: day, settings: {motion: true, sound: true}, totals: {minutes, target: 480},
    subjects: [['math', 180, minutes], ['cs', 180, 0], ['politics', 60, 0], ['english', 60, 0]]
      .map(([id, target, minutes]) => ({id, target, minutes})),
    records: [{id: 'math-1', name: '数学听课', minutes, subject: 'math', day, end: `${day}T10:00:00+08:00`}],
    dayRecordCount: 1, quests: {now: `${day}T12:00:00.000100+08:00`, equipped,
      catalog: slots.flatMap(slot => ['default', 'one', 'two', 'locked'].map(variant => ({id: `${slot}-${variant}`, slot,
        name: `${slot} ${variant}`, owned: variant !== 'locked', coins: variant === 'default' ? 0 : 100, diamonds: 0})))}, ...patch};
}

function freshRecord(before, after, patch = {}) {
  return {id: 'new-focus', name: '数学做题', subject: 'math', source: 'tomatodo', day: after.date,
    minutes: after.totals.minutes - before.totals.minutes, end: `${day}T11:59:59+08:00`, ...patch};
}
function dailyEvents(stages, target = 480) {
  return stages.length ? [{type: 'daily', stage: Math.max(...stages), target, crossedStages: stages}] : [];
}

function harness({reducedMotion = false, appGuards = false, realExpedition = false, animatedSlide = false} = {}) {
  const elements = new Map(), documentListeners = new Map(), windowListeners = new Map(), timers = new Map(), frames = new Map(), callbacks = new Map();
  const animations = [];
  const calls = {trails: [], scenes: [], interiors: [], arcades: 0, reviews: 0, camps: 0, opened: 0, progress: [], leaves: 0, closed: 0, shops: 0, replays: 0, requests: [], refresh: 0, toasts: [], storageWrites: 0, sounds: [], ambienceScenes: [], ambienceMounts: [], lifeMounts: [], lifeUnmounts: 0, lotteryMounts: [], lotteryUnmounts: 0};
  const document = {activeElement: null, hidden: false};
  const mediaListeners = [];
  const media = {matches: reducedMotion, addEventListener(type, fn) { assert.equal(type, 'change'); mediaListeners.push(fn); }};
  const timeOrigin = Date.parse(`${day}T12:00:00+08:00`);
  let state = snapshot(), time = timeOrigin, timerId = 0, request;
  const camel = name => name.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const decode = text => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  class Element {
    constructor(tag = 'div', id = '') {
      this.id = id; this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null;
      this.attributes = {}; this.dataset = {}; this.listeners = new Map(); this.hidden = false; this.inert = false;
      this.disabled = false; this.open = false; this.className = ''; this._html = ''; this._text = ''; this.htmlWrites = 0;
      this.style = {setProperty(name, value) { this[name] = value; }}; this.classes = new Set();
      this.classList = {add: (...names) => names.forEach(name => this.classes.add(name)), remove: (...names) => names.forEach(name => this.classes.delete(name)),
        contains: name => this.classes.has(name), toggle: (name, force) => { if (force ?? !this.classes.has(name)) this.classes.add(name); else this.classes.delete(name); }};
    }
    get isConnected() { return this.id ? elements.get(this.id) === this : Boolean(this.parentElement?.isConnected); }
    get textContent() { return this._text; }
    set textContent(value) { this._text = String(value); }
    get innerHTML() { return this._html; }
    set innerHTML(value) {
      if (this.children.some(child => child.contains(document.activeElement))) document.activeElement = null;
      this.children.forEach(child => { child.parentElement = null; }); this.children = [];
      this._html = String(value); this.htmlWrites++;
      // Keep SVG descendants attached to their detached SVG root, as a real
      // innerHTML replacement does; quick-menu focus restoration relies on it.
      let parent = this;
      if (/<svg\b[^>]*class="citadel-art"/.test(this._html)) {
        parent = new Element('svg'); parent.className = 'citadel-art'; this.append(parent);
      }
      for (const match of this._html.matchAll(/<(button|g|p)\b([^>]*)>/g)) {
        if (match[1] === 'g' && !/data-city-place|data-city-trail|data-citadel-place|data-skin-slots|data-home-action|data-lottery-machine|data-city-npc|data-city-workstation/.test(match[2])) continue;
        const child = new Element(match[1]);
        for (const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)"|='([^']*)')?/g)) child.setAttribute(attr[1], decode(attr[2] ?? attr[3] ?? ''));
        parent.append(child);
      }
    }
    append(...nodes) { nodes.forEach(node => { node.parentElement = this; this.children.push(node); }); }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name.startsWith('data-')) this.dataset[camel(name)] = String(value);
      if (name === 'class') this.className = String(value);
      if (name === 'disabled') this.disabled = true;
    }
    getAttribute(name) { if (name === 'disabled') return this.disabled ? '' : null; if (name === 'hidden') return this.hidden ? '' : null; return this.attributes[name] ?? null; }
    hasAttribute(name) { return this.getAttribute(name) !== null; }
    removeAttribute(name) { delete this.attributes[name]; if (name.startsWith('data-')) delete this.dataset[camel(name)]; }
    matches(selector) {
      if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
      if (selector === 'dialog[open]') return this.tagName === 'DIALOG' && this.open;
      if (selector === 'button:not([disabled])' || selector === 'button:not(:disabled)') return this.tagName === 'BUTTON' && !this.disabled;
      if (selector === 'input:not([disabled])') return this.tagName === 'INPUT' && !this.disabled;
      if (selector === 'a[href]') return this.tagName === 'A' && this.hasAttribute('href');
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
      const attr = selector.match(/^\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
      if (attr) return this.hasAttribute(attr[1]) && (attr[2] === undefined || this.getAttribute(attr[1]) === attr[2]);
      return this.tagName.toLowerCase() === selector;
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
    focus() {
      const previous = document.activeElement; if (previous === this) return;
      document.activeElement = this;
      if (previous) emit(previous, 'blur'); emit(this, 'focus');
    }
    click(patch = {}) { if (!this.disabled) return emit(this, 'click', patch); }
    getBoundingClientRect() { return {left: 20, top: 20, right: 320, bottom: 400, width: 1000, height: 600}; }
    getClientRects() { return this.closest('[hidden]') ? [] : [this.getBoundingClientRect()]; }
    setPointerCapture() {}
  }
  if(animatedSlide)Element.prototype.animate=function(keyframes,options){
    let resolve,reject;const finished=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const animation={node:this,keyframes:copy(keyframes),options:copy(options),finished,cancelled:false,
      finish(){resolve();},cancel(){this.cancelled=true;reject(new Error('Cancelled animation'));}};
    animations.push(animation);return animation;
  };
  const buttons = new Set(['citadel-enter', 'citadel-close', 'citadel-shop', 'citadel-replay', 'citadel-interact', 'citadel-overview',
    'citadel-zoom-in', 'citadel-zoom-out', 'citadel-preview-toggle', 'citadel-demo', 'quick-skin-close']);
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element(buttons.has(id) ? 'button' : id.endsWith('range') ? 'input' : id.endsWith('dialog') ? 'dialog' : 'div', id));
    return elements.get(id);
  };
  document.getElementById = element; document.documentElement = element('html'); document.body = element('body');
  const main = element('main'), sidebar = element('sidebar'); sidebar.className = 'sidebar';
  document.body.append(main, sidebar, element('citadel-view'), element('quick-skins')); element('citadel-view').hidden = true; element('quick-skins').hidden = true;
  main.append(element('citadel-enter'), element('quest-scene')); element('quest-scene').className = 'quest-scene';
  element('quest-scene').setAttribute('data-skin-slots', 'theme fx companion relic portal avatar');
  for (const id of buttons) if (id.startsWith('citadel-') && id !== 'citadel-enter') element('citadel-view').append(element(id));
  for (const id of ['city-street', 'city-room']) element('citadel-view').append(element(id));
  for (const id of ['citadel-stage', 'citadel-locations']) element('city-street').append(element(id));
  for (const id of ['city-interior-art', 'city-room-content', 'city-room-welcome']) element('city-room').append(element(id));
  element('city-room').hidden=true;
  element('citadel-view').append(element('city-talk')); element('city-talk').hidden=true;
  element('citadel-stage').append(element('citadel-camera')); element('citadel-camera').append(element('citadel-scene'));
  element('citadel-preview-controls').append(element('citadel-preview-range')); element('citadel-preview-controls').hidden = true;
  element('quick-skins').append(element('quick-skin-close'), element('quick-skin-tabs'), element('quick-skin-items'));
  document.querySelectorAll = selector => selector === 'body > main' ? [main] : selector === 'body > main, body > .sidebar' ? [main, sidebar] : document.body.querySelectorAll(selector);
  document.querySelector = selector => selector === 'dialog[open]' ? [...elements.values()].find(node => node.matches(selector)) || null : document.body.querySelector(selector);
  document.addEventListener = (type, fn, capture = false) => {
    const list = documentListeners.get(type) || []; list.push({fn, capture: capture === true}); documentListeners.set(type, list);
  };
  function emit(target, type, patch = {}) {
    const event = {type, target, currentTarget: target, button: 0, ctrlKey: false, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...patch};
    const list = documentListeners.get(type) || [];
    for (const {fn, capture} of list) if (capture && !event.stopped) fn(event);
    for (let node = target; node && !event.stopped; node = node.parentElement) {
      event.currentTarget = node; for (const fn of node.listeners.get(type) || []) if (!event.stopped) fn(event);
    }
    for (const {fn, capture} of list) if (!capture && !event.stopped) fn(event);
    return event;
  }
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return time; } }
  const context = vm.createContext({document, Date: Clock, performance: {now: () => time - timeOrigin}, innerWidth: 1400, innerHeight: 1000, matchMedia: () => media, testCalls: calls,
    addEventListener(type, fn) { windowListeners.set(type, fn); },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, {fn, delay, due: time + delay}); callbacks.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { const id = ++timerId; frames.set(id, {fn, due: time + 16}); callbacks.set(id, () => fn(time - timeOrigin)); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    fetch() { throw new Error('Citadel must not request or mutate server data'); },
    localStorage: {getItem() { throw new Error('Citadel must not read reward storage'); }, setItem() { if (appGuards) { calls.storageWrites++; return; } throw new Error('Citadel must not write reward storage'); }},
    ShopArt: {apply() {}, preview(id) { return `<svg data-preview="${id}"></svg>`; }},
    FocusExpeditionArt: {world() { return '<svg></svg>'; }},
    FocusRainCityArt: {scene(model, equipment, options) { calls.scenes.push(copy({model, equipment, options}));
      return `<svg class="citadel-art">${options.interactive ? placeIds.map((id, i) => `<g data-city-place="${id}" data-citadel-place="${id}" data-skin-slots="${slots[i]}" tabindex="0" role="button"></g>`).join('')+'<g data-city-trail="open" tabindex="0" role="button"></g>'+['yanqing','ayu','qideng'].map(id=>`<g data-city-npc="${id}" data-city-walker="${id}" data-talking="false" tabindex="0" role="button"></g>`).join('') : ''}</svg>`; },
      interior(id,model,equipment,options){calls.interiors.push(copy({id,model,equipment,options}));const npc=context.FocusCityResidents.roomResident(id,options.mode),workstations={library:['desk','shelf'],tea:['tea','tea-window'],atelier:['wardrobe','outfits'],station:['plan','camp'],arcade:['games'],observatory:options.mode==='home'?['home-light']:options.mode==='panorama'?[]:['sky']}[id]||[];return `<svg class="rain-city-interior" data-room="${id}">${options.interactive&&npc?`<g data-city-npc="${npc}" tabindex="0" role="button"></g>`:''}${options.interactive?workstations.map(key=>`<g data-city-workstation="${key}" tabindex="0" role="button"></g>`).join(''):''}${id==='observatory'&&options.mode==='home'&&options.interactive?'<g role="button" tabindex="0" data-home-action="window"></g><g role="button" tabindex="0" data-home-action="rooftop"></g>':''}${id==='arcade'&&options.interactive?'<g role="button" tabindex="0" data-lottery-machine="coin" aria-controls="city-lottery-pane"></g><g role="button" tabindex="0" data-lottery-machine="diamond" aria-controls="city-lottery-pane"></g>':''}</svg>`;}},
    FocusAmbience:{setScene(id){calls.ambienceScenes.push(id);},mount(node,id){calls.ambienceMounts.push({id,node:node?.id});}},
    FocusCityLife:{mount(id,node,state){calls.lifeMounts.push({id,node,date:state.date});},unmount(){calls.lifeUnmounts++;}},
    FocusLottery:{mount(id,node,state){calls.lotteryMounts.push({id,node,date:state.date,wallet:copy(state.quests?.wallet)});},unmount(){calls.lotteryUnmounts++;}},
  });
  for (const name of ['city-residents.js', 'expedition-model.js', 'citadel-route.js', ...(realExpedition ? ['expedition.js'] : []), 'quick-skins.js', 'citadel.js']) vm.runInContext(source(name), context);
  const api = context.FocusCitadel, quick = context.FocusQuickSkins, run = code => vm.runInContext(code, context);
  const expedition = context.FocusExpedition;
  quick.init({api(path, body) { calls.requests.push({path, body}); return new Promise((resolve, reject) => { request = {resolve, reject}; }); },
    refresh: async () => { calls.refresh++; }, toast: (...args) => calls.toasts.push(args)});
  if (expedition) expedition.init({renderHero() {}, stopPreview() {}, isHome: () => true});
  api.init({openTrail: anchor => {calls.trails.push(anchor);},getState: () => state, leaveExpedition: () => { calls.leaves++; expedition?.stop(); }, afterClose: () => { calls.closed++; },
    onOpen:()=>{calls.opened++;},openArcade:()=>{calls.arcades++;},openReview:()=>{calls.reviews++;},openCamp:()=>{calls.camps++;},openShop: () => { calls.shops++; }, replayDay: () => { calls.replays++; },
    playSound(cue, options = {}) { calls.sounds.push({cue, ...copy(options)}); }});
  if (appGuards) {
    vm.runInContext(source('effects.js'), context);
    vm.runInContext(source('app.js').split("\ndocument.querySelectorAll('[data-view]')")[0], context);
  }
  return {api, quick, expedition, residents:context.FocusCityResidents, calls, document, main, sidebar, element, emit, media, timers, frames, animations, run,
    render(next) { state = next; quick.render(next.quests); expedition?.render(next); api.render(next); },
    select(id) { const button = element('citadel-locations').querySelector(`[data-city-select="${id}"]`); assert.ok(button); button.click(); },
    hotspot(id) { const node = element('citadel-scene').querySelector(`[data-city-place="${id}"]`); assert.ok(node); return node; },
    item(id) { const node = element('quick-skin-items').querySelector(`[data-quick-item="${id}"]`); assert.ok(node, id); return node; },
    last: () => calls.scenes.at(-1),
    displayed: () => calls.progress.at(-1),
    awakenings: () => [...new Map(calls.scenes.filter(scene => scene.options.awakening).map(scene => [scene.options.awakening.token, scene.options.awakening.stage])).values()],
    tick() { const [id, timer] = [...timers].sort((a, b) => a[1].due - b[1].due)[0]; timers.delete(id); time = Math.max(time, timer.due); timer.fn(); },
    advance(ms) {
      const end = time + ms;
      for (let count = 0; ; count++) {
        const pending = [...timers].map(([id, timer]) => ({id, ...timer, kind: 'timer'}))
          .concat([...frames].map(([id, frame]) => ({id, ...frame, kind: 'frame'})))
          .filter(item => item.due <= end).sort((a, b) => a.due - b.due || a.id - b.id);
        if (!pending.length) break;
        assert.ok(count < 100000, 'animation scheduler must eventually settle');
        const item = pending[0]; time = Math.max(time, item.due);
        (item.kind === 'timer' ? timers : frames).delete(item.id);
        item.fn(...(item.kind === 'frame' ? [time - timeOrigin] : []));
      }
      time = end;
    },
    frame(ms = 16) { time += ms; const queued = [...frames.values()]; frames.clear(); queued.forEach(frame => frame.fn(time - timeOrigin)); },
    stale(id) { assert.ok(callbacks.has(id)); callbacks.get(id)(); },
    setReduced(value) { media.matches = value; mediaListeners.forEach(fn => fn({matches: value})); },
    resolve(value) { assert.ok(request); request.resolve(value); }, reject(error) { assert.ok(request); request.reject(error); },
    setState(next) { state = next; },
    primeApp(before, claims = []) {
      context.testBefore = before; context.testClaims = claims;
      run(`state=testBefore; baselineReady=true; seenRecords=new Set(state.records.map(record=>record.id));
        claimedEffects=new Set(testClaims); celebrationQueue=[]; toast=(...args)=>testCalls.toasts.push(args);`);
    },
    checkApp(next, quiet = false) { context.testNext = next; run(`checkNewRecords(testNext,${quiet}); state=testNext;`); },
  };
}


test('homepage island and explicit entry open the rain city without stealing camp, gifts or context menus',()=>{
  const h=harness();h.render(snapshot());
  h.element('quest-scene').click({ctrlKey:true});h.element('quest-scene').click({button:2});assert.equal(h.api.isOpen(),false);
  const camp=h.element('campfire-room-open'),gift=h.element('gift');gift.setAttribute('data-island-gift','main');h.element('quest-scene').append(camp,gift);
  camp.click();gift.click();assert.equal(h.api.isOpen(),false);
  h.element('quest-scene').click();assert.equal(h.api.isOpen(),true);assert.equal(h.calls.opened,1);assert.equal(h.calls.leaves,1);
  assert.equal(h.api.open(),false);assert.equal(h.calls.opened,1);
  h.api.close();h.element('citadel-enter').click();assert.equal(h.calls.opened,2);
});

test('city opens and closes immediately without page animations while restoring focus and inert ownership',()=>{
  const h=harness({animatedSlide:true});h.render(snapshot());h.element('citadel-enter').focus();h.api.open(h.element('citadel-enter'));
  assert.equal(h.api.isOpen(),true);assert.equal(h.animations.length,0);
  assert.equal(h.main.inert,true);assert.equal(h.sidebar.inert,false);
  assert.equal(h.document.activeElement,h.element('citadel-close'));
  assert.equal(h.document.documentElement.classList.contains('has-citadel-view'),true);
  h.api.close();assert.equal(h.api.isOpen(),false);assert.equal(h.main.inert,false);
  assert.equal(h.animations.length,0);assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);
  assert.equal(h.document.documentElement.classList.contains('has-citadel-view'),false);
  assert.equal(h.document.activeElement,h.element('citadel-enter'));assert.equal(h.calls.closed,1);
});

test('reduced motion enters and leaves without animation and preserves preexisting inert values',()=>{
  const h=harness({animatedSlide:true,reducedMotion:true});h.render(snapshot());h.main.inert=true;h.api.open();h.api.close();
  assert.equal(h.animations.length,0);assert.equal(h.main.inert,true);assert.equal(h.sidebar.inert,false);assert.equal(h.element('citadel-view').dataset.motion,'false');
});

test('rapid sidebar navigation closes synchronously and can reopen without pending transitions',()=>{
  const h=harness({animatedSlide:true});h.render(snapshot());
  for(let i=0;i<10;i++){
    h.api.open();assert.equal(h.api.isOpen(),true);h.api.close(false);
    assert.equal(h.api.isOpen(),false);assert.equal(h.main.inert,false);assert.equal(h.sidebar.inert,false);
  }
  assert.equal(h.calls.closed,10);assert.equal(h.animations.length,0);assert.equal(h.timers.size,0);
  h.api.open();assert.equal(h.api.isOpen(),true);assert.equal(h.main.inert,true);
});

test('newly opened rooms are available with zero study and no targets; no milestone gate remains',()=>{
  const h=harness();h.render(snapshot(0,{totals:{minutes:0,target:0}}));h.api.open();
  for(const id of placeIds){assert.equal(h.api.openPlace(id),true);assert.equal(h.calls.interiors.at(-1).id,id);assert.equal(h.element('city-street').hidden,true);assert.equal(h.element('city-room').hidden,false);assert.equal(h.api.backToStreet(),true);}
  assert.equal(h.calls.requests.length,0);assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);assert.deepEqual(h.calls.sounds,[]);
});

test('click and Enter/Space on actual buildings switch to a complete room scene and return to the selected building',()=>{
  const h=harness();h.render(snapshot());h.api.open();
  for(const event of ['click','Enter',' ']){
    const building=h.hotspot('tea');if(event==='click')building.click();else h.emit(building,'keydown',{key:event});
    assert.equal(h.calls.interiors.at(-1).id,'tea');assert.ok(h.element('city-interior-art').innerHTML.includes('data-room="tea"'));
    assert.equal(h.element('city-street').hidden,true);assert.equal(h.document.activeElement,h.element('citadel-close'));
    h.element('citadel-close').click();assert.equal(h.api.isOpen(),true);assert.equal(h.element('city-street').hidden,false);assert.equal(h.document.activeElement,building);
  }
});

test('Escape leaves room before city, but a nested quick-skin menu retains first Escape',()=>{
  const h=harness();h.render(snapshot());h.api.open();h.api.openPlace('tea');
  h.element('quick-skins').hidden=false;const menu=h.emit(h.element('quick-skin-close'),'keydown',{key:'Escape'});assert.equal(h.element('city-room').hidden,false);assert.equal(h.api.isOpen(),true);
  h.element('quick-skins').hidden=true;h.emit(h.element('citadel-close'),'keydown',{key:'Escape'});assert.equal(h.element('city-room').hidden,true);assert.equal(h.api.isOpen(),true);
  h.emit(h.element('citadel-close'),'keydown',{key:'Escape'});assert.equal(h.api.isOpen(),false);
});

test('open dialog blocks entering and room keyboard navigation, and unknown buildings are rejected',()=>{
  const h=harness();h.render(snapshot());h.element('test-dialog').open=true;assert.equal(h.api.open(),false);
  h.element('test-dialog').open=false;h.api.open();assert.equal(h.api.openPlace('missing'),false);
  h.element('test-dialog').open=true;assert.equal(h.api.openPlace('tea'),false);h.emit(h.element('citadel-close'),'keydown',{key:'Escape'});assert.equal(h.api.isOpen(),true);
});

test('arcade room opens existing games only on explicit entry, without spending a ticket or awarding anything',()=>{
  const h=harness();const s=snapshot();s.arcade={available:3,active:null};h.render(s);h.api.open();h.api.openPlace('arcade');h.api.openService('games');
  assert.equal(h.calls.arcades,0);assert.match(h.element('city-room-content').innerHTML,/3 张累计游玩券/);
  const initial=JSON.stringify(s);h.element('city-room-content').querySelector('[data-city-action="arcade"]').click();
  assert.equal(h.calls.arcades,1);assert.equal(h.api.isOpen(),false);assert.equal(h.main.inert,false);assert.equal(JSON.stringify(s),initial);assert.equal(h.calls.requests.length,0);
});

test('arcade room reports a retained active game without altering its state',()=>{
  const h=harness();const s=snapshot();s.arcade={available:1,active:{id:'retained-board',type:'minesweeper'}};h.render(s);h.api.open();h.api.openPlace('arcade');h.api.openService('games');
  assert.match(h.element('city-room-content').innerHTML,/继续未结束的游戏/);h.api.backToStreet();h.api.openPlace('arcade');assert.equal(s.arcade.active.id,'retained-board');assert.equal(h.calls.requests.length,0);
});

test('arcade cabinet hotspot opens exactly its ticket machine, then returns through lobby and street',()=>{
  const h=harness(),s=snapshot();s.arcade={available:4,active:null};h.render(s);assert.equal(h.api.openMachine('coin'),false);h.api.open();assert.equal(h.api.openMachine('coin'),false);h.api.openPlace('arcade');
  const art=h.element('city-interior-art'),coin=art.querySelector('[data-lottery-machine="coin"]'),diamond=art.querySelector('[data-lottery-machine="diamond"]');assert.ok(coin);assert.ok(diamond);assert.equal(art.querySelectorAll('[data-lottery-machine]').length,2);
  assert.equal(art.getAttribute('aria-hidden'),'false');assert.equal(h.calls.lotteryMounts.length,0);coin.click();
  assert.equal(h.element('citadel-view').dataset.lottery,'coin');assert.equal(h.element('citadel-title').textContent,'金币抽奖机');assert.equal(h.element('citadel-close').textContent,'← 返回游乐场');assert.equal(art.hidden,true);assert.equal(art.getAttribute('aria-hidden'),'true');
  assert.equal(h.calls.lotteryMounts.at(-1).id,'coin');assert.equal(h.calls.lotteryMounts.at(-1).node,h.element('city-lottery-pane'));assert.match(h.element('city-room-content').innerHTML,/id="city-lottery-pane"/);assert.equal(h.element('city-room').hidden,false);assert.equal(h.calls.arcades,0);
  const unmounts=h.calls.lotteryUnmounts;h.element('citadel-close').click();assert.ok(h.calls.lotteryUnmounts>unmounts);assert.equal(h.element('citadel-view').dataset.lottery,'');assert.equal(h.element('city-room').hidden,false);assert.equal(art.hidden,false);assert.equal(h.document.activeElement,coin);
  assert.equal(h.element('city-room-content').hidden,true);assert.match(h.element('city-room-welcome').innerHTML,/看看游戏/);assert.equal(h.element('citadel-close').textContent,'← 返回街道');h.element('citadel-close').click();assert.equal(h.element('city-street').hidden,false);assert.equal(h.document.activeElement,h.hotspot('arcade'));assert.equal(h.api.isOpen(),true);
  h.element('citadel-close').click();assert.equal(h.api.isOpen(),false);assert.equal(h.main.inert,false);assert.equal(h.calls.requests.length,0);assert.equal(h.calls.arcades,0);assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);
});

test('both cabinet Enter and Space actions have layered Escape navigation and release lottery on departure',()=>{
  const h=harness();h.render(snapshot());h.api.open();h.api.openPlace('arcade');
  for(const [kind,key] of [['coin','Enter'],['diamond',' ']]){
    const node=h.element('city-interior-art').querySelector(`[data-lottery-machine="${kind}"]`);const before=h.calls.lotteryMounts.length,e=h.emit(node,'keydown',{key});assert.equal(e.defaultPrevented,true);assert.equal(h.calls.lotteryMounts.length,before+1);assert.equal(h.calls.lotteryMounts.at(-1).id,kind);
    const unmounts=h.calls.lotteryUnmounts;h.emit(h.element('citadel-close'),'keydown',{key:'Escape'});assert.equal(h.api.isOpen(),true);assert.equal(h.element('city-room').hidden,false);assert.equal(h.element('citadel-view').dataset.lottery,'');assert.equal(h.document.activeElement,node);assert.ok(h.calls.lotteryUnmounts>unmounts);
  }
  h.emit(h.element('citadel-close'),'keydown',{key:'Escape'});assert.equal(h.element('city-room').hidden,true);assert.equal(h.api.isOpen(),true);h.emit(h.element('citadel-close'),'keydown',{key:'Escape'});assert.equal(h.api.isOpen(),false);
});

test('cabinet modifiers, repeated keys, unknown machine IDs and open dialogs cannot launch lottery',()=>{
  const h=harness();h.render(snapshot());h.api.open();h.api.openPlace('arcade');const coin=h.element('city-interior-art').querySelector('[data-lottery-machine="coin"]');
  for(const patch of [{button:1},{button:2},{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true}])coin.click(patch);
  h.emit(coin,'keydown',{key:'Enter',repeat:true});h.emit(coin,'keydown',{key:'x'});assert.equal(h.calls.lotteryMounts.length,0);assert.equal(h.api.openMachine('unknown'),false);
  h.element('test-dialog').open=true;assert.equal(h.api.openMachine('diamond'),false);coin.click();assert.equal(h.calls.lotteryMounts.length,0);h.element('test-dialog').open=false;
  h.api.openPlace('library');assert.equal(h.api.openMachine('coin'),false);assert.equal(h.calls.lotteryMounts.length,0);
});

test('lottery parent pane survives polls, history navigation and equipment refreshes without recreation or unmount',()=>{
  const h=harness(),s=snapshot();s.quests.wallet={coins:800,diamonds:20};h.render(s);h.api.open();h.api.openPlace('arcade');h.api.openMachine('diamond');
  const content=h.element('city-room-content'),pane=h.element('city-lottery-pane'),writes=content.htmlWrites,unmounts=h.calls.lotteryUnmounts,interiors=h.calls.interiors.length;
  for(let i=0;i<20;i++)h.render(copy(s));assert.equal(content.htmlWrites,writes);assert.equal(h.calls.lotteryUnmounts,unmounts);assert.equal(h.calls.interiors.length,interiors);assert.equal(h.calls.lotteryMounts.at(-1).node,pane);
  const history=snapshot(240,{date:'2026-09-19'});history.quests.wallet={coins:1000,diamonds:22};h.render(history);assert.equal(content.htmlWrites,writes);assert.equal(h.calls.lotteryMounts.at(-1).date,'2026-09-19');assert.deepEqual(h.calls.lotteryMounts.at(-1).wallet,{coins:1000,diamonds:22});assert.equal(h.calls.lotteryUnmounts,unmounts);
  const changed=copy(history);changed.quests.equipped.theme='theme-one';changed.quests.now=`${day}T12:00:00.000300+08:00`;h.render(changed);assert.equal(content.htmlWrites,writes);assert.equal(h.calls.lotteryUnmounts,unmounts);assert.equal(h.calls.lotteryMounts.at(-1).node,pane);assert.equal(h.element('city-interior-art').hidden,true);
});

test('switching cabinet or building and closing the city unmount the previous lottery without routing into games',()=>{
  const h=harness();h.render(snapshot());h.api.open();h.api.openPlace('arcade');h.api.openMachine('coin');let unmounts=h.calls.lotteryUnmounts;
  h.api.openMachine('diamond');assert.ok(h.calls.lotteryUnmounts>unmounts);assert.equal(h.calls.lotteryMounts.at(-1).id,'diamond');unmounts=h.calls.lotteryUnmounts;
  h.api.openPlace('tea');assert.ok(h.calls.lotteryUnmounts>unmounts);assert.equal(h.element('citadel-view').dataset.lottery,'');assert.equal(h.element('city-interior-art').hidden,false);assert.equal(h.element('city-room-content').hidden,true);h.api.openService('tea');assert.equal(h.calls.lifeMounts.at(-1).id,'tea');
  h.api.openPlace('arcade');h.api.openMachine('coin');unmounts=h.calls.lotteryUnmounts;h.api.close(false);assert.ok(h.calls.lotteryUnmounts>unmounts);assert.equal(h.calls.arcades,0);assert.equal(h.calls.requests.length,0);
});

test('library mounts private notes without importing study task names and keeps optional review access',()=>{
  const h=harness(),s=snapshot(125.5);s.records=[{id:'1',day,minutes:45.5,name:'<数学>&',end:day+'T12:00:00'}];
  const before=JSON.stringify(s);h.render(s);h.api.open();h.api.openPlace('library');h.api.openService('desk');const html=h.element('city-room-content').innerHTML;
  assert.match(html,/私人的纸页/);assert.match(html,/id="city-life-pane"/);assert.doesNotMatch(html,/&lt;数学&gt;|<数学>/);
  assert.equal(h.calls.lifeMounts.at(-1).id,'library');assert.equal(h.calls.lifeMounts.at(-1).node,h.element('city-life-pane'));
  assert.equal(JSON.stringify(s),before);
  h.element('city-room-content').querySelector('[data-city-action="review"]').click();assert.equal(h.calls.reviews,1);assert.equal(h.api.isOpen(),false);
});

test('tea updates chat and window lighting in place without restarting its mounted rest timer',()=>{
  const h=harness();h.render(snapshot());h.api.open();h.api.openPlace('tea');h.api.openService('tea');const room=h.element('city-room-content'),writes=room.htmlWrites,unmounts=h.calls.lifeUnmounts;
  const before=h.element('city-tea-line').textContent;
  room.querySelector('[data-city-action="tea-chat"]').click();assert.notEqual(h.element('city-tea-line').textContent,before);
  room.querySelector('[data-city-action="tea-window"]').click();assert.equal(h.calls.interiors.at(-1).options.mode,'lamplight');
  room.querySelector('[data-city-action="tea-window"]').click();assert.equal(h.calls.interiors.at(-1).options.mode,'rain');
  assert.equal(room.htmlWrites,writes);assert.equal(h.calls.lifeUnmounts,unmounts);
  assert.equal(h.calls.lifeMounts.at(-1).id,'tea');
  assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);assert.equal(h.calls.requests.length,0);assert.deepEqual(h.calls.sounds,[]);
});

test('home leads to the former rooftop and remembers stars when revisiting it',()=>{
  const h=harness();h.render(snapshot());h.api.open();h.api.openPlace('observatory');
  assert.equal(h.calls.interiors.at(-1).options.mode,'home');
  assert.equal(h.element('citadel-title').textContent,'我的家');
  const room=h.element('city-room-welcome');
  room.querySelector('[data-city-action="home-rooftop"]').click();
  assert.equal(h.calls.interiors.at(-1).options.mode,'rain');
  assert.equal(h.element('citadel-title').textContent,'屋顶天台');
  h.element('city-interior-art').querySelector('[data-city-workstation="sky"]').click();assert.equal(h.calls.interiors.at(-1).options.mode,'stars');
  h.api.backToStreet();assert.equal(h.calls.interiors.at(-1).options.mode,'home');
  room.querySelector('[data-city-action="home-rooftop"]').click();assert.equal(h.calls.interiors.at(-1).options.mode,'stars');
  h.api.backToStreet();h.api.backToStreet();h.api.openPlace('observatory');
  assert.equal(h.calls.interiors.at(-1).options.mode,'home');
  room.querySelector('[data-city-action="home-rooftop"]').click();assert.equal(h.calls.interiors.at(-1).options.mode,'stars');
  assert.equal(h.timers.size,0);assert.equal(h.calls.requests.length,0);
});

test('home window and rooftop scene hotspots work with click and keyboard, with layered Escape navigation',()=>{
  const h=harness();h.render(snapshot());h.api.open();h.api.openPlace('observatory');
  assert.equal(h.element('city-interior-art').getAttribute('aria-hidden'),'false');
  for(const event of ['click','Enter',' ']){
    const window=h.element('city-interior-art').querySelector('[data-home-action="window"]');assert.ok(window);
    if(event==='click')window.click();else {const e=h.emit(window,'keydown',{key:event});assert.equal(e.defaultPrevented,true);}
    assert.equal(h.calls.interiors.at(-1).options.mode,'panorama');
    assert.equal(h.element('citadel-view').dataset.homeView,'panorama');
    assert.equal(h.element('citadel-title').textContent,'窗边夜景');
    assert.equal(h.document.activeElement,h.element('citadel-close'));
    h.emit(h.element('citadel-close'),'keydown',{key:'Escape'});
    assert.equal(h.calls.interiors.at(-1).options.mode,'home');assert.equal(h.api.isOpen(),true);
  }
  const door=h.element('city-interior-art').querySelector('[data-home-action="rooftop"]');
  h.emit(door,'keydown',{key:'Enter'});assert.equal(h.calls.interiors.at(-1).options.mode,'rain');
  h.element('citadel-close').click();assert.equal(h.calls.interiors.at(-1).options.mode,'home');
  h.emit(h.element('citadel-close'),'keydown',{key:'Escape'});assert.equal(h.element('city-room').hidden,true);assert.equal(h.api.isOpen(),true);
  assert.equal(h.document.activeElement,h.hotspot('observatory'));
  h.emit(h.element('citadel-close'),'keydown',{key:'Escape'});assert.equal(h.api.isOpen(),false);
});

test('city and home soundscapes switch on visits, keep their controls and stop on departure',()=>{
  const h=harness();h.render(snapshot());h.api.open();h.api.openPlace('observatory');
  assert.deepEqual(h.calls.ambienceScenes,['city','home']);
  const room=h.element('city-room-welcome');
  room.querySelector('[data-city-action="home-window"]').click();
  h.api.backToStreet();room.querySelector('[data-city-action="home-rooftop"]').click();
  assert.deepEqual(h.calls.ambienceScenes,['city','home']);
  assert.ok(h.calls.ambienceMounts.some(c=>c.id==='home'&&c.node==='city-home-audio'));
  assert.ok(h.calls.ambienceMounts.some(c=>c.id==='city'&&c.node==='city-ambience'));
  assert.equal(h.element('city-ambience').hidden,true);
  h.api.backToStreet();h.api.backToStreet();assert.deepEqual(h.calls.ambienceScenes,['city','home','city']);
  h.api.openPlace('observatory');h.api.openPlace('library');assert.deepEqual(h.calls.ambienceScenes,['city','home','city','home','city']);
  assert.equal(h.element('city-ambience').hidden,false);
  h.api.openPlace('observatory');h.api.close(false);assert.equal(h.calls.ambienceScenes.at(-1),null);
  assert.equal(h.calls.requests.length,0);assert.equal(h.calls.storageWrites,0);assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);
});

test('shop and station route to existing modules after releasing main-page inert ownership',()=>{
  for(const [room,action,count] of [['atelier','shop','shops'],['station','camp','camps'],['station','home','closed']]){
    const h=harness();h.render(snapshot());h.api.open();h.api.openPlace(room);h.api.openService(room==='atelier'?'outfits':'plan');
    h.element('city-room-content').querySelector(`[data-city-action="${action}"]`).click();assert.equal(h.calls[count],1);assert.equal(h.api.isOpen(),false);assert.equal(h.main.inert,false);
  }
});

test('polls reuse expensive street and room SVG and leave focused interaction controls attached',()=>{
  const h=harness();h.render(snapshot());h.api.open();const scene=h.element('citadel-scene'),writes=scene.htmlWrites;
  h.render(snapshot(180));h.render(snapshot(240));assert.equal(scene.htmlWrites,writes);
  h.api.openPlace('tea');h.api.openService('tea');const room=h.element('city-interior-art'),roomWrites=room.htmlWrites,content=h.element('city-room-content'),contentWrites=content.htmlWrites;
  const chat=content.querySelector('[data-city-action="tea-chat"]');chat.focus();h.render(snapshot(300));
  assert.equal(room.htmlWrites,roomWrites);assert.equal(content.htmlWrites,contentWrites);assert.equal(h.document.activeElement,chat);
});

test('equipped effects stay mounted through progress polls and redraw only when the effect changes',()=>{
  const h=harness(),initial=snapshot();initial.quests.equipped.fx='fx-snow';
  h.render(initial);h.api.open();const street=h.element('citadel-scene'),writes=street.htmlWrites,building=h.hotspot('tea');building.focus();
  for(let i=1;i<=20;i++){
    const next=copy(initial);next.totals.minutes+=i;next.quests.now=`${day}T12:00:${String(i).padStart(2,'0')}+08:00`;h.render(next);
  }
  assert.equal(street.htmlWrites,writes,'polling must not restart the street effect animation');
  assert.equal(h.document.activeElement,building);assert.equal(h.last().equipment.fx,'fx-snow');
  h.api.openPlace('tea');const room=h.element('city-interior-art'),roomWrites=room.htmlWrites;
  for(let i=21;i<=40;i++){
    const next=copy(initial);next.totals.minutes+=i;next.quests.now=`${day}T12:00:${i}+08:00`;h.render(next);
  }
  assert.equal(room.htmlWrites,roomWrites,'polling must not restart an interior effect animation');
  h.api.applyEquipment({...initial.quests.equipped,fx:'fx-meteor'},`${day}T12:01:00+08:00`);
  assert.equal(room.htmlWrites,roomWrites+1);assert.equal(h.calls.interiors.at(-1).equipment.fx,'fx-meteor');
  h.api.applyEquipment({...initial.quests.equipped,fx:'fx-meteor'},`${day}T12:01:01+08:00`);
  assert.equal(room.htmlWrites,roomWrites+1);assert.equal(h.calls.requests.length,0);
});

test('changing selected history date keeps the private notebook mounted without recreating its draft pane',()=>{
  const h=harness();h.render(snapshot());h.api.open();h.api.openPlace('library');h.api.openService('desk');
  const pane=h.element('city-life-pane'),writes=h.element('city-room-content').htmlWrites,unmounts=h.calls.lifeUnmounts;
  const s=snapshot(30,{date:'2026-09-21',records:[{id:'old',day:'2026-09-21',name:'英语听课',minutes:30}],dayRecordCount:1});h.render(s);
  assert.match(h.element('city-room-content').innerHTML,/私人的纸页/);assert.doesNotMatch(h.element('city-room-content').innerHTML,/英语听课/);
  assert.equal(h.calls.lifeMounts.at(-1).node,pane);assert.equal(h.calls.lifeMounts.at(-1).date,'2026-09-21');
  assert.equal(h.element('city-room-content').htmlWrites,writes);assert.equal(h.calls.lifeUnmounts,unmounts);assert.equal(h.element('city-street').hidden,true);assert.equal(h.calls.requests.length,0);
});

test('progress milestones remain owned by the existing homepage, never by rain-city rewards or animation timers',()=>{
  const h=harness();const a=snapshot(0),b=snapshot(600);h.render(a);h.api.open();
  assert.equal(h.api.acceptProgress(a,b,[freshRecord(a,b)],dailyEvents([1,2,3,4])),false);h.render(b);h.advance(60000);
  assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);assert.equal(h.calls.storageWrites,0);assert.deepEqual(h.calls.sounds,[]);assert.equal(h.calls.requests.length,0);
});

function wheel(h,patch={}){return h.emit(h.element('citadel-stage'),'wheel',{deltaY:-120,deltaMode:0,clientX:520,clientY:320,...patch});}
function cameraState(h){return h.element('citadel-camera').style.transform;}
test('street wheel zooms around cursor, clamps at 100–240%, and overview resets the camera',()=>{
  const h=harness();h.render(snapshot());h.api.open();const before=cameraState(h);const event=wheel(h);
  assert.equal(event.defaultPrevented,true);assert.notEqual(cameraState(h),before);assert.equal(h.timers.size,1);
  for(let i=0;i<20;i++)wheel(h);assert.equal(h.element('citadel-zoom').textContent,'240%');assert.equal(h.element('citadel-zoom-in').disabled,true);
  h.element('citadel-overview').click();assert.equal(cameraState(h),'translate(0%,0%) scale(1)');assert.equal(h.timers.size,0);
  for(let i=0;i<20;i++)wheel(h,{deltaY:1000});assert.equal(h.element('citadel-zoom').textContent,'100%');
});

test('room scrolling cannot zoom hidden street; invalid wheel events, dialogs and quick skins are ignored',()=>{
  const h=harness();h.render(snapshot());h.api.open();const base=cameraState(h);
  h.api.openPlace('library');const roomWheel=wheel(h);assert.equal(cameraState(h),base);assert.equal(roomWheel.defaultPrevented,false);
  h.api.backToStreet();for(const patch of [{deltaY:0},{deltaY:NaN},{clientX:Infinity},{target:h.element('citadel-zoom-in')}]){wheel(h,patch);assert.equal(cameraState(h),base);}
  h.element('test-dialog').open=true;wheel(h);assert.equal(cameraState(h),base);h.element('test-dialog').open=false;
  h.element('quick-skins').hidden=false;wheel(h);assert.equal(cameraState(h),base);assert.equal(h.timers.size,0);
});

test('dragging a zoomed street pans the view, then suppresses accidental building entry',()=>{
  const h=harness();h.render(snapshot());h.api.open();h.element('citadel-zoom-in').click();const before=cameraState(h),stage=h.element('citadel-stage');
  h.emit(stage,'pointerdown',{pointerId:1,clientX:500,clientY:300});h.emit(stage,'pointermove',{pointerId:1,clientX:560,clientY:325});
  assert.notEqual(cameraState(h),before);assert.equal(stage.classList.contains('dragging'),true);h.emit(stage,'pointerup',{pointerId:1});h.hotspot('tea').click();
  assert.equal(h.element('city-room').hidden,true);h.advance(300);h.hotspot('tea').click();assert.equal(h.element('city-room').hidden,false);
});

test('closing, entering a room and background suspension clear wheel timers and CSS motion',async()=>{
  for(const stop of ['close','room','hidden','native']){
    const h=harness({animatedSlide:true});h.render(snapshot());h.api.open();wheel(h);assert.equal(h.timers.size,1);
    if(stop==='close')h.api.close(false);if(stop==='room')h.api.openPlace('tea');
    if(stop==='hidden'){h.document.hidden=true;h.emit(h.element('body'),'visibilitychange');}
    if(stop==='native')h.emit(h.element('body'),'focusquest:visibility',{detail:{visible:false}});
    assert.equal(h.timers.size,0,stop);assert.equal(h.element('citadel-stage').classList.contains('wheeling'),false,stop);
    if(stop==='hidden'||stop==='native'){assert.equal(h.element('citadel-view').dataset.paused,'true');assert.equal(h.document.documentElement.classList.contains('citadel-page-moving'),false);}
    await flush();
  }
});

test('changing reduced-motion preference disables rain without closing the city',async()=>{
  const h=harness({animatedSlide:true});h.render(snapshot());h.api.open();h.setReduced(true);await flush();
  assert.equal(h.api.isOpen(),true);assert.equal(h.element('citadel-view').dataset.motion,'false');assert.equal(h.document.documentElement.classList.contains('citadel-page-moving'),false);
  h.setReduced(false);assert.equal(h.element('citadel-view').dataset.motion,'true');
});

test('appearance preview overlays authoritative equipment and stale polls cannot roll back a newer outfit',()=>{
  const h=harness();h.render(snapshot());h.api.open();h.api.previewEquipment({fx:'fx-one'});assert.equal(h.last().equipment.fx,'fx-one');
  const next=snapshot();next.quests.now=`${day}T12:00:00.000200+08:00`;next.quests.equipped.fx='fx-two';h.setState(next);h.api.render(next);assert.equal(h.last().equipment.fx,'fx-one');
  h.api.previewEquipment(null);assert.equal(h.last().equipment.fx,'fx-two');h.render(snapshot());assert.equal(h.last().equipment.fx,'fx-two');
  h.api.openPlace('tea');h.api.previewEquipment({avatar:'avatar-one'});assert.equal(h.calls.interiors.at(-1).equipment.avatar,'avatar-one');
  h.api.previewEquipment(null);assert.equal(h.calls.interiors.at(-1).equipment.avatar,'avatar-default');
});

test('all retained city-compatible shop slots preview the actual rainy street with other equipment preserved',()=>{
  const h=harness();h.render(snapshot());for(const slot of slots){const html=h.api.preview(`${slot}-one`);assert.match(html,/星辉城 · 雨夜街景/);assert.ok(!html.includes('完整觉醒'));assert.equal(h.last().equipment[slot],`${slot}-one`);assert.equal(h.last().options.interactive,false);}
  assert.equal(h.api.preview('missing'),'');assert.equal(h.api.isOpen(),false);assert.equal(h.calls.requests.length,0);
});

test('real quick-skin context menu can preview an owned item without entering a building',()=>{
  const h=harness();h.render(snapshot());h.api.open();const building=h.hotspot('tea');h.emit(building,'contextmenu',{button:2,clientX:80,clientY:80});
  assert.equal(h.element('quick-skins').hidden,false);assert.equal(h.element('city-room').hidden,true);
  const item=h.item('fx-one');h.emit(item,'mouseenter');assert.equal(h.last().equipment.fx,'fx-one');h.emit(item,'mouseleave');assert.equal(h.last().equipment.fx,'fx-default');
  h.quick.close();assert.equal(h.element('quick-skins').hidden,true);assert.equal(h.document.activeElement,h.hotspot('tea'));assert.equal(h.calls.requests.length,0);
});


test('the city street trail sign handles mouse and keyboard without hijacking other actions',()=>{
  const h=harness();h.render(snapshot());h.api.open();
  const sign=()=>h.element('citadel-scene').querySelector('[data-city-trail]');
  sign().click({button:2});sign().click({ctrlKey:true});assert.equal(h.calls.trails.length,0);
  sign().click();assert.equal(h.calls.trails.length,1);assert.equal(h.calls.trails[0],sign());
  for(const key of ['Enter',' '])assert.equal(h.emit(sign(),'keydown',{key}).defaultPrevented,true);
  assert.equal(h.calls.trails.length,3);assert.equal(h.element('city-room').hidden,true);
  h.element('test-dialog').open=true;sign().click();assert.equal(h.calls.trails.length,3);h.element('test-dialog').open=false;
  h.element('quick-skins').hidden=false;sign().click();assert.equal(h.calls.trails.length,3);h.element('quick-skins').hidden=true;
  h.api.openPlace('library');sign().click();assert.equal(h.calls.trails.length,3);
  h.api.backToStreet();sign().focus();
  h.api.applyEquipment({theme:'theme-forest'},'2026-09-28T12:00:00+08:00');
  assert.equal(h.document.activeElement,sign(),'equipping redraws the scene but keeps focus on the route sign');
  h.api.close(false);sign().click();assert.equal(h.calls.trails.length,3);
  assert.equal(h.calls.requests.length,0);assert.equal(h.calls.storageWrites,0);
});

test('entering each building prioritizes its room scene and waits for an object before opening tools',()=>{
  const h=harness();h.render(snapshot());h.api.open();
  for(const id of placeIds){
    h.api.openPlace(id);
    assert.equal(h.element('city-interior-art').hidden,false,id);
    assert.equal(h.element('city-interior-art').getAttribute('aria-hidden'),'false',id);
    assert.equal(h.calls.interiors.at(-1).options.interactive,true,id);
    assert.equal(h.element('city-room-content').hidden,true,`${id}: tools should not obscure the room on entry`);
    assert.equal(h.element('city-room-welcome').hidden,false,id);
    h.api.backToStreet();
  }
  assert.equal(h.calls.requests.length,0);
});

test('closing and reopening a desk keeps its unsaved draft and mounted notebook through polls and appearance changes',()=>{
  const h=harness();h.render(snapshot());h.api.open();h.api.openPlace('library');
  assert.equal(h.api.openService('desk'),true);
  const content=h.element('city-room-content'),pane=h.element('city-life-pane'),writes=content.htmlWrites,unmounts=h.calls.lifeUnmounts;
  const draft=new content.constructor('textarea');draft.value='雨声里想到的一句话，还没有保存。';content.append(draft);draft.focus();
  assert.equal(content.hidden,false);
  h.render(snapshot(180));assert.equal(h.document.activeElement,draft);
  assert.equal(h.api.closeService(),true);assert.equal(content.hidden,true);
  assert.equal(h.calls.lifeUnmounts,unmounts,'closing tools is not leaving the notebook');
  assert.equal(h.api.openService('desk'),true);assert.equal(content.hidden,false);
  h.api.applyEquipment({theme:'theme-forest'},'2026-09-28T12:00:00+08:00');
  assert.equal(content.htmlWrites,writes);assert.equal(draft.parentElement,content);assert.equal(draft.value,'雨声里想到的一句话，还没有保存。');
  assert.equal(h.calls.lifeMounts.at(-1).node,pane);assert.equal(h.calls.lifeUnmounts,unmounts);
  assert.equal(h.calls.requests.length,0);assert.equal(h.calls.storageWrites,0);
});

test('tea tools can be put away without unmounting the rest timer, while leaving the room releases it',()=>{
  const h=harness();h.render(snapshot());h.api.open();h.api.openPlace('tea');assert.equal(h.api.openService('tea'),true);
  const pane=h.element('city-life-pane'),writes=h.element('city-room-content').htmlWrites,unmounts=h.calls.lifeUnmounts;
  h.api.closeService();h.render(snapshot(210));h.api.openService('tea');
  assert.equal(h.element('city-room-content').htmlWrites,writes);assert.equal(h.calls.lifeMounts.at(-1).node,pane);
  assert.equal(h.calls.lifeUnmounts,unmounts,'the tea timer belongs to the room visit, not the panel visibility');
  h.api.closeService();h.api.backToStreet();assert.ok(h.calls.lifeUnmounts>unmounts);
  assert.equal(h.calls.requests.length,0);
});

test('changing the tea-room lamp before opening its tools does not prefill the service cache',()=>{
  const h=harness();h.render(snapshot());h.api.open();h.api.openPlace('tea');
  const content=h.element('city-room-content'),writes=content.htmlWrites;
  const lamp=h.element('city-interior-art').querySelector('[data-city-workstation="tea-window"]');
  lamp.click();assert.equal(h.calls.interiors.at(-1).options.mode,'lamplight');
  assert.equal(content.hidden,true);assert.equal(content.htmlWrites,writes);
  assert.equal(h.calls.lifeMounts.length,0,'a lamp interaction must not create the tea timer');
  assert.equal(h.api.openService('tea'),true);assert.equal(content.hidden,false);
  assert.match(content.innerHTML,/id="city-life-pane"/,'the first service visit still constructs its real content');
  assert.match(content.innerHTML,/看窗外的雨/,'the tool button reflects the lamp already switched on');
  assert.equal(content.htmlWrites,writes+1);assert.equal(h.calls.lifeMounts.at(-1).id,'tea');
  const pane=h.calls.lifeMounts.at(-1).node,unmounts=h.calls.lifeUnmounts;
  h.api.closeService();h.render(snapshot(150));h.api.openService('tea');
  assert.equal(content.htmlWrites,writes+1);assert.equal(h.calls.lifeMounts.at(-1).node,pane);
  assert.equal(h.calls.lifeUnmounts,unmounts,'putting tools away must keep the mounted timer');
});

test('unknown or mismatched workstations cannot open tools in another building',()=>{
  const h=harness();h.render(snapshot());assert.equal(h.api.openService('desk'),false);h.api.open();assert.equal(h.api.openService('desk'),false);
  h.api.openPlace('library');
  for(const id of ['unknown','plan','games','tea'])assert.equal(h.api.openService(id),false,id);
  assert.equal(h.element('city-room-content').hidden,true);
  h.element('test-dialog').open=true;assert.equal(h.api.openService('desk'),false);h.element('test-dialog').open=false;
  assert.equal(h.api.openService('desk'),true);h.api.close(false);
  assert.equal(h.api.openService('desk'),false);assert.equal(h.calls.requests.length,0);
});

test('room furniture responds to mouse and keyboard, and Escape first puts the tools away',()=>{
  for(const event of ['click','Enter',' ']){
    const h=harness();h.render(snapshot());h.api.open();h.api.openPlace('library');
    const desk=h.element('city-interior-art').querySelector('[data-city-workstation="desk"]');
    if(event==='click')desk.click();else assert.equal(h.emit(desk,'keydown',{key:event}).defaultPrevented,true);
    assert.equal(h.element('city-room-content').hidden,false);assert.equal(desk.getAttribute('aria-pressed'),'true');
    assert.equal(h.document.activeElement,h.element('city-room-content').querySelector('[data-city-service-close]'));
    h.emit(h.document.activeElement,'keydown',{key:'Escape'});
    assert.equal(h.element('city-room-content').hidden,true);assert.equal(h.element('city-room').hidden,false);assert.equal(h.api.isOpen(),true);
    assert.equal(h.document.activeElement,desk);assert.equal(desk.getAttribute('aria-pressed'),'false');
    h.emit(desk,'keydown',{key:'Escape'});assert.equal(h.element('city-room').hidden,true);assert.equal(h.api.isOpen(),true);
  }
});

test('street NPC conversations stop their walk, advance without redrawing, and resume on closing',()=>{
  const h=harness();h.render(snapshot());h.api.open();
  const npc=h.element('citadel-scene').querySelector('[data-city-npc="ayu"]'),dialogue=h.element('city-talk');
  npc.click();assert.equal(dialogue.hidden,false);assert.equal(npc.dataset.talking,'true');assert.equal(h.element('city-room').hidden,true);
  assert.match(dialogue.innerHTML,/阿榆/);const writes=dialogue.htmlWrites;
  dialogue.querySelector('[data-city-talk-action="next"]').click();const line=dialogue.querySelector('p').textContent;
  assert.equal(line,h.residents.find('ayu').lines[1]);assert.equal(dialogue.htmlWrites,writes);
  h.render(snapshot(200));assert.equal(dialogue.querySelector('p').textContent,line);assert.equal(dialogue.htmlWrites,writes);assert.equal(npc.dataset.talking,'true');
  dialogue.querySelector('[data-city-talk-action="close"]').click();assert.equal(dialogue.hidden,true);assert.equal(npc.dataset.talking,'false');assert.equal(h.document.activeElement,npc);
  assert.equal(h.calls.requests.length,0);assert.equal(h.calls.storageWrites,0);
});

test('every resident has room dialogue and their invitation opens the corresponding room function without charging rewards',()=>{
  const service={library:'desk',tea:'tea',atelier:'outfits',arcade:'games',station:'plan'};
  for(const room of placeIds){
    const h=harness();h.render(snapshot());h.api.open();h.api.openPlace(room);
    const npcId=h.residents.roomResident(room,'home'),npc=h.element('city-interior-art').querySelector(`[data-city-npc="${npcId}"]`);
    assert.ok(npc,room);h.emit(npc,'keydown',{key:'Enter'});const dialogue=h.element('city-talk');assert.equal(dialogue.hidden,false,room);
    assert.match(dialogue.innerHTML,new RegExp(h.residents.find(npcId).name));
    dialogue.querySelector('[data-city-talk-action="service"]').click();assert.equal(dialogue.hidden,true,room);
    if(room==='observatory')assert.equal(h.element('citadel-view').dataset.homeView,'panorama');
    else {assert.equal(h.element('citadel-view').dataset.service,service[room]);assert.equal(h.element('city-room-content').hidden,false);}
    assert.equal(h.calls.requests.length,0,room);assert.equal(h.calls.arcades,0,room);assert.equal(h.calls.lotteryMounts.length,0,room);
  }
});

test('a street invitation visits the right house and closes conversation before room navigation',()=>{
  const h=harness();h.render(snapshot());h.api.open();const npc=h.element('citadel-scene').querySelector('[data-city-npc="yanqing"]');
  h.emit(npc,'keydown',{key:' '});assert.equal(h.element('city-talk').hidden,false);
  h.element('city-talk').querySelector('[data-city-talk-action="service"]').click();
  assert.equal(h.calls.interiors.at(-1).id,'library');assert.equal(h.element('city-talk').hidden,true);assert.equal(npc.dataset.talking,'false');
  assert.equal(h.element('city-room-content').hidden,true);assert.equal(h.calls.requests.length,0);
});

test('conversation closes before service, room and city navigation; dialogs and mismatched NPCs cannot bypass context',()=>{
  const h=harness();h.render(snapshot());assert.equal(h.api.talkTo('ayu'),false);h.api.open();
  assert.equal(h.api.talkTo('missing'),false);h.element('test-dialog').open=true;assert.equal(h.api.talkTo('ayu'),false);h.element('test-dialog').open=false;
  h.api.openPlace('library');assert.equal(h.api.talkTo('ayu'),false);h.api.openService('desk');assert.equal(h.api.talkTo('yanqing'),true);
  assert.equal(h.element('city-room-content').hidden,true);h.emit(h.document.activeElement,'keydown',{key:'Escape'});
  assert.equal(h.element('city-talk').hidden,true);assert.equal(h.element('city-room').hidden,false);assert.equal(h.api.isOpen(),true);
  h.api.talkTo('yanqing');h.api.openPlace('tea');assert.equal(h.element('city-talk').hidden,true);
  h.api.talkTo('ayu');h.api.close(false);assert.equal(h.element('city-talk').hidden,true);assert.equal(h.api.isOpen(),false);
  h.api.open();assert.equal(h.element('city-talk').hidden,true);assert.equal(h.element('city-room-content').hidden,true);
  assert.equal(h.calls.requests.length,0);
});

test('equipment refresh keeps a talking street NPC stopped without resetting the current line',()=>{
  const h=harness();h.render(snapshot());h.api.open();h.api.talkTo('ayu');const talk=h.element('city-talk');
  talk.querySelector('[data-city-talk-action="next"]').click();const line=talk.querySelector('p').textContent,writes=talk.htmlWrites;
  h.api.applyEquipment({theme:'theme-forest'},'2026-09-28T12:00:00+08:00');
  assert.equal(talk.hidden,false);assert.equal(talk.htmlWrites,writes);assert.equal(talk.querySelector('p').textContent,line);
  assert.equal(h.element('citadel-scene').querySelector('[data-city-npc="ayu"]').dataset.talking,'true');
  h.api.closeConversation();assert.equal(h.element('citadel-scene').querySelector('[data-city-npc="ayu"]').dataset.talking,'false');
});

test('the rooftop neighbor invitation remains actionable in the rooftop context',()=>{
  const h=harness();h.render(snapshot());h.api.open();h.api.openPlace('observatory');h.api.openService('home-rooftop');
  const before=JSON.stringify([h.element('citadel-view').dataset.homeView,h.calls.interiors.at(-1).options.mode]);
  h.api.talkTo('wangshu');h.element('city-talk').querySelector('[data-city-talk-action="service"]').click();
  assert.equal(h.element('city-talk').hidden,true);
  assert.notEqual(JSON.stringify([h.element('citadel-view').dataset.homeView,h.calls.interiors.at(-1).options.mode]),before,'the invitation should perform a valid rooftop action');
  assert.equal(h.calls.requests.length,0);
});

test('holding an activation key cannot repeatedly reset a street conversation',()=>{
  const h=harness();h.render(snapshot());h.api.open();const npc=h.element('citadel-scene').querySelector('[data-city-npc="ayu"]');
  h.emit(npc,'keydown',{key:'Enter'});const talk=h.element('city-talk');talk.querySelector('[data-city-talk-action="next"]').click();
  const writes=talk.htmlWrites,line=talk.querySelector('p').textContent;
  h.emit(npc,'keydown',{key:'Enter',repeat:true});assert.equal(talk.htmlWrites,writes);assert.equal(talk.querySelector('p').textContent,line);
});
