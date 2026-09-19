import assert from 'node:assert/strict';
import {firebaseConfig} from '../public/firebase-config.js';

const origin=process.env.PAGES_ORIGIN||'https://eliasheggland.github.io';
const coordinates=[60.0800,5.0200];
const userAgent='Dypfinn-GitHub/1.0 API health check';
const results=[];

async function check(name,url,{format='json',cors=true,validate=()=>{}}={}){
  const started=Date.now();
  const response=await fetch(url,{headers:{Origin:origin,'User-Agent':userAgent},signal:AbortSignal.timeout(20000)});
  assert.ok(response.ok,`${name}: HTTP ${response.status}`);
  if(cors){
    const allow=response.headers.get('access-control-allow-origin');
    assert.ok(allow==='*'||allow===origin,`${name}: mangler CORS for ${origin} (fikk ${allow||'ingen header'})`);
  }
  const value=format==='json'?await response.json():format==='text'?await response.text():await response.arrayBuffer();
  await validate(value,response);
  results.push({name,status:response.status,ms:Date.now()-started,cors:cors?'ok':'ikke nødvendig'});
}

const args=new URLSearchParams({lat:coordinates[0].toFixed(4),lon:coordinates[1].toFixed(4)});
const now=Date.now();
const tideArgs=new URLSearchParams({
  tide_request:'locationdata',lat:coordinates[0].toFixed(4),lon:coordinates[1].toFixed(4),
  fromtime:new Date(now-3600000).toISOString().slice(0,16),
  totime:new Date(now+48*3600000).toISOString().slice(0,16),
  datatype:'pre',refcode:'cd',lang:'nb',interval:'10',dst:'0',tzone:'0'
});
const wmsArgs=new URLSearchParams({
  SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetFeatureInfo',LAYERS:'Dybdelag',QUERY_LAYERS:'Dybdelag',STYLES:'',
  SRS:'EPSG:4326',BBOX:'5.0198,60.0799,5.0202,60.0801',WIDTH:'101',HEIGHT:'101',X:'50',Y:'50',
  INFO_FORMAT:'text/plain',FEATURE_COUNT:'1'
});

await check('MET Locationforecast',`https://api.met.no/weatherapi/locationforecast/2.0/complete?${args}`,{
  validate:data=>assert.ok(data?.properties?.timeseries?.length,'værprognosen mangler tidsserie')
});
await check('MET Oceanforecast',`https://api.met.no/weatherapi/oceanforecast/2.0/complete?${args}`,{
  validate:data=>assert.ok(data?.properties?.timeseries?.length,'havprognosen mangler tidsserie')
});
await check('Kartverket tidevann',`https://vannstand.kartverket.no/tideapi.php?${tideArgs}`,{
  format:'text',validate:text=>assert.match(text,/<waterlevel\b/,'tidevannssvaret mangler vannstander')
});
await check('Kartverket dybdedata',`https://wms.geonorge.no/skwms1/wms.dybdedata2?${wmsArgs}`,{
  format:'text',validate:text=>assert.ok(text.includes('minimumsdybde')||text.includes('no features were found'),'dybdesvaret har ukjent format')
});
await check('Kartverket kartflis','https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/8/74/133.png',{
  format:'binary',cors:false,validate:(body,response)=>{
    assert.ok(body.byteLength>1000,'kartflisen er tom');
    assert.match(response.headers.get('content-type')||'',/^image\//,'kartflisen er ikke et bilde');
  }
});
await check('Firebase Authentication',`https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(firebaseConfig.apiKey)}`,{
  validate:data=>{
    assert.ok(data?.authorizedDomains?.includes(new URL(origin).hostname),`${origin} er ikke autorisert i Firebase`);
    assert.equal(firebaseConfig.projectId,'dypfinn','feil Firebase-prosjekt');
  }
});

console.table(results);
console.log(`Alle ${results.length} eksterne tjenester svarte riktig for GitHub Pages-origin ${origin}.`);
