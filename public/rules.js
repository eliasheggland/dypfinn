export const RULES_CHECKED='2026-09-18';
export const MINIMUM_SOURCE='https://www.fiskeridir.no/fritidsfiske/minstemaal';
export const LAW_SOURCE='https://www.fiskeridir.no/yrkesfiske/j-meldinger/j-148-2026';
export const PROTECTED_SOURCE='https://www.fiskeridir.no/fritidsfiske/freda-og-delvis-freda-artar';
// Recreational rod/handline fishing for personal consumption. Never a sale rule.
const minimum={hyse:32,torsk:40,hvitting:32,lysing:30,rodspette:29,sandflyndre:23,skrubbe:20,piggvar:30,slettvar:30,lomre:25,glassvar:25,kveite:84};
const noMinimum=new Set(['sei','lyr','brosme','steinbit','lange']);
export function fishingRule(id,latitude=60.08,when=new Date()){
 const north=latitude>=62,md=(when.getUTCMonth()+1)*100+when.getUTCDate();
 let cm=minimum[id]??null,label=cm?`${cm} cm`:noMinimum.has(id)?'Ingen minstemål':'Se særregel',note='',blocked=false;
 let source=['sandflyndre','skrubbe','piggvar','slettvar','lomre','glassvar','lange'].includes(id)?LAW_SOURCE:MINIMUM_SOURCE;
 if(id==='torsk'){label=north?'44 / 55 cm':'40 cm';cm=north?null:40;note=north?'Nord for 62°N: 55 cm innenfor 4 nautiske mil fra grunnlinjene, 44 cm utenfor. Lokale torskeforbud kan gjelde.':'Sør for 62°N. Lokale torskeforbud og fredningsområder må kontrolleres.';}
 if(id==='hyse'&&north){cm=40;label='40 cm';note='Nord for 62°N. Sør for 62°N: 32 cm.';}
 if(id==='sei')note='Unntaket gjelder fangst til eget bruk, ikke salg.';
 if(id==='lange')note='Ikke oppført med et generelt minstemål i høstingsforskriftens minstemålstabell.';
 if(id==='breiflabb'){label='60 cm ved garnfiske';note='60 cm gjelder garn. Dette er ikke et minstemål for stangfiske.';}
 if(id==='uer'){label='32 / 30 cm';note='32 cm innenfor 12 nautiske mil fra grunnlinjene, 30 cm utenfor. Nord for 62°N: kun jukse 1. juni–31. august.';blocked=north&&(md<601||md>831);source=PROTECTED_SOURCE;}
 if(id==='kveite'){blocked=!north||md>=1220||md<=420;note=!north?'Målrettet fiske er forbudt hele året sør for 62°N. All levedyktig kveite skal settes tilbake.':'Fredet 20. desember–20. april. Sklinnabanken har et eget helårsforbud. Kveite over 2 meter skal alltid settes tilbake.';source='https://www.fiskeridir.no/fritidsfiske/kveite-for-fritidsfiskarar';}
 return {cm,label,note,blocked,source,checked:RULES_CHECKED,scope:'Fritidsfiske til eget bruk · stang/jukse'};
}
