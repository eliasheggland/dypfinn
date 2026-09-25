import {clamp,offset} from './model.js';

const point=(center,along,across,axis)=>offset(offset(center,along,axis),across,(axis+90)%360);

export function fishingZone(spot){
  const axis=Number.isFinite(spot.analysis?.axis)?spot.analysis.axis:0;
  const drop=spot.analysis?.drop||spot.drop||50;
  const length=clamp(120+drop*.75,150,380),width=clamp(55+drop*.22,65,150);
  const p=(along,across)=>point(spot.coordinates,along,across,axis);
  let points;
  if(spot.kind==='Toppkant'){
    points=[p(-.48*length,0),p(-.22*length,-.72*width),p(.3*length,-.78*width),p(.78*length,-.28*width),p(.78*length,.28*width),p(.3*length,.78*width),p(-.22*length,.72*width)];
  }else if(spot.kind==='Rennekant'){
    points=[p(-length,-.25*width),p(-.5*length,-.62*width),p(.08*length,-.45*width),p(.92*length,-.12*width),p(length,.26*width),p(.42*length,.58*width),p(-.25*length,.42*width),p(-.8*length,.22*width)];
  }else if(spot.kind==='Dybdeovergang'){
    points=[p(-.75*length,-.35*width),p(.7*length,-.6*width),p(length,0),p(.7*length,.6*width),p(-.75*length,.35*width)];
  }else{
    points=[p(-.72*length,-.28*width),p(.48*length,-.58*width),p(length,0),p(.48*length,.58*width),p(-.72*length,.28*width)];
  }
  return {points,axis,length:Math.round(length),width:Math.round(width),kind:spot.kind};
}

export const zoneCopy=kind=>({Toppkant:'skulderflate',Rennekant:'renneflate',Dybdeovergang:'overgangsflate',Dypkant:'kantflate'}[kind]||'fiskeflate');
