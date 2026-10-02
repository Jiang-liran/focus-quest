const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync(require.resolve('../static/interface-adaptation.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const html=fs.readFileSync(require.resolve('../static/index.html'),'utf8');
const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({selector:selector.trim(),body}));

test('new room adaptation loads after the room skins and leaves classic boards and collected art alone',()=>{
  const order=['interface-themes.css','rain-city.css','city-life.css','return-trail.css','lottery.css','interface-adaptation.css'].map(name=>html.indexOf('href="/'+name+'"'));
  assert.ok(order.every(index=>index>=0));assert.equal(Math.max(...order),order.at(-1));
  for(const {selector,body} of rules){
    assert.ok(selector.startsWith(':root[data-interface')||selector.startsWith('.interface-full-preview'),selector);
    assert.doesNotMatch(selector,/\.(?:mines-cell|mines-classic|mines-toolbar|floating-island|equipped-particles|scene-theme-backdrop)(?:\W|$)/);
    assert.doesNotMatch(body,/(?:^|;)\s*(?:filter|backdrop-filter|animation|transform|will-change|width|height|padding|margin|font-size)\s*:/);
    assert.doesNotMatch(body,/--(?:theme-|avatar-|chat-|equipped-bar)/);
  }
});

test('light surfaces protect dark premium frames and keep day-cell text contrast',()=>{
  const banner=rules.find(row=>row.selector.includes('[data-banner]')&&row.selector.includes('.level-pill'));
  assert.match(banner.selector,/:not\(\[data-banner="banner-default"\]\)/);
  assert.match(banner.body,/--ui-surface:#191d2b/);assert.match(banner.body,/--ui-ink:#e8e3f2/);
  const heatmap=rules.find(row=>row.selector.includes('data-interface-tone="light"')&&row.selector.endsWith('#review-heatmap'));
  assert.match(heatmap.body,/--hm-four:color-mix\(in srgb,var\(--hm-accent\) 27%/);
  const lottery=rules.filter(row=>row.selector.includes('data-interface-tone="light"')&&row.selector.includes('.lottery-room'));
  assert.equal(lottery.length,2);assert.ok(lottery.every(row=>row.body.includes('--lottery-accent:')&&row.body.includes('--lottery-companion:')));
});

test('room reading cards adapt independently from the lottery layout',()=>{
  const room=rules.find(row=>row.selector.endsWith('.city-room-content')&&row.body.includes('background:'));
  for(const machine of ['coin','diamond'])assert.ok(room.selector.includes(`:not([data-lottery="${machine}"])`));
  const lottery=rules.find(row=>row.selector.endsWith('#city-lottery-pane'));
  assert.match(lottery.body,/background:var\(--ui-shell-detail\),var\(--ui-bg\)/,'lottery heading and rules read on the chosen material');
  const captions=rules.filter(row=>row.selector.includes('.campfire-place-caption'));
  assert.ok(captions.every(row=>!row.body.includes('background:')),'world captions keep the authored scene below them');
});
