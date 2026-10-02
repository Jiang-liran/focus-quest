(function(root){
  'use strict';
  const names={bar:'进度条',fx:'星岛特效',avatar:'我的时装',banner:'旅人铭牌',theme:'星岛环境',companion:'随行伙伴',relic:'星岛圣物',portal:'远征之门',island:'主岛布置',camp:'营地地貌',fire:'篝火样式',tent:'歇脚帐篷',campgear:'营地陈设',campglow:'营地氛围',chatframe:'对话外观',camptrail:'营地小径',campmark:'营地地标'};
  const campSlots=new Set(['camp','fire','tent','campgear','campglow','chatframe','camptrail','campmark']);
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let bridge=null,state=null,stamp=-Infinity,preview=null,slots=[],slot=null,busy=false,anchor=null,anchorCampfire=false,anchorCampPlace=null,menuKey=null,inputMode='pointer';
  const visible=()=>$('quick-skins')&&!$('quick-skins').hidden;
  function paint(){
    if(!state)return;
    const equipped={...state.equipped,...(preview?{[preview.slot]:preview.id}:{})};
    delete document.documentElement.dataset.npc;
    for(const key of Object.keys(names))if(equipped[key])document.documentElement.dataset[key]=equipped[key];
    root.ShopArt?.apply(equipped);
    root.FocusCampfire?.previewEquipment(preview?{[preview.slot]:preview.id}:null);
    root.FocusCitadel?.previewEquipment(preview?{[preview.slot]:preview.id}:null);
    const player=$('player-outfit');
    if(player&&root.QuestArt&&player.querySelector('svg')?.dataset.outfit!==equipped.avatar){
      player.innerHTML=root.QuestArt.avatar('player',equipped.avatar);
    }
  }
  function setPreview(item){
    if(busy)return;
    preview=item&&item.owned?item:null;
    paint();
    $('quick-skin-status').textContent=preview?`正在预览「${preview.name}」· 点击换上`:'移到外观上预览，点击即可换上。';
  }
  function owned(){return (state?.catalog||[]).filter(item=>item.slot===slot&&item.owned&&Object.hasOwn(names,item.slot));}
  function thumb(item){
    return campSlots.has(item.slot)?root.FocusCampfireShopArt?.preview(item.id,state.equipped)||'':root.ShopArt?.preview(item.id)||'';
  }
  function list(){
    if(!visible())return;
    const items=owned(),key=JSON.stringify([slots,slot,items.map(i=>[i.id,i.name]),state.equipped[slot],busy]);
    if(key===menuKey)return;
    menuKey=key;
    const focused=document.activeElement?.dataset.quickItem;
    $('quick-skin-title').textContent=`更换${names[slot]}`;
    $('quick-skin-tabs').innerHTML=slots.length>1?slots.map(key=>`<button type="button" data-quick-slot="${key}" aria-pressed="${key===slot}">${names[key]}</button>`).join(''):'';
    $('quick-skin-tabs').hidden=slots.length<2;
    $('quick-skin-items').innerHTML=items.length?items.map(item=>`<button type="button" class="quick-skin-item" data-quick-item="${esc(item.id)}" aria-pressed="${state.equipped[slot]===item.id}" ${busy?'disabled':''}><span class="quick-skin-thumb" aria-hidden="true">${thumb(item)}</span><span><strong>${esc(item.name)}</strong><small>${state.equipped[slot]===item.id?'正在使用':item.coins||item.diamonds?'已收藏 · 点击换上':'初始外观 · 免费使用'}</small></span><i aria-hidden="true">${state.equipped[slot]===item.id?'✓':'↗'}</i></button>`).join(''):'<p class="quick-skin-empty">还没有这一类外观。</p>';
    for(const b of $('quick-skin-tabs').querySelectorAll('[data-quick-slot]'))b.addEventListener('click',()=>{
      if(busy)return;preview=null;slot=b.dataset.quickSlot;paint();list();
      $('quick-skin-status').textContent='移到外观上预览，点击即可换上。';
    });
    for(const b of $('quick-skin-items').querySelectorAll('[data-quick-item]')){
      const item=items.find(i=>i.id===b.dataset.quickItem);
      b.addEventListener('mouseenter',()=>{if(inputMode==='pointer')setPreview(item);});
      b.addEventListener('mousemove',()=>{inputMode='pointer';if(preview?.id!==item.id)setPreview(item);});
      b.addEventListener('focus',()=>setPreview(item));
      const leave=()=>{if(preview?.id===item.id)setPreview(null);};
      b.addEventListener('mouseleave',()=>{if(inputMode==='pointer')leave();});b.addEventListener('blur',leave);
      b.addEventListener('click',()=>equip(item));
      if(focused===item.id&&!busy)b.focus({preventScroll:true});
    }
  }
  function render(next){
    if(!next)return;
    const fraction=String(next.now).match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/);
    const nextStamp=Date.parse(next.now)*1000+Number((fraction?.[1]||'').padEnd(6,'0').slice(3,6));
    if(Number.isFinite(nextStamp)&&nextStamp<stamp)return;
    if(!Number.isFinite(nextStamp)&&Number.isFinite(stamp))return;
    if(Number.isFinite(nextStamp))stamp=nextStamp;
    state=next;
    if(preview&&!next.catalog.some(i=>i.id===preview.id&&i.owned))preview=null;
    paint();list();
  }
  function close(restoreFocus=true){
    const wasVisible=visible();
    const citadelPlace=anchor?.closest?.('[data-citadel-place]')?.dataset.citadelPlace;
    const citadelArt=!!anchor?.closest?.('.citadel-art');
    $('quick-skins').hidden=true;preview=null;menuKey=null;paint();
    if(wasVisible&&restoreFocus){
      if(citadelArt&&root.FocusCitadel?.isOpen()){
        const replacement=citadelPlace&&Array.from($('citadel-scene').querySelectorAll('[data-citadel-place]')).find(el=>el.dataset.citadelPlace===citadelPlace);
        (replacement||$('citadel-close'))?.focus?.({preventScroll:true});
      }else if(anchorCampfire&&root.FocusCampfireRoom?.isOpen()){
        const replacement=anchorCampPlace&&Array.from($('campfire-room')?.querySelectorAll('[data-camp-place]')||[]).find(el=>el.dataset.campPlace===anchorCampPlace);
        const target=replacement||(anchor?.isConnected?anchor:null);
        target?.focus?.({preventScroll:true});
        if(!target||document.activeElement!==target)$('campfire-room-close')?.focus?.({preventScroll:true});
      }else if(anchor?.isConnected)anchor.focus?.({preventScroll:true});
    }
  }
  function open(requested,position={}){
    if(!state||busy)return;
    const valid=(Array.isArray(requested)?requested:String(requested||'').split(/\s+/)).filter(key=>Object.hasOwn(names,key));
    if(!valid.length)return;
    const targetRect=position.anchor?.getBoundingClientRect?.();
    slots=[...new Set(valid)];slot=slots[0];preview=null;inputMode='pointer';anchor=position.anchor||document.activeElement;menuKey=null;
    // A hover can replace the scene SVG and detach its hotspots before close().
    anchorCampfire=!!anchor?.closest?.('#advice-card,#campfire-room,.camp-world-art');
    anchorCampPlace=anchor?.closest?.('[data-camp-place]')?.dataset.campPlace||null;
    paint();$('quick-skins').hidden=false;$('quick-skin-status').textContent='移到外观上预览，点击即可换上。';
    list();
    const menu=$('quick-skins'),rect=menu.getBoundingClientRect(),gap=12;
    let x=Number(position.x)||gap;
    if(targetRect?.right+gap+rect.width<=root.innerWidth-gap)x=targetRect.right+gap;
    else if(targetRect?.left-rect.width-gap>=gap)x=targetRect.left-rect.width-gap;
    menu.style.left=Math.max(gap,Math.min(x,root.innerWidth-rect.width-gap))+'px';
    menu.style.top=Math.max(gap,Math.min(Number(position.y)||gap,root.innerHeight-rect.height-gap))+'px';
    $('quick-skin-close').focus({preventScroll:true});
  }
  async function equip(item){
    if(busy||!item?.owned)return;
    if(state.equipped[item.slot]===item.id){close();return;}
    busy=true;preview=item;paint();list();$('quick-skin-status').textContent='正在换装…';
    try{
      const result=await bridge.api('/api/shop/equip',{itemId:item.id});
      preview=null;
      root.FocusQuests?.render(result);render(result);close();
      bridge.toast('外观已更新',state.catalog.find(i=>i.id===state.equipped[item.slot])?.name||item.name);
    }catch(error){
      preview=null;paint();
      if(visible())$('quick-skin-status').textContent=`暂未确认换装：${error.message}`;
      else bridge.toast('暂未确认换装',error.message,true);
    }finally{busy=false;list();}
    // The equip response is authoritative; a later refresh cannot unconfirm it.
    try{await bridge.refresh(true);}catch(_){}
  }
  function targetSlots(target){
    if(target.closest('[data-skin-block],.campfire-speaker,.campfire-character,.q-portrait,#shop-keeper'))return null;
    const roadside=target.closest('#campfire-room-open');if(roadside)return roadside;
    return target.closest('[data-skin-slots]');
  }
  function init(callbacks){
    if(bridge)return;bridge=callbacks;
    $('quick-skin-close').addEventListener('click',()=>close());
    document.addEventListener('contextmenu',event=>{
      if(document.querySelector('dialog[open]')||event.target.closest('#quick-skins'))return;
      const target=targetSlots(event.target);if(!target)return;
      event.preventDefault();open(target.dataset.skinSlots,{x:event.clientX,y:event.clientY,anchor:target});
    });
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-skin-open]');if(!button)return;
      const rect=button.getBoundingClientRect();open(button.dataset.skinOpen,{x:rect.left,y:rect.bottom+6,anchor:button});
    });
    document.addEventListener('pointerdown',event=>{if(visible()&&!event.target.closest('#quick-skins'))close(false);});
    document.addEventListener('keydown',event=>{
      if(visible()){
        if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
        if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
          const buttons=[...$('quick-skin-items').querySelectorAll('button:not(:disabled)')];if(!buttons.length)return;
          inputMode='keyboard';event.preventDefault();const i=buttons.indexOf(document.activeElement);
          const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?(i+1)%buttons.length:(i-1+buttons.length)%buttons.length;
          buttons[next].focus();return;
        }
      }else if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){
        const target=targetSlots(event.target);if(!target)return;
        const rect=target.getBoundingClientRect();event.preventDefault();open(target.dataset.skinSlots,{x:rect.left,y:rect.bottom+6,anchor:target});
      }
    },true);
    root.addEventListener('resize',()=>{if(visible())close(false);});
    root.addEventListener('blur',()=>{if(visible())close(false);});
    document.addEventListener('scroll',event=>{if(visible()&&!$('quick-skins').contains(event.target))close(false);},true);
  }
  root.FocusQuickSkins={init,render,open,close};
})(typeof globalThis!=='undefined'?globalThis:this);
