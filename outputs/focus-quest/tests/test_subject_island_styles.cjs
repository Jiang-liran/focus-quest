const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const individual=require('../static/subject-island-styles.js');
const architecture=require('../static/island-architecture.js');
const expedition=require('../static/expedition-art.js');
const shop=require('../static/shop-art.js');
const subjects=Object.keys(individual.slots);
function region(markup,id){
  const at=markup.indexOf(`data-expedition-subject="${id}"`),start=markup.lastIndexOf('<g ',at);assert.ok(at>=0);
  let depth=0;for(const match of markup.slice(start).matchAll(/<g\b[^>]*>|<\/g>/g)){depth+=match[0].startsWith('</')?-1:1;if(!depth)return markup.slice(start,start+match.index+match[0].length);}
  assert.fail('unbalanced island');
}
const base={progress:.6,subjects:subjects.map(id=>({id,progress:.6,percent:60}))};
test('each individual island overrides only its own region and can restore original art while a suite stays equipped',()=>{
  for(const suite of ['archipelago-default','archipelago-harbor','archipelago-starglass']){
    const equipped={archipelago:suite},before=expedition.world({...base,equipped});
    for(const subject of subjects){
      const slot=individual.slots[subject];
      for(const item of individual.inventory[slot]){
        const input={...equipped,[slot]:item.id},snapshot=JSON.stringify(input);
        const world=expedition.world({...base,equipped:input});
        for(const other of subjects.filter(id=>id!==subject))assert.equal(region(world,other),region(before,other));
        assert.equal(JSON.stringify(input),snapshot);
        assert.equal(individual.resolve(input,subject),item.variant==='default'?suite:item.id);
        if(item.variant==='default')assert.equal(world,before);
        if(item.variant==='original')assert.equal(region(world,subject),region(expedition.world(base),subject));
        if(!['default','original'].includes(item.variant))assert.ok(world.includes(architecture.subject(item.id,{id:subject,progress:.6})));
      }
      assert.equal(individual.resolve({...equipped,[slot]:'campuscs-neon'},subject),subject==='cs'?'campuscs-neon':suite);
    }
  }
});
test('twelve paid designs reconstruct daily, share their live art with previews and keep four distinctive palettes',()=>{
  const shapes=[];
  for(const item of individual.entries.filter(i=>i.description)){
    const zero=individual.subject(item.id,{id:item.subject,progress:0}),done=individual.subject(item.id,{id:item.subject,progress:1});
    assert.notEqual(zero,done);assert.match(zero,/data-campus-stage="0"/);assert.match(done,/data-campus-stage="4"/);
    const seen=individual.subject(item.id,{id:item.subject,progress:1});
    assert.ok(individual.preview(item.id).includes(seen));assert.ok(individual.detail(item.id).includes(seen));
    assert.equal(shop.preview(item.id),individual.preview(item.id));
    assert.equal(shop.subjectIslandPreview(item.id,true),individual.detail(item.id));
    assert.ok(zero.includes(individual.palettes[item.subject].roof));
    assert.match(zero,/island-campus-terrain/);assert.match(zero,/island-campus-buildings/);
    shapes.push(zero.replace(/#[a-f0-9]{6}/g,'COLOR').replace(/data-[^=]+="[^"]+"/g,''));
  }
  assert.equal(shapes.length,12);assert.equal(new Set(shapes).size,12);
  assert.equal(new Set(subjects.map(id=>individual.palettes[id].roof)).size,4);
  for(const suite of ['archipelago-harbor','archipelago-starglass'])for(const id of subjects)assert.ok(architecture.subject(suite,id).includes(individual.palettes[id].roof));
});
test('all free controls have real original thumbnails, untrusted and cross-subject choices stay inert',()=>{
  for(const subject of subjects){
    const slot=individual.slots[subject];
    for(const variant of ['default','original']){
      assert.ok(shop.preview(`${slot}-${variant}`).includes('expedition-architecture'));
      assert.ok(shop.subjectIslandPreview(`${slot}-${variant}`,true).includes('expedition-architecture'));
    }
    const following=shop.subjectIslandPreview(`${slot}-default`,true,{archipelago:'archipelago-harbor',[slot]:individual.inventory[slot][2].id});
    assert.ok(following.includes(architecture.subject('archipelago-harbor',{id:subject,progress:1})));
    assert.ok(shop.preview(`${slot}-default`,{archipelago:'archipelago-harbor'}).includes('archipelago-harbor'));
    assert.ok(shop.preview(`${slot}-original`,{archipelago:'archipelago-harbor'}).includes('expedition-architecture'));
    for(const item of individual.entries.filter(i=>i.subject!==subject))assert.equal(individual.subject(item.id,{id:subject}),'');
  }
  for(const bad of [null,undefined,'__proto__','constructor','" onload="bad',{},[]]){
    assert.equal(individual.has(bad),false);assert.equal(individual.preview(bad),'');assert.equal(individual.detail(bad),'');
    assert.equal(individual.resolve({campusmath:bad},'math'),'archipelago-default');
  }
  for(const progress of [NaN,Infinity,-Infinity,{},'bad',null])assert.doesNotMatch(individual.subject('campusmath-spiral',{id:'math',progress}),/NaN|Infinity|undefined|<script|onload=/);
});
test('all mixed equipment resolves deterministically without shared colors, timers or DOM mutation',()=>{
  const context=vm.createContext({});vm.runInContext(fs.readFileSync(require.resolve('../static/subject-island-styles.js'),'utf8'),context);
  for(const item of individual.entries.filter(i=>i.description))assert.equal(context.FocusSubjectIslandStyles.preview(item.id),individual.preview(item.id));
  const images=[];
  for(const item of individual.entries){images.push(shop.preview(item.id),shop.subjectIslandPreview(item.id,true));}
  images.push(expedition.world({...base,equipped:{archipelago:'archipelago-starglass',campusmath:'campusmath-spiral',campuscs:'campuscs-workshop',campuspolitics:'campuspolitics-original',campusenglish:'campusenglish-greenhouse'}}));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'focus-individual-'));
  try{
    const file=path.join(dir,'art.json');fs.writeFileSync(file,JSON.stringify(images));
    const result=spawnSync('python3',['-c','import json,sys,xml.etree.ElementTree as E\nfor s in json.load(open(sys.argv[1])):\n r=E.fromstring(s)\n ids=[e.attrib["id"] for e in r.iter() if "id" in e.attrib]\n assert len(ids)==len(set(ids))',file],{encoding:'utf8',timeout:10000});
    assert.equal(result.status,0,result.stderr);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
