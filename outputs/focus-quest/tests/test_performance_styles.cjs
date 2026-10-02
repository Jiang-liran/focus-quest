const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = name => fs.readFileSync(require.resolve(`../static/${name}`), 'utf8');
const css = read('performance.css').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].map(([, selectors, declarations]) => ({
  selectors: selectors.split(',').map(value => value.trim()),
  declarations: declarations.split(';').map(value => value.trim()).filter(Boolean),
}));
const selectors = rules.flatMap(rule => rule.selectors);

test('invisible native windows pause elements and both pseudo-elements, including the root', () => {
  for (const suffix of ['', '::before', '::after', ' *', ' *::before', ' *::after']) {
    assert.ok(selectors.includes(`html.focus-runtime-hidden${suffix}`), `missing hidden-window coverage: ${suffix}`);
  }
});

test('covering scenes pause only the underlying main surface, leaving the foreground scene and sidebar live', () => {
  for (const state of ['has-citadel-view', 'has-campfire-room', 'has-return-trail-view']) {
    const prefix = `html.${state} body > main`;
    for (const suffix of ['', '::before', '::after', ' *', ' *::before', ' *::after']) {
      assert.ok(selectors.includes(prefix + suffix), `missing covered-page coverage: ${state}${suffix}`);
    }
    const applicable = selectors.filter(selector => selector.includes(state));
    assert.ok(applicable.every(selector => selector.startsWith(prefix)), 'an open scene must not pause the whole document');
  }
  assert.ok(selectors.every(selector => /^html\.(focus-runtime-hidden|has-citadel-view|has-campfire-room|has-return-trail-view)(?:\s|:|$)/.test(selector)),
    'normal visible pages must not acquire an unconditional pause rule');
});

test('performance rules preserve animation progress, scene transitions, layout, and visible artwork', () => {
  assert.ok(rules.length > 0);
  for (const rule of rules) {
    assert.deepEqual(rule.declarations, ['animation-play-state: paused !important']);
  }
  // Camp navigation is driven by Web Animations. Keep its slide outside these CSS-only pauses.
  assert.match(read('campfire-room.js'), /room\.animate\(/);
  assert.match(read('campfire-room.js'), /background\.animate\(/);
});

test('large city camera layer is requested only during active pointer or wheel gestures', () => {
  const city = read('citadel.css');
  const layerRules = [...city.matchAll(/([^{}]+)\{([^{}]*will-change\s*:[^{}]*)\}/g)];
  assert.equal(layerRules.length, 1);
  const [, selector, declarations] = layerRules[0];
  assert.equal(selector.trim(), '.citadel-stage:is(.dragging,.wheeling) .citadel-camera');
  assert.match(declarations, /will-change:\s*transform/);
  assert.doesNotMatch(city.match(/\.citadel-camera\{([^{}]*)\}/)[1], /will-change/);
});
