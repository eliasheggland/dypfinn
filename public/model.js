import {fishingRule} from './rules.js';
export const SPECIES = [
  {id:'lyr',name:'Lyr',depth:[10,150],best:[40,100],structures:['Toppkant','Dybdeovergang'],bait:'Shad eller sluk',rig:'Lett jigg',technique:'Fisk langs kanten og over mulig hardbunn. Tilpass synketiden til dybden.',pelagic:false},
  {id:'makrell',name:'Makrell',depth:[5,150],best:[15,70],structures:['Toppkant','Dybdeovergang','Rennekant'],bait:'Sluk, hekle eller små jigger',rig:'Hekle / lett sluk',technique:'Se etter byttefisk og aktivitet i de frie vannmassene. Kartdybden er bare et startpunkt; makrellen følger ikke bunnen.',pelagic:true},
  {id:'sei',name:'Sei',depth:[10,300],best:[30,150],structures:['Toppkant','Rennekant'],bait:'Pilk eller shad',rig:'Pilk',technique:'Finn stimer på ekkoloddet og fisk gjennom det aktuelle vannlaget. Bunndyp er ikke fiskedybde.',pelagic:true},
  {id:'lange',name:'Lange',depth:[100,500],best:[180,350],structures:['Dypkant','Rennekant'],bait:'Makrellstrimmel eller hel agnfisk',rig:'Bunnmeite med slep',technique:'Før agnet rolig langs den dype siden av kanten. Bekreft bunnkontakt med ekkolodd.',pelagic:false},
  {id:'brosme',name:'Brosme',depth:[100,500],best:[170,350],structures:['Dypkant','Toppkant'],bait:'Makrell eller sild',rig:'Bunnmeite',technique:'Fisk kontrollert nær bunnen. Bunntypen her er ukjent; let etter hardbunn på ekkoloddet.',pelagic:false},
  {id:'torsk',name:'Torsk',depth:[15,250],best:[40,150],structures:['Dybdeovergang','Toppkant'],bait:'Jigg eller agnfisk',rig:'Jigg / bunnmeite',technique:'Fisk over dybdeovergangen og søk etter byttefisk. Lokal bestand og sesong påvirker forekomsten.',pelagic:false}
];
// Historic catches remain readable, but these species are no longer suggested.
const legacySpecies=[{id:'hestemakrell',name:'Hestemakrell'}];
export const bySpecies = id => SPECIES.find(s=>s.id===id)||legacySpecies.find(s=>s.id===id);
export const clamp = (v,a,b)=>Math.min(b,Math.max(a,v));
export function distance(a,b) {
  const r=Math.PI/180, dl=(b[0]-a[0])*r, dn=(b[1]-a[1])*r;
  const h=Math.sin(dl/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dn/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(clamp(h,0,1)),Math.sqrt(1-clamp(h,0,1)));
}
export function bearing(a,b) {
  const r=Math.PI/180,p=a[0]*r,q=b[0]*r,l=(b[1]-a[1])*r;
  return (Math.atan2(Math.sin(l)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(l))/r+360)%360;
}
export function offset(point,meters,deg) {
  const d=deg*Math.PI/180;
  return [point[0]+Math.cos(d)*meters/111320,point[1]+Math.sin(d)*meters/(111320*Math.cos(point[0]*Math.PI/180))];
}
export function suitability(spot,species) {
  if (!spot.depth || !species?.depth || fishingRule(species.id,spot.coordinates?.[0]??60.08).blocked) return null;
  const lo=spot.depth.min,hi=spot.depth.max;
  if(hi<=species.depth[0] || lo>=species.depth[1])return null;
  const overlap=Math.max(0,Math.min(hi,species.best[1])-Math.max(lo,species.best[0]))/Math.max(1,hi-lo);
  const depth=Math.round(50+overlap*45);
  const structure=species.structures.includes(spot.kind)?88:58;
  const terrain=spot.analysis?.quality??Math.round(clamp(45+(spot.relief||0)*.18,45,90));
  const score=Math.round(depth*.5+structure*.3+terrain*.2);
  // Pelagic species cannot be ranked confidently without prey observations.
  return {score:species.pelagic?Math.min(72,score):species.substrate?Math.min(68,score):score,depth,structure,terrain};
}
export function candidates(spot) {
  return SPECIES.map(species=>({species,...suitability(spot,species)})).filter(x=>x.score!==undefined).sort((a,b)=>Number(Boolean(spot.focus?.includes(b.species.id)))-Number(Boolean(spot.focus?.includes(a.species.id)))||b.score-a.score).slice(0,3);
}
export function filterAreas(spots,{species='all',region='all',depth='all',kind='all',radius=0,center=[60.08,5.02],query='',savedOnly=false,saved=[],sort='recommended'}={}) {
  const q=query.trim().toLocaleLowerCase('nb');
return spots.map(spot=>{let choices=candidates(spot);const fish=species==='all'?choices[0]?.species:bySpecies(species);const fit=suitability(spot,fish);if(species!=='all'&&fit)choices=[{species:fish,...fit},...choices.filter(c=>c.species.id!==species)].slice(0,3);return {...spot,fish,fit,distance:distance(center,spot.coordinates),choices};})
    .filter(s=>s.fit && (species==='all'||!s.focus||s.focus.includes(species)) && (region==='all'||s.region===region) && (kind==='all'||s.kind===kind) &&
      (depth==='all'||(depth==='shallow'?s.depth.min<100:depth==='middle'?s.depth.max>100&&s.depth.min<200:s.depth.max>=200)) &&
      (!radius||s.distance<=Number(radius)*1000) && (!savedOnly||saved.includes(s.id)) &&
      (!q||`${s.name} ${s.region} ${s.kind} ${s.choices.map(c=>c.species.name).join(' ')} ${s.depth.min} ${s.depth.max}`.toLocaleLowerCase('nb').includes(q)))
    .sort((a,b)=>sort==='nearest'?a.distance-b.distance:sort==='depth'?a.depth.min-b.depth.min:b.fit.score-a.fit.score||a.distance-b.distance);
}
export function driftPlan(target,{wind=0,windFrom=0,current=0,currentTo=0,minutes=8,leeway=.02,measuredSpeed,measuredHeading}={}) {
  const windTo=(windFrom+180)%360,r=Math.PI/180;
  const measured=Number.isFinite(measuredSpeed)&&Number.isFinite(measuredHeading);
  if(![wind,windFrom,current,currentTo,minutes,leeway].every(Number.isFinite)||minutes<=0||wind<0||current<0||leeway<0||measuredSpeed<0)throw new Error('Ugyldige driftverdier');
  const east=measured?measuredSpeed*.514444*Math.sin(measuredHeading*r):wind*leeway*Math.sin(windTo*r)+current*Math.sin(currentTo*r);
  const north=measured?measuredSpeed*.514444*Math.cos(measuredHeading*r):wind*leeway*Math.cos(windTo*r)+current*Math.cos(currentTo*r);
  const speed=Math.hypot(east,north),heading=(Math.atan2(east,north)/r+360)%360;
  const length=speed*minutes*60;
  return {speed,heading,length,start:offset(target,length*.6,(heading+180)%360),end:offset(target,length*.4,heading),target,minutes,stationary:speed<.02};
}
export function planTrip(spots,{departure=[60.08,5.02],hours=3,speed=12,count=3}={}) {
  if(!Number.isFinite(speed)||speed<=0||!Number.isFinite(hours)||hours<=0)return {stops:[],distance:0,minutes:0,departure};
  const available=[...spots],stops=[];let previous=departure,elapsed=0,total=0;
  while(available.length&&stops.length<count){
    available.sort((a,b)=>(b.fit?.score||0)-distance(previous,b.coordinates)/400-((a.fit?.score||0)-distance(previous,a.coordinates)/400));
    const s=available.shift(),leg=distance(previous,s.coordinates),travel=leg/(speed*.514444)/60,home=distance(s.coordinates,departure)/(speed*.514444)/60;
    if(elapsed+travel+30+home>hours*60)continue;
    elapsed+=travel;stops.push({...s,arrival:Math.round(elapsed),fishing:30,leg});elapsed+=30;total+=leg;previous=s.coordinates;
  }
  const home=distance(previous,departure);return {stops,distance:total+home,minutes:Math.round(elapsed+home/(speed*.514444)/60),departure};
}
export const depthLabel = d => d ? `${d.min}–${d.max} m` : 'Ukjent dybde';
export const formatDistance = meters => meters<1000?`${Math.round(meters)} m`:`${(meters/1000).toFixed(1).replace('.',',')} km`;
export const compass = deg => ['N','NØ','Ø','SØ','S','SV','V','NV'][Math.round(deg/45)%8];
