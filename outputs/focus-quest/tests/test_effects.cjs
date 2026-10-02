const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {scene, unlocks} = require('../static/effects.js');

const today = '2026-09-23';
const definitions = [['math', '数学', 180], ['cs', '408', 180], ['politics', '政治', 60], ['english', '英语', 60]];
function state(values = {}, patch = {}) {
  const subjects = definitions.map(([id, name, target]) => ({id, name, target, minutes: values[id] || 0}));
  return {date: today, today, subjects,
    totals: {minutes: subjects.reduce((total, subject) => total + subject.minutes, 0), target: 480}, ...patch};
}
function record(subject = 'math', patch = {}) {
  return {id: 'record-1', subject, day: today, minutes: 1, ...patch};
}
function subjects(events) { return events.filter(event => event.type === 'subject'); }
function daily(events) { return events.filter(event => event.type === 'daily'); }

test('scene responds continuously within each quarter and clamps at both ends', () => {
  const start = scene(0);
  const middle = scene(12.5);
  const first = scene(25);
  assert.equal(start.progress, 0);
  assert.equal(middle.progress, .125);
  assert.equal(middle.stage, 0);
  assert.ok(start.pathOffset > middle.pathOffset && middle.pathOffset > first.pathOffset);
  assert.ok(start.mistOpacity > middle.mistOpacity && middle.mistOpacity > first.mistOpacity);
  assert.ok(start.glow < middle.glow && middle.glow < first.glow);
  for (const [percent, stage] of [[24.999, 0], [25, 1], [49.999, 1], [50, 2], [74.999, 2], [75, 3], [99.999, 3], [100, 4]]) {
    assert.equal(scene(percent).stage, stage);
  }
  assert.deepEqual(scene(-20), start);
  assert.deepEqual(scene(133), scene(100));
  assert.equal(scene(100).pathOffset, 0);
  assert.equal(scene(100).mistOpacity, 0);
  for (const invalid of [undefined, NaN, Infinity, 'bad']) assert.deepEqual(scene(invalid), start);
});

for (const stage of [1, 2, 3, 4]) {
  test(`daily quarter ${stage}/4 celebrates at its real minute threshold`, () => {
    const threshold = stage * 120;
    const before = state({}, {totals: {minutes: threshold - .001, target: 480, percent: stage * 25}});
    const after = state({}, {totals: {minutes: threshold, target: 480, percent: 0}});
    const events = unlocks(before, after, [record()]);
    assert.deepEqual(events, [{key: `daily:${today}:480:${stage}`, type: 'daily', stage, target: 480, percent: stage * 25}]);
    assert.deepEqual(unlocks(before, before, [record()]), []);
  });
}

test('bulk imports only celebrate the highest daily gate and never an extra overrun gate', () => {
  const initial = state();
  const complete = state({}, {totals: {minutes: 650, target: 480}});
  const events = daily(unlocks(initial, complete, [record()]));
  assert.equal(events.length, 1);
  assert.equal(events[0].stage, 4);
  assert.equal(events[0].percent, 650 / 480 * 100);
  assert.deepEqual(daily(unlocks(complete, state({}, {totals: {minutes: 800, target: 480}}), [record()])), []);
});

for (const [id, name, target] of definitions) {
  test(`${name} celebrates its own goal, independently of the overall goal`, () => {
    const before = state({[id]: target - 1});
    const after = state({[id]: target});
    const events = subjects(unlocks(before, after, [record(id)]));
    assert.deepEqual(events, [{key: `subject:${today}:${id}:${target}`, type: 'subject', id, name, target, percent: 100}]);
    assert.deepEqual(subjects(unlocks(before, after, [record(id === 'math' ? 'english' : 'math')])), []);
    assert.deepEqual(subjects(unlocks(after, state({[id]: target + 60}), [record(id)])), []);
  });
}

test('four subjects can finish together with one daily celebration, preserving subject order', () => {
  const before = state({math: 179, cs: 179, politics: 59, english: 59});
  const after = state({math: 180, cs: 180, politics: 60, english: 60});
  const events = unlocks(before, after, definitions.map(([id]) => record(id)));
  assert.deepEqual(events.map(event => event.id || event.type), ['math', 'cs', 'politics', 'english', 'daily']);
  assert.equal(events[4].stage, 4);
  assert.equal(new Set(events.map(event => event.key)).size, 5);
});

test('claimed keys suppress repeated sync and a delete/re-cross without mutating the claim set', () => {
  const before = state({math: 179});
  const after = state({math: 180});
  const original = unlocks(before, after, [record()]);
  assert.equal(original.length, 1);
  const claimed = new Set(original.map(event => event.key));
  const saved = [...claimed];
  assert.deepEqual(unlocks(before, after, [record()], claimed), []);
  assert.deepEqual(unlocks(after, after, [record()], claimed), []);
  assert.deepEqual(unlocks(before, after, [record()], saved), []);
  assert.deepEqual([...claimed], saved);
  const quarterBefore = state({}, {totals: {minutes: 100, target: 480}});
  const quarterAfter = state({}, {totals: {minutes: 120, target: 480}});
  const quarterKey = unlocks(quarterBefore, quarterAfter, [record()])[0].key;
  assert.deepEqual(unlocks(quarterBefore, quarterAfter, [record()], [quarterKey]), []);
});

test('settings-only changes and changed targets cannot manufacture a milestone', () => {
  const before = state({math: 179});
  const after = state({math: 180});
  assert.deepEqual(unlocks(before, after, []), []);
  const edited = state({math: 179});
  edited.subjects[0].target = 120;
  edited.totals.target = 420;
  assert.deepEqual(unlocks(before, edited, [record()]), []);
  const dailyBefore = state({}, {totals: {minutes: 119, target: 480}});
  const dailyAfter = state({}, {totals: {minutes: 120, target: 240}});
  assert.deepEqual(unlocks(dailyBefore, dailyAfter, [record()]), []);
});

test('opening the app, browsing history, changing date and midnight rollover never celebrate', () => {
  const before = state({math: 179});
  const after = state({math: 180});
  assert.deepEqual(unlocks(null, after, [record()]), []);
  assert.deepEqual(unlocks(before, null, [record()]), []);
  assert.deepEqual(unlocks({...before, date: '2026-09-22'}, after, [record()]), []);
  assert.deepEqual(unlocks({...before, date: '2026-09-22'}, {...after, date: '2026-09-22'}, [record('math', {day: '2026-09-22'})]), []);
  assert.deepEqual(unlocks(before, {...after, date: '2026-09-24', today: '2026-09-24'}, [record('math', {day: '2026-09-24'})]), []);
});

test('historical, zero-minute, invalid and unrelated fresh records cannot trigger subject rewards', () => {
  const before = state({math: 119, english: 59});
  const after = state({math: 180, english: 60});
  for (const fresh of [null, [], [null], [record('math', {day: '2026-09-22'})], [record('math', {minutes: 0})], [record('math', {minutes: -1})], [record('math', {minutes: NaN})], [record('math', {day: undefined})]]) {
    assert.deepEqual(unlocks(before, after, fresh), []);
  }
  const events = unlocks(before, after, [record('math', {day: '2026-09-22'}), record('english')]);
  assert.deepEqual(subjects(events).map(event => event.id), ['english']);
});

test('rounding a subject to 100% does not celebrate before the target is actually reached', () => {
  const before = state({math: 179});
  const after = state({math: 179.99});
  after.subjects[0].percent = 100;
  assert.deepEqual(subjects(unlocks(before, after, [record()])), []);
  const reached = state({math: 180.5});
  const [event] = subjects(unlocks(after, reached, [record()]));
  assert.equal(event.percent, 180.5 / 180 * 100);
});

test('keys distinguish dates and goal amounts, while malformed goals do not unlock', () => {
  const before = state({math: 179});
  const after = state({math: 180});
  const oldKey = unlocks(before, after, [record()])[0].key;
  const nextDay = '2026-09-24';
  assert.notEqual(unlocks({...before, date: nextDay, today: nextDay}, {...after, date: nextDay, today: nextDay},
    [record('math', {day: nextDay})], [oldKey])[0].key, oldKey);
  const largerBefore = state({math: 239});
  const largerAfter = state({math: 240});
  largerBefore.subjects[0].target = largerAfter.subjects[0].target = 240;
  assert.deepEqual(subjects(unlocks(largerBefore, largerAfter, [record()], [oldKey])).map(event => event.key),
    [`subject:${today}:math:240`]);
  for (const target of [0, -1, NaN]) {
    before.subjects[0].target = after.subjects[0].target = target;
    before.totals.target = after.totals.target = target;
    assert.deepEqual(unlocks(before, after, [record()]), []);
  }
});

test('module exports the same public API in the browser without Node globals', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../static/effects.js'), 'utf8'), context);
  assert.equal(typeof context.FocusEffects.scene, 'function');
  assert.equal(typeof context.FocusEffects.unlocks, 'function');
  assert.equal(context.FocusEffects.scene(50).stage, 2);
});
