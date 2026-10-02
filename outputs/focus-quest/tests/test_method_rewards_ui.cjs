const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../static/method-rewards.js'),'utf8');
const day='2026-09-28';
const copy=value=>JSON.parse(JSON.stringify(value));
const names={math:'数学',cs:'408',politics:'政治',english:'英语'};
function snapshot({date=day,today=day,metrics={},claimed=[]}={}){
  const subjects=Object.keys(names).map(id=>{
    const m={lecture:20,practice:30,other:0,...metrics[id]};
    const reward=(tier,eligible)=>({id:tier,name:tier==='practice'?'落笔试锋':'学以致用',eligible,available:date===today&&eligible&&!claimed.includes(`${id}:${tier}`),claimed:claimed.includes(`${id}:${tier}`),claimedAt:null,reward:{coins:tier==='practice'?20:40,diamonds:tier==='practice'?0:1}});
    return {id,name:names[id],color:'#96cbb7',...m,rewards:[reward('practice',m.practice>=20),reward('mastery',(m.lecture>=20&&m.practice>=30)||m.practice>=60)]};
  });
  return {date,today,methodRewards:{day:date,today,isToday:date===today,subjects,availableCount:subjects.reduce((n,s)=>n+s.rewards.filter(r=>r.available).length,0),dailyCap:{coins:240,diamonds:4}}};
}
function receipt(subject='math',tier='practice',patch={}){
  return {day,subject,tier,methodRewards:snapshot({claimed:[`${subject}:${tier}`]}).methodRewards,reward:{coins:tier==='practice'?20:40,diamonds:tier==='practice'?0:1},wallet:{coins:900,diamonds:10},alreadyClaimed:false,now:day+'T20:00:00+08:00',...patch};
}
function bonusSnapshot(options={}){
  const state=snapshot(options),rewards=state.methodRewards.subjects.flatMap(s=>s.rewards);
  const completedCount=rewards.filter(r=>r.eligible).length,claimed=Boolean(options.bonusClaimed);
  state.methodRewards.completionBonus={name:'融会贯通',completedCount,requiredCount:8,eligible:completedCount===8,
    available:state.date===state.today&&completedCount===8&&!claimed,claimed,claimedAt:null,reward:{coins:200,diamonds:4},lotteryTickets:options.lotteryTickets===undefined?{coinTickets:1,diamondTickets:1}:options.lotteryTickets};
  state.methodRewards.availableCount+=Number(state.methodRewards.completionBonus.available);
  state.methodRewards.dailyCap={coins:440,diamonds:8};
  return state;
}
function bonusReceipt(patch={}){
  return receipt('all','completion',{methodRewards:bonusSnapshot({bonusClaimed:true}).methodRewards,reward:{coins:200,diamonds:4},wallet:{coins:1200,diamonds:14},lotteryTickets:{coinTickets:1,diamondTickets:1},ticketGrants:[{machine:'coin',count:1,source:'method-completion'},{machine:'diamond',count:1,source:'method-completion'}],...patch});
}
function harness(initial=snapshot()){
  const document={hidden:false,activeElement:null};let active=true,refreshFails=false,settings=0,unlocks=0;
  const requests=[],receipts=[],sounds=[],toasts=[],refreshes=[];
  class Element{
    constructor(parent=null){this.parentElement=parent;this.dataset={};this.attributes={};this.listeners={};this.children=[];this.hidden=false;this.inert=false;this.writes=0;this._html='';}
    set innerHTML(value){this._html=value;this.writes++;this.children=[];
      for(const [,attrs] of value.matchAll(/<button\b([^>]+)>/g)){
        const child=new Element(this);
        for(const [,name,val] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)){child.attributes[name]=val;if(name.startsWith('data-'))child.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=val;}
        this.children.push(child);
      }
    }
    get innerHTML(){return this._html;}
    contains(node){return node===this||this.children.includes(node);}
    closest(selector){return selector==='[data-method-focus]'&&this.dataset.methodFocus?this:null;}
    querySelector(selector){const focus=selector.match(/data-method-focus="([^"]+)"/)?.[1];return this.children.find(n=>focus?n.dataset.methodFocus===focus:selector==='[data-method-focus]')||null;}
    focus(){document.activeElement=this;}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  }
  const host=new Element(),parent=new Element();host.parentElement=parent;
  document.getElementById=id=>id==='method-rewards'?host:null;
  const context=vm.createContext({document,FocusMethodArt:{avatar:()=>'<svg class="method-mentor-art" viewBox="0 0 200 180"></svg>'}});vm.runInContext(source,context);
  const api=context.FocusMethodRewards;
  api.init({api:(path,body)=>new Promise((resolve,reject)=>requests.push({path,body:copy(body),resolve,reject})),isVisible:()=>active,
    acceptReceipt:r=>receipts.push(r),playSound:(...args)=>sounds.push(copy(args)),toast:(...args)=>toasts.push(args),unlock:()=>unlocks++,openMethods:()=>settings++,
    refresh:async(...args)=>{refreshes.push(args);if(refreshFails)throw new Error('refresh offline');}});
  api.render(initial);
  const button=id=>host.querySelector(`[data-method-focus="${id}"]`);
  function emit(id,patch={}){const target=button(id);assert.ok(target,id);const event={target,button:0,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...patch};for(const fn of host.listeners.click||[])fn(event);return event;}
  async function flush(){for(let i=0;i<8;i++)await Promise.resolve();}
  return {api,context,host,parent,document,requests,receipts,sounds,toasts,refreshes,button,emit,flush,get settings(){return settings;},get unlocks(){return unlocks;},set active(v){active=v;},set refreshFails(v){refreshFails=v;}};
}

test('embedded workshop provides four subjects, two native buttons per subject, precise rules and the mentor',()=>{
  const h=harness();
  assert.equal((h.host.innerHTML.match(/data-method-subject=/g)||[]).length,4);
  assert.equal((h.host.innerHTML.match(/data-method-claim=/g)||[]).length,8);
  assert.match(h.host.innerHTML,/知行研习所/);assert.match(h.host.innerHTML,/研习导师 · 砚青/);assert.match(h.host.innerHTML,/method-mentor-art/);
  assert.match(h.host.innerHTML,/纯做题满 60 分钟可领齐两份/);assert.match(h.host.innerHTML,/240 金币、4 钻石/);
  for(const b of h.host.children)assert.equal(b.attributes.type,'button');
  assert.equal(h.button('math:practice').attributes['aria-disabled'],'false');
  h.emit('settings');assert.equal(h.settings,1);assert.equal(h.requests.length,0);
  assert.doesNotMatch(h.host.innerHTML,/<dialog|data-view=/);
});

test('same poll preserves DOM and keyboard focus; a genuine redraw restores the same action',()=>{
  const h=harness(),node=h.button('math:practice'),writes=h.host.writes;node.focus();
  for(let i=0;i<30;i++)h.api.render(copy(snapshot()));
  assert.equal(h.host.writes,writes);assert.equal(h.button('math:practice'),node);assert.equal(h.document.activeElement,node);
  h.api.render(snapshot({metrics:{math:{practice:35}}}));assert.notEqual(h.button('math:practice'),node);assert.equal(h.document.activeElement,h.button('math:practice'));
});

test('claims serialize all buttons and accept an authoritative receipt without replaying on stale polls',async()=>{
  const h=harness();h.button('math:practice').focus();h.emit('math:practice');h.emit('math:practice');h.emit('cs:mastery');
  assert.equal(h.requests.length,1);assert.equal(h.unlocks,1);
  assert.deepEqual(h.requests[0].body,{day,subject:'math',tier:'practice'});assert.equal(h.requests[0].path,'/api/method-rewards/claim');
  assert.ok(h.host.children.filter(b=>b.dataset.methodClaim).every(b=>b.attributes['aria-disabled']==='true'));
  h.requests[0].resolve(receipt());await h.flush();
  assert.equal(h.receipts.length,1);assert.equal(h.refreshes.length,1);assert.deepEqual(h.sounds,[['delivery',{key:`method-reward:${day}:math:practice`}]]);
  assert.match(h.button('math:practice').attributes['aria-label'],/已领取/);assert.equal(h.document.activeElement,h.button('math:practice'));
  h.api.render(snapshot());h.emit('math:practice');assert.equal(h.requests.length,1);assert.match(h.button('math:practice').attributes['aria-label'],/已领取/);
  assert.match(h.host.innerHTML,/7 份奖励可领取/);
});

test('history is readable but never claims even with malformed today flags or available=true',()=>{
  const h=harness(snapshot({date:'2026-09-27'}));h.emit('math:practice');
  assert.equal(h.requests.length,0);assert.match(h.host.innerHTML,/历史记录 · 只读/);assert.match(h.host.innerHTML,/那天已经完成了这一步/);
  const invalid=snapshot();invalid.methodRewards.day='2026-09-27';h.api.render(invalid);h.emit('math:practice');assert.equal(h.requests.length,0);
  invalid.methodRewards.day=day;invalid.methodRewards.isToday=false;h.api.render(invalid);h.emit('math:practice');assert.equal(h.requests.length,0);
});

test('pure practice can complete both stages without lectures, while display rounding never makes eligibility',()=>{
  const h=harness(snapshot({metrics:{math:{lecture:0,practice:60},cs:{lecture:100,practice:19+59/60},politics:{lecture:0,practice:59+59/60}}}));
  assert.equal(h.button('math:practice').attributes['aria-disabled'],'false');assert.equal(h.button('math:mastery').attributes['aria-disabled'],'false');
  assert.equal(h.button('cs:practice').attributes['aria-disabled'],'true');assert.equal(h.button('politics:mastery').attributes['aria-disabled'],'true');
  assert.match(h.host.innerHTML,/19 分钟 59 秒/);assert.match(h.host.innerHTML,/不到 1 分钟/);
  h.emit('cs:practice');h.emit('politics:mastery');assert.equal(h.requests.length,0);
  const backendHold=snapshot();backendHold.methodRewards.subjects[0].rewards[0].eligible=false;h.api.render(backendHold);h.emit('math:practice');assert.equal(h.requests.length,0);
});

test('mentor responds to lecture-heavy subjects and offers other advice without persistence or reward calls',()=>{
  const h=harness(snapshot({metrics:{math:{lecture:90,practice:0}}}));
  assert.match(h.host.innerHTML,/数学已经听了 1 小时 30 分钟/);assert.match(h.host.innerHTML,/自己写第一步/);
  const first=h.host.innerHTML;h.button('advice').focus();h.emit('advice');assert.notEqual(h.host.innerHTML,first);assert.equal(h.document.activeElement,h.button('advice'));
  assert.equal(h.requests.length,0);
  assert.match(h.host.innerHTML,/背诵、阅读与整理请保留真实分类/);
});

test('hidden views, inactive review and modified clicks cannot claim or open settings',()=>{
  const h=harness();
  for(const patch of [{button:2},{button:1},{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true},{defaultPrevented:true}])h.emit('math:practice',patch);
  h.document.hidden=true;h.emit('math:practice');h.emit('settings');h.document.hidden=false;
  h.active=false;h.emit('math:practice');h.active=true;
  h.parent.hidden=true;h.emit('math:practice');h.parent.hidden=false;
  h.parent.inert=true;h.emit('math:practice');h.parent.inert=false;
  assert.equal(h.requests.length,0);assert.equal(h.settings,0);
});

test('failure or a mismatched receipt leaves the reward retryable, without wallet or sound changes',async()=>{
  const h=harness();h.emit('math:practice');h.requests[0].reject(new Error('断开连接'));await h.flush();
  assert.equal(h.button('math:practice').attributes['aria-disabled'],'false');assert.equal(h.receipts.length,0);assert.equal(h.sounds.length,0);
  h.emit('math:practice');h.requests[1].resolve(receipt('cs'));await h.flush();assert.equal(h.receipts.length,0);assert.match(h.toasts.at(-1)[1],/回执/);
  h.emit('math:practice');h.requests[2].resolve(receipt());await h.flush();assert.equal(h.receipts.length,1);
});

test('server idempotence does not replay rewards and failed refresh cannot resurrect a claim',async()=>{
  const h=harness();h.refreshFails=true;h.emit('math:mastery');h.requests[0].resolve(receipt('math','mastery',{alreadyClaimed:true}));await h.flush();
  assert.equal(h.receipts.length,1);assert.equal(h.sounds.length,0);assert.match(h.toasts.at(-1)[0],/已经收好/);
  h.api.render(snapshot());h.emit('math:mastery');assert.equal(h.requests.length,1);assert.match(h.button('math:mastery').attributes['aria-label'],/已领取/);
});

test('a late receipt after date navigation never overwrites historical content or steals focus',async()=>{
  const h=harness();h.emit('math:practice');const history=snapshot({date:'2026-09-25'});h.api.render(history);
  const outside={};h.document.activeElement=outside;h.requests[0].resolve(receipt());await h.flush();
  assert.match(h.host.innerHTML,/2026-09-25 · 研习回看/);assert.equal(h.document.activeElement,outside);assert.equal(h.receipts.length,1);
  h.api.render(snapshot());assert.match(h.button('math:practice').attributes['aria-label'],/已领取/);
});

test('untrusted subject and tier labels remain text and colors cannot inject style or event handlers',()=>{
  const state=snapshot(),s=state.methodRewards.subjects[0];s.name='<img src=x onerror=alert(1)>';s.color='red" onmouseover="alert(2)';s.rewards[0].name='<script>alert(3)</script>';
  const h=harness(state);assert.doesNotMatch(h.host.innerHTML,/<img|<script|onmouseover=/);assert.match(h.host.innerHTML,/&lt;img/);assert.match(h.host.innerHTML,/&lt;script/);assert.match(h.host.innerHTML,/--method-color:#96cbb7/);
});

test('module mounts once and creates no interval, polling loop, browser storage, or animation work',()=>{
  const h=harness();h.api.init({});assert.equal(h.host.listeners.click.length,1);
  assert.doesNotMatch(source,/setInterval|setTimeout|requestAnimationFrame|localStorage|sessionStorage|addEventListener\('keydown'/);
  const css=fs.readFileSync(require.resolve('../static/method-rewards.css'),'utf8');assert.match(css,/var\(--ui-ink/);assert.match(css,/var\(--ui-surface/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/grid-template-columns:repeat\(4/);assert.match(css,/@media\(max-width:1000px\)/);
});

function combinedSnapshot(options={},extra=[]){
  const state=snapshot(options);
  const rows=state.methodRewards.subjects.map(s=>({id:s.id,name:s.name,lecture:s.lecture,practice:s.practice,other:s.other,
    minutes:s.lecture+s.practice+s.other,advice:{title:`${s.name}按自己的节奏推进`,text:options.date?'这一天的听课与做题时间已记录。':'今天的听课与做题时间已记录。',tone:'neutral'}}));
  const all=[...rows,...extra];
  state.activities={subjects:all,totals:Object.fromEntries(['lecture','practice','other'].map(id=>[id,all.reduce((sum,s)=>sum+s[id],0)])),
    advice:{id:'unclassified',title:'按自己的节奏',text:'背诵与整理也有自己的意义，保留真实分类。'}};
  return state;
}

test('merged workshop preserves all three totals, per-subject other time, observations and unclassified study',()=>{
  const unknown={id:'other',name:'待分类科目',lecture:5,practice:7,other:9,minutes:21,advice:{title:'等待归类',text:'可在设置中给任务指定科目和学习方式。',tone:'neutral'}};
  const h=harness(combinedSnapshot({metrics:{math:{other:15}}},[unknown]));
  const summary=h.host.innerHTML.split('<div class="method-summary"')[1].split('<div class="method-rules"')[0];
  assert.match(summary,/1 小时 25 分钟/);assert.match(summary,/2 小时 7 分钟/);assert.match(summary,/24 分钟/);
  assert.match(h.host.innerHTML,/累计 1 小时 5 分钟/);assert.match(h.host.innerHTML,/<dt>复习 \/ 其他<\/dt><dd>15 分钟/);
  assert.match(h.host.innerHTML,/数学按自己的节奏推进/);assert.match(h.host.innerHTML,/今天的听课与做题时间已记录/);
  assert.match(h.host.innerHTML,/待分类科目/);assert.match(h.host.innerHTML,/累计 21 分钟/);assert.match(h.host.innerHTML,/背诵与整理也有自己的意义/);
  assert.equal((h.host.innerHTML.match(/data-method-subject=/g)||[]).length,4);
  assert.equal((h.host.innerHTML.match(/data-method-claim=/g)||[]).length,8,'unclassified study does not create a new reward subject');
  h.emit('unclassified-settings');assert.equal(h.settings,1);assert.equal(h.requests.length,0);
});

test('new statistics and advice refresh independently of reward eligibility and stable polls preserve focus',()=>{
  const state=combinedSnapshot(),h=harness(state);h.button('settings').focus();const writes=h.host.writes;
  for(let i=0;i<50;i++)h.api.render(copy(state));assert.equal(h.host.writes,writes);
  state.activities.subjects[0].advice={title:'数学听课偏多',text:'先休息、恢复精力；之后再安排练习。',tone:'balance'};
  h.api.render(state);assert.match(h.host.innerHTML,/数学听课偏多/);assert.match(h.host.innerHTML,/先休息、恢复精力/);
  assert.equal(h.document.activeElement,h.button('settings'));
  assert.equal(h.button('math:practice').attributes['aria-disabled'],'false');assert.equal(h.requests.length,0);
  state.activities.totals.other=25;state.activities.advice={id:'lecture-heavy',title:'数学听课偏多',text:state.activities.subjects[0].advice.text};
  h.api.render(state);assert.doesNotMatch(h.host.innerHTML,/class="method-overview"/,'per-subject advice is not repeated below the cards');
});

test('past-day statistics and observations remain dated and rewards stay read-only',()=>{
  const h=harness(combinedSnapshot({date:'2026-09-27',metrics:{math:{lecture:90,practice:10,other:25}}}));
  assert.match(h.host.innerHTML,/2026-09-27 · 研习回看/);assert.match(h.host.innerHTML,/这一天的听课与做题时间已记录/);
  assert.match(h.host.innerHTML,/累计 2 小时 5 分钟/);assert.match(h.host.innerHTML,/<dd>25 分钟/);
  h.emit('math:mastery');assert.equal(h.requests.length,0);h.emit('settings');assert.equal(h.settings,1);
});

test('merged observation and classification text cannot inject markup, class or style',()=>{
  const state=combinedSnapshot({},[{id:'other',name:'<img src=x onerror=alert(1)>',lecture:0,practice:0,other:10,minutes:10,
    advice:{title:'<script>alert(2)</script>',text:'<a href=x>unsafe</a>',tone:'neutral" onclick="alert(3)'}}]);
  state.activities.subjects[0].advice.text='<svg onload=alert(4)>';
  state.activities.advice.text='<iframe src=x>';
  const h=harness(state);
  assert.doesNotMatch(h.host.innerHTML,/<img|<script|<a href|<iframe|onclick=/);
  assert.match(h.host.innerHTML,/&lt;script/);assert.match(h.host.innerHTML,/&lt;svg/);assert.match(h.host.innerHTML,/&lt;iframe/);
});

test('four-subject completion bonus is embedded with progress, reward and one native claim button',()=>{
  const h=harness(bonusSnapshot());
  assert.match(h.host.innerHTML,/融会贯通/);assert.match(h.host.innerHTML,/200 金币/);assert.match(h.host.innerHTML,/4 钻石/);
  assert.match(h.host.innerHTML,/9 份奖励可领取/);assert.match(h.host.innerHTML,/8 \/ 8 档已完成/);
  assert.match(h.host.innerHTML,/不必先领取单科奖励|四科两档研习全部完成/);
  assert.equal(h.button('all:completion').attributes['aria-disabled'],'false');
  assert.equal((h.host.innerHTML.match(/data-method-claim=/g)||[]).length,8);
  assert.equal((h.host.innerHTML.match(/data-method-bonus=/g)||[]).length,1);
});

test('bonus uses server eligibility and cannot claim incomplete, historical or hidden days',()=>{
  const h=harness(bonusSnapshot({metrics:{english:{lecture:0,practice:59+59/60}}}));
  assert.match(h.host.innerHTML,/7 \/ 8 档已完成/);assert.equal(h.button('all:completion').attributes['aria-disabled'],'true');
  h.emit('all:completion');assert.equal(h.requests.length,0);
  const hold=bonusSnapshot();hold.methodRewards.completionBonus.eligible=false;h.api.render(hold);h.emit('all:completion');assert.equal(h.requests.length,0);
  const history=bonusSnapshot({date:'2026-09-27'});history.methodRewards.completionBonus.available=true;
  h.api.render(history);h.emit('all:completion');assert.equal(h.requests.length,0);assert.match(h.host.innerHTML,/已完成 · 历史只读/);
  h.api.render(bonusSnapshot());h.document.hidden=true;h.emit('all:completion');h.document.hidden=false;
  h.active=false;h.emit('all:completion');h.active=true;h.parent.inert=true;h.emit('all:completion');
  assert.equal(h.requests.length,0);
});

test('bonus and regular claims serialize together and a valid receipt survives stale polls and failed refresh',async()=>{
  const h=harness(bonusSnapshot());h.refreshFails=true;h.button('all:completion').focus();
  h.emit('all:completion');h.emit('all:completion');h.emit('math:practice');
  assert.equal(h.requests.length,1);assert.equal(h.button('all:completion').attributes['aria-busy'],'true');
  assert.equal(h.button('math:practice').attributes['aria-disabled'],'true');
  assert.equal(h.requests[0].path,'/api/method-rewards/completion');assert.deepEqual(h.requests[0].body,{day});
  h.requests[0].resolve(bonusReceipt());await h.flush();
  assert.equal(h.receipts.length,1);assert.equal(h.document.activeElement,h.button('all:completion'));
  assert.deepEqual(h.sounds,[['delivery',{key:`method-reward:${day}:all:completion`}]]);
  assert.match(h.toasts.at(-1)[1],/\+200 金币 · \+4 钻石/);
  h.api.render(bonusSnapshot());h.emit('all:completion');assert.equal(h.requests.length,1);
  assert.match(h.button('all:completion').attributes['aria-label'],/已领取/);
  assert.match(h.host.innerHTML,/8 份奖励可领取/);
  h.emit('math:practice');assert.equal(h.requests.length,2,'individual gifts are still available after the bonus');
});

test('bonus failure or incomplete receipts leave it retryable and retries never replay credit sounds',async()=>{
  const h=harness(bonusSnapshot());h.emit('all:completion');h.requests[0].reject(new Error('断开连接'));await h.flush();
  assert.equal(h.receipts.length,0);assert.equal(h.button('all:completion').attributes['aria-disabled'],'false');
  h.emit('all:completion');h.requests[1].resolve(bonusReceipt({methodRewards:snapshot().methodRewards}));await h.flush();
  assert.equal(h.receipts.length,0);assert.match(h.toasts.at(-1)[1],/回执/);
  h.emit('all:completion');h.requests[2].resolve(bonusReceipt({alreadyClaimed:true,reward:{coins:0,diamonds:0}}));await h.flush();
  assert.equal(h.receipts.length,1);assert.equal(h.sounds.length,0);assert.match(h.toasts.at(-1)[0],/已经收好/);
});

test('late bonus receipt preserves selected history and a new day requires a new completion',async()=>{
  const h=harness(bonusSnapshot());h.emit('all:completion');h.api.render(bonusSnapshot({date:'2026-09-27'}));
  const outside={};h.document.activeElement=outside;h.requests[0].resolve(bonusReceipt());await h.flush();
  assert.match(h.host.innerHTML,/2026-09-27 · 研习回看/);assert.equal(h.document.activeElement,outside);
  h.api.render(bonusSnapshot({date:'2026-09-29',today:'2026-09-29',metrics:{english:{lecture:0,practice:0}}}));
  assert.equal(h.button('all:completion').attributes['aria-disabled'],'true');assert.doesNotMatch(h.button('all:completion').attributes['aria-label'],/已领取/);
  h.api.render(bonusSnapshot({date:'2026-09-29',today:'2026-09-29'}));
  assert.equal(h.button('all:completion').attributes['aria-disabled'],'false');
});


test('completion gift previews both ticket kinds in a wrapping reward row without changing its currency prize',()=>{
  const h=harness(bonusSnapshot());
  assert.match(h.host.innerHTML,/class="method-completion-ticket coin"/);assert.match(h.host.innerHTML,/1 张金币抽奖券/);
  assert.match(h.host.innerHTML,/class="method-completion-ticket diamond"/);assert.match(h.host.innerHTML,/1 张钻石抽奖券/);
  assert.match(h.host.innerHTML,/200 金币 <span>· 4 钻石/);assert.match(h.host.innerHTML,/额外赠送的抽奖券/);
  const css=fs.readFileSync(require.resolve('../static/method-rewards.css'),'utf8');
  assert.match(css,/\.method-completion-tickets\{display:flex;flex-wrap:wrap/);assert.match(css,/\.method-completion-reward\{min-width:0;max-width:100%/);
  assert.match(css,/@media\(max-width:850px\).*method-completion-tickets\{justify-content:flex-start\}/);
});

test('completed historical gifts show their actual old ticket counts, including diamond-only and no-ticket receipts',()=>{
  for(const tickets of [{coinTickets:0,diamondTickets:1},{coinTickets:0,diamondTickets:0}]){
    const state=bonusSnapshot({date:'2026-09-27',bonusClaimed:true,lotteryTickets:tickets}),h=harness(state);
    assert.doesNotMatch(h.host.innerHTML,/张金币抽奖券/);assert.equal(h.host.innerHTML.includes('1 张钻石抽奖券'),Boolean(tickets.diamondTickets));
    assert.equal(h.button('all:completion').attributes['aria-disabled'],'true');h.emit('all:completion');assert.equal(h.requests.length,0);
  }
  for(const tickets of [null,{coinTickets:1.5,diamondTickets:1},{coinTickets:-1,diamondTickets:1},{coinTickets:'1',diamondTickets:1},{coinTickets:1,diamondTickets:'<img>'}]){
    const h=harness(bonusSnapshot({lotteryTickets:tickets}));assert.doesNotMatch(h.host.innerHTML,/method-completion-ticket coin|method-completion-ticket diamond|<img|NaN/);
  }
  const old=bonusSnapshot();delete old.methodRewards.completionBonus.lotteryTickets;
  const h=harness(old);assert.doesNotMatch(h.host.innerHTML,/method-completion-tickets|张金币抽奖券|张钻石抽奖券/);
});

test('a fresh mixed completion receipt announces both actual tickets and cannot replay after an older poll',async()=>{
  const h=harness(bonusSnapshot());vm.runInContext(fs.readFileSync(require.resolve('../static/lottery.js'),'utf8'),h.context);
  h.emit('all:completion');h.requests[0].resolve(bonusReceipt());await h.flush();
  assert.equal(h.receipts.length,1);assert.match(h.toasts.at(-1)[1],/\+200 金币 · \+4 钻石 · \+1 金币抽奖券 · \+1 钻石抽奖券/);
  assert.match(h.host.innerHTML,/已收好的抽奖券/);assert.equal(h.sounds.length,1);
  h.api.render(bonusSnapshot());h.emit('all:completion');assert.equal(h.requests.length,1);assert.equal(h.sounds.length,1);
});

test('a partial modern ticket receipt stays retryable until both tickets are confirmed atomically',async()=>{
  const h=harness(bonusSnapshot());h.emit('all:completion');
  h.requests[0].resolve(bonusReceipt({ticketGrants:[{machine:'coin',count:1}]}));await h.flush();
  assert.equal(h.receipts.length,0);assert.equal(h.sounds.length,0);assert.match(h.toasts.at(-1)[1],/回执/);
  assert.equal(h.button('all:completion').attributes['aria-disabled'],'false');
  h.emit('all:completion');h.requests[1].resolve(bonusReceipt());await h.flush();assert.equal(h.receipts.length,1);
});

test('an already-claimed legacy completion returns no new tickets and stale previews cannot invent a coin ticket',async()=>{
  const h=harness(bonusSnapshot());h.emit('all:completion');
  const old=bonusReceipt({alreadyClaimed:true,reward:{coins:0,diamonds:0},lotteryTickets:{coinTickets:0,diamondTickets:0},ticketGrants:[],
    methodRewards:bonusSnapshot({bonusClaimed:true,lotteryTickets:{coinTickets:0,diamondTickets:1}}).methodRewards});
  h.requests[0].resolve(old);await h.flush();assert.equal(h.receipts.length,1);assert.equal(h.sounds.length,0);
  assert.match(h.toasts.at(-1)[0],/已经收好/);assert.doesNotMatch(h.host.innerHTML,/张金币抽奖券/);assert.match(h.host.innerHTML,/1 张钻石抽奖券/);
  h.api.render(bonusSnapshot());assert.doesNotMatch(h.host.innerHTML,/张金币抽奖券/);assert.match(h.host.innerHTML,/1 张钻石抽奖券/);
  h.emit('all:completion');assert.equal(h.requests.length,1);
});

test('a legacy cash-only completion remains claimable without fabricating ticket metadata',async()=>{
  const initial=bonusSnapshot();delete initial.methodRewards.completionBonus.lotteryTickets;
  const h=harness(initial),old=bonusReceipt();delete old.methodRewards.completionBonus.lotteryTickets;delete old.lotteryTickets;delete old.ticketGrants;
  h.emit('all:completion');h.requests[0].resolve(old);await h.flush();assert.equal(h.receipts.length,1);
  assert.doesNotMatch(h.host.innerHTML,/method-completion-tickets|张金币抽奖券|张钻石抽奖券/);
});

function withRounds(state,total=0,{counted=[],baseline=[]}={}){
  state.methodRewards.roundTickets={featureStartMs:100,totalRounds:total,coinTickets:total,diamondTickets:Math.floor(total/3),roundsTowardNextDiamond:total%3,roundsToNextDiamond:3-total%3,subjects:Object.keys(names).map(id=>({id,name:names[id],completedRounds:counted.includes(id)?1:0}))};
  for(const subject of state.methodRewards.subjects){const completed=subject.rewards.every(reward=>reward.claimed);subject.roundTickets={completed,counted:counted.includes(subject.id),baseline:baseline.includes(subject.id),coinTickets:counted.includes(subject.id)?1:0,diamondTickets:0};}
  return state;
}
function roundReceipt(subject='math',tier='mastery',total=3,patch={}){
  const state=withRounds(snapshot({claimed:[`${subject}:practice`,`${subject}:mastery`]}),total,{counted:[subject]});
  const tickets={coinTickets:1,diamondTickets:total%3===0?1:0};
  return receipt(subject,tier,{methodRewards:state.methodRewards,lotteryTickets:tickets,ticketGrants:[{machine:'coin',count:1,source:'method-round'},...(tickets.diamondTickets?[{machine:'diamond',count:1,source:'method-round'}]:[])],...patch});
}

test('workshop prominently separates permanent method rounds from the daily subject and completion gifts',()=>{
  for(const total of [0,1,2,3,8]){
    const h=harness(withRounds(bonusSnapshot(),total)),html=h.host.innerHTML;
    assert.match(html,new RegExp(`再完成 <b>${3-total%3}</b> 轮研习，收下 1 张钻石抽奖券`));
    assert.match(html,new RegExp(`累计 ${total} 轮 · 已获 ${Math.floor(total/3)} 张钻石券`));
    assert.match(html,/每科当天两档奖励领齐算 1 轮，另赠 1 张金币抽奖券/);assert.match(html,/与普通委托分别累计/);
    assert.equal((html.match(/领齐本日两档 · 赠 1 张金币抽奖券/g)||[]).length,4);
    assert.match(html,/融会贯通/);assert.match(html,/200 金币 <span>· 4 钻石/);
    assert.equal(h.requests.length,0);
    const writes=h.host.writes;for(let i=0;i<25;i++)h.api.render(copy(withRounds(bonusSnapshot(),total)));assert.equal(h.host.writes,writes);
  }
});

test('a third method round grants its actual two tickets once and a late poll cannot move the permanent counter backwards',async()=>{
  const initial=withRounds(snapshot({claimed:['math:practice']}),2),h=harness(initial);
  vm.runInContext(fs.readFileSync(require.resolve('../static/lottery.js'),'utf8'),h.context);
  h.emit('math:mastery');h.emit('cs:practice');assert.equal(h.requests.length,1);
  h.requests[0].resolve(roundReceipt());await h.flush();
  assert.equal(h.receipts.length,1);assert.match(h.toasts.at(-1)[1],/\+1 金币抽奖券 · \+1 钻石抽奖券/);
  assert.match(h.host.innerHTML,/再完成 <b>3<\/b> 轮研习/);assert.match(h.host.innerHTML,/本科研习已计 1 轮 · 赠券已收好/);
  h.api.render(copy(initial));assert.match(h.host.innerHTML,/累计 3 轮 · 已获 1 张钻石券/);h.emit('math:mastery');assert.equal(h.requests.length,1);assert.equal(h.sounds.length,1);
  h.api.render(withRounds(snapshot({date:'2026-09-27'}),3));assert.match(h.host.innerHTML,/2026-09-27 · 研习回看/);assert.match(h.host.innerHTML,/累计 3 轮/);h.emit('cs:mastery');assert.equal(h.requests.length,1);
  const tomorrow=withRounds(snapshot({date:'2026-09-29',today:'2026-09-29'}),3);h.api.render(tomorrow);assert.match(h.host.innerHTML,/再完成 <b>3<\/b> 轮研习/);assert.doesNotMatch(h.host.innerHTML,/本科研习已计 1 轮/);assert.match(h.host.innerHTML,/领齐本日两档 · 赠 1 张金币抽奖券/);
});

test('receipt validation prevents a partial ticket grant from masquerading as a completed method round',async()=>{
  const h=harness(withRounds(snapshot({claimed:['math:practice']}),2));h.emit('math:mastery');
  h.requests[0].resolve(roundReceipt('math','mastery',3,{ticketGrants:[{machine:'coin',count:1}]}));await h.flush();
  assert.equal(h.receipts.length,0);assert.equal(h.sounds.length,0);assert.match(h.toasts.at(-1)[1],/回执/);assert.match(h.host.innerHTML,/累计 2 轮/);
  assert.equal(h.button('math:mastery').attributes['aria-disabled'],'false');
  h.emit('math:mastery');h.requests[1].resolve(roundReceipt());await h.flush();assert.equal(h.receipts.length,1);
});

test('baseline and idempotent old method claims never invent new round tickets or celebration',async()=>{
  const legacy=withRounds(snapshot({claimed:['math:practice','math:mastery']}),0,{baseline:['math']}),h=harness(legacy);
  assert.match(h.host.innerHTML,/两档奖励已收好 · 原有记录保留/);assert.doesNotMatch(h.host.innerHTML,/本科研习已计 1 轮/);
  h.emit('math:mastery');assert.equal(h.requests.length,0);
  const fresh=harness(withRounds(snapshot({claimed:['math:practice']}),2));fresh.emit('math:mastery');
  fresh.requests[0].resolve(roundReceipt('math','mastery',3,{alreadyClaimed:true,reward:{coins:0,diamonds:0},lotteryTickets:{coinTickets:0,diamondTickets:0},ticketGrants:[]}));await fresh.flush();
  assert.equal(fresh.receipts.length,1);assert.equal(fresh.sounds.length,0);assert.match(fresh.toasts.at(-1)[0],/已经收好/);assert.doesNotMatch(fresh.toasts.at(-1)[1],/\+.*抽奖券/);
});

test('malformed persistent round fields cannot inject text or fabricate a progress badge',()=>{
  for(const patch of [{totalRounds:'<img>'},{roundsToNextDiamond:0},{roundsTowardNextDiamond:8},{diamondTickets:-1},{featureStartMs:0}]){
    const state=withRounds(snapshot(),2);Object.assign(state.methodRewards.roundTickets,patch);const h=harness(state);
    assert.doesNotMatch(h.host.innerHTML,/class="method-round-tickets"|class="method-subject-round|<img|NaN/);
    assert.equal(h.button('math:practice').attributes['aria-disabled'],'false');
  }
});

test('shared currency artwork appears in method prizes and tickets while stable polls do not rebuild it',()=>{
  const state=withRounds(bonusSnapshot(),2),h=harness(state);
  h.context.FocusCurrencyArt=require('../static/currency-art.js');h.api.render(copy(state));
  assert.match(h.host.innerHTML,/class="currency-icon currency-icon-coins/);assert.match(h.host.innerHTML,/class="currency-icon currency-icon-diamonds/);
  assert.doesNotMatch(h.host.innerHTML,/<i aria-hidden="true">[◉◇]<\/i>/);
  const writes=h.host.writes;h.api.render(copy(state));assert.equal(h.host.writes,writes);assert.equal(h.requests.length,0);
});

test('claiming only one method tier confirms its currency reward without inventing a completed round',async()=>{
  const h=harness(withRounds(snapshot(),2));h.emit('math:practice');
  const state=withRounds(snapshot({claimed:['math:practice']}),2);
  h.requests[0].resolve(receipt('math','practice',{methodRewards:state.methodRewards,lotteryTickets:{coinTickets:0,diamondTickets:0},ticketGrants:[]}));await h.flush();
  assert.equal(h.receipts.length,1);assert.match(h.host.innerHTML,/累计 2 轮/);assert.doesNotMatch(h.host.innerHTML,/本科研习已计 1 轮/);assert.doesNotMatch(h.toasts.at(-1)[1],/抽奖券/);
  assert.equal(h.button('math:mastery').attributes['aria-disabled'],'false');
});

test('permanent method progress observed in polling remains stable across older polls as well as receipts',()=>{
  const h=harness(withRounds(snapshot(),3));h.api.render(withRounds(snapshot(),5));assert.match(h.host.innerHTML,/累计 5 轮/);
  h.api.render(withRounds(snapshot(),3));assert.match(h.host.innerHTML,/累计 5 轮/);assert.match(h.host.innerHTML,/再完成 <b>1<\/b> 轮研习/);
  assert.equal(h.requests.length,0);
});
