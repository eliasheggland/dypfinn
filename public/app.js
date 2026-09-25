import {fishingRule} from './rules.js?v=6';
import {SPECIES,bySpecies,distance,bearing,offset,suitability,candidates,filterAreas,driftPlan,planTrip,depthLabel,formatDistance,compass} from './model.js?v=6';
import {BathymetryService,ConditionsService,Repository} from './services.js?v=6';
import {AuthService} from './auth.js?v=3';
import {curateSpots} from './curated-spots.js?v=1';
import {fishingZone,zoneCopy} from './zones.js?v=1';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
  map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z"/><path d="M9 3v16M15 5v16"/>',
  scan:'<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><circle cx="12" cy="12" r="4"/><path d="M12 8v8M8 12h8"/>',
  route:'<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 5h7a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h7"/>',
  fish:'<path d="M6 12c4-7 10-7 15 0-5 7-11 7-15 0ZM6 12 2 7v10l4-5Z"/><path d="m12 7 1-4 4 4M12 17l1 4 4-4"/><circle cx="17" cy="11" r=".6"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.1"/>',
  pin:'<path d="M19 9c0 6-7 12-7 12S5 15 5 9a7 7 0 1 1 14 0Z"/><circle cx="12" cy="9" r="2.5"/>',
  layers:'<path d="m12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  bookmark:'<path d="M6 3h12v18l-6-4-6 4Z"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  filter:'<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="9" cy="18" r="2" fill="currentColor"/>',
  expand:'<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/>',
  wind:'<path d="M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 16h5a3 3 0 1 1-3 3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',locate:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',waves:'<path d="M2 7q3-4 6 0t6 0 6 0M2 12q3-4 6 0t6 0 6 0M2 17q3-4 6 0t6 0 6 0"/>',boat:'<path d="M4 12h16l-3 7H7Zm4 0V7h8v5M12 3v4M3 22q3-3 6 0t6 0 6 0"/>',menu:'<path d="M4 7h16M4 12h16M4 17h16"/>'
};
const icon=(name)=>`<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">${paths[name]||paths.info}</svg>`;
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(e=>e.replaceWith(fragment(icon(e.dataset.icon))));}
function fragment(html){const t=document.createElement('template');t.innerHTML=html;return t.content;}
const num=(n,d=1)=>Number.isFinite(n)?n.toLocaleString('nb-NO',{maximumFractionDigits:d}):'–';
const hh=time=>time?new Date(time).toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'}):'–';
const date=time=>new Date(time).toLocaleDateString('nb-NO',{day:'numeric',month:'short',year:'numeric'});
const coords=p=>`${p[0].toFixed(4)}° N · ${p[1].toFixed(4)}° Ø`;
const tile=(label,value)=>`<div class="data-tile"><small>${label}</small><strong>${value}</strong></div>`;
const terrainName=kind=>({Toppkant:'Grunnskulder',Dypkant:'Dypvannskant',Dybdeovergang:'Dybdeskift',Rennekant:'Rennekant'}[kind]||kind||'Egen plass');
const empty=(title,copy,action='')=>`<div class="empty">${icon('map')}<h3>${title}</h3><p>${copy}</p>${action}</div>`;
let db=Repository.load(),map,catalog,allAreas=[],results=[],markers,structureLayer,selectionLayer,driftLayer,tripLayer,locationLayer,profileDot,depthLayer,contourLayer;
const state={page:'kart',species:SPECIES.some(s=>s.id===db.preferences.species)?db.preferences.species:'all',region:'all',depth:'all',kind:'all',radius:0,center:[60.08,5.02],query:'',savedOnly:false,selected:null,hours:0,bundle:null,weatherRequest:0,session:null,location:null,catchFilter:'all',dialogKind:null,analysis:0};
let toastTimer,sessionTimer,photoData=null,editingCatch=null,appStarted=false,gpsRequest=false;

function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,3300);}
function commit(change){const next=structuredClone(db);change(next);if(!Repository.save(next)){toast('Kunne ikke lagre. Eksporter data eller frigjør plass på enheten.');return false;}db=next;return true;}
function updateCounts(){const saved=$('#saved-count');if(saved)saved.textContent=db.saved.length;$('#saved-tab-count').textContent=db.saved.length;const n=db.trip?.stops?.length||0;$('#trip-count').hidden=!n;$('#trip-count').textContent=n;}
function notice(message){$('#map-notice').hidden=!message;$('#map-notice').textContent=message||'';}
function modal(title,body,footer='',kind='generic'){
  state.dialogKind=kind;$('#dialog-content').innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="icon-button" data-action="close-dialog" aria-label="Lukk">${icon('close')}</button></div><div class="dialog-body">${body}</div>${footer?`<div class="dialog-footer">${footer}</div>`:''}`;
  $('#dialog').setAttribute('aria-labelledby','dialog-title');if(!$('#dialog').open)$('#dialog').showModal();
}
function closeModal(){state.dialogKind=null;state.analysis++;$('#dialog').close();}
function speciesOptions(selected='all',all=true){return `${all?`<option value="all" ${selected==='all'?'selected':''}>Alle arter</option>`:''}${!all&&!SPECIES.some(s=>s.id===selected)&&bySpecies(selected)?`<option value="${esc(selected)}" selected>${esc(bySpecies(selected).name)} · tidligere fangst</option>`:''}${SPECIES.map(s=>`<option value="${s.id}" ${s.id===selected?'selected':''}>${s.name}</option>`).join('')}`;}
function areaById(id){return allAreas.find(x=>x.id===id)||db.custom.find(x=>x.id===id)||catalog?.legacySpots?.find(x=>x.id===id);}
function enriched(area){if(!area)return null;let choices=candidates(area);const fish=state.species==='all'?choices[0]?.species:bySpecies(state.species),fit=suitability(area,fish);if(state.species!=='all'&&fit)choices=[{species:fish,...fit},...choices.filter(c=>c.species.id!==state.species)].slice(0,3);return {...area,choices,fish,fit,distance:distance(state.center,area.coordinates)};}
function selectedArea(){return enriched(areaById(state.selected));}

function renderResults(){
  const legacy=state.savedOnly?(catalog?.legacySpots||[]).filter(a=>db.saved.includes(a.id)&&!allAreas.some(current=>current.id===a.id)):[];
  results=filterAreas([...allAreas,...db.custom,...legacy],{...state,saved:db.saved});
  if(state.savedOnly){for(const a of db.custom.filter(s=>!s.depth&&db.saved.includes(s.id)))results.push({...a,distance:distance(state.center,a.coordinates),choices:[]});}
  $('#area-count').textContent=allAreas.length;$('#species-label').textContent=bySpecies(state.species)?.name||'Alle arter';
  $('#result-label').textContent=`${results.length} ${state.savedOnly?'lagrede steder':'analyserte steder'} · ${state.savedOnly?'bare på denne enheten':'valgt fra sjøkartet'}`;
  $('#mobile-count').textContent=`Vis ${results.length} områder`;
  $$('.quick-species [data-species]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.species===state.species)));
  $('#area-list').innerHTML=results.length?results.map(areaCard).join(''):empty(state.savedOnly?'Ingen lagrede plasser':'Ingen områder passer',state.savedOnly?'Velg en markør og trykk Lagre.':'Prøv en annen art eller utvid søket.',`<button class="secondary" data-action="reset-filters">Vis alle områder</button>`);
  const active=[state.region!=='all',state.depth!=='all',state.kind!=='all',state.radius>0].filter(Boolean).length;
  $('#filter-count').hidden=!active;$('#filter-count').textContent=active;
  $$('[data-list]').forEach(b=>b.setAttribute('aria-selected',String((b.dataset.list==='saved')===state.savedOnly)));
  updateCounts();renderMarkers();
}
function areaCard(a){return `<button class="area-card ${state.selected===a.id?'selected':''}" data-spot="${a.id}" aria-label="${esc(a.name)}, ${depthLabel(a.depth)}, ${a.fish?.name||'art ukjent'}"><span class="area-number">${icon('fish')}</span><span><span class="area-name">${esc(a.name)}</span><span class="area-region">${esc(a.region)} · ${formatDistance(a.distance)}</span><span class="area-meta"><strong>${depthLabel(a.depth)}</strong><i class="divider"></i>${a.choices.slice(0,2).map(c=>c.species.name).join(' · ')||'Egen plass'}</span>${a.analysis?`<span class="terrain-evidence">Min. ${a.analysis.drop} m dybdeforskjell · ${a.analysis.sampleCount} prøver</span>`:''}</span><span class="area-chevron">${db.saved.includes(a.id)?icon('bookmark'):icon('chevron')}</span></button>`;}
function zoneStyle(area,{selected=false}={}){
  const color={Toppkant:'#167c78',Rennekant:'#176bce',Dybdeovergang:'#8a61ca',Dypkant:'#0f5a92'}[area.kind]||'#176bce';
  return {color,weight:selected?3:1.25,opacity:selected?1:.75,fillColor:color,fillOpacity:selected ? .24 : .11,className:`fishing-zone ${selected?'selected':''}`};
}
function addFishingZone(area,{selected=false}={}){
  const zone=fishingZone(area),layer=L.polygon(zone.points,zoneStyle(area,{selected})).addTo(selected?selectionLayer:structureLayer);
  layer.on('click',e=>{L.DomEvent.stopPropagation(e);selectSpot(area.id);});
  layer.bindTooltip(`${area.name} · ${zoneCopy(area.kind)} · ${depthLabel(area.depth)}`,{sticky:true,direction:'top',opacity:.9});
  return zone;
}
function renderMarkers(){
  if(!map)return;markers.clearLayers();structureLayer?.clearLayers();if(!db.preferences.layers.areas)return;
  const visible=results.filter(s=>map.getBounds().pad(.12).contains(s.coordinates));
  const ordered=[...visible].sort((a,b)=>(b.id===state.selected?1:0)-(a.id===state.selected?1:0));
  const labels=[],pins=[];
  ordered.forEach(a=>{
    const p=map.latLngToContainerPoint(a.coordinates);
    if(a.id!==state.selected&&(pins.length>=(map.getZoom()<12?20:40)||pins.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<60)))return;
    pins.push(p);
    const free=labels.every(q=>Math.abs(p.x-q.x)>160||Math.abs(p.y-q.y)>66);
    const mobile=innerWidth<701,size=map.getSize();
    const clearOfPanels=mobile?(p.x>20&&p.x<size.x-150&&p.y>220&&p.y<size.y-155):(p.x>370&&p.x<size.x-(state.selected?405:180)&&p.y>190&&p.y<size.y-130);
    const labelled=a.id===state.selected||(labels.length<(mobile?4:6)&&free&&clearOfPanels);
    if(labelled)labels.push(p);
    if(a.id!==state.selected)addFishingZone(a);
    if(!labelled)return;
    const html=`<div class="spot-label ${state.selected===a.id?'selected':''}"><span class="score">${icon('fish')}</span><span><span class="spot-fish">${terrainName(a.kind)}</span><span class="spot-depth">${depthLabel(a.depth)}</span></span></div>`;
    L.marker(a.coordinates,{icon:L.divIcon({className:'spot-icon',html,iconSize:labelled?[140,48]:[36,36],iconAnchor:labelled?[16,52]:[18,18]}),title:`${a.name} · ${depthLabel(a.depth)} · ${a.fish?.name||'Egen plass'}`,alt:a.name,zIndexOffset:a.id===state.selected?1000:labelled?100:0}).addTo(markers).on('click',()=>selectSpot(a.id));
  });
}
function fitResults(){if(!results.length||!map)return;const mobile=innerWidth<701;map.fitBounds(L.latLngBounds(results.map(s=>s.coordinates)),{paddingTopLeft:mobile?[35,185]:[390,60],paddingBottomRight:mobile?[40,145]:[130,120],maxZoom:13,animate:false});}
function closeDetail(){state.selected=null;$('#detail-panel').hidden=true;$('#detail-panel').classList.remove('expanded');$('#map-surface').classList.remove('detail-open');selectionLayer?.clearLayers();driftLayer?.clearLayers();profileDot?.remove();renderResults();loadConditions(state.center);}
function selectSpot(id,{pan=true}={}){
  const a=areaById(id);if(!a)return;state.selected=id;showPage('kart',false);$('#map-surface').classList.remove('list-open');$('#map-surface').classList.add('detail-open');renderDetail();renderResults();drawSelection(a);loadConditions(a.coordinates);
  if(pan){const z=Math.max(map.getZoom(),13),point=map.project(a.coordinates,z);const mobile=innerWidth<701;point.y+=mobile?map.getSize().y*.24:0;point.x+=mobile?0:innerWidth>1150?0:map.getSize().x*.15;map.setView(map.unproject(point,z),z,{animate:false});}
}
function drawSelection(a){
  selectionLayer.clearLayers();if(!a.depth)return;
  addFishingZone(a,{selected:true});
  for(const p of a.analysis?.ring||[])if(p&&map.getZoom()>=15)L.circleMarker([p.lat,p.lon],{radius:4,color:'#74d8b7',weight:1,fillOpacity:.85}).addTo(selectionLayer).bindTooltip(`${depthLabel(p)} · kartprøve`);
  if(a.analysis?.profile)L.polyline(a.analysis.profile.filter(Boolean).map(p=>[p.lat,p.lon]),{color:'#edc779',weight:2,dashArray:'6 5'}).addTo(selectionLayer);
  if(a.deep){L.polyline([a.coordinates,[a.deep.lat,a.deep.lon]],{color:'#9bb9c6',weight:1.5,dashArray:'4 6'}).addTo(selectionLayer);L.circleMarker([a.deep.lat,a.deep.lon],{radius:4,color:'#aacbd1',fillOpacity:.9}).addTo(selectionLayer).bindTooltip(`${depthLabel(a.deep)} · dypere vann`,{direction:'top'});}
}
function analyzedChart(a){
 const points=a.analysis.profile,max=Math.ceil(Math.max(...points.filter(Boolean).map(p=>p.max))/50)*50;
 const x=i=>38+i*65,y=n=>30+n/max*100;
 const bars=points.map((p,i)=>p?`<g><line x1="${x(i)}" y1="${y(p.min)}" x2="${x(i)}" y2="${y(p.max)}" stroke="${i===2?'#edc779':'#74d8b7'}" stroke-width="12" stroke-linecap="round"/><text x="${x(i)}" y="18" text-anchor="middle" class="chart-label">${p.min}–${p.max}</text><text x="${x(i)}" y="153" text-anchor="middle" class="chart-label">${(i-2)*150} m</text></g>`:`<text x="${x(i)}" y="80" class="chart-label">?</text>`).join('');
 return `<svg class="terrain-chart analyzed-chart" viewBox="0 0 336 168" role="img" aria-label="Fem kartprøver langs en 600 meter lang linje. Strekene viser dybdeintervall, ikke eksakt bunn."><path d="M30 30H315M30 80H315M30 130H315" stroke="#34515d" stroke-dasharray="3 4"/><text x="1" y="35" class="chart-label">0</text><text x="1" y="133" class="chart-label">${max}</text>${bars}</svg><p class="chart-caption">${compass(a.analysis.axis+180)} → ${compass(a.analysis.axis)} · Gult er markøren. Strekene viser kartets dybdeintervaller. Mellom prøvene er bunnformen ukjent.</p>`;
}
function terrainChart(a){
  if(a.analysis?.profile)return analyzedChart(a);
  if(!a.depth||!a.samples?.some(Boolean))return '<p class="hint">Det finnes ikke naboprøver for denne plassen.</p>';
  const axis=a.deep?.direction==='nord'||a.deep?.direction==='sør'?'NS':'WE';
  const points=axis==='NS'?[a.samples[0],{...a.depth,lat:a.coordinates[0],lon:a.coordinates[1]},a.samples[2]]:[a.samples[3],{...a.depth,lat:a.coordinates[0],lon:a.coordinates[1]},a.samples[1]];
  const valid=points.filter(Boolean),max=Math.ceil(Math.max(...valid.map(x=>x.max))/50)*50;
  const y=n=>25+n/max*85,x=i=>34+i*131;
  let band='',outline='';if(points.every(Boolean)){band=points.map((p,i)=>`${x(i)},${y(p.min)}`).join(' ')+' '+points.toReversed().map((p,i)=>`${x(2-i)},${y(p.max)}`).join(' ');outline=points.map((p,i)=>`${i?'L':'M'}${x(i)} ${y((p.min+p.max)/2)}`).join(' ');}
  return `<svg class="terrain-chart" id="terrain-chart" viewBox="0 0 330 146" role="img" aria-label="Dybdeintervaller på tre punkter, ca. 300 meter mellom prøvene"><path d="M34 25H302M34 67H302M34 110H302" stroke="#2a4553" stroke-dasharray="3 4"/><text x="5" y="28" class="chart-label">0 m</text><text x="4" y="115" class="chart-label">${max}</text>${band?`<polygon points="${band}" fill="#74d8b724"/><path d="${outline}" stroke="#74d8b7" fill="none" stroke-dasharray="4 4"/>`:''}${points.map((p,i)=>p?`<line x1="${x(i)}" y1="${y(p.min)}" x2="${x(i)}" y2="${y(p.max)}" stroke="${i===1?'#edc779':'#74d8b7'}" stroke-width="9" stroke-linecap="round"/><text x="${x(i)}" y="16" text-anchor="middle" class="chart-label">${p.min}–${p.max}</text><circle cx="${x(i)}" cy="${y((p.min+p.max)/2)}" r="4" fill="${i===1?'#edc779':'#c4e8db'}"/>`:'').join('')}<text x="34" y="133" class="chart-label">${axis==='NS'?'Nord':'Vest'} · −300 m</text><text x="164" y="133" text-anchor="middle" class="chart-label">Valgt punkt</text><text x="302" y="133" text-anchor="end" class="chart-label">+300 m · ${axis==='NS'?'Sør':'Øst'}</text></svg><p class="chart-caption" id="profile-readout">Kartintervaller, ikke ekkoloddprofil. Stiplet linje er en grov interpolasjon.</p>`;
}
function renderDetail(){
  const a=selectedArea();if(!a)return;const fish=a.fish,score=a.fit;
  const why=a.custom?'Egen kartplass. Kartverket oppgir dybdeintervallet nedenfor. Terrenget rundt er ikke analysert.':a.analysis?.summary||`${terrainName(a.kind)} med ${depthLabel(a.depth)} ved markøren. Grovt kartlagt område fra en tidligere analyse.`;
  $('#detail-panel').hidden=false;$('#detail-panel').innerHTML=`<button class="sheet-handle mobile-only" data-action="expand-detail" aria-label="Utvid eller minimer stedsdetaljer"><span></span></button><div class="detail-header"><div><p class="eyebrow">${a.custom?'DIN PLASS':'ANALYSERT FRA SJØKART'}</p><h2>${esc(a.name)}</h2><p class="detail-subtitle">${esc(a.region)} · ${formatDistance(a.distance)} fra kartets sentrum</p></div><button class="icon-button" data-action="close-detail" aria-label="Lukk stedsdetaljer">${icon('close')}</button></div>
  <div class="detail-scroll"><div class="detail-hero"><div class="depth-reading"><span>Kartdybde</span><strong>${depthLabel(a.depth)}</strong></div><div class="place-kind">${esc(terrainName(a.kind))}</div></div>
  <div class="weather-inline" id="spot-weather">${weatherInline()}</div><section class="place-section"><p class="section-kicker">PRIORITERT FOR</p><div class="fish-tags">${(a.focus||a.choices.map(c=>c.species.id)).map(id=>bySpecies(id)).filter(Boolean).map(f=>`<button class="fish-tag" data-guide="${f.id}">${f.name}</button>`).join('')||'<span class="muted">Ingen vurdering uten dybdedata</span>'}</div><p class="hint">Prioriteringen er beregnet fra kartdybde og bunnform. Sjekk ekkolodd og forhold på stedet før du fisker.</p></section>
  <section class="place-section"><p class="section-kicker">DERFOR ER DEN VALGT</p><p class="body-copy">${why}</p><div class="place-facts">${tile('Fiskeflate',zoneCopy(a.kind))}${tile('Dybdefall',a.analysis?'Minst '+a.analysis.drop+' m':'Ikke bekreftet')}${tile('Datagrunnlag',a.analysis?a.analysis.sampleCount+' kartprøver':'Begrenset')}</div><p class="hint">Flaten i kartet viser anbefalt kast- eller driftområde langs terrengformen. Den er ikke en bekreftet posisjon for fisk.</p></section>
  <button class="secondary grow drift-button" data-action="drift">${icon('route')}Planlegg drift</button>
  <details class="place-details"><summary>Se bunndata, regler og koordinater</summary><div class="detail-disclosure"><h3 class="section-title">Bunnprofil</h3>${terrainChart(a)}${spotEvidence(a)}${fish?`<h3 class="section-title">${fish.name} · regler og tips</h3>${ruleCard(fish.id,a.coordinates[0])}<p class="body-copy">${fish.technique}</p><div class="data-grid">${tile('Agn',fish.bait)}${tile('Metode',fish.rig)}</div>`:''}<h3 class="section-title">Koordinater</h3><p class="body-copy num">${coords(a.coordinates)}</p><div class="inline-actions"><button class="text-link" data-action="copy-coordinates">Kopier</button><button class="text-link" data-action="navigate">Retning og avstand</button><button class="text-link" data-action="share-spot">Del</button></div><p class="detail-note">Dybder er kartintervaller, ikke ekkoloddmåling. Fisk og bunntype må bekreftes på stedet. <button class="text-link" data-action="sources">Datakilder</button></p></div></details></div>
  <div class="detail-actions"><button class="secondary" data-action="save-spot">${icon(db.saved.includes(a.id)?'check':'bookmark')}${db.saved.includes(a.id)?'Lagret':'Lagre'}</button><button class="secondary" data-action="add-trip">${icon('plus')}Til tur</button><button class="primary" data-action="start-fishing">${icon('fish')}Start fiske</button></div>`;
  const chart=$('#terrain-chart');if(chart)chart.addEventListener('pointermove',e=>{
    const box=chart.getBoundingClientRect(),f=Math.max(0,Math.min(2,Math.round(((e.clientX-box.left)/box.width*330-34)/131)));
    const vertical=['nord','sør'].includes(a.deep?.direction),sample=f===1?{...a.depth,lat:a.coordinates[0],lon:a.coordinates[1]}:a.samples[vertical?(f===0?0:2):(f===0?3:1)];
    if(!sample)return;$('#profile-readout').textContent=`${f===1?'Valgt punkt':'Nabopunkt, ca. 300 m unna'}: ${depthLabel(sample)} · kartintervall`;
    profileDot?.remove();profileDot=L.circleMarker([sample.lat,sample.lon],{radius:7,color:'#edc779',weight:2,fillColor:'#fff0c7',fillOpacity:.8}).addTo(map);
  });
}

async function loadConditions(coordinates,force=false){
  const request=++state.weatherRequest;state.bundle=null;if($('#spot-weather'))$('#spot-weather').innerHTML='Henter forhold ved denne plassen…';const summary=$('#condition-summary');if(summary)summary.textContent='Henter varsel…';
  const bundle=await ConditionsService.load(coordinates,{force});if(request!==state.weatherRequest)return;state.bundle=bundle;renderConditionPill();if($('#spot-weather'))$('#spot-weather').innerHTML=weatherInline();if(state.dialogKind==='conditions')showConditions();
}
function weatherInline(){
  const place=selectedArea(),matches=!place||state.bundle?.coordinates&&distance(place.coordinates,state.bundle.coordinates)<10;
  if(!matches)return `<span class="weather-place">Forhold ved ${esc(place.name)}</span><span class="weather-reading">Henter oppdatert varsel…</span>`;
  const c=ConditionsService.at(state.bundle,state.hours),name=place?`Forhold ved ${esc(place.name)}`:'Forhold ved kartet';
  return `<span class="weather-place">${name}</span><span class="weather-reading">${num(c.wind)} m/s vind · ${num(c.waves)} m sjø</span><button data-action="conditions">Se detaljer</button>`;
}
function renderConditionPill(){const summary=$('#condition-summary');if(!summary)return;const c=ConditionsService.at(state.bundle,state.hours);summary.textContent=c.wind!==undefined?`${num(c.wind)} m/s ${compass(c.windFrom)} · ${c.waves!==undefined?num(c.waves)+' m sjø':'sjøvarsel mangler'}${state.hours?' · +'+state.hours+' t':''}`:'Værdata utilgjengelig';}
function showConditions(){
  const c=ConditionsService.at(state.bundle,state.hours),hourly=[0,3,6,9,12,15,18,21].map(h=>ConditionsService.at(state.bundle,h));
  const chart=hourly.map(x=>`<div class="hour-column"><span>${hh(x.time)}</span><i style="height:${Math.max(2,(x.wind||0)*5)}px"></i><strong>${num(x.wind)}</strong></div>`).join('');
  const oceanPoint=state.bundle?.ocean?.geometry?.coordinates;
  const modelDistance=oceanPoint&&state.bundle?distance(state.bundle.coordinates,[oceanPoint[1],oceanPoint[0]]):null;
  modal('Vær og sjø · '+(selectedArea()?.name||'søkesenter'),`<p class="hint" style="margin-top:0">MET Norge · prognose for ${c.time?date(c.time)+' kl. '+hh(c.time):'valgt tidspunkt'}<br>${coords(state.bundle?.coordinates||state.center)}</p>
  <div class="weather-source-status"><span class="${c.wind===undefined?'unavailable':''}">MET vær · ${c.wind===undefined?'mangler':'tilkoblet'}</span><span class="${c.waves===undefined?'unavailable':''}">MET hav · ${c.waves===undefined?'mangler':'tilkoblet'}</span><span class="${c.tide.level===undefined?'unavailable':''}">Kartverket tidevann · ${c.tide.level===undefined?'mangler':'tilkoblet'}</span></div><div class="weather-grid">${tile('Vind',num(c.wind)+' <small>m/s</small>')}${tile('Bølgehøyde',num(c.waves)+' <small>m</small>')}${tile('Sjøtemperatur',num(c.seaTemp)+' <small>°C</small>')}${tile('Strøm',num(c.current,2)+' <small>m/s</small>')}${tile('Lufttemperatur',num(c.temp)+' <small>°C</small>')}${tile('Trykk',num(c.pressure,0)+' <small>hPa</small>')}${tile('Vindkast',num(c.gust)+' <small>m/s</small>')}${tile('Nedbør neste time',num(c.rain)+' <small>mm</small>')}${tile('Bølger fra',c.waveFrom===undefined?'–':compass(c.waveFrom)+' · '+num(c.waveFrom,0)+'°')}</div>
  <h3 class="section-title">Flo og fjære <span>ASTRONOMISK TIDEVANN</span></h3><div class="data-grid">${tile('Beregnet nivå',num(c.tide.level,0)+' cm')}${tile('Utvikling',c.tide.trend||'Ukjent')}${c.tide.events.map(e=>tile(e.kind+' ca.',hh(e.time))).join('')}</div><p class="hint">${c.tide.station?'Tidevannssone: '+esc(c.tide.station)+'. ':''}Nivå over sjøkartnull. Tidene er omtrentlige (10-minutters prøver). Værets bidrag til vannstanden inngår ikke. Tidevannshøyde er ikke lokal strømfart.</p>
  ${c.waves>db.boat.waveLimit?`<div class="status-box caution">Varslet bølgehøyde overstiger din valgte grense på ${num(db.boat.waveLimit)} m.</div>`:''}
  <h3 class="section-title">Vind de neste 24 timene <span>m/s</span></h3><div class="hourly-chart">${chart}</div>
  <p class="hint">Vind fra ${c.windFrom===undefined?'ukjent retning':compass(c.windFrom)}. ${c.currentTo===undefined?'Detaljert strømdata er ikke tilgjengelig her.':`Modellert strøm mot ${compass(c.currentTo)}. Lokal strøm kan avvike.`} Bølger er signifikant bølgehøyde; enkeltbølger kan være høyere.</p>
  <p class="source-caption">Værmodell oppdatert: ${c.weatherUpdated?date(c.weatherUpdated)+' '+hh(c.weatherUpdated):'utilgjengelig'}.<br>Havmodell oppdatert: ${c.oceanUpdated?date(c.oceanUpdated)+' '+hh(c.oceanUpdated):'utilgjengelig'}.<br>${c.oceanTime?'Havvarsel gjelder '+hh(c.oceanTime)+'.':''} Hentet ${state.bundle?.fetched?hh(state.bundle.fetched):'–'}. Oppdateres hvert 5. minutt mens appen er synlig. Dette er prognoser, ikke lokale målinger. Havmodellen bruker nærmeste tilgjengelige sjøcelle${modelDistance!==null?' ('+formatDistance(modelDistance)+' fra valgt punkt)':''}; små sund og strøm ved bunnen kan avvike.</p>`, `<button class="secondary" data-action="refresh-weather">Oppdater</button><button class="primary" data-action="close-dialog">Til kartet</button>`,'conditions');
}

function ruleCard(id,lat){
 const r=fishingRule(id,lat);
 return `<div class="status-box ${r.blocked?'caution':''}"><strong>${r.blocked?'Målrettet fiske er stengt her · ':''}${r.label}</strong><p>${r.note||'Mål fisken fra snutespiss til enden av halefinnen. Sett levedyktig undermålsfisk skånsomt tilbake.'}</p><small>${r.scope} · kontrollert ${r.checked}. <a href="${r.source}" target="_blank" rel="noopener">Offisiell regel</a></small></div>`;
}
function showSpeciesGuide(id){
 const s=bySpecies(id);if(!s)return;
  modal(s.name+' · minstemål og fiske',ruleCard(id,selectedArea()?.coordinates[0]||state.center[0])+`<p class="body-copy">${s.technique}</p><div class="data-grid">${tile('Agn',s.bait)}${tile('Metode',s.rig)}</div><p class="hint">Dybder appen leter i: ${s.best.join('–')} m. Dette er en beregning, ikke et bevis på fisk ved punktet. ${s.substrate?'Arten foretrekker '+s.substrate+'. Bunntypen er ikke kartlagt her.':''} Sjekk alltid lokale fredninger.</p>`,`<button class="secondary" data-action="species">Alle arter</button>`);
}
function spotEvidence(a){
 const ring=a.analysis?.ring?.filter(Boolean);if(!ring?.length)return '';
 const shallow=ring.reduce((x,y)=>y.max<x.max?y:x),deep=ring.reduce((x,y)=>y.min>x.min?y:x);
 return `${a.analysis.refinement?`<p class="hint">Plasseringen er funnet med ${a.analysis.refinement.trace.length-2} ekstra oppslag langs dybdeovergangen. Markøren står på en oppslått grunn skulder, ikke på det opprinnelige søkenettet. Kartets intervaller begrenser presisjonen.</p>`:''}<ul class="body-copy"><li>Markøren: ${depthLabel(a.depth)} ved ${coords(a.coordinates)}.</li><li>Grunn naboprøve: ${depthLabel(shallow)}, ${compass(bearing(a.coordinates,[shallow.lat,shallow.lon]))} for markøren.</li><li>Dyp naboprøve: ${depthLabel(deep)}, ${compass(bearing(a.coordinates,[deep.lat,deep.lon]))} for markøren. Prøvene ligger 300 m unna.</li><li>Minst ${a.analysis.drop} m forskjell mellom de dokumenterte intervallene. ${ring.length} av 8 naboprøver har data.</li></ul><p class="hint">${a.fish?a.fish.name+' er foreslått fordi dybdeintervallet overlapper artens søkebånd og terrenget inngår i habitatmodellen. ':''}${a.fish?.substrate?'Denne arten foretrekker '+a.fish.substrate+'; bunntype er ukjent, så egnethet er begrenset til 68/100. ':''}Bekreft fisk og bunn med ekkolodd eller prøvedrift.</p>`;
}
function showSpecies(){
  modal('Hva vil du fiske etter?',`<input type="search" class="control" id="species-search" placeholder="Søk blant ${SPECIES.length} matfisk" aria-label="Søk fiskearter"><div class="species-grid"><button class="species-option ${state.species==='all'?'active':''}" data-species="all">${icon('fish')}<span>Alle arter<small>Vis alle søkeområder</small></span></button>${SPECIES.map(s=>`<button class="species-option ${s.id===state.species?'active':''}" data-species="${s.id}">${icon('fish')}<span>${s.name}<small>${fishingRule(s.id,state.center[0]).blocked?'Fredet her · se regler':fishingRule(s.id,state.center[0]).label}</small></span></button>`).join('')}</div><h3 class="section-title">Artsguide og minstemål</h3><div class="species-grid">${SPECIES.map(s=>`<button class="secondary" data-guide="${s.id}">${s.name} · regler</button>`).join('')}</div>`,'','species');
  $('#species-search').oninput=e=>$$('.species-option').forEach(b=>b.hidden=!b.textContent.toLowerCase().includes(e.target.value.toLowerCase()));
}
function chooseSpecies(id){if(id!=='all'&&fishingRule(id,state.center[0]).blocked){showSpeciesGuide(id);return;}state.species=id;commit(d=>d.preferences.species=id);closeModal();renderResults();if(state.selected){renderDetail();drawSelection(selectedArea());}toast(`${bySpecies(id)?.name||'Alle arter'} · ${results.length} aktuelle områder`);}
function showFilters(){
  const option=(value,label,current)=>`<option value="${value}" ${value===current?'selected':''}>${label}</option>`;
  modal('Avgrens søket',`<form id="filters-form" class="form-grid two">
  <label class="field">Område<select name="region">${option('all','Hele Austevoll',state.region)}${['Austevoll nord','Austevoll sør','Austevoll vest','Austevoll indre'].map(x=>option(x,x,state.region)).join('')}</select></label>
  <label class="field">Bunndybde<select name="depth">${[['all','Alle dybder'],['shallow','Grunnere enn 100 m'],['middle','100–200 m'],['deep','200 m og dypere']].map(([v,l])=>option(v,l,state.depth)).join('')}</select></label>
  <label class="field">Bunnform<select name="kind">${option('all','Alle bunnformer',state.kind)}${['Dypkant','Rennekant','Toppkant','Dybdeovergang'].map(v=>option(v,terrainName(v),state.kind)).join('')}</select></label>
  <label class="field">Radius fra kartets sentrum<select name="radius">${[['0','Hele samlingen'],['2','2 km'],['5','5 km'],['10','10 km'],['20','20 km']].map(([v,l])=>option(v,l,String(state.radius))).join('')}</select></label>
  <p class="hint full">Søket gjelder de ${allAreas.length} kartlagte områdene i Austevoll. Dybdeintervaller som overlapper filteret tas med.</p></form>`,`<button class="secondary" data-action="reset-filters">Nullstill</button><button class="primary" type="submit" form="filters-form">Vis områder</button>`,'filters');
}
function showLayers(){const l=db.preferences.layers;modal('Kartlag',[
  ['depth','Dybdesjattering','Dybdearealer fra Kartverket','layers'],['contours','Dybdekoter og tall','Vises mer detaljert når du zoomer inn','map'],['areas','Fiskeområder','Markører med kartdybde og artsvurdering','pin']
].map(([id,title,copy,ico])=>`<label class="toggle-row">${icon(ico)}<div>${title}<small>${copy}</small></div><input type="checkbox" data-layer="${id}" ${l[id]?'checked':''} aria-label="${title}"></label>`).join('')+`<p class="hint">Kartlaget er beregnet for oversikt og planlegging. <a href="https://www.kartverket.no/til-sjos" target="_blank" rel="noopener">Kartverkets sjøkartinformasjon</a></p>`,'','layers');}
function showMore(){
  const tripCount=db.trip?.stops.length||0;
  modal('Meny',`<p class="body-copy">Alt som ikke trengs mens du ser på kartet, samlet på ett sted.</p><div class="simple-menu-list"><button class="simple-menu-item" data-action="saved">${icon('bookmark')}<span><strong>Lagrede plasser</strong><small>${db.saved.length} lagret på denne enheten</small></span>${icon('chevron')}</button><button class="simple-menu-item" data-page="tur">${icon('route')}<span><strong>Planlegg tur</strong><small>${tripCount?tripCount+' stopp klare':'Legg steder til fra kartet'}</small></span>${icon('chevron')}</button><button class="simple-menu-item" data-page="fangster">${icon('fish')}<span><strong>Fangster</strong><small>${db.catches.length?'Se fangstloggen din':'Registrer fangster når du fisker'}</small></span>${icon('chevron')}</button><button class="simple-menu-item" data-page="profil">${icon('user')}<span><strong>Konto og innstillinger</strong><small>Båt, eksport og innlogging</small></span>${icon('chevron')}</button><button class="simple-menu-item" data-action="sources">${icon('info')}<span><strong>Datakilder</strong><small>Kart, vær og hvordan vurderingene virker</small></span>${icon('chevron')}</button></div>`,'<button class="secondary" data-action="share">Del Dypfinn</button><button class="primary" data-action="close-dialog">Til kartet</button>','menu');
}
function applyLayers(){const l=db.preferences.layers;for(const [key,layer] of [['depth',depthLayer],['contours',contourLayer]])if(l[key])layer.addTo(map);else layer.remove();$('.depth-key').hidden=!l.depth;renderMarkers();}
async function analyze(){
  showPage('kart',false);state.center=state.location||[map.getCenter().lat,map.getCenter().lng];renderResults();
  closeDetail();fitResults();$('#map-surface').classList.add('list-open');toast(results.length?`${results.length} områder fra bunnanalysen passer søket.`:'Ingen områder passer filteret. Utvid søket.');
}

function showDrift(){
 const a=selectedArea();if(!a)return;const c=ConditionsService.at(state.bundle,state.hours);
 const input=(name,label,value,min,max,step)=>`<label class="field">${label}<input name="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${Number.isFinite(value)?value:''}" placeholder="Mangler · fyll inn"></label>`;
 modal('Planlegg drift',`<p class="body-copy">Drift over ${esc(a.name)}.</p><p class="hint">Prognose for ${c.time?hh(c.time):'ukjent tidspunkt'}${state.hours?' · +'+state.hours+' timer':''}. Vind og overflatestrøm er modellert. Mål båtens faktiske drift med GPS, motor av, for et bedre lokalt estimat.</p>
 <form id="drift-form" class="form-grid two">
 <label class="field full">Beregn fra<select name="mode"><option value="forecast">Vind og strøm · prognose / egne verdier</option><option value="measured">Målt båtdrift · GPS-fart og kurs</option></select></label>
 <div class="full form-grid two" data-drift-mode="forecast">
 ${input('wind','Vind (m/s)',c.wind===undefined?undefined:Number(c.wind.toFixed(1)),0,40,.1)}
 ${input('windFrom','Vind FRA (grader)',c.windFrom===undefined?undefined:Math.round(c.windFrom)%360,0,359,1)}
 ${input('current','Strøm (m/s)',c.current===undefined?undefined:Number(c.current.toFixed(2)),0,5,.01)}
 ${input('currentTo','Strøm MOT (grader)',c.currentTo===undefined?undefined:Math.round(c.currentTo)%360,0,359,1)}
 ${input('leeway','Vindavdrift (%) · tilpass båten',2,0,5,.1)}
 </div>
 <div class="full form-grid two" data-drift-mode="measured" hidden>
 ${input('measuredSpeed','Målt fart over grunn (knop)',undefined,0,10,.01)}
 ${input('measuredHeading','Målt kurs over grunn (grader)',undefined,0,359,1)}
 </div>
 <label class="field full"><span class="range-readout">Lengde på drift <output id="drift-minutes">8 min</output></span><input name="minutes" type="range" min="2" max="20" value="8"></label></form>
 <div class="drift-result" id="drift-result"></div><p class="source-caption">Kort, rettlinjet fremskrivning med konstant fart. Vindfang, tidevann, dybdestrøm og bølger kan endre driften. Linjen kontrollerer ikke grunner eller hindringer. Ta en ny prøvedrift når forholdene endres.</p>`,`<button class="primary" data-action="show-drift">Vis start og drift i kartet</button>`,'drift');
 $('#drift-form').addEventListener('input',updateDriftPreview);$('#drift-form').addEventListener('change',updateDriftPreview);updateDriftPreview();
}
function currentDrift(){
 const form=$('#drift-form'),mode=form.elements.mode.value,data={minutes:Number(form.elements.minutes.value)};
 const keys=mode==='measured'?['measuredSpeed','measuredHeading']:['wind','windFrom','current','currentTo','leeway'];
 for(const k of keys){const e=form.elements[k];if(e.value===''||!e.validity.valid)return null;data[k]=Number(e.value);}
 if(mode==='forecast')data.leeway/=100;
 return driftPlan(selectedArea().coordinates,data);
}
function updateDriftPreview(){
 const form=$('#drift-form'),mode=form.elements.mode.value;
 $$('[data-drift-mode]').forEach(e=>{e.hidden=e.dataset.driftMode!==mode;e.querySelectorAll('input').forEach(i=>i.disabled=e.hidden);});
 const p=currentDrift();$('#drift-minutes').textContent=form.elements.minutes.value+' min';
 $('[data-action="show-drift"]').disabled=!p;
 $('#drift-result').innerHTML=p?tile('Start fra mål',formatDistance(p.length*.6))+tile('Driftretning',p.stationary?'Ingen':compass(p.heading)+' · '+num(p.heading,0)+'°')+tile('Estimert fart',num(p.speed/.514444,2)+' kn'):'<p class="hint">Fyll inn alle verdiene, eller velg målt båtdrift. Manglende strøm blir aldri tolket som null.</p>';
}
function drawDrift(){const p=currentDrift();if(!p)return;if(p.stationary){toast('Ingen beregnet drift med disse verdiene.');return;}closeModal();driftLayer.clearLayers();L.polyline([p.start,p.target,p.end],{color:'#edc779',weight:3,dashArray:'7 7'}).addTo(driftLayer);
  for(const [point,label] of [[p.start,'START'],[p.target,'MÅLOMRÅDE'],[p.end,'SLUTT']])L.marker(point,{icon:L.divIcon({className:'spot-icon',html:`<span class="map-chip">${label}</span>`,iconAnchor:[20,25]})}).addTo(driftLayer);
  map.fitBounds([p.start,p.end],{paddingTopLeft:innerWidth<701?[65,50]:[380,60],paddingBottomRight:innerWidth<701?[65,Math.round(map.getSize().y*.7)]:[420,100],maxZoom:16,animate:false});toast('Driftlinjen viser beregnet bevegelse gjennom målområdet.');
}

function saveSpot(){const a=selectedArea();if(!a)return;const saved=db.saved.includes(a.id);if(!commit(d=>d.saved=saved?d.saved.filter(x=>x!==a.id):[...d.saved,a.id]))return;renderResults();renderDetail();toast(saved?'Fjernet fra lagrede plasser':'Plassen er lagret privat på denne enheten.');}
async function inspectPoint(point){
  const key=crypto.randomUUID();state.pointRequest=key;
  modal('Punkt i kartet',`<p class="body-copy num">${coords(point)}</p><p class="hint">Henter dybdeintervall fra Kartverket…</p>`,'','point');
  try{
    const depth=await BathymetryService.at(point);if(state.pointRequest!==key||state.dialogKind!=='point')return;
    state.customPoint={id:'custom-'+crypto.randomUUID(),coordinates:point,depth,name:'Min fiskeplass',region:'Egen plass',kind:'Ikke analysert',custom:true,relief:0,samples:[],bottom:'Ukjent',confidence:'Begrenset'};
    modal('Punkt i kartet',`<p class="body-copy num">${coords(point)}</p><div class="data-grid">${tile('Kartdybde',depthLabel(depth))}${tile('Datakilde','Kartverket')}</div><p class="hint">${depth?'Dybdeintervallet gjelder dette kartpunktet. Terreng og arter er ikke analysert.':'Ingen sjødybde er tilgjengelig her. Punktet kan være på land eller utenfor datadekningen.'}</p><label class="field">Navn på plassen<input id="custom-name" maxlength="70" value="Min fiskeplass"></label>`,`<button class="primary" data-action="save-custom">${icon('bookmark')}Lagre privat plass</button>`,'point');
  }catch{if(state.dialogKind==='point')modal('Dybdeoppslag utilgjengelig','<p class="body-copy">Kunne ikke kontakte Kartverket. Prøv kartpunktet igjen når forbindelsen er tilbake.</p>',`<button class="secondary" data-action="close-dialog">Lukk</button>`);}
}
function saveCustom(){const a={...state.customPoint,name:$('#custom-name').value.trim()||'Min fiskeplass'};if(!commit(d=>{d.custom.push(a);d.saved.push(a.id);}))return;closeModal();state.savedOnly=true;renderResults();selectSpot(a.id);toast('Kartpunkt lagret privat.');}

function showPage(page,close=true){
  if(page==='finn')page='kart';
  if(!['kart','tur','fangster','profil'].includes(page))page='kart';
  if(location.hash!==`#${page}`)history.replaceState(null,'',`#${page}`);
  state.page=page;$$('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===page);if(b.dataset.page===page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  const isMap=page==='kart';$('#map-surface').hidden=!isMap;$('#page-surface').hidden=isMap;
  if(isMap){map?.invalidateSize();}
  else {if(page==='fangster')renderCatches();if(page==='tur')renderTrip();if(page==='profil')renderProfile();}
}
function addTrip(){const a=selectedArea();if(!a)return;if(db.trip?.stops.includes(a.id)){toast('Området ligger allerede i turen.');return;}
  if(!commit(d=>{d.trip??={stops:[],departure:state.location||state.center,hours:3,species:state.species,start:new Date().toISOString()};d.trip.stops.push(a.id);}))return;updateCounts();toast(`${a.name} lagt til i turen.`);
}
function renderTrip(){
  const trip=db.trip,stops=(trip?.stops||[]).map(areaById).filter(Boolean),departure=trip?.departure||state.location||state.center;
  let elapsed=0,total=0,previous=departure;
  const schedule=stops.map(s=>{const leg=distance(previous,s.coordinates);total+=leg;elapsed+=leg/(db.boat.speed*.514444)/60;const arrival=elapsed;elapsed+=30;previous=s.coordinates;return {...s,arrival};});
  total+=distance(previous,departure);const travelMinutes=total/(db.boat.speed*.514444)/60;
  $('#page-surface').innerHTML=`<div class="page-head"><div><p class="eyebrow">UT PÅ SJØEN</p><h1>Din neste fisketur</h1><p>Velg flere områder og samle dem i én tur.</p></div><button class="secondary" data-page="kart">${icon('map')}Velg i kartet</button></div>
  <div class="trip-layout"><div class="page-card"><h2>Planlegg tur</h2><form id="trip-form" class="form-grid"><label class="field">Art<select name="species">${speciesOptions(trip?.species||state.species)}</select></label><label class="field">Tilgjengelig tid<select name="hours">${[2,3,4,6,8].map(h=>`<option value="${h}" ${h===(trip?.hours||3)?'selected':''}>${h} timer</option>`).join('')}</select></label><label class="field">Marsjfart (knop)<input name="speed" type="number" min="2" max="50" value="${db.boat.speed}" required></label><label class="field">Avgang<input name="start" type="datetime-local" required value="${localDateTime(trip?.start||new Date().toISOString())}"></label><p class="hint">Start ved ${coords(departure)}. Bruk Min posisjon i kartet for å velge båtens posisjon.</p><button type="submit" class="primary">${icon('route')}Foreslå fiskestopp</button></form></div>
  <div><div class="stats-grid" style="grid-template-columns:repeat(3,1fr)"><div class="stat"><small>Fiskestopp</small><strong>${stops.length}</strong></div><div class="stat"><small>Rettlinjet avstand</small><strong>${num(total/1852)} nm</strong></div><div class="stat"><small>Min. reisetid</small><strong>${Math.round(travelMinutes)} min</strong></div></div>
  <div class="page-card"><h2>Rekkefølgen på turen</h2>${stops.length?`<div class="trip-stop">${icon('boat')}<div><h3>Startposisjon</h3><p>${coords(departure)}</p></div><span class="time">${hh(trip.start)}</span></div>${schedule.map((s,i)=>`<div class="trip-stop"><span class="area-number">${i+1}</span><button data-spot="${s.id}" style="text-align:left"><h3>${esc(s.name)}</h3><p>${depthLabel(s.depth)} · 30 min fiske</p></button><span class="time">${hh(new Date(trip.start).getTime()+s.arrival*60000)}</span><button data-remove-stop="${s.id}" aria-label="Fjern ${esc(s.name)} fra turen">${icon('close')}</button></div>`).join('')}<p class="hint">Avstander og tider følger rette forbindelser mellom stopp. Seilingsrute rundt land og grunner må planlegges i sjøkart.</p><div class="trip-actions"><button class="secondary" data-action="show-trip">${icon('map')}Vis stopp i kart</button><button class="primary" data-action="start-trip">${icon('boat')}Start tur</button></div>`:empty('Turen starter med et område','Legg til steder fra kartet, eller la Dypfinn foreslå tre stopp.')}</div></div></div>`;
}
function generateTrip(form){
  const f=Object.fromEntries(new FormData(form)),departure=state.location||db.trip?.departure||state.center;
  const pool=filterAreas(allAreas,{species:f.species,center:departure}),plan=planTrip(pool,{departure,hours:Number(f.hours),speed:Number(f.speed),count:3});
  if(!plan.stops.length){toast('Ingen stopp passer tidsrammen. Øk tiden eller flytt startpunktet.');return;}
  if(!commit(d=>{d.boat.speed=Number(f.speed);d.trip={stops:plan.stops.map(s=>s.id),departure,hours:Number(f.hours),species:f.species,start:new Date(f.start).toISOString()};}))return;renderTrip();updateCounts();toast(`${plan.stops.length} fiskestopp lagt til.`);
}
function showTrip(){if(!db.trip?.stops.length)return;showPage('kart',false);closeDetail();tripLayer.clearLayers();const points=[db.trip.departure,...db.trip.stops.map(areaById).filter(Boolean).map(s=>s.coordinates),db.trip.departure];L.polyline(points,{color:'#edc779',weight:2,dashArray:'3 9'}).addTo(tripLayer);points.slice(0,-1).forEach((p,i)=>L.marker(p,{icon:L.divIcon({className:'spot-icon',html:`<span class="map-chip">${i?'STOPP '+i:'START'}</span>`})}).addTo(tripLayer));map.fitBounds(points,{paddingTopLeft:innerWidth<701?[40,180]:[380,70],paddingBottomRight:[70,130],animate:false});toast('Stoppene vises med rette forbindelser, ikke seilingsrute.');}
function startFishing(){const a=selectedArea();if(!a)return;state.session={spotId:a.id,started:Date.now(),initialCatchCount:db.catches.length};$('#map-surface').classList.add('fishing-active');closeDetail();renderSession();clearInterval(sessionTimer);sessionTimer=setInterval(renderSession,30000);toast('Fiskemodus startet. Fangster knyttes til valgt område.');}
function renderSession(){const s=state.session;if(!s){$('#fishing-bar').hidden=true;return;}const a=areaById(s.spotId);$('#fishing-bar').hidden=false;$('#fishing-bar').innerHTML=`<div class="session-title"><p class="eyebrow">PÅ FISKETUR · ${Math.floor((Date.now()-s.started)/60000)} MIN</p><strong>${esc(a.name)}</strong><small>${depthLabel(a.depth)} · ${db.catches.filter(x=>new Date(x.time).getTime()>=s.started).length} fangster</small></div><button class="primary" data-action="new-catch">${icon('plus')}Fangst</button><button class="secondary" data-action="end-fishing">Avslutt</button>`;}
function endFishing(){const minutes=Math.max(1,Math.round((Date.now()-state.session.started)/60000));state.session=null;clearInterval(sessionTimer);$('#map-surface').classList.remove('fishing-active');renderSession();toast(`Fiske avsluttet etter ${minutes} min. Fangstene er lagret.`);}
const localDateTime=t=>{const d=new Date(t);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};

function catchForm(id=null){
  const existing=id?db.catches.find(c=>c.id===id):null;editingCatch=existing?.id||null;photoData=existing?.photo||null;
  const spot=areaById(existing?.spotId||state.session?.spotId||state.selected);const fish=existing?.species||(state.species==='all'?candidates(spot||{})[0]?.species.id:state.species)||'lange';
  modal(existing?'Rediger fangst':'Ny fangst',`<form id="catch-form" class="form-grid two"><label class="field full">Art<select name="species">${speciesOptions(fish,false)}</select></label><label class="field">Vekt (kg)<input name="weight" type="number" inputmode="decimal" step="0.01" min="0.01" max="1000" placeholder="Valgfritt" value="${existing?.weight??''}"></label><label class="field">Lengde (cm)<input name="length" type="number" inputmode="decimal" step="0.1" min="1" max="500" placeholder="Valgfritt" value="${existing?.length??''}"></label><label class="field full">Fiskeområde<select name="spotId"><option value="">Ingen posisjon valgt</option>${[...allAreas,...db.custom].map(a=>`<option value="${a.id}" ${a.id===spot?.id?'selected':''}>${esc(a.name)} · ${depthLabel(a.depth)}</option>`).join('')}</select></label><label class="field full">Bilde<input type="file" id="catch-photo" accept="image/*">${photoData?`<img class="photo-preview" id="photo-preview" src="${photoData}" alt="Fangstbilde">`:'<img class="photo-preview" id="photo-preview" alt="Valgt fangstbilde" hidden>'}</label><details class="field full"><summary>Flere detaljer</summary><div class="form-grid two"><label class="field full">Tidspunkt<input name="time" type="datetime-local" required value="${localDateTime(existing?.time||new Date().toISOString())}"></label><label class="field">Agn<input name="bait" maxlength="100" value="${esc(existing?.bait||'')}" placeholder="F.eks. makrell"></label><label class="field">Fiskedybde (m)<input name="depth" type="number" min="0" max="2000" value="${existing?.fishingDepth??''}" placeholder="Fra ekkolodd"></label><label class="field full">Notat<textarea name="notes" maxlength="1000">${esc(existing?.notes||'')}</textarea></label></div></details><p class="hint full">${spot?'Kartposisjon og kartdybde fylles fra området.':'Velg et område for å knytte fangsten til kartet.'} Lagres privat på denne enheten.</p></form>`,`<button class="primary grow" form="catch-form" type="submit">${icon('check')}Lagre fangst</button>`,'catch');
  $('#catch-photo').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(!file.type.startsWith('image/')){toast('Velg en bildefil.');return;}try{const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas'),scale=Math.min(1,900/Math.max(bitmap.width,bitmap.height));canvas.width=bitmap.width*scale;canvas.height=bitmap.height*scale;canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();photoData=canvas.toDataURL('image/jpeg',.75);$('#photo-preview').src=photoData;$('#photo-preview').hidden=false;}catch{toast('Bildet kunne ikke åpnes. Prøv JPEG eller PNG.');}};
}
function saveCatch(form){
  const f=Object.fromEntries(new FormData(form)),spot=areaById(f.spotId),existing=db.catches.find(c=>c.id===editingCatch);const weather=spot&&state.bundle&&distance(spot.coordinates,state.bundle.coordinates)<100?ConditionsService.at(state.bundle,0):null;
  const record={id:editingCatch||crypto.randomUUID(),species:f.species,weight:f.weight?Number(f.weight):null,length:f.length?Number(f.length):null,spotId:spot?.id||null,coordinates:spot?.coordinates||null,chartDepth:spot?.depth||null,fishingDepth:f.depth?Number(f.depth):null,time:new Date(f.time).toISOString(),bait:f.bait||'',notes:f.notes||'',photo:photoData,weather:existing?.weather||weather};
  if(!commit(d=>{const index=d.catches.findIndex(c=>c.id===record.id);if(index<0)d.catches.unshift(record);else d.catches[index]=record;}))return;closeModal();if(state.page==='fangster')renderCatches();renderSession();toast(`${bySpecies(record.species).name}${record.weight?' · '+num(record.weight)+' kg':''} lagret.`);
}
function renderCatches(){
  const catches=db.catches.filter(c=>state.catchFilter==='all'||c.species===state.catchFilter).sort((a,b)=>new Date(b.time)-new Date(a.time)),weights=db.catches.map(c=>c.weight).filter(x=>x!==null),total=weights.reduce((a,b)=>a+b,0);
  $('#page-surface').innerHTML=`<div class="page-head"><div><p class="eyebrow">DIN FANGSTLOGG</p><h1>Hver fisk har en historie.</h1><p>Fangster, steder og forhold. Bare dine.</p></div><button class="primary" data-action="new-catch">${icon('plus')}Registrer fangst</button></div><div class="stats-grid"><div class="stat"><small>Fangster</small><strong>${db.catches.length}</strong></div><div class="stat"><small>Arter</small><strong>${new Set(db.catches.map(c=>c.species)).size}</strong></div><div class="stat"><small>Største registrerte</small><strong>${weights.length?num(Math.max(...weights))+' kg':'–'}</strong></div><div class="stat"><small>Registrert totalvekt</small><strong>${weights.length?num(total)+' kg':'–'}</strong></div></div><label class="page-filter">Vis art<select class="control" id="catch-filter">${speciesOptions(state.catchFilter)}</select></label><div class="catch-list">${catches.length?catches.map(c=>`<button class="catch-card" data-catch="${c.id}">${c.photo?`<img src="${c.photo}" alt="${bySpecies(c.species)?.name}" loading="lazy">`:`<span class="catch-photo-empty">${icon('fish')}</span>`}<div><h3>${bySpecies(c.species)?.name||'Fangst'}</h3><p>${date(c.time)} · ${hh(c.time)}</p><p>${esc(areaById(c.spotId)?.name||'Uten sted')} ${c.fishingDepth?'· '+c.fishingDepth+' m':''}</p></div><span class="catch-weight">${c.weight?num(c.weight)+' kg':'–'}</span></button>`).join(''):empty('Ingen fangster ennå','Registrer din første fangst. Tid og valgt fiskeområde fylles ut for deg.')}</div><p class="hint">Statistikk bygger kun på dine registreringer. Mer detaljerte mønstre krever et større fangstgrunnlag.</p>`;
  $('#catch-filter').onchange=e=>{state.catchFilter=e.target.value;renderCatches();};
}
function showCatch(id){const c=db.catches.find(x=>x.id===id);if(!c)return;state.catchId=id;const spot=areaById(c.spotId);modal(bySpecies(c.species)?.name||'Fangst',`${c.photo?`<img class="catch-photo" src="${c.photo}" alt="Fangstbilde">`:''}<p class="hint">${date(c.time)} · ${hh(c.time)}</p><div class="data-grid">${tile('Vekt',c.weight?num(c.weight)+' kg':'Ikke registrert')}${tile('Lengde',c.length?num(c.length)+' cm':'Ikke registrert')}${tile('Fiskedybde',c.fishingDepth?c.fishingDepth+' m':'Ikke registrert')}${tile('Kartdybde',depthLabel(c.chartDepth))}</div><p class="body-copy">${esc(spot?.name||'Uten posisjon')}</p>${c.bait?`<p class="hint">Agn: ${esc(c.bait)}</p>`:''}${c.notes?`<p class="body-copy">${esc(c.notes)}</p>`:''}${c.weather?`<p class="hint">Tilknyttet prognose ved registrering: ${num(c.weather.wind)} m/s vind, ${num(c.weather.waves)} m sjø. Gjelder ${hh(c.weather.time)}.</p>`:'<p class="hint">Værforhold ble ikke registrert.</p>'}`,`<button class="icon-button" data-action="delete-catch" aria-label="Slett fangst">${icon('trash')}</button><button class="secondary" data-action="edit-catch">Rediger</button>${spot?`<button class="primary" data-action="catch-map">Vis i kart</button>`:''}`,'catch-detail');}
function deleteCatch(){const id=state.catchId;modal('Slette denne fangsten?','<p class="body-copy">Fangsten og bildet fjernes fra denne enheten. Dette kan ikke angres uten en eksportert sikkerhetskopi.</p>',`<button class="secondary" data-action="close-dialog">Avbryt</button><button class="danger" data-confirm-delete="${id}">Slett fangst</button>`);}

function renderProfile(){
  const user=AuthService.user;
  const account=!AuthService.configured?`<div class="account-state caution"><strong>Kontooppsett mangler</strong><p>Firebase må kobles til før publisering.</p></div>`:user?`<div class="account-state"><span class="account-avatar" aria-hidden="true">${esc(user.email?.[0]?.toUpperCase()||'D')}</span><div><strong>${esc(user.email)}</strong><p>${user.emailVerified?'E-post bekreftet':'Venter på e-postbekreftelse'}</p></div></div><div class="account-actions">${user.emailVerified?'':`<button class="secondary" data-action="verify-email">Send bekreftelse på nytt</button>`}<button class="secondary" data-action="sign-out">Logg ut</button></div>`:`<p class="body-copy">Lag en gratis konto med e-post, eller logg inn igjen.</p><div class="account-actions"><button class="primary" data-action="sign-up">Lag konto</button><button class="secondary" data-action="sign-in">Logg inn</button></div><button class="text-link" data-action="reset-password">Glemt passord?</button>`;
  $('#page-surface').innerHTML=`<div class="page-head"><div><p class="eyebrow">DIN PROFIL</p><h1>Klart for neste tur.</h1><p>Dine plasser og innstillinger, samlet på ett sted.</p></div></div><div class="profile-grid"><div><div class="page-card"><h2>Dypfinn-konto</h2>${account}<p class="hint">Passord håndteres sikkert av Firebase og lagres aldri i Dypfinn eller GitHub.</p></div><div class="page-card"><h2>Din båt</h2><form id="boat-form" class="form-grid"><label class="field">Båtnavn<input name="name" maxlength="60" value="${esc(db.boat.name)}" required></label><div class="form-grid two"><label class="field">Marsjfart (knop)<input type="number" name="speed" min="2" max="50" value="${db.boat.speed}" required></label><label class="field">Din bølgegrense (m)<input type="number" name="waveLimit" min="0.1" max="10" step="0.1" value="${db.boat.waveLimit}" required></label></div><p class="hint">En personlig grense, ikke en vurdering av hva som er forsvarlig for båten.</p><button class="primary" type="submit">Lagre båtprofil</button></form></div></div><div><div class="page-card"><h2>Dine fiskeplasser</h2><button class="profile-link" data-action="saved"><span>${db.saved.length} lagrede plasser</span>${icon('arrow')}</button><button class="profile-link" data-page="fangster"><span>${db.catches.length} registrerte fangster</span>${icon('arrow')}</button><button class="profile-link" data-action="species"><span>Foretrukket art: ${bySpecies(state.species)?.name||'Alle'}</span>${icon('chevron')}</button></div><div class="page-card"><h2>Privat på denne enheten</h2><p class="body-copy">Plasser, bilder og fangster lagres i denne nettleseren. De deles ikke med andre og synkroniseres ikke mellom enheter.</p><button class="profile-link" data-action="export"><span>Eksporter mine data</span>${icon('download')}</button><button class="profile-link" data-action="sources"><span>Datakilder og beregninger</span>${icon('info')}</button><p class="hint">Sletting av nettleserdata fjerner også lagringene. Eksporter jevnlig for å beholde en kopi.</p></div></div></div>`;
}

function authModal(mode){
  if(!AuthService.configured){toast('Kontooppsettet er ikke ferdig ennå.');return;}
  if(mode==='reset'){
    modal('Tilbakestill passord',`<form id="reset-form" class="form-grid"><label class="field">E-post<input name="email" type="email" autocomplete="email" inputmode="email" required></label><p class="hint">Hvis adressen finnes, sender vi en sikker lenke for nytt passord.</p></form>`,`<button class="primary grow" form="reset-form" type="submit">Send lenke</button>`,'auth');return;
  }
  const signup=mode==='signup';
  modal(signup?'Lag Dypfinn-konto':'Logg inn',`<form id="auth-form" class="form-grid" data-mode="${mode}"><label class="field">E-post<input name="email" type="email" autocomplete="email" inputmode="email" required></label><label class="field">Passord<input name="password" type="password" minlength="10" autocomplete="${signup?'new-password':'current-password'}" required></label>${signup?'<p class="hint">Minst 10 tegn. Du får en e-post for å bekrefte adressen.</p>':''}<p class="form-error" id="auth-error" role="alert" hidden></p></form>`,`<button class="secondary" data-action="${signup?'sign-in':'sign-up'}">${signup?'Har konto':'Ny bruker'}</button><button class="primary grow" form="auth-form" type="submit">${signup?'Lag konto':'Logg inn'}</button>`,'auth');
}
function setGateMode(mode){
  const signup=mode==='signup',form=$('#auth-gate #auth-form');
  form.dataset.mode=mode;
  $('#auth-title').textContent=signup?'Opprett Dypfinn-konto':'Logg inn i Dypfinn';
  $('#auth-lead').textContent=signup?'Kom i gang med bedre planlagte fisketurer.':'Dine fiskeplasser venter på deg.';
  $('.auth-card .auth-kicker').textContent=signup?'KOM I GANG GRATIS':'VELKOMMEN TILBAKE';
  form.querySelector('[name="password"]').autocomplete=signup?'new-password':'current-password';
  form.querySelector('.auth-submit').textContent=signup?'Lag gratis konto':'Logg inn';
  $('#auth-password-hint').hidden=!signup;
  $('#auth-switch-copy').textContent=signup?'Har du allerede konto?':'Ny i Dypfinn?';
  const toggle=$('#auth-switch-button');toggle.textContent=signup?'Logg inn':'Lag gratis konto';toggle.dataset.action=signup?'gate-signin':'gate-signup';
  $('#auth-error').hidden=true;
}
function showAuthState(user){
  const gate=$('#auth-gate'),app=$('#app');
  gate.hidden=Boolean(user);app.hidden=!user;document.body.classList.toggle('auth-locked',!user);
  if(user&&!appStarted)startApp().catch(err=>{console.error(err);notice('Appen kunne ikke lastes ferdig. Prøv å laste siden på nytt.');});
  if(!user&&$('#dialog').open)closeModal();
}
function showSources(){modal('Data du kan etterprøve',`<p class="body-copy">${allAreas.length} konkrete kartpunkter rundt Austevoll med dybdeintervaller fra Kartverket.</p><a class="source-link" href="https://wms.geonorge.no/skwms1/wms.dybdedata2?SERVICE=WMS&REQUEST=GetCapabilities" target="_blank" rel="noopener">Kartverket · Sjøkart – Dybdedata<small>Kart og dybdeintervaller. Hentet ${catalog?date(catalog.retrievedAt):'–'}. Kartet er ikke beregnet for navigasjon.</small></a><a class="source-link" href="https://api.met.no/weatherapi/locationforecast/2.0/documentation" target="_blank" rel="noopener">MET Norge · vær- og havprognoser<small>Vind, bølger, temperatur og modellert strøm når tilgjengelig. Tidsstempel vises i Forhold.</small></a><a class="source-link" href="https://vannstand.kartverket.no/tideapi_no.html" target="_blank" rel="noopener">Kartverket · tidevann<small>Posisjonstilpasset astronomisk tidevann. Ikke observert totalvannstand eller strøm.</small></a><a class="source-link" href="https://www.hi.no/en/hi/nettrapporter/rapport-fra-havforskningen-2021-41" target="_blank" rel="noopener">Havforskningsinstituttet · habitatbeskrivelser<small>Bakgrunn for generelle artsprofiler. Modellen er ikke validert av Havforskningsinstituttet.</small></a><p class="hint">${esc(catalog?.method||'Kartintervaller fra Kartverket.')} Analysen undersøkte ${catalog?.algorithm?.scanned||'–'} kandidatpunkter og valgte ${allAreas.length} områder. Dypfinn bruker intervallgrenser for å unngå at brede dybdebånd blir tolket som bratte kanter. Artsrangeringen vekter dybde 50 %, bunnform 30 % og terreng 20 %. Eksakt bunnform mellom prøvene, bunntype og fiskeforekomst er ukjent. Stedsnavn er referanser fra Kartverkets stedsnavnregister; markørene ligger ved angitt retning og avstand fra navnepunktet.</p><p class="hint">Egnethet er en relativ habitatmodell. Den lover ikke fangst og vurderer ikke sikkerheten på sjøen.</p>`,'','sources');}
async function shareApp(spot=false){const a=spot?selectedArea():null;const url=new URL(location.origin+location.pathname);if(a&&!a.custom)url.searchParams.set('spot',a.id);url.hash='kart';const title=a?'Dypfinn · '+a.name:'Dypfinn · fiskeområder i Austevoll';try{if(navigator.share)await navigator.share({title,url:url.href});else {await navigator.clipboard.writeText(url.href);toast('Delingslenken er kopiert.');}}catch(e){if(e.name!=='AbortError')modal('Del Dypfinn',`<p class="body-copy">Kopier lenken og send den til vennene dine.</p><input class="control" readonly aria-label="Delingslenke" value="${esc(url.href)}">`);}}
function exportData(){const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`dypfinn-private-data-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Eksporten inneholder dine private fiskeposisjoner.');}
function gpsUi(label,{active=false,loading=false}={}){$$('.gps-label').forEach(x=>x.textContent=label);$$('[data-action="locate"]').forEach(x=>{x.classList.toggle('active',active);x.classList.toggle('loading',loading);x.disabled=loading;x.setAttribute('aria-busy',String(loading));});}
function locate(){
  if(!window.isSecureContext||!navigator.geolocation){modal('GPS trenger sikker nettilgang','<p class="body-copy">Åpne den publiserte Dypfinn-siden over HTTPS for å bruke GPS. En lokal <code>file://</code>-fil kan ikke be telefonen om posisjonen din.</p>',`<a class="primary grow" href="https://eliasheggland.github.io/dypfinn/#kart">Åpne Dypfinn på nett</a>`);return;}
  gpsRequest=true;gpsUi('Finner deg…',{loading:true});toast('Ber om GPS-posisjonen din…');
  navigator.geolocation.getCurrentPosition(p=>{
    gpsRequest=false;const coordinates=[p.coords.latitude,p.coords.longitude],accuracy=Math.round(p.coords.accuracy);state.location=coordinates;state.center=coordinates;locationLayer.clearLayers();
    L.circle(coordinates,{radius:p.coords.accuracy,color:'#1675d1',weight:1.5,fillColor:'#4fa6eb',fillOpacity:.12,interactive:false}).addTo(locationLayer);
    L.circleMarker(coordinates,{radius:8,color:'#fff',weight:3,fillColor:'#1675d1',fillOpacity:1,className:'gps-marker',interactive:false}).addTo(locationLayer).bindTooltip(`Din posisjon · ca. ${accuracy} m nøyaktighet`,{direction:'top'});
    map.setView(coordinates,15,{animate:true});renderResults();loadConditions(coordinates);gpsUi('Posisjon funnet',{active:true});toast(`Posisjon funnet · nøyaktighet ca. ${accuracy} m`);
  },error=>{
    gpsRequest=false;gpsUi('Prøv GPS igjen');const denied=error.code===error.PERMISSION_DENIED,timeout=error.code===error.TIMEOUT;
    const message=denied?'Posisjonstilgang er avslått. Tillat posisjon for Dypfinn i nettleserinnstillingene og prøv igjen.':timeout?'Telefonen brukte for lang tid på å finne posisjonen. Gå nær et vindu eller utendørs og prøv igjen.':'GPS-posisjonen er ikke tilgjengelig akkurat nå. Kontroller at stedstjenester er slått på.';
    modal('Kunne ikke hente posisjonen',`<p class="body-copy">${message}</p><p class="hint">På iPhone: Innstillinger → Personvern og sikkerhet → Stedstjenester → nettleseren din. På Android: hold inne nettleserikonet → Appinformasjon → Tillatelser → Posisjon.</p>`,`<button class="secondary" data-action="close-dialog">Lukk</button><button class="primary" data-action="retry-locate">Prøv igjen</button>`);
  },{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
}
function navigateInfo(){const a=selectedArea();if(!a)return;const from=state.location||state.center,d=distance(from,a.coordinates);modal('Avstand og retning',`<p class="body-copy">${esc(a.name)}</p><div class="data-grid">${tile('Rettlinjet avstand',formatDistance(d))}${tile('Peiling',Math.round(bearing(from,a.coordinates))+'° '+compass(bearing(from,a.coordinates)))}</div><p class="hint">Fra ${state.location?'din posisjon':'søkesenteret'}. Dette er en rett forbindelseslinje; en seilbar rute rundt land og grunner er ikke beregnet.</p><p class="body-copy num">${coords(a.coordinates)}</p>`,`<button class="primary" data-action="copy-coordinates">Kopier koordinater</button>`);}
async function copyCoordinates(){const a=selectedArea();if(!a)return;try{await navigator.clipboard.writeText(`${a.coordinates[0].toFixed(5)}, ${a.coordinates[1].toFixed(5)}`);toast('Koordinatene er kopiert.');}catch{toast(coords(a.coordinates));}}

const actions={
  'expand-detail':()=>$('#detail-panel').classList.toggle('expanded'),
  'close-dialog':closeModal,'close-detail':closeDetail,'species':showSpecies,'filters':showFilters,'layers':showLayers,'fit':fitResults,'locate':locate,'retry-locate':()=>{closeModal();locate();},'sources':showSources,'more':showMore,'conditions':showConditions,'analyze':analyze,
  'zoom-in':()=>map.zoomIn(),'zoom-out':()=>map.zoomOut(),'show-list':()=>{$('#map-surface').classList.add('list-open');},'collapse-list':()=>$('#map-surface').classList.remove('list-open'),
  'saved':()=>{Object.assign(state,{savedOnly:true,query:'',species:'all',region:'all',depth:'all',kind:'all',radius:0});$('#search').value='';showPage('kart',false);closeDetail();$('#map-surface').classList.add('list-open');renderResults();},
  'save-spot':saveSpot,'save-custom':saveCustom,'drift':showDrift,'show-drift':drawDrift,'add-trip':addTrip,'show-trip':showTrip,
  'start-fishing':startFishing,'end-fishing':endFishing,'start-trip':()=>{const id=db.trip?.stops[0];if(id){selectSpot(id);startFishing();}},
  'new-catch':()=>catchForm(),'edit-catch':()=>catchForm(state.catchId),'delete-catch':deleteCatch,'catch-map':()=>{const c=db.catches.find(x=>x.id===state.catchId);closeModal();if(c?.spotId)selectSpot(c.spotId);},
  'share':()=>shareApp(),'share-spot':()=>shareApp(true),'export':exportData,'copy-coordinates':copyCoordinates,'navigate':navigateInfo,'refresh-weather':()=>loadConditions(selectedArea()?.coordinates||state.center,true),
  'sign-up':()=>authModal('signup'),'sign-in':()=>authModal('signin'),'reset-password':()=>authModal('reset'),
  'gate-signup':()=>setGateMode('signup'),'gate-signin':()=>setGateMode('signin'),
  'toggle-password':()=>{const input=$('#auth-gate input[name="password"]'),button=$('#auth-gate [data-action="toggle-password"]'),show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'Skjul':'Vis';button.setAttribute('aria-label',show?'Skjul passord':'Vis passord');},
  'sign-out':async()=>{await AuthService.signOut();toast('Du er logget ut.');if(state.page==='profil')renderProfile();},
  'verify-email':async()=>{await AuthService.resendVerification();toast('Ny bekreftelsesmail er sendt.');},
  'reset-filters':()=>{Object.assign(state,{region:'all',depth:'all',kind:'all',radius:0,query:'',species:'all',savedOnly:false});$('#search').value='';commit(d=>d.preferences.species='all');closeModal();renderResults();fitResults();},
  'reload':()=>location.reload()
};
function setForecastHour(button){
  const hours=Number(button?.dataset.hour);
  if(!Number.isFinite(hours))return;
  state.hours=hours;
  $$('[data-hour]').forEach(x=>x.classList.toggle('active',x===button));
  renderConditionPill();
  if($('#spot-weather'))$('#spot-weather').innerHTML=weatherInline();
}
// Keep the forecast selector responsive on mobile even when the map library
// consumes a synthetic click after a touch gesture.
$('#time-buttons')?.addEventListener('pointerup',e=>{
  if(e.pointerType!=='touch')return;
  const button=e.target.closest('[data-hour]');
  if(!button)return;
  e.preventDefault();
  setForecastHour(button);
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  try{
    if(b.dataset.action&&actions[b.dataset.action])await actions[b.dataset.action]();
    if(b.dataset.page){if($('#dialog').open)closeModal();showPage(b.dataset.page);}
    if(b.dataset.spot){closeModal();selectSpot(b.dataset.spot);}
    if(b.dataset.species)chooseSpecies(b.dataset.species);
    if(b.dataset.guide)showSpeciesGuide(b.dataset.guide);
    if(b.dataset.list){state.savedOnly=b.dataset.list==='saved';renderResults();}
    if(b.dataset.hour)setForecastHour(b);
    if(b.dataset.catch)showCatch(b.dataset.catch);
    if(b.dataset.removeStop){commit(d=>d.trip.stops=d.trip.stops.filter(x=>x!==b.dataset.removeStop));renderTrip();updateCounts();}
    if(b.dataset.confirmDelete){commit(d=>d.catches=d.catches.filter(c=>c.id!==b.dataset.confirmDelete));closeModal();renderCatches();}
  }catch(err){console.error(err);toast('Handlingen kunne ikke fullføres. Prøv igjen.');}
});
document.addEventListener('change',e=>{if(e.target.dataset.layer){const key=e.target.dataset.layer;if(commit(d=>d.preferences.layers[key]=e.target.checked))applyLayers();}});
document.addEventListener('submit',async e=>{
  e.preventDefault();const form=e.target;if(!form.reportValidity())return;
  try{
    if(form.id==='filters-form'){const f=Object.fromEntries(new FormData(form));Object.assign(state,f,{radius:Number(f.radius),center:[map.getCenter().lat,map.getCenter().lng]});closeModal();renderResults();fitResults();}
    if(form.id==='trip-form')generateTrip(form);
    if(form.id==='catch-form')saveCatch(form);
    if(form.id==='boat-form'){const f=Object.fromEntries(new FormData(form));if(commit(d=>d.boat={name:f.name.trim(),speed:Number(f.speed),waveLimit:Number(f.waveLimit)}))toast('Båtprofilen er lagret.');}
    if(form.id==='auth-form'){
      const inGate=Boolean(form.closest('#auth-gate')),submit=inGate?form.querySelector('[type="submit"]'):form.closest('.dialog')?.querySelector('[form="auth-form"]');if(submit)submit.disabled=true;
      const f=Object.fromEntries(new FormData(form));
      try{if(form.dataset.mode==='signup'){await AuthService.signUp(f.email,f.password);toast('Konto opprettet. Sjekk e-posten din.');}else{await AuthService.signIn(f.email,f.password);toast('Du er logget inn.');}if(!inGate){closeModal();showPage('profil',false);}}catch(error){const box=form.querySelector('#auth-error');box.textContent=error.message;box.hidden=false;}finally{if(submit)submit.disabled=false;}
    }
    if(form.id==='reset-form'){
      const f=Object.fromEntries(new FormData(form));await AuthService.sendReset(f.email);closeModal();toast('Hvis adressen finnes, er e-posten sendt.');
    }
  }catch(err){console.error(err);toast('Kunne ikke lagre. Kontroller feltene.');}
});
$('#search').addEventListener('input',e=>{state.query=e.target.value;renderResults();$('#map-surface').classList.add('list-open');});
$('#sort-order').addEventListener('change',e=>{state.sort=e.target.value;renderResults();});
// Only the handles capture gestures; map panning and content scrolling remain native.
let sheetGesture=null,suppressSheetClickUntil=0;
document.addEventListener('click',e=>{if(e.target.closest('.sheet-handle')&&Date.now()<suppressSheetClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('pointerdown',e=>{const handle=e.target.closest('.sheet-handle');if(!handle)return;sheetGesture={y:e.clientY,handle};handle.setPointerCapture(e.pointerId);});
document.addEventListener('pointerup',e=>{if(!sheetGesture)return;const {y,handle}=sheetGesture;sheetGesture=null;const delta=e.clientY-y;if(Math.abs(delta)<35)return;suppressSheetClickUntil=Date.now()+500;if(handle.closest('#detail-panel')){if(delta>90&& !$('#detail-panel').classList.contains('expanded'))closeDetail();else $('#detail-panel').classList.toggle('expanded',delta<0);}else $('#map-surface').classList.toggle('list-open',delta<0);});
document.addEventListener('pointercancel',()=>sheetGesture=null);
$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
$('#dialog').addEventListener('cancel',()=>{state.analysis++;state.dialogKind=null;});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();showPage('kart',false);$('#search').focus();}if(e.key==='Escape'&&!$('#dialog').open)closeDetail();});
window.addEventListener('offline',()=>notice('Du er frakoblet. Lagrede plasser er tilgjengelige; kart og prognoser kan mangle.'));
window.addEventListener('online',()=>{notice('');loadConditions(selectedArea()?.coordinates||state.center);});
setInterval(()=>{if(!document.hidden)loadConditions(selectedArea()?.coordinates||state.center);},5*60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadConditions(selectedArea()?.coordinates||state.center);});
window.addEventListener('hashchange',()=>showPage(location.hash.slice(1),false));

async function startApp(){
  if(appStarted)return;appStarted=true;
  if(!window.L){$('#map-loading').textContent='Kartet kunne ikke starte.';return;}
  map=L.map('map',{zoomControl:false,attributionControl:true,minZoom:5,maxZoom:18,zoomSnap:.25,preferCanvas:true,dragging:true,touchZoom:true,scrollWheelZoom:true,doubleClickZoom:true,boxZoom:true,keyboard:true}).setView(db.viewport?.center||[60.065,5.06],db.viewport?.zoom||11);
  map.createPane('base').style.zIndex=200;map.createPane('bathymetry').style.zIndex=220;map.createPane('contours').style.zIndex=230;
  const base=L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',{pane:'base',maxZoom:18,attribution:'Kart og dybder © <a href="https://www.kartverket.no/">Kartverket</a>'}).addTo(map);
  const wms='https://wms.geonorge.no/skwms1/wms.dybdedata2';
  depthLayer=L.tileLayer.wms(wms,{layers:'Dybdelag',format:'image/png',transparent:true,version:'1.1.1',pane:'bathymetry',attribution:'Dybder © Kartverket',tileSize:512});
  contourLayer=L.tileLayer.wms(wms,{layers:'Dybdekontur,Dybdepunkt,Kystkontur',format:'image/png',transparent:true,version:'1.1.1',pane:'contours',tileSize:512});
  structureLayer=L.layerGroup().addTo(map);markers=L.layerGroup().addTo(map);selectionLayer=L.layerGroup().addTo(map);driftLayer=L.layerGroup().addTo(map);tripLayer=L.layerGroup().addTo(map);locationLayer=L.layerGroup().addTo(map);
  L.control.scale({imperial:false,maxWidth:85}).addTo(map);applyLayers();
  let loaded=0;base.on('tileload',()=>{loaded++;$('#map-loading').hidden=true;});base.on('tileerror',()=>{if(!loaded){$('#map-loading').textContent='Bakgrunnskartet svarer ikke. Prøv å laste siden på nytt.';}});
  let tileFailure=false;depthLayer.on('tileerror',()=>{if(!tileFailure){tileFailure=true;notice('Dybdekartet kunne ikke lastes. Lagrede dybdeintervaller vises fortsatt.');}});
  map.on('moveend',()=>{renderMarkers();$('#map-coordinate').textContent=coords([map.getCenter().lat,map.getCenter().lng]);db.viewport={center:[map.getCenter().lat,map.getCenter().lng],zoom:map.getZoom()};Repository.save(db);});
  map.on('contextmenu',e=>inspectPoint([e.latlng.lat,e.latlng.lng]));
  map.on('click',e=>inspectPoint([e.latlng.lat,e.latlng.lng]));
  const mapElement=$('#map');
  for(const eventName of ['gesturestart','gesturechange','gestureend'])mapElement.addEventListener(eventName,e=>e.preventDefault(),{passive:false});
  mapElement.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault();},{passive:false,capture:true});
  let pressTimer,touchStart;mapElement.addEventListener('touchstart',e=>{if(e.touches.length!==1){clearTimeout(pressTimer);touchStart=null;return;}touchStart=[e.touches[0].clientX,e.touches[0].clientY];const r=mapElement.getBoundingClientRect();pressTimer=setTimeout(()=>{const p=map.containerPointToLatLng([touchStart[0]-r.left,touchStart[1]-r.top]);inspectPoint([p.lat,p.lng]);},650);},{passive:true});
  mapElement.addEventListener('touchmove',e=>{if(!touchStart||e.touches.length!==1){clearTimeout(pressTimer);return;}if(Math.hypot(e.touches[0].clientX-touchStart[0],e.touches[0].clientY-touchStart[1])>10)clearTimeout(pressTimer);},{passive:true});mapElement.addEventListener('touchend',()=>{clearTimeout(pressTimer);touchStart=null;},{passive:true});
  try{catalog=await BathymetryService.catalog();allAreas=curateSpots(catalog);renderResults();if(!db.viewport)fitResults();}catch(err){$('#area-list').innerHTML=empty('Områdene kunne ikke lastes','Kontroller forbindelsen og prøv igjen.',`<button class="secondary" data-action="reload">Last på nytt</button>`);$('#map-loading').hidden=true;}
  loadConditions(state.center);updateCounts();showPage(location.hash.slice(1)||'kart',false);const shared=new URLSearchParams(location.search).get('spot');if(shared&&allAreas.some(s=>s.id===shared))selectSpot(shared);
}
async function init(){
  icons();
  if(location.protocol==='file:'){
    document.body.classList.add('file-preview');
    const link=$('#auth-online-link');if(link)link.hidden=false;
  }
  AuthService.subscribe(user=>{showAuthState(user);if(state.page==='profil'&&$('#page-surface')&&!$('#page-surface').hidden)renderProfile();});
  try{await AuthService.init();}catch(error){console.warn('Konto kunne ikke startes:',error.message);const box=$('#auth-error');box.textContent=error.message||'Innloggingen kunne ikke startes. Sjekk nettet og prøv å laste siden på nytt.';box.hidden=false;}
}
init().catch(err=>{console.error(err);notice('Appen kunne ikke lastes ferdig. Prøv å laste siden på nytt.');});
