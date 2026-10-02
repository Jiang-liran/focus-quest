const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {characters, buildLines, pickLine} = require('../static/campfire-dialogue.js');
const script = fs.readFileSync(path.join(__dirname, '../static/campfire-dialogue.js'), 'utf8');
const topics = ['relax', 'story', 'advice'];

function sample(patch = {}) {
  return {
    date: '2026-09-24', today: '2026-09-24', totals: {minutes: 120, target: 480},
    advice: {id: 'steady', title: '看一眼安排', text: '今天已记录 2 小时。可以按实际情况调整后面的安排。', tone: 'neutral'},
    activities: {subjects: [], advice: {id: 'overview', title: '学习方式', text: '之后可以结合题目反馈调整学习方式。', tone: 'neutral'}},
    weekly: {start: '2026-09-21', end: '2026-09-27', minutes: 600, target: 3000},
    allTime: {minutes: 1200}, ...patch,
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test('four distinct characters have stable UI metadata', () => {
  assert.deepEqual(characters.map(c => c.id), ['guide', 'hearth', 'wanderer', 'stargazer']);
  assert.deepEqual(characters.map(c => c.name), ['栖灯', '阿榆', '闻舟', '望舒']);
  assert.equal(new Set(characters.map(c => c.accent)).size, 4);
  for (const character of characters) {
    for (const field of ['id', 'name', 'title', 'role', 'description', 'accent']) {
      assert.equal(typeof character[field], 'string');
      assert.ok(character[field].length > 0);
    }
    assert.match(character.accent, /^#[0-9a-f]{6}$/i);
    assert.equal(character.role, character.id);
  }
});

test('all 120 authored lines are complete and uniquely identified', () => {
  const all = [];
  for (const character of characters) {
    for (const topic of topics) {
      const lines = buildLines({}, character.id, topic).filter(line => !line.id.includes(':state:'));
      assert.equal(lines.length, 10, `${character.id}/${topic}`);
      for (const line of lines) {
        for (const field of ['id', 'character', 'topic', 'title', 'text', 'tone']) {
          assert.equal(typeof line[field], 'string');
          assert.ok(line[field].length);
        }
        assert.equal(line.character, character.id);
        assert.equal(line.topic, topic);
        assert.ok(line.text.length >= 20);
        assert.doesNotMatch(line.text, /TODO|lorem ipsum|待补充|你一定会考上|你肯定累了/i);
      }
      all.push(...lines);
    }
  }
  assert.equal(all.length, 120);
  assert.equal(new Set(all.map(line => line.id)).size, 120);
  assert.equal(new Set(all.map(line => line.text)).size, 120);
});

test('each explicit topic remains isolated instead of randomly switching topics', () => {
  for (const character of characters) {
    for (const topic of topics) {
      const lines = buildLines(sample(), character.id, topic);
      assert.ok(lines.every(line => line.character === character.id && line.topic === topic));
      for (const random of [0, .25, .5, .75, 1]) {
        assert.equal(pickLine(lines, [], () => random).topic, topic);
      }
    }
  }
});

test('every character/topic avoids the eight most recent lines across many draws', () => {
  for (const character of characters) {
    for (const topic of topics) {
      const lines = buildLines(sample(), character.id, topic);
      const recent = [];
      for (let draw = 0; draw < 100; draw += 1) {
        const chosen = pickLine(lines, recent, () => (draw * 17 % 53) / 53);
        assert.ok(lines.includes(chosen));
        assert.ok(!recent.slice(-8).includes(chosen.id), `${character.id}/${topic}, draw ${draw}`);
        recent.push(chosen.id);
      }
    }
  }
});

test('constant random input still rotates instead of sticking to the first line', () => {
  const lines = buildLines({}, 'hearth', 'relax');
  const recent = [];
  for (let draw = 0; draw < 40; draw += 1) {
    const line = pickLine(lines, recent, () => 0);
    assert.ok(!recent.slice(-8).includes(line.id));
    recent.push(line.id);
  }
});

test('a small exhausted pool chooses the least recently spoken line', () => {
  const lines = ['a', 'b', 'c'].map(id => ({id, text: `台词 ${id}`}));
  assert.equal(pickLine(lines, ['a', 'b', 'c'], () => 1).id, 'a');
  assert.equal(pickLine(lines, ['a', 'b', 'c', 'a'], () => 0).id, 'b');
  assert.equal(pickLine(lines, ['a', 'b', 'a', 'c'], () => 0).id, 'b');
  assert.equal(pickLine([lines[0]], ['a']).id, 'a');
  assert.equal(pickLine([], []), null);
  assert.equal(pickLine(null), null);
  assert.equal(pickLine([null, {}, {id: 'x', text: ''}]), null);
});

test('random boundaries, previous-ID compatibility, and duplicate IDs are safe', () => {
  const lines = buildLines({}, 'wanderer', 'story');
  for (const value of [-1, 0, .1, .9999, 1, 2, NaN, Infinity, -Infinity]) {
    const chosen = pickLine(lines, lines[0].id, () => value);
    assert.ok(lines.includes(chosen));
    assert.notEqual(chosen.id, lines[0].id);
  }
  const a = {id: 'a', text: '第一句'};
  const b = {id: 'b', text: '第二句'};
  assert.equal(pickLine([a, a, b], ['a'], () => 0), b);
  assert.equal(pickLine([a, a, b], null, () => 0), a);
});

test('only the guide study topic adds record-based advice', () => {
  const state = sample();
  const dynamic = buildLines(state, 'guide', 'advice').filter(line => line.id.includes(':state:'));
  assert.ok(dynamic.some(line => line.id === 'campfire:guide:state:main:steady'));
  assert.ok(dynamic.some(line => line.id === 'campfire:guide:state:weekly:progress'));
  assert.ok(dynamic.every(line => line.character === 'guide' && line.topic === 'advice'));
  assert.ok(!dynamic.some(line => line.id.includes(':npc:')));
  assert.equal(dynamic.find(line => line.id.endsWith('main:steady')).text, state.advice.text);
  for (const character of characters) {
    for (const topic of topics) {
      if (character.id === 'guide' && topic === 'advice') continue;
      assert.ok(!buildLines(state, character.id, topic).some(line => line.id.includes(':state:')));
    }
  }
});

test('rest mode keeps practical conversation from turning into immediate homework', () => {
  const state = sample({
    advice: {id: 'night-rest', title: '先休息', text: '先休息，记录会保留。', tone: 'rest'},
    activities: {subjects: [{id: 'math', name: '数学', advice: {
      id: 'lecture-heavy', title: '做题安排', text: '下一段马上做 25 分钟题。', tone: 'balance',
    }}]},
  });
  const lines = buildLines(state, 'guide', 'advice');
  assert.ok(lines.some(line => line.id.endsWith('main:night-rest')));
  assert.ok(!lines.some(line => line.id.includes('subject:math')));
  assert.doesNotMatch(lines.map(line => line.text).join('\n'), /马上做|现在开始|少摸鱼/);
  const completed = buildLines(sample({totals: {minutes: 480, target: 480},
    advice: {id: 'complete', title: '完成', text: '今天的目标已经完成，可以安心休息。', tone: 'success'}}), 'guide', 'advice');
  assert.ok(completed.some(line => line.id.endsWith('main:complete')));
});

test('historical views do not repeat stale claims about today', () => {
  const lines = buildLines(sample({date: '2026-09-16',
    weekly: {start: '2026-09-14', end: '2026-09-20', minutes: 600, target: 3000}}), 'guide', 'advice');
  assert.ok(!lines.some(line => line.id.endsWith('main:steady')));
  assert.doesNotMatch(lines.map(line => `${line.title} ${line.text}`).join('\n'), /今天|今日/);
  assert.match(lines.find(line => line.id.endsWith('weekly:progress')).text, /所选这一周/);
  const history = buildLines(sample({date: '2026-09-16',
    advice: {id: 'history', title: '历史记录', text: '这是所选日期的学习记录。', tone: 'neutral'}}), 'guide', 'advice');
  assert.ok(history.some(line => line.id.endsWith('main:history')));
});

test('input state, recent history, and authored lines are never mutated', () => {
  const state = deepFreeze(sample());
  const serialized = JSON.stringify(state);
  const first = buildLines(state, 'guide', 'advice');
  const recent = Object.freeze(first.slice(0, 8).map(line => line.id));
  const before = [...recent];
  assert.ok(pickLine(Object.freeze(first), recent, () => .4));
  assert.deepEqual([...recent], before);
  assert.equal(JSON.stringify(state), serialized);
  const text = first[0].text;
  first[0].text = 'caller-only edit';
  assert.equal(buildLines(state, 'guide', 'advice')[0].text, text);
});

test('unknown parameters fall back to the guide relaxation pool', () => {
  assert.deepEqual(buildLines(null), buildLines({}, 'guide', 'relax'));
  assert.deepEqual(buildLines(null, 'constructor', 'all'), buildLines({}, 'guide', 'relax'));
  assert.deepEqual(buildLines(null, {}, []), buildLines({}, 'guide', 'relax'));
});

test('browser UMD works before and after the advice module loads', () => {
  const browser = vm.createContext({});
  vm.runInContext(script, browser);
  const api = browser.FocusCampfireDialogue;
  assert.equal(api.characters.length, 4);
  assert.equal(api.buildLines({}, 'guide', 'advice').length, 10);
  browser.FocusAdvice = {buildLines: () => [{id: 'main:hello', title: '状态', text: '后加载的建议。', tone: 'neutral'}]};
  assert.ok(api.buildLines(sample(), 'guide', 'advice').some(line => line.text === '后加载的建议。'));
});

test('dynamic text is returned as plain text for safe DOM rendering', () => {
  const text = '<img src=x onerror=alert(1)> & "quote"';
  const lines = buildLines(sample({advice: {id: 'test', title: '<title>', text, tone: 'neutral'}}), 'guide', 'advice');
  const line = lines.find(line => line.id.endsWith('main:test'));
  assert.equal(line.text, text);
  assert.equal(line.title, '<title>');
});
