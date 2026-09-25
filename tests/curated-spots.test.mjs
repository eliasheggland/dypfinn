import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {curateSpots} from '../public/curated-spots.js';
import {distance} from '../public/model.js';

const catalog=JSON.parse(await readFile(new URL('../public/data/areas.json',import.meta.url)));

test('curated collection adds named, source-backed terrain structures without a grid',()=>{
  const spots=curateSpots(catalog),added=spots.slice(catalog.spots.length);
  assert.ok(spots.length>=90,'Katalogen skal ha mange spredte steder.');
  assert.ok(added.length>=35,'Kurateringen skal gi en tydelig utvidelse.');
  assert.ok(added.every(s=>!s.name.match(/^(Dypkant|Toppkant|Grunn)/)),'Alle nye steder må ha et faktisk stedsnavn.');
  assert.ok(added.every(s=>s.depth.sourceId&&s.analysis.ring.length===8&&s.analysis.profile.length===5));
  assert.ok(new Set(added.map(s=>s.region)).size===4,'Nye steder skal dekke hele Austevoll.');
  assert.ok(new Set(added.map(s=>s.kind)).size>=3,'Utvalget skal inneholde flere terrengtyper.');
  assert.ok(added.every(s=>s.focus.length&&s.focus.every(id=>['lyr','makrell','sei','lange','brosme','torsk'].includes(id))));
  for(let i=0;i<spots.length;i++)for(let j=i+1;j<spots.length;j++)assert.ok(distance(spots[i].coordinates,spots[j].coordinates)>=800,`Punkter ${spots[i].id} og ${spots[j].id} er for tett plassert.`);
});
