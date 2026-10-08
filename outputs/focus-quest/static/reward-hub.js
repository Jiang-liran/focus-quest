(function(root){
  'use strict';
  const $=id=>root.document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const people=[
    {id:'morning',name:'司晨',role:'晨间导师',title:'晨光与推演',intro:'数学、政治的持续委托与晨光首轮；晨光启程礼也在这里查看。',art:()=>root.QuestArt?.avatar('morning')},
    {id:'afternoon',name:'逐光',role:'午后领航员',title:'午后与译读',intro:'408、英语的持续委托与午后首轮。每轮交付，也会积累赠券。',art:()=>root.QuestArt?.avatar('afternoon')},
    {id:'method',name:'砚青',role:'研习导师',title:'知行研习所',intro:'落笔做题、学以致用，还有四科融会贯通的额外星礼。',art:()=>root.FocusMethodArt?.avatar()},
    {id:'evening',name:'晚舟',role:'守灯人',title:'晚灯相伴',intro:'18 点后的小段坚持，点亮逐级丰盛的礼盒；旧夜的收获也会留着。',art:()=>root.QuestArt?.avatar('evening')},
    {id:'mystery',name:'拾星',role:'余辉守望者',title:'余辉与星礼',intro:'达成远征后的额外专注与拾星礼盒，已交付但未打开的星礼也在这里。',art:()=>root.FocusMysteryArt?.portrait()},
    {id:'islands',name:'栖灯',role:'群岛守候者',title:'群岛达成礼',intro:'收好四座学岛的目标礼盒，及总目标与四科共辉的主岛礼物。',art:()=>root.QuestArt?.avatar('guide')}
  ];
  let bridge={},initialized=false,quests=null,active=null,epoch=0,loading=false;
  const pictures=new Map(),cache=new Map();
  function replace(id,html){const node=$(id);if(node&&cache.get(id)!==html){const focused=node.contains(root.document.activeElement)?root.document.activeElement?.dataset?.rewardPerson:null;node.innerHTML=html;cache.set(id,html);if(focused)node.querySelector(`[data-reward-person="${focused}"]`)?.focus({preventScroll:true});}}
  function summaries(){
    const result={};
    for(const period of ['morning','afternoon']){
      const tasks=(quests?.quests||[]).filter(q=>(q.recommended?.period||q.period)===period);
      const ready=tasks.filter(q=>q.status==='ready').length;
      result[period]={count:ready,text:ready?`${ready} 科收获可交付`:tasks.some(q=>q.status==='available')?'有委托可接取':tasks.some(q=>q.status==='active')?'委托持续推进中':'等待学习记录同步'};
    }
    result.method=root.FocusMethodRewards?.summary?.()||{count:0,text:'听懂以后，动笔试试'};
    result.evening=root.FocusEveningRewards?.summary?.()||{count:0,text:'18 点以后，灯会亮起'};
    result.mystery=root.FocusMystery?.summary?.()||{count:0,text:'等今日星灯亮起'};
    result.islands=root.FocusIslandRewards?.summary?.()||{count:0,text:'让四座学岛逐步建成'};
    return result;
  }
  function apply(){
    if(!initialized)return;
    $('reward-hub').hidden=Boolean(active);$('reward-detail').hidden=!active;
    $('reward-detail').dataset.person=active||'';
    for(const [id,show] of Object.entries({'quest-board':['morning','afternoon'].includes(active),'quest-round-progress':['morning','afternoon'].includes(active)&&Number.isInteger(quests?.lottery?.roundTickets?.totalRounds),'quest-early-start':active==='morning','method-rewards':active==='method','evening-rewards':active==='evening','mystery-quest':active==='mystery','island-reward-detail':active==='islands','quest-continuous-rules':['morning','afternoon'].includes(active)})){
      const node=$(id);if(node)node.hidden=!show;
    }
    for(const node of $('quest-board')?.querySelectorAll('[data-reward-period]')||[])node.hidden=node.dataset.rewardPeriod!==active;
    const person=people.find(p=>p.id===active);
    if(person){$('reward-detail-title').textContent=`${person.name} · ${person.title}`;$('reward-detail-description').textContent=person.intro;}
    $('quest-ledger-details').hidden=Boolean(active);
  }
  function update(){
    if(!initialized)return;
    const status=summaries(),count=people.reduce((sum,p)=>sum+(status[p.id].count||0),0);
    $('reward-hub-status').textContent=count?`${count} 份收获等你收好`:'每一段努力，都会在这里留下回响';
    $('reward-hub-status').classList.toggle('has-rewards',count>0);
    replace('reward-npcs',people.map(person=>{
      const s=status[person.id],ready=s.count>0;
      if(!pictures.has(person.id))pictures.set(person.id,person.art()||'');
      return `<button type="button" class="reward-npc${ready?' is-ready':''}" data-reward-person="${person.id}" aria-controls="reward-detail" aria-label="${esc(person.name+' · '+person.title+' · '+s.text)}"${loading?' disabled':''}><span class="reward-npc-top"><span class="reward-npc-role">${person.role}</span><span class="reward-npc-badge${ready?' ready':''}">${ready?`✦ ${s.count} 份可领取`:'查看详情'}</span></span><span class="reward-npc-main"><span class="reward-npc-portrait" aria-hidden="true">${pictures.get(person.id)}</span><span><strong>${person.name}</strong><span class="reward-npc-title">${person.title}</span></span></span><span class="reward-npc-intro">${person.intro}</span><span class="reward-npc-bottom"><span>${esc(s.text)}</span><span aria-hidden="true">→</span></span></button>`;
    }).join(''));
    apply();
  }
  function renderQuests(snapshot){quests=snapshot;update();}
  function isDetail(id){return active===id&&bridge.isVisible?.()!==false;}
  function leave(){epoch++;active=null;loading=false;update();}
  async function open(id,options={}){
    if(!people.some(p=>p.id===id)||bridge.canOpen?.()===false)return false;
    const history=options.history===true&&id==='method';
    bridge.navigate?.({history});const token=++epoch;loading=true;update();
    try{
      if(await bridge.prepare?.(history)===false)return false;
      if(token!==epoch||bridge.isVisible?.()===false||bridge.canOpen?.()===false)return false;
      active=id;update();root.window.scrollTo({top:0,behavior:'auto'});$('reward-detail-title').focus({preventScroll:true});return true;
    }finally{if(token===epoch){loading=false;update();}}
  }
  function back(){const previous=active;leave();void bridge.prepare?.(false);root.window.scrollTo({top:0,behavior:'auto'});$('reward-npcs').querySelector(`[data-reward-person="${previous}"]`)?.focus({preventScroll:true});}
  function init(callbacks){if(initialized)return;bridge=callbacks||{};if(!$('reward-hub'))return;initialized=true;
    $('reward-npcs').addEventListener('click',event=>{const node=event.target.closest('[data-reward-person]');if(node&&!node.disabled&&!event.defaultPrevented)void open(node.dataset.rewardPerson);});
    $('reward-detail-back').addEventListener('click',back);
    root.document.addEventListener('keydown',event=>{if(event.key==='Escape'&&active&&!root.document.querySelector('dialog[open]')&&bridge.isVisible?.()!==false){event.preventDefault();back();}});
    update();
  }
  root.FocusRewardHub={init,update,renderQuests,open,leave,isDetail};
})(typeof globalThis!=='undefined'?globalThis:this);
