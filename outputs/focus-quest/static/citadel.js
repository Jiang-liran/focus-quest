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
  let teaLine=0,windowMode='rain',rooftopMode='rain',homeView='home',lotteryMachine=null;
  let service=null,talking=null,talkLine=0,talkAnchor=null,serviceAnchor=null,homeWarm=true;
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
      return `<span class="city-room-eyebrow">${copy[0]}</span><h3>${copy[1]}</h3>${copy[2]?`<p>${copy[2]}</p>`:''}<div class="city-room-actions">${homeView==='home'?'<button type="button" data-city-action="home-window">到窗边看雨</button><button type="button" class="city-secondary" data-city-action="home-rooftop">上屋顶坐坐</button>':'<button type="button" data-city-action="home-living">回到家里</button>'}${homeView==='rooftop'?`<button type="button" class="city-secondary" data-city-action="sky" aria-pressed="${rooftopMode==='stars'}">${rooftopMode==='stars'?'回到雨夜':'看一眼云隙星光'}</button>`:''}</div>`;
    }
    if(selected==='atelier')return '<span class="city-room-eyebrow">星织小铺 · 你的私人衣柜</span><h3>留住喜欢的一整套。</h3><div class="city-room-actions"><button type="button" data-skin-open="avatar interface theme bar fx banner companion relic portal camp fire tent campgear campglow chatframe island camptrail campmark">搭配已有外观</button><button type="button" class="city-secondary" data-city-action="shop">逛逛商店 ↗</button></div><div id="city-life-pane"></div>';
    if(selected==='arcade')return lotteryMachine?'<div id="city-lottery-pane" aria-label="星海抽奖机"></div>':`<span class="city-room-eyebrow">星海游乐场 · 灯下的小惊喜</span><h3>把学习带来的券，投进一份期待。</h3><p>点亮的两台机器分别收下金币抽奖券和钻石抽奖券。点击机身，就能查看奖池与收藏。</p><div class="city-room-actions"><button type="button" class="city-secondary" data-city-action="arcade">${state.arcade?.active?'继续未结束的游戏':'去游戏区'} ↗</button></div><small class="city-room-note">${Number(state.arcade?.available)||0} 张累计游玩券 · 可在机器旁兑换抽奖券</small>`;
    return '<span class="city-room-eyebrow">归途车站 · 灯还亮着</span><h3>下一程，轻装出发。</h3><p>把明天想做的小事装进行囊，今晚就不用一直记着了。</p><div id="city-life-pane"></div><div class="city-room-actions"><button type="button" data-city-action="home">回到群岛</button><button type="button" class="city-secondary" data-city-action="camp">去篝火营地</button></div>';
  }
  const serviceMarkup=()=>'<button type="button" class="city-service-close" data-city-service-close aria-label="收起操作面板">收起，看看屋里 ↗</button>'+roomContent();
  const serviceByRoom={library:['desk','shelf'],tea:['tea'],atelier:['outfits'],station:['plan'],arcade:['games'],observatory:[]};
  const primaryService=()=>selected==='observatory'&&homeView==='rooftop'?'sky':mainService[selected];
  const mainService={library:'desk',tea:'tea',atelier:'outfits',station:'plan',arcade:'games',observatory:'home-window'};
  function resident(){return root.FocusCityResidents?.find(root.FocusCityResidents?.roomResident(selected,selected==='observatory'?homeView:'rain'));}
  function welcome(){
    const npc=resident(),copy={library:['纸页与灯，都在这里','书桌可以写便笺，书架保留收好的旧页。'],tea:['茶已经温着了','到茶席选一杯茶，或和阿榆说说话。'],atelier:['给日常挑一点喜欢','点击衣架试穿，在工作台留下整套搭配。'],arcade:['灯下的小惊喜','点击两台抽奖机；墙上的游戏牌通往游戏区。'],station:['下一程，轻装出发','行囊台收好明天的小事，站台可以回营地。'],observatory:homeView==='panorama'?['在高处，听城市下雨','这一会儿，什么也不必做。']:homeView==='rooftop'?['云隙里，还留着几颗星','和望舒看看远处，或试试望远镜。']:['欢迎回家','望舒带了一点茶来。窗外是城市，侧门通往天台。']}[selected];
    if(!copy)return '';
    return `<div><span class="city-welcome-eyebrow">${npc?`${esc(npc.name)} · ${esc(npc.role)}`:'窗边夜景'}</span><strong>${copy[0]}</strong><small>${copy[1]}</small></div><div class="city-welcome-actions">${npc?`<button type="button" data-city-talk="${npc.id}">和${esc(npc.name)}聊聊</button>`:''}${selected==='observatory'?`<button type="button" data-city-action="${homeView==='home'?'home-window':'home-living'}">${homeView==='home'?'到窗边看雨':'回到家里'}</button>${homeView==='home'?'<button type="button" data-city-action="home-rooftop">上屋顶坐坐</button>':''}`:`<button type="button" data-city-service="${mainService[selected]}">${{library:'使用书桌',tea:'到茶席坐坐',atelier:'整理搭配',station:'收拾行囊',arcade:'看看游戏'}[selected]}</button>${selected==='atelier'?'<button type="button" data-skin-open="avatar interface theme bar fx banner companion relic portal camp fire tent campgear campglow chatframe island camptrail campmark">试穿已有外观</button>':''}`}</div>`;
  }
  function closeService(restore=true){
    if(!service)return false;service=null;paint();
    if(restore)focusEntry(serviceAnchor)||focusEntry($('citadel-close'));serviceAnchor=null;return true;
  }
  function openService(id,from){
    if(!selected||!isOpen()||lotteryMachine||document.querySelector('dialog[open]'))return false;
    const direct={tea:['tea-window'],atelier:['wardrobe'],station:['camp'],observatory:homeView==='rooftop'?['sky']:homeView==='home'?['home-light','home-window','home-rooftop']:[]};
    if(direct[selected]?.includes(id)){
      closeConversation(false);
      if(id==='wardrobe'){$('city-room-welcome').querySelector('[data-skin-open]')?.click();return true;}
      if(id==='home-light'){homeWarm=!homeWarm;paint();return true;}
      action(id);return true;
    }
    if(!serviceByRoom[selected]?.includes(id))return false;
    closeConversation(false);service=id;serviceAnchor=from||document.activeElement;paint();
    if(id==='shelf')root.FocusCityLife?.setFilter?.('archive');
    else if(id==='desk')root.FocusCityLife?.setFilter?.('active');
    focusEntry($('city-room-content').querySelector('[data-city-service-close]'));return true;
  }
  function syncTalking(){
    for(const node of $('citadel-view').querySelectorAll('[data-city-walker]'))node.dataset.talking=String(node.dataset.cityWalker===talking);
    root.FocusCityWalkers?.refresh();
  }
  function closeConversation(restore=true){
    if(!talking)return false;talking=null;$('city-talk').hidden=true;syncTalking();
    if(restore)focusEntry(talkAnchor)||focusEntry($('citadel-close'));talkAnchor=null;return true;
  }
  function drawConversation(){
    const npc=root.FocusCityResidents?.find(talking);if(!npc)return;
    const here=selected===npc.place,actionLabel=here?(selected==='observatory'&&homeView==='rooftop'?'看看云隙里的星':npc.actionLabel||'一起看看'):npc.place==='observatory'?'去家里坐坐':`去${place(npc.place)?.name||'篝火营地'}坐坐`;
    $('city-talk').innerHTML=`<div class="city-talk-portrait" aria-hidden="true">${root.FocusCityResidents.portrait(npc.id)}</div><div class="city-talk-body"><span class="city-welcome-eyebrow">${selected?'灯下的话':'雨巷偶遇'} · ${esc(npc.role)}</span><h3>${esc(npc.name)}</h3><p aria-live="polite">${esc(npc.lines[talkLine%npc.lines.length])}</p><div class="city-talk-actions"><button type="button" data-city-talk-action="service">${esc(actionLabel)}</button><button type="button" data-city-talk-action="next">再聊一句</button><button type="button" data-city-talk-action="close" aria-label="结束交谈">回头见</button></div></div>`;
  }
  function talkTo(id,from){
    const npc=root.FocusCityResidents?.find(id);
    if(!npc||!isOpen()||lotteryMachine||document.querySelector('dialog[open]'))return false;
    if(selected&&resident()?.id!==id)return false;
    closeService(false);talking=id;talkLine=0;talkAnchor=from||document.activeElement;drawConversation();$('city-talk').hidden=false;syncTalking();
    focusEntry($('city-talk').querySelector('[data-city-talk-action="close"]'));return true;
  }
  function paint(){
    if(!isOpen()||!state||!root.FocusRainCityArt)return;
    const view=$('citadel-view'),eq=visibleEquipment(),inRoom=!!selected;
    view.dataset.motion=String(motionAllowed());view.dataset.paused=String(!isVisible());view.dataset.room=selected||'street';view.dataset.homeView=selected==='observatory'?homeView:'';view.dataset.lottery=lotteryMachine||'';view.dataset.service=service||'';view.dataset.homeWarm=String(homeWarm);
    $('city-street').hidden=inRoom;$('city-room').hidden=!inRoom;
    if($('city-ambience'))$('city-ambience').hidden=selected==='observatory';
    if($('city-home-audio')){$('city-home-audio').hidden=selected!=='observatory';if(selected==='observatory')root.FocusAmbience?.mount($('city-home-audio'),'home');}
    setText('citadel-title',lotteryMachine?(lotteryMachine==='coin'?'金币抽奖机':'钻石抽奖机'):selected==='observatory'?(homeView==='panorama'?'窗边夜景':homeView==='rooftop'?'屋顶天台':'我的家'):inRoom?place(selected).name:'星辉城');
    setText('citadel-theme',inRoom?'星辉城 / '+place(selected).subtitle:'雨夜里的灯，始终为你亮着');
    setText('citadel-close',lotteryMachine?'← 返回游乐场':selected==='observatory'&&homeView!=='home'?'← 回到家里':inRoom?'← 返回街道':'← 返回群岛');
    setText('city-street-caption','雨巷里有人散步 · 点击居民交谈，点击建筑入内');
    const key=JSON.stringify(eq);
    if(!inRoom&&key!==streetKey){
      streetKey=key;const focused=$('citadel-scene').contains(document.activeElement)?document.activeElement?.closest('[data-city-place],[data-city-trail]'):null;
      const focusSelector=focused?.hasAttribute('data-city-trail')?'[data-city-trail]':focused?`[data-city-place="${focused.dataset.cityPlace}"]`:null;
      $('citadel-scene').innerHTML=root.FocusRainCityArt.scene(state,eq,{interactive:true});
      if(focusSelector)$('citadel-scene').querySelector(focusSelector)?.focus({preventScroll:true});
    }
    $('city-interior-art').hidden=!!lotteryMachine;
    $('city-interior-art').setAttribute('aria-hidden',selected&&!lotteryMachine?'false':'true');
    $('city-room-content').hidden=!lotteryMachine&&!service;
    if($('city-room-welcome')){$('city-room-welcome').hidden=!inRoom||!!lotteryMachine;setHTML('city-room-welcome',inRoom?welcome():'');}
    if(inRoom){
      const mode=selected==='tea'?windowMode:selected==='observatory'?(homeView==='rooftop'?rooftopMode:homeView):'rain',key=JSON.stringify([selected,eq,mode]);
      if(key!==roomKey){roomKey=key;$('city-interior-art').innerHTML=root.FocusRainCityArt.interior(selected,state,eq,{mode,interactive:true});}
      if(lotteryMachine||service){
      const html=lotteryMachine?roomContent():serviceMarkup();if(html!==contentKey){contentKey=html;
        const action=$('city-room-content').contains(document.activeElement)?document.activeElement?.dataset?.cityAction:null;
        root.FocusCityLife?.unmount();root.FocusLottery?.unmount();$('city-room-content').innerHTML=html;
        if(action)$('city-room-content').querySelector(`[data-city-action="${action}"]`)?.focus({preventScroll:true});
      }
      if(lotteryMachine)root.FocusLottery?.mount(lotteryMachine,$('city-lottery-pane'),state);
      else root.FocusCityLife?.mount(selected,$('city-life-pane'),state);
      }
      for(const node of $('city-interior-art').querySelectorAll('[data-city-workstation]'))node.setAttribute('aria-pressed',String(node.dataset.cityWorkstation===service));
    }
    if(talking)syncTalking();
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
    clearCameraGesture();service=null;talking=null;$('city-talk')&&($('city-talk').hidden=true);selected=null;lotteryMachine=null;zoom=1;panX=panY=0;streetKey=roomKey=contentKey='';
    for(const [element] of inertBefore)element.inert=true;
    $('citadel-view').inert=false;$('citadel-view').hidden=false;document.documentElement.classList.add('has-citadel-view');
    camera();paint();root.FocusAmbience?.mount($('city-ambience'),'city');root.FocusAmbience?.setScene('city');$('citadel-close').focus({preventScroll:true});bridge.onOpen?.();return true;
  }
  function close(restoreFocus=true){
    if(!isOpen())return false;
    closeConversation(false);service=null;
    $('citadel-view').inert=true;root.FocusAmbience?.setScene(null);root.FocusCityLife?.unmount();root.FocusLottery?.unmount();root.FocusQuickSkins?.close(false);clearCameraGesture();equipmentPreview=null;
    document.documentElement.classList.remove('has-citadel-view');
    $('citadel-view').hidden=true;$('citadel-view').inert=false;
    for(const [element,previous] of inertBefore)element.inert=previous;
    inertBefore=[];const from=anchor;anchor=null;selected=null;lotteryMachine=null;
    if(restoreFocus&&!focusEntry(from))focusEntry($('citadel-enter'));
    bridge.afterClose?.();return true;
  }
  function openPlace(id){if(!place(id)||!isOpen()||document.querySelector('dialog[open]'))return false;root.FocusQuickSkins?.close(false);clearCameraGesture();root.FocusCityLife?.unmount();root.FocusLottery?.unmount();closeConversation(false);service=null;selected=id;lotteryMachine=null;homeView='home';root.FocusAmbience?.setScene(id==='observatory'?'home':'city');roomKey=contentKey='';paint();$('citadel-close').focus({preventScroll:true});return true;}
  function openMachine(id){
    if(!['coin','diamond'].includes(id)||selected!=='arcade'||!isOpen()||document.querySelector('dialog[open]'))return false;
    root.FocusQuickSkins?.close(false);root.FocusLottery?.unmount();closeConversation(false);service=null;lotteryMachine=id;contentKey='';paint();$('citadel-close').focus({preventScroll:true});return true;
  }
  function setHomeView(next){
    if(selected!=='observatory'||!['home','panorama','rooftop'].includes(next))return false;
    closeConversation(false);service=null;homeView=next;paint();$('citadel-close').focus({preventScroll:true});return true;
  }
  function backToStreet(){
    if(!selected||!isOpen())return false;
    if(lotteryMachine){const previous=lotteryMachine;root.FocusLottery?.unmount();lotteryMachine=null;contentKey='';paint();focusEntry($('city-interior-art').querySelector(`[data-lottery-machine="${previous}"]`))||focusEntry($('citadel-close'));return true;}
    if(selected==='observatory'&&homeView!=='home')return setHomeView('home');
    closeConversation(false);service=null;const previous=selected;root.FocusQuickSkins?.close(false);root.FocusAmbience?.setScene('city');root.FocusCityLife?.unmount();root.FocusLottery?.unmount();selected=null;paint();
    focusEntry($('citadel-scene').querySelector(`[data-city-place="${previous}"]`))||focusEntry($('citadel-close'));return true;
  }
  function action(id){
    if(!selected||!isOpen())return;
    if(id==='home-window'){setHomeView('panorama');return;}
    if(id==='home-rooftop'){setHomeView('rooftop');return;}
    if(id==='home-living'){setHomeView('home');return;}
    if(id==='tea-chat'){teaLine=(teaLine+1)%teaLines.length;setText('city-tea-line',teaLines[teaLine]);contentKey=serviceMarkup();return;}
    if(id==='tea-window'){windowMode=windowMode==='rain'?'lamplight':'rain';const button=$('city-room-content').querySelector('[data-city-action="tea-window"]');button?.setAttribute('aria-pressed',String(windowMode==='lamplight'));if(button)button.textContent=windowMode==='lamplight'?'看窗外的雨':'把灯调暖一些';if(contentKey)contentKey=serviceMarkup();paint();return;}
    if(id==='sky'){rooftopMode=rooftopMode==='rain'?'stars':'rain';paint();return;}
    const jump={arcade:'openArcade',review:'openReview',shop:'openShop',camp:'openCamp'}[id];
    if(jump&&bridge[jump]){close(false);bridge[jump]();}else if(id==='home')close();
  }
  function openTrail(from){
    if(!isOpen()||selected||document.querySelector('dialog[open]')||($('quick-skins')&&!$('quick-skins').hidden))return false;
    clearCameraGesture();bridge.openTrail?.(from);return true;
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
    $('citadel-scene').addEventListener('click',event=>{if(event.ctrlKey||event.button!==0||Date.now()<suppressClickUntil)return;const npc=event.target.closest('[data-city-npc]');if(npc){if(event.type==='keydown')event.preventDefault();talkTo(npc.dataset.cityNpc,npc);return;}const trail=event.target.closest('[data-city-trail]');if(trail){openTrail(trail);return;}const node=event.target.closest('[data-city-place]');if(node)openPlace(node.dataset.cityPlace);});
    $('citadel-scene').addEventListener('keydown',event=>{if(event.repeat)return;if(event.key==='Enter'||event.key===' '){const npc=event.target.closest('[data-city-npc]');if(npc){if(event.type==='keydown')event.preventDefault();talkTo(npc.dataset.cityNpc,npc);return;}const trail=event.target.closest('[data-city-trail]');if(trail){event.preventDefault();openTrail(trail);return;}const node=event.target.closest('[data-city-place]');if(node){event.preventDefault();openPlace(node.dataset.cityPlace);}}});
    $('city-interior-art').addEventListener('click',event=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;const npc=event.target.closest('[data-city-npc]');if(npc){event.preventDefault();talkTo(npc.dataset.cityNpc,npc);return;}const station=event.target.closest('[data-city-workstation]');if(station){event.preventDefault();openService(station.dataset.cityWorkstation,station);return;}const machine=event.target.closest('[data-lottery-machine]');if(machine){openMachine(machine.dataset.lotteryMachine);return;}const node=event.target.closest('[data-home-action]');if(node)action('home-'+(node.dataset.homeAction==='window'?'window':'rooftop'));});
    $('city-interior-art').addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key)||event.repeat)return;const npc=event.target.closest('[data-city-npc]');if(npc){event.preventDefault();talkTo(npc.dataset.cityNpc,npc);return;}const station=event.target.closest('[data-city-workstation]');if(station){event.preventDefault();openService(station.dataset.cityWorkstation,station);return;}const machine=event.target.closest('[data-lottery-machine]');if(machine){event.preventDefault();openMachine(machine.dataset.lotteryMachine);return;}const node=event.target.closest('[data-home-action]');if(node){event.preventDefault();action('home-'+(node.dataset.homeAction==='window'?'window':'rooftop'));}});
    $('city-room-content').addEventListener('click',event=>{if(event.target.closest('[data-city-service-close]')){closeService();return;}const button=event.target.closest('[data-city-action]');if(button)action(button.dataset.cityAction);});
    $('city-room-welcome')?.addEventListener('click',event=>{const npc=event.target.closest('[data-city-talk]'),serviceButton=event.target.closest('[data-city-service]'),button=event.target.closest('[data-city-action]');if(npc)talkTo(npc.dataset.cityTalk,npc);else if(serviceButton)openService(serviceButton.dataset.cityService,serviceButton);else if(button)action(button.dataset.cityAction);});
    $('city-talk')?.addEventListener('click',event=>{const button=event.target.closest('[data-city-talk-action]');if(!button)return;const kind=button.dataset.cityTalkAction;if(kind==='close'){closeConversation();return;}if(kind==='next'){talkLine++;const npc=root.FocusCityResidents.find(talking);$('city-talk').querySelector('p').textContent=npc.lines[talkLine%npc.lines.length];return;}if(kind==='service'){const npc=root.FocusCityResidents.find(talking);closeConversation(false);if(selected===npc.place)openService(primaryService());else if(place(npc.place))openPlace(npc.place);else{close(false);bridge.openCamp?.();}}});
    $('citadel-overview').addEventListener('click',()=>{clearCameraGesture();zoom=1;panX=panY=0;camera();});
    for(const [id,delta] of [['citadel-zoom-in',.4],['citadel-zoom-out',-.4]])$(id).addEventListener('click',()=>{clearCameraGesture();zoom=Math.round(Math.max(1,Math.min(2.4,zoom+delta))*10)/10;if(zoom===1)panX=panY=0;camera();});
    root.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change',()=>{if(isOpen())paint();});
    const visibility=()=>{if(!isVisible()){clearCameraGesture();}if(isOpen())paint();};
    document.addEventListener('visibilitychange',visibility);
    document.addEventListener('focusquest:visibility',event=>{if(event.detail?.visible===false){clearCameraGesture();}if(isOpen())$('citadel-view').dataset.paused=String(event.detail?.visible===false||!isVisible());});
    const stage=$('citadel-stage');stage.addEventListener('wheel',wheelCamera,{passive:false});
    stage.addEventListener('pointerdown',event=>{if(selected||!isOpen()||zoom<=1||event.button!==0||event.ctrlKey||event.target.closest('button,[data-city-npc]'))return;finishWheel();drag={id:event.pointerId,x:event.clientX,y:event.clientY,px:panX,py:panY,moved:false};});
    stage.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<5)return;const rect=stage.getBoundingClientRect();if(!rect.width||!rect.height)return;drag.moved=true;stage.setPointerCapture?.(event.pointerId);stage.classList.add('dragging');panX=drag.px+dx/rect.width*100;panY=drag.py+dy/rect.height*100;camera();});
    stage.addEventListener('pointerup',finishDrag);stage.addEventListener('pointercancel',finishDrag);stage.addEventListener('lostpointercapture',finishDrag);
    document.addEventListener('keydown',event=>{
      if(!isOpen()||event.defaultPrevented||document.querySelector('dialog[open]'))return;
      const quick=$('quick-skins');
      if(event.key==='Escape'){
        if(quick&&!quick.hidden)return;
        event.preventDefault();event.stopImmediatePropagation();if(closeConversation()||closeService())return;if(!backToStreet())close();return;
      }
      if(event.key!=='Tab'||!quick||quick.hidden)return;
      const nodes=Array.from(quick.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]')).filter(el=>!el.closest('[hidden]')&&el.getClientRects().length),first=nodes[0],last=nodes[nodes.length-1];
      if(first&&(!quick.contains(document.activeElement)||(event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last))){event.preventDefault();(event.shiftKey?last:first).focus();}
    },true);
  }
  root.FocusCitadel={init,render,open,close,isOpen,openPlace,openMachine,backToStreet,closeInterior:backToStreet,applyEquipment,previewEquipment,preview,acceptProgress,openService,closeService,talkTo,closeConversation};
})(typeof globalThis!=='undefined'?globalThis:this);
