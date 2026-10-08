const test=require('node:test');
const assert=require('node:assert/strict');
const themes=require('../static/interface-themes.js');
const art=require('../static/shop-art.js');
const ids=['interface-default','interface-forest','interface-tide','interface-amber','interface-paper','interface-rain','interface-ember','interface-ink','interface-garden','interface-observatory','interface-neon'];

// This is intentionally independent of metadata, so forgetting a promised theme
// fails rather than silently shrinking the test matrix with the implementation.
test('all eleven themes preview the app with different materials and panel frames',()=>{
  const motifs=new Set();
  for(const id of ids){
    const svg=themes.preview(id);
    assert.match(svg,/viewBox="0 0 840 430"/);
    for(const label of ['专注远征','今日远征','数学','408','政治','英语'])assert.ok(svg.includes(label),id+' '+label);
    assert.equal(art.preview(id),svg,'shop and quick-menu previews share the same illustration');
    assert.doesNotMatch(svg,/<script|<foreignObject|<animate|on\w+\s*=|href\s*=|<filter/i,'preview has no scripts, network sources, timers or costly filters');
    const materials=[...svg.matchAll(/data-ui-motif="([^"]+)"/g)].map(match=>match[1]);
    assert.ok(materials.length>=5,'subject cards and primary panel carry the material');
    motifs.add(materials[0]);
  }
  assert.equal(motifs.size,11,'each theme has a structural material, not only a colour change');
  assert.match(themes.preview('interface-tide'),/stroke-dasharray/);
  assert.match(themes.preview('interface-paper'),/#c9c7bb|#ded9ca/);
  assert.match(themes.preview('interface-amber'),/r="2.1"/);
  assert.match(themes.preview('interface-ember'),/stroke-dasharray="2 4"/);
  assert.match(themes.preview('interface-ink'),/#a76755/,'ink theme has a cinnabar seal');
  assert.match(themes.preview('interface-neon'),/#da82b2/,'neon has a second light rail colour');
});

test('theme metadata supplies names, tone and useful distinguishing details without editable shared data',()=>{
  assert.deepEqual(themes.metadata.map(theme=>theme.id),ids);
  assert.ok(Object.isFrozen(themes.metadata));
  const light=[];
  for(const item of themes.metadata){
    assert.ok(Object.isFrozen(item));assert.ok(Object.isFrozen(item.features));
    assert.equal(item.label,item.name);
    assert.ok(item.features.length===3&&item.features.every(feature=>typeof feature==='string'&&feature.length>3));
    assert.ok(themes.has(item.id));
    if(item.tone==='light')light.push(item.id);else assert.equal(item.tone,'dark');
  }
  assert.deepEqual(light,['interface-paper','interface-ink','interface-garden']);
});

test('invalid theme identifiers produce no markup and restore both safe default and dark tone',()=>{
  const doc={documentElement:{dataset:{interface:'interface-paper',interfaceTone:'light',theme:'theme-forest',fx:'fx-snow'}}};
  for(const invalid of [undefined,null,{},'theme-forest','interface-unknown','interface-" onload="bad','__proto__']){
    assert.equal(themes.has(invalid),false);assert.equal(themes.preview(invalid),'');assert.equal(themes.fullPreview(invalid),'');
    assert.equal(themes.apply(invalid,doc),'interface-default');
    assert.equal(doc.documentElement.dataset.interfaceTone,'dark');
    assert.equal(doc.documentElement.dataset.theme,'theme-forest');assert.equal(doc.documentElement.dataset.fx,'fx-snow');
  }
  assert.equal(themes.apply('interface-garden',{}),'interface-garden');
  assert.equal(themes.apply('interface-rain',null),'interface-rain');
});

test('applying every theme changes only interface and tone and avoids unchanged attribute writes',()=>{
  let writes=0;
  const values={interface:'interface-default',interfaceTone:'dark',theme:'theme-aurora',avatar:'avatar-royal',bar:'bar-comet',island:'island-palace',camp:'camp-lake'};
  const equipment={theme:values.theme,avatar:values.avatar,bar:values.bar,island:values.island,camp:values.camp};
  const doc={documentElement:{dataset:new Proxy(values,{set(obj,key,val){writes++;obj[key]=val;return true;}})}};
  for(const id of ids){
    const previousId=values.interface,previousTone=values.interfaceTone;
    const tone=['interface-paper','interface-ink','interface-garden'].includes(id)?'light':'dark';
    const expectedWrites=(previousId===id?0:1)+(previousTone===tone?0:1),before=writes;
    themes.apply(id,doc);themes.apply(id,doc);
    assert.equal(writes-before,expectedWrites,id+' writes only changed values');
    assert.deepEqual(values,{...equipment,interface:id,interfaceTone:tone});
  }
  themes.apply('interface-default',doc);
  assert.deepEqual(values,{...equipment,interface:'interface-default',interfaceTone:'dark'});
});

test('full preview shows collected island and progress bar without modifying the equipment or live theme',()=>{
  const equipped=Object.freeze({interface:'interface-default',theme:'theme-ocean',avatar:'avatar-royal',bar:'bar-prism',island:'island-palace',relic:'relic-lotus',companion:'companion-fox',portal:'portal-moon'});
  const before=JSON.stringify(equipped);
  for(const id of ids){
    const html=themes.fullPreview(id,equipped,art);
    assert.match(html,/data-island-decoration="island-palace"/);
    assert.match(html,/data-pb-design="bar-prism"/);
    assert.match(html,/fill="#191e30"/,'light themes preserve the equipped island stage');
    assert.match(html,/--ui-surface:#[0-9a-f]{6};/,'details carry the previewed theme palette');
    assert.match(html,/独立搭配/);
    assert.doesNotMatch(html,/<script|<foreignObject|<animate|onload=/);
  }
  assert.equal(JSON.stringify(equipped),before);
});

test('preview cards display the selected theme palette independently of live theme and tolerate missing art',()=>{
  const paper=themes.fullPreview('interface-paper',{},null);
  const rain=themes.fullPreview('interface-rain',{},null);
  assert.match(paper,/data-preview-tone="light"[^>]*--ui-ink:#303630/);
  assert.match(rain,/data-preview-tone="dark"[^>]*--ui-ink:#e8f0ed/);
  assert.match(paper,/纸纹与墨线|暖纸底|原有夜色/);
  assert.match(rain,/玻璃窗框/);
  assert.match(paper,/每日主线/);
});

test('preview chrome and live theme use identical palettes; light surfaces stay softly lit and readable',()=>{
  const css=require('node:fs').readFileSync(require.resolve('../static/interface-themes.css'),'utf8');
  const luminance=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>{a=luminance(a);b=luminance(b);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
  for(const id of ids.slice(1)){
    const prefix=':root'+(id==='interface-paper'?'[data-interface]':'')+'[data-interface="'+id+'"]';
    const block=css.slice(css.indexOf(prefix+' {')).split('}')[0];
    const tokens=Object.fromEntries([...block.matchAll(/--ui-([\w-]+):(#[\da-f]{6})\b/g)].map(([,k,v])=>[k,v]));
    const preview=themes.fullPreview(id,{},null);
    for(const name of ['bg','surface','surface-raised','ink','muted','accent','line'])assert.ok(preview.includes('--ui-'+name+':'+tokens[name]+';'),id+' preview '+name);
    if(themes.metadata.find(t=>t.id===id).tone==='light'){
      for(const surface of ['bg','sidebar','surface','surface-raised','control'])assert.ok(luminance(tokens[surface])<=.77,id+' '+surface+' avoids near-white glare');
      for(const surface of ['bg','surface','surface-raised','control'])for(const ink of ['ink','muted','accent'])assert.ok(contrast(tokens[ink],tokens[surface])>=4.5,id+' '+ink+'/'+surface);
    }
    assert.match(block,/--ui-panel-ornament:url\("data:image\/svg\+xml,/,'each theme has a visible small corner construction, without a network image');
  }
  const panelRule=css.match(/:root\[data-interface\]:not\(\[data-interface="interface-default"\]\) :is\(\.quest-hero\.expedition-hero,\.method-workshop,\.shop-welcome,\.q-mentor,#review-heatmap\) \{([^}]+)\}/);
  assert.ok(panelRule,'material reaches the frequently used main panels');
  assert.doesNotMatch(panelRule[1],/ui-panel-ornament/,'period controls, shop wallets and mentor status have no decorative overlay');
  const homeOrnament=css.match(/@media\(min-width:1100px\) \{\s*:root\[data-interface\]\[data-interface\]:not\(\[data-interface="interface-default"\]\) \.quest-hero\.expedition-hero \{([^}]+)\}/);
  assert.ok(homeOrnament,'ornament is absent from the compact home layout');
  assert.match(homeOrnament[1],/background-position:left 260px top 0/,'the wide home ornament stays in the empty header gap, away from the right-hand action');
  assert.match(homeOrnament[1],/background-repeat:no-repeat/,'the one permitted motif never tiles');
  const homeSurface=css.match(/:root\[data-interface\]:not\(\[data-interface="interface-default"\]\) \.quest-hero\.expedition-hero \{([^}]+)\}/);
  assert.match(homeSurface[1],/transition:border-color \.2s/,'purchased light/dark themes switch surface immediately alongside ink');
  assert.doesNotMatch(homeSurface[1],/transition:[^;}]*(?:background|\ball\b)/,'no temporary unreadable background interpolation');
});
