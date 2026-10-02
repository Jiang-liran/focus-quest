(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FocusAudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // All phrases are local synthesis, kept below one second and at a quiet level.
  // Each entry is [frequency, start offset, duration, envelope peak, waveform].
  const cues = {
    completion: [[392,0,.22,.085],[493.88,.11,.24,.08],[587.33,.23,.28,.075]],
    delivery: [[659.25,0,.14,.07],[783.99,.09,.17,.065],[1046.5,.18,.23,.055]],
    milestone: [[440,0,.24,.075],[554.37,.1,.25,.07],[659.25,.2,.28,.07],[880,.32,.3,.06]],
    victory: [[261.63,0,.62,.045],[329.63,0,.62,.04],[392,0,.62,.04],[523.25,.18,.28,.055],[659.25,.34,.3,.05],[783.99,.51,.36,.05]],
    subject: [[523.25,0,.24,.075],[659.25,.12,.3,.07],[783.99,.23,.3,.055]],
    purchase: [[1046.5,0,.13,.055],[1318.51,.075,.21,.045]],
    equip: [[493.88,0,.23,.06],[659.25,.08,.25,.055],[987.77,.17,.27,.045]],
    arcadeStep: [[220,0,.06,.024,'triangle'],[293.66,.04,.07,.017,'triangle']],
    arcadeMirror: [[1046.5,0,.09,.025],[1396.91,.045,.11,.017]],
    arcadePlant: [[392,0,.10,.027,'triangle'],[523.25,.05,.12,.022,'triangle']],
    survivorHit: [[110,0,.07,.023,'triangle'],[73.42,.03,.1,.018,'triangle']],
    survivorPickup: [[1174.66,0,.06,.012],[1567.98,.025,.065,.009]],
    survivorUpgrade: [[659.25,0,.14,.032],[987.77,.06,.17,.026],[1318.51,.14,.22,.025]],
    survivorBoss: [[98,0,.25,.035,'triangle'],[146.83,.12,.28,.028,'triangle'],[196,.25,.28,.022]],
    survivorDash: [[392,0,.05,.016,'triangle'],[783.99,.035,.09,.014,'triangle']],
    arcadeWin: [[523.25,0,.18,.045],[659.25,.1,.18,.04],[783.99,.2,.2,.035],[1046.5,.34,.3,.035]],
  };
  const maxPhrases = 2, cooldownMs = 180, keyLimit = 256;
  let enabled = false, context = null, generation = 0, pendingResume = null, stateListener = null;
  const voices = new Set(), seenKeys = new Map(), lastPlayed = new Map();
  const clock = () => root.performance && typeof root.performance.now === 'function' ? root.performance.now() : Date.now();

  function safely(callback) { try { callback(); } catch (_) { /* Released or unsupported audio nodes are harmless. */ } }
  function finish(voice) {
    if (!voices.delete(voice)) return;
    if (voice.timer !== null && typeof root.clearTimeout === 'function') root.clearTimeout(voice.timer);
    for (const oscillator of voice.oscillators) {
      oscillator.onended = null;
      safely(() => oscillator.stop());
    }
    for (const node of voice.nodes) safely(() => node.disconnect());
    voice.nodes.length = 0;
    voice.oscillators.length = 0;
  }
  function cancelAll() { for (const voice of [...voices]) finish(voice); }
  function closeQuietly(audioContext) {
    if (!audioContext || typeof audioContext.close !== 'function') return;
    try { Promise.resolve(audioContext.close()).catch(() => {}); } catch (_) { /* No sound remains even if closing is unavailable. */ }
  }
  function detach(audioContext) {
    if (stateListener && audioContext && typeof audioContext.removeEventListener === 'function') {
      safely(() => audioContext.removeEventListener('statechange', stateListener));
    }
    stateListener = null;
  }

  // Enabling is allocation-free; disabling also invalidates an unresolved resume.
  function setEnabled(value) {
    enabled = value === true;
    if (!enabled) {
      generation++;
      pendingResume = null;
      cancelAll();
      const previous = context;
      detach(previous);
      context = null;
      closeQuietly(previous);
    }
    return enabled;
  }

  // Call from a user gesture. This never replays sounds requested while suspended.
  // Always resolves a boolean, including unsupported APIs and resume failures.
  function unlock() {
    if (!enabled) return Promise.resolve(false);
    if (!context) {
      const Constructor = root.AudioContext || root.webkitAudioContext;
      if (typeof Constructor !== 'function') return Promise.resolve(false);
      try {
        context = new Constructor();
        const created = context;
        stateListener = () => {
          if (context !== created) return;
          if (created.state !== 'running') cancelAll();
          if (created.state === 'closed') {
            generation++;
            pendingResume = null;
            detach(created);
            context = null;
          }
        };
        if (typeof created.addEventListener === 'function') created.addEventListener('statechange', stateListener);
      } catch (_) {
        closeQuietly(context);
        context = null;
        stateListener = null;
        return Promise.resolve(false);
      }
    }
    if (context.state === 'running') return Promise.resolve(true);
    if (context.state === 'closed') {
      detach(context);
      context = null;
      return Promise.resolve(false);
    }
    if (pendingResume) return pendingResume;
    if (typeof context.resume !== 'function') return Promise.resolve(false);
    const target = context, epoch = generation;
    let resumed;
    try { resumed = target.resume(); } catch (_) { return Promise.resolve(false); }
    const attempt = Promise.resolve(resumed).then(() => {
      const current = enabled && generation === epoch && context === target;
      if (!current) { closeQuietly(target); return false; }
      return target.state === 'running';
    }, () => false).then(result => {
      if (pendingResume === attempt) pendingResume = null;
      return result;
    });
    pendingResume = attempt;
    return attempt;
  }

  function takeKey(options) {
    const raw = options && typeof options === 'object' ? options.key : undefined;
    const key = typeof raw === 'string' && raw.length > 0 ? `s:${raw.slice(0,512)}` : typeof raw === 'number' && Number.isFinite(raw) ? `n:${raw}` : null;
    if (key === null) return true;
    if (seenKeys.has(key)) return false;
    // A key identifies one event across cues. Even a skipped event is consumed;
    // subsequent refreshes cannot resurrect a sound after enabling or resuming.
    seenKeys.set(key, true);
    if (seenKeys.size > keyLimit) seenKeys.delete(seenKeys.keys().next().value);
    return true;
  }

  // true means the phrase was scheduled now. false means skipped (off, no gesture,
  // suspended, unsupported, duplicate, cooldown, voice limit, or scheduling error).
  // There is deliberately no queue and no automatic AudioContext.resume() here.
  function play(cue, options) {
    if (!Object.prototype.hasOwnProperty.call(cues, cue) || !takeKey(options)) return false;
    if (!enabled || !context || context.state !== 'running') {
      if (context && context.state !== 'running') cancelAll();
      return false;
    }
    const now = clock();
    if (voices.size >= maxPhrases || now - (lastPlayed.get(cue) ?? -Infinity) < cooldownMs) return false;
    const target = context, notes = cues[cue];
    const voice = {nodes:[], oscillators:[], timer:null};
    voices.add(voice);
    try {
      const start = target.currentTime + .008;
      const output = target.createGain();
      voice.nodes.push(output);
      output.gain.setValueAtTime(.14, start);
      output.connect(target.destination);
      let outstanding = notes.length, duration = 0;
      for (const [frequency, offset, length, peak, waveform] of notes) {
        const oscillator = target.createOscillator();
        voice.nodes.push(oscillator);
        voice.oscillators.push(oscillator);
        const envelope = target.createGain();
        voice.nodes.push(envelope);
        const at = start + offset, end = at + length;
        oscillator.type = waveform || 'sine';
        oscillator.frequency.setValueAtTime(frequency, at);
        envelope.gain.setValueAtTime(0, at);
        envelope.gain.linearRampToValueAtTime(peak, at + .014);
        envelope.gain.exponentialRampToValueAtTime(.0001, end);
        envelope.gain.setValueAtTime(0, end + .006);
        oscillator.connect(envelope);
        envelope.connect(output);
        oscillator.onended = () => {
          if (!voices.has(voice)) return;
          safely(() => oscillator.disconnect());
          safely(() => envelope.disconnect());
          outstanding--;
          if (outstanding === 0) finish(voice);
        };
        oscillator.start(at);
        oscillator.stop(end + .012);
        duration = Math.max(duration, offset + length + .02);
      }
      // onended is the normal cleanup; this also covers browsers that interrupt it.
      if (typeof root.setTimeout === 'function') {
        voice.timer = root.setTimeout(() => finish(voice), Math.ceil((duration + .2) * 1000));
        if (voice.timer && typeof voice.timer.unref === 'function') voice.timer.unref();
      }
      lastPlayed.set(cue, now);
      return true;
    } catch (_) {
      finish(voice);
      return false;
    }
  }

  return {setEnabled, unlock, play};
});
