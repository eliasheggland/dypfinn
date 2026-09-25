import {distance} from './model.js';

const REGIONS=['Austevoll vest','Austevoll sør','Austevoll nord','Austevoll indre'];
const TARGETS=[['Toppkant',12],['Rennekant',12],['Dypkant',25]];
const GENERIC_NAME=/^(Dypkant|Toppkant|Grunn)/;
const allowed=new Set(['lyr','makrell','sei','lange','brosme','torsk']);

function focusFor(spot){
  if(spot.depth.min>=180)return ['lange','brosme'];
  if(spot.kind==='Rennekant')return spot.depth.min>=100?['lange','brosme','sei']:['sei','torsk','makrell'];
  if(spot.kind==='Toppkant'&&spot.depth.max<=100)return ['lyr','torsk','sei','makrell'];
  if(spot.depth.max<=150)return ['torsk','sei','lyr','makrell'];
  return ['torsk','sei','lange','brosme'];
}

function usable(spot){
  return !GENERIC_NAME.test(spot.name)&&spot.depth?.sourceId&&spot.depth.min>=10&&
    spot.analysis?.drop>=50&&spot.analysis?.ring?.length===8&&spot.analysis?.profile?.length===5;
}

function rank(a,b){
  return b.analysis.drop-a.analysis.drop||b.analysis.quality-a.analysis.quality||
    a.depth.min-b.depth.min||a.id.localeCompare(b.id);
}

// Curate from the already sourced Kartverket candidates rather than creating a
// geometric grid. A new marker must be at least 800 m from any selected marker.
export function curateSpots(catalog){
  const used=[...catalog.spots],chosen=[];
  for(const [kind,target] of TARGETS){
    let count=0;
    for(let pass=0;count<target&&pass<5;pass++)for(const region of REGIONS){
      const options=catalog.legacySpots.filter(s=>usable(s)&&s.kind===kind&&s.region===region).sort(rank);
      const candidate=options.find(s=>!chosen.some(x=>x.id===s.id)&&!used.some(x=>distance(x.coordinates,s.coordinates)<800));
      if(!candidate)continue;
      chosen.push(candidate);used.push(candidate);count++;
      if(count===target)break;
    }
  }
  return [...catalog.spots,...chosen].map(spot=>({...spot,focus:focusFor(spot).filter(id=>allowed.has(id))}));
}
