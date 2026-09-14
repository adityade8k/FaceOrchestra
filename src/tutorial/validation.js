import { COMPOSITION as C, TOLERANCES as T, performanceEvents, DESCENDING_BEND } from './composition.js';
const pass = () => ({ ok: true, message: 'Validated.' });
const fail = message => ({ ok: false, message });
export function sameMembers(a = [], b = []) {
  if(a.length!==b.length)return false;
  const left=[...a].sort(),right=[...b].sort();return left.every((value,index)=>value===right[index]);
}
export function pitchesMatch(actual = [], expected = []) {
  return actual.length === expected.length && [...actual].sort((a,b)=>a-b).every((v,i) =>
    Math.abs(v - [...expected].sort((a,b)=>a-b)[i]) * 100 <= T.pitchCents);
}
export function validateBend(event, curve = DESCENDING_BEND) {
  const samples = event.bendSamples || [];
  const initial=curve[0].semitones,endpoint=curve.at(-1).semitones,direction=Math.sign(endpoint-initial);
  if (!event.released || samples.length < 3) return fail('Hold one Eb voice through the glide, then release.');
  const duration = event.endMs - event.startMs;
  const opening = samples.filter(s => s.offsetMs < duration * 0.15);
  if (!opening.length || opening.some(s => Math.abs(s.semitones-initial) > 0.5)) return fail('Begin the held voice on Eb with a level wrist.');
  if (samples.some(s => (s.semitones-initial)*direction < -0.75)) return fail('Roll toward the target pitch shown by the wrist guide.');
  let settledSince = null, bestSettle = 0;
  for (const s of samples) {
    if (Math.abs(s.semitones-endpoint) * 100 <= T.bendEndpointCents) {
      settledSince ??= s.offsetMs;
      bestSettle = Math.max(bestSettle, s.offsetMs - settledSince);
    } else settledSince = null;
  }
  const last = samples.at(-1);
  if (bestSettle < T.bendSettleMs || Math.abs(last.semitones-endpoint) * 100 > T.bendEndpointCents)
    return fail('Settle on C (three semitones down) for at least 150 ms before releasing.');
  if (!samples.some(s => (s.semitones-initial)*direction > 0.5 && (endpoint-s.semitones)*direction > 0.5)) return fail('Glide continuously; do not jump straight to the endpoint.');
  return pass();
}
export function validateNote(event, expected, { timed = false, durationBeats=T.durationBeats } = {}) {
  if (!event || event.kind !== 'note' || !event.released || event.allReleased === false || !event.articulated) return fail('Release Trigger before starting a fresh note.');
  if (event.role !== expected.role) return fail(`Wrong target: play ${expected.role}.`);
  if (!event.voiced || event.invalidMembers || !pitchesMatch(event.midis, expected.midis || [expected.midi]))
    return fail('Check the pitches and touching voices; an expected voice is missing or an extra voice joined.');
  if (expected.vowel && event.vowel !== expected.vowel) return fail(`Choose the ${expected.vowel} vowel before squeezing.`);
  if (event.endMs - event.startMs < (expected.minimumMs || 0)) return fail('Hold a little longer, then release.');
  if (timed && Math.abs(event.durationBeats - expected.beats) > durationBeats) return fail(`Hold ${expected.role} for ${expected.beats} beats, then release.`);
  if (expected.bend) return validateBend(event, expected.bend);
  if (event.maxAbsBend > 0.5) return fail('Keep your wrist level for this note.');
  return pass();
}
export function validateSequence(expected, actual, { kind = 'note', partial = false, onsetBeats=T.onsetBeats, durationBeats=T.durationBeats } = {}) {
  const observations = actual.filter(e => e.kind === kind).sort((a,b) => a.beat - b.beat);
  const used = new Set();
  for (const event of observations) {
    let index = expected.findIndex((target,i) => !used.has(i) && target.role === event.role && Math.abs(target.beat - event.beat) <= onsetBeats);
    if (index < 0) {
      const near = expected.find((target,i) => !used.has(i) && Math.abs(target.beat - event.beat) <= onsetBeats);
      if (near) return fail(`Wrong target at beat ${near.beat + 1}: expected ${near.role}, heard ${event.role}.`);
      const same = expected.find((target,i) => !used.has(i) && target.role === event.role);
      return fail(same ? `Mistimed ${event.role}: aim for beat ${same.beat + 1}.` : `Extra ${event.role} at beat ${(event.beat + 1).toFixed(1)}.`);
    }
    used.add(index);
    const target = expected[index];
    const result = kind === 'note' ? validateNote(event, target, {timed:true,durationBeats}) :
      event.withdrawn && (!target.lane || event.lane === target.lane) && (!target.type || event.percussionType === target.type)
        ? pass() : fail(`Wrong route or incomplete withdrawal for ${target.role}; expected ${target.lane || 'one clean strike'}.`);
    if (!result.ok) return result;
  }
  if (!partial && used.size !== expected.length) {
    const missing = expected.find((_,i)=>!used.has(i));
    return fail(`Missing ${missing.role} at beat ${missing.beat + 1}.`);
  }
  return {ok:true, matched:used.size};
}
export function validateTake(timeline, evidence, role, routes = {}, tolerances = {}) {
  const chords = role === "chordLooper";
  if (!["chordLooper", "percussionLooper"].includes(role)) return fail("Specify the recording owner.");
  if (!timeline || timeline.timingMode !== 'metronome') return fail('Record with the connected Metronome running.');
  if (timeline.gapBeats !== 0) return fail('Leave Gap at zero for this exercise.');
  if (!(timeline.durationMs > 0)) return fail('Record a note or strike before playing the take.');
  if (chords && evidence.some(e=>e.kind==='strike')) return fail('Keep percussion out of the chord take.');
  if (!chords && evidence.some(e=>e.kind==='note')) return fail('Record only stick taps in Percussion Looper.');
  const expectedDrums=C.percussion.map(event=>({...event,lane:routes.percussion?.[event.role]?.trackId}));
  if(!chords&&expectedDrums.some(event=>!event.lane))return fail('Reconnect each percussion target through a distinct compatible route, then record again.');
  const live = chords ? validateSequence(C.backing, evidence,tolerances) : validateSequence(expectedDrums, evidence, {...tolerances,kind:'strike'});
  if (!live.ok) return live;
  if (!chords && evidence.filter(e=>e.kind==='strike').some(e=>e.recordedCount !== 1)) return fail('Each tap must enter only Percussion Looper through its real cable route.');
  // Live evidence keeps its original count-in coordinates. Only the stored
  // timeline is normalized; adding its actual first onset back cannot improve
  // an early/late performance's score. Older schemas retain the clock offset.
  const observedFirstBeat = Math.min(...evidence.filter(e=>e.kind===(chords?'note':'strike')).map(e=>e.beat));
  const storedFirstMs = Math.min(...(timeline.tracks || []).flatMap(t=>t.events.filter(e=>['squeezeStart','drumHit'].includes(e.type)).map(e=>e.timeMs)));
  const firstBeat = timeline.schemaVersion >= 7
    ? observedFirstBeat - (timeline.lengthMode === 'fixed-window' ? storedFirstMs / timeline.beatIntervalMs : 0) : 0;
  const gates = [], drums = [];
  for (const track of timeline.tracks || []) {
    let open = null;
    for (const e of track.events || []) {
      if (e.type === 'drumHit') drums.push({kind:'strike',role:C.percussion.find(p=>p.type===e.value)?.role || 'unknown',
        beat:firstBeat + e.timeMs / timeline.beatIntervalMs, lane:track.trackId, percussionType:e.value,withdrawn:true});
      if (!chords && ['squeezeStart','squeezeEnd'].includes(e.type)) return fail('Percussion take contains a pitched squeeze.');
      if (chords && e.type === 'drumHit') return fail('Chord take contains percussion.');
      if (e.type === 'squeezeStart') {
        if (open) return fail('The timeline contains overlapping chord gates.');
        open = e;
      }
      if (e.type === 'squeezeEnd' && open) {
        const group = C.backing.find(g=>routes.chords?.[g.role]?.trackId === track.trackId);
        if (!group || e.synthetic) return fail('A chord was not released normally before Stop.');
        gates.push({kind:'note',role:group.role,midis:group.midis,voiced:true,articulated:true,released:true,
          startMs:open.timeMs,endMs:e.timeMs,beat:firstBeat + open.timeMs / timeline.beatIntervalMs,
          durationBeats:(e.timeMs-open.timeMs)/timeline.beatIntervalMs,maxAbsBend:0});
        open = null;
      }
      if ((e.type === 'gestureSnapshot' && Math.abs(e.values?.bend || 0) > 0.125) ||
          (e.field === 'bend' && Math.abs(e.value || 0) > 0.125)) return fail('Keep backing pitch steady while recording.');
    }
    if (open) return fail('A recorded chord has no release.');
  }
  return chords ? validateSequence(C.backing,gates,tolerances) : validateSequence(expectedDrums,drums,{...tolerances,kind:'strike'});
}
export function validateSetup(step, snapshot, origin) {
  const role = snapshot.roles?.[step.role];
  if (step.type === 'spawn') {
    if (!role?.ready || !role.placed || role.kind !== step.kind) return fail('Place the requested instrument; a preview does not count.');
    if (!role.correctPitch) return fail('The bound instrument was retuned. Restore its requested pitches.');
    if (!role.contactExact || role.stableMs < T.contactStableMs) return fail('Keep each chord touching internally and separate from all other groups.');
  } else if (step.type === 'record-length') {
    if (snapshot.loopers?.[step.looperRole]?.recordBeats !== 16) return fail('Set the right handle to 16 beats. Recording stops automatically.');
  } else if (step.type === 'clock-wire') {
    if (!snapshot.loopers?.[step.looperRole]?.clockWired) return fail(`Connect the Metronome to ${step.looperRole} using an available output and compatible socket.`);
  } else if (step.type === 'wire') {
    if (!snapshot.wires?.[step.role]) return fail(`Connect one member of ${step.role} to an available socket on its Looper.`);
  } else if (step.type === 'tempo') {
    if (!snapshot.clockPlaying || Math.abs(snapshot.bpm - C.bpm) > T.bpm || snapshot.tempoStableMs < T.setupStableMs || ['chordLooper','percussionLooper'].some(role=>snapshot.loopers?.[role]?.gapBeats !== 0))
      return fail('Start the clock at 80 BPM and leave both Looper Gaps at zero.');
  } else if (step.type === 'timbre') {
    if (!snapshot.timbreReady) return fail('Use O and soften all backing Honks with their nose controls; lower Looper volume.');
  } else return null;
  return pass();
}
const expectedCache=new WeakMap();
export function expectedForStep(step) {
  if(!step)return [];
  if(!expectedCache.has(step))expectedCache.set(step,
    step.type==='chords'||step.type==='record'&&step.looperRole==='chordLooper'?C.backing:
    step.type==='phrase'?C.phrases[step.phrase].filter(e=>e.pitch):
    step.type==='performance'?performanceEvents().filter(e=>e.pitch):[]);
  return expectedCache.get(step);
}
