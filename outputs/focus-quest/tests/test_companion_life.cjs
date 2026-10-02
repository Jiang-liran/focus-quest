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
 for(const [id,part] of [['fox','tail'],['fox','ears'],['owl','wings'],['whale','fin'],['dragon','tail'],['dragon','head'],['cat','tail'],['manta','wings'],['phoenix','wings']])assert.match(shop.companionArt('companion-'+id),new RegExp('pet-life-'+part));
 assert.match(shop.companionArt('companion-owl'),/pet-life-eye/);
});
test('pet composition is deterministic and inert on free or invalid equipment',()=>{
 assert.equal(shop.companionArt('companion-default'),'');assert.equal(shop.companionArt('relic-lotus'),'');
 for(const id of [null,{},'companion-<script>','constructor','companion-default'])assert.equal(pets.wrap(id,'<path/>'),'');
 assert.equal(shop.companionArt('companion-fox'),shop.companionArt('companion-fox'));
 assert.doesNotMatch(js,/setInterval|setTimeout|requestAnimationFrame|addEventListener|fetch\(|localStorage|Math.random/);
});
test('small local motion pauses off scene and respects accessibility without changing layout',()=>{
 for(const guard of ['.no-motion','html.focus-runtime-hidden','[hidden]','prefers-reduced-motion:reduce','animation-play-state:paused',':focus-visible'])assert.ok(css.includes(guard),guard);
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
