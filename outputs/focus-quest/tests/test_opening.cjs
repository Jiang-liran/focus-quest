const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const {compose} = require('../static/opening.js');

const day = '2026-09-23';
const at = (hour, minute = 0) => new Date(2026, 8, 23, hour, minute, 0).toISOString();
const input = (hour, patch = {}) => ({day, now: at(hour), minutes: 0, target: 480, ...patch});

for (const [hour, period, theme] of [
  [2, 'overnight', 'night'], [7, 'dawn', 'dawn'], [8, 'morning', 'morning'], [9, 'morning', 'morning'],
  [12, 'noon', 'noon'], [15, 'afternoon', 'afternoon'], [19, 'evening', 'evening'], [23, 'night', 'night'],
]) {
  test(`${hour}:00 gives the appropriate ${period} opening`, () => {
    const opening = compose(input(hour));
    assert.equal(opening.period, period);
    assert.equal(opening.theme, theme);
    assert.deepEqual(Object.keys(opening).sort(), ['period', 'eyebrow', 'title', 'body', 'closing', 'button', 'theme'].sort());
    assert.ok([...opening.title].length >= 10 && [...opening.title].length <= 18);
    assert.ok([...opening.body].length >= 45 && [...opening.body].length <= 80);
    assert.equal((opening.body.match(/。/g) || []).length, 2);
    assert.doesNotMatch(Object.values(opening).join(''), /比别人|落后|赶超|懒惰|摸鱼|必须|惩罚/);
  });
}

test('all seven time boundaries switch exactly at the start of the next period', () => {
  for (const [hour, before, after] of [
    [5, 'overnight', 'dawn'], [8, 'dawn', 'morning'], [11, 'morning', 'noon'],
    [14, 'noon', 'afternoon'], [18, 'afternoon', 'evening'], [22, 'evening', 'night'],
  ]) {
    assert.equal(compose(input(hour, {now: at(hour - 1, 59)})).period, before);
    assert.equal(compose(input(hour)).period, after);
  }
  assert.equal(compose(input(23, {now: at(23, 59)})).period, 'night');
  assert.equal(compose(input(0)).period, 'overnight');
});

test('early morning affirms gently, noon leaves room to start, and both night periods protect rest', () => {
  assert.match(compose(input(7)).body, /很好的开始/);
  assert.match(compose(input(12)).closing, /来得及/);
  for (const hour of [0, 2, 4, 22, 23]) {
    const opening = compose(input(hour));
    assert.equal(opening.button, '先安顿好自己');
    assert.match(opening.body, /睡眠|睡|休息/);
    assert.doesNotMatch(opening.body, /再学|继续学|加把劲|冲刺|坚持到/);
  }
});

test('existing study time receives acknowledgement rather than a first-step prompt', () => {
  for (const hour of [2, 7, 8, 9, 12, 15, 19, 23]) {
    const opening = compose(input(hour, {minutes: 30}));
    assert.notEqual(opening.body, compose(input(hour)).body);
    assert.match(opening.body, /已经/);
    assert.ok([...opening.body].length >= 45 && [...opening.body].length <= 80);
    assert.equal((opening.body.match(/。/g) || []).length, 2);
    assert.equal(opening.button, hour < 5 || hour >= 22 ? '先安顿好自己' : '继续今天的旅程');
  }
  assert.match(compose(input(9, {minutes: .01})).body, /已经/);
});

test('reaching the actual target takes priority over every time-of-day encouragement', () => {
  for (const hour of [2, 7, 8, 9, 12, 15, 19, 23]) {
    for (const minutes of [480, 600]) {
      const opening = compose(input(hour, {minutes}));
      assert.equal(opening.title, '今天的努力，已经好好收下');
      assert.match(opening.body, /目标已经完成/);
      assert.match(opening.body, /安心休息/);
      assert.equal(opening.button, '收下今天的努力');
      assert.equal(opening.theme, compose(input(hour)).theme);
      assert.doesNotMatch(opening.body, /再选|下一步|继续|再挑/);
    }
  }
  assert.notEqual(compose(input(9, {minutes: 479.999})).button, '收下今天的努力');
});

test('invalid or absent timestamps have a neutral, deterministic fallback', () => {
  for (const now of [undefined, null, '', 'broken', day, `${day}T08:00:00`, `${day}T30:00:00Z`, Infinity, {}]) {
    const opening = compose(input(9, {now}));
    assert.equal(opening.period, 'welcome');
    assert.equal(opening.theme, 'morning');
    assert.match(opening.title, /欢迎回来/);
    assert.doesNotMatch(opening.body, /清晨|上午|午间|午后|傍晚|深夜/);
  }
  assert.deepEqual(compose(), compose(null));
  assert.deepEqual(compose(), compose('invalid'));
  assert.equal(compose({minutes: 480, target: 480}).button, '收下今天的努力');
});

test('invalid durations and goals cannot invent prior study or a completed goal', () => {
  for (const minutes of [-10, NaN, Infinity, 'not-a-number', {}, [], true, Symbol('invalid')]) {
    assert.deepEqual(compose(input(9, {minutes})), compose(input(9)));
  }
  for (const target of [0, -1, NaN, Infinity, 'invalid', {}, [], true, Symbol('invalid')]) {
    const opening = compose(input(9, {minutes: 480, target}));
    assert.match(opening.body, /已经/);
    assert.equal(opening.button, '继续今天的旅程');
  }
  assert.equal(compose(input(9, {minutes: '480', target: '480'})).button, '收下今天的努力');
});

test('the same instant uses the machine timezone, rather than the hour written in the ISO input', () => {
  const modulePath = require.resolve('../static/opening.js');
  const code = `process.stdout.write(JSON.stringify(require(${JSON.stringify(modulePath)}).compose({now:'2026-09-23T00:00:00Z'})));`;
  for (const [timezone, expected] of [['Asia/Shanghai', 'morning'], ['America/New_York', 'evening']]) {
    const child = spawnSync(process.execPath, ['-e', code], {env: {...process.env, TZ: timezone}, encoding: 'utf8'});
    assert.equal(child.status, 0, child.stderr);
    assert.equal(JSON.parse(child.stdout).period, expected);
  }
});

test('browser composition is stateless, does not consult the real clock, and returns fresh objects', () => {
  const source = fs.readFileSync(require.resolve('../static/opening.js'), 'utf8');
  class ExplicitDate extends Date {
    constructor(...args) { assert.ok(args.length, 'must not read the real system clock'); super(...args); }
    static now() { throw new Error('must not read the real system clock'); }
  }
  const context = vm.createContext({Date: ExplicitDate});
  for (const name of ['localStorage', 'sessionStorage', 'document', 'fetch']) {
    Object.defineProperty(context, name, {get() { throw new Error(`must not access ${name}`); }});
  }
  vm.runInContext(source, context);
  assert.equal(typeof context.FocusOpening.compose, 'function');
  const value = Object.freeze(input(9));
  const before = JSON.stringify(value);
  const first = context.FocusOpening.compose(value);
  first.title = 'changed by caller';
  assert.notEqual(context.FocusOpening.compose(value).title, first.title);
  assert.equal(JSON.stringify(value), before);
  assert.equal(context.FocusOpening.compose({}).period, 'welcome');
  assert.equal(context.FocusOpening.compose({...value, day: '2099-01-01'}).period, 'morning');
});
