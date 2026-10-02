(function(root,factory){
  const collections=typeof module==='object'&&module.exports
    ?[require('./lottery-collection-art.js'),require('./lottery-collection-v3-coin.js'),require('./lottery-collection-v3-diamond.js'),require('./shop-collection-v3-player.js'),require('./shop-collection-v3-coin.js'),require('./shop-collection-v3-world.js')]
    :[root.FocusLotteryCollectionArt,root.FocusLotteryCoinV3,root.FocusLotteryDiamondV3,root.FocusShopCollectionV3Player,root.FocusShopCollectionV3Coin,root.FocusShopCollectionV3World];
  const api=factory(collections);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FocusShopCollectionRouter=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(collections){
  'use strict';
  const providers=new Map(),entries=[];
  for(const collection of collections.filter(Boolean))for(const entry of collection.entries){
    if(providers.has(entry.id))throw new Error('Duplicate collection item: '+entry.id);
    providers.set(entry.id,collection);entries.push(entry);
  }
  const has=(id,slot)=>typeof id==='string'&&providers.has(id)&&(!slot||providers.get(id).item(id)?.slot===slot);
  const item=id=>has(id)?providers.get(id).item(id):null;
  const api={entries:Object.freeze(entries),has,item};
  const empty={colors:[],palette:null,themePalette:null,barDesign:null};
  for(const name of ['colors','palette','themePalette','preview','premium','companion','relic','islandDecoration','avatar','travelerHat','barDesign','barFigure','barRibbon','themeBackdrop','themeScene','themeCityScene','effectScene','frame']){
    api[name]=(id,...args)=>{
      const collection=has(id)?providers.get(id):null;
      return typeof collection?.[name]==='function'?collection[name](id,...args):(Object.prototype.hasOwnProperty.call(empty,name)?empty[name]:'');
    };
  }
  return Object.freeze(api);
});
