(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FocusEffects = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const amount = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const subjectIds = new Set(['math', 'cs', 'politics', 'english']);

  // A continuous visual model. Goal celebration decisions use minutes below,
  // because the displayed percentage may already have been rounded to 100%.
  function scene(percent) {
    const progress = Math.min(1, amount(percent) / 100);
    return {
      progress,
      stage: Math.min(4, Math.floor(progress * 4)),
      pathOffset: 100 * (1 - progress),
      mistOpacity: 0.7 * (1 - progress),
      glow: 0.12 + progress * 0.65,
      beaconScale: 0.65 + progress * 0.35,
      lightOpacity: 0.1 + progress * 0.9,
      orbitDuration: 30 - progress * 14,
    };
  }

  /**
   * Return newly crossed goals, without mutating states or claimedKeys.
   * freshRecords is the caller's unseen, recently completed record list;
   * each record must also belong to the viewed current day to qualify here.
   * Callers persist the returned keys when enqueuing the celebrations so a
   * deletion followed by re-import cannot celebrate the same goal twice.
   */
  function unlocks(previous, next, freshRecords, claimedKeys) {
    if (!previous || !next || !next.date || next.date !== next.today ||
        previous.date !== next.date || previous.date !== previous.today) return [];

    const fresh = (Array.isArray(freshRecords) ? freshRecords : []).filter(record =>
      record && record.day === next.date && amount(record.minutes) > 0);
    if (!fresh.length) return [];

    const claimed = new Set(claimedKeys instanceof Set || Array.isArray(claimedKeys) ? claimedKeys : []);
    const result = [];
    const append = event => {
      if (claimed.has(event.key)) return;
      claimed.add(event.key);
      result.push(event);
    };
    const oldSubjects = new Map((Array.isArray(previous.subjects) ? previous.subjects : [])
      .filter(Boolean).map(subject => [subject.id, subject]));
    const freshSubjects = new Set(fresh.map(record => record.subject));

    for (const subject of Array.isArray(next.subjects) ? next.subjects : []) {
      if (!subject || !subjectIds.has(subject.id) || !freshSubjects.has(subject.id)) continue;
      const before = oldSubjects.get(subject.id);
      const target = amount(subject.target);
      if (!before || !target || target !== amount(before.target)) continue;
      if (amount(before.minutes) < target && amount(subject.minutes) >= target) {
        append({key: `subject:${next.date}:${subject.id}:${target}`, type: 'subject',
          id: subject.id, name: subject.name, target, percent: amount(subject.minutes) / target * 100});
      }
    }

    const before = previous.totals || {};
    const after = next.totals || {};
    const target = amount(after.target);
    if (target && target === amount(before.target)) {
      const oldStage = Math.min(4, Math.floor(amount(before.minutes) / target * 4));
      const stage = Math.min(4, Math.floor(amount(after.minutes) / target * 4));
      if (stage > oldStage) {
        // A bulk import crosses several gates, but only the highest gate plays.
        append({key: `daily:${next.date}:${target}:${stage}`, type: 'daily', stage,
          percent: amount(after.minutes) / target * 100, target});
      }
    }
    return result;
  }

  return {scene, unlocks};
});
