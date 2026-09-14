// A discontinuous phase change marks the exact onset; easing only shapes the pop.
export function timingCueState(beat,event,{percussion=false,beatMs=750}={}) {
  const phase=beat-event.beat,hold=percussion?0.1:event.beats;
  if(phase< -1||phase>hold+0.3)return null;
  if(phase<0)return {phase:'prepare',green:Math.max(-phase,0.015),yellow:0.65};
  if(phase<hold)return {phase:percussion?'strike':'hold',green:0,yellow:1.2+0.18*Math.sin(Math.min(phase*beatMs/120,1)*Math.PI)};
  return {phase:percussion?'withdraw':'release',green:0,yellow:1.2*Math.max(0,1-(phase-hold)/0.3)};
}
