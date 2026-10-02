(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FocusExpeditionModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SUBJECTS = [
    {id: 'math', name: '数学', landmark: '观测台', description: '透镜与刻度逐渐就位，一张新的星图在台面上展开。'},
    {id: 'cs', name: '408', landmark: '逻辑工坊', description: '齿轮、线路与小小的工具台，连接成一间亮着灯的工坊。'},
    {id: 'politics', name: '政治', landmark: '议事书庭', description: '书架与长椅围起一座庭院，留出阅读和交谈的位置。'},
    {id: 'english', name: '英语', landmark: '译风港', description: '码头铺上木板，载着不同语言的信笺在风中轻轻翻动。'}
  ];
  const DISCOVERIES = [
    {id: 'mist-camp', name: '晨雾营地', threshold: 0, narrative: '营地外的小径藏着星石和岔路。带上提灯，探开迷雾，再带着收获找到出口。'},
    {id: 'glow-shore', name: '萤石浅滩', threshold: 10, narrative: '花、水、树林与奇石等待落位。在浅滩上拼一座小花园，巧妙相邻的景物会彼此呼应。'},
    {id: 'chime-bridge', name: '风铃木桥', threshold: 25, narrative: '风铃的另一边是一条更曲折的寻宝路。绕过险地，决定要多拿一枚星石，还是早点归来。'},
    {id: 'mirror-gallery', name: '镜湖回廊', threshold: 40, narrative: '湖面的镜阵等待转动。让光穿过沿途星标，再照亮对岸的晶灯。'},
    {id: 'cloud-library', name: '云根花庭', threshold: 60, narrative: '树根之间留着一方空地。用花木和水景规划邻接，把有限的布置变成繁盛的庭院。'},
    {id: 'orbit-terrace', name: '星轨高台', threshold: 80, narrative: '高台上的镜片折转星光。辨清路径与干扰，把散落的光重新送入星轨。'},
    {id: 'home-beacon', name: '归光灯塔', threshold: 100, narrative: '灯塔照着最后一段探险。带够星石抵达出口，或多走一条岔路，挑战更好的收获。'}
  ];
  const IDS = new Set(SUBJECTS.map(subject => subject.id));
  const MAX = Number.MAX_SAFE_INTEGER;
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  function numeric(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
    const result = Number(value);
    return Number.isFinite(result) && result >= 0 ? Math.min(MAX, result) : null;
  }
  const amount = value => numeric(value) ?? 0;
  const add = (a, b) => Math.min(MAX, a + b);
  const sum = values => values.reduce(add, 0);
  const tidy = value => value < 1e10 ? Math.round(value * 1e8) / 1e8 : value;
  function day(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const time = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : null;
  }
  function percentage(minutes, target) {
    if (!target) return 0;
    const value = minutes / target * 100;
    return Number.isFinite(value) ? value : Number.MAX_VALUE;
  }
  function subjectRows(state) {
    const rows = new Map();
    for (const value of Array.isArray(state.subjects) ? state.subjects : []) {
      const row = object(value);
      if (IDS.has(row.id) && !rows.has(row.id)) rows.set(row.id, row);
    }
    return SUBJECTS.map(definition => {
      const row = rows.get(definition.id) || {};
      const minutes = amount(row.minutes), target = amount(row.target);
      const percent = percentage(minutes, target);
      return {...definition, minutes, target, percent, progress: Math.min(1, percent / 100),
        goalSet: target > 0, complete: target > 0 && minutes >= target,
        remainingMinutes: Math.max(0, target - minutes), excessMinutes: target ? Math.max(0, minutes - target) : 0,
        status: !target ? 'unset' : minutes > target ? 'over' : minutes === target ? 'complete' : minutes ? 'growing' : 'waiting'};
    });
  }

  // Pure presentation data: never edits state, grants XP, or issues rewards.
  function build(input) {
    const state = object(input), totals = object(state.totals);
    const subjects = subjectRows(state);
    const minutes = numeric(totals.minutes) ?? sum(subjects.map(subject => subject.minutes));
    const target = numeric(totals.target) ?? sum(subjects.map(subject => subject.target));
    const percent = percentage(minutes, target), progress = Math.min(1, percent / 100);
    const date = day(state.date) || day(state.today), today = day(state.today);
    const discoveries = DISCOVERIES.map((definition, index) => ({...definition, index,
      unlocked: index === 0 || (target > 0 && minutes >= target * definition.threshold / 100),
      requiredMinutes: target * definition.threshold / 100,
      remainingMinutes: target ? Math.max(0, target * definition.threshold / 100 - minutes) : null}));
    const discoveryIndex = discoveries.filter(discovery => discovery.unlocked).length - 1;
    const currentDiscovery = {...discoveries[discoveryIndex]};
    const nextDiscovery = target > 0 && discoveryIndex < discoveries.length - 1 ? {...discoveries[discoveryIndex + 1]} : null;
    const excess = target ? Math.max(0, minutes - target) : 0;
    return {date, today, isToday: Boolean(date && date === today), isHistorical: Boolean(date && today && date < today),
      minutes, target, percent, progress, goalSet: target > 0, complete: target > 0 && minutes >= target,
      stage: Math.min(4, Math.floor(progress * 4)), discoveryIndex, subjects,
      otherMinutes: Math.max(0, minutes - sum(subjects.map(subject => subject.minutes))),
      discoveries, currentDiscovery, nextDiscovery, title: currentDiscovery.name, narrative: currentDiscovery.narrative,
      afterglow: {active: excess > 0, minutes: excess, intensity: target ? Math.min(1, excess / target) : 0,
        starCount: excess ? Math.min(12, Math.ceil(excess / target * 12)) : 0,
        name: '余晖星痕', text: excess ? '额外的专注已化作地图边缘的星痕，归途仍然亮着。' : '通关后的额外积累，会留下一点余晖。'},
      preview: false};
  }

  function atProgress(state, minutes, subjectMinutes) {
    const original = build(state);
    return build({date: original.date, today: original.today, totals: {minutes, target: original.target},
      subjects: original.subjects.map(subject => ({id: subject.id, target: subject.target, minutes: amount(subjectMinutes[subject.id])}))});
  }

  // The existing animation slider can call this without replacing live state.
  function preview(state, value) {
    const original = build(state), ratio = amount(value) / 100;
    const scaled = target => Math.min(MAX, target * ratio);
    const model = atProgress(state, scaled(original.target), Object.fromEntries(original.subjects.map(subject => [subject.id, scaled(subject.target)])));
    model.preview = true;
    return model;
  }

  function completedRecords(state, selectedDay) {
    const records = [], seen = new Set();
    let duplicates = 0, invalid = 0, outsideDay = 0;
    for (const entry of Array.isArray(state.records) ? state.records : []) {
      const row = object(entry), minutes = numeric(row.minutes);
      if (!row || typeof row.id !== 'string' || !row.id.trim() || !minutes || !day(row.day) ||
          typeof row.end !== 'string' || !Number.isFinite(Date.parse(row.end))) { invalid++; continue; }
      // Server assigns an entire completed record to its archive day. Do not
      // split it at midnight or infer a different day from start/end offsets.
      if (row.day !== selectedDay) { outsideDay++; continue; }
      if (seen.has(row.id)) { duplicates++; continue; }
      seen.add(row.id);
      records.push({id: row.id, name: typeof row.name === 'string' ? row.name : '专注记录',
        subject: IDS.has(row.subject) ? row.subject : 'other', minutes,
        start: typeof row.start === 'string' && Number.isFinite(Date.parse(row.start)) ? row.start : null,
        end: row.end, day: row.day, source: typeof row.source === 'string' ? row.source : null});
    }
    records.sort((a, b) => Date.parse(a.end) - Date.parse(b.end) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return {records, duplicates, invalid, outsideDay};
  }

  function replayFrames(input, options) {
    const state = object(input), model = build(state), config = object(options);
    const normalized = completedRecords(state, model.date), records = normalized.records;
    const recordMinutes = tidy(sum(records.map(record => record.minutes)));
    const recordSubjects = Object.fromEntries(SUBJECTS.map(subject => [subject.id,
      tidy(sum(records.filter(record => record.subject === subject.id).map(record => record.minutes)))]));
    const totalRecords = Math.max(records.length, Math.floor(amount(state.dayRecordCount)));
    const missingRecords = totalRecords - records.length;
    const baselineMinutes = tidy(Math.max(0, model.minutes - recordMinutes));
    const baselineSubjects = Object.fromEntries(model.subjects.map(subject => [subject.id,
      tidy(Math.max(0, subject.minutes - recordSubjects[subject.id]))]));
    // A stale or malformed snapshot cannot honestly replay more work than its
    // authoritative totals. Present the final snapshot instead of inventing a
    // negative record or silently shrinking real records to make it fit.
    const consistent = recordMinutes <= model.minutes + 1e-7 && model.subjects.every(subject => recordSubjects[subject.id] <= subject.minutes + 1e-7);
    const partial = missingRecords > 0 || baselineMinutes > 1e-7 || normalized.invalid > 0;
    const maxFrames = Math.max(2, Math.min(30, Math.floor(numeric(config.maxFrames) ?? 26)));
    const summary = {date: model.date, totalRecords, availableRecords: records.length, missingRecords,
      minutes: model.minutes, availableMinutes: recordMinutes, baselineMinutes,
      partial, consistent, replayable: consistent && records.length > 0,
      duplicates: normalized.duplicates, invalidRecords: normalized.invalid, outsideDay: normalized.outsideDay,
      maxFrames, visualFrames: 1, grouped: false};
    let minutes = consistent ? baselineMinutes : model.minutes;
    let subjectMinutes = consistent ? {...baselineSubjects} : Object.fromEntries(model.subjects.map(subject => [subject.id, subject.minutes]));
    const frames = [{type: 'start', index: 0, at: null, records: [], recordCount: consistent ? missingRecords : totalRecords,
      completedCount: 0, deltaMinutes: 0, minutes, subjectMinutes: {...subjectMinutes},
      baseline: consistent && (baselineMinutes > 0 || missingRecords > 0),
      model: consistent ? atProgress(state, minutes, subjectMinutes) : model}];
    if (!consistent || !records.length) return {frames, summary};
    const groupSize = Math.ceil(records.length / (maxFrames - 1));
    let processed = 0;
    for (let offset = 0; offset < records.length; offset += groupSize) {
      const group = records.slice(offset, offset + groupSize);
      const deltaMinutes = tidy(sum(group.map(record => record.minutes)));
      minutes = tidy(add(minutes, deltaMinutes));
      for (const record of group) if (IDS.has(record.subject)) subjectMinutes[record.subject] = tidy(add(subjectMinutes[record.subject], record.minutes));
      processed += group.length;
      const final = processed === records.length;
      // Preserve the exact authoritative ending, including server rounding.
      const frameModel = final ? model : atProgress(state, minutes, subjectMinutes);
      if (final) {
        minutes = model.minutes;
        subjectMinutes = Object.fromEntries(model.subjects.map(subject => [subject.id, subject.minutes]));
      }
      frames.push({type: 'completion', index: frames.length, at: group[group.length - 1].end,
        records: group, recordCount: missingRecords + processed, completedCount: group.length,
        deltaMinutes, minutes, subjectMinutes: {...subjectMinutes}, baseline: false, model: frameModel});
    }
    summary.visualFrames = frames.length;
    summary.grouped = groupSize > 1;
    return {frames, summary};
  }

  return {build, preview, replayFrames};
});
