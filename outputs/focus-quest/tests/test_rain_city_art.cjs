const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const art = require('../static/rain-city-art.js');
const ids = ['library','tea','observatory','atelier','arcade','station'];

test('rain city offers six always-open buildings plus one keyboard accessible return trail',()=>{
  const svg=art.scene({daily:{progress:0}},{});
  assert.match(svg,/viewBox="0 0 1200 720"/);
  assert.match(svg,/stroke="none" style="stroke:none"/);
  assert.equal((svg.match(/role="button" tabindex="0"/g)||[]).length,7);
  assert.equal((svg.match(/data-city-place=/g)||[]).length,6);
  for(const id of ids){
    assert.match(svg,new RegExp(`data-city-place="${id}" data-citadel-place="${id}" data-unlocked="true"`));
  }
  assert.match(svg,/rain-city-skyline/);
  assert.match(svg,/rain-city-reflections/);
  assert.match(svg,/rain-city-rain-layer/);
  assert.doesNotMatch(svg,/data-unlocked="false"|每日进度|citadel-construction|floating-island/);
});

test('bridge-foot waypost is a distinct return route and cannot steal preview focus',()=>{
  const svg=art.scene({}, {}, {interactive:true});
  assert.equal((svg.match(/data-city-trail="open"/g)||[]).length,1);
  assert.match(svg,/data-city-trail="open" role="button" tabindex="0" aria-label="沿归途小径返回篝火营地" aria-controls="return-trail-view"/);
  assert.match(svg,/七处风景 · 回篝火营地/);
  assert.match(svg,/rain-city-trail-lantern/);
  const preview=art.scene({}, {}, {interactive:false});
  assert.match(preview,/rain-city-trail-exit/);
  assert.doesNotMatch(preview,/data-city-trail=|rain-city-trail-interactive|rain-city-trail-hit|role="button"|tabindex=/);
  for(const place of ids)assert.doesNotMatch(art.interior(place),/data-city-trail=|rain-city-trail-exit/);
});

test('return trail hit area stays on the bridge foot without covering buildings or purchased slots',()=>{
  const svg=art.scene({}, {companion:'companion-dragon',relic:'relic-orrery',portal:'portal-cosmos'});
  const rect=svg.match(/class="rain-city-trail-hit" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  assert.ok(rect);
  const [x,y,w,h]=rect.slice(1).map(Number);
  const intersects=(left,top,width,height)=>x<left+width&&x+w>left&&y<top+height&&y+h>top;
  assert.ok(x>=500&&x+w<=766&&y>=625&&y+h<=720,'waypost remains on the near bridge approach');
  const buildings=[...svg.matchAll(/data-city-place="([^"]+)"[^>]*transform="translate\(([-\d.]+) ([-\d.]+)\)"[^>]*>[\s\S]*?<rect class="rain-city-hit" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)];
  assert.equal(buildings.length,6);
  for(const [,id,tx,ty,bx,by,bw,bh] of buildings)assert.ok(!intersects(Number(tx)+Number(bx),Number(ty)+Number(by),Number(bw),Number(bh)),id);
  const cosmetics=[...svg.matchAll(/class="rain-city-equipment rain-city-equipment-([^" ]+)"[^>]*transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)"/g)];
  assert.equal(cosmetics.length,3);
  for(const [,slot,left,top,scale] of cosmetics)assert.ok(!intersects(Number(left),Number(top),150*Number(scale),110*Number(scale)),slot);
});

test('room renderer provides actual room scenery and bounded visual modes',()=>{
  for(const id of ids){
    const svg=art.interior(id,{},{});
    assert.match(svg,new RegExp(`data-city-room="${id}"`));
    assert.match(svg,/viewBox="0 0 1200 720"/);
    assert.match(svg,/role="img" aria-label=/);
    assert.doesNotMatch(svg,/role="button"|tabindex=/);
    if(id!=='observatory')assert.match(svg,/rain-city-room-window/);
  }
  const roof=art.interior('observatory',{},{},{mode:'stars'});
  assert.match(roof,/data-city-mode="stars"/);
  assert.doesNotMatch(roof,/rain-city-rain-layer/);
  assert.match(art.interior('tea',{},{},{mode:'lamplight'}),/rain-city-steam/);
  assert.equal(art.interior('unknown'), '');
  assert.equal(art.normalize({}, {mode:'<script>'}).mode,'rain');
});

test('equipped cosmetics remain visible, defaults do not grant purchased decorations',()=>{
  const items={theme:'theme-forest',fx:'fx-snow',avatar:'avatar-royal',companion:'companion-fox',relic:'relic-hourglass',portal:'portal-moon'};
  const svg=art.scene({},items);
  for(const item of Object.values(items))assert.ok(svg.includes(item),item);
  const def=art.scene({},{});
  assert.doesNotMatch(def,/rain-city-equipment-(?:companion|relic|portal)/);
  for(const slot of ['avatar','companion','relic','portal'])assert.match(svg,new RegExp(`data-skin-slots="${slot}"`));
  for(const theme of ['default','forest','ocean','sakura','aurora'])assert.match(art.scene({},{theme:`theme-${theme}`}),new RegExp(`data-city-theme="theme-${theme}"`));
  const malicious=art.scene({},{avatar:'"><script>',portal:'portal-unknown',theme:null});
  assert.doesNotMatch(malicious,/<script>|portal-unknown/);
});

test('compact previews have bounded cost and no interaction; full previews do not steal focus',()=>{
  const small=art.thumbnail({theme:'theme-ocean'});
  assert.ok(small.length<2500);
  assert.equal((small.match(/<path/g)||[]).length<=10,true);
  assert.doesNotMatch(small,/role="button"|tabindex=|rain-city-rain-layer/);
  assert.equal(art.scene({}, {}, {compact:true}),art.thumbnail({}));
  const svg=art.scene({}, {}, {interactive:false});
  assert.match(svg,/data-interactive="false"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(svg,/role="button"|tabindex=|rain-city-hit/);
});

test('gradients and window clips do not collide across simultaneously rendered previews',()=>{
  const markup=art.scene()+art.scene({}, {theme:'theme-ocean'})+art.interior('tea')+art.interior('tea');
  const definitions=[...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(definitions.length,new Set(definitions).size);
  const refs=[...markup.matchAll(/url\(#([^)]+)\)/g)].map(m=>m[1]);
  for(const ref of refs)assert.ok(definitions.includes(ref),ref);
});

test('animation is CSS only, honors inactive rooms, hidden app, and reduced motion',()=>{
  const js=fs.readFileSync(require.resolve('../static/rain-city-art.js'),'utf8');
  const css=fs.readFileSync(require.resolve('../static/rain-city-art.css'),'utf8');
  assert.doesNotMatch(js,/requestAnimationFrame|setInterval|setTimeout|addEventListener/);
  for(const pattern of [/data-motion=false/,/data-paused=true/,/#city-street\[hidden\]/,/#city-room\[hidden\]/,/prefers-reduced-motion:reduce/])assert.match(css,pattern);
  assert.match(css,/\.rain-city-art\{pointer-events:auto\}/);
  assert.doesNotMatch(css,/\.rain-city-equipped-fx\s*\{[^}]*opacity\s*:\s*\.7\b/);
  assert.match(css,/\.rain-city-equipped-fx\s*,\s*\.rain-city-art \.rain-city-equipped-fx \*\s*\{pointer-events:none\}/);
});

test('shared city effects render exactly one noninteractive layer in street and every room',()=>{
  const effects=require('../static/island-effects.js');
  const paid=effects.ids.filter(id=>id!=='fx-default');
  assert.equal(paid.length,19);
  for(const id of paid){
    const street=art.scene({}, {fx:id});
    assert.match(street,new RegExp(`data-fx-scene="${id}"[^>]*data-fx-mode="city"`));
    assert.equal((street.match(/class="rain-city-equipped-fx"/g)||[]).length,1,id);
    assert.match(street,new RegExp(`data-skin-slots="fx" data-citadel-equipment="${id}" pointer-events="none"`));
    assert.doesNotMatch(street,/expansion-particle/);
    assert.equal((street.match(/data-city-place=/g)||[]).length,6);
    assert.equal((street.match(/role="button" tabindex="0"/g)||[]).length,7);
    const position=street.indexOf('class="rain-city-equipped-fx"');
    assert.ok(position>street.lastIndexOf('class="rain-city-place'),id);
    assert.ok(position<street.indexOf('class="rain-city-rain"'),id);
    for(const place of ids){
      const room=art.interior(place,{}, {fx:id});
      assert.equal((room.match(/class="rain-city-equipped-fx"/g)||[]).length,1,`${place}: ${id}`);
      assert.match(room,new RegExp(`data-fx-scene="${id}"`));
    }
    for(const mode of ['rain','stars','panorama'])assert.match(art.interior('observatory',{}, {fx:id},{mode}),new RegExp(`data-fx-scene="${id}"`));
  }
  assert.doesNotMatch(art.scene({}, {fx:'fx-default'}),/rain-city-equipped-fx|data-fx-scene/);
  for(const place of ids)assert.doesNotMatch(art.interior(place),/rain-city-equipped-fx|data-fx-scene/);
});

test('browser helper takes precedence while missing helpers retain a single legacy fallback',()=>{
  const source=fs.readFileSync(require.resolve('../static/rain-city-art.js'),'utf8'),expansion=require('../static/shop-expansion.js');
  const calls=[],context=vm.createContext({FocusShopExpansion:expansion,FocusIslandEffects:{has:id=>id==='fx-snow',scene(id,mode,options){calls.push([id,mode,JSON.parse(JSON.stringify(options))]);return '<g data-shared-fx-test="snow"></g>';}}});
  vm.runInContext(source,context);
  const fresh=context.FocusRainCityArt.scene({}, {fx:'fx-snow'});
  assert.deepEqual(calls,[['fx-snow','city',{environment:'street'}]]);
  assert.equal((fresh.match(/data-shared-fx-test=/g)||[]).length,1);
  assert.equal((fresh.match(/class="rain-city-equipped-fx"/g)||[]).length,1);
  assert.doesNotMatch(context.FocusRainCityArt.scene(),/rain-city-equipped-fx/);
  assert.equal(calls.length,1,'default never invokes the paid renderer');
  const legacy=vm.createContext({FocusShopExpansion:expansion});vm.runInContext(source,legacy);
  for(const id of ['fx-fireflies','fx-dewdrops']){
    const fallback=legacy.FocusRainCityArt.scene({}, {fx:id});
    assert.equal((fallback.match(/class="rain-city-equipped-fx"/g)||[]).length,1,id);
    assert.ok(fallback.includes(id));assert.doesNotMatch(fallback,/data-shared-fx-test|data-fx-scene/);
  }
});

test('interior weather belongs behind the existing glass while outdoor rooms keep full scene contexts',()=>{
  const source=fs.readFileSync(require.resolve('../static/rain-city-art.js'),'utf8');
  const calls=[],context=vm.createContext({FocusIslandEffects:{has:id=>id==='fx-snow',scene(id,mode,options){calls.push(JSON.parse(JSON.stringify({id,mode,options})));return '<g data-fx-context-test="weather"/>';}}});
  vm.runInContext(source,context);
  const api=context.FocusRainCityArt,expected={library:[445,109,550,291],tea:[164,115,583,303],atelier:[562,110,466,284],arcade:[158,123,273,222],station:[194,123,540,281],observatory:[605,111,389,308]};
  const equipment={fx:'fx-snow',avatar:'avatar-voyager',companion:'companion-fox'};
  for(const [place,region] of Object.entries(expected)){
    calls.length=0;
    const svg=api.interior(place,{},equipment,{interactive:true});
    assert.deepEqual(calls,[{id:'fx-snow',mode:'city',options:{environment:'interior',region}}],place);
    assert.equal((svg.match(/data-fx-context-test=/g)||[]).length,1,place);
    const weatherAt=svg.indexOf('data-fx-context-test='),glassAt=svg.indexOf('clip-path="url('),furnitureAt=svg.indexOf('rain-city-traveler');
    assert.ok(glassAt>=0&&glassAt<weatherAt&&weatherAt<furnitureAt,`${place}: outdoor weather stays behind glass and furniture`);
    assert.match(svg,/<g data-fx-context-test="weather"\/><\/g><\/g><path d="M/,'the weather shares the actual clipped sky group, before the opaque window frame');
  }
  for(const [mode,environment] of [['rain','rooftop'],['stars','rooftop'],['lamplight','rooftop'],['panorama','panorama']]){
    calls.length=0;
    api.interior('observatory',{},equipment,{mode});
    assert.deepEqual(calls,[{id:'fx-snow',mode:'city',options:{environment}}],mode);
  }
  calls.length=0;
  api.scene({},equipment);
  assert.deepEqual(calls,[{id:'fx-snow',mode:'city',options:{environment:'street'}}]);
});

test('high-floor home replaces the street observatory without changing the place identity',()=>{
  const place=art.places.find(p=>p.id==='observatory');
  assert.equal(place.name,'我的家');
  const street=art.scene();
  assert.match(street,/rain-city-home-building/);
  assert.match(street,/aria-label="进入我的家"/);
  const home=art.interior('observatory');
  assert.match(home,/data-city-mode="home"/);
  assert.match(home,/rain-city-room-window/);
  assert.match(home,/rain-city-home-warmth/);
  assert.doesNotMatch(home,/role="button"|tabindex=/);
});

test('home window and roof door are distinct keyboard reachable scene actions',()=>{
  const home=art.interior('observatory',{},{},{mode:'home',interactive:true});
  assert.match(home,/role="group" aria-label="我的高层公寓/);
  for(const id of ['window','rooftop'])assert.match(home,new RegExp(`data-home-action="${id}" role="button" tabindex="0" aria-label=`));
  assert.equal((home.match(/data-home-action=/g)||[]).length,2);
  assert.doesNotMatch(home,/aria-hidden="true"/);
  assert.doesNotMatch(art.interior('observatory',{},{},{mode:'home',interactive:false}),/data-home-action=|role="button"|tabindex=/);
});

test('window reveals a distinct full city panorama while both former rooftop modes survive',()=>{
  const panorama=art.interior('observatory',{},{},{mode:'panorama',interactive:true});
  assert.match(panorama,/data-city-mode="panorama"/);
  assert.match(panorama,/高层窗边俯瞰整座雨夜城市/);
  assert.ok((panorama.match(/rain-city-panorama-building/g)||[]).length>=20);
  assert.match(panorama,/rain-city-rain-layer/);
  assert.match(panorama,/rain-city-reflections/);
  assert.doesNotMatch(panorama,/rain-city-room-window|data-home-action=/);
  for(const mode of ['rain','stars']){
    const rooftop=art.interior('observatory',{},{},{mode});
    assert.match(rooftop,new RegExp(`data-city-mode="${mode}"`));
    assert.match(rooftop,/屋顶天台，灯火之上/);
    assert.doesNotMatch(rooftop,/rain-city-home-warmth|rain-city-panorama-building/);
  }
});

test('home and panorama keep valid noncolliding gradients and purchased scenery',()=>{
  const equipment={avatar:'avatar-voyager',companion:'companion-fox',relic:'relic-lotus',fx:'fx-fireflies'};
  const home=art.interior('observatory',{},equipment,{mode:'home'});
  for(const value of Object.values(equipment))assert.ok(home.includes(value),value);
  const markup=home+art.interior('observatory',{},equipment,{mode:'panorama'})+art.interior('observatory',{},equipment,{mode:'home'});
  const definitions=[...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(definitions.length,new Set(definitions).size);
  for(const [,id] of markup.matchAll(/url\(#([^)]+)\)/g))assert.ok(definitions.includes(id),id);
});

test('arcade scenery has exactly two different accessible ticket lottery cabinets',()=>{
  const svg=art.interior('arcade',{},{},{interactive:true});assert.match(svg,/role="group" aria-label="星海游乐场的室内/);
  assert.equal((svg.match(/data-lottery-machine=/g)||[]).length,2);assert.equal((svg.match(/role="button" tabindex="0"/g)||[]).length,2);
  for(const [kind,label] of [['coin','金币'],['diamond','钻石']]){
    assert.match(svg,new RegExp(`data-lottery-machine="${kind}" role="button" tabindex="0" aria-label="进入${label}抽奖机" aria-controls="city-lottery-pane"`));assert.match(svg,new RegExp(`只收${label}抽奖券`));
  }
  assert.equal((svg.match(/class="rain-city-machine-hit"/g)||[]).length,2);assert.equal((svg.match(/class="rain-city-machine-focus"/g)||[]).length,2);
  assert.equal((svg.match(/class="rain-city-machine-body"/g)||[]).length,2);assert.doesNotMatch(svg,/data-lottery-machine="(?:third|game)"/);
});

test('cabinet hit regions stay separate, inside the scene, and on the right of the lobby text',()=>{
  const svg=art.interior('arcade',{},{},{interactive:true});
  const machines=[...svg.matchAll(/data-lottery-machine="(coin|diamond)"[^>]*transform="translate\(([\d.]+) ([\d.]+)\)"[^>]*>[\s\S]*?<rect class="rain-city-machine-hit" x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)];assert.equal(machines.length,2);
  const boxes=machines.map(([,kind,tx,ty,x,y,w,h])=>({kind,left:Number(tx)+Number(x),top:Number(ty)+Number(y),width:Number(w),height:Number(h)}));
  for(const box of boxes){assert.ok(box.left>=500,`${box.kind} remains clear of the left lobby panel`);assert.ok(box.left+box.width<=1200);assert.ok(box.top>=0&&box.top+box.height<=720);}
  assert.ok(boxes[0].left+boxes[0].width<boxes[1].left||boxes[1].left+boxes[1].width<boxes[0].left,'each cabinet has its own exclusive hit area');
});

test('passive arcade previews retain both cabinet models without click targets or keyboard buttons',()=>{
  for(const options of [{},{interactive:false}]){
    const svg=art.interior('arcade',{},{},options);assert.equal((svg.match(/class="rain-city-machine-body"/g)||[]).length,2);assert.match(svg,/金币抽奖机/);assert.match(svg,/钻石抽奖机/);assert.match(svg,/role="img"/);
    assert.doesNotMatch(svg,/data-lottery-machine=|role="button"|tabindex=|rain-city-machine-hit|rain-city-machine-focus|rain-city-machine-hint/);
  }
  assert.doesNotMatch(art.thumbnail({}),/data-lottery-machine=|role="button"|tabindex=/);
});

test('both cabinet glass and halo gradients remain unique across interactive and passive previews',()=>{
  const markup=art.interior('arcade',{},{},{interactive:true})+art.interior('arcade',{},{},{interactive:false});const definitions=[...markup.matchAll(/\bid="([^"]+)"/g)].map(row=>row[1]);assert.equal(definitions.length,new Set(definitions).size);
  assert.equal(definitions.filter(id=>/-coin-(glass|halo)$/.test(id)).length,4);assert.equal(definitions.filter(id=>/-diamond-(glass|halo)$/.test(id)).length,4);
  for(const [,id] of markup.matchAll(/url\(#([^)]+)\)/g))assert.ok(definitions.includes(id),id);
});

test('new landscape themes add actual city-edge scenery while retaining every building and return route',()=>{
  const expansion=require('../static/shop-expansion.js');
  const themes=expansion.entries.filter(row=>row.slot==='theme'&&expansion.themeCityScene?.(row.id));
  assert.equal(themes.length,18);
  const geometry=svg=>svg.replace(/\s(?:class|fill|stroke|opacity|data-[\w-]+)="[^"]*"/g,'');
  const unique=new Set();
  for(const theme of themes){
    const layer=expansion.themeCityScene(theme.id);unique.add(geometry(layer));
    const actual=art.scene({}, {theme:theme.id});
    assert.ok(actual.includes(layer),theme.id);
    assert.ok(actual.indexOf(layer)<actual.indexOf('class="rain-city-place'),theme.id);
    assert.equal((actual.match(/data-city-place=/g)||[]).length,6);
    assert.equal((actual.match(/data-city-trail="open"/g)||[]).length,1);
    assert.equal((actual.match(/role="button" tabindex="0"/g)||[]).length,7);
    assert.doesNotMatch(layer,/role=|tabindex=|NaN|undefined|<script/);
  }
  assert.equal(unique.size,themes.length);
});
