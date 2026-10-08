'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const shop=require('../static/shop-art.js'),expansion=require('../static/shop-expansion.js');
const originals=[...['default','forest','ocean','sakura','aurora'].map(variant=>({id:'theme-'+variant,slot:'theme'})),...['default','lanterns','garden','pavilion','supplies','banners','fountain','library','observatory','arcade','palace'].map(variant=>({id:'island-'+variant,slot:'island'}))];
const entries=[...originals,...expansion.entries.filter(item=>['theme','island'].includes(item.slot))];

test('all original, expanded and limited worlds share a complete island camera instead of isolated parts',()=>{
  assert.ok(entries.length>60);assert.equal(new Set(entries.map(item=>item.id)).size,entries.length);
  for(const item of entries){
    const svg=shop.preview(item.id);
    assert.match(svg,/^<svg class="shop-art-svg shop-world-preview" viewBox="0 0 160 112"/);
    assert.match(svg,/data-preview-camera="590 350" transform="translate\(6\.25 12\.25\) scale\(\.25\)"/);
    for(const layer of ['sky','island-body','main-route','crystal-shrine','roadside-camp'])assert.ok(svg.includes(`data-preview-layer="${layer}"`),item.id+': missing '+layer);
    assert.equal((svg.match(/class="island-roadside-camp"/g)||[]).length,1,item.id);
    if(item.slot==='island'&&item.id!=='island-default')assert.ok(svg.includes(shop.islandDecoration(item.id)),item.id+': must show exactly the actual complete layout');
    if(item.slot==='theme'){
      const colors=expansion.themePalette(item.id);
      if(colors)for(const color of colors.slice(0,3))assert.ok(svg.includes(color),item.id+': actual terrain palette');
      assert.doesNotMatch(svg,/data-island-decoration=|data-expansion-art="island-/,'environment previews keep the starting island modest');
    }
    assert.doesNotMatch(svg,/<script|<foreignObject|\bon\w+=|(?:href|src)=["'](?!#)|NaN|undefined/);
  }
  // The scene fits within all four edges with one uniform scale, including the
  // complete 350-unit underside. No stretch, nested SVG viewport or cropping.
  const x=6.25,y=12.25,scale=.25;
  assert.ok(x>0&&y>0&&x+590*scale<160&&y+350*scale<112);
  assert.equal((590*scale)/(350*scale),590/350);
});

test('all world thumbnails parse as SVG XML and their local paint references remain self-contained',()=>{
  const all=entries.map(item=>shop.preview(item.id)),seen=new Set();
  for(const svg of all){
    assert.equal((svg.match(/<svg\b/g)||[]).length,1,'one viewport owns the consistent crop');
    const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
    for(const id of ids){assert.ok(!seen.has(id),'no SVG identifier collision: '+id);seen.add(id);}
    for(const ref of svg.matchAll(/url\(#([^)]*)\)|href="#([^"]+)"/g))assert.ok(ids.includes(ref[1]||ref[2]),'paint references resolve inside the thumbnail');
  }
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'focus-preview-xml-')),input=path.join(dir,'previews.json');
  try {
    fs.writeFileSync(input,JSON.stringify(all));
    const parsed=spawnSync('/usr/bin/python3',['-c','import json,sys,xml.etree.ElementTree as ET\nwith open(sys.argv[1]) as f: scenes=json.load(f)\nfor svg in scenes: ET.fromstring(svg)',input],{encoding:'utf8',timeout:15000});
    assert.equal(parsed.status,0,parsed.stderr||String(parsed.error||''));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('the first two limited island sets keep their base, route and fire under every floating district',()=>{
  for(const id of ['island-starhaven','island-celestialpalace']){
    const svg=shop.preview(id),art=shop.islandDecoration(id);
    assert.ok(art.length>1000);assert.ok(svg.includes(art));
    assert.ok(svg.indexOf('data-preview-layer="island-body"')<svg.indexOf(art));
    assert.ok(svg.indexOf('data-preview-layer="main-route"')<svg.indexOf(art));
    assert.ok(svg.indexOf('data-preview-layer="roadside-camp"')>svg.indexOf(art));
  }
});

test('original expansion rear buildings and coastal props share the corrected live and preview placement',()=>{
  const coastal=['flowerpots','mailbox','windmill','greenhouse','bakery','well','gazebo','watermill','aquarium','clocktower','skyharbor','moonhouse'];
  const island=[[100,207],[216,120],[346,105],[481,184],[405,251],[267,276],[167,239]];
  function inside([x,y]){let yes=false;for(let i=0,j=island.length-1;i<island.length;j=i++){const [xi,yi]=island[i],[xj,yj]=island[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)yes=!yes;}return yes;}
  for(const variant of coastal){
    const id='island-'+variant,live=shop.islandDecoration(id),svg=shop.preview(id);
    assert.match(live,/translate\(177 191\) scale\(\.65\)/);
    assert.match(live,/translate\(363 105\) scale\(\.7\)/);
    assert.doesNotMatch(live+svg,/data-preview-adjustment/);
    assert.ok(svg.includes(live));assert.ok(shop.islandPreview(id).includes(live));
    const feet=variant==='flowerpots'?[[12,66],[22,66],[42,66],[52,66],[73,66],[83,66]]:['mailbox','bakery','skyharbor'].includes(variant)?[[17,71],[46,86],[84,72]]:['well','watermill','aquarium'].includes(variant)?[[26,79],[70,87],[84,81]]:[[24,80],[75,74]];
    for(const [x,y] of feet)assert.ok(inside([177+x*.65,191+y*.65]),id+': every coastal contact remains on the island');
    for(const [x,y] of [[0,75],[100,75],[100,101],[0,101]])assert.ok(inside([363+x*.7,105+y*.7]),id+': every rear foundation corner remains on the island');
  }
});

test('every existing nondefault island has grounded contacts inside the slanted surface and outside the camp',()=>{
  const island=[[100,207],[216,120],[346,105],[481,184],[405,251],[267,276],[167,239]];
  function inside([x,y]){let yes=false;for(let i=0,j=island.length-1;i<island.length;j=i++){const [xi,yi]=island[i],[xj,yj]=island[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)yes=!yes;}return yes;}
  const existing=entries.filter(item=>item.slot==='island'&&item.id!=='island-default');
  assert.equal(existing.length,48);
  for(const item of existing){
    const markup=shop.islandDecoration(item.id),contacts=[...markup.matchAll(/<g\b[^>]*data-ground-contacts="([^"]+)"[^>]*>/g)];
    assert.ok(contacts.length,item.id+' has verified ground parts');
    assert.match(markup,/data-island-grounding="shore-v2"/);
    for(const [tag,points] of contacts){
      const t=tag.match(/translate\(([-.\d]+) ([-.\d]+)\)/),s=Number(tag.match(/scale\(([-.\d]+)\)/)?.[1]||1),tx=Number(t?.[1]||0),ty=Number(t?.[2]||0);
      for(const point of points.split(' ')){
        const [a,b]=point.split(',').map(Number),x=tx+a*s,y=ty+b*s;
        assert.ok(inside([x,y]),item.id+': off-shore foot '+[x,y]);
        assert.ok(x<303||x>373||y<205||y>265,item.id+': foot intrudes into camp');
      }
    }
    assert.ok(shop.preview(item.id).includes(markup),item.id+': thumbnail and live geometry must agree');
    assert.ok(shop.islandPreview(item.id).includes(markup),item.id+': large preview and live geometry must agree');
  }
});
