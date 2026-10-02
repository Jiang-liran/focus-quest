const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../static/quests.js'),'utf8');
const html=fs.readFileSync(require.resolve('../static/index.html'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const stamp=seconds=>new Date(Date.UTC(2026,9,1,12,0,seconds)).toISOString();

function products(count=336){
  return Array.from({length:count},(_,index)=>({id:`${['bar','fx','fire'][index%3]}-page-${index}`,
    slot:['bar','fx','fire'][index%3],name:`收藏 ${index}`,description:'独立收藏的预览与装备',
    coins:80,diamonds:0,currency:'coins',owned:false,equipped:false}));
}
function snapshot(catalog,patch={}){
  return {day:'2026-10-01',now:stamp(0),quests:[],catalog,wallet:{coins:10000,diamonds:200},
    equipped:{bar:'bar-default',fx:'fx-default',avatar:'avatar-default',fire:'fire-default'},history:[],
    exchange:{coinsPerDiamond:75,maxPerExchange:1000,history:[]},...patch};
}
function harness(){
  const nodes=new Map(),all=[],calls={drawings:[],requests:[],refresh:[]};
  const document={activeElement:null};
  class Element{
    constructor(id='',dataset={}){
      this.id=id;this.dataset=dataset;this.listeners=new Map();this.attributes={};this.children=[];this.parent=null;
      this.disabled=false;this.hidden=false;this.open=false;this.value=id==='exchange-amount'?'1':'';this.writes=0;this._html='';this.textContent='';
      this.classes=new Set();this.classList={toggle:(name,yes)=>yes?this.classes.add(name):this.classes.delete(name)};
      all.push(this);
    }
    get innerHTML(){return this._html;}
    set innerHTML(value){
      if(this.contains(document.activeElement))document.activeElement=null;
      this.children.forEach(child=>child.parent=null);this.children=[];this._html=String(value);this.writes++;
      if(this.id==='shop-catalog')for(const match of this._html.matchAll(/<button\b([^>]*)>/g)){
        const action=match[1].match(/data-shop-action="([^"]+)"/),item=match[1].match(/data-item="([^"]+)"/);
        if(action&&item){const child=new Element('',{shopAction:action[1],item:item[1]});child.parent=this;child.disabled=/\bdisabled\b/.test(match[1]);this.children.push(child);}
      }
    }
    contains(node){return !!node&&(node===this||this.children.includes(node));}
    querySelectorAll(selector){assert.equal(selector,'[data-shop-action]');return this.children.filter(child=>'shopAction' in child.dataset);}
    closest(selector){if(selector==='[data-shop-action]'&&'shopAction' in this.dataset)return this;return null;}
    setAttribute(name,value){this.attributes[name]=String(value);}
    addEventListener(name,fn){const handlers=this.listeners.get(name)||[];handlers.push(fn);this.listeners.set(name,handlers);}
    focus(){if(!this.disabled)document.activeElement=this;}
    scrollIntoView(options){this.scrolled=options;}
    showModal(){this.open=true;element('quest-action-cancel').focus();}
    close(){this.open=false;document.activeElement=null;for(const fn of this.listeners.get('close')||[])fn({target:this});}
  }
  const element=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);};
  document.getElementById=element;document.documentElement=element('root');
  for(const filter of ['all','bar','fx','fire','interface'])element('filter-'+filter).dataset.shopFilter=filter;
  for(const market of ['coins','diamonds','limited','owned'])element('market-'+market).dataset.shopMarket=market;
  for(const area of ['all','journey','camp','interface'])element('area-'+area).dataset.shopArea=area;
  document.querySelectorAll=selector=>{
    const key={'[data-shop-market]':'shopMarket','[data-shop-area]':'shopArea','[data-shop-filter]':'shopFilter'}[selector];
    assert.ok(key,selector);return all.filter(node=>key in node.dataset);
  };
  const preview=id=>{calls.drawings.push(id);return `<svg data-preview="${id}" id="instance-${calls.drawings.length}"></svg>`;};
  const sandbox={document,crypto:require('node:crypto').webcrypto,
    QuestArt:{avatar:()=>'<svg></svg>'},ShopArt:{apply(){},preview},FocusCampfireShopArt:{preview,scene:()=>'<svg></svg>'}};
  sandbox.window=sandbox;const context=vm.createContext(sandbox);vm.runInContext(source,context);
  context.FocusQuests.init({api(path,body){return new Promise((resolve,reject)=>calls.requests.push({path,body,resolve,reject}));},
    refresh:async force=>calls.refresh.push(force),toast(){},playSound(){}});
  const click=(id,dataset)=>{
    const target=dataset?{dataset,closest(){return this;}}:element(id);
    return (element(id).listeners.get('click')||[]).map(fn=>fn({target}));
  };
  return {api:context.FocusQuests,element,document,calls,click,
    control(id,action='preview'){return element('shop-catalog').children.find(node=>node.dataset.item===id&&node.dataset.shopAction===action);},
    ids(){return element('shop-catalog').children.filter(node=>node.dataset.shopAction==='preview').map(node=>node.dataset.item);}};
}

test('real shop rendering mounts at most 24 cards and every one of 336 items is reachable with bounded page buttons',()=>{
  const h=harness(),catalog=products();h.api.render(snapshot(catalog));
  assert.equal(h.ids().length,24);assert.equal(h.calls.drawings.length,24);
  assert.equal(h.element('shop-pagination').hidden,false);
  assert.equal(h.element('shop-page-prev').disabled,true);assert.equal(h.element('shop-page-next').disabled,false);
  assert.equal(h.element('shop-page-count').textContent,'第 1 / 14 页');
  const seen=[...h.ids()];
  for(let page=2;page<=14;page++){
    h.click('shop-page-next');assert.equal(h.ids().length,24);seen.push(...h.ids());
    assert.equal(h.element('shop-page-count').textContent,`第 ${page} / 14 页`);
    assert.equal(h.element('shop-catalog').children.length,48);
  }
  assert.deepEqual(seen,catalog.map(item=>item.id));assert.equal(new Set(seen).size,336);
  assert.equal(h.element('shop-page-next').disabled,true);
  const writes=h.element('shop-catalog').writes;h.click('shop-page-next');assert.equal(h.element('shop-catalog').writes,writes);
  h.click('shop-page-prev');assert.equal(h.element('shop-page-count').textContent,'第 13 / 14 页');
  assert.equal(h.calls.requests.length,0);
});

test('market, region, category and camp or loadout shortcuts reset to their own first page',()=>{
  const h=harness(),catalog=products().map((item,index)=>({...item,owned:index<200,
    ...(index>=280?{coins:0,diamonds:4,currency:'diamonds'}:{})}));
  h.api.render(snapshot(catalog));h.click('shop-page-next');h.click('shop-page-next');
  h.click('filter-bar');assert.equal(h.element('shop-page-count').textContent,'第 1 / 4 页');assert.ok(h.ids().every(id=>id.startsWith('bar-')));
  h.click('shop-page-next');h.click('area-camp');assert.equal(h.element('shop-page-count').textContent,'第 1 / 4 页');assert.ok(h.ids().every(id=>id.startsWith('fire-')));
  h.click('shop-page-next');h.click('market-diamonds');assert.equal(h.element('shop-page-count').textContent,'第 1 / 1 页');assert.equal(h.element('shop-pagination').hidden,true);
  h.click('area-all');h.click('market-owned');h.click('shop-page-next');h.click('shop-page-next');
  h.api.browseCollection('bar');assert.equal(h.element('shop-page-count').textContent,'第 1 / 3 页');
  h.click('shop-page-next');h.api.browseCamp();assert.equal(h.element('shop-page-count').textContent,'第 1 / 4 页');
  h.click('shop-page-next');h.click('equipped-slots',{loadoutSlot:'fire'});assert.equal(h.element('shop-page-count').textContent,'第 1 / 3 页');
  assert.equal(h.calls.requests.length,0);
});

test('polling and off-page catalog updates retain current SVG nodes and focus, wallet changes retain the page',()=>{
  const h=harness(),catalog=products(),initial=snapshot(catalog);h.api.render(initial);h.click('shop-page-next');h.click('shop-page-next');
  const focused=h.control(catalog[50].id);focused.focus();const writes=h.element('shop-catalog').writes,draws=h.calls.drawings.length;
  for(let second=1;second<=5;second++)h.api.render({...initial,now:stamp(second)});
  const changed=catalog.map((item,index)=>index===300?{...item,description:'另一页商品同步了描述'}:item);
  h.api.render({...initial,now:stamp(6),catalog:changed});
  assert.equal(h.element('shop-catalog').writes,writes);assert.equal(h.calls.drawings.length,draws);assert.equal(h.document.activeElement,focused);
  h.api.render({...initial,now:stamp(7),wallet:{coins:2000,diamonds:100}});
  assert.equal(h.element('shop-page-count').textContent,'第 3 / 14 页');
  assert.equal(h.document.activeElement.dataset.item,catalog[50].id);assert.equal(h.document.activeElement.dataset.shopAction,'preview');
});

test('shrinking a market clamps to the last available page and an empty collection mounts no SVGs',()=>{
  const h=harness(),catalog=products();h.api.render(snapshot(catalog));for(let i=0;i<5;i++)h.click('shop-page-next');
  h.api.render(snapshot(catalog.slice(0,25),{now:stamp(1)}));
  assert.equal(h.element('shop-page-count').textContent,'第 2 / 2 页');assert.deepEqual(h.ids(),[catalog[24].id]);
  const drawings=h.calls.drawings.length;
  h.api.render(snapshot([],{now:stamp(2)}));assert.equal(h.element('shop-pagination').hidden,true);
  assert.equal(h.element('shop-page-count').textContent,'第 1 / 1 页');assert.deepEqual(h.ids(),[]);assert.equal(h.calls.drawings.length,drawings);
  assert.match(h.element('shop-catalog').innerHTML,/请换个分类/);
});

test('preview polling keeps the dialog focused and closing restores the new control on the same page',()=>{
  const h=harness(),catalog=products(),initial=snapshot(catalog);h.api.render(initial);h.click('shop-page-next');
  const id=catalog[25].id;h.control(id).focus();h.click('shop-catalog',{shopAction:'preview',item:id});
  const modalFocus=h.document.activeElement;assert.equal(modalFocus.id,'quest-action-cancel');
  h.api.render({...initial,now:stamp(1),wallet:{coins:9000,diamonds:100}});
  assert.equal(h.document.activeElement,modalFocus);assert.equal(h.element('shop-page-count').textContent,'第 2 / 14 页');
  h.element('quest-action-dialog').close();assert.equal(h.document.activeElement,h.control(id));
  assert.equal(h.calls.requests.length,0);
});

test('purchase and existing equip actions stay on the chosen page and never submit a hidden-page item',async()=>{
  const h=harness(),catalog=products(),initial=snapshot(catalog);h.api.render(initial);h.click('shop-page-next');
  const id=catalog[24].id;h.control(id,'buy').focus();h.click('shop-catalog',{shopAction:'buy',item:id});
  const [buy]=h.click('quest-action-confirm');assert.equal(h.calls.requests.length,1);
  assert.equal(h.calls.requests[0].path,'/api/shop/buy');assert.equal(h.calls.requests[0].body.itemId,id);
  const bought={...initial,now:stamp(1),wallet:{coins:9920,diamonds:200},receipt:{itemId:id,alreadyOwned:false},
    catalog:catalog.map(item=>item.id===id?{...item,owned:true}:item)};
  h.calls.requests[0].resolve(bought);await buy;
  assert.equal(h.element('shop-page-count').textContent,'第 2 / 14 页');assert.equal(h.element('quest-action-dialog').open,false);
  assert.equal(h.document.activeElement,h.control(id,'equip'));
  h.click('shop-catalog',{shopAction:'equip',item:id});assert.equal(h.calls.requests[1].path,'/api/shop/equip');
  const equipped={...bought,now:stamp(2),equipped:{...bought.equipped,bar:id},catalog:bought.catalog.map(item=>item.id===id?{...item,equipped:true}:item)};
  h.calls.requests[1].resolve(equipped);await flush();
  assert.equal(h.element('shop-page-count').textContent,'第 2 / 14 页');assert.equal(h.document.documentElement.dataset.bar,id);
  assert.equal(h.document.activeElement,h.control(id));assert.equal(h.calls.requests.length,2);
});

test('the shipped pagination controls reference the shop and pity copy follows authoritative limits',()=>{
  for(const id of ['shop-pagination','shop-page-prev','shop-page-count','shop-page-next'])assert.ok(html.includes(`id="${id}"`));
  assert.match(html,/id="shop-page-prev" aria-controls="shop-catalog"/);
  const h=harness();h.api.render(snapshot(products(),{lottery:{machines:[{id:'coin',pity:{limit:40}},{id:'diamond',pity:{limit:25}}]}}));
  h.click('market-limited');assert.match(h.element('shop-market-description').textContent,/金币机40抽、钻石机25抽保底/);
});
