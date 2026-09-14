import { COMPOSITION as C } from './composition.js';

// Logical score roles bind to real routes, never to a numbered socket recipe.
export function resolveTutorialRoutes(adapter) {
  const metro=adapter.get('metronome'),chords=adapter.get('chordLooper'),percussion=adapter.get('percussionLooper');
  const manager=adapter.r.metronomeConnectionManager;
  const result={chords:{},percussion:{},clocks:{},wires:{}};
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
  for(const role of ['chordLooper','percussionLooper']) {
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
  if(existing?.metronomeId===metro.id&&looper.tracks.some(t=>t.trackId===existing.targetPortId&&(role==='chordLooper'||!t.connectedHonkId)))return existing;
  const portId=existing?.metronomeId===metro.id?existing.portId:[...metro.connectionPorts.keys()].find(id=>!manager.getConnectionsForMetronome(metro.id).some(c=>c.portId===id));
  const track=looper.tracks.find(t=>!t.connectedHonkId);
  if(!portId||!track)throw new Error('Free a Metronome output and an unused Looper socket, then choose Prepare again.');
  return manager.connect({metronomeId:metro.id,portId,targetKind:'looper',targetId:looper.id,targetPortId:track.trackId});
}

export function connectTutorialHonk(adapter,role) {
  const looper=adapter.get(role==='percussion'?'percussionLooper':'chordLooper'),ids=adapter.ids(role);
  if(!looper||!ids.length)throw new Error(`Place ${role} and its Looper first.`);
  const existing=looper.tracks.filter(track=>ids.includes(track.connectedHonkId));
  if(existing.length===1)return existing[0];
  if(existing.length>1)throw new Error(`Use one representative connection for ${role}; disconnect the duplicate cable.`);
  const clock=adapter.r.metronomeConnectionManager.getConnectionForTarget('looper',looper.id);
  const captured=adapter.takeRoutes?.[role==='percussion'?'percussionLooper':'chordLooper'];
  const preferred=(captured?.chords?.[role]||captured?.percussion?.[role])?.trackId;
  const available=t=>!t.connectedHonkId&&t.trackId!==clock?.targetPortId;
  const track=looper.tracks.find(t=>t.trackId===preferred&&available(t))||looper.tracks.find(available);
  if(!track)throw new Error(`Free a socket on ${role==='percussion'?'Percussion':'Chord'} Looper, then choose Prepare again.`);
  adapter.r.connectLooperTrackToHonk(looper,track.index,ids[0]);return track;
}

export function recordingFitsRoutes(adapter,role) {
  if(!adapter.get(role)?.timeline.hasRecording()||!adapter.takeEvidence?.[role]?.length)return false;
  const recorded=adapter.takeRoutes?.[role],current=resolveTutorialRoutes(adapter);
  if(!recorded)return false;
  // Pitched playback still belongs to the tracks that captured its real gates.
  // Rewiring to another valid layout is allowed; explicitly record for that layout.
  if(role==='chordLooper')return C.backing.every(group=>recorded.chords?.[group.role]?.trackId===current.chords[group.role]?.trackId);
  return Object.keys(current.percussion).length===3;
}
