const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {buildLines, pickLine} = require('../static/advice.js');

function sample(patch = {}) {
  return {
    date: '2026-09-23', today: '2026-09-23',
    totals: {minutes: 120, target: 480},
    advice: {id: 'steady', title: '稳稳推进', text: '每一分钟都已记录。按自己的节奏安排。', tone: 'neutral'},
    activities: {subjects: [], advice: {id: 'steady', title: '安排学习方式', text: '按掌握情况调整。', tone: 'neutral'}},
    weekly: {start: '2026-09-21', end: '2026-09-27', minutes: 600, target: 3000},
    allTime: {minutes: 1200}, ...patch,
  };
}

test('random conversation excludes the last line at all boundaries', () => {
  const lines = buildLines(sample());
  assert.ok(lines.length >= 6);
  for (const previous of lines) {
    for (const value of [0, .01, .5, .999999, 1, -1, 2, NaN, Infinity]) {
      const selected = pickLine(lines, previous.id, () => value);
      assert.ok(lines.includes(selected));
      assert.notEqual(selected.id, previous.id);
    }
  }
  assert.equal(pickLine([], 'x'), null);
  assert.equal(pickLine(null, 'x'), null);
  assert.equal(pickLine([lines[0]], lines[0].id), lines[0]);
});

test('historical week is a recap without a catch-up assignment', () => {
  const lines = buildLines(sample({date: '2026-09-16',
    advice: {id: 'history', title: '历史', text: '回看这一天的记录。', tone: 'neutral'},
    weekly: {start: '2026-09-14', end: '2026-09-20', minutes: 1200, target: 3000}}));
  const week = lines.find(line => line.id === 'weekly:progress');
  assert.match(week.text, /所选这一周已记录 20 小时/);
  assert.match(week.text, /40%/);
  assert.match(week.text, /过去的差额不需要补追/);
  assert.doesNotMatch(week.text, /本周|还差|加油补/);
  assert.match(lines.find(line => line.id === 'npc:recorded').text, /这一天/);
});

test('browsing earlier in current week still labels weekly total as this week', () => {
  const lines = buildLines(sample({date: '2026-09-21'}));
  assert.match(lines.find(line => line.id === 'weekly:progress').text, /^本周/);
});

test('rest and completed-goal dialogue never adds immediate work', () => {
  for (const advice of [
    {id: 'night-rest', title: '夜深了', text: '现在先休息。', tone: 'rest'},
    {id: 'rest', title: '回营休息', text: '先休息。', tone: 'rest'},
    {id: 'complete', title: '目标达成', text: '今天先安心休息。', tone: 'success'},
  ]) {
    const data = sample({advice, totals: {minutes: advice.id === 'complete' ? 480 : 120, target: 480},
      activities: {subjects: [{id: 'math', name: '数学', advice: {
        id: 'lecture-heavy', title: '数学听课偏多',
        text: '今天听课偏多。先休息，下次学习时再安排做题。', tone: 'balance'}}]}});
    const lines = buildLines(data);
    assert.ok(lines.some(line => line.id === `main:${advice.id}`));
    assert.ok(lines.some(line => line.id === 'subject:math:lecture-heavy'));
    assert.match(lines.find(line => line.id === 'weekly:progress').text, /先安心休息/);
    assert.doesNotMatch(lines.map(line => line.text).join('\n'), /现在开始|下一段可以安排|先挑一个|下一轮|还差/);
  }
});

test('subject suggestions are present as separate choices and retain safe timing', () => {
  const math = {id: 'lecture-heavy', title: '数学听课偏多', text: '今天已听课 2 小时。下一段可以安排 25 分钟做题。', tone: 'balance'};
  const english = {id: 'practice-focused', title: '英语做题已有积累', text: '下次复盘时可以整理错因。', tone: 'neutral'};
  const lines = buildLines(sample({activities: {subjects: [
    {id: 'math', name: '数学', advice: math}, {id: 'english', name: '英语', advice: english},
  ]}}));
  assert.equal(lines.find(line => line.id === 'subject:math:lecture-heavy').text, math.text);
  assert.equal(lines.find(line => line.id === 'subject:english:practice-focused').text, english.text);
  assert.equal(new Set(lines.map(line => line.id)).size, lines.length);
  assert.deepEqual(lines.map(line => line.id), buildLines(sample({activities: {subjects: [
    {id: 'math', name: '数学', advice: math}, {id: 'english', name: '英语', advice: english},
  ]}})).map(line => line.id));
});

test('empty-day conversation remains useful, including during night rest', () => {
  const data = sample({totals: {minutes: 0, target: 480}, allTime: {minutes: 0}, activities: {}, weekly: null});
  assert.ok(buildLines(data).length >= 2);
  assert.match(buildLines(data).find(line => line.id === 'npc:empty').text, /进行中的任务会在完成后入账/);
  data.advice = {id: 'night-rest', title: '夜深了', text: '现在休息。', tone: 'rest'};
  const lines = buildLines(data);
  assert.match(lines.find(line => line.id === 'npc:ready').text, /先安心休息/);
  assert.doesNotMatch(lines.map(line => line.text).join('\n'), /先挑一个|准备开始时/);
  assert.ok(buildLines().length >= 2);
});

test('plain text preserves characters for the UI to render safely', () => {
  const text = '<img src=x onerror=alert(1)> & "quote"';
  const line = buildLines(sample({advice: {id: 'test', title: '<title>', text, tone: 'neutral'}}))[0];
  assert.equal(line.text, text);
  assert.equal(line.title, '<title>');
  assert.equal(typeof line.text, 'string');
});

test('browser script exposes the same API without require or dependencies', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../static/advice.js'), 'utf8'), context);
  assert.equal(typeof context.FocusAdvice.buildLines, 'function');
  assert.equal(typeof context.FocusAdvice.pickLine, 'function');
  assert.ok(context.FocusAdvice.buildLines(sample()).length > 1);
});
