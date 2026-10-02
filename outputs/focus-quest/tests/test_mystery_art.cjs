const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {portrait, gift} = require('../static/mystery-art.js');

test('mystery artwork exports a browser API and self-contained decorative SVGs', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/mystery-art.js'), 'utf8'), context);
  assert.equal(typeof context.FocusMysteryArt.portrait, 'function');
  assert.equal(typeof context.FocusMysteryArt.gift, 'function');
  for (const [svg, className, viewBox] of [
    [portrait(), 'mystery-npc-art', '0 0 160 180'],
    [gift(), 'mystery-gift-art', '0 0 96 96'],
  ]) {
    assert.match(svg, new RegExp(`^<svg class="${className}" viewBox="${viewBox}"`));
    assert.match(svg, /aria-hidden="true" focusable="false"/);
    assert.match(svg, /<\/svg>$/);
    assert.equal((svg.match(/<svg\b/g) || []).length, 1);
    assert.equal((svg.match(/<g\b/g) || []).length, (svg.match(/<\/g>/g) || []).length);
    assert.doesNotMatch(svg, /\bid=|<defs\b|href=|url\(|<image\b|<script\b|\bon\w+=/i);
  }
});

test('gift tiers are clamped, do not interpolate input, and retain four distinct appearances', () => {
  assert.equal(gift(-20), gift(1));
  assert.equal(gift(0), gift(1));
  assert.equal(gift(2.9), gift(2));
  assert.equal(gift(5), gift(4));
  assert.equal(gift(Number.MAX_SAFE_INTEGER), gift(4));
  for (const invalid of [NaN, Infinity, -Infinity, null, '4', '<script>alert(1)</script>', {toString() { throw new Error('coercion'); }}]) {
    assert.equal(gift(invalid), gift(1));
  }
  assert.equal(gift(3, 'true'), gift(3, false));
  assert.equal(gift(3, '<svg onload=alert(1)>'), gift(3, false));
  assert.notEqual(gift(3, true), gift(3, false));
  assert.equal(new Set([1, 2, 3, 4].map(tier => gift(tier).replace(/data-tier="\d"/, ''))).size, 4);
  assert.match(gift(4, true), /data-tier="4" data-opened="true"/);
});

test('mystery character and gifts expose separate, reusable animation groups', () => {
  const npc = portrait();
  for (const className of ['mystery-star-specks', 'mystery-moon-staff', 'mystery-lantern', 'mystery-lantern-glow']) {
    assert.match(npc, new RegExp(`class="${className}"`));
  }
  assert.match(gift(4, true), /class="mystery-gift-light"/);
  assert.match(gift(4, true), /class="mystery-gift-sparkles"/);
  assert.match(gift(4, true), /class="mystery-gift-lid"/);
});

// Paths use absolute M/L/Q/C commands only. Their endpoints and Bézier control
// points staying inside the viewBox also bounds every curve's convex hull.
function assertGeometryWithin(svg, width, height) {
  const within = (x, y, description) => {
    assert.ok(Number.isFinite(x) && x >= 0 && x <= width, `${description}: x=${x}`);
    assert.ok(Number.isFinite(y) && y >= 0 && y <= height, `${description}: y=${y}`);
  };
  for (const [, d] of svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)) {
    assert.doesNotMatch(d, /[a-zA-BD-KN-PR-WY]/);
    const numbers = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    assert.equal(numbers.length % 2, 0);
    for (let i = 0; i < numbers.length; i += 2) within(numbers[i], numbers[i + 1], d);
  }
  for (const [, shape, raw] of svg.matchAll(/<(circle|ellipse)\b([^>]+)\/>/g)) {
    const attrs = Object.fromEntries([...raw.matchAll(/([a-z]+)="([\d.]+)"/g)].map(([, key, value]) => [key, Number(value)]));
    const rx = shape === 'circle' ? attrs.r : attrs.rx;
    const ry = shape === 'circle' ? attrs.r : attrs.ry;
    within(attrs.cx - rx, attrs.cy - ry, raw);
    within(attrs.cx + rx, attrs.cy + ry, raw);
  }
}

test('portrait and all closed/open gift tiers keep geometry inside their viewBoxes', () => {
  assertGeometryWithin(portrait(), 160, 180);
  for (let tier = 1; tier <= 5; tier++) {
    assertGeometryWithin(gift(tier), 96, 96);
    assertGeometryWithin(gift(tier, true), 96, 96);
  }
});
