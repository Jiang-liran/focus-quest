const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {scene,updateProgress} = require('../static/citadel-art.js');
const route = require('../static/citadel-route.js');
const catalog = {
  theme:['default','forest','ocean','sakura','aurora'], fx:['default','fireflies','petals','snow','meteor','nebula'],
  avatar:['default','ranger','voyager','alchemist','star','royal'], companion:['default','fox','owl','whale','dragon'],
  relic:['default','lotus','orrery','hourglass'], portal:['default','moon','archive','cosmos'],
};
const places = {dock:0, core:0, workshop:.25, archive:.5, observatory:.75, gate:1};
const model = progress => ({progress, percent:progress*100, subjects:[], stage:Math.min(4, Math.floor(progress*4))});

function group(markup, selector) {
  const position = markup.indexOf(selector);
  assert.notEqual(position, -1, `Missing ${selector}`);
  const start = markup.lastIndexOf('<g ', position);
  let depth=0;
  for (const match of markup.slice(start).matchAll(/<g\b[^>]*>|<\/g>/g)) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (!depth) return markup.slice(start, start+match.index+match[0].length);
  }
  assert.fail(`Unbalanced ${selector}`);
}
const place = (svg,id) => group(svg, `data-citadel-place="${id}"`);

test('city contains six discoverable districts, connected infrastructure, and no old main-island mounts', () => {
  const svg=scene(model(1),{});
  assert.match(svg,/^<svg class="citadel-art" viewBox="0 0 1200 720"/);
  assert.match(svg,/stroke="none" style="stroke:none"/);
  assert.equal((svg.match(/data-citadel-place=/g)||[]).length,6);
  assert.equal((svg.match(/role="button" tabindex="0"/g)||[]).length,6);
  assert.equal((svg.match(/class="citadel-route-segment"/g)||[]).length,4);
  assert.doesNotMatch(svg,/class="citadel-bridge"/);
  for(const id of Object.keys(places))assert.match(place(svg,id),/class="citadel-hit-area"[^>]*fill="transparent" stroke="none"/);
  assert.match(place(svg,'core'),/class="citadel-garden"/);
  assert.match(place(svg,'core'),/class="citadel-canal"/);
  assert.match(place(svg,'dock'),/class="citadel-boat"/);
  assert.match(place(svg,'workshop'),/class="citadel-gear"/);
  assert.match(place(svg,'observatory'),/class="citadel-orrery"/);
  assert.doesNotMatch(svg,/\bid=|class="floating-island"|class="scene-theme-backdrop"|id="scene-traveler"|id="equipped-/);
});

test('facility unlocks honor exact thresholds while locked facilities remain inspectable', () => {
  for(const [id,threshold] of Object.entries(places)) {
    const exact=place(scene(model(threshold),{}),id);
    assert.match(exact,/data-unlocked="true"/);
    if(threshold) {
      const before=place(scene(model(threshold-1e-8),{}),id);
      assert.match(before,/data-unlocked="false"/);
      assert.match(before,/role="button" tabindex="0"/);
      assert.match(before,new RegExp(`每日进度 ${threshold*100}% 开放`));
      assert.match(before,/class="citadel-construction"/);
      assert.match(before,/class="citadel-buildings" display="none"/);
      assert.doesNotMatch(exact,/class="citadel-construction"/);
    }
  }
  const partial=scene(model(.625),{});
  assert.match(place(partial,'archive'),/data-unlocked="true"/);
  assert.match(place(partial,'observatory'),/data-unlocked="false" data-charge="0.5"/);
  assert.notEqual(scene(model(.62),{}),scene(model(.63),{}));
});

test('decorative shop previews retain the complete city without keyboard or pointer hotspots', () => {
  const svg=scene(model(1),{theme:'theme-forest'},{interactive:false,selected:'archive'});
  assert.match(svg,/data-interactive="false"[^>]*aria-hidden="true" focusable="false"/);
  assert.equal((svg.match(/data-citadel-place=/g)||[]).length,6);
  assert.doesNotMatch(svg,/tabindex=|role="button"|citadel-place-interactive|class="citadel-hit-area"/);
  assert.match(svg,/class="citadel-garden"/);
  assert.match(svg,/data-citadel-equipment="theme-forest"/);
});

test('selection and arrival pulses can only reference known districts', () => {
  const svg=scene(model(.5),{},{selected:'archive',pulse:'core'});
  assert.match(place(svg,'archive'),/class="citadel-place citadel-place-interactive is-selected"/);
  assert.match(place(svg,'archive'),/aria-pressed="true"/);
  assert.match(place(svg,'core'),/class="citadel-place citadel-place-interactive is-pulsing"/);
  assert.match(place(scene(model(0),{},{pulse:true}),'core'),/is-pulsing/);
  assert.doesNotMatch(scene(model(.5),{},{selected:'missing',pulse:'missing'}),/is-selected|is-pulsing/);
});

test('each facility interaction has its own decorative geometry and only the requested facility pulses', () => {
  const landmarks={dock:'citadel-paperboat-launch',core:'citadel-core-waves',workshop:'citadel-workshop-circuit',archive:'citadel-page-words',observatory:'citadel-unfold-orbits',gate:'citadel-gate-motes'};
  const effects=[];
  for(const [id,landmark] of Object.entries(landmarks)) {
    const svg=scene(model(1),{},{pulse:id});
    assert.equal((svg.match(/ is-pulsing"/g)||[]).length,1);
    assert.match(place(svg,id),/is-pulsing/);
    const effect=group(svg,`data-citadel-effect="${id}"`);
    assert.match(effect,new RegExp(`class="${landmark}"`));
    assert.match(effect,/pointer-events="none" aria-hidden="true"/);
    assert.doesNotMatch(effect,/tabindex=|role="button"|data-skin-slots/);
    effects.push([...effect.matchAll(/<(?:path|circle|ellipse|text)\b[^>]*>/g)].map(match=>match[0]).join(''));
  }
  assert.equal(new Set(effects).size,6);
});

test('short facility interactions preserve equipment and progression and reset without persistent state', () => {
  const equipment={theme:'theme-aurora',relic:'relic-orrery',portal:'portal-cosmos',companion:'companion-whale',avatar:'avatar-star',fx:'fx-snow'};
  const baseline=scene(model(.77),equipment),pulsing=scene(model(.77),equipment,{pulse:'core'});
  for(const id of Object.values(equipment))assert.equal(group(pulsing,`data-citadel-equipment="${id}"`),group(baseline,`data-citadel-equipment="${id}"`));
  assert.equal(scene(model(.77),equipment),baseline);
  assert.equal(place(pulsing,'core').replace(' is-pulsing',''),place(baseline,'core'));
  assert.match(pulsing,/data-citadel-progress="0.77"/);
});

test('all thirty existing equipment choices change their actual district graphics', () => {
  assert.equal(Object.values(catalog).flat().length,30);
  for(const [slot,variants] of Object.entries(catalog)) {
    const graphics=variants.map(variant => {
      const id=`${slot}-${variant}`,svg=scene(model(1),{[slot]:id});
      if(id==='companion-default') {
        assert.doesNotMatch(svg,/class="citadel-equipped-art citadel-equipped-companion"/);
        return '';
      }
      const result=group(svg,`data-citadel-equipment="${id}"`);
      assert.ok(result.match(/data-skin-slots="([^"]+)"/)[1].split(' ').includes(slot));
      return [...result.matchAll(/<(?:path|ellipse|circle|rect)\b[^>]*>/g)].map(match=>match[0]).join('');
    });
    assert.equal(new Set(graphics).size,variants.length,`${slot} only changes metadata`);
  }
});

test('themes include structural environment and building details, beyond palette changes', () => {
  const worlds=Object.fromEntries(catalog.theme.map(name=>[name,scene(model(1),{theme:`theme-${name}`})]));
  assert.match(worlds.forest,/<path d="M-75\.4 31q-5 31/);
  assert.match(worlds.ocean,/class="citadel-waterfall"/);
  assert.match(worlds.sakura,/<circle cx="-13" cy="-31" r="13"/);
  assert.match(worlds.aurora,/class="citadel-aurora-curtain"/);
  assert.doesNotMatch(worlds.default,/citadel-waterfall|citadel-aurora-curtain/);
});

test('applying a shop preview changes only that slot while preserving the rest of a combination', () => {
  const equipped={theme:'theme-ocean',fx:'fx-meteor',avatar:'avatar-royal',companion:'companion-dragon',relic:'relic-lotus',portal:'portal-cosmos',bar:'bar-prism',camp:'camp-snow'};
  const before=scene(model(.8),equipped),after=scene(model(.8),{...equipped,avatar:'avatar-ranger'});
  for(const slot of ['theme','fx','companion','relic','portal'])assert.equal(group(before,`data-citadel-equipment="${equipped[slot]}"`),group(after,`data-citadel-equipment="${equipped[slot]}"`));
  assert.notEqual(group(before,'data-citadel-equipment="avatar-royal"'),group(after,'data-citadel-equipment="avatar-ranger"'));
  assert.equal(equipped.avatar,'avatar-royal');
  assert.doesNotMatch(after,/bar-prism|camp-snow/);
});

test('relic size and brightness follow learning progress without replacing its positioning transform', () => {
  const low=scene(model(0),{relic:'relic-hourglass'}),high=scene(model(1),{relic:'relic-hourglass'});
  const lowEquipment=group(low,'data-citadel-equipment="relic-hourglass"'),highEquipment=group(high,'data-citadel-equipment="relic-hourglass"');
  assert.equal(lowEquipment,highEquipment);
  assert.match(lowEquipment,/<g class="citadel-relic-size"><g transform="translate\(30 5\)">/);
  assert.match(low,/--citadel-relic-scale:0.91/);
  assert.match(high,/--citadel-relic-scale:1/);
  assert.notEqual(group(low,'class="citadel-relic-power"'),group(high,'class="citadel-relic-power"'));
});

test('untrusted values cannot inject SVG content, selectors, URLs, or invalid geometry', () => {
  const attack='" onload="alert(1)<script>alert(1)</script>';
  for(const input of [null,undefined,[],{progress:NaN},{progress:Infinity},{progress:-1},{progress:9}]) {
    const svg=scene(input,{theme:attack,fx:attack,avatar:attack,companion:attack,relic:'portal-moon',portal:'relic-lotus'},{selected:attack,pulse:attack});
    assert.doesNotMatch(svg,/<script|<foreignObject|\bon\w+=|href=|url\(|NaN|Infinity|undefined/);
    assert.match(svg,/data-citadel-theme="default"/);
    assert.match(svg,/data-citadel-equipment="relic-default"/);
    assert.match(svg,/data-citadel-equipment="portal-default"/);
  }
  assert.match(scene({progress:-1},{}),/data-citadel-progress="0"/);
  assert.match(scene({progress:9},{}),/data-citadel-progress="1"/);
});

test('district label targets are not masked by a later district hit ellipse', () => {
  const svg=scene(model(1),{}),regions=[...svg.matchAll(/data-citadel-place="([^"]+)"/g)].map(match=>place(svg,match[1]));
  const geometry=regions.map(region=>{
    const t=region.match(/transform="translate\((\d+) (\d+)\)"/),hit=region.match(/class="citadel-hit-area" cx="0" cy="(-?\d+)" rx="(\d+)" ry="(\d+)"/),label=region.match(/class="citadel-place-label" transform="translate\(0 (\d+)\)"/);
    return {x:+t[1],y:+t[2],cy:+hit[1],rx:+hit[2],ry:+hit[3],labelY:+label[1]};
  });
  geometry.forEach((target,index)=>{
    for(const later of geometry.slice(index+1)) {
      const dx=target.x-later.x,dy=target.y+target.labelY-(later.y+later.cy);
      assert.ok((dx/later.rx)**2+(dy/later.ry)**2>1,`Label ${index} is covered by a later hit region`);
    }
  });
});

test('UMD city rendering is deterministic and has no document or equipment-application side effects', () => {
  const context=vm.createContext({});
  for(const name of ['quest-art','shop-art','citadel-route','citadel-art'])vm.runInContext(fs.readFileSync(require.resolve(`../static/${name}.js`),'utf8'),context);
  const data=Object.freeze(model(.75)),equipment=Object.freeze({theme:'theme-sakura',avatar:'avatar-star',relic:'relic-lotus'}),options=Object.freeze({interactive:false});
  const output=scene(data,equipment,options);
  assert.equal(context.FocusCitadelArt.scene(data,equipment,options),output);
  assert.equal(scene(data,equipment,options),output);
  assert.doesNotMatch(output,/\bid=|<animate\b|<animateTransform\b/);
  const isolated=vm.createContext({});vm.runInContext(fs.readFileSync(require.resolve('../static/citadel-art.js'),'utf8'),isolated);
  assert.match(isolated.FocusCitadelArt.scene(data,equipment,options),/^<svg class="citadel-art"/);
});

test('central island expresses progress with its energy rings and structures without a numeric panel',()=>{
  for(const percent of [0,24.999,25,39.1667,50,75,99.99,100,133.333]){
    const svg=scene({percent,progress:0,minutes:640,target:480},{}),core=place(svg,'core');
    assert.doesNotMatch(core,/citadel-core-readout|citadel-core-percent|citadel-core-duration|citadel-core-overflow|小时|分钟|余辉/);
    assert.equal((core.match(/class="citadel-charge-arc"/g)||[]).length,4);
    const offsets=[...core.matchAll(/class="citadel-charge-arc"[^>]*stroke-dashoffset="([^"]+)"/g)].map(match=>Number(match[1]));
    assert.deepEqual(offsets,[0,1,2,3].map(index=>Math.round((1-Math.max(0,Math.min(1,percent/25-index)))*100000)/1000));
    const unlocked=[...core.matchAll(/data-core-tier="(\d+)"\s*(display="none")?/g)].filter(m=>!m[2]);
    assert.equal(unlocked.length,route.build(percent).stage);
  }
});

test('milestones exchange visible construction for complete masonry and only explicit arrivals assemble',()=>{
  for(const [id,threshold] of Object.entries(places).filter(([,value])=>value)){
    const before=place(scene(model(threshold-.001),{}),id),after=place(scene(model(threshold),{}),id);
    assert.match(before,/class="citadel-construction"/);
    assert.match(before,/class="citadel-buildings" display="none"/);
    assert.doesNotMatch(after,/citadel-construction|is-awakening/);
    for(const layer of ['base','wall','crown','detail'])assert.match(after,new RegExp(`class="citadel-assembly-${layer}"><(?:path|g|ellipse)`));
    assert.match(after,new RegExp(`0${threshold*4} · ${threshold*100}%`));
    const celebrated=scene(model(threshold),{},{awakening:{id,token:7}});
    assert.equal((celebrated.match(/ is-awakening"/g)||[]).length,1);
    assert.match(place(celebrated,id),/data-awakening-token="7"/);
    assert.match(celebrated,/citadel-awakening-beam/);assert.match(celebrated,/citadel-city-awakening/);
    assert.doesNotMatch(scene(model(threshold-.001),{},{awakening:{id,token:7}}),/is-awakening|citadel-city-awakening/);
  }
  assert.doesNotMatch(scene(model(1),{},{awakening:{id:'<script>',token:9}}),/is-awakening|<script/);
});

test('traveler and equipped companion move along the visible route, with separate idle and walking states',()=>{
  const round=v=>Math.round(v*1000)/1000;
  const positions=[];
  for(const percent of [0,12.5,25,37.5,50,62.5,75,87.5,100,140]){
    const svg=scene({percent,moving:true},{avatar:'avatar-royal',companion:'companion-fox'}),travel=group(svg,'class="citadel-player citadel-route-traveler"'),expected=route.build(percent);
    assert.match(travel,new RegExp(`transform="translate\\(${round(expected.position.x)} ${round(expected.position.y)}\\)"`));
    assert.match(travel,/data-citadel-equipment="avatar-royal"/);assert.match(svg,/data-citadel-equipment="companion-fox"/);
    assert.match(svg,/class="citadel-route-actors" data-moving="true"/);
    assert.match(travel,new RegExp(`scale\\(${expected.direction} 1\\)`));
    positions.push(travel.match(/transform="translate\([^"]+/)[0]);
  }
  assert.equal(new Set(positions).size,9);
  assert.match(scene({percent:30,moving:false},{}),/class="citadel-route-actors" data-moving="false"/);
});

// Minimal SVG DOM from generated markup: mutation assertions exercise the real selectors
// and descendants while forbidding wholesale DOM replacement during frame updates.
function svgDOM(markup){
  class Element {
    constructor(tag,attrs={}){this.tagName=tag;this.attrs={...attrs};this.children=[];this.textContent='';this.writes=0;this.style={values:{},setProperty:(key,value)=>{this.style.values[key]=String(value);}};}
    get innerHTML(){throw Error('Frame updates must not read or replace SVG markup');}
    set innerHTML(value){throw Error('Frame updates must not replace SVG markup');}
    getAttribute(name){return Object.hasOwn(this.attrs,name)?this.attrs[name]:null;}
    setAttribute(name,value){this.attrs[name]=String(value);this.writes++;}
    matches(selector){if(selector.startsWith('.'))return (this.attrs.class||'').split(/\s+/).includes(selector.slice(1));const m=selector.match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/);return !!m&&Object.hasOwn(this.attrs,m[1])&&(m[2]===undefined||this.attrs[m[1]]===m[2]);}
    querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  }
  const root=new Element('document'),stack=[root];
  for(const match of markup.matchAll(/<\/?[a-zA-Z][^>]*>|[^<]+/g)){
    const token=match[0];if(token.startsWith('</')){stack.pop();continue;}if(!token.startsWith('<')){stack.at(-1).textContent+=token;continue;}
    const tag=token.match(/^<([^\s/>]+)/)[1],attrs=Object.fromEntries([...token.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]])),node=new Element(tag,attrs);stack.at(-1).children.push(node);if(!token.endsWith('/>'))stack.push(node);
  }
  assert.equal(stack.length,1,'Balanced SVG document');return root.children[0];
}

test('frame updates match a fresh scene without replacing actors, selected facilities, gear, or animation nodes',()=>{
  const equipment={theme:'theme-ocean',avatar:'avatar-royal',companion:'companion-dragon',relic:'relic-hourglass',portal:'portal-cosmos'},options={selected:'archive',pulse:'core',awakening:{id:'archive',token:77}};
  const svg=svgDOM(scene({percent:50,minutes:240,target:480},equipment,options));
  const actor=svg.querySelector('.citadel-route-traveler'),companion=svg.querySelector('.citadel-route-companion'),archive=svg.querySelector('[data-citadel-place="archive"]');
  const animation=svg.querySelector('.citadel-awakening-effect'),initialActorChildren=actor.children.slice();
  for(const percent of [51,59.3,65,74.99]){
    const data={percent,minutes:percent*4.8,target:480,moving:true},fresh=svgDOM(scene(data,equipment,options));
    assert.deepEqual(updateProgress(svg,data),route.build(percent));
    assert.equal(svg.querySelector('.citadel-route-traveler'),actor);assert.equal(svg.querySelector('.citadel-route-companion'),companion);assert.equal(svg.querySelector('.citadel-awakening-effect'),animation);assert.deepEqual(actor.children,initialActorChildren);
    for(const selector of ['.citadel-route-traveler','.citadel-route-companion','.citadel-route-actors'])assert.deepEqual(svg.querySelector(selector).attrs,fresh.querySelector(selector).attrs);
    for(const selector of ['.citadel-charge-arc','.citadel-route-travelled','.citadel-lamp-light','.citadel-light-halo','.citadel-edge-current'])assert.deepEqual(svg.querySelectorAll(selector).map(el=>el.attrs),fresh.querySelectorAll(selector).map(el=>el.attrs));
    assert.equal(svg.querySelector('.citadel-core-readout'),null);
    assert.equal(archive.getAttribute('data-awakening-token'),'77');assert.match(archive.getAttribute('class'),/is-selected.*is-awakening/);
    assert.equal(actor.getAttribute('data-citadel-equipment'),'avatar-royal');
  }
  updateProgress(svg,{percent:74.99,moving:false});assert.equal(svg.querySelector('.citadel-route-actors').getAttribute('data-moving'),'false');
  assert.equal(updateProgress(null,{}),null);
});

const coreSubjects=['math','cs','politics','english'];
const rounded=value=>Math.round(value*1000)/1000;
function checkSubject(svg,id,progress,complete=progress>=1){
  const node=svg.querySelector(`[data-core-subject="${id}"]`);
  assert.ok(node,`Missing ${id} star seal`);
  assert.match(node.getAttribute('class'),/\bcitadel-core-subject\b/);
  const actual=Number(node.getAttribute('data-subject-progress'));
  assert.ok(Number.isFinite(actual)&&actual>=0&&actual<=1,`${id}: unsafe progress ${actual}`);
  assert.ok(Math.abs(actual-progress)<=.001,`${id}: expected progress ${progress}, received ${actual}`);
  assert.equal(node.getAttribute('data-complete'),String(complete),`${id}: completion must use the unrounded subject ratio`);
  const ring=node.querySelector('.citadel-subject-charge');
  assert.ok(ring,`${id}: missing charge ring`);
  assert.equal(ring.tagName,'circle'); assert.equal(ring.getAttribute('pathLength'),'100');
  assert.ok(Math.abs(Number(ring.getAttribute('stroke-dashoffset'))-rounded(100*(1-progress)))<.001,`${id}: ring must match its own progress`);
  return node;
}

test('the core always shows four independent subject seals with exact completion and capped over-goal charge',()=>{
  const subjects=Object.freeze([
    Object.freeze({id:'english',minutes:90,target:60}),
    Object.freeze({id:'math',minutes:90,target:180,percent:100,progress:1}),
    Object.freeze({id:'politics',minutes:60,target:60}),
    Object.freeze({id:'cs',minutes:179.99,target:180}),
  ]);
  for(const percent of [0,100,150]){
    const svg=svgDOM(scene(Object.freeze({percent,subjects}),{}));
    assert.deepEqual(svg.querySelectorAll('.citadel-core-subject').map(node=>node.getAttribute('data-core-subject')),coreSubjects);
    checkSubject(svg,'math',.5); checkSubject(svg,'cs',179.99/180,false);
    checkSubject(svg,'politics',1); checkSubject(svg,'english',1);
  }
});

test('unset goals and missing or invalid subject records stay empty even when the whole day is complete',()=>{
  const inputs=[
    undefined,null,{},[],
    [null,false,12,'math',{id:'other',minutes:180,target:180}],
    [{id:'math',minutes:60,target:0,percent:100,progress:1},{id:'cs',minutes:60,target:-60},
      {id:'politics',minutes:NaN,target:60},{id:'english',minutes:Infinity,target:60}],
    [{id:'math',minutes:'180',target:180},{id:'cs',minutes:60,target:'60'},
      {id:'politics',minutes:60,target:Infinity},{id:'english',progress:Infinity}],
  ];
  for(const subjects of inputs){
    const svg=svgDOM(scene({percent:100,subjects},{}));
    assert.equal(svg.querySelectorAll('.citadel-core-subject').length,4);
    coreSubjects.forEach(id=>checkSubject(svg,id,0,false));
  }
});

test('normalized subject percentages and ratios work without duration fields and stay independent of total progress',()=>{
  const svg=svgDOM(scene({percent:75,subjects:[
    {id:'math',percent:25},{id:'cs',progress:.625},{id:'politics',percent:133.333},{id:'english',progress:-2},
  ]},{}));
  checkSubject(svg,'math',.25); checkSubject(svg,'cs',.625); checkSubject(svg,'politics',1); checkSubject(svg,'english',0);
  const exact=svgDOM(scene({percent:0,subjects:[{id:'math',percent:99.9999},{id:'cs',progress:1},{id:'politics',progress:1.4}]},{}));
  checkSubject(exact,'math',.999999,false); checkSubject(exact,'cs',1); checkSubject(exact,'politics',1); checkSubject(exact,'english',0);
});

test('the heart engine follows total progress across exact gates without a numeric readout or inheriting subject completion',()=>{
  for(const percent of [0,24.999,25,49.999,50,74.999,75,99.999,100,133.333]){
    const data={percent,stage:4,subjects:coreSubjects.map(id=>({id,minutes:180,target:180}))};
    const markup=scene(data,{}),svg=svgDOM(markup),engine=svg.querySelector('.citadel-heart-engine'),ring=svg.querySelector('.citadel-heart-charge');
    assert.ok(engine); assert.ok(ring);
    assert.equal(engine.getAttribute('data-core-stage'),String(route.build(percent).stage));
    assert.equal(ring.getAttribute('pathLength'),'100');
    assert.ok(Math.abs(Number(ring.getAttribute('stroke-dashoffset'))-rounded((1-Math.min(1,percent/100))*100))<.001);
    assert.doesNotMatch(place(markup,'core'),/citadel-core-readout|citadel-core-percent|citadel-core-duration|citadel-core-overflow|小时|分钟|余辉/);
  }
});

test('subject and engine frame updates equal fresh art while preserving every equipment subtree and star-seal node',()=>{
  const equipment={theme:'theme-aurora',relic:'relic-orrery',portal:'portal-cosmos',companion:'companion-fox',avatar:'avatar-star',fx:'fx-snow'};
  const svg=svgDOM(scene({percent:0,subjects:[]},equipment));
  const seals=svg.querySelectorAll('.citadel-core-subject'),rings=svg.querySelectorAll('.citadel-subject-charge');
  const engine=svg.querySelector('.citadel-heart-engine'),heart=svg.querySelector('.citadel-heart-charge');
  const equipped=svg.querySelectorAll('[data-citadel-equipment]');
  const tree=node=>{
    const attrs={...node.attrs};
    // The equipped traveler may move and face along the route; its outfit stays identical.
    if(/\bcitadel-route-(?:traveler|facing)\b/.test(attrs.class||''))delete attrs.transform;
    if(/\bquest-player-growth\b/.test(attrs.class||''))delete attrs['data-avatar-stage'];
    if(Object.hasOwn(attrs,'data-avatar-tier'))delete attrs.display;
    return {tag:node.tagName,attrs,text:node.textContent,children:node.children.map(tree)};
  };
  const gearBefore=equipped.map(tree);
  const updates=[
    {percent:22,subjects:[{id:'math',minutes:75,target:180},{id:'cs',minutes:15,target:180}]},
    {percent:52,subjects:[{id:'math',minutes:179.99,target:180},{id:'cs',minutes:180,target:180},{id:'english',minutes:30,target:60}]},
    {percent:100,subjects:[{id:'math',minutes:210,target:180},{id:'cs',percent:25},{id:'politics',progress:.75}]},
    {percent:133.333,subjects:coreSubjects.map(id=>({id,minutes:200,target:60}))},
    {percent:0,subjects:[{id:'math',minutes:60,target:0},{id:'cs',minutes:NaN,target:180}]},
  ];
  for(const data of updates){
    const fresh=svgDOM(scene(data,equipment));
    updateProgress(svg,data);
    svg.querySelectorAll('.citadel-core-subject').forEach((node,index)=>assert.equal(node,seals[index]));
    svg.querySelectorAll('.citadel-subject-charge').forEach((node,index)=>assert.equal(node,rings[index]));
    assert.equal(svg.querySelector('.citadel-heart-engine'),engine); assert.equal(svg.querySelector('.citadel-heart-charge'),heart);
    for(const selector of ['.citadel-core-subject','.citadel-subject-charge','.citadel-heart-engine','.citadel-heart-charge']){
      const actual=svg.querySelectorAll(selector),expected=fresh.querySelectorAll(selector);
      assert.equal(actual.length,expected.length);
      for(let i=0;i<actual.length;i++)for(const attr of ['data-core-subject','data-subject-progress','data-complete','data-core-stage','stroke-dashoffset','pathLength']){
        assert.equal(actual[i].getAttribute(attr),expected[i].getAttribute(attr),`${selector} ${i} ${attr}`);
      }
    }
    svg.querySelectorAll('[data-citadel-equipment]').forEach((node,index)=>assert.equal(node,equipped[index]));
    assert.deepEqual(equipped.map(tree),gearBefore);
  }
});

test('untrusted subject metadata never becomes SVG text, attributes or selectors and safe updates also clear old progress',()=>{
  const attack='" onload="alert(1)<script>bad</script>';
  const data={percent:100,subjects:[{id:attack,minutes:180,target:180},{id:'math',name:attack,color:attack,minutes:attack,target:180},
    {id:'cs',percent:attack},{id:'politics',progress:attack},{id:'english',minutes:60,target:attack}]};
  const markup=scene(data,{});
  assert.doesNotMatch(markup,/<script|<foreignObject|\bon\w+=|href=|url\(|NaN|Infinity|undefined/);
  const svg=svgDOM(scene({percent:100,subjects:coreSubjects.map(id=>({id,progress:1}))},{}));
  updateProgress(svg,data);
  coreSubjects.forEach(id=>checkSubject(svg,id,0,false));
});

test('plaza keeps a complete stone ring from the start and grows theme-matched finery through every stage',()=>{
  for(const theme of ['default','forest','ocean','sakura','aurora']) {
    const eq={theme:`theme-${theme}`,avatar:'avatar-ranger'},svg=svgDOM(scene({percent:0},eq));
    const rings=svg.querySelector('.citadel-plaza-rings'),metal=svg.querySelector('.citadel-plaza-metal');
    const startColor=metal.getAttribute('fill');
    for(const percent of [0,24.99,25,49.99,50,75,100,160,50,0]) {
      const fresh=svgDOM(scene({percent},eq));updateProgress(svg,{percent});
      assert.equal(svg.querySelector('.citadel-plaza-rings'),rings);
      assert.equal(svg.querySelector('.citadel-plaza-metal'),metal);
      assert.equal(rings.getAttribute('data-plaza-stage'),String(Math.min(4,Math.floor(percent/25))));
      for(const selector of ['.citadel-plaza-metal','.citadel-plaza-edge','.citadel-plaza-charge','.citadel-plaza-finery']) {
        assert.deepEqual(svg.querySelectorAll(selector).map(el=>el.attrs),fresh.querySelectorAll(selector).map(el=>el.attrs));
      }
      const ring=svg.querySelector('.citadel-plaza-charge');
      assert.equal(ring.tagName,'ellipse');
      assert.equal(ring.getAttribute('stroke-dasharray'),null);
      assert.equal(ring.getAttribute('stroke-dashoffset'),null);
      if(percent===100)assert.notEqual(metal.getAttribute('fill'),startColor);
    }
    assert.equal(metal.getAttribute('fill'),startColor);
  }
});

test('all six travelers gain four visual tiers on arrival, with frame updates preserving their outfit and nodes',()=>{
  for(const variant of catalog.avatar) {
    const eq={avatar:`avatar-${variant}`},svg=svgDOM(scene({percent:0},eq));
    const player=svg.querySelector('.citadel-route-traveler'),growth=svg.querySelector('.quest-player-growth');
    const tiers=svg.querySelectorAll('[data-avatar-tier]');
    assert.ok(growth);assert.equal(tiers.length,4);
    for(const percent of [24.99,25,49.99,50,74.99,75,99.99,100,144,75,0]) {
      const fresh=svgDOM(scene({percent},eq));updateProgress(svg,{percent});
      assert.equal(svg.querySelector('.citadel-route-traveler'),player);
      assert.equal(svg.querySelector('.quest-player-growth'),growth);
      assert.equal(growth.getAttribute('data-avatar-stage'),String(Math.min(4,Math.floor(percent/25))));
      svg.querySelectorAll('[data-avatar-tier]').forEach((el,i)=>{assert.equal(el,tiers[i]);assert.deepEqual(el.attrs,fresh.querySelectorAll('[data-avatar-tier]')[i].attrs);});
      assert.equal(player.getAttribute('data-citadel-equipment'),eq.avatar);
    }
  }
});
