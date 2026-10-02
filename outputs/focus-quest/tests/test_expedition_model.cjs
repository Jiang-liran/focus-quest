const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {build, preview, replayFrames} = require('../static/expedition-model.js');

const TODAY = '2026-09-24';
const IDS = ['math', 'cs', 'politics', 'english'];
const TARGETS = [180, 180, 60, 60];
function state(values = {}, patch = {}) {
  const subjects = IDS.map((id, index) => ({id, minutes: values[id] || 0, target: TARGETS[index], percent: 999}));
  return {date: TODAY, today: TODAY, totals: {minutes: subjects.reduce((n, item) => n + item.minutes, 0), target: 480, percent: 999},
    subjects, records: [], dayRecordCount: 0, ...patch};
}
function record(id, minutes, subject = 'math', patch = {}) {
  return {id, name: `任务 ${id}`, subject, minutes, day: TODAY, source: 'tomatodo',
    start: `${TODAY}T09:00:00+08:00`, end: `${TODAY}T10:00:00+08:00`, ...patch};
}
function frozen(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}
function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); }

test('daily and four landmark progress use real minutes, never rounded server percentages', () => {
  const model = build(state({math: 240, cs: 60, politics: 30, english: 0}));
  assert.equal(model.minutes, 330);
  assert.equal(model.percent, 68.75);
  assert.equal(model.progress, .6875);
  assert.equal(model.stage, 2);
  assert.deepEqual(model.subjects.map(item => item.landmark), ['观测台', '逻辑工坊', '议事书庭', '译风港']);
  const math = model.subjects[0];
  close(math.percent, 133.33333333333331);
  assert.equal(math.progress, 1);
  assert.equal(math.status, 'over');
  assert.equal(math.excessMinutes, 60);
  assert.equal(model.subjects[3].status, 'waiting');
});

test('quarter stages retain original 0 through 4 art contract', () => {
  for (const [percent, stage] of [[0, 0], [24.999, 0], [25, 1], [49.999, 1], [50, 2], [75, 3], [99.999, 3], [100, 4], [133, 4]]) {
    const model = build(state({}, {totals: {minutes: percent, target: 100}}));
    assert.equal(model.stage, stage);
    assert.equal(model.percent, percent);
  }
});

test('all seven discovery thresholds unlock at exact true minute boundaries', () => {
  const thresholds = [0, 10, 25, 40, 60, 80, 100];
  for (let index = 0; index < thresholds.length; index++) {
    const minutes = thresholds[index] * 4.8;
    const model = build(state({}, {totals: {minutes, target: 480}}));
    assert.equal(model.discoveryIndex, index);
    assert.equal(model.currentDiscovery.index, index);
    assert.equal(model.discoveries.filter(item => item.unlocked).length, index + 1);
    if (index) assert.equal(build(state({}, {totals: {minutes: minutes - .00001, target: 480}})).discoveryIndex, index - 1);
    if (index < 6) close(model.nextDiscovery.remainingMinutes, 480 * thresholds[index + 1] / 100 - minutes);
    else assert.equal(model.nextDiscovery, null);
  }
  assert.equal(new Set(build(state()).discoveries.map(item => item.name)).size, 7);
});

test('goal completion and excess produce finite decorative afterglow only', () => {
  const exact = build(state({}, {totals: {minutes: 480, target: 480}}));
  assert.equal(exact.complete, true);
  assert.equal(exact.afterglow.active, false);
  const over = build(state({}, {totals: {minutes: 720, target: 480}}));
  assert.equal(over.percent, 150);
  assert.equal(over.progress, 1);
  assert.equal(over.afterglow.minutes, 240);
  assert.equal(over.afterglow.intensity, .5);
  assert.equal(over.afterglow.starCount, 6);
  for (const key of ['coins', 'diamonds', 'xp', 'reward']) assert.equal(key in over, false);
});

test('zero goals remain unset with no fictional completion or next milestone', () => {
  const input = state({math: 40}, {totals: {minutes: 40, target: 0}});
  input.subjects.forEach(item => { item.target = 0; });
  const model = build(input);
  assert.equal(model.minutes, 40);
  assert.equal(model.percent, 0);
  assert.equal(model.progress, 0);
  assert.equal(model.goalSet, false);
  assert.equal(model.complete, false);
  assert.equal(model.nextDiscovery, null);
  assert.equal(model.afterglow.active, false);
  assert.ok(model.subjects.every(item => item.status === 'unset' && item.percent === 0));
});

test('historical and future selected days do not get described as today', () => {
  const historical = build(state({}, {date: '2026-09-23'}));
  assert.equal(historical.isToday, false);
  assert.equal(historical.isHistorical, true);
  assert.equal(build(state({}, {date: '2026-09-25'})).isHistorical, false);
  assert.equal(build(state()).isToday, true);
});

test('dirty inputs are finite, safe and do not manufacture subject data', () => {
  for (const input of [undefined, null, false, [], 'hello']) {
    const model = build(input);
    assert.equal(model.minutes, 0);
    assert.equal(model.subjects.length, 4);
    assert.equal(model.isToday, false);
    assert.equal(model.target, 0);
  }
  const model = build({date: '2026-02-30', today: TODAY, totals: {minutes: Infinity, target: NaN}, subjects: [null,
    {id: 'math', minutes: '15.5', target: '30'}, {id: 'math', minutes: 999, target: 999},
    {id: 'cs', minutes: -5, target: false}, {id: 'evil', minutes: 100, target: 20}]});
  assert.equal(model.minutes, 15.5);
  assert.equal(model.target, 30);
  assert.equal(model.date, TODAY);
  assert.equal(model.subjects[1].minutes, 0);
  const extreme = build({totals: {minutes: Number.MAX_VALUE, target: Number.MIN_VALUE}});
  assert.ok(Number.isFinite(extreme.percent));
  function finiteNumbers(value) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
    else if (value && typeof value === 'object') Object.values(value).forEach(finiteNumbers);
  }
  finiteNumbers(extreme);
});

test('unknown subjects can advance the main expedition without constructing any landmark', () => {
  const model = build(state({}, {totals: {minutes: 25, target: 480}}));
  assert.equal(model.otherMinutes, 25);
  assert.ok(model.subjects.every(item => item.progress === 0));
  const replay = replayFrames(state({}, {totals: {minutes: 25, target: 480}, records: [record('other', 25, 'other')], dayRecordCount: 1}));
  assert.equal(replay.frames[1].minutes, 25);
  assert.equal(replay.frames[1].model.otherMinutes, 25);
});

test('preview scales each independent target and leaves the live input and XP untouched', () => {
  const input = frozen(state({math: 95, english: 15}, {totals: {minutes: 110, target: 480, xp: 1234}, settings: {motion: true}}));
  const saved = JSON.stringify(input);
  const model = preview(input, 50);
  assert.equal(model.preview, true);
  assert.equal(model.minutes, 240);
  assert.deepEqual(model.subjects.map(item => item.minutes), [90, 90, 30, 30]);
  assert.ok(model.subjects.every(item => item.percent === 50));
  assert.equal(preview(input, 150).afterglow.active, true);
  assert.equal(preview(input, 'bad').minutes, 0);
  assert.equal(JSON.stringify(input), saved);
  assert.equal(input.totals.xp, 1234);
});

test('replay orders real completions by end, then stable ID, without mutating records', () => {
  const records = [record('b', 20, 'cs'), record('a', 10), record('later', 30, 'english', {end: `${TODAY}T11:00:00+08:00`})];
  const input = frozen(state({math: 10, cs: 20, english: 30}, {records, dayRecordCount: 3}));
  const replay = replayFrames(input);
  assert.deepEqual(replay.frames.map(frame => frame.minutes), [0, 10, 30, 60]);
  assert.deepEqual(replay.frames.slice(1).flatMap(frame => frame.records.map(item => item.id)), ['a', 'b', 'later']);
  assert.deepEqual(replay.frames[2].subjectMinutes, {math: 10, cs: 20, politics: 0, english: 0});
  assert.deepEqual(replay.frames.at(-1).model, build(input));
  assert.equal(replay.summary.totalRecords, 3);
  assert.equal(replay.summary.partial, false);
  assert.equal(replay.summary.replayable, true);
  assert.deepEqual(input.records.map(item => item.id), ['b', 'a', 'later']);
});

test('records replay by server archive day, preserving cross-midnight effective minutes whole', () => {
  const cross = record('midnight', 90, 'math', {start: '2026-09-23T23:00:00+08:00', end: '2026-09-24T00:30:00+08:00', day: '2026-09-23'});
  const yesterday = state({math: 90}, {date: '2026-09-23', records: [cross, record('today', 20)], dayRecordCount: 1});
  const replay = replayFrames(yesterday);
  assert.equal(replay.summary.availableMinutes, 90);
  assert.equal(replay.summary.outsideDay, 1);
  assert.equal(replay.frames[1].minutes, 90);
  assert.equal(replay.frames[1].model.isHistorical, true);
});

test('canonical IDs deduplicate repeated entries but equal names or timestamps remain real separate records', () => {
  const same = record('same', 10);
  const input = state({math: 20}, {records: [same, {...same}, {...same, id: 'other-id'}], dayRecordCount: 2});
  const replay = replayFrames(input);
  assert.equal(replay.summary.duplicates, 1);
  assert.equal(replay.summary.availableRecords, 2);
  assert.equal(replay.frames.at(-1).minutes, 20);
  assert.equal(replay.frames.at(-1).recordCount, 2);
});

test('invalid, uncompleted-shape and unrelated records do not invent replay tasks', () => {
  const dirty = [null, {}, record('bad-minutes', -1), record('nan', NaN), record('zero', 0),
    record('bad-time', 1, 'math', {end: 'not-a-date'}), record('', 10), record('no-day', 10, 'math', {day: null}),
    record('wrong-day', 20, 'math', {day: '2026-09-23'}), record('actual', 10)];
  const replay = replayFrames(state({math: 10}, {records: dirty, dayRecordCount: 1, latestRecords: [record('latest-other-date', 50)]}));
  assert.equal(replay.summary.availableRecords, 1);
  assert.equal(replay.summary.invalidRecords, 8);
  assert.equal(replay.summary.outsideDay, 1);
  assert.deepEqual(replay.frames[1].records.map(item => item.id), ['actual']);
  assert.equal(replay.frames.at(-1).minutes, 10);
});

test('the last 100 API rows begin from an explicit known baseline and end at full authoritative statistics', () => {
  const records = Array.from({length: 100}, (_, index) => record(String(index).padStart(3, '0'), 1, index % 2 ? 'cs' : 'math'));
  const input = state({math: 80, cs: 80}, {records, dayRecordCount: 130});
  const replay = replayFrames(input);
  assert.equal(replay.summary.totalRecords, 130);
  assert.equal(replay.summary.availableRecords, 100);
  assert.equal(replay.summary.missingRecords, 30);
  assert.equal(replay.summary.baselineMinutes, 60);
  assert.equal(replay.summary.partial, true);
  assert.equal(replay.frames[0].minutes, 60);
  assert.equal(replay.frames[0].recordCount, 30);
  assert.equal(replay.frames[0].baseline, true);
  assert.deepEqual(replay.frames[0].subjectMinutes, {math: 30, cs: 30, politics: 0, english: 0});
  assert.equal(replay.frames.at(-1).recordCount, 130);
  assert.deepEqual(replay.frames.at(-1).model, build(input));
  assert.equal(replay.frames.flatMap(frame => frame.records).length, 100);
});

test('visual grouping has a bounded frame count and preserves every real task exactly once', () => {
  const records = Array.from({length: 199}, (_, index) => record(String(index).padStart(3, '0'), .5));
  const input = state({math: 99.5}, {records, dayRecordCount: 199});
  for (const limit of [undefined, 2, 10, 26, 30, 999]) {
    const replay = replayFrames(input, {maxFrames: limit});
    assert.ok(replay.frames.length <= (limit === undefined ? 26 : Math.min(30, limit)));
    assert.equal(new Set(replay.frames.flatMap(frame => frame.records.map(row => row.id))).size, 199);
    assert.equal(replay.frames.reduce((n, frame) => n + frame.completedCount, 0), 199);
    assert.equal(replay.frames.at(-1).minutes, 99.5);
    assert.equal(replay.summary.grouped, true);
    assert.equal(replay.summary.totalRecords, 199);
  }
});

test('empty-day replay is a single truthful start frame; unavailable rows never become fake tasks', () => {
  const empty = replayFrames(state());
  assert.equal(empty.frames.length, 1);
  assert.equal(empty.frames[0].minutes, 0);
  assert.equal(empty.summary.replayable, false);
  const missing = replayFrames(state({math: 50}, {records: [], dayRecordCount: 3}));
  assert.equal(missing.frames.length, 1);
  assert.equal(missing.frames[0].minutes, 50);
  assert.equal(missing.frames[0].records.length, 0);
  assert.equal(missing.summary.missingRecords, 3);
  assert.equal(missing.summary.partial, true);
});

test('inconsistent snapshots return an authoritative static model instead of altering real minutes', () => {
  const input = state({math: 5}, {records: [record('too-large', 10)], dayRecordCount: 1});
  const replay = replayFrames(input);
  assert.equal(replay.summary.consistent, false);
  assert.equal(replay.summary.replayable, false);
  assert.equal(replay.frames.length, 1);
  assert.deepEqual(replay.frames[0].model, build(input));
  assert.equal(replay.frames[0].minutes, 5);
});

test('fractional records preserve cumulative precision and exact server final rounding', () => {
  const input = state({math: .3}, {records: [record('a', .1), record('b', .2)], dayRecordCount: 2});
  const replay = replayFrames(input);
  assert.equal(replay.summary.consistent, true);
  assert.equal(replay.frames.at(-1).minutes, .3);
  assert.deepEqual(replay.frames.at(-1).model, build(input));
});

test('result mutation cannot alter live input, exported definitions or subsequent models', () => {
  const input = frozen(state({math: 10}, {records: [record('r', 10)], dayRecordCount: 1}));
  const model = build(input);
  model.subjects[0].landmark = 'changed';
  model.discoveries[0].name = 'changed';
  const replay = replayFrames(input);
  replay.frames[1].records[0].minutes = 999;
  assert.equal(input.records[0].minutes, 10);
  assert.equal(build(input).subjects[0].landmark, '观测台');
  assert.equal(build(input).discoveries[0].name, '晨雾营地');
});

test('UMD browser export is pure and matches the CommonJS API without clock or DOM dependencies', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../static/expedition-model.js'), 'utf8'), context);
  assert.equal(typeof context.FocusExpeditionModel.build, 'function');
  assert.equal(typeof context.FocusExpeditionModel.preview, 'function');
  assert.equal(typeof context.FocusExpeditionModel.replayFrames, 'function');
  assert.equal(context.FocusExpeditionModel.build(state({math: 120})).percent, 25);
});


test('four-subject resonance is independent of the daily total goal', () => {
  const overloaded = build(state({math: 300, cs: 180, politics: 60, english: 59}));
  assert.equal(overloaded.complete, true, 'extra math can complete the total goal');
  assert.deepEqual(overloaded.resonance, {active: false, completed: 3, total: 4}, 'extra math cannot replace English');
  const balanced = build(state({math: 180, cs: 180, politics: 60, english: 60}, {totals: {minutes: 480, target: 600}}));
  assert.equal(balanced.complete, false, 'a larger independent daily goal is still unfinished');
  assert.deepEqual(balanced.resonance, {active: true, completed: 4, total: 4});
});

test('resonance uses exact subject boundaries and follows deleted time or changed goals', () => {
  const input = state({math: 180, cs: 180, politics: 60, english: 59.999});
  assert.equal(build(input).resonance.active, false);
  input.subjects[3].minutes = 60;
  assert.equal(build(input).resonance.active, true);
  input.subjects[0].target = 181;
  assert.deepEqual(build(input).resonance, {active: false, completed: 3, total: 4});
  input.subjects[0].target = 180;
  input.subjects[2].minutes = 59;
  assert.equal(build(input).resonance.active, false);
});

test('missing, zero-goal, duplicate and unknown subjects cannot manufacture four-way resonance', () => {
  const complete = state({math: 180, cs: 180, politics: 60, english: 60});
  const missing = {...complete, subjects: complete.subjects.slice(0, 3)};
  assert.equal(build(missing).resonance.active, false);
  assert.equal(build(missing).resonance.completed, 3);
  const zero = {...complete, subjects: complete.subjects.map(s => s.id === 'english' ? {...s, target: 0} : s)};
  assert.equal(build(zero).resonance.active, false);
  const duplicate = {...missing, subjects: [...missing.subjects, {...complete.subjects[0]}, {id: 'other', minutes: 500, target: 1}]};
  assert.equal(build(duplicate).resonance.completed, 3);
  const conflicted = {...complete, subjects: [{id: 'english', target: 60, minutes: 0}, ...complete.subjects]};
  assert.equal(build(conflicted).resonance.active, false, 'the canonical first row still controls a duplicated subject');
  assert.equal(build(undefined).resonance.active, false);
});

test('four-way resonance follows visual previews without granting or mutating anything', () => {
  const input = frozen(state({math: 15}, {wallet: {coins: 42, diamonds: 7}}));
  const before = JSON.stringify(input);
  assert.equal(preview(input, 99.999).resonance.active, false);
  assert.equal(preview(input, 100).resonance.active, true);
  assert.equal(preview(input, 150).resonance.active, true);
  const unset = state(); unset.subjects[3].target = 0;
  assert.equal(preview(unset, 100).resonance.active, false, 'preview must not invent an unset subject goal');
  assert.equal(build(input).resonance.active, false);
  assert.equal(JSON.stringify(input), before);
});

test('chronological replay reaches resonance only when the final subject really completes', () => {
  const records = [record('1', 180), record('2', 180, 'cs'), record('3', 60, 'politics'), record('4', 60, 'english')];
  const input = frozen(state({math: 180, cs: 180, politics: 60, english: 60}, {records, dayRecordCount: 4}));
  const frames = replayFrames(input).frames;
  assert.deepEqual(frames.map(frame => frame.model.resonance.completed), [0, 1, 2, 3, 4]);
  assert.deepEqual(frames.map(frame => frame.model.resonance.active), [false, false, false, false, true]);
});

test('replay keeps actual starts, infers missing starts, and never replaces source records',()=>{
  const records=[record('actual',30,'math',{start:`${TODAY}T08:02:00+08:00`,end:`${TODAY}T08:35:00+08:00`}),record('legacy',30,'math',{start:null,end:`${TODAY}T10:30:00+08:00`})];
  const input=frozen(state({math:60},{records,dayRecordCount:2})),output=replayFrames(input).frames.slice(1).flatMap(frame=>frame.records);
  assert.equal(output[0].start,records[0].start);assert.equal(output[0].startInferred,false);assert.equal(Date.parse(output[1].start),Date.parse(records[1].end)-30*60000);assert.equal(output[1].startInferred,true);assert.equal(records[1].start,null);
});
