const WMS='https://wms.geonorge.no/skwms1/wms.dybdedata2';
export const BathymetryService={
  async catalog(){const r=await fetch('./data/areas.json');if(!r.ok)throw Error('Områdene kunne ikke lastes.');return r.json();},
  async at([lat,lon]) {
    const p=new URLSearchParams({SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetFeatureInfo',LAYERS:'Dybdelag',QUERY_LAYERS:'Dybdelag',STYLES:'',SRS:'EPSG:4326',BBOX:[lon-.0002,lat-.0001,lon+.0002,lat+.0001].join(','),WIDTH:101,HEIGHT:101,X:50,Y:50,INFO_FORMAT:'text/plain',FEATURE_COUNT:1});
    const r=await fetch(`${WMS}?${p}`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Dybdeoppslaget svarte ikke.');const text=await r.text();
    const field=k=>text.match(new RegExp(`${k} = '([^']*)'`))?.[1];
    if(field('minimumsdybde')===undefined)return null;
    return {min:Number(field('minimumsdybde')),max:Number(field('maksimumsdybde')),sourceId:field('lokalid'),updated:field('oppdateringsdato'),extracted:field('datauttaksdato')};
  }
};
const cache=new Map();
export function parseTide(xml){
 const block=xml.match(/<data\b[^>]*type="prediction"[^>]*>([\s\S]*?)<\/data>/)?.[1];
 if(!block)return null;
 const rows=[...block.matchAll(/<waterlevel\b([^>]*)\/>/g)].map(m=>({time:m[1].match(/time="([^"]+)"/)?.[1],value:Number(m[1].match(/value="([^"]+)"/)?.[1])})).filter(p=>Number.isFinite(p.value)&&Number.isFinite(Date.parse(p.time)));
 return rows.length?{rows,station:xml.match(/<location\b[^>]*?\sname="([^"]+)"/)?.[1]||'Kartverkets tidevannssone'}:null;
}
export function tideAt(tide,time=Date.now()){
 const rows=tide?.rows||[],nearest=rows.reduce((best,p)=>!best||Math.abs(Date.parse(p.time)-time)<Math.abs(Date.parse(best.time)-time)?p:best,null);
 const future=rows.find(p=>Date.parse(p.time)>=time+20*60000),past=rows.findLast(p=>Date.parse(p.time)<=time-20*60000),extrema=[];
 for(let i=1;i<rows.length-1;i++){const p=rows[i],prev=rows[i-1].value,next=rows[i+1].value;if(Date.parse(p.time)<=time)continue;
  const kind=p.value>prev&&p.value>=next?'Flo':p.value<prev&&p.value<=next?'Fjære':null;
  if(kind&&(!extrema.length||Date.parse(p.time)-Date.parse(extrema.at(-1).time)>3600000))extrema.push({...p,kind});
 }
 return {level:nearest&&Math.abs(Date.parse(nearest.time)-time)<=10*60000?nearest.value:undefined,trend:past&&future?future.value>past.value+.5?'Stigende':future.value<past.value-.5?'Fallende':'Nær vending':undefined,events:extrema.slice(0,2),station:tide?.station};
}
// Interpolate speed/direction as vectors, including the 359° → 1° boundary.
export function forecastAt(data,time){
 const rows=data?.properties?.timeseries||[];
 const before=rows.findLast(x=>Date.parse(x.time)<=time),after=rows.find(x=>Date.parse(x.time)>=time);
 if(!before||!after||Date.parse(after.time)-Date.parse(before.time)>3*3600000)return rows.find(x=>Math.abs(Date.parse(x.time)-time)<=1800000);
 const a=before.data.instant.details,b=after.data.instant.details,t=(time-Date.parse(before.time))/Math.max(1,Date.parse(after.time)-Date.parse(before.time)),details={};
 for(const k of Object.keys(a))if(Number.isFinite(a[k])&&Number.isFinite(b[k]))details[k]=a[k]+(b[k]-a[k])*t;
 for(const k of ['sea_surface_wave_from_direction'])if(Number.isFinite(a[k])&&Number.isFinite(b[k]))details[k]=(a[k]+(((b[k]-a[k]+540)%360)-180)*t+360)%360;
 for(const [speed,dir] of [['wind_speed','wind_from_direction'],['sea_water_speed','sea_water_to_direction']]){
  if([a[speed],b[speed],a[dir],b[dir]].every(Number.isFinite)){
   const r=Math.PI/180,x=(1-t)*a[speed]*Math.sin(a[dir]*r)+t*b[speed]*Math.sin(b[dir]*r),y=(1-t)*a[speed]*Math.cos(a[dir]*r)+t*b[speed]*Math.cos(b[dir]*r);
   details[speed]=Math.hypot(x,y);details[dir]=(Math.atan2(x,y)/r+360)%360;
  }
 }
 return {...before,time:new Date(time).toISOString(),data:{...before.data,instant:{details}}};
}
export const ConditionsService={
  async load(coordinates,{force=false}={}){
    const key=coordinates.map(x=>x.toFixed(4)).join(',');const cached=cache.get(key);
    if(!force&&cached&&Date.now()-cached.fetched<5*60000)return cached;
    const args=new URLSearchParams({lat:coordinates[0].toFixed(4),lon:coordinates[1].toFixed(4)});
    const fetchModel=async(type,variant)=>{const r=await fetch(`https://api.met.no/weatherapi/${type}/2.0/${variant}?${args}`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Varsel utilgjengelig');return r.json();};
    const fetchTide=async()=>{const p=new URLSearchParams({tide_request:'locationdata',lat:coordinates[0].toFixed(4),lon:coordinates[1].toFixed(4),fromtime:new Date(Date.now()-3600000).toISOString().slice(0,16),totime:new Date(Date.now()+48*3600000).toISOString().slice(0,16),datatype:'pre',refcode:'cd',lang:'nb',interval:'10',dst:'0',tzone:'0'});const r=await fetch(`https://vannstand.kartverket.no/tideapi.php?${p}`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Tidevann utilgjengelig');return parseTide(await r.text());};
    const results=await Promise.allSettled([fetchModel('locationforecast','complete'),fetchModel('oceanforecast','complete'),fetchTide()]);
    const weather=results[0].status==='fulfilled'?results[0].value:null,ocean=results[1].status==='fulfilled'?results[1].value:null;
    const tide=results[2].status==='fulfilled'?results[2].value:null;
    const value={weather,ocean,tide,coordinates:[...coordinates],fetched:Date.now()};if(weather||ocean||tide)cache.set(key,value);return value;
  },
  at(bundle,hours=0){
    const time=Date.now()+hours*3600000;
    // Never present a stale/far-future sample as the selected hour.
    const entry=data=>forecastAt(data,time);
    const w=entry(bundle?.weather),o=entry(bundle?.ocean),wd=w?.data.instant.details,od=o?.data.instant.details;
    return {time:w?.time||o?.time,wind:wd?.wind_speed,gust:wd?.wind_speed_of_gust,windFrom:wd?.wind_from_direction,temp:wd?.air_temperature,pressure:wd?.air_pressure_at_sea_level,rain:w?.data.next_1_hours?.details?.precipitation_amount,
      waves:od?.sea_surface_wave_height,waveFrom:od?.sea_surface_wave_from_direction,current:od?.sea_water_speed,currentTo:od?.sea_water_to_direction,seaTemp:od?.sea_water_temperature,tide:tideAt(bundle?.tide,time),
      weatherUpdated:bundle?.weather?.properties.meta.updated_at,oceanUpdated:bundle?.ocean?.properties.meta.updated_at,weatherTime:w?.time,oceanTime:o?.time};
  }
};
export const defaultData={version:1,saved:[],custom:[],catches:[],trip:null,boat:{name:'Min båt',speed:12,waveLimit:1.5},preferences:{species:'all',layers:{depth:true,contours:true,areas:true}},viewport:null};
export const Repository={
  load(){try{
    const stored=JSON.parse(localStorage.getItem('fisk-v3')),base=structuredClone(defaultData);
    if(stored?.version!==1)return base;
    return {...base,...stored,saved:Array.isArray(stored.saved)?stored.saved:[],custom:Array.isArray(stored.custom)?stored.custom:[],catches:Array.isArray(stored.catches)?stored.catches:[],
      boat:{...base.boat,...stored.boat},preferences:{...base.preferences,...stored.preferences,layers:{...base.preferences.layers,...stored.preferences?.layers}}};
  }catch{return structuredClone(defaultData);}},
  save(data){try{localStorage.setItem('fisk-v3',JSON.stringify(data));return true;}catch{return false;}}
};
