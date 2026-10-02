const test=require('node:test');
const assert=require('node:assert/strict');
const {harness,snapshot,game,venues,copy,flush,time}=require('./arcade_harness.cjs');

test('shared currency icons retain arcade reward amounts and accessible currency names without spending tickets',()=>{
 const currencyArt=require('../static/currency-art.js'),h=harness({FocusCurrencyArt:currencyArt});
 const result=game('trail',{status:'won',result:{won:true,coins:12,diamonds:1,score:120,medal:2,rewardBreakdown:[{label:'通关',coins:12,diamonds:1}]}});
 const data=snapshot({rewardToday:{coins:12,diamonds:1},lastResult:result,history:[result]});h.api.render(data);h.api.enter();
 const top=h.element('arcade-top').innerHTML,body=h.element('arcade-content').innerHTML;
 assert.match(top,/data-currency="coins"/);assert.match(top,/data-currency="diamonds"/);assert.match(top,/12 \/ 60 金币/);assert.match(top,/1 \/ 3 钻石/);
 assert.match(body,/data-currency="coins"/);assert.match(body,/data-currency="diamonds"/);assert.match(body,/12 金币/);assert.match(body,/1 钻石/);assert.equal(h.calls.requests.length,0);assert.equal(data.available,4);
});

test('visiting and choosing a venue never spends a ticket; portal shows game content',()=>{
 const h=harness();h.api.render(snapshot());h.api.open('mirror-gallery');
 assert.deepEqual(h.calls.pages,['achievements']);assert.equal(h.calls.requests.length,0);
 assert.match(h.element('arcade-pill-title').textContent,/镜湖回廊.*折光/);
 assert.match(h.element('arcade-content').innerHTML,/每 30 分钟.*1 张券.*每天最多 8 张/s);
 assert.match(h.element('arcade-content').innerHTML,/超时和提前归航没有奖励/);
});
test('start is explicit and single-flight; uncertain retry preserves its request UUID',async()=>{
 const h=harness();h.api.render(snapshot());h.click('start');h.click('start');
 assert.equal(h.calls.requests.length,1);const first=h.calls.requests[0];
 assert.equal(first.path,'/api/arcade/start');assert.match(first.body.requestId,/^[a-f0-9-]{36}$/);
 first.reject(new Error('连接中断'));await flush();
 assert.equal(h.calls.requests[1].path,'/api/arcade');h.calls.requests[1].resolve(snapshot({now:time(200)}));await flush();
 h.click('start');assert.deepEqual(h.calls.requests[2].body,first.body);
 h.calls.requests[2].resolve(snapshot({now:time(300),active:game(),used:1,available:3}));await flush();
 assert.ok(h.element('arcade-play'));assert.equal(h.document.activeElement?.getAttribute('aria-label'),'雾中寻路棋盘，方向键或 WASD 移动');
});
test('the same focused mirror survives both pending and completed server moves',async()=>{
 const h=harness();h.api.render(snapshot({active:game('mirrors')}));
 const original=h.select('[data-arcade-mirror="0"]');assert.equal(h.calls.requests.length,1);
 assert.deepEqual(h.calls.requests[0].body.move,{mirrorId:0});
 const next=game('mirrors',{version:2,steps:1});next.state.mirrors[0].orientation='\\';
 h.calls.requests[0].resolve(snapshot({now:time(200),active:next}));await flush();
 assert.equal(h.document.activeElement?.getAttribute('data-arcade-mirror'),'0');
 assert.notEqual(h.document.activeElement,original);assert.equal(h.document.activeElement.disabled,false);
 assert.equal(h.calls.sounds[0].cue,'arcadeMirror');
});
test('trail keyboard remains usable for successive moves, leaving disables its keyboard handling',async()=>{
 const h=harness();h.api.render(snapshot({active:game()}));const board=h.document.querySelector('.arcade-board');board.focus();
 h.fire('keydown',board,{key:'ArrowRight'});assert.equal(h.calls.requests.length,1);
 const next=game('trail',{version:2,steps:1});next.state.player={x:1,y:1};
 h.calls.requests[0].resolve(snapshot({now:time(200),active:next}));await flush();
 h.fire('keydown',h.document.activeElement,{key:'w'});assert.equal(h.calls.requests.length,2);
 h.calls.requests[1].resolve(snapshot({now:time(300),active:game('trail',{version:3,steps:2})}));await flush();
 h.api.leave();h.fire('keydown',h.document.activeElement,{key:'ArrowRight'});assert.equal(h.calls.requests.length,2);assert.equal(h.timers.size,0);
});
test('garden keyboard selects hand then places a tile and restores focus to another empty cell',async()=>{
 const h=harness();h.api.render(snapshot({active:game('garden')}));const board=h.document.querySelector('.arcade-board');board.focus();
 h.fire('keydown',board,{key:'3'});h.select('[data-arcade-cell="0,1"]');
 assert.deepEqual(h.calls.requests[0].body.move,{handIndex:2,x:0,y:1});
 const next=game('garden',{version:2,steps:1});next.state.cells[1][0]='stone';next.state.placements=1;
 h.calls.requests[0].resolve(snapshot({now:time(200),active:next}));await flush();
 assert.ok(h.document.activeElement?.getAttribute('data-arcade-cell'));assert.equal(h.document.activeElement.disabled,false);
 assert.notEqual(h.document.activeElement.getAttribute('data-arcade-cell'),'0,1');
});
test('unchanged polling leaves game board, controls and focused mirror intact',()=>{
 const h=harness();h.api.render(snapshot({active:game('mirrors')}));const mirror=h.document.querySelector('[data-arcade-mirror="1"]');mirror.focus();
 const board=h.element('arcade-board-host'),writes=board.writes;
 h.api.render(snapshot({now:time(900),active:game('mirrors')}));
 assert.equal(board.writes,writes);assert.equal(h.document.activeElement,mirror);
 assert.equal(h.document.querySelectorAll('.arcade-mirror-edge').length,2);
});
test('earlier microseconds and lower versions never roll a board backwards',()=>{
 const h=harness();h.api.render(snapshot({now:time(900),active:game('mirrors',{version:4,steps:3})}));
 const mark=h.element('arcade-step-label').textContent;
 h.api.render(snapshot({now:time(899),active:game('mirrors',{version:3,steps:2})}));
 h.api.render(snapshot({now:time(950),active:game('mirrors',{version:2,steps:1})}));
 assert.equal(h.element('arcade-step-label').textContent,mark);
});
test('late active polling cannot revive a settled game or replay its reward sound',()=>{
 const h=harness();h.api.render(snapshot({active:game()}));
 const result=game('trail',{status:'won',version:3,result:{won:true,score:90,medal:2,coins:12,diamonds:1,reason:'带着青晶回到归航门。'}});
 h.api.render(snapshot({now:time(300),lastResult:result,history:[result]}));
 assert.match(h.element('arcade-content').innerHTML,/本次实际获得/);assert.equal(h.calls.sounds.length,1);
 h.api.render(snapshot({now:time(400),active:game('trail',{version:2})}));
 assert.equal(h.element('arcade-play'),null);assert.equal(h.calls.sounds.length,1);
 h.api.render(snapshot({now:time(500),lastResult:result,history:[result]}));assert.equal(h.calls.sounds.length,1);
});
test('abandon has an inline confirmation and cancel spends no extra opportunity',async()=>{
 const h=harness();h.api.render(snapshot({active:game()}));h.click('abandon');
 assert.match(h.element('arcade-abandon').innerHTML,/不会返还/);assert.equal(h.calls.requests.length,0);
 h.click('cancel-abandon');assert.equal(h.element('arcade-abandon').innerHTML,'');assert.equal(h.calls.requests.length,0);
 h.click('abandon');h.click('finish');assert.equal(h.calls.requests[0].path,'/api/arcade/finish');
 assert.deepEqual(h.calls.requests[0].body,{id:game().id,version:1});
});
test('deadline is monotonic across repeated polls and expiration queries only once',async()=>{
 const h=harness();h.api.render(snapshot({active:game()}));h.advance(239000);
 assert.equal(h.element('arcade-countdown').textContent,'0:01');
 h.api.render(snapshot({now:time(100),active:game()}));assert.equal(h.element('arcade-countdown').textContent,'0:01');
 h.advance(1000);assert.equal(h.calls.requests.length,1);assert.equal(h.calls.requests[0].path,'/api/arcade');
 h.calls.requests[0].reject(new Error('offline'));await flush();h.advance(5000);h.advance(5000);
 assert.equal(h.calls.requests.length,1);assert.match(h.element('arcade-error').innerHTML,/时间已经结束/);
 h.click('reload');assert.equal(h.calls.requests.length,2);
});
test('move rejection reloads authoritative state while preserving its useful explanation',async()=>{
 const h=harness();h.api.render(snapshot({active:game()}));h.select('[data-arcade-direction="up"]');
 h.calls.requests[0].reject(new Error('前面是一块岩石。'));await flush();
 assert.equal(h.calls.requests[1].path,'/api/arcade');h.calls.requests[1].resolve(snapshot({now:time(200),active:game()}));await flush();
 assert.match(h.element('arcade-error').innerHTML,/前面是一块岩石/);
 assert.equal(h.document.activeElement?.getAttribute('data-arcade-direction'),'up');
});
test('authoritative daily ticket issuance remains capped separately from stored balance',()=>{
 const h=harness();h.api.render(snapshot({earned:8,used:11,available:0,nextTicketMinutes:0,canPlay:false,playsRemaining:0}));
 assert.match(h.element('arcade-pill-meta').textContent,/明天再来/);
 assert.doesNotMatch(h.element('arcade-top').innerHTML,/还差 0 分钟/);
 assert.equal(h.document.querySelector('[data-arcade-action="start"]').disabled,true);
});
test('motion preference disables scene animation and untrusted venue text is escaped',()=>{
 const h=harness();const s=snapshot();s.venues[0].description='<img src=x onerror=alert(1)>';
 h.api.render(s,{motion:false});assert.equal(h.element('arcade-shell').classList.contains('reduced-motion'),true);
 assert.match(h.element('arcade-content').innerHTML,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(h.element('arcade-content').innerHTML,/<img src=x/);
});
test('a finished garden shows its real planted board as a read-only postcard',()=>{
 const h=harness();h.api.render(snapshot({active:game('garden')}));
 const finished=game('garden',{status:'won',version:16,endedAt:'2026-09-25T20:02:00+08:00',result:{won:true,score:126,medal:2,coins:12,diamonds:1,reason:'花园已经种好。'}});
 finished.state.cells[2][2]='grove';
 h.api.render(snapshot({now:time(500),lastResult:finished,history:[finished]}));
 const postcard=h.document.querySelector('.arcade-postcard');assert.ok(postcard);
 assert.match(h.element('arcade-content').innerHTML,/你亲手安放的小花园/);assert.match(h.element('arcade-content').innerHTML,/#83b79338/);
 assert.equal(postcard.querySelectorAll('button').length,0);
 assert.equal(h.document.querySelectorAll('[data-arcade-cell]').length,0);
 assert.equal(h.document.querySelectorAll('[data-arcade-mirror]').length,0);
});
test('the album keeps only 14 unique completed sessions and preserves the exact expanded memory',()=>{
 const h=harness();const finished=n=>game(n%2?'garden':'mirrors',{id:`memory-${n}`,status:'won',result:{won:true,score:n+80,medal:1,coins:12,diamonds:1,reason:'留下了风景。'}});
 const history=[game(),...Array.from({length:20},(_,n)=>finished(n))];history.splice(4,0,history[2]);
 h.api.render(snapshot({history,lastResult:history[1]}));
 assert.equal(h.document.querySelectorAll('[data-arcade-memory]').length,14);
 const album=h.document.querySelector('.arcade-album');album.open=true;
 h.document.querySelector('[data-arcade-memory="memory-1"]').open=true;
 const next=copy(history);next[2].result.reason='更新后的旅途记录。';
 h.api.render(snapshot({now:time(200),history:next,lastResult:next[1]}));
 assert.equal(h.document.querySelector('.arcade-album').open,true);
 assert.equal(h.document.querySelector('[data-arcade-memory="memory-1"]').open,true);
 assert.equal(h.document.querySelector('[data-arcade-memory="memory-2"]').open,false);
 assert.equal(h.document.querySelectorAll('[data-arcade-cell]').length,0);
 assert.equal(h.document.querySelectorAll('[data-arcade-memory="'+game().id+'"]').length,0);
});
test('zero reward receipts explain expiry separately from the daily cap',()=>{
 const expired=game('trail',{status:'expired',result:{won:false,score:12,medal:0,coins:0,diamonds:0,reason:'时间到了。'}});
 const h=harness();h.api.render(snapshot({lastResult:expired}));
 assert.match(h.element('arcade-content').innerHTML,/时间已到，本次不发放奖励/);
 const capped=game('garden',{status:'won',result:{won:true,score:126,medal:2,coins:0,diamonds:0,reason:'已通关。'}});
 h.api.render(snapshot({now:time(200),lastResult:capped}));
 assert.match(h.element('arcade-content').innerHTML,/今日游戏奖励额度已用满，成绩照常保存/);
});

function survivorHarness(){
 const runs={mounts:0,updates:[],suspended:0,destroyed:0,options:null};
 const module={scene:()=>'<svg></svg>',rules:()=>'<p>走位与升级</p>',postcard:()=>'<figure>幸存者战报</figure>',
 mount(host,session,options){runs.mounts++;runs.options=options;},update(s){runs.updates.push(copy(s));},suspend(){runs.suspended++;},destroy(){runs.destroyed++;}};
 const a={...game(),type:'survivor',venue:'star-survivor',state:{phase:'playing',time:1,message:'守住星海'}};
 const snap=(patch={})=>snapshot({active:a,venues:[{id:'star-survivor',name:'星海幸存者',type:'survivor',description:'怪潮与升级'},...copy(venues)],purchased:0,purchaseRemaining:3,purchasePrice:50,collection:{weapons:[],evolutions:[]},...patch});
 return {...harness({FocusSurvivor:module}),runs,a,snap};
}
test('survivor sends compact versioned pulses without refreshing wallet every frame',async()=>{
 const h=survivorHarness();h.api.render(h.snap());const host=h.element('survivor-host');
 const sending=h.runs.options.send({kind:'tick',dx:1,dy:0,speed:2});
 assert.equal(h.calls.requests.length,1);assert.equal(h.calls.requests[0].path,'/api/arcade/pulse');
 assert.deepEqual(h.calls.requests[0].body,{id:h.a.id,version:1,move:{kind:'tick',dx:1,dy:0,speed:2}});
 await h.runs.options.send({kind:'tick',dx:0,dy:1,speed:1});assert.equal(h.calls.requests.length,1);
 h.calls.requests[0].resolve({compact:true,now:time(200),active:{...h.a,version:2,state:{...h.a.state,time:1.2}}});await sending;
 assert.equal(h.element('survivor-host'),host);assert.equal(h.runs.updates.at(-1).version,2);assert.equal(h.calls.refresh.length,0);
});
test('leaving, abandon confirmation and expiry suspend survivor input',async()=>{
 const h=survivorHarness();h.api.render(h.snap());h.api.leave();
 await h.runs.options.send({kind:'tick',dx:1,dy:0});assert.equal(h.calls.requests.length,0);assert.ok(h.runs.suspended);
 h.api.enter();h.click('abandon');await h.runs.options.send({kind:'tick',dx:1,dy:0});assert.equal(h.calls.requests.length,0);
 h.click('cancel-abandon');h.advance(240000);await h.runs.options.send({kind:'tick',dx:1,dy:0});assert.equal(h.calls.requests.filter(r=>r.path==='/api/arcade/pulse').length,0);
});
test('survivor termination cleans runtime and shows actual reward receipt',async()=>{
 const h=survivorHarness();h.api.render(h.snap());
 const sending=h.runs.options.send({kind:'tick',dx:0,dy:0,speed:1});
 const ended={...h.a,status:'won',version:3,result:{won:true,score:1200,medal:3,coins:12,diamonds:1,reason:'守住了星海。'}};
 h.calls.requests[0].resolve(h.snap({now:time(300),active:null,lastResult:ended,history:[ended]}));await sending;
 assert.ok(h.runs.destroyed);assert.match(h.element('arcade-content').innerHTML,/幸存者战报/);assert.equal(h.calls.refresh.length,1);
 h.click('back');assert.match(h.element('arcade-content').innerHTML,/星海兵器谱/);assert.doesNotMatch(h.element('arcade-content').innerHTML,/星船远征|符文骰局/);
});
test('purchased admission is explicit, single flight and keeps idempotency after a lost response',async()=>{
 const h=survivorHarness();h.api.render(h.snap({active:null}));h.click('buy-ticket');
 const first=h.calls.requests[0];assert.equal(first.path,'/api/arcade/tickets/buy');assert.match(first.body.requestId,/^[a-f0-9-]{36}$/);
 h.click('buy-ticket');assert.equal(h.calls.requests.length,1);
 first.reject(new Error('连接中断'));await flush();h.calls.requests[1].resolve(h.snap({active:null,now:time(200)}));await flush();
 h.click('buy-ticket');assert.deepEqual(h.calls.requests[2].body,first.body);
 h.calls.requests[2].resolve(h.snap({active:null,now:time(300),purchased:1,purchaseRemaining:2,available:5}));await flush();
 assert.match(h.element('arcade-top').innerHTML,/今日还可购 2 张/);assert.equal(h.calls.toasts.length,1);
});
test('eight study tickets plus three purchased tickets remain visible and purchasable only to cap',()=>{
 const h=survivorHarness();h.api.render(h.snap({active:null,earned:8,used:8,purchased:3,purchaseRemaining:0,available:3}));
 assert.equal(h.document.querySelector('[data-arcade-action="buy-ticket"]').disabled,true);
 assert.equal(h.document.querySelector('[data-arcade-action="start"]').disabled,false);assert.match(h.element('arcade-top').innerHTML,/11/);
});
test('uncertain purchase UUID is discarded across the local day boundary',async()=>{
 const h=survivorHarness();h.api.render(h.snap({active:null}));h.click('buy-ticket');const first=h.calls.requests[0];
 first.reject(new Error('offline'));await flush();h.calls.requests[1].resolve(h.snap({active:null,now:time(200),purchased:3,purchaseRemaining:0}));await flush();
 h.api.render(h.snap({active:null,today:'2026-09-26',now:'2026-09-26T08:00:00+08:00',purchased:0,purchaseRemaining:3}));h.click('buy-ticket');
 assert.notEqual(h.calls.requests[2].body.requestId,first.body.requestId);
});
test('a recovered pulse resolves without replaying the uncertain input; root busy asks runtime to retry',async()=>{
 const h=survivorHarness();h.api.render(h.snap());
 const first=h.runs.options.send({kind:'upgrade',id:'weapon:bolt'});
 assert.equal((await h.runs.options.send({kind:'pause',paused:true})).retry,true);
 h.calls.requests[0].reject(new Error('response lost'));await flush();
 assert.equal(h.calls.requests[1].path,'/api/arcade');
 h.calls.requests[1].resolve(h.snap({now:time(300),active:{...h.a,version:2}}));assert.equal((await first).recovered,true);
 assert.equal(h.calls.requests.length,2);assert.equal(h.element('arcade-error').innerHTML,'');
});

test('long-lived game response deduplication keeps a bounded recent-session cache',()=>{
 const sets=[];class ObservedSet extends Set{constructor(values){super(values);sets.push(this);}}
 const h=harness({Set:ObservedSet});const history=Array.from({length:600},(_,i)=>game('trail',{id:'finished-'+i,status:'won',result:{won:true,coins:12,diamonds:1,medal:1,score:20}}));
 h.api.render(snapshot({now:time(100),history,lastResult:history.at(-1)}));const dedup=sets.find(s=>s.has('finished-599'));assert.ok(dedup);assert.equal(dedup.size,256);
 h.api.render(snapshot({now:time(200),active:game('trail',{id:'finished-599'})}));assert.equal(h.element('arcade-play'),null);
});

test('native-occluded active games stop their clock and settle an elapsed deadline immediately on return',async()=>{
 const h=harness();h.api.render(snapshot({active:game()}));assert.equal(h.timers.size,1);const old=[...h.timers.values()];
 h.nativeVisibility(false);assert.equal(h.timers.size,0);h.api.render(snapshot({now:time(200),active:game()}));assert.equal(h.timers.size,0);
 h.advance(300000);for(const callback of old)callback();assert.equal(h.calls.requests.length,0);
 h.nativeVisibility(true);assert.equal(h.element('arcade-countdown').textContent,'0:00');assert.equal(h.calls.requests.length,1);assert.equal(h.calls.requests[0].path,'/api/arcade');
 h.nativeVisibility(true);h.documentVisibility(true);assert.equal(h.timers.size,1);assert.equal(h.calls.requests.length,1);
 const finished=game('trail',{status:'expired',result:{won:false,coins:0,diamonds:0,medal:0,reason:'休息结束'}});
 h.calls.requests[0].resolve(snapshot({now:'2026-09-25T20:05:00+08:00',active:null,lastResult:finished,history:[finished]}));await flush();assert.equal(h.timers.size,0);assert.equal(h.calls.requests.filter(r=>r.path.includes('/start')).length,0);
});
test('browser visibility and repeated native wake signals never multiply an active game clock',()=>{
 const h=harness();h.api.render(snapshot({active:game()}));const first=[...h.timers.keys()];h.api.render(snapshot({now:time(200),active:game()}));assert.deepEqual([...h.timers.keys()],first);
 h.documentVisibility(false);assert.equal(h.timers.size,0);h.nativeVisibility(false);h.documentVisibility(true);assert.equal(h.timers.size,0);
 for(let i=0;i<100;i++){h.nativeVisibility(true);h.nativeVisibility(true);assert.equal(h.timers.size,1);h.nativeVisibility(false);assert.equal(h.timers.size,0);}
 h.nativeVisibility(true);h.api.leave();assert.equal(h.timers.size,0);h.nativeVisibility(false);h.nativeVisibility(true);assert.equal(h.timers.size,0);assert.equal(h.calls.requests.length,0);
});


test('permanent play ticket stock is displayed without a daily balance denominator or fixed stock dots',()=>{
 const h=harness();h.api.render(snapshot({revision:20,available:31,earned:2,purchased:1,used:5,canPlay:true,playsRemaining:6,persistentTickets:true,rules:{...snapshot().rules,maxDailyPlays:11}}));
 const html=h.element('arcade-top').innerHTML;assert.match(html,/累计游玩券/);assert.match(html,/<strong>31<small> 张<\/small><\/strong>/);assert.match(html,/永久保留 · 可游玩，也可兑换抽奖券/);assert.doesNotMatch(html,/今日游玩券|arcade-ticket-dots/);
 assert.match(html,/今日学习赠券.*2 \/ 8 张/s);assert.match(html,/width:25%/);assert.match(html,/今日已出发 <b>5 \/ 11 次/);assert.match(html,/还可出发 6 次/);assert.match(h.element('arcade-content').innerHTML,/游玩券跨日永久保留/);assert.match(h.element('arcade-content').innerHTML,/2 张换 1 张金币抽奖券，4 张换 1 张钻石抽奖券/);assert.doesNotMatch(h.element('arcade-content').innerHTML,/当日有效|当天到期/);
});

test('a large persistent balance cannot bypass the authoritative daily admission limit',()=>{
 const h=harness();h.api.render(snapshot({revision:20,available:31,earned:8,used:11,canPlay:false,playsRemaining:0,purchaseRemaining:3,purchased:0,persistentTickets:true,rules:{...snapshot().rules,maxDailyPlays:11}}));
 assert.equal(h.document.querySelector('[data-arcade-action="start"]').disabled,true);assert.match(h.element('arcade-content').innerHTML,/今日出发次数已用满/);assert.match(h.element('arcade-pill-meta').textContent,/游玩券会为你留着/);
 h.click('start');assert.equal(h.calls.requests.length,0);assert.equal(h.document.querySelector('[data-arcade-action="buy-ticket"]').disabled,false);
});

test('spending older play tickets does not visually exhaust today learning issuance',()=>{
 const h=harness();h.api.render(snapshot({available:30,earned:2,used:10,purchased:0,canPlay:true,playsRemaining:1,persistentTickets:true}));
 assert.match(h.element('arcade-top').innerHTML,/今日学习赠券.*2 \/ 8 张/s);assert.match(h.element('arcade-top').innerHTML,/下一张还差 30 分钟/);assert.doesNotMatch(h.element('arcade-top').innerHTML,/今日学习赠券已全部获得/);assert.equal(h.document.querySelector('[data-arcade-action="start"]').disabled,false);
});

test('higher arcade revisions accept exchanged balances and stale revisions cannot refill them even with later timestamps',()=>{
 const h=harness();h.api.render(snapshot({revision:20,now:time(900),available:31,persistentTickets:true}));
 h.api.render(snapshot({revision:21,now:time(800),available:29,persistentTickets:true}));assert.match(h.element('arcade-top').innerHTML,/<strong>29<small> 张/);
 h.api.render(snapshot({revision:20,now:time(999),available:31,persistentTickets:true}));assert.match(h.element('arcade-top').innerHTML,/<strong>29<small> 张/);assert.doesNotMatch(h.element('arcade-top').innerHTML,/<strong>31<small> 张/);
});

test('an external balance update queued during a request wins over its older receipt',async()=>{
 const h=harness();h.api.render(snapshot({revision:20,available:31,persistentTickets:true}));h.click('start');
 h.api.render(snapshot({revision:22,now:time(300),available:28,active:game('trail',{version:2}),persistentTickets:true}));
 h.api.render(snapshot({revision:21,now:time(400),available:30,active:game('trail',{version:1}),persistentTickets:true}));
 h.calls.requests[0].resolve(snapshot({revision:21,now:time(500),available:30,active:game('trail',{version:1}),persistentTickets:true}));await flush();
 assert.match(h.element('arcade-top').innerHTML,/<strong>28<small> 张/);h.api.render(snapshot({revision:21,now:time(999),available:30,active:game('trail',{version:1}),persistentTickets:true}));assert.match(h.element('arcade-top').innerHTML,/<strong>28<small> 张/);
});

test('stored play tickets survive a day change while issuance, purchases and admission limits reset independently',()=>{
 const h=harness();h.api.render(snapshot({revision:20,available:31,earned:8,used:11,purchased:3,purchaseRemaining:0,canPlay:false,playsRemaining:0,persistentTickets:true}));
 h.api.render(snapshot({revision:21,today:'2026-09-26',now:'2026-09-26T08:00:00+08:00',available:31,earned:0,used:0,purchased:0,purchaseRemaining:3,canPlay:true,playsRemaining:11,persistentTickets:true}));
 assert.match(h.element('arcade-top').innerHTML,/<strong>31<small> 张/);assert.match(h.element('arcade-top').innerHTML,/今日学习赠券.*0 \/ 8 张/s);assert.match(h.element('arcade-top').innerHTML,/今日已出发 <b>0 \/ 11 次/);assert.equal(h.document.querySelector('[data-arcade-action="start"]').disabled,false);assert.equal(h.document.querySelector('[data-arcade-action="buy-ticket"]').disabled,false);
});

test('the daily admission cap does not stop input in a game already started',()=>{
 const h=harness();h.api.render(snapshot({revision:20,active:game(),available:30,used:11,canPlay:false,playsRemaining:0,persistentTickets:true}));const board=h.document.querySelector('.arcade-board');board.focus();h.fire('keydown',board,{key:'ArrowRight'});
 assert.equal(h.calls.requests.length,1);assert.equal(h.calls.requests[0].path,'/api/arcade/move');
});


test('compact survivor replies preserve authoritative exchanged ticket stock and reject an older queued receipt',async()=>{
 const h=survivorHarness();h.api.render(h.snap({revision:20,available:31,persistentTickets:true,used:1,playsRemaining:10,canPlay:true}));
 const sending=h.runs.options.send({kind:'tick',dx:1,dy:0,speed:1});
 h.api.render(h.snap({revision:21,now:time(200),available:29,persistentTickets:true,used:1,playsRemaining:10,canPlay:true}));
 h.calls.requests[0].resolve({compact:true,revision:22,now:time(300),available:29,persistentTickets:true,used:1,playsRemaining:10,canPlay:true,active:{...h.a,version:2,state:{...h.a.state,time:1.2}}});await sending;
 assert.match(h.element('arcade-top').innerHTML,/<strong>29<small> 张/);assert.equal(h.runs.updates.at(-1).version,2);
 h.api.render(h.snap({revision:21,now:time(400),available:31,persistentTickets:true,active:{...h.a,version:2}}));assert.match(h.element('arcade-top').innerHTML,/<strong>29<small> 张/);
});
