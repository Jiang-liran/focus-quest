(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slots=new Set(['theme','fx','avatar','companion','relic','portal']);
  const fallbackPlaces=[
    {id:'library',name:'雨巷书屋',subtitle:'翻一页手记',copy:'纸页收好今天的专注，窗边留着一盏灯。'},
    {id:'tea',name:'听雨茶馆',subtitle:'在窗边坐坐',copy:'茶已经温好，今晚不必急着说些什么。'},
    {id:'observatory',name:'我的家',subtitle:'高层窗边，灯火可亲',copy:'窗外是雨夜，屋里有一盏为你留着的灯。'},
    {id:'atelier',name:'星织小铺',subtitle:'挑一件喜欢的物品',copy:'喜欢的外观留在橱窗里，慢慢挑。'},
    {id:'arcade',name:'星海游乐场',subtitle:'偶尔玩一局',copy:'熟悉的扫雷和其他小游戏都在这里，随时可以回来。'},
    {id:'station',name:'归途车站',subtitle:'回群岛或营地',copy:'站台亮着柔和的灯，回去的路一直都在。'}
  ];
  const teaLines=['先坐一会儿吧。雨会自己慢慢下，不需要你做什么。','窗上这一滴雨走得很慢，也没有落下。','有些晚上，安安静静地喝完一杯茶，就很好。','今天读过的、想过的，先留在今天。现在可以松一松肩膀。','远处还有几扇亮着的窗。今晚，你并不是独自一个人。','杯子还温着。想再坐一会儿，或现在回去，都可以。'];
  let bridge={},state=null,equipped={},equipmentStamp=-Infinity,equipmentPreview=null,initialized=false;
  let anchor=null,inertBefore=[];
  let selected=null,streetKey='',roomKey='',contentKey='',zoom=1,panX=0,panY=0,drag=null,suppressClickUntil=0,wheelTimer=null;
  let teaLine=0,windowMode='rain',rooftopMode='rain',homeView='home';
  const places=()=>root.FocusRainCityArt?.places||fallbackPlaces;
  const place=id=>places().find(p=>p.id===id);
  const isOpen=()=>!!$('citadel-view')&&!$('citadel-view').hidden;
  const isVisible=()=>!document.hidden&&root.FocusRuntime?.isVisible?.()!==false;
  const motionAllowed=()=>state?.settings?.motion!==false&&!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const visibleEquipment=()=>({...equipped,...equipmentPreview});
  function setText(id,text){if($(id)&&$(id).textContent!==text)$(id).textContent=text;}
  function setHTML(id,html){if($(id)&&$(id).innerHTML!==html)$(id).innerHTML=html;}
  function timestamp(now){const fraction=String(now).match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/);return Date.parse(now)*1000+Number((fraction?.[1]||'').padEnd(6,'0').slice(3,6));}
  function applyEquipment(next,now){
    const stamp=timestamp(now);if((Number.isFinite(stamp)&&stamp<equipmentStamp)||(!Number.isFinite(stamp)&&Number.isFinite(equipmentStamp)))return;
    if(Number.isFinite(stamp))equipmentStamp=stamp;
    equipped={...(next||{})};if(isOpen())paint();
  }
  function previewEquipment(override){equipmentPreview=override?{...override}:null;if(isOpen())paint();}
  function focusEntry(node){
    if(!node?.isConnected||node.disabled||!node.getClientRects?.().length)return false;
    for(let parent=node;parent;parent=parent.parentElement)if(parent.hidden||parent.inert)return false;
    node.focus?.({preventScroll:true});return document.activeElement===node;
  }
  function roomContent(){
    if(selected==='library')return '<span class="city-room-eyebrow">雨巷书屋 · 私人的纸页</span><h3>想法先放在这里。</h3><p>随手记、待查的问题、舍不得忘的一句话。下次来，纸页还在。</p><div id="city-life-pane"></div><div class="city-room-actions"><button type="button" class="city-secondary" data-city-action="review">翻开学习复盘 ↗</button></div>';
    if(selected==='tea')return `<span class="city-room-eyebrow">窗边的位置，为你留着</span><h3>茶暖着，雨还在下。</h3><p id="city-tea-line" class="city-tea-line" aria-live="polite">${teaLines[teaLine%teaLines.length]}</p><div class="city-room-actions"><button type="button" data-city-action="tea-chat">听店主说一句</button><button type="button" class="city-secondary" data-city-action="tea-window" aria-pressed="${windowMode==='lamplight'}">${windowMode==='lamplight'?'看窗外的雨':'把灯调暖一些'}</button></div><div id="city-life-pane"></div>`;
    if(selected==='observatory'){
      const copy=homeView==='panorama'?['高层窗边 · 雨夜全景','整座城，慢慢安静下来。','']:
        homeView==='rooftop'?['我的家 / 屋顶天台',rooftopMode==='stars'?'云隙里，还有几颗星。':'在屋檐下，看一会儿远方。','楼下是灯火，抬头是夜空。在这里，不用急着赶路。']:
        ['欢迎回家','门关上，今晚就慢一点。','窗边能看整座城的夜景，右侧的小门通向屋顶。'];
      return `<span class="city-room-eyebrow">${copy[0]}</span><h3>${copy[1]}</h3>${copy[2]?`<p>${copy[2]}</p>`:''}<div class="city-room-actions">${homeView==='home'?'<button type="button" data-city-action="home-window">到窗边看雨</button><button type="button" class="city-secondary" data-city-action="home-rooftop">上屋顶坐坐</button>':'<button type="button" data-city-action="home-living">回到家里</button>'}${homeView==='rooftop'?`<button type="button" class="city-secondary" data-city-action="sky" aria-pressed="${rooftopMode==='stars'}">${rooftopMode==='stars'?'回到雨夜':'看一眼云隙星光'}</button>`:''}</div><div id="city-home-audio"></div>`;
    }
    if(selected==='atelier')return '<span class="city-room-eyebrow">星织小铺 · 你的私人衣柜</span><h3>留住喜欢的一整套。</h3><div class="city-room-actions"><button type="button" data-skin-open="interface theme bar fx avatar banner companion relic portal camp fire tent campgear campglow chatframe island camptrail campmark">搭配已有外观</button><button type="button" class="city-secondary" data-city-action="shop">逛逛商店 ↗</button></div><div id="city-life-pane"></div>';
    if(selected==='arcade')return `<span class="city-room-eyebrow">星海游乐场 · 一小段休息</span><h3>熟悉的游戏，都留在这里。</h3><p>扫雷和其他游戏、原来的成绩与奖励都保留着。只想看看街景，也可以随时离开。</p><div class="city-room-actions"><button type="button" data-city-action="arcade">${state.arcade?.active?'继续未结束的游戏':'进入星海游乐场'} ↗</button></div><small class="city-room-note">${Number(state.arcade?.available)||0} 张可用游玩券 · 进入大厅不会消耗游玩券</small>`;
    return '<span class="city-room-eyebrow">归途车站 · 灯还亮着</span><h3>下一程，轻装出发。</h3><p>把明天想做的小事装进行囊，今晚就不用一直记着了。</p><div id="city-life-pane"></div><div class="city-room-actions"><button type="button" data-city-action="home">回到群岛</button><button type="button" class="city-secondary" data-city-action="camp">去篝火营地</button></div>';
  }
  function paint(){
    if(!isOpen()||!state||!root.FocusRainCityArt)return;
    const view=$('citadel-view'),eq=visibleEquipment(),inRoom=!!selected;
    view.dataset.motion=String(motionAllowed());view.dataset.paused=String(!isVisible());view.dataset.room=selected||'street';view.dataset.homeView=selected==='observatory'?homeView:'';
    $('city-street').hidden=inRoom;$('city-room').hidden=!inRoom;
    setText('citadel-title',selected==='observatory'?(homeView==='panorama'?'窗边夜景':homeView==='rooftop'?'屋顶天台':'我的家'):inRoom?place(selected).name:'星辉城');
    setText('citadel-theme',inRoom?'星辉城 / '+place(selected).subtitle:'雨夜里的灯，始终为你亮着');
    setText('citadel-close',selected==='observatory'&&homeView!=='home'?'← 回到家里':inRoom?'← 返回街道':'← 返回群岛');
    setText('city-street-caption','沿着雨巷走走 · 点击亮着灯的建筑，进去坐坐');
    const key=JSON.stringify(eq);
    if(!inRoom&&key!==streetKey){
      streetKey=key;const focused=$('citadel-scene').contains(document.activeElement)?document.activeElement?.closest('[data-city-place]')?.dataset.cityPlace:null;
      $('citadel-scene').innerHTML=root.FocusRainCityArt.scene(state,eq,{interactive:true});
      if(focused)$('citadel-scene').querySelector(`[data-city-place="${focused}"]`)?.focus({preventScroll:true});
    }
    $('city-interior-art').setAttribute('aria-hidden',selected==='observatory'?'false':'true');
    if(inRoom){
      const mode=selected==='tea'?windowMode:selected==='observatory'?(homeView==='rooftop'?rooftopMode:homeView):'rain',key=JSON.stringify([selected,eq,mode]);
      if(key!==roomKey){roomKey=key;$('city-interior-art').innerHTML=root.FocusRainCityArt.interior(selected,state,eq,{mode,interactive:selected==='observatory'});}
      const html=roomContent();if(html!==contentKey){contentKey=html;
        const action=$('city-room-content').contains(document.activeElement)?document.activeElement?.dataset?.cityAction:null;
        root.FocusCityLife?.unmount();$('city-room-content').innerHTML=html;
        if(action)$('city-room-content').querySelector(`[data-city-action="${action}"]`)?.focus({preventScroll:true});
      }
      if(selected==='observatory')root.FocusAmbience?.mount($('city-home-audio'),'home');
      else root.FocusCityLife?.mount(selected,$('city-life-pane'),state);
    }
  }
  function render(next){if(!next)return;state=next;applyEquipment(next.quests?.equipped||equipped,next.quests?.now);if(isOpen())paint();}
  // Milestones and rewards continue to belong to the homepage; the city is a quiet place to visit.
  function acceptProgress(){return false;}
  function finishDrag(){const previous=drag;drag=null;if(previous?.moved)suppressClickUntil=Date.now()+250;const stage=$('citadel-stage');stage.classList.remove('dragging');if(previous&&stage.hasPointerCapture?.(previous.id))stage.releasePointerCapture?.(previous.id);}
  function finishWheel(){if(wheelTimer!==null)root.clearTimeout(wheelTimer);wheelTimer=null;$('citadel-stage').classList.remove('wheeling');}
  function clearCameraGesture(){finishDrag();finishWheel();}
  function camera(){const limit=(zoom-1)*50;panX=Math.max(-limit,Math.min(limit,panX));panY=Math.max(-limit,Math.min(limit,panY));$('citadel-camera').style.transform=`translate(${panX}%,${panY}%) scale(${zoom})`;$('citadel-stage').dataset.zoomed=String(zoom>1);setText('citadel-zoom',Math.round(zoom*100)+'%');$('citadel-zoom-out').disabled=zoom<=1;$('citadel-zoom-in').disabled=zoom>=2.4;}
  function wheelCamera(event){
    if(!isOpen()||selected||event.defaultPrevented)return;
    event.preventDefault();if(document.querySelector('dialog[open]')||($('quick-skins')&&!$('quick-skins').hidden)||event.target.closest('button,input,select,textarea'))return;
    const stage=$('citadel-stage'),rect=stage.getBoundingClientRect();if(!(rect.width>0&&rect.height>0)||!Number.isFinite(event.deltaY)||!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY))return;
    const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?rect.height:1);if(!pixels)return;
    if(!stage.classList.contains('wheeling')&&root.DOMMatrixReadOnly&&root.getComputedStyle){const matrix=new root.DOMMatrixReadOnly(root.getComputedStyle($('citadel-camera')).transform);if(matrix.a>=1&&matrix.a<=2.4&&matrix.b===0&&matrix.c===0&&matrix.a===matrix.d){zoom=matrix.a;panX=matrix.e/rect.width*100;panY=matrix.f/rect.height*100;}}
    const next=Math.max(1,Math.min(2.4,zoom*Math.exp(-Math.max(-240,Math.min(240,pixels))*.002)));if(next===zoom)return;
    finishDrag();finishWheel();const x=(event.clientX-rect.left)/rect.width*100-50,y=(event.clientY-rect.top)/rect.height*100-50,ratio=next/zoom;
    panX=x-(x-panX)*ratio;panY=y-(y-panY)*ratio;zoom=next;stage.classList.add('wheeling');camera();
    const timer=root.setTimeout(()=>{if(wheelTimer!==timer)return;wheelTimer=null;stage.classList.remove('wheeling');},160);wheelTimer=timer;
  }
  function open(from){
    const latest=bridge.getState?.();if(latest)render(latest);
    if(!state||isOpen()||document.querySelector('dialog[open]'))return false;
    root.FocusReturnTrail?.close(false);root.FocusCampfireRoom?.close(false);bridge.leaveExpedition?.();root.FocusQuickSkins?.close(false);
    anchor=from||document.activeElement;inertBefore=Array.from(document.querySelectorAll('body > main')).map(element=>[element,element.inert]);
    clearCameraGesture();selected=null;zoom=1;panX=panY=0;streetKey=roomKey=contentKey='';
    for(const [element] of inertBefore)element.inert=true;
    $('citadel-view').inert=false;$('citadel-view').hidden=false;document.documentElement.classList.add('has-citadel-view');
    camera();paint();$('citadel-close').focus({preventScroll:true});bridge.onOpen?.();return true;
  }
  function close(restoreFocus=true){
    if(!isOpen())return false;
    $('citadel-view').inert=true;root.FocusAmbience?.setScene(null);root.FocusCityLife?.unmount();root.FocusQuickSkins?.close(false);clearCameraGesture();equipmentPreview=null;
    document.documentElement.classList.remove('has-citadel-view');
    $('citadel-view').hidden=true;$('citadel-view').inert=false;
    for(const [element,previous] of inertBefore)element.inert=previous;
    inertBefore=[];const from=anchor;anchor=null;selected=null;
    if(restoreFocus&&!focusEntry(from))focusEntry($('citadel-enter'));
    bridge.afterClose?.();return true;
  }
  function openPlace(id){if(!place(id)||!isOpen()||document.querySelector('dialog[open]'))return false;root.FocusQuickSkins?.close(false);clearCameraGesture();root.FocusCityLife?.unmount();selected=id;homeView='home';root.FocusAmbience?.setScene(id==='observatory'?'home':null);roomKey=contentKey='';paint();$('citadel-close').focus({preventScroll:true});return true;}
  function setHomeView(next){
    if(selected!=='observatory'||!['home','panorama','rooftop'].includes(next))return false;
    homeView=next;paint();$('citadel-close').focus({preventScroll:true});return true;
  }
  function backToStreet(){
    if(!selected||!isOpen())return false;
    if(selected==='observatory'&&homeView!=='home')return setHomeView('home');
    const previous=selected;root.FocusQuickSkins?.close(false);root.FocusAmbience?.setScene(null);root.FocusCityLife?.unmount();selected=null;paint();
    focusEntry($('citadel-scene').querySelector(`[data-city-place="${previous}"]`))||focusEntry($('citadel-close'));return true;
  }
  function action(id){
    if(!selected||!isOpen())return;
    if(id==='home-window'){setHomeView('panorama');return;}
    if(id==='home-rooftop'){setHomeView('rooftop');return;}
    if(id==='home-living'){setHomeView('home');return;}
    if(id==='tea-chat'){teaLine=(teaLine+1)%teaLines.length;setText('city-tea-line',teaLines[teaLine]);contentKey=roomContent();return;}
    if(id==='tea-window'){windowMode=windowMode==='rain'?'lamplight':'rain';const button=$('city-room-content').querySelector('[data-city-action="tea-window"]');button?.setAttribute('aria-pressed',String(windowMode==='lamplight'));if(button)button.textContent=windowMode==='lamplight'?'看窗外的雨':'把灯调暖一些';contentKey=roomContent();paint();return;}
    if(id==='sky'){rooftopMode=rooftopMode==='rain'?'stars':'rain';paint();return;}
    const jump={arcade:'openArcade',review:'openReview',shop:'openShop',camp:'openCamp'}[id];
    if(jump&&bridge[jump]){close(false);bridge[jump]();}else if(id==='home')close();
  }
  function preview(itemId,base){
    const latest=bridge.getState?.()||state,item=(latest?.quests?.catalog||[]).find(item=>item.id===itemId&&slots.has(item.slot));
    if(!item||!root.FocusRainCityArt)return '';
    const eq={...(base||latest.quests?.equipped),[item.slot]:item.id};
    return `<div class="citadel-full-preview rain-city-preview">${root.FocusRainCityArt.scene(latest,eq,{interactive:false})}<div><strong>星辉城 · 雨夜街景</strong><span>${esc(item.name)} · 保留其余当前装备</span></div></div><p class="citadel-preview-note">外观会融入城市的窗灯、街边陈设与旅人细节。仅预览，不改变学习记录或当前装备。</p>`;
  }
  function init(callbacks={}){
    bridge=callbacks;if(initialized)return;initialized=true;
    $('citadel-enter')?.addEventListener('click',event=>{if(!event.ctrlKey)open(event.currentTarget);});
    document.querySelector('.quest-scene')?.addEventListener('click',event=>{if(event.target.closest?.('#campfire-room-open,[data-island-gift]'))return;if(event.button===0&&!event.ctrlKey)open($('citadel-enter'));});
    $('citadel-close').addEventListener('click',()=>{if(!backToStreet())close();});
    $('citadel-shop').addEventListener('click',()=>{close(false);bridge.openShop?.();});
    setHTML('citadel-locations',places().map((p,i)=>`<button type="button" data-city-select="${p.id}"><span class="city-address">${String(i+1).padStart(2,'0')}</span><strong>${esc(p.name)}</strong><small>${esc(p.subtitle)}</small><span class="city-visit">↗</span></button>`).join(''));
    $('citadel-locations').addEventListener('click',event=>{const button=event.target.closest('[data-city-select]');if(button)openPlace(button.dataset.citySelect);});
    $('citadel-scene').addEventListener('click',event=>{if(event.ctrlKey||event.button!==0||Date.now()<suppressClickUntil)return;const node=event.target.closest('[data-city-place]');if(node)openPlace(node.dataset.cityPlace);});
    $('citadel-scene').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){const node=event.target.closest('[data-city-place]');if(node){event.preventDefault();openPlace(node.dataset.cityPlace);}}});
    $('city-interior-art').addEventListener('click',event=>{if(event.button!==0||event.ctrlKey)return;const node=event.target.closest('[data-home-action]');if(node)action('home-'+(node.dataset.homeAction==='window'?'window':'rooftop'));});
    $('city-interior-art').addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key))return;const node=event.target.closest('[data-home-action]');if(node){event.preventDefault();action('home-'+(node.dataset.homeAction==='window'?'window':'rooftop'));}});
    $('city-room-content').addEventListener('click',event=>{const button=event.target.closest('[data-city-action]');if(button)action(button.dataset.cityAction);});
    $('citadel-overview').addEventListener('click',()=>{clearCameraGesture();zoom=1;panX=panY=0;camera();});
    for(const [id,delta] of [['citadel-zoom-in',.4],['citadel-zoom-out',-.4]])$(id).addEventListener('click',()=>{clearCameraGesture();zoom=Math.round(Math.max(1,Math.min(2.4,zoom+delta))*10)/10;if(zoom===1)panX=panY=0;camera();});
    root.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change',()=>{if(isOpen())paint();});
    const visibility=()=>{if(!isVisible()){clearCameraGesture();}if(isOpen())paint();};
    document.addEventListener('visibilitychange',visibility);
    document.addEventListener('focusquest:visibility',event=>{if(event.detail?.visible===false){clearCameraGesture();}if(isOpen())$('citadel-view').dataset.paused=String(event.detail?.visible===false||!isVisible());});
    const stage=$('citadel-stage');stage.addEventListener('wheel',wheelCamera,{passive:false});
    stage.addEventListener('pointerdown',event=>{if(selected||!isOpen()||zoom<=1||event.button!==0||event.ctrlKey||event.target.closest('button'))return;finishWheel();drag={id:event.pointerId,x:event.clientX,y:event.clientY,px:panX,py:panY,moved:false};});
    stage.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<5)return;const rect=stage.getBoundingClientRect();if(!rect.width||!rect.height)return;drag.moved=true;stage.setPointerCapture?.(event.pointerId);stage.classList.add('dragging');panX=drag.px+dx/rect.width*100;panY=drag.py+dy/rect.height*100;camera();});
    stage.addEventListener('pointerup',finishDrag);stage.addEventListener('pointercancel',finishDrag);stage.addEventListener('lostpointercapture',finishDrag);
    document.addEventListener('keydown',event=>{
      if(!isOpen()||event.defaultPrevented||document.querySelector('dialog[open]'))return;
      const quick=$('quick-skins');
      if(event.key==='Escape'){
        if(quick&&!quick.hidden)return;
        event.preventDefault();event.stopImmediatePropagation();if(!backToStreet())close();return;
      }
      if(event.key!=='Tab'||!quick||quick.hidden)return;
      const nodes=Array.from(quick.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]')).filter(el=>!el.closest('[hidden]')&&el.getClientRects().length),first=nodes[0],last=nodes[nodes.length-1];
      if(first&&(!quick.contains(document.activeElement)||(event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last))){event.preventDefault();(event.shiftKey?last:first).focus();}
    },true);
  }
  root.FocusCitadel={init,render,open,close,isOpen,openPlace,backToStreet,closeInterior:backToStreet,applyEquipment,previewEquipment,preview,acceptProgress};
})(typeof globalThis!=='undefined'?globalThis:this);
