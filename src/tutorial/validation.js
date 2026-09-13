import { COMPOSITION as C, TOLERANCES as T, performanceEvents } from './composition.js';
const pass = () => ({ ok: true, message: 'Validated.' });
const fail = message => ({ ok: false, message });
export const sameMembers = (a = [], b = []) => a.length === b.length && [...a].sort().every((v,i) => v === [...b].sort()[i]);
export function pitchesMatch(actual = [], expected = []) {
  return actual.length === expected.length && [...actual].sort((a,b)=>a-b).every((v,i) =>
    Math.abs(v - [...expected].sort((a,b)=>a-b)[i]) * 100 <= T.pitchCents);
}
export function validateBend(event) {
  const samples = event.bendSamples || [];
  if (!event.released || samples.length < 3) return fail('Hold one Eb voice through the glide, then release.');
  const duration = event.endMs - event.startMs;
  const opening = samples.filter(s => s.offsetMs < duration * 0.15);
  if (!opening.length || opening.some(s => Math.abs(s.semitones) > 0.5)) return fail('Begin the held voice on Eb with a level wrist.');
  if (samples.some(s => s.semitones > 0.75)) return fail('Roll downward from Eb toward C.');
  let settledSince = null, bestSettle = 0;
  for (const s of samples) {
    if (Math.abs(s.semitones + 3) * 100 <= T.bendEndpointCents) {
      settledSince ??= s.offsetMs;
      bestSettle = Math.max(bestSettle, s.offsetMs - settledSince);
    } else settledSince = null;
  }
  const last = samples.at(-1);
  if (bestSettle < T.bendSettleMs || Math.abs(last.semitones + 3) * 100 > T.bendEndpointCents)
    return fail('Settle on C (three semitones down) for at least 150 ms before releasing.');
  if (!samples.some(s => s.semitones < -0.5 && s.semitones > -2.5)) return fail('Glide continuously; do not jump straight to C.');
  return pass();
}
export function validateNote(event, expected, { timed = false } = {}) {
  if (!event || event.kind !== 'note' || !event.released || event.allReleased === false || !event.articulated) return fail('Release Trigger before starting a fresh note.');
  if (event.role !== expected.role) return fail(`Wrong target: play ${expected.role}.`);
  if (!event.voiced || event.invalidMembers || !pitchesMatch(event.midis, expected.midis || [expected.midi]))
    return fail('Check the pitches and touching voices; an expected voice is missing or an extra voice joined.');
  if (expected.vowel && event.vowel !== expected.vowel) return fail(`Choose the ${expected.vowel} vowel before squeezing.`);
  if (event.endMs - event.startMs < (expected.minimumMs || 0)) return fail('Hold a little longer, then release.');
  if (timed && Math.abs(event.durationBeats - expected.beats) > T.durationBeats) return fail(`Hold ${expected.role} for ${expected.beats} beats, then release.`);
  if (expected.bend) return validateBend(event);
  if (event.maxAbsBend > 0.5) return fail('Keep your wrist level for this note.');
  return pass();
}
export function validateSequence(expected, actual, { kind = 'note', partial = false } = {}) {
  const observations = actual.filter(e => e.kind === kind).sort((a,b) => a.beat - b.beat);
  const used = new Set();
  for (const event of observations) {
    let index = expected.findIndex((target,i) => !used.has(i) && target.role === event.role && Math.abs(target.beat - event.beat) <= T.onsetBeats);
    if (index < 0) {
      const near = expected.find((target,i) => !used.has(i) && Math.abs(target.beat - event.beat) <= T.onsetBeats);
      if (near) return fail(`Wrong target at beat ${near.beat + 1}: expected ${near.role}, heard ${event.role}.`);
      const same = expected.find((target,i) => !used.has(i) && target.role === event.role);
      return fail(same ? `Mistimed ${event.role}: aim for beat ${same.beat + 1}.` : `Extra ${event.role} at beat ${(event.beat + 1).toFixed(1)}.`);
    }
    used.add(index);
    const target = expected[index];
    const result = kind === 'note' ? validateNote(event, target, {timed:true}) :
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
export function validateTake(timeline, evidence) {
  if (!timeline || timeline.timingMode !== 'metronome') return fail('Record with the connected Metronome running.');
  if (timeline.gapBeats !== 0 || Math.abs(timeline.durationMs / timeline.beatIntervalMs - 16) > 0.01)
    return fail('The captured loop must be 16 beats with zero added Gap. Re-record the take.');
  const liveChords = validateSequence(C.backing.map(g=>({...g,midis:g.midis})), evidence);
  if (!liveChords.ok) return liveChords;
  const liveDrums = validateSequence(C.percussion, evidence, {kind:'strike'});
  if (!liveDrums.ok) return liveDrums;
  if (evidence.filter(e=>e.kind==='strike').some(e=>e.recordedCount !== 1)) return fail('A sounding tap was not recorded exactly once. Check its cable route.');
  const gates = [], drums = [];
  for (const track of timeline.tracks || []) {
    let open = null;
    for (const e of track.events || []) {
      if (e.type === 'drumHit') drums.push({kind:'strike',role:C.percussion.find(p=>p.type===e.value)?.role || 'unknown',
        beat:e.timeMs / timeline.beatIntervalMs, lane:track.trackId, percussionType:e.value,withdrawn:true});
      if (e.type === 'squeezeStart') {
        if (open) return fail('The timeline contains overlapping chord gates.');
        open = e;
      }
      if (e.type === 'squeezeEnd' && open) {
        const group = C.backing.find(g=>g.trackIndex === track.trackIndex);
        if (!group || e.synthetic) return fail('A chord was not released normally before Stop.');
        gates.push({kind:'note',role:group.role,midis:group.midis,voiced:true,articulated:true,released:true,
          startMs:open.timeMs,endMs:e.timeMs,beat:open.timeMs / timeline.beatIntervalMs,
          durationBeats:(e.timeMs-open.timeMs)/timeline.beatIntervalMs,maxAbsBend:0});
        open = null;
      }
      if ((e.type === 'gestureSnapshot' && Math.abs(e.values?.bend || 0) > 0.125) ||
          (e.field === 'bend' && Math.abs(e.value || 0) > 0.125)) return fail('Keep backing pitch steady while recording.');
    }
    if (open) return fail('A recorded chord has no release.');
  }
  const captured = validateSequence(C.backing.map(g=>({...g,midis:g.midis})),gates);
  return captured.ok ? validateSequence(C.percussion,drums,{kind:'strike'}) : captured;
}
export function validateSetup(step, snapshot, origin) {
  const role = snapshot.roles?.[step.role];
  if (step.type === 'spawn') {
    if (!role?.ready || !role.placed || role.kind !== step.kind || role.source !== origin) return fail('Select and place the requested instrument; a preview does not count.');
    if (!role.correctPitch) return fail('The bound instrument was retuned. Restore its requested pitches.');
    if (!role.contactExact || role.stableMs < T.contactStableMs) return fail('Keep each chord touching internally and separate from all other groups.');
  } else if (step.type === 'clock-wire') {
    if (!snapshot.clockWired) return fail('Connect the Metronome to Looper node 6.');
  } else if (step.type === 'wire') {
    if (!snapshot.wires?.[step.role]) return fail(`Connect ${step.role} to its assigned Looper node.`);
  } else if (step.type === 'tempo') {
    if (!snapshot.clockPlaying || Math.abs(snapshot.bpm - C.bpm) > T.bpm || snapshot.tempoStableMs < T.setupStableMs || snapshot.gapBeats !== 0)
      return fail('Start the clock at 80 BPM and leave Looper Gap at zero.');
  } else if (step.type === 'timbre') {
    if (!snapshot.timbreReady) return fail('Use O and soften all backing Honks with their nose controls; lower Looper volume.');
  } else return null;
  return pass();
}
export function expectedForStep(step) {
  if (step.type === 'chords' || step.type === 'record') return C.backing.map(g=>({...g,midis:g.midis}));
  if (step.type === 'phrase') return C.phrases[step.phrase].filter(e=>e.pitch);
  if (step.type === 'performance') return performanceEvents().filter(e=>e.pitch);
  return [];
}
