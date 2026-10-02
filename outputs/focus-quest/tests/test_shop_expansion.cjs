const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const expansion=require('../static/shop-expansion.js'),shop=require('../static/shop-art.js'),camp=require('../static/camp-world-art.js'),campShop=require('../static/campfire-shop-art.js'),avatars=require('../static/quest-art.js'),bars=require('../static/progress-bars.js');
const campSlots=new Set(['camp','fire','tent','campgear','campglow','chatframe','camptrail','campmark']);
const art=id=>campSlots.has(expansion.item(id).slot)?campShop.preview(id):shop.preview(id);
const geometry=svg=>svg.replace(/\s(?:data-[\w-]+|class|style|fill|stroke|opacity|stop-color)="[^"]*"/g,'').replace(/\bid="[^"]*"/g,'id="local"').replace(/url\(#[^)]+\)/g,'url(#local)');
test('every new product is backed by distinct self-contained visible geometry',()=>{
 const all=expansion.entries.map(e=>art(e.id));
 for(let i=0;i<all.length;i++){assert.match(all[i],/^<svg/);assert.ok(all[i].length>200,expansion.entries[i].id);assert.doesNotMatch(all[i],/undefined|NaN|Infinity|<script|<foreignObject|\bon\w+=|href=/);}
 // The enlarged catalog is several MB; a synchronous stdin pipe can remain
 // waiting for EOF on macOS. A file keeps validation bounded and independent
 // of the process pipe buffer, while preserving the full XML check.
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'focus-shop-xml-'));
 try{
  const input=path.join(temporary,'previews.json');fs.writeFileSync(input,JSON.stringify(all));
  const xml=spawnSync('/usr/bin/python3',['-c','import json,sys,xml.etree.ElementTree as ET\nwith open(sys.argv[1],encoding="utf-8") as source:\n for svg in json.load(source): ET.fromstring(svg)',input],{encoding:'utf8',timeout:15000});
  assert.equal(xml.status,0,xml.error?.message||xml.stderr);
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
 for(const slot of new Set(expansion.entries.map(e=>e.slot))){const products=expansion.entries.filter(e=>e.slot===slot),rendered=products.map(e=>geometry(art(e.id)));assert.equal(new Set(rendered).size,products.length,`duplicate geometry in ${slot}`);}
});
test('actual equipped island layouts and camp fixtures change from the free default and keep all other slots',()=>{
 for(const e of expansion.entries){
  if(campSlots.has(e.slot)){const eq=camp.normalize({[e.slot]:e.id});assert.equal(eq[e.slot],e.id);const actual=camp.scene(eq,{interactive:false});assert.ok(actual.includes(e.id));assert.notEqual(geometry(actual),geometry(camp.scene({}, {interactive:false})));assert.doesNotMatch(actual,/role="button"|tabindex="0"/);}
  else {assert.equal(shop.apply({[e.slot]:e.id})[e.slot],e.id);if(e.slot==='island')assert.ok(shop.islandPreview(e.id,{companion:'companion-cat',relic:'relic-cosmosheart',avatar:'avatar-astronaut',theme:'theme-nebulaverse'}).includes(e.id));}
 }
});
test('all new player outfits have four valid growth stages including lottery-only clothing',()=>{
 for(const e of expansion.entries.filter(e=>e.slot==='avatar')){
  const stages=[0,1,2,3,4].map(n=>avatars.avatar('player',e.id,n));assert.equal(new Set(stages).size,5);for(let n=0;n<5;n++){assert.match(stages[n],new RegExp(`data-avatar-stage="${n}"`));for(let tier=1;tier<=4;tier++)assert.match(stages[n],new RegExp(`data-avatar-tier="${tier}" display="${n>=tier?'inline':'none'}"`));}assert.doesNotMatch(avatars.avatar('shop',e.id),new RegExp(e.id));
 }
});
test('all ordinary expansion items are available to lottery pools while thirty-six lottery-only items remain independent',()=>{
 const ordinary=expansion.entries.filter(e=>!e.lotteryOnly),limited=expansion.entries.filter(e=>e.lotteryOnly);
 assert.equal(ordinary.length,268);assert.equal(limited.length,36);
 assert.ok(ordinary.every(e=>e.exclusive===false));
 assert.ok(ordinary.every(e=>e.coins>0||e.diamonds>0));
 assert.ok(ordinary.every(e=>e.lotteryMachine===null));
 for(const machine of ['coin','diamond'])assert.equal(limited.filter(e=>e.lotteryMachine===machine).length,18);
 assert.ok(limited.every(e=>e.exclusive===false));
});
test('new progress bars keep zero progress empty and generate locally unique definitions',()=>{
 const seen=new Set();for(const e of expansion.entries.filter(e=>e.slot==='bar')){assert.equal(bars.has(e.id),true);assert.match(bars.fullPreview(e.id),/data-pb-sample="0"/);for(let repeat=0;repeat<3;repeat++){const svg=bars.preview(e.id),ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);for(const id of ids){assert.ok(!seen.has(id));seen.add(id);}for(const m of svg.matchAll(/url\(#([^)]*)\)/g))assert.ok(ids.includes(m[1]));}}
});
test('cross-slot and untrusted identifiers never render or activate cosmetics',()=>{
 for(const id of [null,undefined,{},[],"__proto__",'constructor','avatar-<script>','" onload="alert(1)']){assert.equal(expansion.preview(id),'');assert.equal(expansion.has(id),false);}
 assert.equal(shop.apply({avatar:'companion-cat'}).avatar,'avatar-default');assert.equal(camp.normalize({fire:'tent-glassdome'}).fire,'fire-default');
});
test('art is bounded, has no background machinery and respects reduced-motion and hidden-state guards',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../static/shop-expansion.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'../static/shop-expansion.css'),'utf8');assert.doesNotMatch(source,/setInterval|setTimeout|requestAnimationFrame|fetch\(|localStorage|addEventListener/);for(const e of expansion.entries)assert.ok((art(e.id).match(/<(?:path|rect|circle|ellipse)/g)||[]).length<450,e.id);for(const guard of ['.no-motion','html.focus-runtime-hidden','[hidden]','prefers-reduced-motion:reduce'])assert.ok(css.includes(guard));
});
