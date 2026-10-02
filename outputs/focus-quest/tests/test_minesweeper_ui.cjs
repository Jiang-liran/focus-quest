const test=require('node:test');
const assert=require('node:assert/strict');
const {harness,snapshot,copy,flush,time}=require('./arcade_harness.cjs');
const mineVenues=[['beginner','初级',9,9,10],['intermediate','中级',16,16,40],['expert','高级',30,16,99]].map(([id,name,width,height,mines])=>({id:'mines-'+id,type:'minesweeper',family:'logic',name:'经典扫雷 · '+name,subtitle:`${width} × ${height} · ${mines} 雷`,description:'首次翻开安全，翻开所有安全格即可获胜。',bestSeconds:null,plays:0,wins:0,width,height,mines}));
function game(patch={}){return {id:'mines-ui-1',type:'minesweeper',venue:'mines-beginner',version:1,status:'active',expiresAt:null,maxSteps:null,startedAt:time(0),result:null,state:{width:9,height:9,mines:10,difficulty:'beginner',phase:'ready',cells:Array.from({length:9},()=>Array.from({length:9},()=>({state:'covered'}))),flags:0,remainingMines:10,opened:0,safeCells:71,questions:true,elapsedSeconds:0,clockStartedAt:null},...patch};}
function snap(patch={}){return snapshot({venues:copy(mineVenues),active:game(),...patch});}
function create(a=game()){
 const h=harness({__mines:true});h.api.render(snap({active:a}));
 h.cell=(position='0,0')=>h.document.querySelector(`[data-mines-cell="${position}"]`);
 h.mine=(type,target,props={})=>{const e={target,button:0,buttons:0,detail:1,preventDefault(){},...props};for(const fn of h.element('mines-host').listeners.get(type)||[])fn(e);if(['click','keydown'].includes(type))h.fire(type,target,props);return e;};
 h.press=(position,button=0)=>{const cell=h.cell(position);h.mine('mousedown',cell,{button,buttons:button===0?1:button===2?2:4});h.mine('mouseup',cell,{button,buttons:0});};return h;
}
function playing(){const a=game();a.state.phase='playing';a.state.clockStartedAt=time(0);a.state.cells[1][1]={state:'open',number:2};a.state.opened=1;return a;}
function finish(a,status='lost'){const ended=copy(a);ended.status=status;ended.version++;ended.state.phase=status;ended.state.elapsedSeconds=65.5;ended.state.cells[0][0]={state:'open',mine:true,exploded:true};ended.result={won:status==='won',elapsedSeconds:65.5,coins:status==='won'?12:0,diamonds:status==='won'?1:0,score:0,reason:status==='won'?'所有安全格已翻开':'踩到地雷',medal:0};return ended;}

test('classic lobby exposes exactly the Windows three difficulty choices with truthful time and rewards',()=>{
 const h=create();h.api.render(snap({now:time(200),active:null,lastResult:null}));
 const html=h.element('arcade-content').innerHTML;for(const v of mineVenues)assert.match(html,new RegExp(v.name.replace(' · ',' · ')));
 assert.match(html,/不设单局时间上限/);assert.match(html,/中级 24 金币、2 钻石/);assert.match(html,/高级 40 金币、3 钻石/);assert.match(html,/跨日保留/);
 h.select('[data-arcade-venue="mines-expert"]');assert.equal(h.calls.requests.length,0);assert.match(h.element('arcade-pill-title').textContent,/高级/);
});
test('ready state remains zero before first reveal; a long game never expires at four minutes',()=>{
 const h=create();assert.equal(h.element('mines-host').querySelector('[data-mines-timer]').textContent,'000');h.advance(600000);assert.equal(h.element('mines-host').querySelector('[data-mines-timer]').textContent,'000');assert.equal(h.calls.requests.length,0);
 const a=playing();h.api.render(snap({now:'2026-09-25T20:10:00+08:00',active:a}));h.advance(500000);
 assert.equal(h.element('mines-host').querySelector('[data-mines-timer]').textContent,'999');assert.equal(h.calls.requests.length,0);assert.doesNotMatch(h.element('arcade-pill-status').textContent,/NaN|Infinity|归航/);assert.match(h.element('arcade-pill-status').textContent,/18 分/);
 h.press('0,0');assert.equal(h.calls.requests[0].path,'/api/arcade/move');
});
test('classic LED supports negative estimates and clamps only display, not actual time',()=>{
 const h=create(),m=h.context.FocusMinesweeper;assert.equal(m.digits(-7),'-07');assert.equal(m.digits(-400),'-99');assert.equal(m.digits(1234),'999');assert.equal(m.timeLabel(1234),'20 分 34 秒');
 const a=playing();a.state.elapsedSeconds=700;assert.equal(m.elapsed(a,Date.parse(time(0))-1000),700);
});
test('left reveal sends one versioned move; rapid additional input is blocked pending server reply',async()=>{
 const h=create();h.press('0,0');h.press('1,0');assert.equal(h.calls.requests.length,1);assert.deepEqual(h.calls.requests[0].body,{id:'mines-ui-1',version:1,move:{action:'reveal',x:0,y:0}});
 const a=playing();a.version=2;a.state.cells[0][0]={state:'open',number:1};h.calls.requests[0].resolve(snap({now:time(300),active:a}));await flush();assert.equal(h.document.activeElement.dataset.minesCell,'0,0');assert.equal(h.calls.sounds.length,0);
});
test('right click marks without revealing and question toggle is a server-side preference',async()=>{
 const h=create();h.press('2,3',2);assert.deepEqual(h.calls.requests[0].body.move,{action:'mark',x:2,y:3});const a=game();a.version=2;a.state.cells[3][2]={state:'flag'};a.state.flags=1;a.state.remainingMines=9;h.calls.requests[0].resolve(snap({now:time(300),active:a}));await flush();assert.equal(h.element('mines-host').querySelector('[data-mines-counter]').textContent,'009');
 h.mine('click',h.document.querySelector('[data-mines-questions]'));assert.deepEqual(h.calls.requests[1].body.move,{action:'questions',enabled:false});
});
test('both mouse buttons on a number preview neighbours and release exactly one chord',()=>{
 const h=create(playing()),cell=h.cell('1,1');h.mine('mousedown',cell,{button:0,buttons:1});h.mine('mousedown',cell,{button:2,buttons:3});assert.equal(h.element('mines-host').querySelectorAll('.mines-pressed').length,8);assert.equal(h.document.querySelector('[data-mines-reset]').dataset.face,'pressed');
 h.mine('mouseup',cell,{button:2,buttons:1});h.mine('mouseup',cell,{button:0,buttons:0});assert.equal(h.calls.requests.length,1);assert.deepEqual(h.calls.requests[0].body.move,{action:'chord',x:1,y:1});assert.equal(h.element('mines-host').querySelectorAll('.mines-pressed').length,0);
});
test('middle button and double click each chord, never a mine marking',()=>{
 for(const method of ['middle','double']){const h=create(playing());if(method==='middle')h.press('1,1',1);else h.mine('dblclick',h.cell('1,1'));assert.equal(h.calls.requests.length,1);assert.deepEqual(h.calls.requests[0].body.move,{action:'chord',x:1,y:1});}
});
test('keyboard uses roving focus and sends one reveal while the parent ignores mine keys',()=>{
 const h=create();let prevented=false;h.mine('keydown',h.cell('0,0'),{key:'ArrowRight',preventDefault(){prevented=true;}});assert.equal(h.document.activeElement.dataset.minesCell,'1,0');assert.equal(h.calls.requests.length,0);
 h.mine('keydown',h.cell('1,0'),{key:'Enter',preventDefault(){prevented=true;}});assert.ok(prevented);assert.equal(h.calls.requests.length,1);assert.deepEqual(h.calls.requests[0].body.move,{action:'reveal',x:1,y:0});
});
test('unchanged polling and second ticks preserve 480 tile nodes without rebuilding a board',()=>{
 const a=game();a.venue='mines-expert';a.state.width=30;a.state.height=16;a.state.mines=99;a.state.safeCells=381;a.state.cells=Array.from({length:16},()=>Array.from({length:30},()=>({state:'covered'})));
 const h=create(a),grid=h.element('mines-host').querySelector('[data-mines-board]'),first=h.cell('0,0'),writes=grid.writes;assert.equal(grid.querySelectorAll('[data-mines-cell]').length,480);
 for(let i=0;i<50;i++){h.api.render(snap({now:time(i+200),active:copy(a)}));h.advance(1000);}assert.equal(grid.writes,writes);assert.equal(h.cell('0,0'),first);assert.equal(h.timers.size,1);
});
test('loss preserves full final board, wrong flags, frozen clock and correct zero-reward reason',()=>{
 const a=playing(),h=create(a),end=finish(a);end.state.cells[1][0]={state:'flag',wrongFlag:true};h.api.render(snap({now:time(500),active:null,lastResult:end,history:[end]}));
 assert.equal(h.document.querySelectorAll('[data-mines-cell]').length,81);assert.equal(h.cell('0,0').classList.contains('exploded'),true);assert.ok(h.cell('0,1').querySelector('.mines-wrong'));assert.equal(h.document.querySelector('[data-mines-reset]').dataset.face,'lost');assert.equal(h.timers.size,0);
 assert.match(h.element('mines-result').innerHTML,/踩到地雷，本次不发放奖励/);assert.doesNotMatch(h.element('mines-result').innerHTML,/0 分|今日游戏奖励额度已用满/);h.advance(600000);assert.equal(h.document.querySelector('[data-mines-timer]').textContent,'065');
 h.press('0,2');assert.equal(h.calls.requests.length,0);
});
test('personal best changes immediately in the same mounted game after winning',()=>{
 const a=playing(),h=create(a),end=finish(a,'won');const v=copy(mineVenues);v[0].bestSeconds=65.5;h.api.render(snap({now:time(500),active:null,lastResult:end,history:[end],venues:v}));assert.equal(h.document.querySelector('[data-mines-best]').textContent,'1 分 05 秒');assert.equal(h.document.querySelector('[data-mines-reset]').dataset.face,'won');
});
test('smiley restart asks explicitly, cancel costs nothing, confirm ends then starts exactly one new game',async()=>{
 const h=create();h.mine('click',h.document.querySelector('[data-mines-reset]'));assert.equal(h.calls.requests.length,0);assert.match(h.element('mines-confirm').innerHTML,/另用 1 张游玩券/);h.click('cancel-mines');assert.equal(h.calls.requests.length,0);
 h.mine('click',h.document.querySelector('[data-mines-reset]'));const confirm=h.document.querySelector('[data-arcade-action="confirm-mines-restart"]');h.click('confirm-mines-restart');h.fire('click',confirm);assert.equal(h.calls.requests.length,1);assert.equal(h.calls.requests[0].path,'/api/arcade/finish');
 const end=finish(game(),'abandoned');h.calls.requests[0].resolve(snap({now:time(500),active:null,lastResult:end,history:[end]}));await flush();assert.equal(h.calls.requests.length,2);assert.equal(h.calls.requests[1].path,'/api/arcade/start');assert.equal(h.calls.requests[1].body.venue,'mines-beginner');
 h.calls.requests[1].resolve(snap({now:time(700),active:game({id:'mines-ui-2'}),available:3}));await flush();assert.equal(h.document.querySelectorAll('[data-mines-cell]').length,81);
});
test('no spare ticket prevents smiley restart without abandoning the live game',()=>{
 const h=create();h.api.render(snap({now:time(300),available:0}));h.mine('click',h.document.querySelector('[data-mines-reset]'));assert.equal(h.document.querySelector('[data-arcade-action="confirm-mines-restart"]').disabled,true);h.click('confirm-mines-restart');assert.equal(h.calls.requests.length,0);
});
test('hidden games stop clocks and mouse input; 100 remounts never accumulate native listeners',()=>{
 const h=create(playing());h.nativeVisibility(false);assert.equal(h.timers.size,0);h.press('0,0');assert.equal(h.calls.requests.length,0);h.advance(900000);h.nativeVisibility(true);assert.equal(h.timers.size,1);assert.equal(h.calls.requests.length,0);
 for(let i=0;i<100;i++)h.api.render(snap({now:time(400+i),active:game({id:'session-'+i})}));assert.equal(h.documentListeners.get('mouseup').length,1);assert.equal(h.documentListeners.get('focusquest:visibility').length,2);h.api.leave();assert.equal(h.timers.size,0);
});

test('F2 uses the same safe restart confirmation and never spends on keydown alone',()=>{const h=create();h.mine('keydown',h.cell('0,0'),{key:'F2'});assert.equal(h.calls.requests.length,0);assert.ok(h.document.querySelector('[data-arcade-action="confirm-mines-restart"]'));});


test('a stocked permanent wallet cannot restart minesweeper after the daily admission cap',()=>{
 const h=create();h.api.render(snap({revision:22,now:time(300),available:31,used:11,canPlay:false,playsRemaining:0,persistentTickets:true,rules:{...snapshot().rules,maxDailyPlays:11}}));
 h.mine('click',h.document.querySelector('[data-mines-reset]'));assert.match(h.element('mines-confirm').innerHTML,/今日出发次数已用满/);assert.equal(h.document.querySelector('[data-arcade-action="confirm-mines-restart"]').disabled,true);h.click('confirm-mines-restart');assert.equal(h.calls.requests.length,0);assert.equal(h.document.querySelectorAll('[data-mines-cell]').length,81);
});
