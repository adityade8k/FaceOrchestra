import { COMPOSITION as C, TUTORIAL_LOOPERS } from './composition.js';

// Logical score roles bind to real routes, never to a numbered socket recipe.
export function resolveTutorialRoutes(adapter) {
  const metro=adapter.get('metronome'),chords=adapter.get('chordLooper'),percussion=adapter.get('percussionLooper');
  const manager=adapter.r.metronomeConnectionManager;
  const result={chords:{},alternatives:{},percussion:{},clocks:{},wires:{}};
  for(const group of [...C.backing,{role:'percussion'}]) {
    const owner=group.role==='percussion'?percussion:chords;
    const ids=adapter.ids(group.role);
    const matches=owner?.tracks.filter(track=>ids.includes(track.connectedHonkId))||[];
    const track=matches.length===1?matches[0]:null;
    result.wires[group.role]=Boolean(track);
    if(track) {
      const binding={looperId:owner.id,trackId:track.trackId,trackIndex:track.index,honkId:track.connectedHonkId};
      if(group.role==='percussion')result.percussion.percussion=binding;
      else result.chords[group.role]=binding;
    }
  }
  const alternate=adapter.get('alternativeLooper');
  const alternativeTracks=alternate?.tracks.filter(t=>adapter.ids('group-1').includes(t.connectedHonkId)) || [];
  if(alternativeTracks.length===1) {
    const track=alternativeTracks[0];
    result.alternatives['group-1']={looperId:alternate.id,trackId:track.trackId,trackIndex:track.index,honkId:track.connectedHonkId};
    result.wires['alternative-group-1']=true;
  }
  for(const {role} of TUTORIAL_LOOPERS) {
    const owner=adapter.get(role),connection=owner&&manager.getConnectionForTarget('looper',owner.id);
    if(connection&&metro&&owner&&connection.metronomeId===metro.id&&owner.tracks.some(track=>track.trackId===connection.targetPortId))
      result.clocks[role]={...connection};
  }
  const clock=result.clocks.percussionLooper;
  if(clock&&clock.targetPortId!==result.percussion.percussion?.trackId)
    result.percussion.metronome={looperId:percussion.id,trackId:clock.targetPortId};
  if(percussion)result.percussion.percussionLooper={looperId:percussion.id,trackId:'looper-self-percussion'};
  return result;
}

export function connectTutorialClock(adapter,role) {
  const metro=adapter.get('metronome'),looper=adapter.get(role),manager=adapter.r.metronomeConnectionManager;
  if(!metro||!looper)throw new Error('Place the Metronome and this Looper first.');
  const existing=manager.getConnectionForTarget('looper',looper.id);
  const connections=manager.getConnectionsForMetronome(metro.id);
  const sibling=adapter.get(role==='alternativeLooper'?'chordLooper':'alternativeLooper');
  const shared=role!=='percussionLooper'&&sibling&&manager.getConnectionForTarget('looper',sibling.id);
  const chordClock=adapter.get('chordLooper')&&manager.getConnectionForTarget('looper',adapter.get('chordLooper').id);
  const appropriate=port=>role==='percussionLooper'?port!==chordClock?.portId:!shared||port===shared.portId;
  if(existing?.metronomeId===metro.id&&appropriate(existing.portId)&&looper.tracks.some(t=>t.trackId===existing.targetPortId&&!t.connectedHonkId))return existing;
  const portId=shared?.portId || [...metro.connectionPorts.keys()].find(id=>appropriate(id)&&!connections.some(c=>c.portId===id));
  const track=looper.tracks.find(t=>!t.connectedHonkId);
  if(!portId||!track)throw new Error('Use one shared output for alternatives, a different output for percussion, and an unused Looper socket.');
  return manager.connect({metronomeId:metro.id,portId,targetKind:'looper',targetId:looper.id,targetPortId:track.trackId});
}

export function connectTutorialHonk(adapter,role,looperRole=role==='percussion'?'percussionLooper':'chordLooper') {
  const looper=adapter.get(looperRole),ids=adapter.ids(role);
  if(!looper||!ids.length)throw new Error(`Place ${role} and its Looper first.`);
  const existing=looper.tracks.filter(track=>ids.includes(track.connectedHonkId));
  if(existing.length===1)return existing[0];
  if(existing.length>1)throw new Error(`Use one representative connection for ${role}; disconnect the duplicate cable.`);
  const clock=adapter.r.metronomeConnectionManager.getConnectionForTarget('looper',looper.id);
  const captured=adapter.takeRoutes?.[looperRole];
  const preferred=((looperRole==='alternativeLooper'?captured?.alternatives:captured?.chords)?.[role]||captured?.percussion?.[role])?.trackId;
  const available=t=>!t.connectedHonkId&&t.trackId!==clock?.targetPortId;
  const track=looper.tracks.find(t=>t.trackId===preferred&&available(t))||looper.tracks.find(available);
  if(!track)throw new Error(`Free a socket on ${role==='percussion'?'Percussion':'Chord'} Looper.`);
  adapter.r.connectLooperTrackToHonk(looper,track.index,ids[0]);return track;
}

export function recordingFitsRoutes(adapter,role) {
  if(!adapter.get(role)?.timeline.hasRecording()||!adapter.takeEvidence?.[role]?.length)return false;
  const recorded=adapter.takeRoutes?.[role],current=resolveTutorialRoutes(adapter);
  if(!recorded)return false;
  // Pitched playback still belongs to the tracks that captured its real gates.
  // Rewiring to another valid layout is allowed; explicitly record for that layout.
  if(role==='alternativeLooper')return recorded.alternatives?.['group-1']?.trackId===current.alternatives['group-1']?.trackId;
  if(role==='chordLooper')return C.backing.every(group=>recorded.chords?.[group.role]?.trackId===current.chords[group.role]?.trackId);
  return Object.keys(current.percussion).length===3;
}
