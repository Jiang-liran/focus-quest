const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const art=require('../static/progress-bars.js');
const ids=['bar-default','bar-mint','bar-aurora','bar-comet','bar-tide','bar-prism','bar-koi','bar-fox','bar-whale','bar-dragon'];
function dom(){
 const doc={nodeType:9,documentElement:{dataset:{bar:'bar-default'}},activeElement:null};
 class Element{
  constructor(tag='div',classes=[],dataset={}){this.tagName=tag.toUpperCase();this.classes=new Set(classes);this.dataset={...dataset};this.children=[];this.parentNode=null;this.ownerDocument=doc;this.attrs={};this._html='';this.writes=0;this.style={width:'',sets:0,setProperty(k,v){this[k]=v;this.sets++;}};this.classList={contains:n=>this.classes.has(n),add:n=>this.classes.add(n)};}
  set className(v){this.classes=new Set(String(v).split(/\s+/));}
  get className(){return [...this.classes].join(' ');}
  set innerHTML(v){this._html=String(v);this.writes++;}
  get innerHTML(){return this._html;}
  matches(selector){return selector.split(',').some(part=>{const cls=part.match(/^\.([\w-]+)/)?.[1];return this.classes.has(cls)&&(this.dataset.skinSlots||'').split(/\s+/).includes('bar');});}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  setAttribute(k,v){this.attrs[k]=String(v);}
  getAttribute(k){return this.attrs[k]??null;}
  appendChild(node){node.parentNode=this;this.children.push(node);return node;}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
 }
 const body=new Element('body');doc.createElement=tag=>new Element(tag);doc.querySelectorAll=selector=>body.querySelectorAll(selector);
 const bar=(kind='total-progress',width='52.5%',custom)=>{const el=new Element('div',[kind],{skinSlots:'bar',...(custom?{progressSkin:custom}:{})});el.setAttribute('role','progressbar');el.setAttribute('tabindex','0');el.setAttribute('aria-valuenow','52.5');el.setAttribute('aria-label','真实学习进度');const fill=new Element('i');fill.style.width=width;el.appendChild(fill);body.appendChild(el);return {el,fill};};
 return {doc,body,bar,Element};
}

test('decoration preserves the real fill, progress semantics, focus and existing descendants',()=>{
 const h=dom(),{el,fill}=h.bar();const original=new h.Element('b');fill.appendChild(original);h.doc.activeElement=el;const attributes={...el.attrs};
 assert.equal(art.decorate(el),1);assert.equal(el.children[0],fill);assert.equal(fill.style.width,'52.5%');assert.deepEqual(el.attrs,attributes);assert.equal(h.doc.activeElement,el);assert.equal(fill.children[0],original);assert.equal(fill.children.length,2);
 const layer=fill.children[1];assert.equal(layer.className,'pb-art');assert.equal(layer.getAttribute('aria-hidden'),'true');assert.match(layer.innerHTML,/pb-ribbon-svg/);assert.equal(el.style['--pb-progress'],'52.5');
});

test('repeated polls reuse a single decorative layer and never rewrite its SVG or the fill width',()=>{
 const h=dom(),{el,fill}=h.bar();h.doc.documentElement.dataset.bar='bar-prism';art.decorate(h.doc);const layer=fill.children[0],writes=layer.writes,sets=el.style.sets;
 for(let i=0;i<1000;i++)assert.equal(art.decorate(h.doc),0);
 assert.equal(fill.children.length,1);assert.equal(fill.children[0],layer);assert.equal(layer.writes,writes);assert.equal(el.style.sets,sets);assert.equal(fill.style.width,'52.5%');
 fill.style.width='68.75%';assert.equal(art.decorate(el),0);assert.equal(fill.children[0],layer);assert.equal(el.style['--pb-progress'],'68.75');assert.equal(layer.writes,writes);
});

test('zero and overflow progress are bounded through decoration metadata without inventing completed distance',()=>{
 const h=dom();for(const amount of ['0%','0.01%','1%','25%','50%','100%','133%','']){const {el,fill}=h.bar('total-progress',amount,'bar-fox');art.decorate(el);assert.equal(fill.style.width,amount);assert.equal(el.dataset.pbEmpty,String(!amount||Number.parseFloat(amount)===0));assert.equal(Number(el.style['--pb-progress']),Math.min(100,Number.parseFloat(amount)||0));}
});

test('skin changes and replaced fill nodes replace only owned decorations without accumulation',()=>{
 const h=dom(),{el,fill}=h.bar();art.decorate(el);const first=fill.children[0];h.doc.documentElement.dataset.bar='bar-whale';assert.equal(art.decorate(h.doc),1);assert.equal(fill.children.length,1);assert.equal(first.parentNode,null);assert.equal(el.dataset.pbSkin,'bar-whale');
 const replacement=new h.Element('i');replacement.style.width='33%';fill.remove();el.appendChild(replacement);assert.equal(art.decorate(el),1);assert.equal(replacement.children.length,1);assert.equal(replacement.style.width,'33%');assert.equal(art.decorate(el),0);
});

test('all supported progress locations are decorated while unrelated or nested fills remain intact',()=>{
 const h=dom();for(const kind of ['total-progress','subject-progress','weekly-progress','q-progress','q-first-round-progress'])h.bar(kind);
 const unrelated=h.bar('other-progress'),nested=h.bar();nested.fill.remove();const wrapper=new h.Element();wrapper.appendChild(nested.fill);nested.el.appendChild(wrapper);
 assert.equal(art.decorate(h.doc),5);assert.equal(unrelated.fill.children.length,0);assert.equal(nested.fill.children.length,0);
 const plain=h.bar();delete plain.el.dataset.skinSlots;assert.equal(art.decorate(plain.el),0);
});

test('explicit sample skins survive global equipment changes and invalid skins fall back safely',()=>{
 const h=dom(),sample=h.bar('q-progress','74%','bar-koi'),live=h.bar();h.doc.documentElement.dataset.bar='bar-comet';art.decorate(h.doc);assert.equal(sample.el.dataset.pbSkin,'bar-koi');assert.equal(live.el.dataset.pbSkin,'bar-comet');assert.equal(sample.el.dataset.pbCompact,'true');assert.equal(live.el.dataset.pbCompact,'false');
 h.doc.documentElement.dataset.bar='bar-prism';art.decorate(h.doc);assert.equal(sample.el.dataset.pbSkin,'bar-koi');assert.equal(live.el.dataset.pbSkin,'bar-prism');
 sample.el.dataset.progressSkin='"><script>alert(1)</script>';h.doc.documentElement.dataset.bar='unknown';art.decorate(h.doc);assert.equal(sample.el.dataset.pbSkin,'bar-default');assert.doesNotMatch(sample.fill.children[0].innerHTML,/<script>/);
});

test('ten shared thumbnails render real graphics with unique local-only references and existing shop metadata',()=>{
 let markup='';for(const id of ids){assert.equal(art.has(id),true);const svg=art.preview(id);assert.match(svg,/^<svg class="shop-art-svg progress-bar-thumbnail" viewBox="0 0 160 112"/);assert.match(svg,new RegExp(`data-art="${id}"`));assert.match(svg,/aria-hidden="true" focusable="false"/);assert.doesNotMatch(svg.replace('xmlns="http://www.w3.org/2000/svg"',''),/https?:|<image|<script|onload=|href=/);markup+=svg;}
 const definitions=[...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(definitions.length,new Set(definitions).size);for(const [,ref]of markup.matchAll(/url\(#([^)]+)\)/g))assert.ok(definitions.includes(ref),ref);
 assert.equal(art.has('bar-missing'),false);assert.equal(art.preview('bar-missing'),'');assert.equal(art.fullPreview('bar-missing'),'');
});

test('prism is a continuous RGB light strip without keycaps in real fill and previews',()=>{
 const h=dom(),{fill}=h.bar('total-progress','50%','bar-prism');art.decorate(h.doc);const actual=fill.children[0].innerHTML,thumb=art.preview('bar-prism');
 for(const svg of [actual,thumb]){for(const color of ['#ff2057','#ff961d','#f1ff22','#23f389','#19c9ff','#8242ff'])assert.ok(svg.includes(color));assert.match(svg,/pb-rgb-flow/);assert.doesNotMatch(svg,/stroke="#071529"|rx="3"|M50 9h20/);}
 assert.doesNotMatch(thumb,/pb-preview-leader/);
});

test('ordinary rails keep distinct silhouettes and leave koi, whales and dragons to limited collections',()=>{
 const expected={'bar-default':'M30 17v5','bar-mint':'M41 25Q18 29','bar-aurora':'pb-aurora-flow','bar-comet':'pb-comet-dust','bar-tide':'pb-water-flow','bar-koi':'data-motif="lotus-pond"','bar-fox':'#efad70','bar-whale':'data-motif="tidal-jellyfish"','bar-dragon':'data-motif="paper-swallow-kite"'};
 for(const [id,marker]of Object.entries(expected))assert.ok(art.preview(id).includes(marker),id);
 const h=dom();for(const id of ['bar-koi','bar-whale','bar-dragon']){const {fill}=h.bar('total-progress','75%',id);art.decorate(h.doc);assert.ok(fill.children[0].innerHTML.includes(expected[id]));}
 for(const [id,name,old] of [['bar-koi','荷塘涟漪','锦鲤清渠'],['bar-whale','潮间水母','星鲸漫游'],['bar-dragon','纸鸢长风','云龙巡天']]){assert.ok(art.fullPreview(id).includes(name));assert.ok(!art.fullPreview(id).includes(old));}
});

test('large previews show five real progress stages and retain original purchased item names',()=>{
 const names={'bar-default':'初旅刻度','bar-mint':'薄荷新芽','bar-aurora':'极光流转','bar-comet':'彗星轨迹','bar-tide':'潮汐回响','bar-prism':'棱镜虹光'};
 for(const id of ids){const html=art.fullPreview(id);assert.match(html,/class="progress-bar-full-preview"/);assert.deepEqual([...html.matchAll(/data-pb-sample="(\d+)"/g)].map(m=>Number(m[1])),[0,25,50,75,100]);if(names[id])assert.ok(html.includes(names[id]));const empty=html.split('data-pb-sample="0"')[1].split('</svg>')[0];assert.doesNotMatch(empty,/pb-preview-leader|linearGradient/);}
});

test('decorations are passive CSS motion, with hidden-scene and reduced-motion protections and uncropped purchase previews',()=>{
 const js=fs.readFileSync(require.resolve('../static/progress-bars.js'),'utf8'),css=fs.readFileSync(require.resolve('../static/progress-bars.css'),'utf8');
 assert.doesNotMatch(js,/requestAnimationFrame|setInterval|setTimeout|addEventListener|MutationObserver|ResizeObserver/);
 assert.match(css,/\.pb-art \*\{pointer-events:none!important\}/);assert.match(css,/max-width:100%/);assert.match(css,/data-pb-empty=true/);assert.match(css,/\.pb-rgb-flow\{animation:pb-rgb-travel 9s linear infinite\}/);assert.doesNotMatch(css,/filter:|will-change:/);
 for(const keyword of ['no-motion','prefers-reduced-motion','focus-runtime-hidden','has-citadel-view','has-campfire-room','dialog:not([open])'])assert.ok(css.includes(keyword),keyword);
 assert.match(css,/#quest-action-dialog\.progress-bar-item-dialog \.q-action-art\{height:auto;min-height:0;overflow:visible/);assert.match(css,/background:var\(--ui-surface/);assert.match(css,/color:var\(--ui-ink/);
});

test('the real visible homepage uses hidden attributes, so absence of an active class must never pause its bars',()=>{
 const html=fs.readFileSync(require.resolve('../static/index.html'),'utf8'),css=fs.readFileSync(require.resolve('../static/progress-bars.css'),'utf8');
 const today=html.match(/<div\b[^>]*id="view-today"[^>]*>/)?.[0],shop=html.match(/<div\b[^>]*id="view-shop"[^>]*>/)?.[0];
 assert.ok(today);assert.ok(shop);assert.match(today,/class="view"/);assert.doesNotMatch(today,/\shidden(?:[\s=>]|$)/);assert.match(shop,/\shidden[\s>]/);
 const pauseSelectors=[...css.matchAll(/([^{}]+)\{[^{}]*animation-play-state:\s*paused\s*!important[^{}]*\}/g)].map(match=>match[1]).join(',');
 assert.doesNotMatch(pauseSelectors,/\.view:not\(|\.view\[class|\.view(?![\w-])/);
 assert.match(pauseSelectors,/\[hidden\]\s+:is\(\.pb-art/);
 const rgbRule=css.match(/\.pb-rgb-flow\{([^}]+)\}/)?.[1];assert.ok(rgbRule);assert.match(rgbRule,/animation:pb-rgb-travel 9s linear infinite/);assert.doesNotMatch(rgbRule,/paused/);
});
