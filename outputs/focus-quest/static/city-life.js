(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rooms=new Set(['library','tea','atelier','station']);
  const types={note:'随手记',question:'待查问题',quote:'喜欢的一句话',plan:'下一程'};
  const teas={osmanthus:['桂花乌龙','杯沿有一点桂花香。让思绪先停在这里。'],jasmine:['茉莉清茶','茶汤渐渐清亮，窗外的灯也柔和下来。'],barley:['暖麦茶','烘烤过的麦香，像一盏低低亮着的灯。']};
  let bridge={},host=null,room=null,state=null,data=null,loading=false,loadError='',busy=false,error='',filter='active',editing=null,initialized=false,generation=0;
  const drafts={},retryIds=new Map();
  let tea='osmanthus',restMinutes=3,restEnd=0,restStarted=false,timer=null;
  const visible=()=>!document.hidden&&root.FocusRuntime?.isVisible?.()!==false;
  const tomorrow=()=>{const date=new Date();date.setDate(date.getDate()+1);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};
  const dateText=row=>row.type==='plan'?`${row.day||'下一程'}`:new Date(row.createdAt).toLocaleDateString('zh-CN',{month:'short',day:'numeric'});
  function remember(){if(!host||room==='tea')return;drafts[room]={...(drafts[room]||{}),editing,filter};for(const node of host.querySelectorAll('[data-life-field]'))drafts[room][node.dataset.lifeField]=node.value;}
  function message(){const node=host?.querySelector('[data-life-status]');if(node){node.textContent=error||loadError||'';node.hidden=!node.textContent;}}
  function setBusy(){host?.querySelectorAll('button[data-life-mutation]').forEach(node=>{node.disabled=busy||loading||!data||node.dataset.lifeEquipped==='true';});host?.querySelectorAll('[data-life-field]').forEach(node=>{node.disabled=busy;});}
  function field(name){return host?.querySelector(`[data-life-field="${name}"]`)?.value??drafts[room]?.[name]??'';}
  function noteForm(){const draft=drafts[room]||{},plan=room==='station';return `<form data-life-form="note" class="city-life-form"><label class="city-life-label" for="city-life-text">${editing?'修改这张便笺':plan?'给下一程留一件小事':'把脑海里的这一句放下来'}</label><textarea id="city-life-text" data-life-field="text" maxlength="1000" rows="3" placeholder="${plan?'明天想从哪里开始？不必写很满。':'一个念头、一句话，或者稍后再查的问题。'}" required>${esc(draft.text||'')}</textarea><div class="city-life-form-row">${plan?`<label class="city-life-date">留给 <input type="date" aria-label="行囊日期" data-life-field="day" value="${esc(draft.day||tomorrow())}" required></label>`:`<select data-life-field="type" aria-label="便笺类别">${['note','question','quote'].map(type=>`<option value="${type}" ${draft.type===type?'selected':''}>${types[type]}</option>`).join('')}</select>`}<button type="submit" data-life-mutation>${editing?'保存修改':plan?'放进行囊':'夹进书页'}</button>${editing?'<button type="button" data-life-action="cancel-edit" class="city-life-quiet">取消</button>':''}</div></form>`;}
  function outfitForm(){return `<p class="city-life-explainer">把当前全套外观收进衣柜，之后一键换上。${data?`${data.outfits.filter(o=>!o.archived).length} / ${data.limits?.outfits||8} 套`:''}</p><form data-life-form="outfit" class="city-life-form city-life-outfit-form"><label for="city-life-name" class="city-life-label">给这套搭配起个名字</label><div class="city-life-form-row"><input id="city-life-name" data-life-field="name" maxlength="30" value="${esc(drafts[room]?.name||'')}" placeholder="例如：雨夜归人" required><button type="submit" data-life-mutation>收藏当前搭配</button></div></form>`;}
  function list(){
    if(!host||room==='tea')return;
    const pane=host.querySelector('[data-life-list]');if(!pane)return;
    if(!data){pane.innerHTML=`<p class="city-life-empty">${loading?'正在翻开手记…':'暂时没能打开存档。'}${loadError?'<button type="button" data-life-action="reload">重新打开</button>':''}</p>`;return;}
    const archived=filter==='archive';
    if(room==='atelier'){
      const rows=data.outfits.filter(row=>Boolean(row.archived)===archived);
      pane.innerHTML=rows.length?rows.map(row=>{
        const eq=state?.quests?.equipped||{},active=Object.entries(row.equipped).every(([slot,id])=>eq[slot]===id);
        const names=Object.values(row.equipped).map(id=>state?.quests?.catalog?.find(item=>item.id===id)?.name).filter(Boolean);
        return `<article class="city-life-card"><div class="city-life-card-heading"><b>${esc(row.name)}</b><small>${Object.keys(row.equipped).length} 件外观${active?' · 正在穿用':''}</small></div><p>${esc(names.slice(0,4).join(' · '))}${names.length>4?' …':''}</p><div class="city-life-row-actions">${archived?'':`<button type="button" data-life-action="apply-outfit" data-life-id="${esc(row.id)}" data-life-mutation data-life-equipped="${active}" ${active?'disabled':''}>${active?'已换上':'换上整套'}</button>`}<button type="button" data-life-action="archive-outfit" data-life-id="${esc(row.id)}" data-life-mutation>${archived?'取回衣柜':'收入旧箱'}</button></div></article>`;
      }).join(''):`<p class="city-life-empty">${archived?'旧箱里还没有搭配。':'先试试已有外观，再把喜欢的一套留在这里。'}</p>`;
    }else{
      const rows=data.notes.filter(row=>(room==='station'?row.type==='plan':row.type!=='plan')&&Boolean(row.archived)===archived);
      pane.innerHTML=rows.length?rows.map(row=>`<article class="city-life-card" data-done="${row.done}"><div class="city-life-card-heading"><small>${types[row.type]} · ${esc(dateText(row))}</small>${row.done?'<span class="city-life-done">已收好 ✓</span>':''}</div><p>${esc(row.text)}</p><div class="city-life-row-actions">${archived?'':`${['plan','question'].includes(row.type)?`<button type="button" data-life-action="toggle-done" data-life-id="${esc(row.id)}" data-life-mutation>${row.done?'重新展开':row.type==='plan'?'这件事做完了':'已经有答案了'}</button>`:''}<button type="button" data-life-action="edit-note" data-life-id="${esc(row.id)}">修改</button>`}<button type="button" data-life-action="archive-note" data-life-id="${esc(row.id)}" data-life-mutation>${archived?'重新放回':'收进旧页'}</button></div></article>`).join(''):`<p class="city-life-empty">${archived?'这里保留收好的旧页，随时可以拿回来。':room==='station'?'行囊还是空的。也可以什么都不写，轻装回去。':'书屋里有空白的纸页，想写的时候再写。'}</p>`;
    }
    setBusy();
  }
  function draw(){
    if(!host)return;
    if(room==='tea'){drawTea();return;}
    host.innerHTML=`${room==='atelier'?outfitForm():noteForm()}<div class="city-life-status" data-life-status role="status" hidden></div><div class="city-life-tabs" role="group" aria-label="${room==='atelier'?'衣柜':'手记'}范围"><button type="button" data-life-action="filter" data-life-filter="active" aria-pressed="${filter==='active'}">${room==='atelier'?'我的衣柜':room==='station'?'随身行囊':'桌上的便笺'}</button><button type="button" data-life-action="filter" data-life-filter="archive" aria-pressed="${filter==='archive'}">${room==='atelier'?'旧箱':'收好的旧页'}</button></div><div class="city-life-list" data-life-list></div><small class="city-life-footnote">${room==='station'?'不设完成期限，也不会计入学习任务。':room==='atelier'?'只使用已拥有的物品，换装不消耗金币或钻石。':'仅保存在这台电脑的存档里，学习记录不会改变。'}</small>`;
    message();list();setBusy();
  }
  function updateTea(){
    if(!host||room!=='tea')return;
    const remain=Math.max(0,Math.ceil((restEnd-Date.now())/1000)),node=host.querySelector('[data-tea-clock]');
    if(node)node.textContent=restStarted?(remain?`${Math.floor(remain/60)}:${String(remain%60).padStart(2,'0')}`:'茶已经慢慢喝完了。'):'一杯茶的空闲';
    const start=host.querySelector('[data-life-action="start-tea"]');if(start)start.textContent=restStarted&&remain?'重新沏一杯':restStarted?'再坐一小会儿':'给自己留这几分钟';
    const cup=host.querySelector('.city-teacup');if(cup)cup.dataset.brewing=String(restStarted&&remain>0);
  }
  function stopTick(){if(timer!==null)root.clearTimeout(timer);timer=null;}
  function scheduleTea(){stopTick();updateTea();if(host&&room==='tea'&&visible()&&restEnd>Date.now())timer=root.setTimeout(scheduleTea,1000);}
  function drawTea(){
    host.innerHTML=`<div class="city-tea-service"><div class="city-teacup" aria-hidden="true"><i></i><i></i><i></i><span></span></div><div><span class="city-life-label">今晚喝点什么</span><div class="city-life-tabs">${Object.entries(teas).map(([id,[name]])=>`<button type="button" data-life-action="tea" data-tea="${id}" aria-pressed="${tea===id}">${name}</button>`).join('')}</div><p class="city-life-explainer">${teas[tea][1]}</p></div></div><div class="city-tea-rest"><span data-tea-clock aria-live="off"></span><label>坐一会儿 <select data-life-field="rest" aria-label="喝茶时间">${[1,3,5].map(n=>`<option value="${n}" ${restMinutes===n?'selected':''}>${n} 分钟</option>`).join('')}</select></label></div><div class="city-life-row-actions"><button type="button" data-life-action="start-tea">给自己留这几分钟</button><button type="button" data-life-action="stop-tea">随时起身</button></div><small class="city-life-footnote">不用领取奖励，也不必等倒计时结束。离开时，这杯茶就留在这里。</small>`;
    scheduleTea();
  }
  async function load(){
    if(loading)return;loading=true;loadError='';list();setBusy();
    try{const result=await bridge.api('/api/city-life');if(!data||Number(result.revision)>=Number(data.revision))data=result;}
    catch(e){loadError=e.message||'暂时无法打开存档。';}
    finally{loading=false;if(host){list();message();setBusy();}}
  }
  async function mutate(path,payload,onSuccess){
    if(busy||!data)return;remember();busy=true;error='';message();setBusy();
    const key=JSON.stringify([path,payload]);let requestId=retryIds.get(key);if(!requestId){requestId=root.crypto.randomUUID();retryIds.set(key,requestId);if(retryIds.size>64)retryIds.delete(retryIds.keys().next().value);}
    const entryGeneration=generation,entryRoom=room;
    try{
      const result=await bridge.api('/api/city-life/'+path,{...payload,requestId});
      data=result.cityLife;retryIds.delete(key);
      if(result.quests){state={...state,quests:result.quests};bridge.acceptQuests?.(result.quests);bridge.playSound?.('equip');Promise.resolve(bridge.refresh?.()).catch(()=>{});}
      onSuccess?.(entryRoom,entryGeneration===generation);
      if(entryGeneration===generation){error='';remember();draw();}else bridge.toast?.('已保存到城市手记。');
    }catch(e){if(entryGeneration===generation){error=e.message||'保存未完成，内容仍在这里，可以重试。';message();}else bridge.toast?.(e.message||'保存没有完成，内容仍留在草稿中。');}
    finally{busy=false;setBusy();}
  }
  function submit(event){
    const form=event.target.closest('[data-life-form]');if(!form)return;event.preventDefault();
    if(form.dataset.lifeForm==='note'){
      const text=field('text').trim(),type=room==='station'?'plan':field('type');if(!text)return;
      const payload={text,type,...(room==='station'?{day:field('day')}:{}),...(editing?{noteId:editing}:{})};
      mutate(editing?'note-update':'note',payload,(which,current)=>{drafts[which]={type:payload.type,day:payload.day};if(current){editing=null;for(const node of host.querySelectorAll('[data-life-field="text"]'))node.value='';}});
    }else{
      const name=field('name').trim();if(!name)return;
      mutate('outfit',{name,equipped:{...state?.quests?.equipped}},(which,current)=>{drafts[which]={};if(current)host.querySelector('[data-life-field="name"]').value='';});
    }
  }
  function click(event){
    const node=event.target.closest('[data-life-action]');if(!node||node.disabled)return;
    const action=node.dataset.lifeAction,id=node.dataset.lifeId;
    if(busy&&['edit-note','cancel-edit'].includes(action))return;
    if(action==='reload'){load();return;}
    if(action==='filter'){remember();filter=node.dataset.lifeFilter;draw();return;}
    if(action==='cancel-edit'){editing=null;drafts[room]={};draw();return;}
    if(action==='tea'){tea=node.dataset.tea;drawTea();return;}
    if(action==='start-tea'){restMinutes=Number(field('rest'))||3;restEnd=Date.now()+restMinutes*60000;restStarted=true;scheduleTea();return;}
    if(action==='stop-tea'){restEnd=0;restStarted=false;scheduleTea();return;}
    const note=data?.notes.find(row=>row.id===id),outfit=data?.outfits.find(row=>row.id===id);
    if(action==='edit-note'&&note){editing=id;drafts[room]={text:note.text,type:note.type,day:note.day};draw();host.querySelector('textarea')?.focus();return;}
    if(action==='toggle-done'&&note)mutate('note-update',{noteId:id,done:!note.done});
    if(action==='archive-note'&&note)mutate('note-update',{noteId:id,archived:!note.archived});
    if(action==='apply-outfit'&&outfit)mutate('outfit-apply',{outfitId:id});
    if(action==='archive-outfit'&&outfit)mutate('outfit-archive',{outfitId:id,archived:!outfit.archived});
  }
  function unmount(){remember();stopTick();generation++;if(host){host.removeEventListener('click',click);host.removeEventListener('submit',submit);}host=null;room=null;restEnd=0;restStarted=false;}
  function mount(place,container,next){
    if(!rooms.has(place)||!container)return;state=next;
    if(host===container&&room===place){if(place==='atelier'){const key=JSON.stringify(state?.quests?.equipped||{});if(host.dataset.equipment!==key){host.dataset.equipment=key;list();}}return;}
    unmount();host=container;room=place;editing=drafts[room]?.editing||null;filter=drafts[room]?.filter||'active';error='';
    host.addEventListener('click',click);host.addEventListener('submit',submit);draw();if(place!=='tea')load();
  }
  function init(callbacks={}){bridge=callbacks;if(initialized)return;initialized=true;const visibility=event=>{if(event.detail?.visible===false||!visible())stopTick();else scheduleTea();};document.addEventListener('visibilitychange',visibility);document.addEventListener('focusquest:visibility',visibility);}
  function setFilter(next){if(!host||room==='tea'||!['active','archive'].includes(next)||filter===next)return;remember();filter=next;draw();}
  root.FocusCityLife={init,mount,unmount,setFilter};
})(globalThis);
