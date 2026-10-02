(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FocusAdvice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const amount = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const display = value => String(Math.round(value * 10) / 10);
  function duration(value) {
    const minutes = Math.round(amount(value) * 10) / 10;
    const hours = Math.floor(minutes / 60);
    const rest = Math.round((minutes - hours * 60) * 10) / 10;
    return hours ? `${hours} 小时${rest ? ` ${display(rest)} 分钟` : ''}` : `${display(rest)} 分钟`;
  }

  // All values remain plain text. The caller owns safe DOM rendering.
  function buildLines(state) {
    state = state || {};
    const lines = [];
    const ids = new Set();
    const add = (id, topic, title, text, tone = 'neutral') => {
      if (!text || ids.has(id)) return;
      ids.add(id);
      lines.push({id, topic, title: String(title || '营地向导'), text: String(text), tone});
    };
    const totals = state.totals || {};
    const main = state.advice || {};
    const current = Boolean(state.date && state.date === state.today);
    const period = current ? '今天' : '这一天';
    const minutes = amount(totals.minutes);
    const target = amount(totals.target);
    const complete = current && (main.id === 'complete' || (target > 0 && minutes >= target));
    // Use the server's local-time decision; do not infer the user's clock in JS.
    const resting = current && main.tone === 'rest';
    const takingABreak = complete || resting;

    add(`main:${main.id || 'default'}`, '整体节奏', main.title, main.text, main.tone || 'neutral');

    const activities = state.activities || {};
    const subjects = Array.isArray(activities.subjects) ? activities.subjects : [];
    subjects.forEach(subject => {
      const advice = subject.advice || {};
      if (advice.id === 'lecture-heavy' || advice.id === 'practice-focused') {
        add(`subject:${subject.id}:${advice.id}`, `${subject.name || '科目'} · 学习方式`,
          advice.title, advice.text, advice.tone || 'neutral');
      }
    });
    // If there is no focused subject tip, still offer the relevant way-of-study tip.
    if (!lines.some(line => line.id.startsWith('subject:')) && activities.advice) {
      const advice = activities.advice;
      const text = String(advice.text || '').replace(/\s*建议仅依据已记录时长，不评判学习效果。$/, '');
      add(`activity:${advice.id || 'overview'}`, '听课与做题', advice.title, text, advice.tone || 'neutral');
    }

    const week = state.weekly;
    if (week && amount(week.target) > 0 && week.start && week.end) {
      const weeklyMinutes = amount(week.minutes);
      const percent = display(weeklyMinutes / amount(week.target) * 100);
      const currentWeek = state.today && week.start <= state.today && state.today <= week.end;
      const pastWeek = state.today && week.end < state.today;
      const weeklyPeriod = currentWeek ? '本周' : '所选这一周';
      const facts = `${weeklyPeriod}已记录 ${duration(weeklyMinutes)}，周目标完成 ${percent}%。`;
      let title, text, tone = 'weekly';
      if (pastWeek) {
        title = '翻翻这周的冒险日志';
        text = `${facts}过去的差额不需要补追，回看记录是为了了解自己的节奏。`;
      } else if (!currentWeek) {
        title = '这一周的记录在这里';
        text = `${facts}这里显示的是所选日期所在周的进度。`;
      } else if (weeklyMinutes >= amount(week.target)) {
        title = '本周的任务已交付';
        text = `${facts}收下这份积累吧，超出的时间不会变成新的义务。`;
      } else if (takingABreak) {
        title = '周进度已经记下了';
        text = `${facts}进度会留在这里，眼下先安心休息。`;
      } else {
        title = '每次出征，都在推进这一周';
        text = `${facts}一周的安排可以有松有紧，不必每天一样。`;
      }
      add('weekly:progress', `${week.start} — ${week.end}`, title, text, tone);
    }

    if (minutes > 0) {
      add('npc:recorded', '营地闲聊', '这份投入，我替你记下了',
        `${period}的 ${duration(minutes)}已经记入远征日志。进度条背后，是你一段段完成的专注。`);
      add('npc:pace', '营地闲聊', '冒险也有自己的节奏',
        takingABreak ? '今天的记录已经妥善保存。歇一歇，也是让这场远征走得更久。' :
          '进度条记录投入的时间，掌握得怎样还要看实际反馈。下次安排，可以从一个具体的小目标开始。');
    } else {
      add('npc:empty', '营地闲聊', '日志还留着空白的一页',
        `${period}还没有完成的计时记录，进行中的任务会在完成后入账。暂时没有记录，也不等于没有付出。`);
      add('npc:ready', '营地闲聊', takingABreak ? '先在营地歇一会儿' : '从一件小事开始就好',
        takingABreak ? '现在不用追着进度条跑，先安心休息。等下一次出发，再把任务拆成轻松的小步。' :
          current ? '准备开始时，先挑一个具体的小任务。完成番茄 ToDo 的计时后，再来这里交任务。' :
            '没有记录的日子，也可以留在日志里。回顾是为了调整之后的安排，不需要补交过去的任务。');
    }
    const allTime = state.allTime || {};
    if (amount(allTime.minutes) > 0) {
      add('npc:journey', '营地闲聊', '旅途已经留下这些足迹',
        `远征日志累计记下了 ${duration(allTime.minutes)}。偶尔回头看看，也能看见一点点积累的分量。`);
    } else {
      add('npc:company', '营地闲聊', '我会在营地等你',
        '想看看安排时，就来和我聊一句。每次对话会从当前记录里换一个角度。');
    }
    add('npc:rest', '营地闲聊', '补给也是旅程的一部分',
      complete ? '今天的总时长目标已经完成。奖励收好，留一点时间给生活和休息吧。' :
        resting ? '现在先把肩膀放松，安心休息。未完成的安排可以留给下一次出发。' :
          '完成一段专注后，记得给自己一点休息时间。远征可以稳稳地走，不必一直冲刺。',
      takingABreak ? 'rest' : 'neutral');
    return lines;
  }

  function pickLine(lines, previousId, random = Math.random) {
    if (!Array.isArray(lines) || !lines.length) return null;
    const alternatives = lines.filter(line => line.id !== previousId);
    const pool = alternatives.length ? alternatives : lines;
    const sample = Number(random());
    const bounded = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 1) : 0;
    const index = Math.min(pool.length - 1, Math.floor(bounded * pool.length));
    return pool[index];
  }

  return {buildLines, pickLine};
});
