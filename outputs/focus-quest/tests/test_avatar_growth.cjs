const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {avatar}=require('../static/quest-art.js');
const outfits=['default','ranger','voyager','alchemist','star','royal'].map(id=>`avatar-${id}`);

function tiers(svg){
  return [...svg.matchAll(/<g class="quest-avatar-tier quest-avatar-tier-(\d+)" data-avatar-tier="(\d+)" display="(inline|none)">([\s\S]*?)<\/g>/g)]
    .map(match=>({classTier:Number(match[1]),tier:Number(match[2]),display:match[3],geometry:match[4]}));
}
function base(svg){
  return svg.slice(svg.indexOf('<g class="quest-player-growth"')).replace(/^<g[^>]+>/,'').split('<g class="quest-avatar-tier ')[0];
}

for(const outfit of outfits)test(`${outfit}: all five stages retain the original face, hat and clothing with four stable growth layers`,()=>{
  const plain=avatar('player',outfit),initialBase=base(plain),initialTiers=tiers(plain);
  assert.equal(plain,avatar('player',outfit,0));
  const visible=[];
  for(let stage=0;stage<=4;stage++){
    const art=avatar('player',outfit,stage),layers=tiers(art);
    assert.match(art,/^<svg class="quest-avatar-art" viewBox="0 0 64 72" width="64" height="72"/);
    assert.match(art,new RegExp(`<g class="quest-player-growth" data-avatar-stage="${stage}">`));
    assert.match(art,new RegExp(`data-outfit="${outfit}" data-skin-slots="avatar"`));
    assert.deepEqual(layers.map(layer=>layer.tier),[1,2,3,4]);
    assert.deepEqual(layers.map(layer=>layer.classTier),[1,2,3,4]);
    assert.deepEqual(layers.map(layer=>layer.display),[1,2,3,4].map(tier=>tier<=stage?'inline':'none'));
    assert.deepEqual(layers.map(layer=>layer.geometry),initialTiers.map(layer=>layer.geometry));
    assert.equal(base(art),initialBase,'Growth must add to the chosen outfit without replacing its face, hat or props');
    assert.equal((art.match(/<ellipse cx="32" cy="34.5"/g)||[]).length,1);
    assert.equal((art.match(/<circle cx="27.7" cy="36.6"/g)||[]).length,1);
    assert.equal((art.match(/<circle cx="36.3" cy="36.6"/g)||[]).length,1);
    visible.push(layers.filter(layer=>layer.display==='inline').map(layer=>layer.geometry).join(''));
  }
  assert.equal(new Set(visible).size,5,'Each milestone must add actual visible geometry');
});

test('all six themes have distinct shapes at each tier instead of sharing only recolored halos',()=>{
  for(let tier=0;tier<4;tier++){
    const shapes=outfits.map(outfit=>{
      const geometry=tiers(avatar('player',outfit,4))[tier].geometry;
      assert.match(geometry,/<path\b/,'Each tier must include physical decorative geometry');
      assert.match(geometry,/fill="#[0-9a-f]{6}"/i,'Each tier must contain solid clothing or equipment');
      return [...geometry.matchAll(/<(?:path|circle|ellipse|rect)\b[^>]*>/g)].map(match=>
        match[0].replace(/(?:fill|stroke)="[^"]*"/g,'').replace(/\s+/g,' ')).join('');
    });
    assert.equal(new Set(shapes).size,6,`Tier ${tier+1} must preserve six distinct themes`);
  }
});

test('stage input is finite, integer and clamped without coercing untrusted objects or strings',()=>{
  for(const [stage,expected] of [[-1,0],[-.01,0],[.999,0],[1,1],[1.999,1],[2.999,2],[3.999,3],[4,4],[4.999,4],[99,4]]){
    for(const outfit of outfits)assert.equal(avatar('player',outfit,stage),avatar('player',outfit,expected));
  }
  const invalid=[null,undefined,NaN,Infinity,-Infinity,'4','<script>',{},[],true,false,4n,Symbol('stage'),{valueOf(){throw Error('Do not coerce external objects');}}];
  for(const stage of invalid)assert.equal(avatar('player','avatar-star',stage),avatar('player','avatar-star',0));
});

test('NPC identities are unchanged for every stage and retired or invalid outfit inputs',()=>{
  for(const role of ['morning','afternoon','shop','guide']){
    const baseline=avatar(role);
    for(const stage of [0,1,2,3,4,100,NaN,'4'])for(const outfit of [...outfits,'npc-scholar',null])assert.equal(avatar(role,outfit,stage),baseline);
    assert.doesNotMatch(baseline,/data-avatar-stage|data-avatar-tier|quest-player-growth/);
  }
  assert.equal(avatar('unknown','avatar-star',4),avatar('guide'));
});

test('growth stays self-contained and decorative and cannot echo unsafe parameters into SVG',()=>{
  for(const outfit of [...outfits,'" onload="bad','__proto__','constructor',null])for(let stage=0;stage<=4;stage++){
    const art=avatar('player',outfit,stage);
    assert.match(art,/aria-hidden="true" focusable="false"/);
    assert.doesNotMatch(art,/\bid=|<script|<foreignObject|<image|<use\b|<animate\b|<animateTransform\b|\bon\w+=|href=|url\(|NaN|Infinity|undefined/);
    assert.doesNotMatch(art,/style=|animation:/,'Motion is controlled by the host CSS, without inline animation');
    assert.equal((art.match(/<g\b/g)||[]).length,(art.match(/<\/g>/g)||[]).length);
    assert.equal((art.match(/<svg\b/g)||[]).length,1);
    assert.ok(art.endsWith('</svg>'));
  }
});

test('browser growth API matches CommonJS and survives stripping the outer SVG for the city',()=>{
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../static/quest-art.js'),'utf8'),context);
  for(const outfit of outfits)for(let stage=0;stage<=4;stage++){
    const markup=context.QuestArt.avatar('player',outfit,stage);
    assert.equal(markup,avatar('player',outfit,stage));
    const inner=markup.replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'');
    assert.match(inner,new RegExp(`^<g class="quest-player-growth" data-avatar-stage="${stage}">`));
    assert.equal(tiers(inner).length,4);
  }
});
