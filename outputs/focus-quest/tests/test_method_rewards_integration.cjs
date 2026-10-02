const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../static/app.js'),'utf8');
function harness(){
 const calls=[];let bridge;
 const context=vm.createContext({document:{getElementById(){return null;}},FocusQuests:{render(value){calls.push(JSON.parse(JSON.stringify(value)));}},FocusMethodRewards:{init(value){bridge=value;}},pendingResolve:null});
 vm.runInContext(source.split("\ndocument.querySelectorAll('[data-view]')")[0],context);
 vm.runInContext(source.slice(source.indexOf('globalThis.FocusMethodRewards?.init('),source.indexOf('globalThis.FocusIslandRewards?.init(')),context);
 const run=code=>vm.runInContext(code,context);
 run(`state={today:'2026-09-28',date:'2026-09-28',quests:{wallet:{coins:100,diamonds:4},equipped:{bar:'bar-prism'},now:'2026-09-28T09:00:00+08:00'},methodRewards:{day:'2026-09-28',availableCount:2}};currentView='review';`);
 const receipt={day:'2026-09-28',now:'2026-09-28T09:00:01.123456+08:00',wallet:{coins:140,diamonds:5},methodRewards:{day:'2026-09-28',availableCount:1,completionBonus:{claimed:true}}};
 return {bridge,calls,context,run,receipt};
}
test('authoritative method receipt invalidates an earlier in-flight poll without rolling wallet or claims back',async()=>{
 const h=harness();h.run('api=()=>new Promise(resolve=>{pendingResolve=resolve;});');
 const pending=h.run('refresh(true)');assert.equal(h.run('inFlight'),true);
 h.bridge.acceptReceipt(h.receipt);
 assert.equal(h.run('inFlight'),false);assert.equal(h.run('state.quests.wallet.coins'),140);
 h.context.pendingResolve({date:'2026-09-28',today:'2026-09-28',quests:{wallet:{coins:100,diamonds:4}},methodRewards:{availableCount:2}});
 await pending;
 assert.equal(h.run('state.quests.wallet.coins'),140);assert.equal(h.run('state.quests.wallet.diamonds'),5);
 assert.equal(h.run('state.methodRewards.availableCount'),1);assert.equal(h.run('state.quests.equipped.bar'),'bar-prism');
 assert.equal(h.run('state.methodRewards.completionBonus.claimed'),true);
 assert.equal(h.calls[0].now,h.receipt.now);
});
test('a response arriving after a historical date selection updates the wallet, not the visible historical method rewards',()=>{
 const h=harness();h.run("state.date='2026-09-27';state.methodRewards={day:'2026-09-27',availableCount:0};");
 h.bridge.acceptReceipt(h.receipt);
 assert.equal(h.run('state.quests.wallet.coins'),140);assert.equal(h.run('state.methodRewards.day'),'2026-09-27');
 assert.equal(h.run('state.date'),'2026-09-27');
});
test('a stale previous-day response cannot overwrite the current day or wallet',()=>{
 const h=harness();h.receipt.day='2026-09-27';h.bridge.acceptReceipt(h.receipt);
 assert.equal(h.run('state.quests.wallet.coins'),100);assert.equal(h.run('state.methodRewards.availableCount'),2);assert.equal(h.calls.length,0);
});

test('mixed completion tickets update both lottery snapshots immediately and a pre-claim poll cannot roll either back',async()=>{
 const h=harness(),old={revision:12,tickets:{coin:3,diamond:2},machines:[{id:'coin',purchaseLimit:10,purchasesToday:5,purchasesRemaining:5},{id:'diamond',purchaseLimit:10,purchasesToday:5,purchasesRemaining:5}]};
 h.context.initialLottery=old;h.run('state.lottery=initialLottery;state.quests.lottery=initialLottery;api=()=>new Promise(resolve=>{pendingResolve=resolve;});');
 const pending=h.run('refresh(true)');assert.equal(h.run('inFlight'),true);
 const fresh={...old,revision:13,tickets:{coin:4,diamond:3}};
 Object.assign(h.receipt,{lottery:fresh,lotteryTickets:{coinTickets:1,diamondTickets:1},ticketGrants:[{machine:'coin',count:1,source:'method-completion'},{machine:'diamond',count:1,source:'method-completion'}]});
 h.receipt.methodRewards.completionBonus.lotteryTickets={coinTickets:1,diamondTickets:1};
 h.bridge.acceptReceipt(h.receipt);
 assert.equal(h.run('inFlight'),false);
 for(const prefix of ['state.lottery','state.quests.lottery']){
  assert.equal(h.run(`${prefix}.revision`),13);assert.equal(h.run(`${prefix}.tickets.coin`),4);assert.equal(h.run(`${prefix}.tickets.diamond`),3);
 }
 assert.equal(h.calls.at(-1).lottery.tickets.coin,4);assert.equal(h.calls.at(-1).lottery.tickets.diamond,3);
 h.context.pendingResolve({date:h.receipt.day,today:h.receipt.day,quests:{wallet:{coins:100,diamonds:4},lottery:old},lottery:old,methodRewards:{availableCount:2,completionBonus:{claimed:false,lotteryTickets:{coinTickets:1,diamondTickets:1}}}});
 await pending;
 for(const prefix of ['state.lottery','state.quests.lottery']){
  assert.equal(h.run(`${prefix}.revision`),13);assert.equal(h.run(`${prefix}.tickets.coin`),4);assert.equal(h.run(`${prefix}.tickets.diamond`),3);
 }
 assert.equal(h.run('state.methodRewards.completionBonus.claimed'),true);
 assert.equal(h.run('state.methodRewards.completionBonus.lotteryTickets.coinTickets'),1);
 assert.equal(h.run('state.methodRewards.completionBonus.lotteryTickets.diamondTickets'),1);
 assert.equal(h.run('state.quests.equipped.bar'),'bar-prism');
});

test('mixed completion tickets still enter the global inventory after choosing a historical study date',()=>{
 const h=harness();h.run("state.date='2026-09-27';state.methodRewards={day:'2026-09-27',availableCount:0,completionBonus:{claimed:true,lotteryTickets:{coinTickets:0,diamondTickets:1}}};");
 h.receipt.lottery={revision:13,tickets:{coin:4,diamond:3}};
 h.receipt.methodRewards.completionBonus.lotteryTickets={coinTickets:1,diamondTickets:1};
 h.bridge.acceptReceipt(h.receipt);
 assert.equal(h.run('state.date'),'2026-09-27');assert.equal(h.run('state.methodRewards.day'),'2026-09-27');
 assert.equal(h.run('state.methodRewards.completionBonus.lotteryTickets.coinTickets'),0);
 for(const prefix of ['state.lottery','state.quests.lottery']){
  assert.equal(h.run(`${prefix}.tickets.coin`),4);assert.equal(h.run(`${prefix}.tickets.diamond`),3);
 }
 assert.equal(h.calls.at(-1).lottery.revision,13);
});

test('a previous-day completion receipt cannot replace current lottery inventory with older ticket balances',()=>{
 const h=harness();h.run('state.lottery={revision:13,tickets:{coin:4,diamond:3}};state.quests.lottery=state.lottery;');
 h.receipt.day='2026-09-27';h.receipt.lottery={revision:12,tickets:{coin:3,diamond:2}};
 h.bridge.acceptReceipt(h.receipt);
 for(const prefix of ['state.lottery','state.quests.lottery']){
  assert.equal(h.run(`${prefix}.revision`),13);assert.equal(h.run(`${prefix}.tickets.coin`),4);assert.equal(h.run(`${prefix}.tickets.diamond`),3);
 }
 assert.equal(h.calls.length,0);
});
