const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync(require.resolve('../static/interface-themes.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({selector:selector.trim(),body}));

test('application styling is opt-in; default theme never gains shell overrides',()=>{
  for(const {selector} of rules){
    if(selector.startsWith('@'))continue;
    if(selector.startsWith(':root')){
      assert.ok(selector.includes('[data-interface=' )||selector.includes('[data-interface]'),selector);
      assert.ok(!/:root\[data-interface="interface-default"\]/.test(selector),selector);
    }else{
      assert.ok(/^(?:#quest-action-dialog\.interface-item-dialog|\.interface-|\.shop-item-visual \.interface-app-mini)/.test(selector),`unscoped application style: ${selector}`);
    }
  }
});

test('interface themes never repaint the game board or transform bought artwork',()=>{
  assert.doesNotMatch(css,/(?:^|[;{])\s*(?:filter|backdrop-filter|animation|transform|will-change)\s*:/);
  assert.doesNotMatch(css,/@keyframes/);
  assert.doesNotMatch(css,/--(?:theme-[\w-]*|equipped-bar[\w-]*|avatar-[\w-]*|chat-[\w-]*|subject-color|isle-color|campfire-[\w-]*)\s*:/);
  for(const {selector} of rules){
    assert.doesNotMatch(selector,/\.(?:mines-cell|mines-classic|mines-toolbar|mines-smiley|survivor-canvas|equipped-particles|floating-island|scene-theme-backdrop)(?:\W|$)/);
    assert.doesNotMatch(selector,/\.(?:total-progress|subject-progress|weekly-progress|q-progress|q-first-round-progress)(?![\w-])[^{}]*>\s*i/);
  }
});

test('purchased chat frames and banners retain their original surface and text tokens',()=>{
  const chatRules=rules.filter(rule=>rule.selector.includes('campfire-line'));
  assert.ok(chatRules.length>=4);
  for(const {selector,body} of chatRules){
    if(selector.includes(':not([data-chatframe="chatframe-default"])'))assert.match(body,/var\(--chat-(?:ink|title)\)/);
    else assert.match(selector,/\[data-chatframe="chatframe-default"\]/);
    assert.doesNotMatch(body,/(?:background|border)\s*:/);
  }
  const bannerSurfaces=rules.filter(rule=>rule.selector.endsWith('.level-pill')&&/background\s*:/.test(rule.body));
  assert.ok(bannerSurfaces.length>0);
  for(const {selector} of bannerSurfaces)assert.match(selector,/\[data-banner="banner-default"\]/);
});

const luminance=hex=>{
  const rgb=hex.slice(1).match(/../g).map(s=>parseInt(s,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
};
const contrast=(a,b)=>{a=luminance(a);b=luminance(b);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
test('all ten purchased palettes have readable primary and secondary ink on shell and card surfaces',()=>{
  for(const name of ['forest','tide','amber','paper','rain','ember','ink','garden','observatory','neon']){
    const rule=rules.find(rule=>rule.selector===`:root${name==='paper'?'[data-interface]':''}[data-interface="interface-${name}"]`);
    assert.ok(rule,`missing ${name} palette`);
    const tokens=Object.fromEntries([...rule.body.matchAll(/--ui-([\w-]+):\s*(#[\da-f]{6})\b/gi)].map(([,key,value])=>[key,value]));
    for(const ink of ['ink','muted','accent'])for(const surface of ['bg','surface','surface-raised']){
      assert.ok(contrast(tokens[ink],tokens[surface])>=4.5,`${name} ${ink}/${surface} contrast ${contrast(tokens[ink],tokens[surface]).toFixed(2)}`);
    }
    assert.ok(contrast(tokens['button-ink'],tokens.accent)>=4.5,`${name} primary button contrast`);
  }
});

test('theme changes add no perpetual effects, full-page SVG rules, or application layout sizes',()=>{
  for(const {selector,body} of rules){
    if(!selector.startsWith(':root'))continue;
    assert.doesNotMatch(body,/(?:^|;)\s*(?:width|height|min-width|min-height|max-width|max-height|font-size|padding|margin|display|position|overflow)\s*:/,selector);
    assert.doesNotMatch(selector,/\s(?:svg|canvas|\*)(?:\s|:|$)/,selector);
  }
});

test('light theme thumbnail captions explicitly out-rank grouped body labels while keeping artwork dark',()=>{
  const captions=rules.find(rule=>rule.selector.includes('[data-interface-tone="light"]')&&rule.body.includes('color:#c4c9d5'));
  assert.ok(captions);
  // Common body-label :is() has two classes AND a type selector. Three classes
  // must outrank it; merely matching the class count still lets dark ink win.
  assert.match(captions.selector,/\.shop-item \.shop-item-visual \.shop-item-type/);
  assert.match(captions.selector,/\.shop-item \.shop-item-visual \.shop-owned/);
  assert.ok(contrast('#c4c9d5','#1e2836')>=4.5);
});


test('every theme changes material, card silhouette and interactive construction',()=>{
  const names=['forest','tide','amber','paper','rain','ember','ink','garden','observatory','neon'];
  const materials=new Set(),radii=new Set();
  for(const name of names){
    const palette=rules.find(rule=>rule.selector===`:root${name==='paper'?'[data-interface]':''}[data-interface="interface-${name}"]`);
    for(const token of ['bg','sidebar','surface','surface-raised','ink','muted','faint','accent','line','soft','control','button-ink','radius','shadow','panel-detail','shell-detail']){
      assert.match(palette.body,new RegExp(`--ui-${token}:`),`${name} missing ${token}`);
    }
    materials.add(palette.body.match(/--ui-panel-detail:([^;]+)/)[1]);
    radii.add(palette.body.match(/--ui-radius:([^;]+)/)[1]);
    // Theme-specific selectors match the common opt-in specificity, so their
    // construction details actually win on the active navigation and buttons.
    const prefix=`:root[data-interface][data-interface="interface-${name}"]`;
    assert.ok(rules.some(({selector,body})=>selector.startsWith(prefix)&&selector.includes('.nav-item.active')&&/box-shadow:/.test(body)),`${name} active navigation`);
    assert.ok(rules.some(({selector,body})=>selector.startsWith(prefix)&&selector.includes('.primary-button')&&/border-radius:/.test(body)),`${name} button construction`);
  }
  assert.equal(materials.size,names.length,'each material has a distinct static texture');
  assert.equal(radii.size,names.length,'each theme has its own panel silhouette');
});

test('light adaptations cover paper, ink and garden by tone rather than a single product id',()=>{
  assert.ok(rules.filter(({selector})=>selector.includes('[data-interface-tone="light"]')).length>=35);
  for(const target of ['.expedition-canvas','.shop-item-visual','.q-money','.diamond-mark','.form-error','.campfire-line']){
    assert.ok(rules.some(({selector})=>selector.includes('[data-interface-tone="light"]')&&selector.includes(target)),`missing light adaptation for ${target}`);
  }
  const lightBlock=css.slice(css.indexOf(':root[data-interface][data-interface-tone="light"] :is(.expedition-canvas'));
  assert.doesNotMatch(lightBlock,/data-interface="interface-paper"/,'shared light rules are independent of the equipped style');
  assert.ok(rules.some(({selector,body})=>selector.startsWith(':root[data-interface][data-interface="interface-ink"]')&&/Songti SC/.test(body)));
});
