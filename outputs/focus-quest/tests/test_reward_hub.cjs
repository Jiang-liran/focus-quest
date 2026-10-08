const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../static/reward-hub.js'),'utf8');
function harness(){
  const elements=new Map(),handlers={},scrolls=[],focuses=[],preparations=[];let visible=true,allowed=true,pending=false;
  const document={activeElement:null,addEventListener(type,fn){handlers[type]=fn;},querySelector(){return this.dialog?{}:null;}};
  class Element{
    constructor(id){this.id=id;this.hidden=false;this.dataset={};this._html='';this.writes=0;this.children=[];this.listeners={};this.classList={toggle(){}};}
    set innerHTML(html){this._html=html;this.writes++;this.children=[];for(const [,id] of html.matchAll(/data-reward-person="([^"]+)"/g)){const node=new Element(id);node.dataset.rewardPerson=id;node.disabled=html.includes(' disabled');this.children.push(node);}}
    get innerHTML(){return this._html;}
    contains(node){return this.children.includes(node);}
    querySelector(selector){return this.children.find(el=>selector.includes(`"${el.dataset.rewardPerson}"`))||null;}
    querySelectorAll(){return this.children;}
    focus(){document.activeElement=this;focuses.push(this.id);}
    addEventListener(type,fn){this.listeners[type]=fn;}
  }
  document.getElementById=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const methods={count:2,text:'2 份研习奖励可领取'},evening={count:3,text:'3 份礼盒可领取 · 含旧夜 1 份'},mystery={count:2,text:'2 份星礼待开启'},islands={count:1,text:'1 份群岛礼物可领取'};
  const context=vm.createContext({document,window:{scrollTo:options=>scrolls.push(options)},QuestArt:{avatar:role=>`<svg>${role}</svg>`},FocusMethodRewards:{summary:()=>methods},FocusEveningRewards:{summary:()=>evening},FocusMystery:{summary:()=>mystery},FocusIslandRewards:{summary:()=>islands}});
  vm.runInContext(source,context);const api=context.FocusRewardHub;
  api.init({navigate(){api.leave();visible=true;},isVisible:()=>visible,canOpen:()=>allowed,prepare(history){if(pending)return new Promise(resolve=>preparations.push({resolve,history}));return true;}});
  const get=document.getElementById;
  const morning=new Element('morning'),afternoon=new Element('afternoon');morning.dataset.rewardPeriod='morning';afternoon.dataset.rewardPeriod='afternoon';get('quest-board').children=[morning,afternoon];
  const snapshot={quests:[{period:'morning',status:'ready'},{recommended:{period:'morning'},status:'ready'},{period:'afternoon',status:'available'},{period:'afternoon',status:'active'}],lottery:{roundTickets:{totalRounds:2}}};api.renderQuests(snapshot);
  return {api,get,document,handlers,scrolls,focuses,preparations,methods,evening,mystery,islands,snapshot,set pending(value){pending=value;},set visible(value){visible=value;},set allowed(value){allowed=value;}};
}
test('one hub exposes six NPCs and aggregates only authoritative claim summaries, including saved rewards',()=>{
  const h=harness(),html=h.get('reward-npcs').innerHTML;assert.equal(h.get('reward-npcs').children.length,6);assert.match(h.get('reward-hub-status').textContent,/10 份/);assert.match(html,/旧夜 1 份/);assert.match(html,/2 份星礼待开启/);assert.match(html,/有委托可接取/);assert.match(html,/晨光启程礼/);
  for(const id of ['quest-board','method-rewards','evening-rewards','mystery-quest','island-reward-detail'])assert.equal(h.get(id).hidden,true,id);
});
test('each NPC reveals its existing detail alone; mentor details also retain their own tasks and round progress',async()=>{
  const h=harness();for(const id of ['morning','afternoon','method','evening','mystery','islands']){
    assert.equal(await h.api.open(id),true);assert.equal(h.get('reward-hub').hidden,true);assert.equal(h.api.isDetail(id),true);
    const expected={morning:'quest-board',afternoon:'quest-board',method:'method-rewards',evening:'evening-rewards',mystery:'mystery-quest',islands:'island-reward-detail'}[id];
    for(const panel of ['quest-board','method-rewards','evening-rewards','mystery-quest','island-reward-detail'])assert.equal(h.get(panel).hidden,panel!==expected,panel);
    assert.equal(h.get('quest-early-start').hidden,id!=='morning');
    if(id==='morning'||id==='afternoon')for(const node of h.get('quest-board').children)assert.equal(node.hidden,node.dataset.rewardPeriod!==id);
  }
});
test('stable polls keep NPC nodes; receipt summaries clear badges immediately and retain keyboard focus',()=>{
  const h=harness(),host=h.get('reward-npcs'),button=host.children.find(el=>el.dataset.rewardPerson==='method');button.focus();const writes=host.writes;h.api.update();h.api.renderQuests(h.snapshot);assert.equal(host.writes,writes);assert.equal(h.document.activeElement,button);
  h.methods.count=0;h.methods.text='奖励已收好';h.api.update();assert.equal(h.document.activeElement.dataset.rewardPerson,'method');assert.match(host.innerHTML,/奖励已收好/);assert.match(h.get('reward-hub-status').textContent,/8 份/);
});
test('late prepare completion cannot reopen a detail or steal focus after leaving or newer navigation',async()=>{
  const h=harness();h.pending=true;const old=h.api.open('method');h.api.leave();h.visible=false;h.preparations.shift().resolve(true);assert.equal(await old,false);assert.equal(h.focuses.length,0);
  h.visible=true;const first=h.api.open('morning'),second=h.api.open('evening');h.preparations.shift().resolve(true);assert.equal(await first,false);assert.equal(h.focuses.length,0);h.preparations.shift().resolve(true);assert.equal(await second,true);assert.equal(h.api.isDetail('evening'),true);
});
test('Escape returns focus to the NPC, while open dialogs, other scenes and weekly-goal gates block it',async()=>{
  const h=harness();await h.api.open('method');h.document.dialog=true;h.handlers.keydown({key:'Escape',preventDefault(){}});assert.equal(h.api.isDetail('method'),true);h.document.dialog=false;let stopped=false;h.handlers.keydown({key:'Escape',preventDefault(){stopped=true;}});assert.equal(stopped,true);assert.equal(h.get('reward-hub').hidden,false);assert.equal(h.document.activeElement.dataset.rewardPerson,'method');
  h.allowed=false;assert.equal(await h.api.open('islands'),false);assert.equal(h.api.isDetail('islands'),false);
});
test('history is preserved only for workshop review; return prepares todays claim list without claiming anything',async()=>{
  const h=harness();h.pending=true;const read=h.api.open('method',{history:true});assert.equal(h.preparations[0].history,true);h.preparations.shift().resolve(true);await read;h.get('reward-detail-back').listeners.click();assert.equal(h.preparations[0].history,false);
  assert.doesNotMatch(source,/setInterval|setTimeout|requestAnimationFrame|\/api\//);h.preparations.shift().resolve(true);
});
