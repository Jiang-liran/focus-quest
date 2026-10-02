(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const islands={
    math:{name:'数学',x:131,y:151,color:'#a6e1c5',light:'#e8f6d7',shade:'#47796f',seal:'geometry'},
    cs:{name:'408',x:875,y:149,color:'#b9c6fc',light:'#ece8ff',shade:'#626f9d',seal:'circuit'},
    politics:{name:'政治',x:127,y:376,color:'#e9bfb2',light:'#fff0d6',shade:'#997280',seal:'pages'},
    english:{name:'英语',x:880,y:377,color:'#a8e3e7',light:'#e9f8ea',shade:'#57899b',seal:'sail'},
    main:{name:'四科共辉',x:580,y:230,color:'#e9d69d',light:'#fff3ce',shade:'#91806b',seal:'constellation'},
  };
  let bridge=null,latest=null,mode='live',busy=null,markup='';
  // A receipt is authoritative even if an older poll finishes afterwards.
  // Keep this bounded: the database, not browser storage, owns the daily claims.
  const received=new Set();
  function remember(key){received.add(key);if(received.size>40)received.delete(received.values().next().value);}
  function key(day,id){return `${day}:${id}`;}
  function live(){
    const rewards=latest?.islandRewards;
    return mode==='live'&&rewards?.isToday===true&&rewards.day===rewards.today
      &&latest.date===latest.today&&latest.date===rewards.day;
  }
  function entries(){
    const rewards=latest?.islandRewards;
    if(!live())return [];
    return [...(rewards.subjects||[]),rewards.main].filter(item=>item&&islands[item.id]
      &&item.available===true&&item.eligible===true&&!item.claimed&&!received.has(key(rewards.day,item.id)));
  }
  function emblem(kind){
    if(kind==='geometry')return '<path d="m0-8 8 8-8 8-8-8Z"/><path d="M-8 0H8M0-8V8" opacity=".55"/>';
    if(kind==='circuit')return '<rect x="-5" y="-5" width="10" height="10" rx="1.5"/><path d="M-9-3h4m-4 6h4m10-6h4m-4 6h4M-3-9v4m6-4v4m-6 10v4m6-4v4"/>';
    if(kind==='pages')return '<path d="M0-5q-5-4-10-1V7q5-3 10 1 5-4 10-1V-6Q5-9 0-5ZM0-5V8"/>';
    if(kind==='sail')return '<path d="M0-10V7M-3-8-10 3h7ZM3-5 10 3H3ZM-11 7h22l-5 4H-6Z"/>';
    return '<path d="M0-9 3-3 9 0 3 3 0 9-3 3-9 0-3-3Z"/><circle cx="-12" cy="-8" r="1.3" fill="#a6e1c5" stroke="none"/><circle cx="12" cy="-8" r="1.3" fill="#b9c6fc" stroke="none"/><circle cx="-12" cy="8" r="1.3" fill="#e9bfb2" stroke="none"/><circle cx="12" cy="8" r="1.3" fill="#a8e3e7" stroke="none"/>';
  }
  function gift(item,index){
    const art=islands[item.id],main=item.id==='main';
    const label=`领取${art.name}礼盒：${item.reward.coins}金币和${item.reward.diamonds}钻石，另有1张${main?'钻石':'金币'}抽奖券`;
    return `<g class="island-gift${main?' island-gift-main':''}" data-island-gift="${item.id}" data-skin-block="true" role="button" tabindex="0" aria-label="${esc(label)}" aria-disabled="${Boolean(busy)}" ${busy?.id===item.id?'aria-busy="true"':''} style="--gift-color:${art.color};--gift-light:${art.light};--gift-shade:${art.shade};--gift-delay:-${index*.65}s" transform="translate(${art.x} ${art.y})">
      <title>${esc(label)} · 每日可领取一次</title>
      <ellipse class="island-gift-shadow" cy="47" rx="24" ry="7" fill="${art.color}" opacity=".17"/>
      <ellipse class="island-gift-focus" cy="9" rx="43" ry="49" fill="none" stroke="${art.light}" stroke-width="1.5"/>
      <rect class="island-gift-hit" x="-42" y="-40" width="84" height="89" rx="23" fill="transparent"/>
      <g class="island-gift-float"><g class="island-gift-lift">
        <ellipse class="island-gift-halo" cy="8" rx="42" ry="37" fill="${art.color}" opacity=".09"/>
        <path d="m-29 0 29-12 29 12v27L0 42-29 27Z" fill="${art.shade}"/>
        <path d="M0 14 29 0v27L0 42Z" fill="${art.color}" opacity=".6"/>
        <path d="M-29 0 0 14v28l-29-15Z" fill="${art.color}" opacity=".28"/>
        <path d="m-18 5 7 3v28l-7-4Zm29 3 7-3v27l-7 4Z" fill="${art.light}" opacity=".76"/>
        <g class="island-gift-lid"><path d="m-32-4 32-15 32 15L0 12Z" fill="${art.color}"/><path d="M-32-4 0 12 32-4v8L0 20-32 4Z" fill="${art.light}"/><path d="m-7-16 7-3L32-4 25-1Zm-25 12 7 3 32-15-7-3Z" fill="${art.light}"/>
          <path d="M0-16c-21 0-24-22-13-18 9 3 12 16 13 18Zm0 0c21 0 24-22 13-18-9 3-12 16-13 18Z" fill="none" stroke="${art.light}" stroke-width="4" stroke-linejoin="round"/><path d="m0-20 5 4-5 5-5-5Z" fill="${art.light}"/></g>
        <g transform="translate(0 23) scale(.68)" fill="${art.shade}" stroke="${art.light}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${emblem(art.seal)}</g>
        <g class="island-gift-sparks" fill="${art.light}"><path d="m-37-19 2-5 2 5 5 2-5 2-2 5-2-5-5-2ZM37 4l1.5-4L40 4l4 1.5-4 1.5-1.5 4L37 7l-4-1.5Z"/><circle cx="25" cy="-28" r="1.7"/></g>
      </g></g>
      <g class="island-gift-hint" aria-hidden="true" transform="translate(0 65)"><rect x="-62" y="-10" width="124" height="21" rx="10.5" fill="#172334" fill-opacity=".97" stroke="${art.color}" stroke-opacity=".55"/><text text-anchor="middle" y="4" fill="${art.light}" stroke="none" font-size="10">${busy?.id===item.id?'正在收好…':`打开 · ${item.reward.coins} 金币 + ${item.reward.diamonds} 钻`}</text></g>
    </g>`;
  }
  function paint(){
    const host=$('island-rewards');if(!host)return;
    const gifts=entries();
    const html=gifts.length?`<svg class="island-rewards-art" viewBox="0 0 1000 540" role="group" aria-label="今日达成礼盒" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="none">${gifts.map(gift).join('')}</svg>`:'';
    host.hidden=!gifts.length;
    if(html===markup)return;
    const focused=host.contains(document.activeElement)?document.activeElement?.closest?.('[data-island-gift]')?.dataset.islandGift:null;
    host.innerHTML=html;markup=html;
    if(focused&&bridge?.isHome?.()!==false){
      const next=host.querySelector(`[data-island-gift="${focused}"]`)||host.querySelector('[data-island-gift]')||$('citadel-enter');
      next?.focus({preventScroll:true});
    }
  }
  function render(snapshot,options={}){
    latest=snapshot;mode=options.mode||'live';
    const rewards=snapshot?.islandRewards;
    if(rewards)for(const item of [...(rewards.subjects||[]),rewards.main])if(item?.claimed)remember(key(rewards.day,item.id));
    paint();
  }
  async function claim(id){
    if(busy||document.hidden||bridge?.isHome?.()===false)return;
    const item=entries().find(entry=>entry.id===id);if(!item)return;
    const day=latest.islandRewards.day;
    busy={day,id};bridge.unlock?.();paint();
    try{
      const result=await bridge.api('/api/island-rewards/claim',{day,island:id});
      if(result.day!==day||result.island!==id||!result.islandRewards||!result.wallet||!result.reward)throw new Error('礼盒回执暂未返回，请再点一次确认。');
      remember(key(day,id));
      if(latest?.date===day&&latest?.today===day)latest={...latest,islandRewards:result.islandRewards};
      bridge.acceptReceipt?.(result);
      if(!result.alreadyClaimed){
        if(!document.hidden)bridge.playSound?.(id==='main'?'victory':'delivery',{key:`island-gift:${day}:${id}`});
        bridge.toast?.(id==='main'?'四科共辉，星礼已收好':`${islands[id].name}岛的礼物已收好`,`+${result.reward.coins} 金币 · +${result.reward.diamonds} 钻石${root.FocusLottery?.ticketText?.(result.ticketGrants)||''}`);
      }else bridge.toast?.('这份礼物已经收好','金币和钻石已在行囊里。');
    }catch(error){bridge.toast?.('礼盒还在等你',error.message,true);}
    finally{busy=null;paint();}
    // The receipt already removes the gift. A failed refresh cannot undo it.
    try{await bridge.refresh?.(true);}catch(_){}
  }
  function init(callbacks){
    if(bridge)return;bridge=callbacks;
    const host=$('island-rewards');if(!host)return;
    host.addEventListener('click',event=>{
      if(event.defaultPrevented||(event.button!==undefined&&event.button!==0)||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
      const target=event.target.closest('[data-island-gift]');if(!target||!host.contains(target))return;
      event.preventDefault();event.stopPropagation();claim(target.dataset.islandGift);
    });
    host.addEventListener('keydown',event=>{
      if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
      const target=event.target.closest('[data-island-gift]');if(!target||!host.contains(target)||!['Enter',' '].includes(event.key))return;
      event.preventDefault();event.stopPropagation();if(!event.repeat)claim(target.dataset.islandGift);
    });
  }
  root.FocusIslandRewards={init,render};
})(typeof globalThis!=='undefined'?globalThis:this);
