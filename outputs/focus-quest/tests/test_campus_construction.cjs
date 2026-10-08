const test=require('node:test'),assert=require('node:assert/strict');
const art=require('../static/island-architecture.js'),individual=require('../static/subject-island-styles.js');
const subjects=Object.keys(individual.slots);
const variants=[...art.inventory.archipelago.filter(i=>!i.id.endsWith('-default')).flatMap(({id})=>subjects.map(subject=>({id,subject}))),...individual.entries.filter(i=>i.description)];
// Inspect the rendered hierarchy: a drawable must belong to exactly one whole
// construction part, so no parent fade can hide or double-fade a child part.
function tree(markup){
  const root={attrs:{},children:[]},stack=[root];
  for(const [,end,tag,tail] of markup.matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*)>/gi)){
    if(end){assert.equal(stack.pop().tag,tag);continue;}
    const attrs=Object.fromEntries([...tail.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
    const node={tag,attrs,children:[]};stack.at(-1).children.push(node);
    if(!tail.endsWith('/'))stack.push(node);
  }
  assert.equal(stack.length,1);return root;
}
const walk=node=>[node,...node.children.flatMap(walk)];
const byClass=(root,name)=>walk(root).find(node=>node.attrs.class?.split(' ').includes(name));
const parts=root=>walk(root).filter(node=>node.attrs.class==='campus-build-part');
const charge=(progress,step)=>Math.round(Math.max(0,Math.min(1,progress*4-step+1))*1000)/1000;
const normal=node=>({tag:node.tag,attrs:Object.fromEntries(Object.entries(node.attrs).filter(([key])=>!(node.attrs.class==='campus-build-part'&&['data-build-amount','style'].includes(key)))),children:node.children.map(normal)});

test('every new subject theme assembles whole parts monotonically and retains four quarter-goal crystals',()=>{
  assert.equal(variants.length,20);
  for(const {id,subject} of variants){
    const complete=byClass(tree(art.subject(id,{id:subject,progress:1})),'campus-construction-solid');
    assert.deepEqual([...new Set(parts(complete).map(n=>Number(n.attrs['data-build-step'])))].sort(),[1,2,3,4],id);
    for(const raw of [0,.125,.25,.375,.5,.625,.75,.875,.999,1,1.5]){
      const p=Math.min(1,raw),html=art.subject(id,{id:subject,progress:raw}),root=tree(html);
      assert.match(html,new RegExp(`data-campus-stage="${Math.floor(p*4)}"`));
      assert.doesNotMatch(html,/<svg|<clipPath|<mask|\bclip-path=|\bviewBox=|\bheight=|\sid="|NaN|Infinity/,'construction must not crop a model');
      const crystals=walk(root).filter(n=>n.attrs.class?.split(' ').includes('campus-progress-crystal'));
      assert.deepEqual(crystals.map(n=>Number(n.attrs['data-charge'])),[1,2,3,4].map(s=>charge(p,s)),id);
      const solid=byClass(root,'campus-construction-solid'),ghost=byClass(root,'campus-blueprint');
      if(p===0)assert.equal(solid,undefined);
      else {
        assert.deepEqual(normal(solid),normal(complete),'part geometry and placement cannot move with progress: '+id);
        for(const part of parts(solid)){
          const amount=charge(p,Number(part.attrs['data-build-step']));
          assert.equal(Number(part.attrs['data-build-amount']),amount);
          assert.equal(part.attrs.style,`opacity:${amount}${amount===0?';display:none':''}`);
        }
      }
      if(p===1)assert.equal(ghost,undefined);
      else for(const part of parts(ghost)){
        const amount=Math.round((1-charge(p,Number(part.attrs['data-build-step'])))*1000)/1000;
        assert.equal(part.attrs.style,`opacity:${amount}${amount===0?';display:none':''}`);
      }
    }
  }
});

test('all walls, roofs, annexes and fittings follow structural dependencies without premature floating pieces',()=>{
  for(const {id,subject} of variants){
    const solid=byClass(tree(art.subject(id,{id:subject,progress:1})),'campus-construction-solid');
    function inspect(node,enclosing=0){
      const count=enclosing+(node.attrs.class==='campus-build-part'?1:0);
      assert.ok(count<=1,'nested part opacity: '+id);
      if(['path','circle','ellipse','rect','polygon','line','polyline'].includes(node.tag))assert.equal(count,1,'unphased drawable: '+id);
      for(const child of node.children)inspect(child,count);
    }
    inspect(solid);
    for(const house of walk(solid).filter(n=>n.attrs['data-campus-solid']==='house')){
      const stages=Object.fromEntries(house.children.map(n=>[n.attrs['data-build-piece'],Number(n.attrs['data-build-step'])]));
      assert.equal(stages.footing,1);
      assert.ok(stages.roof>=stages.walls);
      if(stages.windows)assert.ok(stages.windows>=stages.walls);
    }
    for(const part of parts(solid)){
      const piece=part.attrs['data-build-piece'],step=Number(part.attrs['data-build-step']);
      if(['instrument','wheel','bridge','boat','furnishing'].includes(piece))assert.equal(step,4,id+' '+piece);
      if(piece==='columns')assert.equal(step,2);
      if(piece==='dome')assert.ok(step>=3);
    }
  }
});

test('new day resets assembly, while original theme and previews keep their own complete rendering',()=>{
  for(const {id,subject} of variants){
    const done=art.subject(id,{id:subject,progress:1});
    assert.ok(art.preview(id).includes(done));assert.ok(art.detail(id).includes(done));
    const zero=tree(art.subject(id,{id:subject,progress:0}));
    assert.equal(byClass(zero,'campus-construction-solid'),undefined);
    assert.ok(parts(byClass(zero,'campus-blueprint')).every(n=>n.attrs['data-build-amount']==='0'));
  }
  assert.equal(art.subject('archipelago-default',{id:'math',progress:.5}),'');
  for(const subject of subjects)assert.equal(art.subject(`${individual.slots[subject]}-original`,{id:subject,progress:.5}),'');
});
