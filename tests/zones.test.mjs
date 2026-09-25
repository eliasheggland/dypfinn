import test from 'node:test';
import assert from 'node:assert/strict';
import {fishingZone,zoneCopy} from '../public/zones.js';
import {distance} from '../public/model.js';

const base={coordinates:[60.1,5.1],analysis:{axis:45,drop:180}};

test('fishing zones use distinct terrain-shaped polygons rather than circular points',()=>{
  const zones=['Toppkant','Rennekant','Dybdeovergang','Dypkant'].map(kind=>fishingZone({...base,kind}));
  assert.deepEqual(zones.map(z=>z.points.length),[7,8,5,5]);
  assert.equal(new Set(zones.map(z=>JSON.stringify(z.points))).size,4);
  for(const zone of zones){
    assert.ok(zone.length>=150&&zone.length<=380);
    assert.ok(zone.width>=65&&zone.width<=150);
    assert.ok(zone.points.every(point=>distance(base.coordinates,point)>40));
  }
  assert.deepEqual(['Toppkant','Rennekant','Dybdeovergang','Dypkant'].map(zoneCopy),['skulderflate','renneflate','overgangsflate','kantflate']);
});
