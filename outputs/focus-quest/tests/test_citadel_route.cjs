const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const route=require('../static/citadel-route.js');

test('the clockwise itinerary has four ordered segments and fixed facility coordinates',()=>{
  assert.deepEqual(route.segments.map(s=>[s.from,s.to]),[['dock','workshop'],['workshop','archive'],['archive','observatory'],['observatory','gate']]);
  assert.deepEqual(route.places.map(p=>[p.id,p.x,p.y]),[['dock',230,565],['workshop',245,326],['archive',600,178],['observatory',950,330],['gate',925,565],['core',595,425]]);
  route.segments.forEach((s,i)=>{assert.equal(s.thresholdStart,i/4);assert.equal(s.thresholdEnd,(i+1)/4);assert.match(s.path,/^M\d+ \d+C/);assert.ok(Object.isFrozen(s)&&Object.isFrozen(s.points.start));});
});
test('every exact quarter lands at its front court and stage changes only at the threshold',()=>{
  for(let i=0;i<5;i++){
    const result=route.build(i*25);
    assert.deepEqual(result.position,route.places[i].position);assert.equal(result.stage,i);
    if(i)assert.equal(route.build(i*25-1e-7).stage,i-1);
    if(i<4){assert.equal(result.fromId,route.places[i].id);assert.equal(result.segmentProgress,0);}
  }
  assert.equal(route.build(100).toId,'gate');assert.equal(route.build(100).segmentProgress,1);
});
test('position is continuous at segment boundaries and follows the same cubic as the drawn path',()=>{
  for(const percent of [25,50,75]){
    const a=route.build(percent-1e-6).position,b=route.build(percent+1e-6).position;
    assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<.001);
  }
  route.segments.forEach((s,i)=>{
    const p=route.build(i*25+12.5).position,{start:a,control1:b,control2:c,end:d}=s.points;
    assert.equal(p.x,(a.x+3*b.x+3*c.x+d.x)/8);assert.equal(p.y,(a.y+3*b.y+3*c.y+d.y)/8);
  });
});
test('traveler advances through all four quarters, changes facing with travel direction, and stops at the gate after 100',()=>{
  assert.equal(new Set(Array.from({length:101},(_,i)=>JSON.stringify(route.build(i).position))).size,101);
  assert.equal(route.build(0).direction,-1);assert.equal(route.build(50).direction,1);assert.equal(route.build(100).direction,-1);
  const beyond=route.build(133.333);assert.equal(beyond.percent,133.333);assert.equal(beyond.progress,1);assert.equal(beyond.stage,4);assert.deepEqual(beyond.position,route.build(100).position);
});
test('invalid input has a safe deterministic starting position and browser exports match CommonJS',()=>{
  for(const input of [undefined,null,NaN,Infinity,-1,{},'25','" onload="bad'])assert.deepEqual(route.build(input),route.build(0));
  const context=vm.createContext({});vm.runInContext(fs.readFileSync(require.resolve('../static/citadel-route.js'),'utf8'),context);
  assert.equal(JSON.stringify(context.FocusCitadelRoute.build(63.5)),JSON.stringify(route.build(63.5)));
});
