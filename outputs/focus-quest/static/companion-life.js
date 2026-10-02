(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FocusCompanionLife=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Pure SVG composition: no timers, event listeners or state polling. The same
  // keyed scene mount retains the phase during routine server refreshes.
  const profiles=Object.freeze({
    bird:/owl|bird|phoenix|parrot|puffin|crane|penguin|sparrow|kingfisher/,
    swim:/whale|manta|fish|jelly|axolotl|seahorse|ray|serpent/,
    hop:/rabbit|frog|squirrel|mouse|hamster|ferret/,
    gentle:/capybara|turtle|sloth|hedgehog|snail|panda/,
  });
  function profile(id){for(const [name,pattern] of Object.entries(profiles))if(pattern.test(id))return name;return 'curious';}
  function markPart(markup,start,name){return markup.replace(new RegExp('(<path)( d="'+start+'[^>]*\/>)'),`$1 class="pet-life-${name}"$2`);}
  function articulate(id,markup){
    if(id==='companion-fox'){
      markup=markup.replace(/(<path d="M48 78[^>]+\/>)(<path d="M18 50[^>]+\/>)/,'<g class="pet-life-tail">$1$2</g>');
      markup=markup.replace(/(<path d="m30 34[^>]+\/>)(<path d="m34 27[^>]+\/>)/,'<g class="pet-life-ears">$1$2</g>');
    }
    if(id==='companion-owl')markup=markPart(markup,'M26 44','wings');
    if(id==='companion-whale')markup=markPart(markup,'M38 57','fin');
    if(id==='companion-dragon')markup=markPart(markup,'M63 65','tail');
    if(id==='companion-cat')markup=markPart(markup,'M29 72','tail');
    if(id==='companion-manta')markup=markPart(markup,'M50 35','wings');
    if(id==='companion-phoenix')markup=markPart(markup,'M40 48','wings');
    // Existing round pupils can blink without closing the surrounding eye/face.
    return markup.replace(/<circle\b[^>]*>/g,tag=>{
      const r=Number(tag.match(/\br="([\d.]+)"/)?.[1]);
      const y=Number(tag.match(/\bcy="([\d.]+)"/)?.[1]);
      if(r>=1.4&&r<=3.5&&y>=28&&y<=56&&!/\bclass=/.test(tag)&&/fill="#[3456][0-9a-f]{5}"/i.test(tag))return tag.replace('<circle','<circle class="pet-life-eye"');
      return tag;
    });
  }
  function wrap(id,markup,options={}){
    if(typeof id!=='string'||!/^companion-[a-z0-9]+$/.test(id)||id==='companion-default'||typeof markup!=='string'||!markup)return '';
    const behavior=profile(id),phase=-(Array.from(id).reduce((sum,c)=>sum+c.charCodeAt(0),0)%97)/10;
    const focus=options.interactive?' tabindex="0" role="img" aria-label="旅途伙伴，会回应你的靠近"':'';
    return `<g class="pet-life pet-life--${behavior}" data-companion-life="${id}" style="--pet-phase:${phase}s"${focus}><title>旅途伙伴 · 靠近，和它打个招呼</title><ellipse class="pet-life-hit" cx="50" cy="49" rx="42" ry="43" fill="transparent"/><g class="pet-life-motion"><g class="pet-life-response">${articulate(id,markup)}</g></g><g class="pet-life-hello" pointer-events="none"><path d="M73 16q-8-9-13-2-3 5 13 14 16-9 13-14-5-7-13 2Z" fill="#f3b7b3"/><path d="M15 24v-7m-6 8-5-4m92 14 5-5" fill="none" stroke="#ecd69f" stroke-width="2" stroke-linecap="round"/></g><ellipse class="pet-life-focus" cx="50" cy="87" rx="34" ry="7" fill="none" stroke="#bce0db" stroke-width="1.6"/></g>`;
  }
  return Object.freeze({wrap,profile});
});
