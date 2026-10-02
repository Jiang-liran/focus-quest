const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const source = fs.readFileSync(require.resolve('../static/compass.js'), 'utf8');
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));
const time = n => `2026-09-25T20:00:00.${String(n).padStart(6, '0')}+08:00`;

function card(patch = {}) {
  return {id: 'math-practice', subject: 'math', title: '独立解一道题', why: '用一个小练习检验刚听到的内容。',
    estimatedMinutes: 20, steps: ['不看答案先尝试', '对照思路找卡点', '合上资料再说一遍'], prompt: '这道题最关键的一步是什么？', ...patch};
}
function active(patch = {}) {
  return {...card(), id: 'c21c74e2-3a35-4084-a24b-013f565cfd8e', cardId: 'math-practice', status: 'active',
    version: 1, checked: [false, false, false], note: '', startedAt: time(100), updatedAt: time(100), completedAt: null, ...patch};
}
function snapshot(patch = {}) {
  return {now: time(100), today: '2026-09-25', recommendations: [card(), card({id: 'english-recall', subject: 'english', title: '回忆一组单词'})],
    active: null, history: [], ...patch};
}
const decode = value => String(value).replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'"}[entity]));
const dataKey = key => key.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// A small DOM boundary that models replacement, focus, input values and open
// details. Real controller code runs unchanged; no layout engine is involved.
function harness(extras = {}) {
  const calls = {requests: [], toasts: [], sounds: [], refresh: [], pages: []};
  const roots = new Map(), ids = new Map();
  let document;
  class Element {
    constructor(tag = 'div', attrs = {}) {
      this.tagName = tag.toUpperCase(); this.attributes = {...attrs}; this.children = []; this.parentElement = null;
      this.dataset = {}; this.listeners = new Map(); this.writes = 0; this._html = ''; this.textContent = '';
      this.value = ''; this.hidden = false; this.disabled = 'disabled' in attrs; this.checked = 'checked' in attrs;
      this.open = 'open' in attrs; this.id = attrs.id || ''; this.selectionStart = 0; this.selectionEnd = 0;
      this.classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
      this.classList = {contains: name => this.classes.has(name), add: name => this.classes.add(name), remove: name => this.classes.delete(name),
        toggle: (name, force) => { const enabled = force ?? !this.classes.has(name); if (enabled) this.classes.add(name); else this.classes.delete(name); return enabled; }};
      for (const [key, value] of Object.entries(attrs)) if (key.startsWith('data-')) this.dataset[dataKey(key)] = value;
      if (this.id) ids.set(this.id, this);
    }
    get innerHTML() {
      // Browsers normalize SVG self-closing tags and boolean attributes, and
      // serialize an interactively opened <details> with an open attribute.
      // Comparing this serialization to the original template is not a cache.
      let html = this._html.replace(/<(path|circle|use|ellipse)(\b[^>]*?)\/>/g, '<$1$2></$1>')
        .replace(/\s(disabled|checked)(?=[\s>])/g, ' $1=""');
      const details = this.querySelectorAll('details');
      html = html.replace(/<details\b[^>]*>/g, tag => {
        const id = tag.match(/data-action-entry="([^"]+)"/)?.[1];
        const node = details.find(entry => entry.dataset.actionEntry === decode(id || ''));
        return node?.open ? tag.slice(0, -1) + ' open="">' : tag;
      });
      return html;
    }
    set innerHTML(value) {
      if (this.contains(document?.activeElement)) document.activeElement = null;
      for (const child of this.querySelectorAll('[id]')) if (ids.get(child.id) === child) ids.delete(child.id);
      this._html = String(value); this.writes++; this.children = [];
      const stack = [this], tokens = [...this._html.matchAll(/<\/?[a-zA-Z][^>]*>/g)];
      for (const token of tokens) {
        const text = token[0], tag = text.match(/^<\/?([\w-]+)/)[1].toLowerCase();
        if (text.startsWith('</')) {
          const index = stack.map(node => node.tagName.toLowerCase()).lastIndexOf(tag);
          if (index > 0) stack.length = index;
          continue;
        }
        const attrs = {};
        for (const match of text.slice(tag.length + 1, -1).matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)"|\s*=\s*'([^']*)'|\s*=\s*([^\s>]+))?/g)) {
          attrs[match[1]] = decode(match[2] ?? match[3] ?? match[4] ?? '');
        }
        const child = new Element(tag, attrs), parent = stack.at(-1);
        child.parentElement = parent; parent.children.push(child);
        if (tag === 'textarea') child.value = decode(this._html.slice(token.index + text.length).split('</textarea>')[0]);
        if (!text.endsWith('/>') && !['input', 'br', 'hr', 'img', 'use', 'path', 'circle'].includes(tag)) stack.push(child);
      }
    }
    matches(selector) {
      if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
      const tag = selector.match(/^[\w-]+/); if (tag && this.tagName.toLowerCase() !== tag[0]) return false;
      const id = selector.match(/#([\w-]+)/); if (id && this.id !== id[1]) return false;
      const cls = selector.match(/\.([\w-]+)/); if (cls && !this.classes.has(cls[1])) return false;
      for (const match of selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)) {
        const value = match[1] === 'open' ? (this.open ? '' : undefined) : this.attributes[match[1]];
        if (value === undefined || (match[2] !== undefined && value !== match[2])) return false;
      }
      return true;
    }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    contains(other) { return other === this || this.children.some(child => child.contains(other)); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name.startsWith('data-')) this.dataset[dataKey(name)] = String(value); }
    hasAttribute(name) { return name in this.attributes; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(type, callback) { const list = this.listeners.get(type) || []; list.push(callback); this.listeners.set(type, list); }
    focus() { document.activeElement = this; }
    scrollIntoView() {}
  }
  const element = id => ids.get(id) || roots.get(id) || (() => { const node = new Element('div', {id}); roots.set(id, node); return node; })();
  document = {activeElement: null, getElementById: element,
    querySelectorAll: selector => [...roots.values()].flatMap(root => [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)]),
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }};
  const bridge = {
    api(path, body) { return new Promise((resolve, reject) => calls.requests.push({path, body: copy(body), resolve, reject})); },
    toast(...args) { calls.toasts.push(args); }, playSound(cue, options) { calls.sounds.push({cue, ...copy(options)}); },
    async refresh(force) { calls.refresh.push(force); }, openPage(page) { calls.pages.push(page); },
  };
  const context = vm.createContext({document, crypto, ...extras}); vm.runInContext(source, context);
  const api = context.FocusCompass; api.init(bridge);
  const fire = (rootId, type, target) => {
    for (const callback of element(rootId).listeners.get(type) || []) callback({target, preventDefault() {}});
  };
  const click = action => { const target = document.querySelector(`[data-compass-action="${action}"]`); assert.ok(target, `missing ${action} button`); fire('compass-panel', 'click', target); };
  const input = value => { const node = element('compass-note'); node.value = value; node.focus(); fire('compass-editor', 'input', node); return node; };
  const check = (index, value = true) => { const node = document.querySelector(`[data-compass-step="${index}"]`); assert.ok(node); node.checked = value; node.focus(); fire('compass-editor', 'change', node); };
  return {api, calls, bridge, element, document, fire, click, input, check};
}

test('recommendations are read-only until a specific action is started and the header opens the compass page', () => {
  const h = harness(); h.api.render(snapshot());
  assert.match(h.element('compass-pill-title').textContent, /独立解一道题/);
  assert.match(h.element('compass-context').textContent, /2026-09-25.*回看历史/);
  h.fire('compass-next', 'click', h.element('compass-next'));
  assert.match(h.element('compass-pill-title').textContent, /回忆一组单词/);
  h.fire('compass-open', 'click', h.element('compass-open'));
  assert.deepEqual(h.calls.pages, ['achievements']); assert.equal(h.calls.requests.length, 0);
});

test('start retries reuse one UUID and concurrent clicks cannot create multiple actions', async () => {
  const h = harness(); h.api.render(snapshot()); h.click('start'); h.click('start');
  assert.equal(h.calls.requests.length, 1);
  const first = h.calls.requests[0];
  assert.equal(first.path, '/api/actions/start'); assert.deepEqual(Object.keys(first.body).sort(), ['cardId', 'requestId']);
  assert.equal(first.body.cardId, 'math-practice'); assert.match(first.body.requestId, /^[0-9a-f-]{36}$/);
  first.reject(new Error('连接中断')); await flush(); h.click('start');
  const retry = h.calls.requests[1]; assert.deepEqual(retry.body, first.body);
  retry.resolve(snapshot({now: time(200), active: active()})); await flush();
  assert.match(h.element('compass-pill-status').textContent, /0 \/ 3 步/);
  assert.deepEqual(h.calls.sounds, []);
});

test('a poll confirming an uncertain start prevents the next action from reusing its request UUID', async () => {
  const h = harness(); h.api.render(snapshot()); h.click('start');
  const first = h.calls.requests[0]; first.reject(new Error('连接中断')); await flush();
  h.api.render(snapshot({now: time(200), active: active()}));
  h.api.render(snapshot({now: time(300), history: [active({status: 'parked', version: 2})]}));
  h.click('start'); assert.notEqual(h.calls.requests[1].body.requestId, first.body.requestId);
  h.calls.requests[1].resolve(snapshot({now: time(400), active: active({id: crypto.randomUUID()})})); await flush();
});

test('polls preserve the dirty note, selection, checked steps and unchanged open history', () => {
  const h = harness(), history = [active({id: crypto.randomUUID(), status: 'completed', checked: [true, true, true], note: '已理解'})];
  h.api.render(snapshot({active: active(), history})); h.check(0);
  const note = h.input('这里留着尚未保存的关键思路'); note.selectionStart = 2; note.selectionEnd = 5;
  const entry = h.element('compass-history').querySelector('details'); entry.open = true;
  const editorWrites = h.element('compass-editor').writes, historyWrites = h.element('compass-history').writes;
  h.api.render(snapshot({now: time(200), active: active(), history}));
  assert.equal(h.element('compass-editor').writes, editorWrites); assert.equal(h.element('compass-history').writes, historyWrites);
  assert.equal(h.element('compass-note'), note); assert.equal(note.value, '这里留着尚未保存的关键思路');
  assert.deepEqual([note.selectionStart, note.selectionEnd], [2, 5]); assert.equal(h.document.activeElement, note);
  assert.equal(h.document.querySelector('[data-compass-step="0"]').checked, true); assert.equal(entry.open, true);
  assert.equal(h.calls.requests.length, 0);
});

test('idle polling keeps expanded historical notes and keyboard focus in the current recommendation', () => {
  const h = harness(), history = [active({status: 'completed', checked: [true, true, true], note: '读到这里不会被轮询打断'})];
  h.api.render(snapshot({history})); const entry = h.element('compass-history').querySelector('details'); entry.open = true;
  const start = h.document.querySelector('[data-compass-action="start"]'); start.focus();
  const historyWrites = h.element('compass-history').writes, editorWrites = h.element('compass-editor').writes;
  h.api.render(snapshot({now: time(200), history}));
  assert.equal(h.element('compass-history').writes, historyWrites); assert.equal(entry.open, true);
  assert.equal(h.element('compass-editor').writes, editorWrites); assert.equal(h.document.activeElement, start);
});

test('checking a step retains keyboard focus on that same step', () => {
  const h = harness(); h.api.render(snapshot({active: active()})); h.check(1);
  assert.equal(h.document.activeElement?.dataset.compassStep, '1');
  assert.equal(h.document.querySelector('[data-compass-step="1"]').checked, true);
});

test('a newly arriving historical entry keeps the previously opened action expanded', () => {
  const h = harness(), old = active({status: 'completed', checked: [true, true, true], note: '继续读这一段'});
  h.api.render(snapshot({history: [old]})); h.element('compass-history').querySelector('details').open = true;
  const added = active({id: crypto.randomUUID(), status: 'parked', note: '新到的记录'});
  h.api.render(snapshot({now: time(200), history: [added, old]}));
  const entries = h.element('compass-history').querySelectorAll('details');
  assert.equal(entries.length, 2);
  assert.equal(entries.find(entry => entry.dataset.actionEntry === old.id).open, true);
  assert.equal(entries.find(entry => entry.dataset.actionEntry === added.id).open, false);
});

test('complete saves the exact current draft first, then completes using the returned version', async () => {
  const h = harness(); h.api.render(snapshot({active: active()}));
  h.check(0); h.check(1); h.check(2); h.input('关键是先确定定义域。'); h.click('complete'); h.click('complete');
  assert.equal(h.calls.requests.length, 1); const update = h.calls.requests[0];
  assert.equal(update.path, '/api/actions/update');
  assert.deepEqual(update.body, {id: active().id, version: 1, checked: [true, true, true], note: '关键是先确定定义域。'});
  const saved = active({version: 2, checked: [true, true, true], note: update.body.note});
  update.resolve(snapshot({now: time(200), active: saved})); await flush();
  assert.equal(h.calls.requests.length, 2); const complete = h.calls.requests[1];
  assert.equal(complete.path, '/api/actions/complete'); assert.deepEqual(complete.body, {id: saved.id, version: 2});
  complete.resolve(snapshot({now: time(300), history: [{...saved, status: 'completed', version: 3, completedAt: time(300)}]})); await flush();
  assert.equal(h.calls.requests.length, 2); assert.match(h.element('compass-history').innerHTML, /关键是先确定定义域。/);
  assert.equal(h.calls.sounds.length, 1); assert.equal(h.calls.sounds[0].cue, 'delivery');
  assert.match(h.element('compass-pill-title').textContent, /独立解一道题/);
});

test('an unfinished action cannot be completed, and save failures preserve all local work', async () => {
  const h = harness(); h.api.render(snapshot({active: active()})); h.input('不要丢失'); h.check(0); h.click('complete');
  assert.equal(h.calls.requests.length, 0); h.click('save');
  h.calls.requests[0].reject(new Error('保存失败')); await flush();
  assert.equal(h.element('compass-note').value, '不要丢失'); assert.equal(h.document.querySelector('[data-compass-step="0"]').checked, true);
  assert.match(h.element('compass-save-state').textContent || h.element('compass-editor').innerHTML, /未保存/);
  assert.equal(h.calls.sounds.length, 0); h.click('save');
  assert.deepEqual(h.calls.requests[1].body, h.calls.requests[0].body);
  h.calls.requests[1].resolve(snapshot({now: time(200), active: active({version: 2, note: '不要丢失', checked: [true, false, false]})})); await flush();
});

test('a newer remote version locks a dirty draft until explicitly reloaded, without overwriting its text', async () => {
  const h = harness(); h.api.render(snapshot({active: active()})); h.input('本窗口的草稿'); h.check(0);
  const remote = active({version: 2, note: '另一窗口的已保存版本'});
  h.api.render(snapshot({now: time(200), active: remote}));
  assert.equal(h.element('compass-note').value, '本窗口的草稿'); assert.equal(h.element('compass-note').disabled, true);
  assert.equal(h.document.querySelector('[data-compass-step="0"]').disabled, true);
  for (const action of ['save', 'complete', 'park']) h.click(action);
  assert.equal(h.calls.requests.length, 0); h.click('reload');
  assert.equal(h.calls.requests[0].path, '/api/actions');
  h.calls.requests[0].resolve(snapshot({now: time(300), active: remote})); await flush();
  assert.equal(h.element('compass-note').value, remote.note); assert.equal(h.element('compass-note').disabled, false);
});

test('all server-supplied titles, notes, steps, reasons and card IDs are escaped in HTML', () => {
  const attack = '<img src=x onerror="evil()">', quote = 'math" onclick="evil()';
  const h = harness(); h.api.render(snapshot({recommendations: [card({id: quote, title: attack, why: attack, steps: [attack, attack, attack], prompt: attack})],
    active: active({title: attack, why: attack, prompt: attack, note: '</textarea><img src=x>', steps: [attack, attack, attack]}),
    history: [active({status: 'completed', title: attack, cardId: quote, note: attack, steps: [attack, attack, attack]})]}));
  for (const id of ['compass-editor', 'compass-recommendations', 'compass-history']) {
    assert.doesNotMatch(h.element(id).innerHTML, /<img| onclick="evil/); assert.match(h.element(id).innerHTML, /&lt;img|&quot;/);
  }
  assert.equal(h.element('compass-note').value, '</textarea><img src=x>');
  assert.equal(h.element('compass-pill-title').textContent, attack);
});

test('stale polling, including microsecond differences, cannot roll a newer action back', () => {
  const h = harness(); h.api.render(snapshot({now: time(300), active: active({version: 2, note: '新的'})}));
  h.api.render(snapshot({now: time(200), active: active({version: 1, note: '旧的'})}));
  assert.equal(h.element('compass-note').value, '新的');
  h.api.render(snapshot({now: time(400), active: active({version: 3, note: '更新'})}));
  assert.equal(h.element('compass-note').value, '更新');
});

test('a stale deferred poll cannot undo the action created by a successful request', async () => {
  const h = harness(); h.api.render(snapshot()); h.click('start');
  h.api.render(snapshot({now: time(150)})); h.calls.requests[0].resolve(snapshot({now: time(200), active: active()})); await flush();
  assert.match(h.element('compass-pill-subject').textContent, /正在实践/);
  assert.ok(h.document.querySelector('[data-compass-action="save"]'));
});

test('unavailable secure UUID support fails without sending a mutation', async () => {
  const h = harness({crypto: {}}); h.api.render(snapshot()); h.click('start'); await flush();
  assert.equal(h.calls.requests.length, 0); assert.equal(h.calls.toasts[0][2], true);
});
