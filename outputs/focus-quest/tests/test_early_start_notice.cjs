const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../static/early-start.js'),'utf8');
const day='2026-10-04';
const receipt=(patch={})=>({day,status:'awarded',firstStart:`${day}T07:30:00+08:00`,tier:8,reward:{coins:90,diamonds:2},lotteryTickets:{coinTickets:1,diamondTickets:1},...patch});
function harness(storage=new Map()){
  let writes=0;const body={innerHTML:''},dialog={open:false,shown:0,showModal(){this.open=true;this.shown++;},close(){this.open=false;}};
  const document={hidden:false,getElementById:id=>id==='early-start-notice-dialog'?dialog:id==='early-start-notice-content'?body:null,querySelector:()=>dialog.open?dialog:null};
  const context=vm.createContext({document,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>{storage.set(key,value);writes++;}}});
  vm.runInContext(source,context);
  return {ui:context.FocusEarlyStart,dialog,body,document,context,storage,writes:()=>writes,observe:value=>context.FocusEarlyStart.observe({today:day,quests:{earlyStart:value}})};
}
test('a completed reward arrives once with actual currency and tickets, without an API payment',()=>{
  const h=harness();h.observe(receipt({status:'waiting'}));assert.equal(h.ui.showNotice(),false);
  h.observe(receipt());assert.equal(h.ui.showNotice(),true);assert.equal(h.dialog.shown,1);
  for(const text of ['已到账','金币','钻石','金币抽奖券','钻石抽奖券','+90','+2','无需再次领取'])assert.ok(h.body.innerHTML.includes(text),text);
  const original=h.body.innerHTML;for(let i=0;i<20;i++){h.observe(receipt());assert.equal(h.ui.showNotice(),false);}
  assert.equal(h.body.innerHTML,original);h.dialog.close();assert.equal(h.ui.showNotice(),false);assert.equal(h.writes(),1);
});
test('reloading or reopening reuses the acknowledgement rather than repeating today’s reward',()=>{
  const storage=new Map(),h=harness(storage);h.observe(receipt());h.ui.showNotice();
  const reopened=harness(storage);reopened.observe(receipt());assert.equal(reopened.ui.showNotice(),false);
  assert.equal(reopened.dialog.shown,0);assert.equal(reopened.writes(),0);
});
test('hidden windows, another dialog and failed showModal leave the notification pending',()=>{
  const h=harness();h.observe(receipt());h.document.hidden=true;assert.equal(h.ui.showNotice(),false);assert.equal(h.writes(),0);
  h.document.hidden=false;h.document.querySelector=()=>({open:true});assert.equal(h.ui.showNotice(),false);assert.equal(h.writes(),0);
  h.document.querySelector=()=>null;const show=h.dialog.showModal;h.dialog.showModal=()=>{throw Error('not ready');};
  assert.equal(h.ui.showNotice(),false);assert.equal(h.writes(),0);
  h.dialog.showModal=show;assert.equal(h.ui.showNotice(),true);
});
test('delayed earlier records notify only the supplement, even when a previously received ticket was spent',()=>{
  const h=harness();h.observe(receipt({tier:10,reward:{coins:30,diamonds:1},lotteryTickets:{coinTickets:1,diamondTickets:0}}));h.ui.showNotice();h.dialog.close();
  h.observe(receipt({tier:9,reward:{coins:60,diamonds:1}}));assert.equal(h.ui.showNotice(),true);
  assert.match(h.body.innerHTML,/补充奖励/);assert.match(h.body.innerHTML,/\+30/);assert.match(h.body.innerHTML,/钻石抽奖券/);
  assert.doesNotMatch(h.body.innerHTML,/金币抽奖券|>钻石<|\+60/);h.dialog.close();
  h.observe(receipt());assert.equal(h.ui.showNotice(),true);assert.match(h.body.innerHTML,/\+30/);assert.match(h.body.innerHTML,/>钻石</);
  assert.doesNotMatch(h.body.innerHTML,/抽奖券/);h.dialog.close();assert.equal(h.ui.showNotice(),false);
});
test('late, prior, zero, invalid and historical receipts do not open a misleading arrival',()=>{
  const h=harness();
  for(const value of [receipt({status:'late'}),receipt({status:'prior'}),receipt({reward:{coins:0,diamonds:0},lotteryTickets:{coinTickets:0,diamondTickets:0}}),receipt({firstStart:'<img onerror="bad">'}),receipt({day:'2026-10-03'})]){h.observe(value);assert.equal(h.ui.showNotice(),false);}
  assert.equal(h.writes(),0);assert.equal(h.body.innerHTML,'');
});
test('a new day receives a new notice and yesterday’s receipt is never replayed',()=>{
  const h=harness();h.observe(receipt());h.ui.showNotice();h.dialog.close();
  const next='2026-10-05';h.ui.observe({today:next,quests:{earlyStart:receipt()}});assert.equal(h.ui.showNotice(),false);
  h.ui.observe({today:next,quests:{earlyStart:receipt({day:next,firstStart:`${next}T08:15:00+08:00`,tier:9,reward:{coins:60,diamonds:1},lotteryTickets:{coinTickets:0,diamondTickets:1}})}});
  assert.equal(h.ui.showNotice(),true);assert.equal(h.dialog.shown,2);assert.match(h.body.innerHTML,/08:00–08:59/);assert.doesNotMatch(h.body.innerHTML,/金币抽奖券/);
});
test('another client acknowledgement is checked immediately before opening',()=>{
  const storage=new Map(),a=harness(storage),b=harness(storage);a.observe(receipt());b.observe(receipt());
  assert.ok(b.ui.pendingNotice());a.ui.showNotice();assert.equal(b.ui.showNotice(),false);
});
test('corrupt or unavailable storage does not break learning or replay notifications in the current window',()=>{
  const h=harness(new Map([['focusquest:early-start-notices:v1','broken JSON']]));h.observe(receipt());assert.equal(h.ui.showNotice(),true);h.dialog.close();assert.equal(h.ui.showNotice(),false);
  const restricted=harness();restricted.context.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  restricted.observe(receipt());assert.equal(restricted.ui.showNotice(),true);restricted.dialog.close();assert.equal(restricted.ui.showNotice(),false);
});
test('stale reward totals cannot undo acknowledgements and an old currency-only receipt gets just its new tickets',()=>{
  const h=harness();h.observe(receipt({lotteryTickets:{coinTickets:0,diamondTickets:0}}));h.ui.showNotice();h.dialog.close();
  h.observe(receipt());h.ui.showNotice();assert.doesNotMatch(h.body.innerHTML,/\+90|\+2/);assert.match(h.body.innerHTML,/金币抽奖券/);h.dialog.close();
  h.observe(receipt({reward:{coins:30,diamonds:1},lotteryTickets:{coinTickets:1,diamondTickets:0}}));assert.equal(h.ui.showNotice(),false);
  h.observe(receipt());assert.equal(h.ui.showNotice(),false);
});
test('daily acknowledgements stay bounded instead of accumulating for the app’s lifetime',()=>{
  const h=harness();
  for(let n=1;n<=45;n++){
    const d=new Date(Date.UTC(2026,8,n)).toISOString().slice(0,10);
    h.ui.observe({today:d,quests:{earlyStart:receipt({day:d,firstStart:`${d}T07:30:00+08:00`})}});h.ui.showNotice();h.dialog.close();
  }
  const saved=JSON.parse(h.storage.get('focusquest:early-start-notices:v1'));assert.equal(Object.keys(saved).length,31);assert.ok(saved['2026-10-15']);assert.ok(!saved['2026-09-01']);
});
