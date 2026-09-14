import { COMPOSITION as C } from './composition.js';
import { scoreForStep } from './scoring.js';
import { validateSetup } from './validation.js';

export const LESSON_CONTROL_IDS=Object.freeze(['previous-step','next-step','step-demo','step-practice','recenter','exit']);
export const isSetupStep=step=>Boolean(step&&['ack','spawn','clock-wire','wire','tempo','timbre','stick','unequip'].includes(step.type));
export const roleName=role=>C.backing.find(group=>group.role===role)?.label||({metronome:'Metronome',chordLooper:'Chord Looper',percussionLooper:'Percussion Looper',percussion:'percussion Honk',melody:'Jog Study'}[role])||role?.replace('melody-','')||'instrument';

export function setupStatus(step,snapshot) {
  if(!isSetupStep(step))return null;
  if(step.type==='ack')return {ok:true,message:'Ready. Choose Next Step to build the ensemble.'};
  if(step.type==='stick')return snapshot.stickActive&&snapshot.stickOrigin==='learner'
    ?{ok:true,message:'Stick ready. Choose Next Step.'}:{ok:false,message:'Hold Grip in empty space to equip a stick.'};
  if(step.type==='unequip')return !snapshot.anyStickActive
    ?{ok:true,message:'Hands ready for melody. Choose Next Step.'}:{ok:false,message:'Release Grip to put away the stick.'};
  if(step.type==='spawn'){
    const role=snapshot.roles?.[step.role];
    if(!role?.ready||!role.placed)return {ok:false,message:`Place ${roleName(step.role)} from the radial menu. A preview does not count.`};
  }
  if(step.type==='clock-wire'&&!snapshot.loopers?.[step.looperRole]?.clockWired)return {ok:false,message:`Connect a free Metronome output to any compatible ${roleName(step.looperRole)} socket.`};
  if(step.type==='wire'&&!snapshot.wires?.[step.role])return {ok:false,message:`Connect one ${roleName(step.role)} member to a free ${step.role==='percussion'?'Percussion':'Chord'} Looper socket.`};
  const result=validateSetup(step,snapshot,null);
  return result.ok?{ok:true,message:'Setup complete. Choose Next Step.'}:result;
}

// Inspect only what this musical action actually needs. Earlier exercises and
// recordings are optional; this function never creates, repairs or connects.
export function musicUnavailable(step,snapshot) {
  if(!step)return 'The study is complete.';
  if(isSetupStep(step))return 'Follow the setup instruction; completion is checked automatically.';
  if(['finalize','playback'].includes(step.type)&&!snapshot.loopers?.[step.looperRole]?.hasRecording)return 'No recording yet; you can skip this step';
  if(step.type==='start-all'&&!['chordLooper','percussionLooper'].every(role=>snapshot.loopers?.[role]?.hasRecording))return 'Two recordings are needed to hear both together; you can skip this step.';
  const roles=new Set(scoreForStep(step).map(event=>event.role));
  if(step.type==='strike')roles.add(step.role);
  if(step.type==='record'&&step.looperRole==='percussionLooper')roles.add('percussionLooper');
  for(const role of roles){
    const state=snapshot.roles?.[role];
    if(!state?.ready||!state.placed)return `Place ${roleName(role)} with the radial menu before this example.`;
    if(!state.correctPitch)return `Restore the requested notes on ${roleName(role)}.`;
    if(!state.contactExact)return `Keep ${roleName(role)} separate from other groups, with its chord members touching.`;
  }
  if(step.timed||['playback','start-all'].includes(step.type)){
    if(!snapshot.clockPlaying||Math.abs(snapshot.bpm-C.bpm)>1)return 'Set the Metronome to 80 BPM and press its Play control.';
  }
  if(step.type==='record'){
    const owner=snapshot.loopers?.[step.looperRole];
    if(!owner?.id)return `Place ${roleName(step.looperRole)} using Instruments → Looper.`;
    if(!owner.clockWired)return `Connect ${roleName(step.looperRole)} to the Metronome.`;
    if(owner.gapBeats!==0)return `Set ${roleName(step.looperRole)} Gap to zero.`;
    const inputs=step.looperRole==='chordLooper'?C.backing.map(group=>group.role):['percussion'];
    for(const role of inputs)if(!snapshot.wires?.[role])return `Connect ${roleName(role)} to ${roleName(step.looperRole)}.`;
  }
  if(['playback','start-all'].includes(step.type))for(const role of step.type==='start-all'?['chordLooper','percussionLooper']:[step.looperRole]){
    if(!snapshot.loopers?.[role]?.clockWired)return `Connect ${roleName(role)} to the Metronome.`;
  }
  if(Object.values(snapshot.loopers||{}).some(looper=>looper.recording||looper.recordArmed))return 'Stop the current recording on its Looper before starting an example.';
  return '';
}
