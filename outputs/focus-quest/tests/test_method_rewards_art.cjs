const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const art = require('../static/method-rewards-art.js');

test('Yanquing has an original complete desk illustration with clear reading and writing details', () => {
  const svg=art.avatar();
  assert.match(svg,/class="method-mentor-art" viewBox="0 0 200 180"/);
  assert.match(svg,/<title>研习导师砚青：把听懂的一页，变成亲手写下的解答<\/title>/);
  assert.match(svg,/aria-hidden="true" focusable="false"/);
  for(const part of ['setting','mentor','legs','face','writing-desk','open-book','practice-paper','hands-and-pen']) {
    assert.ok(svg.includes(`data-method-part="${part}"`));
  }
  assert.doesNotMatch(svg,/<text\b|data-skin|data-outfit|tabindex=|role="button"/);
  assert.ok((svg.match(/<(?:g|path|circle|ellipse|rect)\b/g)||[]).length<120);
});

test('the mentor is valid SVG isolated from the application icon stroke rule', () => {
  const svg=art.avatar();
  assert.match(svg,/^<svg\b[^>]*style="[^"]*stroke:none[^"]*"/);
  assert.equal((svg.match(/<svg\b/g)||[]).length,1);
  assert.doesNotMatch(svg,/<script|<foreignObject|<image|<iframe|\sid=|href=|url\(|filter|undefined|NaN|Infinity/);
  const result=spawnSync('/usr/bin/python3',['-c','import sys,xml.etree.ElementTree as ET; ET.fromstring(sys.stdin.read())'],{input:svg,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

test('the browser API is deterministic and requires no DOM, clock, storage or network', () => {
  const source=fs.readFileSync(path.join(__dirname,'../static/method-rewards-art.js'),'utf8');
  const context=vm.createContext({});
  vm.runInContext(source,context);
  assert.equal(context.FocusMethodArt.avatar(),art.avatar());
  assert.equal(context.FocusMethodArt.avatar(),context.FocusMethodArt.avatar());
  assert.doesNotMatch(source,/setTimeout|setInterval|requestAnimationFrame|addEventListener|localStorage|fetch\(/);
});
