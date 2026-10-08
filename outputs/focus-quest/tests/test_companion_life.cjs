'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pets=require('../static/companion-life.js'),shop=require('../static/shop-art.js'),city=require('../static/rain-city-art.js'),expansion=require('../static/shop-expansion.js');
const css=fs.readFileSync(path.join(__dirname,'../static/companion-life.css'),'utf8'),js=fs.readFileSync(path.join(__dirname,'../static/companion-life.js'),'utf8');
test('owned companions retain identity and render lively bodies both on the island and throughout the city',()=>{
 const ids=['companion-fox','companion-owl','companion-whale','companion-dragon',...expansion.entries.filter(e=>e.slot==='companion').map(e=>e.id)];
 for(const id of ids){assert.equal(shop.apply({companion:id}).companion,id);const actual=shop.companionArt(id,{interactive:true});assert.match(actual,new RegExp(`data-companion-life="${id}"`));assert.match(actual,/tabindex="0"/);assert.match(shop.preview(id),/viewBox="0 0 160 112"/);assert.doesNotMatch(shop.preview(id),/tabindex="0"/);assert.match(city.scene({}, {companion:id}),/pet-life-motion/);assert.match(city.interior('observatory',{}, {companion:id}),/pet-life-motion/);}
});
test('different species use different behavior and recognizable existing artwork gains local articulation',()=>{
 assert.equal(pets.profile('companion-owl'),'bird');assert.equal(pets.profile('companion-whale'),'swim');assert.equal(pets.profile('companion-rabbit'),'hop');assert.equal(pets.profile('companion-capybara'),'gentle');assert.equal(pets.profile('companion-fox'),'curious');
 for(const [id,part] of [['fox','tail'],['fox','ears'],['owl','wing-left'],['whale','fin'],['dragon','tail'],['dragon','head'],['cat','tail'],['manta','wing-left'],['phoenix','wing-left']])assert.match(shop.companionArt('companion-'+id),new RegExp('pet-life-'+part));
 assert.match(shop.companionArt('companion-owl'),/pet-life-eye/);
});
test('pet composition is deterministic and inert on free or invalid equipment',()=>{
 assert.equal(shop.companionArt('companion-default'),'');assert.equal(shop.companionArt('relic-lotus'),'');
 for(const id of [null,{},'companion-<script>','constructor','companion-default'])assert.equal(pets.wrap(id,'<path/>'),'');
 assert.equal(shop.companionArt('companion-fox'),shop.companionArt('companion-fox'));
 assert.doesNotMatch(js,/setInterval|setTimeout|requestAnimationFrame|addEventListener|fetch\(|localStorage|Math.random/);
});
test('small local motion pauses off scene and respects accessibility without changing layout',()=>{
 for(const guard of ['.pet-life[data-pet-paused="true"] *{animation-play-state:paused!important}', '.no-motion','html.focus-runtime-hidden','[hidden]','prefers-reduced-motion:reduce','animation-play-state:paused',':focus-visible'])assert.ok(css.includes(guard),guard);
 assert.doesNotMatch(css,/filter\s*:|\b(?:width|height|left|top)\s*:/);assert.match(css,/pet-life-hit\{pointer-events:all\}/);
 for(const name of ['pet-curious','pet-bird','pet-swim','pet-hop','pet-rest','pet-tail','pet-ears','pet-wings','pet-fin','pet-head','pet-blink','pet-greet'])assert.ok(css.includes('@keyframes '+name));
 assert.match(css,/\.pet-life\.pet-life \*\{animation-play-state:paused\}/);
 assert.match(css,/\.rain-city-art\[data-interactive=true\]/);
});
test('redesigned ordinary pets and sundial keep old equipment ids without copying the limited editions',()=>{
 assert.match(shop.companionArt('companion-whale'),/data-creature="bay-manatee"/);
 assert.match(shop.companionArt('companion-dragon'),/data-creature="moss-lizard"/);
 assert.match(shop.preview('relic-orrery'),/data-object="brass-sundial"/);
 assert.doesNotMatch(shop.companionArt('companion-dragon'),/pet-life-wings|dragon-orbit/);
 assert.doesNotMatch(shop.preview('relic-orrery'),/shop-orbit-slow/);
});
test('interactive city and home expose a keyboard greeting, while decorative previews remain inert',()=>{
 const equipment={companion:'companion-fox'};
 for(const svg of [city.scene({},equipment,{interactive:true}),city.interior('observatory',{},equipment,{interactive:true})]){
  assert.match(svg,/data-interactive="true"/);
  assert.match(svg,/data-companion-life="companion-fox"[^>]*tabindex="0"/);
 }
 for(const svg of [city.scene({},equipment,{interactive:false}),city.interior('observatory',{},equipment,{interactive:false}),shop.preview('companion-fox')])assert.doesNotMatch(svg,/data-companion-life="companion-fox"[^>]*tabindex=/);
});

test('every catalog companion has anatomical travel joints, without adding paws to swimming or flying species',()=>{
 const ids=['companion-fox','companion-owl','companion-whale','companion-dragon',...expansion.entries.filter(e=>e.slot==='companion').map(e=>e.id)];
 assert.equal(ids.length,38);
 for(const id of ids){
  const svg=shop.companionArt(id),gait=pets.gait(id);
  assert.match(svg,new RegExp(`data-pet-gait="${gait}"`),id);
  if(['walk','hop','crawl'].includes(gait)){
   assert.match(svg,/class="pet-life-leg-left"/,id+' left contact');
   assert.match(svg,/class="pet-life-leg-right"/,id+' right contact');
  }else{
   assert.doesNotMatch(svg,/pet-life-leg-(?:left|right)/,id+' must not gain generic feet');
   assert.match(svg,/class="[^"]*pet-life-(?:wing-left|wing-right|wings|fin|tail|spine|tentacles)/,id+' local propulsion');
  }
  assert.equal((svg.match(/class="pet-life-heading"/g)||[]).length,1,id);
  assert.equal((svg.match(/class="pet-life-motion"/g)||[]).length,1,id);
  assert.doesNotMatch(svg,/<(?:clipPath|mask|use)\b/,id+' no duplicated/clipped full body');
 }
 assert.equal(pets.gait('companion-penguin'),'walk');
 assert.equal(pets.gait('companion-kingfisher'),'fly');
 assert.equal(pets.gait('companion-ferret'),'walk');
 assert.equal(pets.gait('companion-tortoise'),'crawl');
 assert.equal(pets.gait('companion-sloth'),'crawl');
 assert.equal(pets.gait('companion-snail'),'crawl');
 assert.equal(pets.gait('companion-celestialserpent'),'slither');
});
test('paired anatomy stays separate and ornaments are not mistaken for feet',()=>{
 for(const id of ['owl','manta','phoenix','moonmoth','origamidove']){
  const svg=shop.companionArt('companion-'+id);
  assert.match(svg,/class="pet-life-wing-left"/);assert.match(svg,/class="pet-life-wing-right"/);
 }
 assert.match(shop.companionArt('companion-manta'),/M50 35Q26 21 20 54 36 49 50 62Z/,'manta belly retains its own geometry');
 assert.equal((shop.companionArt('companion-cat').match(/class="pet-life-leg-/g)||[]).length,2,'cat belly is not a leg');
 assert.equal((shop.companionArt('companion-dormouse').match(/class="pet-life-leg-/g)||[]).length,2,'hands around the acorn are not feet');
 assert.match(shop.companionArt('companion-sealpup'),/pet-life-perch/);
 assert.match(shop.companionArt('companion-celestialserpent'),/<g class="pet-life-spine"[^>]*><path d="M71 70/);
});
test('roaming zones are opt-in and allowlisted; heading leaves the hit area and greeting on the navigation root',()=>{
 for(const zone of ['island','city','home','rooftop','library','tea','atelier','arcade','station']){
  assert.match(pets.wrap('companion-fox','<path/>',{interactive:true,zone}),new RegExp(`data-pet-zone="${zone}"`));
  assert.doesNotMatch(pets.wrap('companion-fox','<path/>',{zone}),/data-pet-zone=/);
 }
 for(const zone of ['invalid','city" onload="alert(1)',{},null])assert.doesNotMatch(pets.wrap('companion-fox','<path/>',{interactive:true,zone}),/data-pet-zone=/);
 const svg=pets.wrap('companion-fox','<path/>',{interactive:true,zone:'island'});
 assert.ok(svg.indexOf('pet-life-hit')<svg.indexOf('pet-life-heading'));
 assert.ok(svg.indexOf('pet-life-heading')<svg.indexOf('pet-life-motion'));
 assert.match(svg,/<\/g><\/g><\/g><g class="pet-life-hello"/);
 assert.doesNotMatch(svg,/data-pet-moving=|data-pet-facing=/,'pure render does not start navigation');
});
test('travel uses alternating contact, local propulsion and bounded bodyweight rather than animating the navigation root',()=>{
 for(const name of ['pet-step','pet-walk-weight','pet-hop-kick','pet-flight-wing','pet-paddle','pet-tentacle-pulse','pet-spine-wave'])assert.ok(css.includes('@keyframes '+name));
 assert.match(css,/\.pet-life\[data-pet-moving=true\] \.pet-life-leg-right\{animation-delay:calc\(var\(--pet-step\)\*-.5\)\}/);
 assert.match(css,/\.pet-life\[data-pet-moving=true\]\[data-pet-gait=hop\] :is\([^}]+animation-delay:0s/);
 assert.doesNotMatch(css,/\.pet-life(?:\[data-pet-[^\]]+\])*\{[^}]*\banimation:/);
 assert.match(css,/\.pet-life-heading\{[^}]*transform-origin:50px 50px/);
});
