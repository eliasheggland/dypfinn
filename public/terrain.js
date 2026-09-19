// Overlapping chart intervals never count as proven depth differences.
export function analyzeTerrain(center,samples){
 const valid=samples.filter(p=>p&&p.max>p.min&&p.min>=0);
 if(!center||valid.length<6)return null;
 const deep=valid.reduce((a,b)=>b.min>a.min?b:a),shallow=valid.reduce((a,b)=>b.max<a.max?b:a);
 const drop=Math.max(0,deep.min-shallow.max),coverage=valid.length/samples.length;
 const deeper=valid.filter(p=>p.min>=center.max&&p.min>center.min).length;
 const shallower=valid.filter(p=>p.max<=center.min&&p.max<center.max).length;
 const kind=deeper>=5&&!shallower?'Toppkant':shallower>=5&&!deeper?'Rennekant':drop>=50?'Dypkant':'Dybdeovergang';
 return {kind,drop,coverage,quality:Math.round(Math.min(95,35+Math.min(35,drop*.35)+coverage*25)),sampleCount:valid.length+1,deep,shallow,eligible:drop>=20&&coverage>=.75&&center.min>=10&&center.max<=400};
}
