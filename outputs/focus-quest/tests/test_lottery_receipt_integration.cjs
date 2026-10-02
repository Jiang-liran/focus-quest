const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../static/app.js'),'utf8');
const start=app.indexOf('function acceptLotteryReceipt(result){'),end=app.indexOf('\nglobalThis.FocusMystery?.init',start);
const copy=value=>JSON.parse(JSON.stringify(value));
const time=n=>`2026-10-01T18:00:00.000${n}+08:00`;
function harness(){
 const calls=[];
 const ctx=vm.createContext({state:{settings:{sound:false,motion:true},quests:{now:time(200),wallet:{coins:800,diamonds:8}},arcade:{now:time(200),available:8}},requestSequence:7,inFlight:true,
   FocusQuests:{render(){}},FocusQuickSkins:{render(){}},FocusCitadel:{applyEquipment(){}},FocusArcade:{render(snapshot,settings){calls.push([copy(snapshot),copy(settings)]);}}});
 vm.runInContext(app.slice(start,end),ctx);
 return {ctx,calls};
}
function receipt(n=300){return {quests:{now:time(n),wallet:{coins:800,diamonds:8},lottery:{tickets:{coin:1,diamond:0}}},arcade:{now:time(n),available:6},result:{type:'ticket',source:'playExchange',amount:1}};}
test('exchange receipt immediately merges permanent play inventory and invalidates a stale poll',()=>{
 const h=harness(),r=receipt();h.ctx.acceptLotteryReceipt(r);
 assert.deepEqual(copy(h.ctx.state.arcade),r.arcade);assert.equal(h.ctx.state.lottery.tickets.coin,1);
 assert.deepEqual(h.calls,[[r.arcade,{sound:false,motion:true}]]);assert.equal(h.ctx.requestSequence,8);assert.equal(h.ctx.inFlight,false);
});
test('older exchange receipt cannot restore spent play tickets or lottery tickets',()=>{
 const h=harness(),before=copy(h.ctx.state);h.ctx.acceptLotteryReceipt(receipt(100));
 assert.deepEqual(copy(h.ctx.state),before);assert.equal(h.calls.length,0);assert.equal(h.ctx.requestSequence,7);
});
test('a newer independent game response remains authoritative when a lottery receipt arrives',()=>{
 const h=harness();h.ctx.state.arcade={now:time(400),available:5,active:{id:'new-game'}};const before=copy(h.ctx.state.arcade);
 h.ctx.acceptLotteryReceipt(receipt(300));assert.deepEqual(copy(h.ctx.state.arcade),before);assert.equal(h.calls.length,0);
 assert.equal(h.ctx.state.lottery.tickets.coin,1);
});
test('ordinary lottery receipts without a game snapshot retain inventory and do not repaint games',()=>{
 const h=harness(),r=receipt();delete r.arcade;h.ctx.acceptLotteryReceipt(r);
 assert.equal(h.ctx.state.arcade.available,8);assert.equal(h.calls.length,0);
});
