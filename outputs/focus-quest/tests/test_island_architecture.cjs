const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const art=require('../static/island-architecture.js');
const expedition=require('../static/expedition-art.js');
const subjects=['math','cs','politics','english'];
const suites=['harbor','starglass'];
const large=['island-starhaven','island-celestialpalace','island-lanternwharf','island-lunarobservatory','island-clockworkgarden','island-aethercitadel'];
const css=fs.readFileSync(require.resolve('../static/island-architecture.css'),'utf8');

test('slots expose complete independent inventories and a default that restores original art',()=>{
  for(const slot of ['archipelago','homeland']){
    assert.equal(art.inventory[slot].length,3);
    assert.ok(Object.isFrozen(art.inventory[slot]));
    for(const item of art.inventory[slot]){
      assert.equal(art.has(item.id),true);assert.equal(art.has(item.id,slot),true);
      assert.equal(art.has(item.id,slot==='homeland'?'archipelago':'homeland'),false);
      assert.ok(item.name);
    }
  }
  assert.equal(art.subject('archipelago-default','math'),'');
  assert.equal(art.main('homeland-default'),'');
  assert.equal(art.has(null),false);assert.equal(art.has('wrong','archipelago'),false);
});

test('eight suite buildings reconstruct daily with four independent crystal milestones',()=>{
  const results=[];
  for(const kind of suites)for(const id of subjects){
    const input={id,progress:0},before=JSON.stringify(input);
    const zero=art.subject(`archipelago-${kind}`,input);
    const done=art.subject(`archipelago-${kind}`,{id,progress:1});
    assert.match(zero,/island-campus-terrain/);assert.match(zero,/island-campus-buildings/);
    assert.match(zero,/--campus-light:0.25/);assert.match(done,/--campus-light:1/);
    assert.match(zero,/data-campus-stage="0"/);assert.match(done,/data-campus-stage="4"/);
    assert.doesNotMatch(zero,/class="campus-construction-solid"/);
    assert.match(done,/class="campus-construction-solid"/);assert.doesNotMatch(done,/class="campus-blueprint"/);
    assert.equal((zero.match(/data-node=/g)||[]).length,4);
    assert.equal((done.match(/data-charge="1"/g)||[]).length,4);
    assert.equal(JSON.stringify(input),before);
    assert.ok(art.subjectInfo(`archipelago-${kind}`,id)?.description);
    results.push(zero);
  }
  assert.equal(new Set(results).size,8);
  assert.match(results[0],/island-campus-orbit/);
  assert.match(results[1],/island-campus-wheel/);
  assert.match(results[3],/island-campus-boat/);
});

test('both main-island suites keep the original ground footprint and reserve equipment rendering for the host',()=>{
  for(const kind of suites){
    const normal=art.main(`homeland-${kind}`,{island:'island-pavilion'});
    assert.match(normal,/m100 207 116-87 130-15 135 79-76 67-138 25-100-37Z/);
    assert.match(normal,/data-campus-layout="academy"/);
    assert.match(normal,/homeland-campus-buildings/);
    assert.doesNotMatch(normal,/equipped-|homeland-preview-landmarks|<svg|<image|<script/);
    for(const island of large){
      const equipped={island,companion:'companion-owl',portal:'portal-moon'},before=JSON.stringify(equipped);
      const combined=art.main(`homeland-${kind}`,equipped);
      assert.match(combined,/data-campus-layout="collection-courtyard"/);
      assert.match(combined,/homeland-campus-courtyard/);
      assert.match(combined,/homeland-campus-terrain/);
      assert.notEqual(combined,normal,'large collections must receive their own cleared building footprint');
      assert.equal(JSON.stringify(equipped),before);
    }
  }
});

test('expedition selects each suite, exposes matching landmarks and restores the identical original architecture',()=>{
  const base={progress:0,subjects:subjects.map(id=>({id,progress:0,percent:0}))};
  const original=expedition.world(base);
  for(const kind of suites){
    const world=expedition.world({...base,equipped:{archipelago:`archipelago-${kind}`}});
    assert.equal((world.match(/data-campus-subject=/g)||[]).length,4);
    assert.equal((world.match(/data-skin-slots="campus[a-z]+ archipelago"/g)||[]).length,4);
    assert.doesNotMatch(world,/expedition-build-tier/);
    for(const id of subjects)assert.ok(world.includes(art.subjectInfo(`archipelago-${kind}`,id).name));
    assert.equal(world,expedition.world({...base,equipped:{archipelago:`archipelago-${kind}`,fx:'anything'}}));
  }
  assert.equal(original,expedition.world({...base,equipped:{archipelago:'archipelago-default'}}));
  assert.equal(original,expedition.world({...base,equipped:{archipelago:'homeland-harbor'}}));
});

test('all previews use the shared shop camera wrapper, details are complete and malformed inputs stay inert',()=>{
  for(const kind of suites)for(const slot of ['archipelago','homeland']){
    const id=`${slot}-${kind}`,preview=art.preview(id),detail=art.detail(id);
    assert.match(preview,/^<svg class="shop-art-svg" viewBox="0 0 160 112" aria-hidden="true" focusable="false"/);
    assert.match(preview,new RegExp(`data-art="${id}"`));
    assert.match(detail,/class="island-architecture-detail"/);
    if(slot==='homeland')assert.match(preview,/homeland-preview-landmarks/);
    else assert.equal((preview.match(/data-campus-subject=/g)||[]).length,4);
    assert.equal(preview,art.preview(id),'preview should not restart on polling because of generated IDs');
  }
  const bad='" onload="alert(1)<script>x</script>';
  assert.equal(art.subject(bad,{id:'math'}),'');assert.equal(art.subject('archipelago-harbor',{id:bad}),'');
  assert.equal(art.main(bad),'');assert.equal(art.preview(bad),'');assert.equal(art.detail(bad),'');
  for(const progress of [NaN,Infinity,-Infinity,{},'evil',null])assert.doesNotMatch(art.subject('archipelago-starglass',{id:'math',progress}),/NaN|Infinity|undefined|<script|\bon\w+=/);
});

test('browser and Node implementations produce the same deterministic art without timers or DOM access',()=>{
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../static/subject-island-styles.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(require.resolve('../static/island-architecture.js'),'utf8'),context);
  for(const kind of suites){
    assert.equal(context.FocusIslandArchitecture.main(`homeland-${kind}`),art.main(`homeland-${kind}`));
    for(const id of subjects)assert.equal(context.FocusIslandArchitecture.subject(`archipelago-${kind}`,{id,progress:.5}),art.subject(`archipelago-${kind}`,{id,progress:.5}));
  }
});

test('SVG fragments and all preview/detail combinations are valid XML with no duplicate IDs',()=>{
  const images=[];
  for(const kind of suites){
    for(const id of subjects)images.push(`<svg xmlns="http://www.w3.org/2000/svg">${art.subject(`archipelago-${kind}`,{id,progress:.4})}</svg>`);
    images.push(`<svg xmlns="http://www.w3.org/2000/svg">${art.main(`homeland-${kind}`)}</svg>`);
    images.push(`<svg xmlns="http://www.w3.org/2000/svg">${art.main(`homeland-${kind}`,{island:large[0]})}</svg>`);
    for(const slot of ['archipelago','homeland'])images.push(art.preview(`${slot}-${kind}`),art.detail(`${slot}-${kind}`));
    images.push(expedition.world({equipped:{archipelago:`archipelago-${kind}`}}));
  }
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'focus-campus-'));
  try{
    const file=path.join(dir,'art.json');fs.writeFileSync(file,JSON.stringify(images));
    const result=spawnSync('python3',['-c','import json,sys,xml.etree.ElementTree as E\nfor s in json.load(open(sys.argv[1])):\n r=E.fromstring(s)\n ids=[e.attrib["id"] for e in r.iter() if "id" in e.attrib]\n assert len(ids)==len(set(ids))\n assert not any(e.tag.endswith("script") for e in r.iter())\nprint("parsed",len(json.load(open(sys.argv[1]))))',file],{encoding:'utf8',timeout:10000});
    assert.equal(result.status,0,result.stderr||result.error?.message);assert.match(result.stdout,/parsed 22/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('only valid purchased main suites hide original geometry; motion honors reduced and background states',()=>{
  for(const id of ['homeland-harbor','homeland-starglass']){
    assert.ok(css.includes(`[data-homeland="${id}"] .homeland-original-ground`));
    assert.ok(css.includes(`[data-homeland="${id}"] .homeland-original-trees`));
  }
  assert.doesNotMatch(css,/\[data-homeland\]:not|\.floating-island\s*[>{]/);
  assert.match(css,/var\(--theme-rock-side,#252744\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/\.no-motion \.island-campus/);
  assert.match(css,/html\.focus-runtime-hidden \.island-campus/);
  assert.match(css,/\[hidden\] \.island-campus/);
  assert.match(css,/animation-play-state:paused!important/);
  assert.match(css,/\.island-architecture-preview \.island-campus \* \{ animation:none/);
});
