'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const art=require('../static/currency-art.js');
const css=fs.readFileSync(path.join(__dirname,'../static/currency-art.css'),'utf8');
test('currency aliases produce the same stable one-em icon and decorative accessible markup',()=>{
  for(const [short,long] of [['coin','coins'],['diamond','diamonds']]){assert.equal(art.icon(short),art.icon(long));assert.equal(art.symbol(short),art.symbol(long));assert.match(art.icon(long),new RegExp(`data-currency="${long}" aria-hidden="true"`));assert.match(art.svg(long),/viewBox="0 0 24 24" width="24" height="24"/);assert.match(art.svg(long),/aria-hidden="true" focusable="false"/);assert.doesNotMatch(art.icon(long),/\bid=|\burl\(|<title|aria-label=/);}
  assert.match(css,/width:1em;height:1em;min-width:1em;flex:0 0 1em/);assert.match(art.icon('coin',{size:'large'}),/currency-icon-large/);
});
test('coin minting and diamond facets have distinct structural geometry and complete native paint',()=>{
  const coin=art.svg('coin'),diamond=art.svg('diamond');
  assert.equal((coin.match(/transform="rotate\(/g)||[]).length,12);
  assert.ok((diamond.match(/<path/g)||[]).length>=9);
  assert.match(coin,/currency-edge[^>]*fill="#[a-fA-F0-9]{6}" stroke="#[a-fA-F0-9]{6}"/);assert.match(diamond,/currency-edge[^>]*fill="#[a-fA-F0-9]{6}" stroke="#[a-fA-F0-9]{6}"/);
  assert.notEqual(coin.replace(/#[a-fA-F0-9]{6}/g,'color'),diamond.replace(/#[a-fA-F0-9]{6}/g,'color'));
  assert.match(css,/data-interface-tone="light"/);assert.doesNotMatch(css,/filter:|animation:|transition:/);
  const result=spawnSync('/usr/bin/python3',['-c','import json,sys,xml.etree.ElementTree as ET\nfor source in json.load(sys.stdin): ET.fromstring(source)'],{input:JSON.stringify([coin,diamond]),encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
test('all static legacy markers use the exact shared SVG, preserve owned wrappers and the exchange emblem box',()=>{
  const urls=[...css.matchAll(/url\("data:image\/svg\+xml,([^\"]+)"\)/g)].map(match=>decodeURIComponent(match[1]));assert.equal(urls.length,2);assert.equal(urls[0],art.svg('coin'));assert.equal(urls[1],art.svg('diamond'));
  assert.match(css,/:not\(:has\(\.currency-icon\)\):not\(\.exchange-emblem\)/);
  assert.match(css,/\.coin-mark:has\(\.currency-icon\),\.diamond-mark:has\(\.currency-icon\)\{background-image:none/);
  const emblem=css.match(/\.exchange-emblem\.diamond-mark\{([^}]*)\}/)?.[1];assert.ok(emblem);assert.doesNotMatch(emblem,/\b(?:width|height|flex|font-size):/);
});
test('malformed currency kinds and class options cannot inject markup or executable SVG',()=>{
  for(const kind of [null,undefined,{},[],0,'__proto__','constructor','coin" onload="evil','coin<script>']){assert.equal(art.kind(kind),null);assert.equal(art.icon(kind),'');assert.equal(art.svg(kind),'');assert.equal(art.symbol(kind),'');}
  const safe=art.icon('diamond',{className:'price-icon "><script> ignored onclick="evil',size:'" onload="evil'});assert.match(safe,/ price-icon ignored"/);assert.doesNotMatch(safe,/<script|onclick=|onload=|currency-icon-large/);
  for(const options of [null,undefined,{className:{}},{className:['unsafe']},{className:'x '.repeat(1000)}])assert.doesNotMatch(art.icon('coin',options),/undefined|NaN|Infinity|href=/);
});
test('currency API can load as browser global without timers, listeners, storage or DOM scanning',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../static/currency-art.js'),'utf8'),context={};vm.runInNewContext(source,context);
  assert.equal(context.FocusCurrencyArt.icon('coin'),art.icon('coin'));
  assert.ok(Object.isFrozen(art));assert.doesNotMatch(source,/MutationObserver|ResizeObserver|setInterval|setTimeout|requestAnimationFrame|addEventListener|localStorage|document\./);
});
test('both rendered lottery cabinets share the currency symbols without changing their independent hit targets',()=>{
  const city=require('../static/rain-city-art.js'),svg=city.interior('arcade',{},{},{interactive:true});
  for(const kind of ['coins','diamonds'])assert.equal((svg.match(new RegExp(`data-currency-symbol="${kind}"`,'g'))||[]).length,1);
  assert.equal((svg.match(/data-lottery-machine=/g)||[]).length,2);assert.equal((svg.match(/class="rain-city-machine-hit"/g)||[]).length,2);assert.doesNotMatch(svg,/<span|currency-icon-large/);
});
