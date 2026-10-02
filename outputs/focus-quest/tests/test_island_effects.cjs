const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const effects=require('../static/island-effects.js'),expansion=require('../static/shop-expansion.js');
const paid=['fireflies','petals','snow','meteor','nebula'].map(id=>`fx-${id}`).concat(expansion.entries.filter(item=>item.slot==='fx').map(item=>item.id));

test('every existing paid island effect renders safe, bounded SVG in both real scene coordinate systems',()=>{
  const rendered=[];
  for(const mode of ['home','city'])for(const id of paid){
    assert.equal(effects.has(id),true,id);
    const markup=effects.scene(id,mode);
    assert.ok(markup.length>200,id);
    assert.equal(markup,effects.scene(id,mode),'routine redraw must not mint a different scene');
    assert.doesNotMatch(markup,/<(?:script|foreignObject|animate|set)\b|\bon\w+=|\b(?:href|id)=|url\(|NaN|undefined|Infinity|tabindex|role="button"/);
    const nodes=(markup.match(/<(?:path|circle|ellipse|rect|polygon|polyline|line)\b/g)||[]).length;
    assert.ok(nodes>5&&nodes<300,`${mode}: ${id}: ${nodes} geometry nodes`);
    rendered.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${mode==='home'?'590 350':'1200 720'}">${markup}</svg>`);
  }
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'focus-fx-xml-'));
  try{
    const file=path.join(temporary,'scenes.json');fs.writeFileSync(file,JSON.stringify(rendered));
    const checked=spawnSync('/usr/bin/python3',['-c','import json,sys,xml.etree.ElementTree as ET\nwith open(sys.argv[1]) as f:\n for scene in json.load(f): ET.fromstring(scene)',file],{encoding:'utf8',timeout:15000});
    assert.equal(checked.status,0,checked.error?.message||checked.stderr);
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});

test('free default and unknown or cross-slot IDs never grant paid atmosphere',()=>{
  assert.equal(effects.scene('fx-default','home'),'');assert.equal(effects.scene('fx-default','city'),'');
  for(const id of [null,undefined,{},[],"__proto__",'constructor','fx-unknown','island-lanterns','fx-<script>','" onload="alert(1)']){
    assert.equal(effects.has(id),false);assert.equal(effects.scene(id,'home'),'');assert.equal(effects.scene(id,'city'),'');
  }
});
