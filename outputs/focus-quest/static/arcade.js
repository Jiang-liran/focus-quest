(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const minutes=value=>Math.max(0,Math.ceil(number(value)));
  const cache=new Map();
  const sceneNames={voyage:'卡牌远征',dice:'符文骰战',trail:'雾中寻路',mirrors:'折光机关',garden:'口袋造景'};
  const adventures=()=>root.FocusArcadeAdventures;
  const advanced=type=>!!adventures()?.supports(type);
  const tileNames={flower:'铃花',water:'泉水',grove:'小树',stone:'星石'};
  const palettes={
    'star-voyage':['#c6b2f5','#8477c4','#88bebc'],
    'rune-table':['#e4c794','#b47f98','#8ccabd'],
    'mist-camp':['#b7cdb7','#728eac','#879397'],
    'glow-shore':['#91dbd5','#788bd0','#a9d4cb'],
    'chime-bridge':['#e0caa4','#a08bbb','#adbb9d'],
    'mirror-gallery':['#ccb8fc','#899bcf','#bea4d4'],
    'cloud-library':['#b9cfa6','#ac9ad0','#b9bba3'],
    'orbit-terrace':['#9ac9ee','#887fd0','#afc9e1'],
    'home-beacon':['#e7ca94','#bba4d2','#c2b9a0']
  };
  let bridge={},data=null,settings={},selected='star-voyage',handIndex=0,busy=false,visible=false;
  let lastStamp=-Infinity,clockServer=0,clockLocal=0,clock=null,expiryRequest=null,deferred=null;
  let startIntent=null,error='',abandon=false,latestResult=null,knownActive=null,announce='',initialized=false;
  const terminalIds=new Set();
  let pendingFocus=null;
  function put(id,html){const host=$(id);if(!host||cache.get(id)===html)return false;host.innerHTML=html;cache.set(id,html);return true;}
  function stamp(value){const part=String(value||'').match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/);return Date.parse(value)*1000+Number((part?.[1]||'').padEnd(6,'0').slice(3,6));}
  function now(){return clockServer+(Date.now()-clockLocal);}
  function secondsLeft(){return data?.active?Math.max(0,Math.ceil((Date.parse(data.active.expiresAt)-now())/1000)):0;}
  function venue(id){return data?.venues?.find(v=>v.id===id);}
  function capped(){return Math.max(number(data?.earned),number(data?.used))>=number(data?.rules?.maxTickets);}
  function activeVenue(){return venue(data?.active?.venue)||venue(selected)||data?.venues?.[0];}
  function reward(r){return `<span class="arcade-money"><i>●</i> ${number(r?.coins)} 金币</span><span class="arcade-money diamond"><i>◆</i> ${number(r?.diamonds)} 钻石</span>`;}
  function medal(n){return ['初次探险','铜叶纪念','银月纪念','星辉纪念'][Math.max(0,Math.min(3,number(n)))];}
  function tree(x,y,s=1,c='#78958e'){return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cy="14" rx="17" ry="6" fill="#10182644"/><path d="M0 8V-29" stroke="#777087" stroke-width="5"/><path d="m0-71 25 40H-25Z" fill="${c}"/><path d="m0-49 31 41H-31Z" fill="${c}" opacity=".85"/><path d="m0-71 0 62H-31l15-24h-9Z" fill="#22344822"/></g>`;}
  function star(x,y,s=1,c='#e4d5ad'){return `<path transform="translate(${x} ${y}) scale(${s})" d="M0-10 3-3 10 0 3 3 0 10-3 3-10 0-3-3Z" fill="${c}"/>`;}
  function scene(id,compact=false){
    if(['star-voyage','rune-table'].includes(id)&&adventures())return adventures().scene(id,compact);
    const [light,accent,leaf]=palettes[id]||palettes['mist-camp'];
    let feature='';
    if(id==='mist-camp')feature=`${tree(122,168,.9,leaf)}${tree(287,133,1.05,leaf)}<path d="m175 172 41-73 49 73-43 26Z" fill="#c3a0a9"/><path d="m216 99 7 99-48-26Z" fill="#8f7e9f"/><path d="m204 180 12-32 15 40Z" fill="#303549"/><path d="m164 207 28 7m-22 0 21-11" stroke="#998574" stroke-width="8"/><path class="arcade-scene-flame" d="M170 205c-5-15 12-18 13-33 13 17 19 23 10 33Z" fill="#edbd8a"/>${star(182,196,.4,'#ffeac0')}`;
    else if(id==='glow-shore')feature=`<path d="M96 190q31-48 63-23t60-9q29-34 98 1l-26 32q-39-24-65 6t-67 0q-31-23-45 13Z" fill="#74bbca88"/><path d="M105 191q31-40 61-20t53-7q38-29 88-4" fill="none" stroke="#b4e1db" stroke-width="3"/>${tree(132,134,.7,leaf)}${tree(292,151,.8,leaf)}${[150,178,221,263].map((x,i)=>`<ellipse class="arcade-scene-spark" cx="${x}" cy="${190-i%2*28}" rx="5" ry="3" fill="${light}" style="animation-delay:${i*.7}s"/>`).join('')}<path d="m214 147 13-25 13 25Z" fill="#d7beea"/><path d="M228 146v15" stroke="#869ca0" stroke-width="3"/>`;
    else if(id==='chime-bridge')feature=`${tree(116,162,.82,leaf)}${tree(301,154,.83,leaf)}<path d="m137 198 137-52 0 20-137 52Z" fill="#80768f"/><path d="m137 198 137-52 10 9-137 52Z" fill="#d3b99a"/>${[0,1,2,3,4,5,6,7].map(i=>`<path d="m${140+i*18} ${197-i*7} 9 9" stroke="#736681" stroke-width="2"/>`).join('')}<path d="M139 182v-52m136 0V97m-136 54q68-10 136-42" stroke="#aa9d94" stroke-width="5" fill="none"/>${[0,1,2,3].map(i=>`<g class="arcade-scene-chime" style="animation-delay:${i*.3}s"><path d="M${159+i*29} ${147-i*8}v20" stroke="#cabca5" stroke-width="2"/><path d="m${154+i*29} ${169-i*8}h10l3 7h-16Z" fill="${light}"/></g>`).join('')}`;
    else if(id==='mirror-gallery')feature=`<path d="m143 184 68-27 71 27-68 29Z" fill="#9183ae"/>${[0,1,2].map(i=>`<g transform="translate(${159+i*48} ${158-i%2*16})"><path d="m-14 29 27 10 11-7-27-10Z" fill="#7e7094"/><path d="m-9-48 28-11v81L-9 33Z" fill="#769eaf" stroke="#d1b9eb" stroke-width="5"/><path d="m-2-42 14-6v38L-2 1Z" fill="#cbe1ee77"/></g>`).join('')}<path class="arcade-scene-beam" d="M105 166 151 138l52-23 42 29 58-48" stroke="#d7c7f2" stroke-width="3" fill="none"/>${star(303,96,.6)}`;
    else if(id==='cloud-library')feature=`${tree(120,151,1.05,leaf)}${tree(292,147,1.1,leaf)}<path d="m158 175 53-22 55 23-54 22Z" fill="#a294af"/><path d="M162 150v37m100-37v37" stroke="#776d88" stroke-width="8"/><path d="m151 144 58-23 62 24-60 25Z" fill="#c0a9b4"/><path d="m185 126 26 7 22-8v24l-23 9-25-9Z" fill="#eadcbb"/><path d="M211 133v25" stroke="#9d8ba0" stroke-width="2"/>${[156,269,187,238].map((x,i)=>`<path d="m${x} ${194+i%2*11} 13-4 9 5-13 5Z" fill="${i%2?'#b7caa5':'#c6b1dd'}"/>`).join('')}`;
    else if(id==='orbit-terrace')feature=`<ellipse cx="211" cy="184" rx="75" ry="24" fill="#887da8"/><ellipse cx="211" cy="180" rx="65" ry="18" fill="#515477" stroke="#b5b3d3" stroke-width="2"/><path d="M211 169V91" stroke="#9b91b8" stroke-width="7"/><g class="arcade-scene-orbit"><ellipse cx="211" cy="114" rx="54" ry="16" fill="none" stroke="#c7bfdc" stroke-width="3" transform="rotate(-29 211 114)"/><ellipse cx="211" cy="114" rx="54" ry="16" fill="none" stroke="#8ebdce" stroke-width="3" transform="rotate(42 211 114)"/></g><circle cx="211" cy="114" r="14" fill="${light}"/>${star(259,92,.8,light)}${star(167,144,.6)}${tree(125,171,.52,leaf)}`;
    else feature=`${tree(129,168,.8,leaf)}${tree(285,153,.9,leaf)}<path d="m184 176 26-100 31 103-29 13Z" fill="#958bab"/><path d="m210 76 2 116 29-13-21-84Z" fill="#b7adc7"/><path d="m190 91 20-36 25 36-24 13Z" fill="#c3a0c9"/><path d="m197 87 14-18 16 19-15 9Z" fill="#fae0a8"/><path class="arcade-scene-beam" d="M202 82 143 33l-14 40 72 16m20-7 83-31 12 33-91 8" fill="#e6cf9433" stroke="none"/><path d="m179 193 33-13 34 13-33 14Z" fill="#ccb8b3"/>${star(210,84,.7,'#ffedbc')}`;
    return `<svg class="arcade-scene ${compact?'compact':''}" viewBox="0 0 420 275" aria-hidden="true"><ellipse cx="210" cy="230" rx="164" ry="23" fill="#070c1e3d"/><ellipse cx="212" cy="118" rx="132" ry="90" fill="${accent}0d"/><circle cx="211" cy="125" r="103" fill="none" stroke="${accent}33" stroke-width="1" stroke-dasharray="2 8"/>${star(90,88,.35,light)}${star(330,101,.4,light)}${star(315,58,.23,light)}<g class="arcade-scene-island"><path d="m61 181 150-61 150 61-151 63Z" fill="#444462" stroke="#777395" stroke-width="2"/><path d="m61 181 149 63 151-63-53 55-98 27-96-29Z" fill="#30324b"/><path d="m61 181 149 63v19l-96-29Z" fill="#373450"/><path d="m80 182 130-51 132 50-132 53Z" fill="${leaf}15"/>${feature}<path d="m114 204 17-6 10 5-17 6Zm176-21 12-5 7 4-12 5Z" fill="${accent}" opacity=".7"/></g></svg>`;
  }
  function glyph(kind,extra=''){
    const common=`class="arcade-glyph ${extra}" viewBox="0 0 60 60" aria-hidden="true"`;
    const art={
      player:'<ellipse cx="30" cy="49" rx="16" ry="5" fill="#14213255"/><path d="m30 22 13 24-13 7-13-7Z" fill="#c9b3f0"/><circle cx="30" cy="23" r="7" fill="#ead5ba"/><path d="m30 5 13 21H15Z" fill="#b6a0e3"/><path d="m39 33 7-8v24" stroke="#dec99e" stroke-width="3"/><circle cx="46" cy="24" r="4" fill="#f1e7c2"/>',
      gem:'<path d="m30 7 16 18-16 28-16-28Z" fill="#8fded6"/><path d="m30 7 0 46 16-28Z" fill="#60a5b1"/><path d="m30 7-16 18h32Z" fill="#c8f2df"/>',
      wall:'<path d="m10 28 9-17 25-1 8 26-11 12-31-6Z" fill="#626985"/><path d="m19 11 10 19 23 6-8-26Z" fill="#79829b"/><path d="m10 28 19 2 12 18-31-6Z" fill="#515973"/>',
      hazard:'<path d="m9 45 11-28 10 21 12-30 12 39Z" fill="#c092b5"/><path d="m20 17 3 29H9Z" fill="#9c769b"/><path d="m42 8 0 38h12Z" fill="#e1adcb"/>',
      camp:'<path d="m14 46 33 2m-29 4 29-11" stroke="#ad967f" stroke-width="6"/><path d="M18 42c-6-12 12-19 10-34 18 21 22 27 11 36Z" fill="#eac090"/><path d="M25 42c-5-6 6-13 7-20 9 14 8 20 0 22Z" fill="#fff0bb"/>',
      exit:'<path d="M17 48V17l13-8 13 8v31" stroke="#b2d8b7" stroke-width="5" fill="#94b9ad22"/><path d="m22 44 8-16 8 16Z" fill="#d9ecc2"/><path d="M10 49h40" stroke="#89a4a8" stroke-width="3"/>',
      flower:'<path d="M30 48V26m0 16-11-8m11 4 10-8" stroke="#819e8f" stroke-width="4"/><path d="M30 13c8-15 20 0 10 8 16 2 10 18-3 12-3 15-20 9-15-3-16 2-17-17-3-16-4-13 11-17 11-1Z" fill="#d5abd9"/><circle cx="29" cy="22" r="6" fill="#f3d799"/>',
      water:'<path d="M30 6C24 19 13 27 13 37a17 17 0 0 0 34 0C47 27 35 16 30 6Z" fill="#8bc8d3"/><path d="M20 34c-3 8 0 12 6 13" fill="none" stroke="#cff4eb" stroke-width="3"/>',
      grove:'<path d="M30 50V23" stroke="#aa96a8" stroke-width="5"/><path d="m30 6 16 21H14Z" fill="#a9cfb2"/><path d="m30 19 21 24H9Z" fill="#85b99f"/><path d="m30 6 0 37H9l13-16h-8Z" fill="#587c861e"/>',
      stone:'<path d="m13 21 18-13 16 14-3 22-16 9-17-14Z" fill="#afabd1"/><path d="m31 8-3 45 16-9 3-22Z" fill="#818ab4"/><path d="m13 21 18-13-9 20Z" fill="#e0d4ea"/><path d="m31 24 2 5 6 2-6 2-2 6-2-6-5-2 5-2Z" fill="#e7d9a9"/>',
      target:'<path d="m30 8 6 14 15 8-15 6-6 16-6-16-15-6 15-8Z" fill="#efd49c"/><path d="m30 19 4 8 8 3-8 3-4 9-4-9-8-3 8-3Z" fill="#fff0c8"/>',
      receiver:'<circle cx="30" cy="30" r="21" fill="#667b9166" stroke="#a7c6d8" stroke-width="3"/><path d="m30 17 12 13-12 13-12-13Z" fill="#b9d8e1"/><circle cx="30" cy="30" r="5" fill="#eef5df"/>',
      emitter:'<path d="m12 17 23 5 12 8-12 9-23 5Z" fill="#bca4d9"/><path d="M15 22v17m9-15v13" stroke="#e9d7ef" stroke-width="3"/><circle cx="41" cy="30" r="6" fill="#f6d99c"/>',
      fog:'<path d="M8 26q5-9 12-3 3-13 13-7 7-1 9 8 14-2 12 9H8Z" fill="#6c719730"/><path d="M12 40h23m5 0h7" stroke="#9698b43a" stroke-width="2"/>',
      footprint:'<circle cx="24" cy="26" r="3" fill="#c6c3d744"/><circle cx="36" cy="35" r="3" fill="#c6c3d744"/>'
    };
    return `<svg ${common}>${art[kind]||art.footprint}</svg>`;
  }
  function formatTime(seconds){return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
  function header(){
    const v=activeVenue(),active=data?.active;
    put('arcade-pill-icon',scene(v?.id||selected,true));
    if($('arcade-pill-title'))$('arcade-pill-title').textContent=active?`继续 · ${v?.name||'群岛探险'}`:`${v?.name||'晨雾营地'} · ${sceneNames[v?.type]||'雾中寻路'}`;
    if($('arcade-pill-status'))$('arcade-pill-status').textContent=active?`${sceneNames[active.type]||'小岛游戏'} · ${formatTime(secondsLeft())} 内归航`:`${number(data?.available)} 张游玩券 · ${new Set((data?.venues||[]).map(v=>v.type)).size} 种玩法`;
    if($('arcade-pill-meta'))$('arcade-pill-meta').textContent=active?'这一局的旅程还在继续':number(data?.available)>0?'把这一小段时间，留给玩耍。':capped()?'今日小憩已收好，明天再来。':`再专注 ${minutes(data?.nextTicketMinutes)} 分钟，获得一张券`;
    if($('arcade-open'))$('arcade-open').textContent=active?'继续游玩 ↗':'打开游乐场 ↗';
  }
  function rulesPanel(type){
    if(advanced(type))return adventures().rules(type);
    if(type==='trail')return `<div class="arcade-how-grid"><p><b>01 · 走进雾里</b>方向键 / WASD，或点击相邻格。每走一步都会看清身边的地形；石头不能穿过。</p><p><b>02 · 留意行囊</b>收集足够的青晶，再走到归航门。荆棘消耗 1 颗心；篝火恢复 1 颗心。</p><p><b>03 · 先想好再走</b>探灯能照亮更大一片区域，也会消耗一步。出口位置始终可见，别把步数都花在回头路上。</p></div>`;
    if(type==='mirrors')return `<div class="arcade-how-grid"><p><b>01 · 转动镜片</b>点击镜子切换「／」与「＼」。也可以用 Tab 选择镜子、回车转动。</p><p><b>02 · 观察光路</b>光束碰到镜面会转弯，石墙会挡住光。每次转动都能立刻看见新的轨迹。</p><p><b>03 · 让星点同时亮起</b>用同一束光经过所有星点，最后抵达圆形接收器。旋转次数有限，可以先在脑中走一遍。</p></div>`;
    return `<div class="arcade-how-grid"><p><b>01 · 种下一个小世界</b>先选手牌，再点空地。数字键 1 / 2 / 3 选牌；方向键移动格子焦点，回车放置。</p><p><b>02 · 邻居带来加分</b>每块 +4；花邻水 +4、邻花 +2；树邻水或树 +3；水邻花或树 +2；星石每种不同的花 / 水 / 树邻居 +5。只算上下左右。</p><p><b>03 · 留意整行与整列</b>填满一行或一列，再 +12。先想好搭配，再摆下手牌；有限的放置次数里，争取越过目标分。</p></div>`;
  }
  function setup(){
    if(!$('arcade-root')||$('arcade-shell'))return;
    $('arcade-root').innerHTML=`<section id="arcade-shell" class="arcade-shell" aria-label="星海游乐场"><div id="arcade-top"></div><div id="arcade-error" role="status" aria-live="polite"></div><div id="arcade-content"></div><div id="arcade-announcer" class="arcade-sr-only" role="status" aria-live="polite"></div></section>`;
    cache.clear();
  }
  function top(){
    const r=data.rules||{},rewarded=data.rewardToday||{};
    put('arcade-top',`<div class="arcade-heading"><div><span class="arcade-eyebrow">THE STARLIGHT ARCADE · YOUR NEXT ADVENTURE</span><h2>星海游乐场<span>在这里，只管好好玩。</span></h2></div><div class="arcade-pass"><span>今日游玩券</span><strong>${number(data.available)}<small> / ${number(r.maxTickets)}</small></strong><i>${number(data.used)} 张已使用</i></div></div><div class="arcade-quota"><div><span class="arcade-ticket-dots" aria-hidden="true">${Array.from({length:Math.max(0,Math.min(20,number(r.maxTickets)))},(_,i)=>`<i class="${i<number(data.available)?'ready':i<number(data.earned)?'used':''}"></i>`).join('')}</span><span>${capped()?(number(data.used)>=number(r.maxTickets)?'今日的游玩机会已用完，明天再来':'今日的游玩券已全部获得'):`每 ${minutes(r.ticketMinutes)} 分钟专注获得 1 张 · 下一张还差 ${minutes(data.nextTicketMinutes)} 分钟`}</span></div><span>今日游戏所得 <b>● ${number(rewarded.coins)} / ${number(r.dailyCoins)}</b><b>◆ ${number(rewarded.diamonds)} / ${number(r.dailyDiamonds)}</b></span></div>`);
    put('arcade-error',error?`<div class="arcade-notice"><p>${esc(error)}</p><button type="button" data-arcade-action="reload" ${busy?'disabled':''}>重新同步</button></div>`:'');
  }
  function postcard(session){
    if(advanced(session.type))return adventures().postcard(session);
    const s=session.state;if(!s||session.status==='active'||!s.width||!s.height)return '';
    const w=number(s.width),h=number(s.height),cell=44,pad=session.type==='mirrors'?44:12;
    const icon=(kind,x,y,rotation=0)=>`<g transform="translate(${x} ${y}) scale(.62)"><g transform="rotate(${rotation} 30 30)">${glyph(kind).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')}</g></g>`;
    const tiles=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let kind=s.cells?.[y]?.[x]||'empty',lit=false;
      if(session.type==='trail')kind=s.player?.x===x&&s.player?.y===y?'player':s.cells[y][x]||(s.exit?.x===x&&s.exit?.y===y?'exit':'fog');
      if(session.type==='mirrors'){const target=s.targets?.find(t=>t.x===x&&t.y===y);kind=s.walls?.some(t=>t.x===x&&t.y===y)?'wall':target?'target':'empty';lit=!!target?.lit;}
      const fill={flower:'#c99ecd25',water:'#7abfcc3d',grove:'#83b79338',stone:'#ada4cd31',fog:'#25283e',player:'#9b85c13d',hazard:'#bc789832',gem:'#74b8b736'}[kind]||'#8aaf851c';
      tiles.push(`<rect x="${x*cell+2}" y="${y*cell+2}" width="40" height="40" rx="5" fill="${fill}" stroke="#abc4bc1d"/>`);
      if(!['empty','floor'].includes(kind))tiles.push(`<g opacity="${session.type==='mirrors'&&kind==='target'&&!lit?'.4':'1'}">${icon(kind,x*cell+3,y*cell+3)}</g>`);
    }
    if(session.type==='mirrors'){
      tiles.push(`<polyline points="${(s.beam||[]).map(p=>`${(p.x+.5)*cell},${(p.y+.5)*cell}`).join(' ')}" stroke="#f3dba8" stroke-width="2" fill="none"/>`);
      for(const m of s.mirrors||[]){const x=m.x*cell,y=m.y*cell;tiles.push(`<circle cx="${x+22}" cy="${y+22}" r="18" fill="#63809233"/><path d="${m.orientation==='/'?`M${x+11} ${y+33} ${x+33} ${y+11}`:`M${x+11} ${y+11} ${x+33} ${y+33}`}" stroke="#bddfe5" stroke-width="5"/>`);}
      for(const [point,kind] of [[s.emitter,'emitter'],[s.receiver,'receiver']])if(point)tiles.push(icon(kind,(point.x+.5)*cell-18.6,(point.y+.5)*cell-18.6,kind==='emitter'?({up:-90,down:90,left:180,right:0}[point.direction]||0):0));
    }
    const name=venue(session.venue)?.name||'群岛探险',caption=session.type==='garden'?'你亲手安放的小花园':session.type==='mirrors'?'这一局留下的光路':'雾中走过的一段路';
    return `<figure class="arcade-postcard"><svg viewBox="0 0 ${w*cell+pad*2} ${h*cell+pad*2}" role="img" aria-label="${esc(name)}，${caption}，本局结束时的画面"><g transform="translate(${pad} ${pad})">${tiles.join('')}</g></svg><figcaption><b>${caption}</b><span>旅途留影 · ${esc(String(session.endedAt||session.startedAt||'').slice(0,10))}</span></figcaption></figure>`;
  }
  function album(){
    const seen=new Set(),sessions=(data.history||[]).filter(s=>{if(!s.result||!['won','lost','expired','abandoned'].includes(s.status)||seen.has(s.id))return false;seen.add(s.id);return true;}).slice(0,14);
    if(!sessions.length)return '';
    return `<details class="arcade-album"><summary><span>最近足迹 <small>收好最近 ${sessions.length} 段冒险</small></span><span>打开旅途留影 ＋</span></summary><div class="arcade-memory-list">${sessions.map(s=>`<details class="arcade-memory" data-arcade-memory="${esc(s.id)}"><summary><span class="arcade-memory-symbol">${s.result.won?'✦':'☾'}</span><span><strong>${esc(venue(s.venue)?.name||'群岛探险')}</strong><small>${esc(String(s.endedAt||s.startedAt||'').slice(0,16).replace('T',' '))} · ${esc(sceneNames[s.type]||'岛上冒险')}</small></span><span class="arcade-memory-score">${number(s.result.score)} 分 <small>${number(s.result.medal)?medal(s.result.medal):({expired:'到时归航',abandoned:'提前归航',lost:'旅程已收好'}[s.status]||'旅程已收好')}</small></span><span>↗</span></summary><div class="arcade-memory-body">${postcard(s)}<div><p>${esc(s.result.reason||'这段小小冒险，已经收在旅途里。')}</p><span class="arcade-memory-reward-label">当时实际获得</span><div>${reward(s.result)}</div><small>只供回看，留影不会开启新一局。</small></div></div></details>`).join('')}</div></details>`;
  }
  function putContent(html){
    const key=n=>n.getAttribute('data-arcade-memory')||n.className;
    const opened=[...($('arcade-content')?.querySelectorAll('details[open]')||[])].map(key);
    if(put('arcade-content',html))for(const n of $('arcade-content').querySelectorAll('details'))if(opened.includes(key(n)))n.open=true;
  }
  function collectionBook(){
    const c=data.collection||{},cards=c.cards||[],relics=c.relics||[],captains=c.captains||[];
    const total=(data.venues||[]).reduce((n,v)=>n+number(v.wins),0);
    return `<details class="arcade-collection"><summary><span>冒险收藏室 <small>战斗中遇见的牌与遗物，都会留在这里</small></span><b>${cards.length} 张卡牌 · ${relics.length} 件遗物 · ${total} 次通关 ＋</b></summary><div class="arcade-collection-body"><p>收藏跨天保留。新一局从公平的起点出发，遗物与卡组在本局重新构筑。</p>${captains.length?`<div class="arcade-captain-records">${captains.map(c=>`<span>${esc(c.name)} <b>${number(c.wins)} 次归航</b></span>`).join('')}</div>`:''}${!cards.length&&!relics.length?'<div class="arcade-empty-collection">第一次远征之后，这里就会有你的发现。选过的遗物与获得的卡牌会自动收好。</div>':`<div class="arcade-collection-grid">${[...relics,...cards].map(i=>`<article><small>${i.game==='dice'?'符文骰局':i.kind==='card'?'星船卡牌':'星船遗物'}</small><strong>${esc(i.name)}</strong><p>${esc(i.description)}</p></article>`).join('')}</div>`}</div></details>`;
  }
  function lobby(){
    const v=venue(selected)||data.venues?.[0];if(!v)return;
    selected=v.id;
    const r=data.rules||{},last=latestResult||data.lastResult;
    const groups=['voyage','dice','trail','mirrors','garden'].map(type=>({type,places:(data.venues||[]).filter(v=>v.type===type)})).filter(g=>g.places.length);
    const flavor={voyage:['每一局，都能组出另一艘船','选择船长 · 分岔路线 · 卡组与遗物','策略冒险'],dice:['留下好骰，把风险变成胜机','锁骰重掷 · 六式连招 · 首领对决','策略冒险'],trail:['带上探灯，走一条未知的小路','迷雾探索 · 体力规划 · 星石寻宝','轻松益智'],mirrors:['一面镜子，可以改变整条光路','机关解谜 · 路径推演 · 点亮星辰','轻松益智'],garden:['几块地形，搭出一个小世界','手牌布局 · 相邻加分 · 花庭造景','轻松益智']};
    const library=`<section class="arcade-library" aria-label="选择游戏">${groups.map(g=>{const p=g.places.find(p=>p.id===selected)||g.places[0],f=flavor[g.type],isNew=advanced(g.type);return `<button type="button" class="arcade-library-card ${g.type===v.type?'selected':''} ${isNew?'flagship':''}" data-arcade-venue="${esc(p.id)}" aria-pressed="${g.type===v.type}" ${busy?'disabled':''}><div class="arcade-library-art">${scene(p.id,true)}</div><div><small>${f[2]}${isNew?' · NEW':''}</small><strong>${isNew?esc(p.name):sceneNames[g.type]}</strong><span>${f[0]}</span></div><i>↗</i></button>`;}).join('')}</section>`;
    const variants=groups.find(g=>g.type===v.type).places;
    const choices=variants.length>1?`<div class="arcade-variant-list" aria-label="选择场景">${variants.map(p=>`<button type="button" class="${p.id===v.id?'selected':''}" data-arcade-venue="${esc(p.id)}" aria-pressed="${p.id===v.id}" ${busy?'disabled':''}>${esc(p.name)} <span>${number(p.bestMedal)?'✦'.repeat(number(p.bestMedal)):'待探索'}</span></button>`).join('')}</div>`:'';
    const html=`<div class="arcade-lobby">${library}<section class="arcade-destination ${advanced(v.type)?'flagship':''}" style="--arcade-color:${(palettes[v.id]||palettes['mist-camp'])[0]}"><div class="arcade-destination-art">${scene(v.id)}<span class="arcade-scene-caption">${esc(flavor[v.type]?.[1]||v.subtitle)}</span></div><div class="arcade-destination-copy"><span class="arcade-eyebrow">${esc(sceneNames[v.type]||v.type)} · 每局一段完整冒险</span><h3>${esc(v.name)}</h3><p class="arcade-subtitle">${esc(v.subtitle)}</p><p class="arcade-description">${esc(v.description)}</p>${choices}<div class="arcade-place-record"><span>${number(v.plays)?`${number(v.plays)} 次出发 · ${number(v.wins)} 次通关`:'新的旅程，等你出发'}</span><b>${number(v.bestMedal)?`${medal(v.bestMedal)} · 最佳 ${number(v.bestScore)} 分`:'通关后留下成绩与旅途留影'}</b></div><button type="button" class="arcade-primary" data-arcade-action="start" ${busy||number(data.available)<1?'disabled':''}>${busy?'正在准备旅程…':number(data.available)>0?'开始这场冒险 →':'游玩券还在路上'}</button><p class="arcade-entry-note">使用 1 张券 · 最长 ${Math.round(number(r.roundSeconds)/60)} 分钟 · 先看下方玩法手册<br>开始即用券，离开后继续计时；各玩法共用次数与奖励额度。</p></div></section><div class="arcade-lobby-bottom"><details class="arcade-rulebook"><summary>玩法手册 <span>${esc(sceneNames[v.type]||v.type)} ＋</span></summary>${rulesPanel(v.type)}</details><details class="arcade-boundaries"><summary>游玩券与奖励 <span>当日规则 ＋</span></summary><p>今天每 ${minutes(r.ticketMinutes)} 分钟有效专注获得 1 张券，每天最多 ${number(r.maxTickets)} 张，当日有效。所有游戏共用额度，每局最多 ${Math.round(number(r.roundSeconds)/60)} 分钟。游戏过程中不需要答题或完成学习内容。</p><p>通关获得 ${number(r.winCoins)} 金币与 ${number(r.winDiamonds)} 钻石，自然失败获得 ${number(r.lossCoins)} 金币；超时和提前归航没有奖励。每天合计最多 ${number(r.dailyCoins)} 金币与 ${number(r.dailyDiamonds)} 钻石，达到上限后成绩仍会保留。</p><p>没有购买次数或押注货币的入口。每日机会结束后，仍可回看收藏与留影；下一次冒险明天再继续。</p></details></div>${collectionBook()}${last?resultCard(last,false):''}${album()}</div>`;
    putContent(html);
  }
  function resultCard(session,large){
    const r=session.result;if(!r)return '';
    const v=venue(session.venue),status={won:'这段冒险，漂亮收官。',lost:'先把这一程收好。',expired:'小憩时间到，慢慢归航。',abandoned:'这次先到这里。'}[session.status]||'一段冒险已收好。';
    return `<section class="arcade-result ${large?'full':''}" aria-label="本局结果"><div class="arcade-result-medal ${r.won?'won':''}" aria-hidden="true"><span>${r.won?'✦':'☾'}</span><i>${number(r.medal)?'✧'.repeat(Math.min(3,number(r.medal))):'·'}</i></div><div class="arcade-result-copy"><span class="arcade-eyebrow">${large?'THE JOURNEY IS YOURS':'LAST LITTLE ADVENTURE'}</span><h3>${status}</h3><p>${esc(v?.name||'群岛探险')} · ${number(r.score)} 分${number(r.medal)?` · ${medal(r.medal)}`:''}</p><p>${esc(r.reason||'每一程，都有自己的风景。')}</p></div><div class="arcade-result-reward"><span>本次实际获得</span><div>${reward(r)}</div><small>${number(r.coins)===0&&number(r.diamonds)===0?(session.status==='abandoned'?'提前归航，本次不发放奖励。':session.status==='expired'?'时间已到，本次不发放奖励。':'今日游戏奖励额度已用满，成绩照常保存。'):'已放入你的钱包 · 今日上限内结算'}</small></div>${large?'<button type="button" class="arcade-primary" data-arcade-action="back">回到游乐场 →</button>':''}</section>`;
  }
  function boardCell(kind,x,y,body,attrs='',extra=''){
    return `<button type="button" class="arcade-cell ${kind} ${extra}" data-arcade-cell="${x},${y}" ${attrs} style="--x:${x};--y:${y}">${body}</button>`;
  }
  function trailBoard(a){
    const s=a.state,p=s.player,expired=secondsLeft()<=0;
    return `<div class="arcade-board trail" role="group" aria-label="雾中寻路棋盘，方向键或 WASD 移动" tabindex="0" style="--columns:${number(s.width)};--rows:${number(s.height)}">${s.cells.map((row,y)=>row.map((cell,x)=>{
      const current=p.x===x&&p.y===y,exit=s.exit.x===x&&s.exit.y===y,near=Math.abs(p.x-x)+Math.abs(p.y-y)===1,kind=current?'player':cell||(exit?'exit':'fog');
      const name={floor:'小径',wall:'岩石',gem:'青晶',hazard:'荆棘',camp:'篝火',exit:'归航门',fog:'尚未探索',player:'你在这里'}[kind]||'小径';
      return boardCell(kind,x,y,glyph(kind==='floor'?'footprint':kind),`aria-label="第 ${y+1} 行第 ${x+1} 列，${name}${near?'，可以前往':''}" ${!near||cell==='wall'||busy||expired?'disabled':''}`,near&&cell!=='wall'?'reachable':'');
    }).join('')).join('')}</div>`;
  }
  function mirrorsBoard(a){
    const s=a.state,w=number(s.width),h=number(s.height),expired=secondsLeft()<=0;
    const beam=(s.beam||[]).map(p=>`${(p.x+.5)*100/w},${(p.y+.5)*100/h}`).join(' ');
    function edgePoint(p,kind){if(p.x>=0&&p.x<w&&p.y>=0&&p.y<h)return '';const x=Math.max(0,Math.min(100,(p.x+.5)*100/w)),y=Math.max(0,Math.min(100,(p.y+.5)*100/h));return `<span class="arcade-mirror-edge ${kind} ${p.lit?'lit':''}" style="left:${x}%;top:${y}%" role="img" aria-label="${kind==='emitter'?'光源入口':'归光灯座'}${p.lit?'，已点亮':''}">${glyph(kind,kind==='emitter'?'direction-'+s.emitter.direction:'')}</span>`;}
    const edgeMarkers=edgePoint(s.emitter,'emitter')+edgePoint(s.receiver,'receiver');
    return `<div class="arcade-board mirrors" role="group" aria-label="折光机关棋盘，选择镜子后回车转动" tabindex="0" style="--columns:${w};--rows:${h}"><svg class="arcade-beam" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline class="beam-glow" points="${beam}"/><polyline points="${beam}"/></svg>${edgeMarkers}${Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>{
      const mirror=s.mirrors.find(m=>m.x===x&&m.y===y),target=s.targets.find(t=>t.x===x&&t.y===y),wall=s.walls.some(t=>t.x===x&&t.y===y),receiver=s.receiver.x===x&&s.receiver.y===y,emitter=s.emitter.x===x&&s.emitter.y===y;
      if(mirror)return boardCell('mirror',x,y,`<svg class="arcade-glyph mirror-piece" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="24" fill="#95bbcc19" stroke="#a9cbdb44" stroke-width="1"/><path d="${mirror.orientation==='/'?'M15 45 45 15':'M15 15 45 45'}" stroke="#bad9e1" stroke-width="7"/><path d="${mirror.orientation==='/'?'M18 46 47 17':'M13 19 42 48'}" stroke="#8296b2" stroke-width="2"/></svg><span class="arcade-mirror-mark">↻</span>`,`data-arcade-mirror="${number(mirror.id)}" aria-label="镜子 ${number(mirror.id)+1}，${mirror.orientation==='/'?'右斜':'左斜'}，点击旋转" ${busy||expired?'disabled':''}`);
      let kind=wall?'wall':receiver?'receiver':emitter?'emitter':target?'target':'floor';
      const label=wall?'石墙':receiver?`接收器${s.receiver.lit?'，已点亮':''}`:emitter?'光源':target?`星点${target.lit?'，已点亮':''}`:'空地';
      return `<div class="arcade-cell ${kind} ${(target?.lit||receiver&&s.receiver.lit)?'lit':''}" aria-label="${label}" style="--x:${x};--y:${y}">${kind==='floor'?'':glyph(kind,emitter?'direction-'+s.emitter.direction:'')}</div>`;
    }).join('')).join('')}</div>`;
  }
  function gardenGain(s,x,y,type){
    if(s.cells[y]?.[x])return 0;
    const neighbours=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].map(([cx,cy])=>s.cells[cy]?.[cx]).filter(Boolean);
    let gain=4;
    for(const n of neighbours){if(type==='flower')gain+=n==='water'?4:n==='flower'?2:0;if(type==='grove')gain+=n==='water'||n==='grove'?3:0;if(type==='water')gain+=n==='flower'||n==='grove'?2:0;}
    if(type==='stone')gain+=new Set(neighbours.filter(n=>n!=='stone')).size*5;
    if(s.cells[y].every((n,i)=>n||i===x))gain+=12;
    if(s.cells.every((row,i)=>row[x]||i===y))gain+=12;
    return gain;
  }
  function gardenBoard(a){
    const s=a.state,expired=secondsLeft()<=0,type=s.hand[handIndex]||s.hand[0];
    return `<div class="arcade-board garden" role="group" aria-label="口袋造景棋盘，选择手牌后点击空地" tabindex="0" style="--columns:${number(s.width)};--rows:${number(s.height)}">${s.cells.map((row,y)=>row.map((kind,x)=>boardCell(kind||'empty',x,y,kind?glyph(kind):`<span class="arcade-plant-hint">＋</span><span class="arcade-gain">+${gardenGain(s,x,y,type)}</span>`,`aria-label="第 ${y+1} 行第 ${x+1} 列，${kind?tileNames[kind]:`空地，放置${tileNames[type]}预计加 ${gardenGain(s,x,y,type)} 分`}" ${kind||busy||expired?'disabled':''}`)).join('')).join('')}</div>`;
  }
  function hud(a){
    if(advanced(a.type))return adventures().hud(a);
    const s=a.state;
    if(a.type==='trail')return `<div><span>青晶</span><strong>${number(s.gems)}<small> / ${number(s.requiredGems)}</small></strong></div><div><span>旅途体力</span><strong class="arcade-hearts" aria-label="${number(s.health)} 颗心">${'♥'.repeat(Math.max(0,Math.min(8,number(s.health))))}</strong></div>`;
    if(a.type==='mirrors')return `<div><span>已亮星点</span><strong>${s.targets.filter(t=>t.lit).length}<small> / ${s.targets.length}</small></strong></div><div><span>接收器</span><strong class="arcade-hud-word">${s.receiver.lit?'已点亮':'等待光束'}</strong></div>`;
    return `<div><span>造景得分</span><strong>${number(s.score)}<small> / ${number(s.targetScore)}</small></strong></div><div><span>刚刚获得</span><strong class="arcade-hud-gain">+${number(s.lastGain)}</strong></div>`;
  }
  function controls(a){
    if(advanced(a.type))return adventures().controls(a,{disabled:busy||secondsLeft()<=0});
    const s=a.state,disabled=busy||secondsLeft()<=0;
    if(a.type==='trail')return `<div class="arcade-trail-tools"><div class="arcade-dpad" aria-label="移动方向">${[['up','↑','向上'],['left','←','向左'],['down','↓','向下'],['right','→','向右']].map(([dir,sign,title])=>`<button type="button" class="${dir}" data-arcade-direction="${dir}" aria-label="${title}" ${disabled?'disabled':''}>${sign}</button>`).join('')}</div><button type="button" class="arcade-scan" data-arcade-action="scan" ${disabled||number(s.scans)<1?'disabled':''}><span>☼</span><strong>点亮探灯</strong><small>${number(s.scans)} 次 · 消耗 1 步</small></button></div><div class="arcade-legend"><span>${glyph('gem')}青晶</span><span>${glyph('camp')}恢复体力</span><span>${glyph('hazard')}损失体力</span><span>${glyph('exit')}归航门</span></div>`;
    if(a.type==='mirrors')return `<div class="arcade-mirror-hint"><span>↻</span><strong>轻点一面镜子，让光拐个弯。</strong><p>所有星点与接收器，需要同时亮起。</p></div><div class="arcade-legend"><span>${glyph('emitter')}光源</span><span>${glyph('target')}星点</span><span>${glyph('receiver')}接收器</span></div>`;
    return `<div class="arcade-hand" aria-label="选择造景手牌">${s.hand.map((kind,i)=>`<button type="button" class="${handIndex===i?'selected':''}" data-arcade-hand="${i}" aria-pressed="${handIndex===i}" ${disabled?'disabled':''}><span class="arcade-hand-key">${i+1}</span>${glyph(kind)}<strong>${tileNames[kind]||kind}</strong></button>`).join('')}</div><p class="arcade-garden-tip">空地上的数字，是放置当前手牌预计获得的分数。</p><div class="arcade-garden-score-guide"><span>花 ＋ 水 <b>+4</b></span><span>树 ＋ 水 / 树 <b>+3</b></span><span>填满整行 / 列 <b>+12</b></span></div>`;
  }
  function play(){
    const a=data.active,v=venue(a.venue),s=a.state;
    const old=$('arcade-play'),phaseChanged=advanced(a.type)&&old?.dataset.phase!==s.phase;
    if(!old||old.dataset.session!==a.id){
      put('arcade-content',`<section id="arcade-play" class="arcade-play" data-session="${esc(a.id)}" data-type="${esc(a.type)}"><div class="arcade-game-head"><div><span class="arcade-eyebrow">${esc(sceneNames[a.type])}</span><h3>${esc(v?.name||'群岛探险')}</h3></div><button type="button" class="arcade-text-button" data-arcade-action="abandon">提前归航 ↗</button></div><div class="arcade-game-layout"><div class="arcade-game-stage"><div class="arcade-board-frame"><div id="arcade-board-host"></div></div><p id="arcade-message" class="arcade-game-message" role="status"></p></div><aside class="arcade-game-aside"><div class="arcade-live-clock"><span>这一局的时间</span><strong id="arcade-countdown">${formatTime(secondsLeft())}</strong><small>离开页面后，时间仍会继续。</small></div><div id="arcade-hud" class="arcade-hud"></div><div class="arcade-step-track"><div><span>${a.type==='garden'?'已放置':a.type==='mirrors'?'已转动':'已行动'}</span><strong id="arcade-step-label"></strong></div><i><b id="arcade-step-bar"></b></i></div><div id="arcade-controls"></div><details class="arcade-rulebook in-game"><summary>看看玩法 <span>＋</span></summary>${rulesPanel(a.type)}</details><div id="arcade-abandon"></div></aside></div></section>`);
      ['arcade-board-host','arcade-hud','arcade-controls','arcade-abandon'].forEach(id=>cache.delete(id));
    }
    const focused=document.activeElement?.getAttribute?.('data-arcade-cell');
    const focusedMirror=document.activeElement?.getAttribute?.('data-arcade-mirror');
    const focusedHand=document.activeElement?.getAttribute?.('data-arcade-hand');
    const focusedDirection=document.activeElement?.getAttribute?.('data-arcade-direction');
    const boardMarkup=advanced(a.type)?adventures().board(a,{disabled:busy||secondsLeft()<=0}):a.type==='trail'?trailBoard(a):a.type==='mirrors'?mirrorsBoard(a):gardenBoard(a);
    const boardChanged=put('arcade-board-host',boardMarkup);
    put('arcade-hud',hud(a));
    put('arcade-controls',controls(a));
    $('arcade-message').textContent=s.message||'一小段冒险，从眼前这一步开始。';
    const steps=a.type==='garden'?number(s.placements):number(a.steps),max=a.type==='garden'?number(s.maxPlacements):number(a.maxSteps);
    $('arcade-step-label').textContent=`${steps} / ${max}`;
    $('arcade-step-bar').style.width=`${Math.min(100,steps/Math.max(1,max)*100)}%`;
    put('arcade-abandon',abandon?`<div class="arcade-abandon-confirm"><strong>这一局就先到这里？</strong><p>本次游玩券不会返还，提前归航没有奖励。</p><div><button type="button" class="arcade-text-button" data-arcade-action="cancel-abandon" ${busy?'disabled':''}>继续这局</button><button type="button" class="arcade-end-button" data-arcade-action="finish" ${busy?'disabled':''}>确认归航</button></div></div>`:'');
    if(boardChanged&&focusedMirror!==null&&focusedMirror!==undefined)document.querySelector(`[data-arcade-mirror="${focusedMirror}"]`)?.focus({preventScroll:true});
    else if(boardChanged&&focused)document.querySelector(`[data-arcade-cell="${focused}"]:not(:disabled)`)?.focus({preventScroll:true});
    if(focusedHand!==null&&focusedHand!==undefined)document.querySelector(`[data-arcade-hand="${focusedHand}"]`)?.focus({preventScroll:true});
    if(focusedDirection)document.querySelector(`[data-arcade-direction="${focusedDirection}"]`)?.focus({preventScroll:true});
    if(announce!==s.message){announce=s.message;$('arcade-announcer').textContent=s.message||'';}
    if(advanced(a.type))$('arcade-play').dataset.phase=s.phase;
    if(phaseChanged&&visible)$('arcade-play').scrollIntoView({block:'start',behavior:'auto'});
  }
  function repaint(){
    if(!data)return;
    setup();header();if(!$('arcade-shell'))return;
    $('arcade-shell').classList.toggle('reduced-motion',settings.motion===false||settings.reducedMotion===true);
    document.querySelector('.arcade-pill')?.classList.toggle('reduced-motion',settings.motion===false||settings.reducedMotion===true);
    top();
    if(data.active)play();
    else if(latestResult)putContent(`<div class="arcade-result-scene"><div class="arcade-finish-layout">${postcard(latestResult)}${resultCard(latestResult,true)}</div></div>`);
    else lobby();
    tick();
  }
  function tick(){
    if(!data?.active)return;
    const left=secondsLeft(),clockNode=$('arcade-countdown');
    if(clockNode){clockNode.textContent=formatTime(left);clockNode.classList.toggle('ending',left<=30);}
    if($('arcade-pill-status'))$('arcade-pill-status').textContent=`${sceneNames[data.active.type]||'小岛游戏'} · ${formatTime(left)} 内归航`;
    if(left<=0&&expiryRequest!==data.active.id){
      expiryRequest=data.active.id;
      if(busy){deferred={...data,__expired:true};return;}
      sync(true);
    }
  }
  function setClock(){if(clock)root.clearInterval(clock);clock=null;if(visible&&data?.active)clock=root.setInterval(tick,1000);}
  function render(next,config){
    if(config)settings=config;
    if(!next)return;
    const nextStamp=stamp(next.now);
    if(next.active&&terminalIds.has(next.active.id))return;
    if(next.active&&data?.active?.id===next.active.id&&number(next.active.version)<number(data.active.version))return;
    if(Number.isFinite(nextStamp)&&nextStamp<lastStamp)return;
    if(busy){if(!deferred||stamp(deferred.now)<=nextStamp)deferred=next;return;}
    if(Number.isFinite(nextStamp))lastStamp=nextStamp;
    const serverNow=Date.parse(next.now),estimated=clockLocal?now():serverNow;
    clockServer=Number.isFinite(serverNow)?Math.max(serverNow,estimated):Date.now();clockLocal=Date.now();
    const was=knownActive;
    data=next;
    if(data.lastResult?.id)terminalIds.add(data.lastResult.id);
    for(const h of data.history||[])if(h.status!=='active')terminalIds.add(h.id);
    if(data.active){startIntent=null;knownActive=data.active.id;if(data.active.id!==was){adventures()?.reset?.(data.active.id);handIndex=0;abandon=false;expiryRequest=null;}selected=data.active.venue;}
    else {
      if(was&&data.lastResult?.id===was){latestResult=data.lastResult;if(data.lastResult.status==='won')bridge.playSound?.('arcadeWin',{key:'arcade-result:'+was});}
      knownActive=null;abandon=false;expiryRequest=null;
    }
    if(data.active&&handIndex>=data.active.state.hand?.length&&data.active.type==='garden')handIndex=0;
    repaint();setClock();
  }
  function flush(){const pending=deferred;deferred=null;if(pending?.__expired){sync(true);return;}if(pending)render(pending);}
  async function sync(expired=false,preserveError=false){
    if(busy)return;
    busy=true;
    try{const next=await bridge.api('/api/arcade');busy=false;if(!preserveError)error='';render(next);}
    catch(e){busy=false;error=expired?'这局时间已经结束，正在等待同步结果。可以重新同步，游玩券不会再次扣除。':e.message||'暂时未能同步，稍后再试。';repaint();}
    finally{busy=false;flush();}
  }
  async function request(action,move){
    if(busy||!data)return;
    if(action==='start'&&(data.active||number(data.available)<1))return;
    if(action!=='start'&&!data.active)return;
    if(action==='move'&&secondsLeft()<=0){tick();return;}
    const active=data.active;
    let payload;
    if(action==='start'){
      if(!root.crypto?.randomUUID){error='应用暂时无法建立安全的游玩请求，请重新打开后再试。';top();return;}
      if(!startIntent||startIntent.venue!==selected)startIntent={venue:selected,requestId:root.crypto.randomUUID()};
      payload=startIntent;
    }else payload={id:active.id,version:active.version,...(action==='move'?{move}:{})};
    pendingFocus=captureFocus();busy=true;error='';repaint();
    try{
      const next=await bridge.api('/api/arcade/'+action,payload);
      busy=false;error='';if(action==='start')startIntent=null;
      render(next);
      if(action==='start'){$('arcade-play')?.scrollIntoView({block:'start',behavior:'auto'});$('arcade-play')?.querySelector('.arcade-board')?.focus({preventScroll:true});}
      if(action==='move'&&next.active)bridge.playSound?.({trail:'arcadeStep',mirrors:'arcadeMirror',garden:'arcadePlant',voyage:'arcadeStep',dice:'arcadeMirror'}[active.type],{key:`arcade:${active.id}:${next.active.version}`});
    }catch(e){
      // An uncertain request may already be saved. Fetch authoritative state before accepting another move.
      busy=false;error=e.message||'这一步暂时没有同步，请重新同步后继续。';repaint();
      await sync(false,true);
    }finally{busy=false;repaint();flush();restoreFocus(pendingFocus);pendingFocus=null;}
    try{await bridge.refresh?.(true);}catch(_){}
  }
  function captureFocus(){
    const el=document.activeElement;if(!el||!$('arcade-root')?.contains(el))return null;
    return {adventure:el.getAttribute?.('data-adventure-focus'),mirror:el.getAttribute?.('data-arcade-mirror'),cell:el.getAttribute?.('data-arcade-cell'),hand:el.getAttribute?.('data-arcade-hand'),direction:el.getAttribute?.('data-arcade-direction'),action:el.getAttribute?.('data-arcade-action')};
  }
  function restoreFocus(token){
    if(!visible||!data?.active)return;let target=null;
    if(token?.adventure!=null)target=[...document.querySelectorAll('[data-adventure-focus]:not(:disabled)')].find(el=>el.getAttribute('data-adventure-focus')===token.adventure);
    if(token&&!target){for(const key of ['mirror','direction','hand','cell'])if(token[key]!=null){target=document.querySelector(`[data-arcade-${key}="${token[key]}"]:not(:disabled)`);if(target)break;}}
    if(!target&&data.active.type==='garden')target=document.querySelector('.arcade-board.garden .arcade-cell:not(:disabled)');
    if(!target)target=document.querySelector('.adventure-board button:not(:disabled)')||document.querySelector('.arcade-board');target?.focus({preventScroll:true});
  }
  function select(id){if(busy||data?.active||!venue(id))return;selected=id;latestResult=null;abandon=false;startIntent=null;error='';repaint();}
  function moveTrail(direction){if(data?.active?.type==='trail')request('move',{direction});}
  function cellAction(cell){
    const a=data?.active;if(!a||busy)return;
    const [x,y]=cell.dataset.arcadeCell.split(',').map(Number);
    if(a.type==='garden')request('move',{handIndex,x,y});
    else if(a.type==='trail'){
      const dx=x-a.state.player.x,dy=y-a.state.player.y;
      if(Math.abs(dx)+Math.abs(dy)!==1)return;
      moveTrail(dx===1?'right':dx===-1?'left':dy===1?'down':'up');
    }
  }
  function onClick(event){
    const target=event.target.closest('button');if(!target||target.disabled)return;
    if(data?.active&&advanced(data.active.type)){
      if((target.dataset.adventureAction!==undefined||target.dataset.adventureLock!==undefined)&&(busy||secondsLeft()<=0)){tick();return;}
      const action=adventures().action(event,data.active);
      if(action?.local){play();restoreFocus({adventure:target.getAttribute('data-adventure-focus')});return;}
      if(action?.move){request('move',action.move);return;}
    }
    if(target.dataset.arcadeVenue){select(target.dataset.arcadeVenue);return;}
    if(target.dataset.arcadeHand!==undefined){handIndex=number(target.dataset.arcadeHand);play();return;}
    if(target.dataset.arcadeMirror!==undefined){request('move',{mirrorId:number(target.dataset.arcadeMirror)});return;}
    if(target.dataset.arcadeDirection){moveTrail(target.dataset.arcadeDirection);return;}
    if(target.dataset.arcadeCell){cellAction(target);return;}
    const action=target.dataset.arcadeAction;
    if(action==='start'||action==='finish')request(action);
    else if(action==='scan')request('move',{scan:true});
    else if(action==='reload')sync();
    else if(action==='back'){latestResult=null;repaint();}
    else if(action==='abandon'){abandon=true;play();document.querySelector('[data-arcade-action="cancel-abandon"]')?.focus({preventScroll:true});}
    else if(action==='cancel-abandon'){abandon=false;play();document.querySelector('[data-arcade-action="abandon"]')?.focus({preventScroll:true});}
  }
  function onKey(event){
    const a=data?.active;if(!a||busy||!visible||event.altKey||event.ctrlKey||event.metaKey||event.repeat||abandon)return;
    if(event.target.closest?.('input,textarea,select,summary'))return;
    if(secondsLeft()<=0){tick();return;}
    if(advanced(a.type)){const action=adventures().key?.(event,a);if(action){event.preventDefault();if(action.local){const token=captureFocus();play();restoreFocus(token);}else if(action.move)request('move',action.move);}return;}
    const dirs={ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down',ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right'};
    if(a.type==='trail'&&dirs[event.key]){event.preventDefault();moveTrail(dirs[event.key]);return;}
    if(a.type==='trail'&&event.key.toLowerCase()==='f'){event.preventDefault();if(a.state.scans>0)request('move',{scan:true});return;}
    if(a.type==='garden'&&/^[1-3]$/.test(event.key)){event.preventDefault();handIndex=Number(event.key)-1;play();return;}
    if(a.type==='garden'&&event.key.startsWith('Arrow')){
      const current=event.target.closest('[data-arcade-cell]');if(!current)return;
      event.preventDefault();let [x,y]=current.dataset.arcadeCell.split(',').map(Number);
      const [dx,dy]={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[event.key];
      for(let n=0;n<Math.max(a.state.width,a.state.height);n++){x+=dx;y+=dy;if(x<0||y<0||x>=a.state.width||y>=a.state.height)return;const next=document.querySelector(`[data-arcade-cell="${x},${y}"]`);if(next&&!next.disabled){next.focus();return;}}
    }
  }
  function enter(){visible=true;if(!data){sync();return;}repaint();setClock();if(data.active)$('arcade-play')?.scrollIntoView({block:'start',behavior:'auto'});}
  function leave(){visible=false;if(clock)root.clearInterval(clock);clock=null;}
  function open(id){if(id&&venue(id)&&!data?.active)select(id);bridge.openPage?.('achievements');enter();}
  function init(callbacks){bridge=callbacks||{};if(initialized)return;initialized=true;$('arcade-open')?.addEventListener('click',()=>open());$('arcade-root')?.addEventListener('click',onClick);$('arcade-root')?.addEventListener('keydown',onKey);visible=!!bridge.isVisible?.();}
  root.FocusArcade={init,render,open,enter,leave};
})(typeof globalThis!=='undefined'?globalThis:this);
