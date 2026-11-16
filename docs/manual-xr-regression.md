# Manual XR regression checklist

This is the hardware acceptance checklist. [Controls and behavior](controls.md) is the single source for the controller map, menu items, voicings, and musical rules. [Architecture and testing](architecture.md) defines automated test tiers and performance measurements. Old version-specific follow-ups have been folded into the sections below.

Run the affected sections for a focused change; run the complete checklist before a performance or release. Mark PASS only from observed headset behavior. Use FAIL for a mismatch, BLOCKED for unavailable hardware, and N/A only with a reason. Automated Chrome results do not establish tracking quality, haptic feel, audio quality, stereo rendering, or headset frame rate.

## Test record and setup

Record build/commit, date, tester, headset/firmware, browser version, controller profile, AR or VR, audio output, serving URL, storage state, and overall result. Attach console output and a short video for timing/interaction failures.

- [ ] Run `npm run verify` and the relevant browser suites; retain their results.
- [ ] Serve over trusted HTTPS, connect both controllers, unlock Web Audio, and check volume.
- [ ] Verify models, Three.js, addons, and fonts load locally. No CDN connection is required after dependency setup.
- [ ] Export important workspace and recovery data before migration or deletion tests. Use a disposable browser profile for clean-storage tests; Play lives in IndexedDB, not only localStorage.

## Boot and session lifecycle

- [ ] Desktop loads without console errors, handles resize, and shows the expected AR/VR availability.
- [ ] Enter AR and VR where supported. Passthrough hides the opaque environment; controllers, rays, menus, and default/restored Metronome are not duplicated.
- [ ] Exit during a held note, Grip transform, Stick contact, Looper playback, and recording in separate trials. Audio, pending input, haptics, and transient visuals stop; committed work survives.
- [ ] Re-enter repeatedly. Tracking, playback, panel visibility, saved clock connections, and workspace restoration remain usable.
- [ ] Check r187 stereo camera alignment and culling with objects near each eye's view edge. XR shadows are disabled; verify label readability with foveation, AR transparency, and restored desktop shadows after exit.
- [ ] Hide/show/recenter the menu using its controls and left-joystick click. A held input across a mode transition must not accidentally activate the next screen.

## Spawn menu and placement

- [ ] On **both hands**, use Right A / Left Y to open, roll between all five categories, pull toward the headset for children, and push back. Only one ring is visible. Head/body translation alone does not change depth.
- [ ] Test dead zones, oblique viewing angles, different room orientations, labels, and haptic pulses. Inspect all eight chord labels for readability and selection precision.
- [ ] Release on the parent ring: no preview. Release on a leaf: one complete preview. Trigger places it; Grip cancels it. A Trigger already held must be released before placement.
- [ ] Preview and place every scale and chord in [the current catalog](controls.md#spawn-menu). Check pitches and octave voicings by ear and label. Flat scale names may use enharmonic sharp note labels.
- [ ] Place Quiet and Melody; verify their ordered notes, including Melody's repeated E4. Legacy Bass, Decoration, Still Believe, and Metronome 93 are internal recipes, not visible menu requirements.
- [ ] Move preview distance vertically and scale horizontally with the owning thumbstick. One deflection gives one step; limits clamp; all members preserve relative layout. Grip cancellation removes all members, targets, and preview materials.
- [ ] Enter Raag Jog: its lesson scales and Group 1–4 are available. Return to Play: the general three scales/eight chords return on both hands. Repeat with a menu open and after simulation; virtual demonstration controllers must never show spawn menus.
- [ ] Spawn a Honk, Looper, and Metronome. Controls, authored materials, labels, ports, and collider locations match visible models. The Stick is Grip equipment, not a menu leaf.
- [ ] Attempt a second Metronome while one exists or is previewed; creation/duplication is rejected. Cancel/delete the first and confirm a new one can be created.

## Transforms, contacts, and locks

- [ ] Grip each instrument body from different angles; move, rotate, and horizontally scale it. Visible meshes and interaction targets remain aligned. Faces and ports are still reachable.
- [ ] Grip+A/Y duplicates an unlocked Honk or Looper and transfers the grip. Looper data is independent, its copied connections are empty, and no spawn menu opens. Locked groups are not partially duplicated.
- [ ] Touch two and then three Honks. One squeeze plays the connected chain with each member's own pitch/vowel/gain. Separating and rejoining honors contact debounce, including fast moves and scaled parents.
- [ ] Lock the chain with Right B; transform any member. All members retain relative positions. A new touching Honk is not silently absorbed. Unlock preserves world positions.
- [ ] Lock/unlock a Metronome at least ten times while playing. Its authored texture, clock phase, ports, handles, and pendulum remain unchanged and usable.
- [ ] Lock/unlock a Looper. Body Play/Pause remains usable; appearance follows the authored policy.

## Honk sound and expression

- [ ] Aim without Trigger: silence. Hold Trigger before aiming: a note starts on contact. Move between Honks before bend-lock: the old note releases and the new note starts.
- [ ] Bend at least 6° to latch the Honk; move away/across another Honk and return the wrist to neutral. The original note remains held until Trigger release. Holding still alone must not latch.
- [ ] Test both hands, a touching chord, fast taps, repeated notes, long holds, and release during a changing squeeze/bend. The **270 ms live tail** sounds smooth and ends in silence; no click, stuck voice, or doubled attack appears. Compare against the previous 180 ms build if available.
- [ ] Change vowels, tuning, octave, and nose level across their ranges. Note labels and pitch colors follow tuning; original octave-4 and locked textures stay recognizable.
- [ ] Play over Looper automation. Live expression combines correctly and releases without stopping the recorded part. Looper event boundaries retain their shorter fades and timing.
- [ ] In Play, bend dials stay hidden and semitone haptics work. In lessons/recording, target guidance follows the learner; reversals, retries, and turning/final overshoot limits work. Demonstration curves are preserved.
- [ ] Sustain circles and note squares guide timing but never end or lock a live note. Repeated notes retrigger clearly; actual release determines untimed drill assessment.

## Stick percussion

- [ ] Grip empty space to equip on either hand. Rays hide and return correctly on release; gripping a body does not equip a Stick.
- [ ] Strike Honk, Looper, and Metronome for their distinct sounds. One continuous contact gives one hit/pulse; separation rearms it. Fast sweeps do not tunnel or retrigger continuously.
- [ ] Move/scale targets, hit near collider boundaries, and release Grip while touching. No late hit or haptic survives unequip.
- [ ] Record connected Honk hits, Looper self-percussion, and Metronome-body taps. Playback preserves timing, destination, and levels.

## Looper and Metronome relationships

- [ ] Draw, cancel, replace, and reconnect Honk-track cables. Each track retains a stable Honk ID. Wires follow moving/scaling endpoints, socket directions, and short/long routes without duplication.
- [ ] Shake a gripped Honk: remove its direct Looper assignments only. Shake a gripped Looper: remove its incoming clock only and stop scheduled audio safely. Recordings survive; ordinary movement and Metronome shaking do not disconnect.
- [ ] Use all four Metronome ports. Multiple Loopers can share a port; each target retains one clock source. Repeating an identical cable is idempotent; moving one target leaves other cables intact.
- [ ] Wire a Honk directly and touch another Honk to it: the pulse follows the current chain. Separate them and test low/high BPM plus a frame hitch; no catch-up burst occurs.
- [ ] Mute the Metronome: clock, pendulum, and loops continue; recorded wooden taps remain audible. Pause it: connected loops stop safely and retain takes. Resume with the clock running.
- [ ] Change BPM during playback. Phase remains continuous; labels, pendulum rate, and musical timing agree.

## Recording and transport

- [ ] Record after several silent beats, with the first Honk/percussion onset between beats. The timeline begins on the preceding beat and retains the onset offset. Silent cancellation preserves the prior take.
- [ ] Test Manual and 2/4/8/16-beat recording lengths. Manual ends on Stop; fixed lengths keep their full window/rests. Early Stop follows the documented trim policy. Changing the selector does not change a saved take.
- [ ] Record squeeze, bend, vowels, ears, nose, simultaneous voices, and percussion. Final expression/releases are retained at automatic stop and XR exit; the live gesture is not cut off by recording completion.
- [ ] Pause retains a take. Stop finalizes an active recording; Stop on a loaded non-recording Looper clears it. Repeated actions and empty recordings do not corrupt transport state.
- [ ] Queue two Loopers on one output while a third plays on another. Switching waits for the outgoing complete cycle; the other output continues. Cancel queued Play with Pause/Stop and test Start All selection.
- [ ] Test Gap 0 through 4 and mixed 2/4/8/16 lengths. Gap-0 cycles realign every 16 beats. Labels distinguish gap and recorded beats; no retired Speed control responds.
- [ ] Leave several loops running for ten minutes and vary BPM. Record drift, late events, dropouts, and release behavior rather than relying on labels alone.

## Tutorials, songs, and capture

- [ ] Complete representative Basics steps on both hands: expression, scaling, movement, percussion, duplication, connections, Manual recording, and menu hiding. Demonstrate/help must preserve takes and never award learner credit.
- [ ] Complete the Basics finale chord/percussion recordings, bend, and melody. Restart and Exit behave correctly; Play is restored.
- [ ] In Jog, cancel/retry a placement, replace a Looper without renaming surviving roles, place all required groups, and test switch-and-return. Skip/missing-recording feedback stays honest.
- [ ] Sample each song's lessons and full performance, including quick entry and arrangement selection. Wrong/missed/late notes, early release, retries, and navigation must not desynchronize guidance or erase takes.
- [ ] Start/stop a mixed reality take, mark sync/calibration, interrupt a connection, and inspect completion status. Capture includes the intended models/audio; guidance is excluded unless requested. Incomplete takes are identified rather than silently reported as complete.
- [ ] Play back and export a representative capture in the editor. Compare audio, transforms, morphs, textures, labels, and timing with the performance. Repeat capture separately during the density test.

## Deletion, persistence, and recovery

- [ ] Delete a held/hovered Honk, group anchor, playing Looper, and running Metronome. Relevant voices, targets, cables, contacts, and lock memberships disappear; survivors remain usable. A one-member group dissolves.
- [ ] Spawn several Honks with matching labels, change one pitch, and delete a subset. Surviving labels remain intact and retain independent guidance colors/opacity.
- [ ] Cancel multi-entity previews repeatedly. No preview entity/material/temporary input enters a saved scene.
- [ ] In Play, change a scene and wait for the debounced checkpoint. Enter/exit a tutorial and reload: stable IDs, tuning, transforms, locks, connections, takes, controls, and Stick preference restore. Loopers restore stopped and Metronomes paused.
- [ ] Confirm tutorial and recording scenes never overwrite Play. Exit during a recording: its final expression and gate closure persist.
- [ ] Using disposable v1/v2/invalid/future-version fixtures, verify migration, skipped-item reporting, previous-copy recovery, and blocked writes after partial recovery. Original source data must be preserved.
- [ ] Restore an unlocked touching pair and a locked group: only the locked relationship is durable; contact membership recalculates. Missing connection endpoints are reported without preventing valid instruments from loading.

## Density and stability acceptance

- [ ] On the actual headset, measure 8/32/64/128 Honks in idle, playing, moving, and densely touching layouts. Repeat with several wired Loopers and capture on/off. Record CPU phases, GPU timing where available, draw calls, frame intervals/dropped frames, and audio glitches.
- [ ] Use the [bounded live profiler](architecture.md#profile-a-real-scene-without-clearing-it) for a real workspace; stop it after each run. Keep the destructive density benchmark inside its isolated test harness.
- [ ] At 72/90 Hz the total frame budget is about 13.9/11.1 ms. Desktop benchmark numbers do not establish that budget on Quest. Record thermal state and refresh rate; compare repeated runs on the same device.
- [ ] Run repeated spawn/delete and Play/tutorial/simulation cycles. After warmup, geometry/texture/audio-node counts should stabilize, with no growing timers/listeners or stale controllers.
- [ ] For a Three.js upgrade, repeat stereo culling, controller rays/poses, AR transparency, shadows/material appearance, morphs, capture replay/export, context loss/recovery, and resource disposal.

## Failure record

Include the build, device/browser, section, exact reproduction steps, expected/actual result, object counts and scene mode, console output, relevant video/screenshot, and whether a fresh profile reproduces it. Preserve failing scenes/takes before attempting recovery.
