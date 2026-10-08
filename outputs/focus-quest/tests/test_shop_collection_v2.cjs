const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const collection=require('../static/shop-collection-v2.js'),expansion=require('../static/shop-expansion.js'),shop=require('../static/shop-art.js'),camp=require('../static/camp-world-art.js'),campShop=require('../static/campfire-shop-art.js'),avatars=require('../static/quest-art.js'),bars=require('../static/progress-bars.js');
const source=fs.readFileSync(require.resolve('../static/shop-collection-v2.js'),'utf8'),css=fs.readFileSync(require.resolve('../static/shop-collection-v2.css'),'utf8');
const rows=collection.entries,bySlot=slot=>rows.filter(row=>row.slot===slot);
const geometry=svg=>svg.replace(/\s(?:data-[\w-]+|class|style|fill|stroke|opacity|stop-color)="[^"]*"/g,'').replace(/\bid="[^"]*"/g,'id="local"').replace(/url\(#[^)]+\)/g,'url(#local)');
const asSvg=body=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 720">${body}</svg>`;
test('ordinary collection manifest has 84 equipable products, broad prices, and exact catalog parity',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ordinary_catalog.json'),'utf8')).filter(entry=>collection.has(entry.id));
 assert.deepEqual(rows,manifest);assert.equal(rows.length,84);assert.equal(new Set(rows.map(row=>row.id)).size,84);
 assert.deepEqual(Object.fromEntries([...new Set(rows.map(row=>row.slot))].map(slot=>[slot,bySlot(slot).length])),{bar:12,avatar:12,island:12,theme:8,companion:8,fx:8,fire:6,tent:6,campgear:6,banner:6});
 assert.equal(rows.filter(row=>row.coins>0).length,50);assert.equal(rows.filter(row=>row.diamonds>0).length,34);
 assert.equal(Math.min(...rows.filter(row=>row.coins).map(row=>row.coins)),45);assert.equal(Math.max(...rows.map(row=>row.coins)),2000);
 assert.equal(Math.min(...rows.filter(row=>row.diamonds).map(row=>row.diamonds)),4);assert.equal(Math.max(...rows.map(row=>row.diamonds)),80);
 for(const row of rows){assert.equal(expansion.entries.filter(e=>e.id===row.id).length,1);for(const key of Object.keys(row))assert.equal(expansion.item(row.id)[key],row[key]);assert.equal(expansion.item(row.id).lotteryOnly,false);assert.equal(collection.has(row.id,row.slot),true);}
});
test('every preview uses the existing stage footprint, real distinct geometry, and valid local SVG',()=>{
 const svgs=rows.map(row=>collection.preview(row.id));
 for(let i=0;i<svgs.length;i++){assert.match(svgs[i],/^<svg class="shop-art-svg collection-v2-shop-art/);assert.match(svgs[i],/viewBox="0 0 160 112"/);assert.ok(svgs[i].length>400,rows[i].id);assert.doesNotMatch(svgs[i],/undefined|NaN|Infinity|<script|<foreignObject|\bon\w+=|href=/);}
 for(const slot of new Set(rows.map(row=>row.slot)))assert.equal(new Set(bySlot(slot).map(row=>geometry(collection.preview(row.id)))).size,bySlot(slot).length,slot);
 const actual=rows.flatMap(row=>row.slot==='avatar'?[0,1,2,3,4].map(stage=>collection.avatar(row.id,stage)):row.slot==='theme'?[collection.themeBackdrop(row.id),asSvg(collection.themeCityScene(row.id))]:row.slot==='island'?[asSvg(collection.islandDecoration(row.id))]:row.slot==='bar'?[asSvg(collection.barFigure(row.id)+collection.barRibbon(row.id,'xml-'+row.id))]:[]);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'focus-world-xml-')),input=path.join(dir,'scenes.json');
 try {
  fs.writeFileSync(input,JSON.stringify([...svgs,...actual]));
  const xml=spawnSync('/usr/bin/python3',['-c','import json,sys,xml.etree.ElementTree as ET\nwith open(sys.argv[1]) as f: scenes=json.load(f)\nfor svg in scenes: ET.fromstring(svg)',input],{encoding:'utf8',timeout:15000});assert.equal(xml.status,0,xml.stderr||String(xml.error||''));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('all twelve player outfits render full clothing and four staged additions without replacing NPCs',()=>{
 for(const row of bySlot('avatar')){assert.equal(expansion.fullOutfit(row.id),true);assert.ok(css.includes(`[data-avatar="${row.id}"]`));const stages=[0,1,2,3,4].map(n=>avatars.avatar('player',row.id,n));assert.equal(new Set(stages).size,5);
  for(let stage=0;stage<=4;stage++){assert.match(stages[stage],/data-role="player"/);assert.match(stages[stage],new RegExp(`data-avatar-stage="${stage}"`));for(let tier=1;tier<=4;tier++)assert.match(stages[stage],new RegExp(`class="quest-avatar-tier quest-avatar-tier-${tier}" data-avatar-tier="${tier}" display="${stage>=tier?'inline':'none'}"`));}
  assert.doesNotMatch(avatars.avatar('shop',row.id),new RegExp(row.id));assert.match(collection.avatar(row.id,Infinity),/data-avatar-stage="0"/);assert.match(collection.avatar(row.id,-2),/data-avatar-stage="0"/);assert.match(collection.avatar(row.id,99),/data-avatar-stage="4"/);
 }
 assert.match(css,/#scene-traveler>:not\(#equipped-player-regalia\)\{visibility:hidden\}/);
});
test('island buildings remain behind the path and at its left edge, preserving roadside campfire space',()=>{
 for(const row of bySlot('island')){const actual=collection.islandDecoration(row.id);assert.match(actual,new RegExp(`data-island-decoration="${row.id}"`));assert.match(actual,/translate\(363 67\) scale\(\.76\)/);assert.match(actual,/translate\(177 224\) scale\(\.65\)/);assert.ok(actual.includes(collection.building(row.id)));assert.equal(shop.apply({island:row.id}).island,row.id);assert.ok(shop.islandPreview(row.id,{companion:'companion-duckling',avatar:'avatar-postrider'}).includes(row.id));}
});
test('all eighteen camp fixtures are accepted and draw in the real camp while preserving other slots',()=>{
 const ordinaryCamp=rows.filter(row=>['tent','fire','campgear'].includes(row.slot));
 for(const row of ordinaryCamp){const eq=camp.normalize({[row.slot]:row.id,companion:'companion-duckling'});assert.equal(eq[row.slot],row.id);const svg=camp.scene(eq,{interactive:false});assert.ok(svg.includes(row.id));assert.doesNotMatch(svg,/role="button"|tabindex="0"/);assert.ok(campShop.preview(row.id).includes(row.id));assert.notEqual(geometry(svg),geometry(camp.scene({}, {interactive:false})));}
});
test('new bars reuse the real progress machinery with an empty zero state and isolated definition IDs',()=>{
 const seen=new Set();for(const row of bySlot('bar')){assert.equal(bars.has(row.id),true);assert.deepEqual(collection.barDesign(row.id).colors,collection.colors(row.id).slice(0,2).reverse());const full=bars.fullPreview(row.id);assert.deepEqual([...full.matchAll(/data-pb-sample="(\d+)"/g)].map(m=>Number(m[1])),[0,25,50,75,100]);assert.doesNotMatch(full.split('data-pb-sample="0"')[1].split('</svg>')[0],/pb-preview-leader|linearGradient/);
  for(let i=0;i<3;i++){const svg=bars.preview(row.id),ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);for(const id of ids){assert.equal(seen.has(id),false,id);seen.add(id);}for(const [,ref]of svg.matchAll(/url\(#([^)]+)\)/g))assert.ok(ids.includes(ref),ref);}
 }
 assert.doesNotMatch(collection.barRibbon('bar-prismcurrent','"><script>x</script>'),/<script>|onload=/);for(const color of ['#fd5e9c','#ffc965','#90ef94','#61dfff','#ba91f4'])assert.ok(collection.barRibbon('bar-prismcurrent','rainbow').includes(color));
});
test('eight scene themes have distinct home and city landmarks beyond palettes',()=>{
 const home=[],city=[];for(const row of bySlot('theme')){const palette=collection.themePalette(row.id);assert.equal(palette.length,4);assert.ok(palette.every(c=>/^#[0-9a-f]{6}$/.test(c)));assert.deepEqual(expansion.themePalette(row.id),palette);const backdrop=collection.themeBackdrop(row.id),world=expansion.themeCityScene(row.id);assert.match(backdrop,/class="shop-scene-backdrop-art collection-v2-theme"/);assert.match(world,/collection-v2-city-theme/);assert.ok(css.includes(`[data-theme="${row.id}"]`));assert.ok(backdrop.length>800);home.push(geometry(backdrop));city.push(geometry(world));}
 assert.equal(new Set(home).size,8);assert.equal(new Set(city).size,8);
});
test('banner, effect and companion slots render exact new IDs and retain equipment interoperability',()=>{
 for(const slot of ['banner','fx','companion'])for(const row of bySlot(slot)){assert.equal(shop.apply({[slot]:row.id})[slot],row.id);assert.ok(shop.preview(row.id).includes(row.id));if(slot==='banner')assert.ok(css.includes(`[data-banner="${row.id}"]`));if(slot==='fx'){assert.equal((collection.effectScene(row.id,'home').match(/class="collection-v2-particle"/g)||[]).length,6);assert.equal((collection.effectScene(row.id,'city').match(/class="collection-v2-particle"/g)||[]).length,8);}}
});
test('drawing is bounded, passive, and honors hidden, motion-off, and reduced-motion states',()=>{
 assert.doesNotMatch(source,/setInterval|setTimeout|requestAnimationFrame|fetch\(|localStorage|addEventListener|MutationObserver/);for(const row of rows)assert.ok((collection.preview(row.id).match(/<(?:path|rect|circle|ellipse)/g)||[]).length<250,row.id);
 for(const guard of ['.no-motion','html.focus-runtime-hidden','[hidden]','prefers-reduced-motion:reduce'])assert.ok(css.includes(guard));assert.doesNotMatch(css,/filter:|will-change:/);assert.match(css,/animation:none!important;transition:none!important/);
});
test('browser global and CommonJS share the same safe API with no cross-slot or arbitrary ID rendering',()=>{
 const browser={};vm.runInNewContext(source,browser);assert.equal(browser.FocusShopCollectionV2.entries.length,84);for(const row of rows)assert.equal(geometry(browser.FocusShopCollectionV2.preview(row.id)),geometry(collection.preview(row.id)));
 for(const id of [null,undefined,{},[],"__proto__",'constructor','avatar-<script>','" onload="alert(1)']){assert.equal(collection.has(id),false);assert.equal(collection.preview(id),'');assert.equal(collection.avatar(id),'');assert.equal(collection.barDesign(id),null);}
 assert.equal(collection.has('avatar-postrider','bar'),false);assert.equal(collection.fire('avatar-postrider'),'');assert.equal(collection.themePalette('bar-paperboat'),null);assert.equal(collection.barRibbon('tent-rainhut','test'),'');
});
