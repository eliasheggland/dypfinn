import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root=resolve('public');
const html=await readFile(resolve(root,'index.html'),'utf8');
const required=['app.js','auth.js','firebase-config.js','model.js','rules.js','services.js','terrain.js','style.css','coastal.css','premium.css','favicon.svg','data/areas.json','vendor/leaflet.js','vendor/leaflet.css'];

for(const file of required)await access(resolve(root,file));

const localRefs=[...html.matchAll(/(?:href|src)="(\.\/[^"?#]+)(?:[?#][^"]*)?"/g)].map(match=>match[1].slice(2));
for(const file of localRefs)await access(resolve(root,file));

assert.ok(!html.match(/(?:href|src)="\/(?!\/)/),'Bruk relative filbaner slik at prosjektet virker under /repo-navn/ på GitHub Pages.');
assert.match(html,/<title>Dypfinn/);

const authSource=await readFile(resolve(root,'auth.js'),'utf8');
for(const feature of ['createUserWithEmailAndPassword','signInWithEmailAndPassword','sendEmailVerification','sendPasswordResetEmail','signOut']){
  assert.ok(authSource.includes(feature),`Autentiseringsfunksjon mangler: ${feature}`);
}
assert.ok(!authSource.includes('serviceAccount'),'Ingen Firebase-tjenernøkler skal ligge i en offentlig app.');

const catalog=JSON.parse(await readFile(resolve(root,'data/areas.json'),'utf8'));
assert.ok(Array.isArray(catalog.spots)&&catalog.spots.length>=30,'Fiskeområde-katalogen mangler eller er for liten.');

console.log(`Statisk kontroll bestått: ${required.length} kjernefiler, ${localRefs.length} HTML-referanser og ${catalog.spots.length} fiskeområder.`);
