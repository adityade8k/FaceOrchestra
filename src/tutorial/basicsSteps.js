import { MORPH_TARGET_NAMES } from '../config/honk.js';

export const BASICS_THRESHOLDS = Object.freeze({
  move: 0.09, rotation: Math.PI / 9, bend: 0.22, ear: 0.22,
  volume: 0.16, scale: 0.015, bpm: 5, soundMs: 140, successMs: 850,
});
export const BASICS_VOWELS = Object.freeze(Object.keys(MORPH_TARGET_NAMES.vowels));
// The authored collider aliases are viewer-relative: x < 0 is the clown's
// right. Keep the instrument's existing pitch mapping; name anatomy consistently.
export const BASICS_EARS = Object.freeze([
  { side: 'left', name: 'Right ear', direction: 1 },
  { side: 'left', name: 'Right ear', direction: -1 },
  { side: 'right', name: 'Left ear', direction: 1 },
  { side: 'right', name: 'Left ear', direction: -1 },
]);

const step = (id, title, instruction, target, objectives, helper = '') => ({
  id, title, instruction, target, objectives, helper,
  // These names resolve to the session's real-scene fixture and evidence
  // handlers. Entry/cleanup never award objectives.
  entry: id, completion: id, cleanup: 'release-inputs',
});
export const BASICS_STEPS = Object.freeze([
  step('honk', 'Honk', 'Point at the horn and press the trigger to honk.', 'squeeze', ['honk'], 'Aim at the large squeeze sphere below the face. Hold Trigger to sustain.'),
  step('bend', 'Bend a note', 'Keep pressing the trigger and bend your wrist to bend the note.', 'squeeze', ['bend'], 'Press Trigger again for this step, then roll your wrist while holding it.'),
  step('move', 'Move the horn', 'Aim at the clown horn, hold grip, and move it through space.', 'body', ['move']),
  step('rotate', 'Rotate the horn', 'While holding grip, rotate the clown horn.', 'body', ['rotate'], 'Release and grab again to start this step.'),
  step('small', 'Make it small', 'Hold grip and push the joystick left to make the clown horn as small as it can go.', 'body', ['small'], 'Use the gripping hand. Recenter the joystick between pushes; each push changes one size step.'),
  step('big', 'Make it big', 'Hold grip and push the joystick right to make the clown horn as big as it can go.', 'body', ['big'], 'Use the gripping hand. Recenter the joystick between pushes. The horn returns to working size afterward.'),
  step('ears', 'Adjust both ears', 'Hold the trigger on the right ear and pull it up and down. Then try the left ear.', 'ear', ['right-up', 'right-down', 'left-up', 'left-down'], 'Left and right are from the clown’s perspective: its right ear is on your left.'),
  step('pitch', 'Combine pitch controls', 'Squeeze the horn, bend your wrist, and pull an ear to explore how the pitch changes.', 'squeeze', ['bend', 'ear'], 'Hold Trigger on the squeeze sphere with one hand; use the other hand’s Trigger on an ear.'),
  step('volume', 'Change volume', 'While squeezing the horn, pull its nose up and down to change the volume.', 'nose', ['up', 'down'], 'Keep one hand’s Trigger on the squeeze sphere. Drag the nose with the other.'),
  step('vowels', 'Explore all five vowels', 'Click the mouth to change the vowel. Play all five vowels.', 'mouth', BASICS_VOWELS, 'Click with Trigger. A vowel is checked only when it sounds.'),
  step('duplicate', 'Duplicate', 'Hold grip on the clown horn and press A to duplicate it.', 'body', ['duplicate'], 'Use Grip and A on the right controller. Move the copy aside.'),
  step('chord', 'Make and play a chord', 'Duplicate again until you have three clown horns. Bring all three together to make a chord, then play it.', 'group', ['three', 'group', 'play'], 'Overlap the large squeeze spheres, then squeeze any member. Up to three horns are kept in this lesson.'),
  step('freeze', 'Freeze and move the chord', 'Point at the chord and press B to freeze it. Then hold grip and move the chord.', 'group', ['freeze', 'move'], 'Freeze fixes membership and relative positions, and disables facial editing. The chord still sounds when squeezed.'),
  step('unfreeze', 'Unfreeze', 'Point at the chord and press B to unfreeze it.', 'group', ['unfreeze'], 'Release B first, then press it again. Members can be moved and edited separately.'),
  step('clear', 'Clear the horns', 'Press X to delete all clown horns.', 'group', ['clear'], 'In onboarding, X clears the tutorial horns. Your saved Play workspace returns on Exit.'),
  step('create', 'Create a new horn', 'Hold A, choose Instruments → Honk, then release. Press Trigger to place it.', 'placement', ['create'], 'Roll to select a category, pull toward you, then roll to Honk. Left Y also opens the menu; Grip cancels a preview.'),
  step('metronome', 'Start the metronome', 'Point at the metronome’s Play button and press Trigger. Listen to the pulse.', 'metronome-play', ['pulse'], 'Metronomes are also in Instruments. Only one can be placed in a scene.'),
  step('bpm', 'Change BPM', 'Hold Trigger on the BPM handle and move it along its arc to change the tempo.', 'bpm', ['tempo'], 'Listen to at least two pulses at your new tempo.'),
  step('length', 'Set a looper’s length', 'Hold Trigger on the looper’s right handle and choose 4 beats.', 'recordLength', ['length'], 'The right handle selects 2, 4, 8 or 16 beats. Loopers are also in Instruments.'),
  step('wire-horn', 'Connect the horn', 'Hold Trigger on a looper socket, drag its cable to the horn’s side socket, then release.', 'honk-wire', ['wire'], 'One connected horn feeds this looper track.'),
  step('wire-clock', 'Connect the clock', 'Drag a cable from a metronome output to a free looper socket. Release Trigger to connect.', 'clock-wire', ['wire'], 'The connection gives this looper the metronome’s tempo.'),
  step('record', 'Record a phrase', 'Press Record on the looper, then play a phrase on the horn until recording finishes.', 'record', ['armed', 'sound', 'recorded'], 'Ready waits for your first sound; silence uses no beats. Then the selected beat window records and stops automatically.'),
  step('playback', 'Play and stop the loop', 'Press Play, listen to your phrase, then press Stop.', 'play', ['heard', 'stopped'], 'Wait for the next beat. Stop ends playback; pressing Stop again while idle clears the take.'),
  step('gap', 'Adjust the loop gap', 'Drag the bottom handle to add a gap, then return it to zero.', 'gap', ['gap', 'zero'], 'Gap adds 0–4 beats between repeats. Zero repeats immediately after the phrase.'),
  step('second-record', 'Record another phrase', 'Press Record on the second looper, then play another phrase until recording finishes.', 'record', ['armed', 'sound', 'recorded'], 'Its horn and clock are prepared. Ready waits for sound, then records four beats.'),
  step('shared-clock', 'Connect alternate patterns', 'Connect the second looper to the SAME metronome output as the first.', 'clock-wire', ['wire'], 'Drag from the first looper’s metronome output to a free socket on the second looper.'),
  step('switch', 'Hear the next pattern', 'Play the first looper. While it plays, press Play on the second and hear the switch.', 'play', ['first', 'queued', 'second'], 'QUEUED waits for the cycle boundary. One looper plays per output; separate outputs can play together.'),
  step('strike', 'Try a percussion strike', 'Hold Grip in empty space to equip a stick. Strike the horn, pull away, and strike again.', 'squeeze', ['first', 'second'], 'Release Grip to put the stick away. Staying in contact counts as one hit.'),
  step('finish', 'Ready to explore', 'You’ve played the horn, shaped a chord, and recorded and switched loops.', 'none', [], 'Enter free play to return to your saved workspace, or replay onboarding.'),
]);
