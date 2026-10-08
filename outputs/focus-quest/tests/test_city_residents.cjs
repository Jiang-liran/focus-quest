'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const residents=require('../static/city-residents.js');
const js=fs.readFileSync(path.join(__dirname,'../static/city-residents.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../static/city-residents.css'),'utf8');

test('six usable buildings each have a named resident and a matching room action',()=>{
  const rooms=['library','tea','observatory','atelier','arcade','station'];
  const people=rooms.map(room=>residents.find(residents.roomResident(room)));
  assert.equal(new Set(people.map(p=>p.id)).size,6);
  people.forEach((person,index)=>{
    assert.equal(person.place,rooms[index]);assert.ok(person.name&&person.role&&person.actionLabel);
    assert.ok(person.lines.length>=3);assert.equal(new Set(person.lines).size,person.lines.length);
    assert.ok(Object.isFrozen(person));assert.ok(Object.isFrozen(person.lines));
  });
  assert.equal(residents.roomResident('observatory','home'),'wangshu');
  assert.equal(residents.roomResident('observatory','rain'),'wangshu');
  assert.equal(residents.roomResident('observatory','panorama'),null);
  assert.equal(residents.find('qideng').name,'栖灯');
});

test('all residents have independent anatomical joints and accessible interaction targets',()=>{
  for(const person of residents.residents){
    for(const street of [false,true]){
      const svg=residents.character(person.id,{street});
      assert.match(svg,new RegExp(`data-city-npc="${person.id}"`));
      assert.match(svg,new RegExp(`data-street="${street}"`));
      assert.match(svg,/role="button" tabindex="0" aria-label="与/);
      for(const joint of ['heading','motion','body','torso','head','face','eyes','leg-left','leg-right','arm-left','arm-right'])assert.equal((svg.match(new RegExp(`class="city-npc-${joint}"`,'g'))||[]).length,1,person.id+': '+joint);
      assert.match(svg,/x="-38" y="-125" width="80" height="135"/);
      assert.match(svg,/fill="none" stroke="none"/,'avoid inherited global icon outlines on faces');
      assert.doesNotMatch(svg,/<(?:script|foreignObject|use|image)\b|\bon\w+=|\b(?:href|id)=/);
      assert.doesNotMatch(svg,/\bd="[^"]*(?:--|NaN|undefined)/,'signed mirrored joints produce valid path numbers');
      assert.equal((svg.match(/<g\b/g)||[]).length,(svg.match(/<\/g>/g)||[]).length);
    }
  }
});

test('portraits and decorative previews do not duplicate keyboard actions or navigation state',()=>{
  for(const person of residents.residents){
    const portrait=residents.portrait(person.id);
    assert.match(portrait,/viewBox="-48 -128 96 140"/);
    assert.match(portrait,/aria-hidden="true" focusable="false"/);
    assert.doesNotMatch(portrait,/tabindex=|role="button"|city-npc-hit|city-npc-hello/);
    assert.doesNotMatch(residents.character(person.id,{interactive:false}),/tabindex=|role="button"/);
  }
});

test('unsupported or hostile identifiers do not become markup and pure composition is deterministic',()=>{
  for(const id of [undefined,null,{},[],42,'constructor','__proto__','unknown','<script>','" onload="x']){
    assert.equal(residents.find(id),null);assert.equal(residents.roomResident(id),null);
    assert.equal(residents.character(id),'');assert.equal(residents.portrait(id),'');
  }
  assert.equal(residents.character('yanqing'),residents.character('yanqing'));
  assert.doesNotMatch(js,/setInterval|setTimeout|requestAnimationFrame|addEventListener|fetch\(|localStorage|Math\.random|document\./);
  const context={};vm.runInNewContext(js,context);assert.equal(context.FocusCityResidents.find('ayu').name,'阿榆');
});

test('workplaces show distinct quiet jobs while street silhouettes leave work tools indoors',()=>{
  for(const [id,job] of [['yanqing','book'],['ayu','teapot'],['wangshu','cup'],['lingxiang','sewing'],['ache','service'],['wenzhou','map']])assert.match(residents.character(id),new RegExp('city-npc-'+job));
  assert.doesNotMatch(residents.character('ayu',{street:true}),/city-npc-teapot|city-npc-steam/);
  assert.doesNotMatch(residents.character('yanqing',{street:true}),/city-npc-book/);
  assert.match(residents.character('qideng',{street:true}),/city-npc-lantern/);
  assert.match(residents.character('yanqing'),/fill="#6b978b"/,'mentor retains his existing green vest');
});

test('walking animates paired limbs without transforming the navigation root and respects all pause guards',()=>{
  for(const keyframe of ['step','weight','walk-body','arm-swing','pour','read','stitch','listen'])assert.ok(css.includes('@keyframes city-npc-'+keyframe));
  assert.match(css,/\.city-npc\[data-walking=true\] \.city-npc-leg-right\{animation-delay:calc\(var\(--city-npc-step\)\*-.5\)\}/);
  assert.doesNotMatch(css,/scaleX\(-1\)/,'changing direction must not mirror the whole person or flatten held objects');
  assert.match(css,/\.city-npc\[data-street=true\] \.city-npc-face\{transform:translateX\(calc\(var\(--city-npc-direction\)/,'a turn changes the gaze within the face');
  assert.doesNotMatch(css,/\.city-npc(?:\[[^\]]+\])*\{[^}]*\b(?:animation|transform):/);
  for(const guard of ['.city-npc[data-paused=true]','.citadel-view[data-paused=true]','[data-motion=false]','[data-interactive=false]','[hidden]','.no-motion','html.focus-runtime-hidden','prefers-reduced-motion:reduce'])assert.ok(css.includes(guard),guard);
  assert.match(css,/\.city-npc-portrait \.city-npc \*\{animation:none!important\}/);
  assert.doesNotMatch(css,/filter\s*:|\b(?:width|height|left|top)\s*:/);
});

test('five evening visitors have distinct silhouettes, conversations and existing indoor destinations',()=>{
  const visitors=[['yuhe','atelier','flower-bag'],['aji','tea','baker-apron'],['nanzhi','station','post-bag'],['wanqiao','arcade','guitar-case'],['shuoyun','library','paint-tube']];
  const allLines=new Set();
  assert.equal(residents.residents.length,12);
  for(const [id,place,detail] of visitors){
    const person=residents.find(id);
    assert.equal(person.place,place);assert.ok(residents.roomResident(place));
    assert.equal(person.lines.length,4);assert.ok(person.actionLabel);
    for(const line of person.lines){assert.ok(!allLines.has(line),'visitors do not recycle conversation');allLines.add(line);}
    for(const street of [false,true]){
      const svg=residents.character(id,{street});
      assert.match(svg,new RegExp(`class="city-npc-${detail}"`));
      assert.doesNotMatch(svg,/city-npc-lantern|data-city-held-hands/,'slung objects do not silently become a shared hand-held lantern');
      assert.equal((svg.match(/data-city-free-hand=/g)||[]).length,2,'both articulated arms remain free while walking');
    }
  }
});

test('a working pose replaces the free hands instead of drawing duplicate hands beside its prop',()=>{
  for(const person of residents.residents)for(const street of [false,true]){
    const svg=residents.character(person.id,{street});
    const held=Number(svg.match(/data-city-held-hands="(\d+)"/)?.[1]||0);
    const free=(svg.match(/data-city-free-hand=/g)||[]).length;
    assert.equal(held+free,2,person.id+' '+(street?'street':'working'));
    assert.equal((svg.match(/class="city-npc-held-forearm"/g)||[]).length,held,'held wrists have connected sleeves');
    if(held)assert.match(svg,/class="city-npc-prop[^>]+data-city-held-hands="[12]"><g class="city-npc-held-forearm"/,'forearms move with the tool and grip');
  }
});
