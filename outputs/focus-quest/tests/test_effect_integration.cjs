const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Run the real refresh/reward/claim/dialog code. Only browser boundaries and
// unrelated page rendering are stubbed; no startup intervals are installed.
const source = fs.readFileSync(require.resolve('../static/app.js'), 'utf8');
const appFunctions = source.split("\ndocument.querySelectorAll('[data-view]')")[0];
assert.ok(appFunctions.includes('function checkNewRecords('));
assert.ok(appFunctions.includes('function playNextCelebration('));
const effects = fs.readFileSync(require.resolve('../static/effects.js'), 'utf8');
const day = '2026-09-23';
const now = Date.parse(`${day}T13:00:00Z`);
const claimStorage = 'focus-quest-effects-v1';

function record(id, patch = {}) {
  return {id, name: '复习数学', subject: 'math', day, minutes: 1,
    end: new Date(now - 1000).toISOString(), ...patch};
}
function state(math = 179, latestRecords = [record('old')], patch = {}) {
  const subjects = [
    {id: 'math', name: '数学', target: 180, minutes: math},
    {id: 'cs', name: '408', target: 180, minutes: 0},
    {id: 'politics', name: '政治', target: 60, minutes: 0},
    {id: 'english', name: '英语', target: 60, minutes: 60},
  ];
  return {date: day, today: day, latestRecords, subjects,
    totals: {minutes: math + 60, target: 480, percent: (math + 60) / 480 * 100, level: 3},
    settings: {motion: true, sound: true}, weekly: {start: '2026-09-21'}, ...patch};
}

function harness(saved = new Map()) {
  const elements = new Map(), timers = [], responses = [];
  const calls = {requests: [], sounds: 0, cues: [], enabled: false, toasts: [], modalCount: 0, storageWrites: 0, renderedStates: []};
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', innerHTML: '', hidden: false, open: false, dataset: {},
      style: {setProperty() {}}, classList: {remove() {}},
      showModal() { this.open = true; calls.modalCount++; },
      close() { this.open = false; },
    });
    return elements.get(id);
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = vm.createContext({
    Date: Clock,
    document: {
      getElementById: element,
      querySelector(selector) {
        assert.equal(selector, 'dialog[open]');
        return [...elements.values()].find(value => value.open) || null;
      },
    },
    FocusSubjectArt: {markup: id => `<svg data-subject="${id}"></svg>`},
    localStorage: {
      getItem: key => saved.get(key) || null,
      setItem(key, value) { saved.set(key, value); calls.storageWrites++; },
    },
    setTimeout(callback) { timers.push(callback); return timers.length; },
    fetch: async (path, options) => {
      calls.requests.push({path, options});
      assert.equal(path, '/api/state');
      assert.ok(responses.length, 'the test must supply a state response');
      const data = responses.shift();
      return {ok: true, json: async () => data};
    },
    FocusAudio: {setEnabled(value) {calls.enabled=value;}, play(cue,options) {if(!calls.enabled)return false;calls.sounds++;calls.cues.push({cue,...options});return true;}},
    calls,
  });
  vm.runInContext(effects, context);
  vm.runInContext(appFunctions, context);
  const run = code => vm.runInContext(code, context);
  run(`
    render=()=>calls.renderedStates.push(state.totals.minutes);
    toast=(title,detail,isError)=>calls.toasts.push({title,detail,isError});
  `);
  return {
    run, element, calls, saved,
    claims: () => JSON.parse(saved.get(claimStorage) || '[]'),
    async refresh(data, quiet = false) {
      responses.push(data);
      await run(`refresh(false,${quiet})`);
      assert.equal(element('error-banner').hidden, true, 'refresh must not hide a logic failure in the connection banner');
    },
    flushTimers() {
      for (let count = 0; timers.length; count++) {
        assert.ok(count < 20, 'unexpected recurring timer');
        timers.shift()();
      }
    },
  };
}

test('first read silently seeds already achieved subject and daily gates', async () => {
  const h = harness();
  await h.refresh(state(180));
  assert.equal(h.run('baselineReady'), true);
  assert.equal(h.run('seenRecords.has("old")'), true);
  assert.deepEqual(h.claims().sort(), [
    `subject:${day}:math:180`, `subject:${day}:english:60`,
    `daily:${day}:480:1`, `daily:${day}:480:2`,
  ].sort());
  h.flushTimers();
  assert.equal(h.calls.sounds, 0);
  assert.equal(h.calls.toasts.length, 0);
  assert.equal(h.calls.modalCount, 0);
  assert.equal(h.run('celebrationQueue.length'), 0);
});

test('one fresh minute queues math and 50% celebrations in order, with one sound and no repeat', async () => {
  const h = harness();
  await h.refresh(state());
  const completed = state(180, [record('new-math-minute'), record('old')]);
  await h.refresh(completed);
  assert.equal(h.run('state.totals.minutes'), 240);
  assert.deepEqual(h.calls.renderedStates, [239, 240], 'refresh keeps the old state during crossing detection');
  assert.equal(h.run('celebrationQueue.length'), 2);
  assert.equal(h.run('celebrationQueue[0].subject'), 'math');
  assert.equal(h.run('celebrationQueue[1].stage'), 2);
  assert.equal(h.calls.sounds, 1);
  const claimCount = h.calls.storageWrites;
  h.flushTimers();
  assert.equal(h.element('celebration-dialog').dataset.kind, 'math');
  assert.equal(h.element('celebration-dialog').open, true);
  assert.equal(h.run('celebrationQueue.length'), 1);
  assert.match(h.element('celebration-done').textContent, /下一份/);
  h.element('celebration-dialog').close();
  h.run('playNextCelebration()');
  assert.equal(h.element('celebration-dialog').dataset.kind, 'daily');
  assert.match(h.element('celebration-reward').textContent, /50%/);
  assert.equal(h.run('celebrationQueue.length'), 0);
  h.element('celebration-dialog').close();
  await h.refresh(completed);
  await h.refresh(state(179, [record('old')]));
  await h.refresh(completed); // Same canonical ID returns after a source reconciliation.
  h.flushTimers();
  assert.equal(h.calls.modalCount, 2);
  assert.equal(h.calls.sounds, 1);
  assert.equal(h.calls.storageWrites, claimCount);
  assert.equal(h.calls.toasts.length, 0);
});

test('quiet restore updates state and seen IDs without sound, celebration or task toast', async () => {
  const h = harness();
  await h.refresh(state());
  const completed = state(180, [record('restored-math'), record('old')]);
  await h.refresh(completed, true);
  assert.equal(h.run('state.totals.minutes'), 240);
  assert.equal(h.run('seenRecords.has("restored-math")'), true);
  await h.refresh(completed);
  h.flushTimers();
  assert.equal(h.calls.modalCount, 0);
  assert.equal(h.calls.sounds, 0);
  assert.equal(h.calls.toasts.length, 0);
  assert.equal(h.run('celebrationQueue.length'), 0);
});

test('subject and daily previews do not change claims, totals, seen IDs or issue API writes', async () => {
  const h = harness();
  await h.refresh(state());
  const before = h.run('JSON.stringify({state,seen:[...seenRecords],claims:[...effectClaims()]})');
  const writes = h.calls.storageWrites;
  h.run("showCelebration(celebrationFor({type:'subject',id:'math',name:'数学',target:180},true))");
  assert.equal(h.element('celebration-dialog').dataset.preview, 'true');
  assert.match(h.element('celebration-note').textContent, /不会增加学习时长或记录/);
  h.element('celebration-dialog').close();
  h.run("showCelebration(celebrationFor({type:'daily',stage:4,target:480},true))");
  assert.equal(h.element('celebration-dialog').dataset.preview, 'true');
  assert.equal(h.run('JSON.stringify({state,seen:[...seenRecords],claims:[...effectClaims()]})'), before);
  assert.equal(h.calls.storageWrites, writes);
  assert.equal(h.calls.requests.length, 1);
  assert.equal(h.calls.requests[0].options.method, undefined);
  assert.equal(h.run('celebrationQueue.length'), 0);
});

test('baseline claims block a deleted goal re-crossing, including after an app restart', async () => {
  const saved = new Map();
  const first = harness(saved);
  await first.refresh(state(180));
  await first.refresh(state(179, [record('old')]));
  await first.refresh(state(180, [record('different-new-id'), record('old')]));
  first.flushTimers();
  assert.equal(first.calls.modalCount, 0, 'new task can be recorded without claiming the same milestone again');
  assert.equal(first.calls.toasts.length, 1);
  const restarted = harness(saved);
  await restarted.refresh(state(179, [record('old')]));
  await restarted.refresh(state(180, [record('next-session-new-id'), record('old')]));
  restarted.flushTimers();
  assert.equal(restarted.calls.modalCount, 0);
  assert.equal(restarted.run('celebrationQueue.length'), 0);
});

test('motion disabled still records claims and gives a task toast, without queued modal animations', async () => {
  const h = harness();
  const settings = {motion: false, sound: false};
  await h.refresh(state(179, [record('old')], {settings}));
  await h.refresh(state(180, [record('new'), record('old')], {settings}));
  h.flushTimers();
  h.run('playNextCelebration()');
  assert.equal(h.calls.toasts.length, 1);
  assert.equal(h.calls.sounds, 0);
  assert.equal(h.calls.modalCount, 0);
  assert.equal(h.run('celebrationQueue.length'), 0);
  assert.ok(h.claims().includes(`subject:${day}:math:180`));
  assert.ok(h.claims().includes(`daily:${day}:480:2`));
});

test('turning motion off while a settings dialog blocks the queue prevents delayed celebration modals', async () => {
  const h = harness();
  await h.refresh(state());
  h.element('settings-dialog').open = true;
  const completed = state(180, [record('new'), record('old')]);
  await h.refresh(completed);
  h.flushTimers();
  assert.equal(h.run('celebrationQueue.length'), 2);
  assert.equal(h.calls.modalCount, 0);
  await h.refresh({...completed, settings: {motion: false, sound: false}});
  h.element('settings-dialog').close();
  h.run('playNextCelebration()');
  assert.equal(h.calls.modalCount, 0);
  assert.equal(h.run('celebrationQueue.length'), 0);
});


test('real progress chooses milestone, subject and victory cues, also with animation off', async () => {
  const milestone=harness();
  await milestone.refresh(state());
  await milestone.refresh(state(180,[record('new'),record('old')]));
  assert.deepEqual(milestone.calls.cues,[{cue:'milestone',key:`daily:${day}:480:2`}]);

  const subject=harness();
  const total={minutes:200,target:480,percent:200/480*100,level:3};
  await subject.refresh(state(179,[record('old')],{totals:total}));
  await subject.refresh(state(180,[record('new'),record('old')],{totals:{...total,minutes:201}}));
  assert.deepEqual(subject.calls.cues,[{cue:'subject',key:`subject:${day}:math:180`}]);

  const victory=harness(),settings={motion:false,sound:true};
  await victory.refresh(state(419,[record('old')],{settings}));
  await victory.refresh(state(420,[record('new'),record('old')],{settings}));
  assert.deepEqual(victory.calls.cues,[{cue:'victory',key:`daily:${day}:480:4`}]);
  assert.equal(victory.run('celebrationQueue.length'),0);
});

test('a live city route reserves its milestone cue for actual building awakening', async () => {
  const h=harness();
  h.run('globalThis.FocusCitadel={acceptProgress:()=>true}');
  await h.refresh(state(178));
  await h.refresh(state(178,[record('new'),record('old')],{totals:{minutes:240,target:480,percent:50,level:3}}));
  assert.deepEqual(h.calls.cues,[{cue:'completion',key:'completion:new'}]);
  assert.equal(h.run('celebrationQueue.length'),0);
});

test('the latest sound preference applies before processing a fresh record', async () => {
  const h=harness();
  await h.refresh(state());
  await h.refresh(state(180,[record('new'),record('old')],{settings:{motion:true,sound:false}}));
  assert.equal(h.calls.enabled,false);
  assert.equal(h.calls.sounds,0);
  await h.refresh(state(181,[record('another'),record('new'),record('old')],{settings:{motion:true,sound:true}}));
  assert.deepEqual(h.calls.cues,[{cue:'completion',key:'completion:another'}]);
});

test('historical imports, date browsing and old arrivals stay silent', async () => {
  const h=harness();
  await h.refresh(state());
  await h.refresh(state(180,[record('import',{source:'history_xlsx'}),record('old')]));
  await h.refresh(state(180,[record('old-record',{end:new Date(now-3600000).toISOString()}),record('import',{source:'history_xlsx'}),record('old')]));
  await h.refresh(state(180,[record('old-record',{end:new Date(now-3600000).toISOString()}),record('import',{source:'history_xlsx'}),record('old')],{date:'2026-09-22'}));
  assert.equal(h.calls.sounds,0);
});
