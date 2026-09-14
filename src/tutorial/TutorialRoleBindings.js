import { COMPOSITION as C, PITCHES, TUTORIAL_LOOPERS } from './composition.js';

// Resolve only committed catalog identities. The current step cannot turn an
// unrelated scale/preset into the expected chord or consume a cancelled Looper.
export function committedRoleBindings(entryId,instruments,{get,ids,step}={}) {
  if(!instruments.length||instruments.some(h=>h.pendingPlacement||h.disposed))return [];
  const complete=role=>{
    const expected=C.backing.some(g=>g.role===role)?3:role==='melody'?7:1;
    const members=ids(role)||[];
    return members.length===expected&&members.every(id=>get(id)&&!get(id).disposed&&!get(id).pendingPlacement);
  };
  let role=C.backing.find(group=>group.catalogId===entryId)?.role;
  if(entryId==='jog-melody')role='melody';
  if(entryId==='metronome')role='metronome';
  if(entryId==='looper')role=TUTORIAL_LOOPERS.find(l=>!complete(l.role))?.role;
  if(entryId==='honk'&&step?.role==='percussion')role='percussion';
  if(!role||complete(role))return [];
  const members=instruments.map(h=>h.id),result=[{role,ids:members}];
  if(role==='melody')Object.keys(PITCHES).forEach((pitch,i)=>result.push({role:`melody-${pitch}`,ids:[members[i]]}));
  return result;
}
