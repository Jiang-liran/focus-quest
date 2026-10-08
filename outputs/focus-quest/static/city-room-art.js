(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./city-residents.js'):root.FocusCityResidents,typeof module==='object'&&module.exports?require('./city-walkers.js'):root.FocusCityWalkers);if(typeof module==='object'&&module.exports)module.exports=api;else root.FocusCityRoomArt=api;})(globalThis,function(residents,walkers){
'use strict';
const rooms={
 library:{at:[446,576,.70],spots:[['desk','书桌 · 写便笺',[489,476,390,111],[675,566]],['shelf','书架 · 翻旧页',[120,151,248,296],[244,462]]]},
 tea:{at:[974,555,.70],spots:[['tea','茶席 · 沏一杯',[380,544,187,82],[474,643]],['tea-window','暖灯 · 换灯色',[750,401,60,151],[781,570]]]},
 atelier:{at:[966,577,.70],spots:[['wardrobe','衣架 · 试穿',[146,125,306,356],[299,497]],['outfits','工作台 · 收好搭配',[563,501,324,92],[727,600]]]},
 arcade:{at:[385,555,.70],spots:[['games','游戏角 · 玩一局',[154,365,185,87],[246,469]]]},
 station:{at:[565,586,.70],spots:[['plan','行囊台 · 留给明天',[137,421,179,153],[224,594]],['camp','站台 · 回到营地',[843,173,160,312],[925,512]]]},
 home:{at:[376,537,.74],spots:[['home-light','落地灯 · 调整暖光',[451,399,66,153],[483,570]]]},
 rooftop:{at:[822,622,.59],spots:[['sky','望远镜 · 看云隙',[430,339,170,310],[527,667]]]},
};
function hotspot(id,label,box,at,interactive){if(!interactive)return '';return `<g class="city-workstation" data-city-workstation="${id}" role="button" tabindex="0" aria-label="${label}"><title>${label}</title><rect class="city-workstation-hit" x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" rx="12" fill="transparent" pointer-events="all"/><rect class="city-workstation-outline" x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" rx="12" fill="none" stroke="#cfdfcf" stroke-width="2"/><g class="city-workstation-label" transform="translate(${at[0]} ${at[1]})"><rect x="-87" y="-14" width="174" height="28" rx="14" fill="#173344" fill-opacity=".9" stroke="#91b2b0" stroke-opacity=".5"/><circle cx="-71" r="3" fill="#dfcb99"/><text x="6" y="5" text-anchor="middle" fill="#dbe6dd" font-size="13">${label}</text></g></g>`;}
function interior(place,mode='rain',interactive=false){
 const key=place==='observatory'?mode==='home'?'home':mode==='panorama'?null:'rooftop':place,room=rooms[key];if(!room)return '';
 let props='';
 if(place==='arcade')props='<g><rect x="154" y="365" width="185" height="87" rx="9" fill="#465b6a" stroke="#92a9b1" stroke-width="3"/><rect x="166" y="377" width="161" height="63" rx="4" fill="#203a4b"/><path d="M184 388h24v20h-24Zm32 0h24v20h-24Zm32 0h24v20h-24Z" fill="#83a798"/><text x="246" y="430" text-anchor="middle" fill="#ccd8c8" font-size="13">扫雷与小游戏</text></g>';
 if(place==='station')props='<g><path d="M140 515h174v13H140Z" fill="#92a39d"/><path d="M153 528v46m148-46v46" stroke="#708b93" stroke-width="8"/><rect x="162" y="463" width="112" height="50" rx="7" fill="#8e8271" stroke="#c1b699" stroke-width="3"/><path d="M192 463v-14h40v14m-38 0v50m48-50v50" stroke="#cfba8f" stroke-width="4" fill="none"/><path d="m202 466 45-5 12 29-44 5Z" fill="#d8d4b6"/><path d="m216 474 26-3m-24 10 21-3" stroke="#8a9990" stroke-width="2"/></g>';
 const id=residents?.roomResident(place,mode),[x,y,scale]=room.at;
 return `<g class="city-room-inhabitants">${props}${id?`<g transform="translate(${x} ${y}) scale(${scale})">${residents.character(id,{interactive})}</g>`:''}${room.spots.map(s=>hotspot(...s,interactive)).join('')}</g>`;
}
function street(interactive=false){
 if(!residents||!walkers)return '';
 return [['west','yanqing',.30],['quay','qideng',.30],['bridge','wenzhou',.30],['bookwalk','yuhe',.30],['crossing','aji',.30],['east','wanqiao',.30],['stationwalk','nanzhi',.30],['riverwalk','shuoyun',.30]].map(([route,id,scale])=>{const at=walkers.routes[route].origin;return `<g class="city-walker"${interactive?` data-city-walker="${id}" data-city-route="${route}"`:''} style="transform:translate(${at[0]}px,${at[1]}px)"><g transform="scale(${scale})">${residents.character(id,{interactive,street:true})}</g></g>`;}).join('');
}
return {rooms,interior,street};
});
