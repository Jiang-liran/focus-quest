const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {world, resonance} = require('../static/expedition-art.js');
const ids = ['math', 'cs', 'politics', 'english'];
const model = (progress, extra = {}) => ({progress, subjects: ids.map(id => ({id, progress, percent: progress * 100})), ...extra});

function group(markup, selector) {
  const begin = markup.indexOf(selector);
  assert.notEqual(begin, -1, `Missing group ${selector}`);
  const start = markup.lastIndexOf('<g ', begin);
  let depth = 0;
  for (const match of markup.slice(start).matchAll(/<g\b[^>]*>|<\/g>/g)) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (!depth) return markup.slice(start, start + match.index + match[0].length);
  }
  assert.fail(`Unbalanced SVG group ${selector}`);
}

const island = (markup, id) => group(markup, `data-expedition-subject="${id}"`);
const build = markup => [...markup.matchAll(/data-build-step="(\d)" data-build-amount="([\d.]+)"/g)].map(match => Number(match[2]));

test('world exposes four accessible subject regions with distinct buildings and leaves original scene mounts untouched', () => {
  const svg = world(model(1));
  assert.match(svg, /^<svg class="expedition-world-art" viewBox="0 0 1000 540"/);
  assert.equal((svg.match(/data-expedition-subject=/g) || []).length, 4);
  assert.equal((svg.match(/role="button" tabindex="0" aria-label=/g) || []).length, 4);
  for (const [index, id] of ids.entries()) {
    const region = island(svg, id);
    assert.match(region, /class="expedition-hit-area"/);
    assert.match(region, new RegExp(['几何观测台', '逻辑工坊', '议事书庭', '译风港'][index]));
    assert.equal((region.match(/class="expedition-charge-node"/g) || []).length, 4);
  }
  assert.match(island(svg, 'math'), /class="expedition-orbit"/);
  assert.match(island(svg, 'cs'), /class="expedition-gear"/);
  assert.match(island(svg, 'politics'), /class="expedition-book-leaves"/);
  assert.match(island(svg, 'english'), /class="expedition-windmill"/);
  assert.match(island(svg, 'english'), /class="expedition-port-boat"/);
  assert.equal((svg.match(/data-skin-slots="campus[a-z]+ archipelago"/g) || []).length, 4);
  assert.doesNotMatch(svg, /\bid=|class="island-art"|equipped-(companion|relic|portal)/);
});

test('construction changes at every quarter and also continuously between quarter boundaries', () => {
  const steps = [0, .125, .25, .375, .5, .625, .75, .875, 1];
  for (const id of ids) {
    const regions = steps.map(progress => island(world(model(progress)), id));
    assert.equal(new Set(regions).size, steps.length);
    const tiers = regions.map(build);
    assert.deepEqual(tiers[0], [0, 0, 0]);
    assert.deepEqual(tiers.at(-1), [1, 1, 1]);
    for (let i = 1; i < tiers.length; i++) {
      assert.equal(tiers[i].length, 3);
      tiers[i].forEach((value, layer) => assert.ok(value >= tiers[i - 1][layer], `${id} layer ${layer} shrank`));
      if (steps[i] < 1) assert.ok(tiers[i].some((value, layer) => value > tiers[i - 1][layer]), `${id} did not build at ${steps[i]}`);
      else assert.match(regions[i], /data-complete="true" opacity="1"/);
    }
  }
});

test('each subject charges independently of total progress and unrelated subjects', () => {
  const baseline = model(.5, {subjects: ids.map(id => ({id, progress: .25, percent: 25}))});
  const before = world(baseline);
  const after = world({...baseline, subjects: baseline.subjects.map(row => row.id === 'math' ? {...row, progress: .73, percent: 73} : row)});
  assert.notEqual(island(before, 'math'), island(after, 'math'));
  for (const id of ids.slice(1)) assert.equal(island(before, id), island(after, id));
  assert.notEqual(group(before, 'data-bridge="math"'), group(after, 'data-bridge="math"'));
  assert.equal(group(before, 'data-bridge="english"'), group(after, 'data-bridge="english"'));
});

test('four local nodes fill in order and the bridge follows continuous progress', () => {
  const svg = world(model(.625));
  for (const id of ids) {
    assert.deepEqual([...island(svg, id).matchAll(/data-node="\d" data-charge="([\d.]+)"/g)].map(match => Number(match[1])), [1, 1, .5, 0]);
    assert.match(group(svg, `data-bridge="${id}"`), /stroke-dashoffset="37.5"/);
  }
});

test('completion requires actual progress one; over-target gold is separate from construction', () => {
  const almost = world(model(.999999, {subjects: ids.map(id => ({id, progress: .999999, percent: 99.9999}))}));
  const exact = world(model(1));
  const beyond = world(model(1, {subjects: ids.map(id => ({id, progress: 1, percent: 133}))}));
  for (const id of ids) {
    assert.match(island(almost, id), /data-complete="false" opacity="0"/);
    assert.match(island(almost, id), /完成 99\.99%/);
    assert.match(island(exact, id), /data-complete="true" opacity="1"/);
    assert.match(island(exact, id), /data-overcharge="0" opacity="0"/);
    assert.match(island(beyond, id), /data-overcharge="0.66" opacity="0.66"/);
    assert.deepEqual(build(island(exact, id)), build(island(beyond, id)));
    assert.match(island(beyond, id), /完成 133%/);
  }
});

test('fallbacks, missing subjects, extreme values and malicious fields cannot create invalid or unsafe markup', () => {
  const malicious = '" onload="alert(1) <script>bad</script>';
  const samples = [null, undefined, [], malicious, {progress: NaN, stage: Infinity}, {progress: -1, stage: -9}, {progress: 9, stage: 90}, {subjects: {}}, {subjects: [null, {id: malicious}, {id:'math', progress: NaN, percent: Infinity}]}, {subjects: [{id:'cs', progress: .5, name: malicious, percent: malicious}]}];
  for (const sample of samples) {
    const svg = world(sample);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined|<script|<foreignObject|\bon\w+=|href=|url\(/);
    assert.equal((svg.match(/data-expedition-subject=/g) || []).length, 4);
    assert.ok(svg.endsWith('</svg>'));
  }
  assert.match(world({progress: -1, stage: -4}), /data-world-stage="0" data-world-progress="0"/);
  assert.match(world({progress: 20, stage: 9}), /data-world-stage="4" data-world-progress="1"/);
  const percentOnly = world({subjects:[{id:'english',percent:150}]});
  assert.match(island(percentOnly, 'english'), /data-progress="1" data-percent="150"/);
  assert.match(island(percentOnly, 'math'), /data-progress="0" data-percent="0"/);
});

test('markup is deterministic, subject input order is irrelevant, and rendering never changes its input', () => {
  const subjects = ids.map((id, index) => Object.freeze({id, progress: index / 3, percent: index * 40}));
  const source = Object.freeze({progress:.37, subjects:Object.freeze(subjects), stage:1});
  assert.equal(world(source), world(source));
  assert.equal(world(source), world({...source, subjects:[...subjects].reverse()}));
  assert.equal(source.subjects[2].progress, 2/3);
  assert.doesNotMatch(world(source), /\bid=|<animate\b|<animateTransform\b/);
});

test('subject hit regions do not overlap the central island reserved rectangle', () => {
  const svg = world(model(.5));
  for (const id of ids) {
    const region = island(svg, id);
    const [,x,y] = region.match(/transform="translate\((\d+) (\d+)\)"/).map(Number);
    // Hit ellipse has a 128-unit horizontal radius, outside x400–630.
    assert.ok(x + 128 < 400 || x - 128 > 630, `${id} masks the central island`);
    assert.ok(y - 152 >= 0 && y + 116 <= 540, `${id} spills beyond the artboard`);
  }
});

test('browser UMD loads without document, timers, randomness or network and matches CommonJS', () => {
  const context = vm.createContext({});
  for(const name of ['subject-island-styles','island-architecture','expedition-art'])vm.runInContext(fs.readFileSync(require.resolve(`../static/${name}.js`), 'utf8'), context);
  assert.equal(typeof context.FocusExpeditionArt.world, 'function');
  assert.equal(context.FocusExpeditionArt.world(model(.5)), world(model(.5)));
});

test('animation styles isolate satellite artwork and both motion preferences keep the static scenery', () => {
  const css = fs.readFileSync(require.resolve('../static/expedition-art.css'), 'utf8');
  assert.match(css, /\.expedition-world-art\{[^}]*pointer-events:none/);
  assert.match(css, /\.expedition-world-art \.expedition-subject-island\{[^}]*pointer-events:auto/);
  assert.match(css, /\.no-motion \.expedition-world-art[^}]*animation:none!important;transition:none!important/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)[\s\S]*animation:none!important;transition:none!important/);
  assert.doesNotMatch(css, /\.island-art|\.floating-island|\.quest-scene|#equipped-/);
  assert.doesNotMatch(css, /display:none/);
});


test('resonance art renders only an explicitly completed four-subject model and connects every subject once', () => {
  for (const input of [undefined, null, {}, model(1), {resonance: {active: false}}, {resonance: {active: 'true'}}]) {
    assert.equal(resonance(input), '', 'total progress alone cannot draw the four-subject achievement');
  }
  const svg = resonance({...model(.8), resonance: {active: true, completed: 4, total: 4}});
  assert.match(svg, /^<svg class="expedition-resonance-art" viewBox="0 0 1000 540"/);
  assert.deepEqual([...svg.matchAll(/data-resonance-subject="([^"]+)"/g)].map(match => match[1]), ids);
  assert.equal((svg.match(/class="fq-resonance-channel"/g) || []).length, 4);
  assert.match(svg, /class="fq-resonance-heart"/); assert.match(svg, /class="fq-resonance-crown"/);
});

test('resonance art stays stable during further study and ignores unsafe input fields without mutation', () => {
  const complete = Object.freeze({progress: 1, minutes: 480, resonance: Object.freeze({active: true}), subjects: Object.freeze([])});
  const svg = resonance(complete);
  const unsafe = '\" onload=\"alert(1) <script>bad</script>';
  assert.equal(resonance({...complete, minutes: 500, progress: 1.2, subjects: [{id: unsafe, name: unsafe, minutes: Infinity, target: NaN}]}), svg);
  assert.equal(resonance({...complete, resonance: {active: true, completed: unsafe, total: unsafe}, date: unsafe, title: unsafe}), svg);
  assert.equal(complete.minutes, 480);
  assert.doesNotMatch(svg, /<script|<foreignObject|\bon\w+=|href=|NaN|Infinity|undefined/);
  assert.doesNotMatch(svg.replace('http://www.w3.org/2000/svg', ''), /https?:|data:|<image\b|url\((?!#)/);
  const defined = [...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(defined).size, defined.length, 'SVG definitions are unique within the overlay');
  assert.ok(defined.every(id => id.startsWith('fq-resonance-')), 'IDs cannot collide with existing world or cosmetic art');
  for (const match of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(defined.includes(match[1]), `Unresolved local gradient ${match[1]}`);
});

test('the resonance overlay never takes input and reduced motion preserves a static completed scene', () => {
  const svg = resonance({resonance: {active: true}});
  assert.match(svg, /aria-hidden="true" focusable="false"/);
  assert.doesNotMatch(svg, /tabindex=|role="button"|data-expedition-subject=|<a\b|<button\b/);
  const css = fs.readFileSync(require.resolve('../static/expedition-art.css'), 'utf8');
  assert.match(css, /\.expedition-resonance-art\{[^}]*pointer-events:none/);
  assert.match(css, /\.expedition-resonance-art \*\{pointer-events:none\}/);
  assert.match(css, /\.no-motion \.expedition-resonance-art \*\{animation:none!important;transition:none!important\}/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.expedition-resonance-art \*\{animation:none!important;transition:none!important\}/);
  const context = vm.createContext({}); vm.runInContext(fs.readFileSync(require.resolve('../static/expedition-art.js'), 'utf8'), context);
  assert.equal(context.FocusExpeditionArt.resonance({resonance: {active: true}}), svg);
});
