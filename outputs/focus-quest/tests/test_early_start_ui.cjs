const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ui=require('../static/early-start.js');
test('welcome describes all tiers, actual start time and completion-based automatic payment',()=>{
  const html=ui.markup({status:'waiting'});
  for(const text of ['08:00 前','08:00–08:59','09:00–09:59','90 金币','60 金币','30 金币','2 钻石','金币券 × 1','钻石券 × 1','第一段已完成学习','不看结束时间','10:00','背单词','每天一份'])assert.ok(html.includes(text),text);
  assert.ok(!html.includes('<button'));
});
test('the three tiers have exactly the requested ticket combinations and show durable received tickets',()=>{
  assert.deepEqual(ui.tiers.map(t=>[t.coinTickets,t.diamondTickets]),[[1,1],[0,1],[1,0]]);
  assert.match(ui.status({status:'awarded',firstStart:'2026-10-05T07:30:00+08:00',lotteryTickets:{coinTickets:1,diamondTickets:1}}),/金币券 1 张、钻石券 1 张已放入券夹/);
});
test('reward and late states use encouragement and reject injected first-start text',()=>{
  assert.match(ui.status({status:'awarded',firstStart:'2026-10-05T07:30:00+08:00'}),/自动收进钱包/);
  assert.match(ui.status({status:'late',firstStart:'2026-10-05T10:30:00+08:00'}),/照常积累/);
  assert.doesNotMatch(ui.markup({status:'awarded',firstStart:'<img onerror="bad">'}),/onerror|<img/);
});
test('identical polling keeps the reward panel DOM and does not write or schedule rewards',()=>{
  let writes=0,raw='';const node={get innerHTML(){return raw;},set innerHTML(v){raw=v;writes++;}};
  const context=vm.createContext({document:{getElementById:()=>node}});
  vm.runInContext(fs.readFileSync(require.resolve('../static/early-start.js'),'utf8'),context);
  for(let n=0;n<15;n++)context.FocusEarlyStart.render({earlyStart:{status:'waiting'}});
  assert.equal(writes,1);
  context.FocusEarlyStart.render({earlyStart:{status:'awarded',tier:8}});assert.equal(writes,2);assert.match(raw,/is-awarded/);
});
