import test from 'node:test';
import assert from 'node:assert/strict';
import {SPECIES,driftPlan,filterAreas} from '../public/model.js';
import {fishingRule} from '../public/rules.js';
import {forecastAt,ConditionsService,parseTide,tideAt} from '../public/services.js';
test('food fish and regional rules',()=>{
 assert.deepEqual(SPECIES.map(s=>s.id),['lyr','makrell','sei','lange','brosme','torsk']);
 assert.equal(fishingRule('makrell',60).cm,null);
 assert.equal(fishingRule('makrell',60).label,'Ingen minstemål');
 assert.equal(fishingRule('torsk',60).cm,40);
 assert.equal(filterAreas([{coordinates:[60,5],depth:{min:50,max:100}}],{species:'hestemakrell'}).length,0);
});
test('vector interpolation passes north rather than reversing direction',()=>{
 const timeseries=[359,1].map((deg,i)=>({time:new Date(i*3600000).toISOString(),data:{instant:{details:{wind_speed:10,wind_from_direction:deg}}}}));
 const d=forecastAt({properties:{timeseries}},1800000).data.instant.details;
 assert.ok(d.wind_from_direction<.001||d.wind_from_direction>359.999);assert.ok(d.wind_speed>9.99);
 assert.equal(d.sea_water_speed,undefined);
});
test('measured boat motion overrides modeled wind and current without double counting',()=>{
 const p=driftPlan([60,5],{measuredSpeed:1,measuredHeading:90,wind:20,current:2,minutes:10});
 assert.equal(p.heading,90);assert.equal(p.speed,.514444);assert.equal(p.length,.514444*600);
 assert.throws(()=>driftPlan([60,5],{wind:NaN}));
});
test('weather cache is position-specific and manual refresh fetches again',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({properties:{timeseries:[]}})}};
 try{await ConditionsService.load([60.1234,5.1234]);await ConditionsService.load([60.1234,5.1234]);assert.equal(calls,3);await ConditionsService.load([60.1234,5.1234],{force:true});assert.equal(calls,6);await ConditionsService.load([60.1235,5.1235]);assert.equal(calls,9);}finally{globalThis.fetch=original;}
});
test('tide parses prediction station, missing values and local trend honestly',()=>{
 const xml='<tide><location name="Sunnøya" obsname="Leirvik"/><data type="prediction"><waterlevel time="2026-09-18T00:00:00+00:00" value="100"/><waterlevel time="2026-09-18T00:20:00+00:00" value="110"/><waterlevel time="2026-09-18T00:40:00+00:00" value="120"/></data></tide>';
 const tide=parseTide(xml);assert.equal(tide.station,'Sunnøya');assert.equal(tideAt(tide,Date.parse('2026-09-18T00:20:00Z')).trend,'Stigende');assert.equal(tideAt(tide,0).level,undefined);assert.equal(parseTide('<error>No data</error>'),null);
});
