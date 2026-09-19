import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {distance,bearing,offset,filterAreas,suitability,bySpecies,driftPlan,planTrip,candidates} from '../public/model.js';
import {ConditionsService,Repository} from '../public/services.js';
import {analyzeTerrain} from '../public/terrain.js';
const catalog=JSON.parse(await readFile(new URL('../public/data/areas.json',import.meta.url)));
const spots=catalog.spots;

test('catalog contains distinct marine points selected from sourced terrain evidence',()=>{
  assert.ok(spots.length>=30);assert.equal(new Set(spots.map(s=>s.id)).size,spots.length);
  assert.equal(new Set(spots.map(s=>s.coordinates.join(','))).size,spots.length);
  for(const s of spots){assert.ok(s.depth.min>=10&&s.depth.max>s.depth.min);assert.ok(s.depth.sourceId);assert.deepEqual(s.coordinates,[s.depth.lat,s.depth.lon]);assert.equal(s.verifiedCatch,false);assert.equal(s.bottom,'Ukjent');assert.equal(s.samples.length,4);}
  for(const s of spots){const a=analyzeTerrain(s.depth,s.analysis.ring);assert.equal(a.eligible,true);assert.equal(a.drop,s.analysis.drop);assert.equal(s.analysis.profile.length,5);assert.ok(s.analysis.ring.filter(Boolean).every(p=>Math.abs(distance(s.coordinates,[p.lat,p.lon])-300)<3));}
});
test('overlapping broad depth bands do not create fictional underwater cliffs',()=>{
 const center={min:100,max:150};
 assert.equal(analyzeTerrain(center,Array(8).fill({min:100,max:150})).eligible,false);
 assert.equal(analyzeTerrain(center,Array(8).fill({min:90,max:160})).drop,0);
 assert.equal(analyzeTerrain(center,[center,null,null,null,null,null,null,null]),null);
 const ring=[...Array(4).fill({min:20,max:30}),...Array(4).fill({min:100,max:150})];
 assert.equal(analyzeTerrain(center,ring).drop,70);
});
test('refined structures are source-anchored, separated and not the discovery grid',()=>{
 assert.equal(catalog.algorithm.name,'FISK Struktur 3');
 for(const s of spots){
  assert.ok(s.analysis.drop>=50);assert.equal(s.analysis.ring.filter(Boolean).length,8);
  const r=s.analysis.refinement;assert.ok(r.trace.length>=3);assert.ok(r.trace.some(p=>p.lat===s.coordinates[0]&&p.lon===s.coordinates[1]&&p.sourceId===s.depth.sourceId));
  assert.ok(!s.id.startsWith('terrain-'));assert.ok(s.analysis.profile.every(Boolean));
 }
 for(let i=0;i<spots.length;i++)for(let j=i+1;j<spots.length;j++)assert.ok(distance(spots[i].coordinates,spots[j].coordinates)>=1000);
});
test('geodesic distance, bearing and offset',()=>{
  assert.equal(distance([60,5],[60,5]),0);assert.ok(Math.abs(distance([0,0],[1,0])-111195)<2);
  assert.equal(bearing([60,5],[61,5]),0);assert.ok(Math.abs(distance([60,5],offset([60,5],1000,90))-1000)<3);
  assert.ok(Number.isFinite(distance([0,0],[0,180])));
});
test('unknown depth and unsupported species never produce fabricated scores',()=>{
  assert.equal(suitability({},bySpecies('lange')),null);assert.deepEqual(candidates({}),[]);
  assert.equal(filterAreas(spots,{species:'unknown'}).length,0);
  for(const s of spots)for(const c of candidates(s))assert.ok(Number.isFinite(c.score)&&c.score>=0&&c.score<=100);
});
test('species, depth, radius, query and saved filters all constrain results',()=>{
  const fish=filterAreas(spots,{species:'lyr',depth:'shallow'});assert.ok(fish.length>0);assert.ok(fish.every(s=>s.depth.min<100&&s.fish.id==='lyr'));
  assert.equal(filterAreas(spots,{savedOnly:true,saved:[]}).length,0);
  assert.deepEqual(filterAreas(spots,{savedOnly:true,saved:[spots[0].id]}).map(s=>s.id),[spots[0].id]);
  assert.equal(filterAreas(spots,{query:'nonexistent'}).length,0);
  assert.ok(filterAreas(spots,{radius:4}).every(s=>s.distance<=4000));
});
test('drift uses wind FROM and current TO, with target between start and end',()=>{
  const p=driftPlan([60,5],{wind:10,windFrom:0,current:0,minutes:10});
  assert.equal(p.heading,180);assert.equal(p.length,120);assert.ok(p.start[0]>60&&p.end[0]<60);
  const east=driftPlan([60,5],{current:1,currentTo:90,minutes:10});assert.equal(east.heading,90);assert.equal(east.length,600);
  assert.equal(driftPlan([60,5]).stationary,true);
});
test('trip includes fishing time, return leg and respects duration',()=>{
  const p=planTrip(filterAreas(spots),{hours:2,speed:12});assert.ok(p.stops.length>0&&p.stops.length<=3);assert.ok(p.minutes<=120);assert.ok(p.distance>0);assert.equal(new Set(p.stops.map(s=>s.id)).size,p.stops.length);
  assert.equal(planTrip(spots,{speed:0}).stops.length,0);
  assert.equal(planTrip(spots,{hours:.1}).stops.length,0);
});
test('missing and stale forecasts remain unknown',()=>{
  assert.equal(ConditionsService.at(null).wind,undefined);
  const weather={properties:{meta:{updated_at:new Date().toISOString()},timeseries:[{time:'2000-01-01T00:00:00Z',data:{instant:{details:{wind_speed:7}}}}]}};
  assert.equal(ConditionsService.at({weather}).wind,undefined);
  weather.properties.timeseries[0].time=new Date().toISOString();assert.equal(ConditionsService.at({weather}).wind,7);
});
test('local storage round-trip, corrupt input and quota failure',()=>{
  let value=null;globalThis.localStorage={getItem:()=>value,setItem:(_,v)=>{value=v;}};
  const db=Repository.load();db.saved.push('austevoll-1');assert.equal(Repository.save(db),true);assert.deepEqual(Repository.load().saved,db.saved);
  value='{broken';assert.deepEqual(Repository.load().saved,[]);
  value=JSON.stringify({version:1,preferences:{species:'lange'}});assert.equal(Repository.load().preferences.layers.depth,true);
  globalThis.localStorage.setItem=()=>{throw Error('Quota exceeded');};assert.equal(Repository.save(db),false);
});
