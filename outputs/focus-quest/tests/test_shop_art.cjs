const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {preview, apply} = require('../static/shop-art.js');
const {avatar} = require('../static/quest-art.js');
const {islandDecoration, islandPreview} = require('../static/shop-art.js');

test('homepage layouts have empty default and share exact decoration geometry between live mount and preview', () => {
  const h=harness();
  h.api.apply({});
  assert.equal(islandDecoration('island-default'),'');
  assert.equal(h.nodes.get('equipped-island').raw,'');
  for(const id of ['island-lanterns','island-garden','island-pavilion','island-supplies','island-banners','island-fountain','island-library','island-observatory','island-arcade','island-palace']){
    const drawing=islandDecoration(id);
    assert.ok(drawing.length>100);
    assert.ok(preview(id).includes(drawing));
    assert.ok(islandPreview(id,{companion:'companion-fox',theme:'theme-ocean'}).includes(drawing));
    const scene=islandPreview(id);
    assert.ok(scene.indexOf('M166 218')<scene.indexOf('class="island-decoration"'));
    h.api.apply({island:id,companion:'companion-fox'});
    assert.equal(h.nodes.get('equipped-island').raw,drawing);
    assert.equal(h.nodes.get('equipped-island').getAttribute('data-skin-slots'),'island');
    assert.equal(h.document.documentElement.dataset.companion,'companion-fox');
  }
  h.api.apply({island:'island-default',companion:'companion-fox'});
  assert.equal(h.nodes.get('equipped-island').raw,'');
  assert.notEqual(h.nodes.get('equipped-companion').raw,'');
});

test('homepage decor is a separate layer after the original path and before its shrine', () => {
  const html=fs.readFileSync(require.resolve('../static/index.html'),'utf8');
  const layer=html.indexOf('id="equipped-island"');
  assert.ok(layer>html.indexOf('id="journey-path"'));
  assert.ok(layer<html.indexOf('class="crystal-shrine"'));
  assert.match(html,/data-shop-filter="island"/);
  assert.match(html,/data-skin-open="[^"]*\bisland\b/);
  for(const value of [null,{},'island-<script>','island-missing','relic-lotus']){
    assert.equal(islandDecoration(value),'');assert.equal(islandPreview(value),'');
  }
  const equipment=Object.freeze({theme:'theme-ocean',avatar:'avatar-ranger',companion:'companion-fox',relic:'relic-lotus',portal:'portal-moon'});
  const before=JSON.stringify(equipment);
  assert.notEqual(islandPreview('island-garden',equipment),islandPreview('island-garden',{}));
  assert.equal(JSON.stringify(equipment),before);
});

const variants = {
  bar: ['default','mint','aurora','comet','tide','prism','koi','fox','whale','dragon'],
  fx: ['default','fireflies','petals','snow','meteor','nebula'],
  avatar: ['default','ranger','voyager','alchemist','star','royal'],
  banner: ['default','leaf','parchment','obsidian','celestial','sovereign'],
  theme: ['default','forest','ocean','sakura','aurora'],
  companion: ['default','fox','owl','whale','dragon'],
  relic: ['default','lotus','orrery','hourglass'],
  portal: ['default','moon','archive','cosmos'],
  island: ['default','lanterns','garden','pavilion','supplies','banners','fountain','library','observatory','arcade','palace'],
};
const defaults = Object.fromEntries([...Object.keys(variants),'archipelago','homeland','campusmath','campuscs','campuspolitics','campusenglish'].map(slot=>[slot,`${slot}-default`]));
const allIds = Object.entries(variants).flatMap(([slot,names])=>names.map(name=>`${slot}-${name}`));

function harness(preMounted = true, extras = {}) {
  const nodes = new Map();
  const document = {datasetWrites: 0, created: 0};
  class Node {
    constructor(tag, id = '') { this.tag = tag; this.id = id; this.className = ''; this.attributes = {}; this.children = []; this.writes = 0; this.attributeWrites = 0; this.raw = ''; }
    get innerHTML() { return this.raw.replace(/\/>/g, '></normalized-svg>'); }
    set innerHTML(value) { this.raw = value; this.writes++; }
    getAttribute(name) { return this.attributes[name] || null; }
    setAttribute(name, value) { this.attributes[name] = String(value); this.attributeWrites++; }
    appendChild(node) { this.children.push(node); nodes.set(node.id,node); return node; }
    insertBefore(node, before) { this.children.splice(before ? this.children.indexOf(before) : 0, 0, node); nodes.set(node.id,node); return node; }
    get firstChild() { return this.children[0] || null; }
  }
  const island = new Node('g','island'), scene = new Node('div','scene');
  const hatSelectors = ['#scene-traveler .traveler-hat','#scene-traveler .traveler-hat-shade','.opening-traveler .opening-hat'];
  const hats = hatSelectors.map((selector,index)=>{ const node=new Node('path',selector);node.setAttribute('d',`M${index} 1 2 3Z`);nodes.set(selector,node);return node; });
  if(preMounted){
    for(const id of ['equipped-companion','equipped-relic','equipped-portal','equipped-island','equipped-homeland'])island.appendChild(new Node('g',id));
    const backdrop = new Node('div','backdrop');backdrop.className='scene-theme-backdrop';scene.appendChild(backdrop);
  }
  document.documentElement={dataset:new Proxy({}, {set(target,key,value){document.datasetWrites++;target[key]=value;return true;}})};
  document.getElementById=id=>nodes.get(id)||null;
  document.querySelector=selector=>{
    if(selector==='.floating-island')return island;
    if(selector==='.quest-scene')return scene;
    if(selector==='.scene-theme-backdrop')return [...nodes.values()].find(node=>node.className==='scene-theme-backdrop')||null;
    return nodes.get(selector)||null;
  };
  document.createElement=tag=>{document.created++;return new Node(tag);};
  document.createElementNS=(namespace,tag)=>{assert.equal(namespace,'http://www.w3.org/2000/svg');document.created++;return new Node(tag);};
  const context=vm.createContext({document,FocusProgressBars:{...require('../static/progress-bars.js'),decorate(){}},...extras});
  vm.runInContext(fs.readFileSync(require.resolve('../static/quest-art.js'),'utf8'),context);
  for(const name of ['subject-island-styles','island-architecture','shop-art'])vm.runInContext(fs.readFileSync(require.resolve(`../static/${name}.js`),'utf8'),context);
  return {api:context.ShopArt,document,nodes,island,scene,hats};
}

test('all 57 homepage catalog items have self-contained, decorative previews without unsafe or duplicate-ID content', () => {
  assert.equal(allIds.length,57);
  const markup=allIds.map(preview);
  assert.equal(new Set(markup).size,57);
  allIds.forEach((id,index)=>{
    assert.match(markup[index],/^<svg class="shop-art-svg(?: [^"]*)?" viewBox="0 0 160 112"/);
    assert.ok(markup[index].includes(`data-art="${id}"`));
    assert.match(markup[index],/aria-hidden="true" focusable="false"/);
    if(id.startsWith('bar-')){
      assert.doesNotMatch(markup[index],/<script|<foreignObject|\bon\w+=|(?:href|src)=["'](?!#)|NaN|undefined/);
      const urls=[...markup[index].matchAll(/url\(([^)]+)\)/g)].map(match=>match[1]);
      assert.ok(urls.every(value=>/^#[A-Za-z0-9_-]+$/.test(value)),`nonlocal paint reference in ${id}`);
      const localIds=[...markup[index].matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
      assert.equal(new Set(localIds).size,localIds.length,`duplicate SVG definition in ${id}`);
      const refs=[...markup[index].matchAll(/url\(#([^)]*)\)|href="#([^"]+)"/g)].map(match=>match[1]||match[2]);
      assert.ok(refs.every(ref=>localIds.includes(ref)),`missing local SVG definition in ${id}`);
    }else assert.doesNotMatch(markup[index],/<script|<foreignObject|\bid=|\bon\w+=|href=|url\(|NaN|undefined/);
    assert.ok(markup[index].endsWith('</svg>'));
  });
  const ids=markup.flatMap(svg=>[...svg.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
  assert.equal(new Set(ids).size,ids.length,'catalog thumbnails must not share gradient/clip IDs');
});

test('all six player outfits remain distinct while retired NPC products no longer preview or apply', () => {
  const art=variants.avatar.map(name=>avatar('player',`avatar-${name}`));
  assert.equal(new Set(art).size,6);
  for(const markup of art)assert.match(markup,/<ellipse cx="32" cy="34.5" rx="11.5" ry="13" fill="#e4c7ad"/);
  for(const name of ['default','scholar','tea','copper','astral','phoenix'])assert.equal(preview(`npc-${name}`),'');
  const h=harness();
  h.document.documentElement.dataset.npc='npc-astral';
  assert.equal(h.api.apply({npc:'npc-astral'}).npc,undefined);
  assert.equal(h.document.documentElement.dataset.npc,undefined);
  assert.match(avatar('player','avatar-royal'),/M18 27 15 13/);
  assert.match(avatar('player','avatar-voyager'),/M10 25q10 1/);
});

test('untrusted IDs and cross-slot equipment cannot inject attributes, HTML or root dataset keys', () => {
  for(const bad of [null,undefined,{},[],'constructor','__proto__','companion-<script>','" onload="alert(1)'])assert.equal(preview(bad),'');
  const input=Object.freeze({bar:'companion-fox',fx:'fx-snow',theme:'theme-invalid',other:'" onload="alert(1)'});
  const normalized=apply(input);
  assert.equal(normalized.bar,'bar-default');
  assert.equal(normalized.fx,'fx-snow');
  assert.equal(normalized.theme,'theme-default');
  assert.equal(Object.keys(normalized).length,15);
  assert.equal(normalized.other,undefined);
  assert.deepEqual(apply(null),defaults);
});

test('all real scene additions mount once, survive normalized DOM polls, and update only their changed slot', () => {
  const h=harness();
  const equipped={...defaults,companion:'companion-fox',relic:'relic-lotus',portal:'portal-moon',theme:'theme-forest'};
  h.api.apply(equipped);
  const mounts=['equipped-companion','equipped-relic','equipped-portal','backdrop'].map(id=>h.nodes.get(id));
  assert.deepEqual(mounts.map(node=>node.writes),[1,1,1,1]);
  const rootWrites=h.document.datasetWrites;
  const transforms=mounts.slice(0,3).map(node=>node.getAttribute('transform'));
  assert.deepEqual(mounts.map(node=>node.getAttribute('data-skin-slots')),['companion','relic','portal','theme']);
  assert.match(h.nodes.get('equipped-relic').raw,/class="shop-relic-core"/);
  h.api.apply({...equipped});h.api.apply({...equipped});
  assert.deepEqual(mounts.map(node=>node.writes),[1,1,1,1]);
  assert.equal(h.document.datasetWrites,rootWrites);
  h.api.apply({...equipped,companion:'companion-dragon'});
  assert.deepEqual(mounts.map(node=>node.writes),[2,1,1,1]);
  assert.deepEqual(mounts.slice(0,3).map(node=>node.getAttribute('transform')),transforms);
  assert.equal(h.document.created,0);
});

test('all paid island effects use the same persistent homepage mount and keep their phase across polls and other equipment changes', () => {
  const effects=require('../static/island-effects.js'),expansion=require('../static/shop-expansion.js');
  const h=harness(true,{FocusIslandEffects:effects,FocusShopExpansion:expansion});
  const ids=[...variants.fx.slice(1).map(name=>`fx-${name}`),...expansion.entries.filter(item=>item.slot==='fx').map(item=>item.id)];
  let original;
  for(const id of ids){
    h.api.apply({...defaults,fx:id,companion:'companion-fox',island:'island-garden'});
    const mount=h.nodes.get('equipped-extra-fx');original=original||mount;
    assert.equal(mount,original,id);
    assert.equal(mount.getAttribute('data-fx-renderer'),effects.has(id)?'island':'legacy');
    assert.equal(mount.getAttribute('data-skin-slots'),'fx');
    assert.notEqual(mount.raw,'',id);
    const writes=mount.writes;
    for(let poll=0;poll<12;poll++)h.api.apply({...defaults,fx:id,companion:'companion-fox',island:'island-garden'});
    h.api.apply({...defaults,fx:id,companion:'companion-owl',island:'island-library',theme:'theme-ocean'});
    assert.equal(mount.writes,writes,`${id} was restarted by an unrelated update`);
  }
  h.api.apply({...defaults,fx:'relic-lotus'});
  assert.equal(h.document.documentElement.dataset.fx,'fx-default');
  assert.equal(original.raw,'');
  assert.equal(h.document.created,1);
});

test('bright terrain effects borrow the live island clock across equipment polls, pause and reduced-motion recovery',()=>{
  const h=harness(true,{FocusIslandEffects:require('../static/island-effects.js'),FocusShopExpansion:require('../static/shop-expansion.js')});
  const equipment={...defaults,fx:'fx-dewdrops'};
  h.api.apply(equipment); // Browsers without getAnimations also remain supported.
  const mount=h.nodes.get('equipped-extra-fx'),timeline={},writes={start:0,time:0};
  let source={animationName:'float',playState:'running',startTime:1000,currentTime:4550,playbackRate:1,timeline};
  let target,available=true,targetStart=3000,targetTime=2550;
  function targetAnimation(){
    return {animationName:'float',playState:'running',playbackRate:1,timeline,
      get startTime(){return targetStart;},set startTime(value){writes.start++;targetStart=value;targetTime=source.currentTime+source.startTime-value;},
      get currentTime(){return targetTime;},set currentTime(value){writes.time++;targetTime=value;}};
  }
  target=targetAnimation();
  h.island.getAnimations=()=>available?[source]:[];
  const terrain={getAnimations:()=>available?[target]:[]};
  mount.querySelector=selector=>selector==='.fx-terrain'&&mount.raw.includes('class="fx-terrain"')?terrain:null;
  const markupWrites=mount.writes;
  h.api.apply(equipment);
  assert.equal(target.startTime,source.startTime);
  assert.equal(target.currentTime,source.currentTime);
  assert.deepEqual(writes,{start:1,time:0});
  for(let poll=0;poll<12;poll++)h.api.apply({...equipment,island:'island-garden',companion:'companion-fox'});
  assert.deepEqual(writes,{start:1,time:0},'aligned clocks are not repeatedly rewritten');
  assert.equal(mount.writes,markupWrites,'timing corrections preserve the equipped artwork');
  source.playState=target.playState='paused';source.startTime=targetStart=null;source.currentTime=6300;targetTime=2800;
  h.api.apply(equipment);
  assert.equal(target.currentTime,6300,'the frozen island phase remains the authority');
  h.api.apply(equipment);
  assert.deepEqual(writes,{start:1,time:1});
  source.playState=target.playState='running';source.startTime=2222;source.currentTime=7000;targetStart=3344;targetTime=5878;
  h.api.apply(equipment);
  assert.equal(target.currentTime,7000,'background resume reuses the island clock');
  available=false;h.api.apply(equipment);assert.deepEqual(writes,{start:2,time:1});
  source={...source,startTime:10000,currentTime:3300};targetStart=12500;targetTime=800;target=targetAnimation();available=true;
  h.api.apply(equipment);
  assert.equal(target.currentTime,3300,'new animations after reduced motion are synchronized');
  assert.deepEqual(writes,{start:3,time:1});
  targetStart=null;targetTime=0;
  h.api.apply(equipment);
  assert.equal(target.currentTime,3300,'a newly pending CSS animation also starts at the current island phase');
  targetStart=source.startTime;h.api.apply(equipment);
  assert.deepEqual(writes,{start:3,time:2});
  assert.equal(mount.writes,markupWrites);
  h.api.apply({...equipment,fx:'fx-petals'});
  assert.deepEqual(writes,{start:3,time:2},'free-flying weather does not inherit island motion');
});

test('switching back to defaults removes additions and restores every root category', () => {
  const h=harness();
  h.api.apply({companion:'companion-whale',relic:'relic-orrery',portal:'portal-cosmos',theme:'theme-aurora',banner:'banner-sovereign'});
  h.api.apply(defaults);
  for(const id of ['equipped-companion','equipped-relic','equipped-portal','backdrop'])assert.equal(h.nodes.get(id).raw,'');
  assert.deepEqual({...h.document.documentElement.dataset},defaults);
  const writes=[...h.nodes.values()].reduce((sum,node)=>sum+node.writes,0);
  h.api.apply(defaults);
  assert.equal([...h.nodes.values()].reduce((sum,node)=>sum+node.writes,0),writes);
});

test('royal crown, voyager cap and ranger hood change both travelers and restore original paths', () => {
  const h=harness();
  const original=h.hats.map(node=>node.getAttribute('d'));
  h.api.apply({...defaults,avatar:'avatar-royal'});
  const crown=h.hats.map(node=>node.getAttribute('d'));
  assert.ok(crown.every((shape,index)=>shape!==original[index]));
  const writes=h.hats.map(node=>node.attributeWrites);
  h.api.apply({...defaults,avatar:'avatar-royal'});
  assert.deepEqual(h.hats.map(node=>node.attributeWrites),writes);
  h.api.apply({...defaults,avatar:'avatar-voyager'});
  assert.ok(h.hats.every((node,index)=>node.getAttribute('d')!==crown[index]));
  h.api.apply({...defaults,avatar:'avatar-ranger'});
  assert.match(h.hats[0].getAttribute('d'),/q1-16 14-23/);
  h.api.apply(defaults);
  assert.deepEqual(h.hats.map(node=>node.getAttribute('d')),original);
});

test('missing mount containers are created safely once and previews never change the live scene', () => {
  const h=harness(false);
  h.api.apply({companion:'companion-owl',portal:'portal-archive',relic:'relic-hourglass',theme:'theme-ocean'});
  assert.equal(h.document.created,6);
  assert.equal(h.island.children.length,5);
  assert.equal(h.scene.children.length,1);
  for(const node of [...h.island.children,...h.scene.children])assert.equal(node.getAttribute('aria-hidden'),node.id==='equipped-companion'?'false':'true');
  const before=JSON.stringify({dataset:h.document.documentElement.dataset,html:[...h.nodes.values()].map(node=>node.raw)});
  allIds.forEach(id=>assert.ok(h.api.preview(id)));
  assert.equal(JSON.stringify({dataset:h.document.documentElement.dataset,html:[...h.nodes.values()].map(node=>node.raw)}),before);
  h.api.apply({companion:'companion-owl',portal:'portal-archive',relic:'relic-hourglass',theme:'theme-ocean'});
  assert.equal(h.document.created,6);
});

test('every new pet, relic, portal and environment yields a distinct mounted illustration', () => {
  const h=harness();
  for(const [slot,mount] of [['companion','equipped-companion'],['relic','equipped-relic'],['portal','equipped-portal'],['theme','backdrop']]){
    const art=[];
    for(const name of variants[slot]){h.api.apply({[slot]:`${slot}-${name}`});art.push(h.nodes.get(mount).raw);}
    assert.equal(new Set(art).size,variants[slot].length);
    assert.equal(art[0],'');
    assert.ok(art.slice(1).every(Boolean));
  }
});


test('all eleven island layouts are complete replacements with distinct visible art, and preserve other mounts', () => {
  const h=harness();
  const equipment={avatar:'avatar-royal',theme:'theme-ocean',portal:'portal-cosmos',relic:'relic-hourglass',companion:'companion-dragon'};
  h.api.apply(equipment);
  const stable=['equipped-portal','equipped-relic','equipped-companion'].map(id=>h.nodes.get(id));
  const prior=stable.map(node=>[node.raw,node.writes]);
  const drawings=[];
  for(const variant of variants.island) {
    const id=`island-${variant}`;
    h.api.apply({...equipment,island:id});
    const drawing=h.nodes.get('equipped-island').raw;
    drawings.push(drawing.replace(/data-island-decoration="[^"]*"/g,''));
    assert.equal(drawing,islandDecoration(id));
    assert.equal((drawing.match(/class="island-decoration"/g)||[]).length,variant==='default'?0:1);
    assert.deepEqual(stable.map(node=>[node.raw,node.writes]),prior);
  }
  assert.equal(new Set(drawings).size,11);
  assert.ok(drawings.slice(1).every(svg=>svg.length>500));
});

test('complete island previews use the same current-fire roadside camp as the live island, without a button', () => {
  const campArt=require('../static/camp-world-art.js');
  const equipment=Object.freeze({fire:'fire-blue',camp:'camp-lake',avatar:'avatar-ranger'});
  const camp=campArt.roadside(equipment);
  for(const variant of variants.island) {
    const markup=islandPreview(`island-${variant}`,equipment);
    assert.ok(markup.endsWith(`${camp}</g></svg>`));
    assert.equal((markup.match(/class="island-roadside-camp"/g)||[]).length,1);
    assert.doesNotMatch(markup,/role="button"|tabindex=|\bid=/);
  }
  assert.equal(islandDecoration('island-default'),'');
  assert.ok(!islandDecoration('island-palace').includes('island-roadside-camp'));
  const h=harness();
  const before=h.nodes.get('equipped-island').raw;
  assert.ok(h.api.islandPreview('island-default').includes('<svg'));
  assert.equal(h.nodes.get('equipped-island').raw,before);
});

// Compute conservative world-space bounds from SVG geometry, rather than trusting
// layout metadata. Quadratic extrema are exact; arc radii are conservatively bounded.
function decorationShapeBounds(markup) {
  const identity=[1,0,0,1,0,0];
  const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
  const numbers=value=>(value?.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)||[]).map(Number);
  function transform(value) {
    let result=identity;
    for(const [,kind,raw] of (value||'').matchAll(/(translate|scale|rotate)\(([^)]*)\)/g)) {
      const p=numbers(raw);let next=identity;
      if(kind==='translate')next=[1,0,0,1,p[0],p[1]||0];
      if(kind==='scale')next=[p[0],0,0,p[1]??p[0],0,0];
      if(kind==='rotate') {
        const angle=p[0]*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
        next=multiply(multiply([1,0,0,1,p[1]||0,p[2]||0],[c,s,-s,c,0,0]),[1,0,0,1,-(p[1]||0),-(p[2]||0)]);
      }
      result=multiply(result,next);
    }
    return result;
  }
  function pathPoints(d) {
    const tokens=d.match(/[a-z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)||[];
    const size={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7};
    const points=[];let i=0,command='',x=0,y=0,start=[0,0];
    while(i<tokens.length) {
      if(/^[a-z]$/i.test(tokens[i]))command=tokens[i++];
      const kind=command.toUpperCase(),relative=command!==kind;
      if(kind==='Z'){[x,y]=start;points.push([x,y]);command='';continue;}
      assert.ok(size[kind],`unexpected SVG command ${command}`);
      const p=tokens.slice(i,i+size[kind]).map(Number);i+=size[kind];
      assert.ok(p.every(Number.isFinite));
      const ox=relative?x:0,oy=relative?y:0;
      if(kind==='H'){x=p[0]+ox;points.push([x,y]);}
      else if(kind==='V'){y=p[0]+oy;points.push([x,y]);}
      else if(kind==='Q') {
        const cx=p[0]+ox,cy=p[1]+oy,nx=p[2]+ox,ny=p[3]+oy;
        points.push([x,y],[nx,ny]);
        for(const t of [(x-cx)/(x-2*cx+nx),(y-cy)/(y-2*cy+ny)]) if(t>0&&t<1) {
          points.push([(1-t)*(1-t)*x+2*(1-t)*t*cx+t*t*nx,(1-t)*(1-t)*y+2*(1-t)*t*cy+t*t*ny]);
        }
        x=nx;y=ny;
      }
      else if(kind==='A') {
        const nx=p[5]+ox,ny=p[6]+oy;
        points.push([x-p[0],y-p[1]],[x+p[0],y+p[1]],[nx-p[0],ny-p[1]],[nx+p[0],ny+p[1]]);x=nx;y=ny;
      } else {
        for(let k=0;k<p.length;k+=2)points.push([p[k]+ox,p[k+1]+oy]);
        x=p.at(-2)+ox;y=p.at(-1)+oy;
        if(kind==='M'){start=[x,y];command=relative?'l':'L';}
      }
    }
    return points;
  }
  const stack=[identity], bounds=[];
  for(const token of markup.match(/<[^>]+>/g)||[]) {
    if(token.startsWith('</g')){stack.pop();continue;}
    if(token.startsWith('</'))continue;
    const tag=token.match(/^<(\w+)/)?.[1];
    const attr=Object.fromEntries([...token.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
    const matrix=multiply(stack.at(-1),transform(attr.transform));
    if(tag==='g'){stack.push(matrix);continue;}
    let points=[];
    if(tag==='path')points=pathPoints(attr.d);
    else if(tag==='ellipse'||tag==='circle') {
      const x=Number(attr.cx||0),y=Number(attr.cy||0),rx=Number(attr.rx||attr.r),ry=Number(attr.ry||attr.r);
      points=[[x-rx,y-ry],[x-rx,y+ry],[x+rx,y-ry],[x+rx,y+ry]];
    } else if(tag==='rect') {
      const x=Number(attr.x||0),y=Number(attr.y||0),w=Number(attr.width),h=Number(attr.height);
      points=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]];
    }
    if(!points.length)continue;
    const transformed=points.map(([x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);
    const margin=Number(attr['stroke-width']||0)/2;
    bounds.push([Math.min(...transformed.map(p=>p[0]))-margin,Math.min(...transformed.map(p=>p[1]))-margin,Math.max(...transformed.map(p=>p[0]))+margin,Math.max(...transformed.map(p=>p[1]))+margin]);
  }
  return bounds;
}

test('every decorative shape stays out of the roadside camp pocket and original equipment mounts', () => {
  for(const variant of variants.island.slice(1)) {
    const geometry=decorationShapeBounds(islandDecoration(`island-${variant}`));
    assert.ok(geometry.length>10);
    for(const [x0,y0,x1,y1] of geometry) {
      const footprint=`${variant}: [${x0}, ${y0}, ${x1}, ${y1}]`;
      assert.ok(x1<303||x0>373||y1<205||y0>265,`overlaps roadside camp: ${footprint}`);
      const coast=x0>=160&&x1<=297&&y0>=200&&y1<=272;
      const rear=x0>=344&&x1<=454&&y0>=45&&y1<=188;
      assert.ok(coast||rear,`outside the two available decoration areas: ${footprint}`);
    }
  }
});


test('all ten bars delegate their thumbnail and actual decoration to the shared renderer',()=>{
  const ids=variants.bar.map(v=>'bar-'+v),calls={previews:[],applied:[]};let h;
  const shared={has:id=>ids.includes(id),preview(id){calls.previews.push(id);return `<svg data-shared-progress="${id}"></svg>`;},decorate(doc){assert.equal(doc,h.document);calls.applied.push(doc.documentElement.dataset.bar);}};
  h=harness(true,{FocusProgressBars:shared});
  for(const id of ids){assert.equal(h.api.preview(id),`<svg data-shared-progress="${id}"></svg>`);h.api.apply({bar:id});assert.equal(h.document.documentElement.dataset.bar,id);assert.equal(calls.applied.at(-1),id);}
  assert.deepEqual(calls.previews,ids);h.api.apply({bar:'bar-not-a-product'});assert.equal(calls.applied.at(-1),'bar-default');assert.equal(h.api.preview('bar-not-a-product'),'');
});


test('repeated previews of the same bar have locally resolved, noncolliding SVG IDs',()=>{
  const seen=new Set();for(let repeat=0;repeat<3;repeat++)for(const variant of variants.bar){
    const svg=preview('bar-'+variant),ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
    for(const id of ids){assert.ok(!seen.has(id),`repeated preview id ${id}`);seen.add(id);}
    for(const match of svg.matchAll(/url\(#([^)]*)\)/g))assert.ok(ids.includes(match[1]));
  }
});

test('new full outfits mount complete regalia on the real home traveler and preserve poll stability',()=>{
  const expansion=require('../static/shop-expansion.js');
  const outfits=expansion.entries.filter(row=>row.slot==='avatar'&&(row.lotteryOnly||expansion.fullOutfit?.(row.id)));
  assert.ok(outfits.length>=16);
  const h=harness(true,{FocusShopExpansion:expansion});
  const traveler=new h.island.constructor('g','#scene-traveler');h.nodes.set('#scene-traveler',traveler);
  for(const outfit of outfits){
    h.api.apply({...defaults,avatar:outfit.id});
    const regalia=h.nodes.get('equipped-player-regalia');
    assert.ok(regalia,outfit.id);assert.equal(regalia.raw,expansion.avatar(outfit.id,4).replace(/^<svg[^>]*>|<\/svg>$/g,''),outfit.id);
    assert.match(regalia.raw,/data-avatar-stage="4"/);
    for(let tier=1;tier<=4;tier++)assert.match(regalia.raw,new RegExp(`quest-avatar-tier-${tier}`));
    const writes=regalia.writes;h.api.apply({...defaults,avatar:outfit.id});assert.equal(regalia.writes,writes);
  }
  h.api.apply(defaults);assert.equal(h.nodes.get('equipped-player-regalia').raw,'');
});

test('all catalog generations share a bounded thumbnail stage without changing equipped scenes',()=>{
 const css=fs.readFileSync(require.resolve('../static/shop-art.css'),'utf8');
 assert.match(css,/#view-shop \.shop-catalog article\.shop-item \.shop-item-visual\{height:auto;aspect-ratio:7\/5/);
 assert.match(css,/\.shop-item-visual>\.cosmetic-swatch\{[^}]*padding:32px 16px 12px/);
 assert.match(css,/\.shop-item-visual>\.cosmetic-swatch>svg\{[^}]*min-height:0;[^}]*max-height:100%/);
 assert.ok(css.slice(css.indexOf('/* One display stage'),css.indexOf(':root:is([data-avatar="avatar-forestcrown"]')).split('\n').filter(row=>row.includes('{')).every(row=>row.startsWith('#view-shop .shop-catalog')));
});
