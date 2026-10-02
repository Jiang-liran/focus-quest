(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FocusOpening = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const words = {
    overnight: {
      theme: 'night', eyebrow: '凌晨 · 先照顾自己',
      title: '夜已经深了，先把自己照顾好',
      body: '这个时辰不必急着开始，把睡眠和身体放在今天的前面。若只是来看看记录，就安心收下已有的努力，等休息好了再启程。',
      continuing: '今天已经留下了你的专注，不必在这个时辰再加码。把没做完的事轻轻放下，先睡好觉，清醒以后再回来接着走。',
      closing: '睡好这一觉，也是在向前。', button: '先安顿好自己',
    },
    dawn: {
      theme: 'dawn', eyebrow: '清晨 · 留一点安静给自己',
      title: '晨光刚好，慢慢铺开今天的路',
      body: '清晨能为自己留出一段安静的时间，已经是很好的开始。先喝点水，选一件想弄明白的小事，让今天从踏实的一步展开。',
      continuing: '今天已经有了一段踏实的投入，清晨不需要把步子迈得太急。给自己留点喝水和吃早餐的时间，再顺着刚才的思路慢慢往前走。',
      closing: '愿今天的认真，也带着从容。', button: '开启今日远征',
    },
    morning: {
      theme: 'morning', eyebrow: '上午 · 从眼前的一步开始',
      title: '把眼前这一小步，走得踏实',
      body: '上午的光正好，可以先把注意力放回眼前的一件小事。把任务拆成一段能完成的专注，给自己一点进入状态的时间，慢慢来就好。',
      continuing: '今天已经有了一段认真的投入，这些时间都稳稳记在这里。先看看刚才留下的问题，再挑一个具体的小目标，让接下来的专注更清楚。',
      closing: '不急着走远，先把这一步走好。', button: '带着从容出发',
    },
    noon: {
      theme: 'noon', eyebrow: '午间 · 此刻也可以是起点',
      title: '从此刻开始，今天依然有余地',
      body: '走到午间，今天仍有可以好好利用的片刻，不需要急着追赶。先照顾午饭和休息，再选一件愿意开始的小事，接下来的路一段段走。',
      continuing: '今天已经留下了你的投入，午间正好让身体和思路都缓一缓。先好好吃饭、休息，再看下午最想弄明白什么，把下一步安排得轻一点。',
      closing: '从现在开始，也来得及。', button: '带着从容出发',
    },
    afternoon: {
      theme: 'afternoon', eyebrow: '午后 · 让下一步清楚一点',
      title: '把心收回来，先完成眼前一步',
      body: '午后的任务不必一次想完，先找出此刻最值得弄明白的一件事。可以是一道题、一个知识点，或一小段复盘，把注意力放在这一小步上。',
      continuing: '今天已经积累了一段专注，接下来可以沿着已有的思路继续。先看看哪一个问题还没想通，挑出最具体的下一步，再给自己留一点休息。',
      closing: '下一步清楚了，路就近了一点。', button: '带着从容出发',
    },
    evening: {
      theme: 'evening', eyebrow: '傍晚 · 小步也有自己的分量',
      title: '让傍晚的一小步，也有分量',
      body: '天色渐晚，接下来的安排可以轻一些，给自己留出吃饭和放松的时间。如果还有精神，就挑一件小事慢慢完成，让今天留下踏实的收获。',
      continuing: '今天已经做过的努力都在这里，不用因为天色渐晚就急着加码。先照顾晚饭和休息，如果还有余力，再挑一件小事，把思路轻轻收拢。',
      closing: '一小步，也值得被好好记下。', button: '带着从容出发',
    },
    night: {
      theme: 'night', eyebrow: '深夜 · 给今天一个温柔的收尾',
      title: '夜色渐深，今天可以慢慢收尾',
      body: '夜已经深了，今天的任务可以先停在这里，不需要用晚睡补齐进度。把明天想做的事简单记下，留好休息的时间，让身体安心慢下来。',
      continuing: '今天已经投入的时间都已记下，没完成的部分也可以留到休息以后。简单收好手边的笔记，给这一天画个轻轻的句号，今晚先照顾好自己。',
      closing: '把余下的路，交给休息后的自己。', button: '先安顿好自己',
    },
    welcome: {
      theme: 'morning', eyebrow: '欢迎回来 · 按自己的节奏',
      title: '欢迎回来，按自己的节奏出发',
      body: '先坐稳、喝点水，给自己一点安顿下来的时间，再看看眼前最想完成什么。今天的安排可以从一件具体的小事开始，按自己的节奏慢慢展开。',
      continuing: '今天已经有了一段认真的投入，这些积累都安稳地留在这里。先看看自己的精神和身体需要什么，再决定继续哪一件小事，或先好好休息。',
      closing: '照顾好自己，也照顾好这份认真。', button: '带着从容出发',
    },
  };

  function amount(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return 0;
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }

  function periodOf(now) {
    // Require an explicit instant. Missing or malformed input must not silently
    // consult the system clock or invent a time-of-day greeting.
    if (typeof now !== 'string' || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(now)) return 'welcome';
    const instant = new Date(now);
    if (!Number.isFinite(instant.getTime())) return 'welcome';
    const hour = instant.getHours(); // Browser/macOS local time, not the ISO text's hour.
    if (hour < 5) return 'overnight';
    if (hour < 8) return 'dawn';
    if (hour < 11) return 'morning';
    if (hour < 14) return 'noon';
    if (hour < 18) return 'afternoon';
    if (hour < 22) return 'evening';
    return 'night';
  }

  // Composition is deliberately stateless. `day` belongs to the caller's daily
  // opening claim; composing or previewing this text must never consume it.
  function compose(input) {
    input = input && typeof input === 'object' ? input : {};
    const period = periodOf(input.now);
    const copy = words[period];
    const minutes = amount(input.minutes), target = amount(input.target);
    const complete = target > 0 && minutes >= target;
    if (complete) return {
      period, theme: copy.theme, eyebrow: '今日目标已完成 · 收下这份积累',
      title: '今天的努力，已经好好收下',
      body: '今天的学习目标已经完成，认真投入的时间都已成为你的积累。现在可以安心休息，做一点喜欢的事，让这份满足陪着你慢慢收好今天。',
      closing: '今天已经很好，余下的时间也属于你。', button: '收下今天的努力',
    };
    return {
      period, theme: copy.theme, eyebrow: copy.eyebrow, title: copy.title,
      body: minutes > 0 ? copy.continuing : copy.body, closing: copy.closing,
      button: minutes > 0 && period !== 'overnight' && period !== 'night' ? '继续今天的旅程' : copy.button,
    };
  }

  return {compose};
});
