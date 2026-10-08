const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=name=>fs.readFileSync(require.resolve(`../static/${name}`),'utf8');
const strip=css=>css.replace(/\/\*[\s\S]*?\*\//g,'');
const parse=css=>[...strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({selector:selector.trim(),body}));
const css=strip(read('interface-components.css')),rules=parse(css),base=parse(read('interface-themes.css'));
const root=':root[data-interface]:not([data-interface="interface-default"])';
const tokens=body=>Object.fromEntries([...body.matchAll(/--ui-([\w-]+):\s*(#[\da-f]{6})\b/gi)].map(([,key,value])=>[key,value]));
const rgb=hex=>hex.slice(1).match(/../g).map(n=>parseInt(n,16));
const luminance=color=>color.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};

test('component material loads after skins and is opt-in without touching art, layouts or motion',()=>{
  const html=read('index.html'),position=html.indexOf('href="/interface-components.css"');
  assert.ok(position>0);
  for(const sheet of ['city-experience.css','interface-adaptation.css','lottery.css','method-rewards.css']){
    const before=html.indexOf(`href="/${sheet}"`);assert.ok(before>=0&&before<position,sheet);
  }
  assert.ok(rules.length>50,'the shared layer covers the long-lived component families');
  for(const {selector,body} of rules){
    assert.ok(selector.startsWith(root),selector);
    assert.doesNotMatch(selector,/\s(?:svg|canvas|\*)(?:\W|$)|\.(?:mines-cell|mines-classic|survivor-canvas|floating-island|equipped-particles|scene-theme-backdrop|shop-item-visual|quick-skin-thumb)(?:\W|$)/,selector);
    assert.doesNotMatch(body,/(?:^|;)\s*(?:width|height|min-width|min-height|max-width|max-height|padding|margin|font-size|display|position|overflow|filter|backdrop-filter|animation|transform|will-change)\s*:/,selector);
    assert.doesNotMatch(body,/--(?:theme-[\w-]*|avatar-[\w-]*|chat-[\w-]*|equipped-bar[\w-]*|subject-color|isle-color)\s*:/,selector);
    assert.doesNotMatch(body,/#[\da-f]{3,8}\b/i,'component colors come from the equipped material');
  }
});

test('plain progress rails adapt only with both the default equipment and the default renderer skin',()=>{
  const rail=rules.find(row=>row.selector.includes('.total-progress'));
  assert.ok(rail);assert.match(rail.selector,/:is\(\[data-bar="bar-default"\],:not\(\[data-bar\]\)\)/);
  assert.match(rail.selector,/:is\(\[data-pb-skin="bar-default"\],:not\(\[data-pb-skin\]\)\)/);
  assert.doesNotMatch(rail.selector,/>\s*i|\.pb-art|\.pb-ribbon/,'the completed portion remains the equipped progress artwork');
  assert.match(rail.body,/background:color-mix\(in srgb,var\(--ui-line\) 35%,var\(--ui-surface-raised\)\)/);
  for(const target of ['.expedition-subjects strong','.home-shortcuts>button','.expedition-discover-toggle']){
    assert.ok(rules.some(row=>row.selector.includes(target)&&/color:var\(--ui-(?:ink|muted|accent)\)/.test(row.body)),target);
  }
});

test('all semantic status inks remain readable on dark and dim light surfaces',()=>{
  const dark=tokens(base.find(row=>row.selector===root&&row.body.includes('--ui-success:')).body);
  const light=tokens(base.find(row=>row.selector===':root[data-interface][data-interface-tone="light"]'&&row.body.includes('--ui-success:')).body);
  const names=['forest','tide','amber','paper','rain','ember','ink','garden','observatory','neon'];
  for(const name of names){
    const palette=tokens(base.find(row=>row.selector===`:root${name==='paper'?'[data-interface]':''}[data-interface="interface-${name}"]`).body);
    const semantics=['paper','ink','garden'].includes(name)?light:dark;
    for(const ink of ['success','warning','danger','coin','diamond','lecture','practice']){
      assert.ok(semantics[ink],`${name} ${ink}`);
      for(const surface of ['bg','surface','surface-raised']){
        const ratio=contrast(rgb(semantics[ink]),rgb(palette[surface]));
        assert.ok(ratio>=4.5,`${name} ${ink} on ${surface}: ${ratio.toFixed(2)}`);
      }
      const inkRgb=rgb(semantics[ink]),tint=rgb(palette.surface).map((value,i)=>value*.9+inkRgb[i]*.1);
      assert.ok(contrast(inkRgb,tint)>=4.5,`${name} ${ink} on its 10% status-chip tint`);
    }
  }
});

test('filled light heatmap cells keep their small labels readable at every intensity',()=>{
  const rule=rules.find(row=>row.selector.includes('[data-interface-tone="light"]')&&row.selector.includes('.hm-day[data-level]'));
  assert.ok(rule);assert.match(rule.selector,/:not\(\[data-status="future"\]\)/);assert.match(rule.body,/color:var\(--ui-ink\)/);
  for(const name of ['paper','ink','garden']){
    const palette=tokens(base.find(row=>row.selector===`:root${name==='paper'?'[data-interface]':''}[data-interface="interface-${name}"]`).body);
    for(const amount of [.08,.15,.21,.27]){
      const fill=rgb(palette.surface).map((value,i)=>value*(1-amount)+rgb(palette.accent)[i]*amount);
      assert.ok(contrast(rgb(palette.ink),fill)>=4.5,`${name} cell at ${amount}`);
    }
  }
});

test('new room controls are theme material while purchased chat frames and lottery layout stay independent',()=>{
  for(const target of ['.city-room-welcome','#city-talk','.city-talk-portrait','.city-life-status','.city-service-close']){
    assert.ok(rules.some(row=>row.selector.includes(target)&&/var\(--ui-/.test(row.body)),target);
  }
  const room=rules.find(row=>row.selector.endsWith('.city-room .city-room-content'));
  assert.ok(room);for(const machine of ['coin','diamond'])assert.ok(room.selector.includes(`:not([data-lottery="${machine}"])`));
  for(const rule of rules.filter(row=>/\.campfire-character(?:s|\b)/.test(row.selector))){
    assert.match(rule.selector,/\.campfire-card:is\(\[data-chatframe="chatframe-default"\],:not\(\[data-chatframe\]\)\)/);
  }
  assert.doesNotMatch(css,/\.campfire-line|\.shop-owned/,'collected dialogue and thumbnail artwork are outside this layer');
});

test('reward statuses, currency labels and lottery dialogs use shared semantic tokens',()=>{
  for(const target of ['.q-first-round.ready','.q-first-round.claimed','.method-subject-round.is-counted','.mystery-status.ready','.shop-possession','.lottery-rules-dialog','.lottery-result-kind.coin-item','.lottery-result-kind.diamond-item','.goal-form-error']){
    assert.ok(rules.some(row=>row.selector.includes(target)&&/var\(--ui-(?:success|warning|danger|coin|diamond)/.test(row.body)),target);
  }
  const unknown=[...css.matchAll(/var\((--ui-[\w-]+)/g)].map(([,name])=>name).filter(name=>!read('interface-themes.css').includes(`${name}:`));
  assert.deepEqual([...new Set(unknown)],[],'component tokens must be provided by the base palette');
});
