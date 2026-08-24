# Manual XR regression checklist

Use this checklist for every change that can affect WebXR input, scene presentation, models, colliders, transforms, spawning, formations, Stick behavior, Looper behavior, audio, persistence, deletion, or session lifecycle. The Node suite covers pure logic; it cannot validate headset tracking, controller ergonomics, haptics, visual fidelity, or audible output.

Do not mark a section passing from code inspection alone.

## Test record

| Field | Value |
| --- | --- |
| Commit / build |  |
| Date and time |  |
| Tester |  |
| Headset and firmware |  |
| Browser and version |  |
| Controller model |  |
| AR/passthrough or VR |  |
| Host OS |  |
| Serving URL |  |
| Audio output |  |
| Starting storage state | Fresh / migrated v1 or v2 / existing v3 |
| Debug flags changed |  |
| Overall result | PASS / FAIL / BLOCKED |

Use these result codes beside failed or blocked items:

- **PASS** — observed result matches the expectation.
- **FAIL** — behavior is available but wrong; add reproduction steps, console output, and evidence.
- **BLOCKED** — environment/hardware prevented the test; do not count it as passing.
- **N/A** — valid only when the build intentionally does not expose the feature; explain why.

Capture a short video for transform/collider/audio timing failures and a screenshot for visual or restoration failures. Copy relevant browser-console errors without including private certificate data.

## Preconditions

- [ ] Run `npm run verify`; record the exact passing test/check counts or attach the failure output.
- [ ] Serve the repository over HTTPS using a certificate trusted by the headset.
- [ ] Confirm the headset and development machine can reach the same serving URL.
- [ ] Confirm `unpkg.com` is reachable so Three.js, addons, and the note-label font can load.
- [ ] Open remote browser developer tools and keep the console visible during the pass.
- [ ] Back up any scene needed for migration testing before clearing local storage.
- [ ] For a clean run, remove only `face-orchestra:scene:v3`, then reload. Preserve the v2 key for a migration run.
- [ ] Keep both controllers awake and verify handedness is reported correctly.
- [ ] Confirm headset and browser volume are audible. Web Audio must be unlocked by a user gesture.
- [ ] Leave `DEBUG_SHOW_COLLIDERS` off for the primary experience pass. If collider placement fails, repeat the affected section with it enabled and restore the flag afterward.

## Control baseline

The expected Quest-style map is:

| Input | Expected intent |
| --- | --- |
| Right A press/release | Open/confirm spawn menu |
| Grip held + Right A press | Duplicate the actively gripped Honk, Looper, or Metronome; never open the menu |
| Right B press | Contextual Honk formation, Looper, or Metronome lock toggle |
| Left X press | Delete pointed instrument |
| Trigger press/release | Place preview or interact with the current ray target |
| Grip press/release | Cancel menu/preview, transform a pointed body, or equip/unequip Stick when no body is targeted |
| Right thumbstick Y | Scale preview or active grip target |

If the physical map differs, stop and report the input source profile, handedness, button index, expected intent, and actual intent.

## 1. Boot and session lifecycle

- [ ] **Application boot** — Load the root URL with a clean console. Expected: the status overlay appears, local models load, the animation loop starts, there are no unresolved imports or uncaught initialization errors, and an AR or VR entry button is offered when supported.

- [ ] **Desktop fallback** — View the page without entering XR and resize the window. Expected: the opaque fallback environment and lighting render, camera aspect updates, the scene remains responsive, and the status explains whether WebXR is available.

- [ ] **Enter XR** — Enter immersive AR when available, otherwise immersive VR. Expected: the session starts once, controllers/rays appear, passthrough hides the opaque fallback environment when the blend mode permits it, and no duplicate scene or controller roots are created. With a scene containing no Metronome, one default Metronome is placed in front of the user; with a restored Metronome, no extra default is created.

- [ ] **Exit XR** — Exit while the scene contains at least one Honk and one Looper. Expected: exactly one scene snapshot is written, live voices and controller interactions stop, rays/menus/Stick state reset, the desktop fallback returns, and placed instruments are not accidentally deleted from persisted data.

- [ ] **Instruction-panel configuration** — With committed `SHOW_INSTRUCTION_PANEL = false`, expected: no panel is shown and the spawn menu/default Metronome path is immediately available. In a separate configuration-only pass with the flag enabled, aim at the close target and pull Trigger; expected: the panel hides, ray hover/haptic behavior clears, and the default Metronome/spawn menu become available.

- [ ] Exit XR while squeezing a Honk, holding a grip transform, running Looper playback, and/or holding the Stick. Expected: no stuck audio, automation voice, grip, haptic loop, visible Stick, active contact, or hidden ray survives the session boundary.

## 2. Spawn menu, preview, and placement

Use a fresh scene or leave enough space to distinguish each result. Right A opens the menu only after instructions are dismissed.

- [ ] **Open and select parent categories** — With Grip released, hold Right A without waiting for a timer. Expected: the parent ring opens immediately. Use the existing wrist-roll feel to highlight Instruments, Scales, Chords, and Presets in order; confirm the dead zone, direction, dial speed, counter-rotation, and highlight feel remain usable.

- [ ] **Pull toward the viewer in different orientations** — While holding A on each parent, pull only the controller physically toward the headset while facing at least three different room directions. Then keep the controller fixed relative to your body and translate your head/body backward and forward. Expected: the child ring opens from controller motion relative to the headset along the controller's opening normal, not global room Z or shared headset/controller translation. Sideways or away controller motion does not open it, and tracking jitter near the threshold does not flicker between layers.

- [ ] **Inspect both depth phases** — Transition repeatedly between parent and child while viewing the menu obliquely. Expected: pulling into the child phase hides the parent disk and shows only the child disk at its configured 5.5 cm depth layer; pushing back hides the child and restores only the parent. The disks never appear together or as inner/outer coplanar annuli.

- [ ] **Menu depth anchor** — While either layer is active, move the controller left/right and up/down, then pull/push it along the opening menu normal. Expected: the menu follows lateral X/Y controller motion but remains frozen on its opening Z plane; only the child ring's configured depth offset appears, rather than the complete menu moving with the pull gesture.

- [ ] **Return to the parent** — Roll within a child ring, then push the controller away until the parent becomes active. Expected: the child hides below the exit threshold, the parent selection does not jump, and parent wrist roll resumes from the returned orientation. Pull in again and confirm a fresh child roll baseline produces no initial selection jump.

- [ ] **Release semantics** — Release A once while only the parent ring is active and once while a child ring is active. Expected: parent release closes both layers and creates no preview; child release closes both layers and creates exactly the highlighted leaf preview. Press Grip while either layer is open and confirm cancellation creates no preview.

- [ ] **Exercise every menu leaf** — Preview and place Honk, Looper, Metronome; C Major Scale, F Natural Minor Scale, F-sharp Natural Minor Scale; A Minor, E Major, C Major, D Minor; and Quiet, Melody, Bass, Decoration, Still Believe. Expected: every leaf uses the same glass preview and placement path, and no Stick entry appears.

- [ ] **Chord recipes** — Preview all four chords and inspect their left-to-right labels. Expected: A Minor reads `A4 C4 E5`, E Major reads `E3 B4 G#4`, C Major reads `C4 E4 G4`, and D Minor reads `F4 A4 D5`. Every preview contains exactly three separately registered Honks, including the displayed octaves and inversions.

- [ ] **Preset recipes** — Preview all five presets and inspect their left-to-right labels. Expected: Quiet has eight Honks reading `G3 C4 E4 D5 C5 B4 A4 G#4`; Melody has nine reading `G#4 A4 B4 C4 D4 E4 F4 E6 E4`; Bass has four reading `C4 E4 G4 A4`; Decoration has three reading `C4 D4 E5`; and Still Believe has two reading `G#5 A5`. Every member is a separately registered ordinary Honk with no preset entity, persistent membership, or default lock group.

- [ ] **Melody duplicate and two-Honk preview** — Inspect Melody's last four positions and Still Believe's complete preview. Expected: Melody keeps `E4 F4 E6 E4`, including the intentional repeated E4, and Still Believe renders correctly as a two-Honk glass preview.

- [ ] **Single- and multi-Honk preview controls** — For a single Honk and every scale, chord, and preset formation, scale up/down with right thumbstick Y, place with Trigger, then repeat and cancel with Grip. Expected: existing step size, distance, world-transform preservation, independent registration, and all-entity cancellation remain unchanged.

- [ ] **Removed submenu entries** — Inspect the complete Chords and Presets child rings. Expected: G Major and F Major no longer appear under Chords, and C Major 2 Oct no longer appears under Presets.

- [ ] **Spawn basic honk** — Hold Right A, rotate to `Honk`, release A, then pull Trigger to place. Expected: one independent Honk appears at the preview transform with a stable interaction set, note label behavior, normal material, and no preview glass.

- [ ] **Spawn tuned honk** — Choose a tuning-bearing Honk catalog entry such as `C Major Scale`, place it, and inspect one member as the tuned-Honk target. Expected: its label/pitch follows the recipe tuning and ear manipulation clears/changes preset tuning as designed. The current catalog exposes tuned Honks as members of rows; record N/A with justification if a future catalog has no tuning-bearing entry.

- [ ] **Spawn formation recipe** — Place a known triad such as `C Major`. Expected: exactly three separately registered Honks appear at centered configured offsets, each has its own stable ID/performance/audio state, and there is no composite chord scene entity. A scale recipe should create eight independent Honks.

- [ ] **Spawn looper** — Select `Looper`, preview, and place it. Expected: one Looper appears with eight track nodes, transport buttons, Volume and right-hand Gap targets, body grip target, and no active wire. The authored bottom handle remains visible but has no collider or reaction.

- [ ] **Spawn and run metronome** — Select `Metronome`, preview, and place it. Expected: exactly four procedural connection ports appear in debug mode. Trigger the left Play eye, then the right Pause eye. Only the eye targets control transport; Play latches while clicks sound, the pendulum completes one side-to-side cycle every two beats, and Pause immediately restores the authored rest pose. Confirm live BPM changes alter its rate without a phase jump and Volume still works while unlocked.

- [ ] **Repeated Metronome lock texture regression** — Before locking, photograph or inspect the authored Metronome base texture from multiple angles. Press Right B to lock/unlock the same Metronome at least ten times, including while it is running. Expected: its material and authored texture never switch to either Honk atlas, never flash a replacement map, and look identical before, during, and after every toggle.

- [ ] **Metronome lock behavior freeze** — Across the repeated lock/unlock sequence, exercise Play, Pause, BPM, Volume, pendulum motion, all four ports, an existing Looper wire, an existing Honk pulse wire, Grip movement/scale, Grip+Right A duplication, radial preview placement, and deletion of the duplicate. Expected: every behavior remains unchanged; connections and wires remain attached, the original clock phase is not restarted by lock state, and the duplicate keeps its own authored Metronome texture.

- [ ] **Equip stick** — Point away from instrument transform targets and hold Grip. Expected: the Stick attaches to that controller using the configured local transform, the ray hides, its strike collider activates, and it disappears/clears contacts on Grip release.

- [ ] **Cancel spawn preview** — Select any item, then press Grip before placement. Expected: the preview group and every preview entity are removed through lifecycle cleanup, no storage write occurs, the canceled entities are absent from the eventual exit snapshot, no glass material remains, and normal interactions resume.

- [ ] **Scale spawn preview** — Create a multi-Honk preview and step the right thumbstick up and down. Expected: every member scales together once per direction transition, stays within Honk limits, keeps its spacing, and does not drift or place early.

- [ ] **Place spawn preview** — Move/rotate the preview controller, then pull Trigger. Expected: all roots preserve their preview world transforms when attached to the scene, pending flags clear, normal materials/interactions return, no immediate storage write occurs, and the placement persists after exiting XR and reloading.

- [ ] Open the radial menu and press Grip before releasing A. Expected: the menu cancels without creating a preview, then closes cleanly.

- [ ] Begin a preview while a Metronome is running linked Loopers and direct Honk pulses. Expected: ordinary ray/grip/collision interactions pause, but the Metronome clock, linked recording/playback, pulse voices, and both wire types continue through the preview-safe path without timing discontinuity.

- [ ] **Duplicate Honk** — Grip an unlocked Honk, then press Right A without releasing Grip. Expected: exactly one immediate duplicate receives a new stable ID at the same transform, the radial menu and spawn preview remain closed, and Grip transfers to the duplicate so moving the controller peels it away from the unchanged original. Press A again and confirm the newest duplicate—not the original—is copied.

- [ ] **Duplicate Looper** — Grip an unlocked Looper, then press Right A. Expected: exactly one new Looper copies the timeline, Volume, and Gap, with its right Gap handle at the copied position. It starts stopped, unlocked, unarmed, and without copied Honk or Metronome connections, wires, automation, or voices.

- [ ] **Duplicate Metronome** — Grip an unlocked Metronome, then press Right A. Expected: the duplicate copies BPM, Volume, transform, and scale but starts stopped with no connection relationships, wires, beat origin/ordinal, or pulse voices.

- [ ] Hold Grip with no duplicable transform target and press Right A. Expected: the radial menu remains disabled and no instrument or preview is created. Grip release followed by Right A opens the menu normally.

- [ ] **Unrelated control/audio regression** — After the hierarchy pass, verify Left X deletion, Right B lock toggles, ordinary ray interactions, Honk audio, Looper recording/playback, and Metronome timing/controls still behave as documented. Expected: no input remapping, audio change, ray regression, or instrument-specific behavior change. Repeat Grip+A duplication for Honk, Looper, and Metronome.

## 3. Transform targets

Use an unlocked isolated Honk and an unlocked Looper first. Keep the controller ray on the intended body/grip target.

- [ ] **Move honk** — Hold Grip on the Honk body and translate the controller. Expected: only that Honk follows with a stable offset; release commits the transform in memory without writing storage, and XR exit persists it.

- [ ] **Rotate honk** — During the same grip interaction, rotate the controller around multiple axes. Expected: the Honk follows smoothly without a position jump, scale change, or stuck grip after release.

- [ ] **Scale honk** — While gripping the Honk, step the right thumbstick in both directions. Expected: scale changes by configured steps, clamps to Honk min/max, and hit targets/colliders remain aligned.

- [ ] **Move looper** — Grip the Looper body and translate/rotate it. Expected: the Looper follows as one transform target; connected wire endpoints (if present) track the new transform.

- [ ] **Scale looper** — While gripping the Looper, step the right thumbstick. Expected: Looper-specific limits/step apply rather than Honk limits, controls and colliders remain usable, and wires follow.

- [ ] Start a grip on an object, move the ray across another object, and release. Expected: ownership stays with the original transform target until release.

## 4. Honk performance

Use one isolated Honk first so contact-chain behavior does not obscure the result.

- [ ] **Squeeze honk** — Aim at the horn/squeeze target and hold Trigger. Expected: the squeeze morph rises smoothly, one source-specific voice sounds, release returns toward neutral, and repeated press/release does not leak voices.

- [ ] **Bend honk** — While squeezing, roll the controller left and right. Expected: visual bend and pitch bend follow direction, remain clamped, and reset on Trigger release.

- [ ] **Change vowel** — Trigger the mouth target repeatedly. Expected: vowels cycle deterministically through the configured sequence, morph/formants agree, and the selected vowel persists as live state.

- [ ] **Manipulate ears** — Trigger-drag each ear vertically through its range. Expected: the matching ear morph/collider follows, left ear changes pitch control, right ear changes octave control, the note label updates, and the opposite ear does not move.

- [ ] **Manipulate nose** — Trigger-drag the nose vertically through its range while playing the Honk. Expected: the nose collider/morph follows and increasing the control smoothly reduces note loudness toward a still-audible minimum without changing vowel/timbre or pitch. Repeat with Looper automation and a Metronome pulse.

- [ ] **Release all interactions** — Release both Triggers and Grips and move rays off targets. Expected: no active squeeze holder, bend source, ray squeeze, drag, action voice, or haptic remains; latched vowel/ear/nose values may remain by design.

- [ ] Squeeze the same Honk from both controllers, release one, then release the other. Expected: squeeze remains active until the last live source ends and audio does not double-release.

### Controller Honk release de-click acceptance

Run these checks on the target headset and browser with headphones or the normal target audio output. Listen specifically at Trigger release; do not count visual smoothness as evidence that the audio passed.

- [ ] Perform very fast Trigger taps, including taps shorter than one XR frame, with the left controller and then the right controller. Expected: every attack begins immediately and every release is free of a click or abrupt cutoff.
- [ ] Hold long notes and release them with each controller. Expected: the release is smooth and the attack, held timbre, loudness, pitch, formants, and spatial behavior match the `Ver-8` baseline.
- [ ] Perform repeated rapid taps and immediate release/retrigger sequences. Expected: no hard cutoff, doubled or stuck voice, missing retrigger, or accumulating release tail/graph.
- [ ] Repeat the fast-tap, long-note, and retrigger checks on an isolated Honk and on connected Honk chains. Expected: every chain member releases cleanly and remains independently pitched.
- [ ] Repeat controller playing while Looper playback and direct Metronome Honk pulses are active. Expected: controller releases remain click-free while Looper timing/volume and its 35 ms action fade, and Metronome gate timing/volume and its 18 ms release, remain unchanged.

## 5. Contact formations and locks

For precise diagnosis, optionally repeat failures with collider debug visuals. Contact entry requires two qualifying updates; exit requires three separated updates and uses a lower overlap threshold.

- [ ] **Touch two honks** — Grip two Honks so their squeeze colliders overlap and hold them steady. Expected: one graph edge/contact formation appears after debounce; squeezing either Honk performs the touching chain. Small tracking jitter at the boundary should not rapidly toggle membership.

- [ ] **Create chained three-honk formation** — Arrange A touching B and B touching C while A does not touch C. Expected: the formation service treats A, B, and C as one connected component, and targeting any member resolves the full chain.

- [ ] **Lock formation** — Point at a member of the stable three-Honk component and press Right B. Expected: one stable lock relationship is created with all three member IDs, lock visuals apply, and each Honk keeps its own note/performance/Looper identity.

- [ ] Separate colliders after locking. Expected: the group stays locked. Touch a fourth Honk to the group and verify it is not automatically added. Touch two locked groups and verify they do not merge.

- [ ] **Move locked formation** — Grip any locked member and translate/rotate it. Expected: the transform resolver targets the lock-group proxy; every member follows from its saved relative transform with no cumulative drift.

- [ ] **Scale locked formation** — Grip any member and step the thumbstick. Expected: all members scale around the anchor/proxy while preserving configured relative transforms and individual IDs.

- [ ] **Unlock formation** — Point at a member and press Right B. Expected: the relationship and lock visuals clear, each Honk remains independently registered, and subsequent movement affects only the targeted Honk.

- [ ] **Confirm no transform jump** — Compare every member immediately before and after unlock. Expected: positions, rotations, and scales remain visually identical at the unlock frame.

- [ ] Move formerly touching Honks apart and hold for the exit debounce. Expected: the unlocked graph component separates; moving them together again creates a new transient formation without restoring an old lock automatically.

## 6. Stick percussion

Use a scene containing at least one Honk and one Looper. Hold Grip away from transform targets for the entire strike sequence.

- [ ] **Equip stick** — Equip on each controller in turn. Expected: stable controller ownership, one active Stick per controller mapping, correct local transform, hidden ray, and clean transfer/unequip behavior.

- [ ] **Strike every supported target** — Strike a Honk model mesh and a Looper model mesh. Expected: Honk resolves to `boink`, Looper resolves to `hihat`; debug/interactor colliders and note labels do not count as percussion surfaces.

- [ ] **Confirm contact debounce** — Touch and hold the Stick against one target for several seconds. Expected: exactly one strike event. Separate fully and touch again; expected: exactly one new event.

- [ ] **Confirm haptics** — Perform isolated Honk and Looper strikes. Expected: the equipped controller pulses once per accepted contact entry at the configured intensity/duration; cooldown prevents buzzing while contact persists.

- [ ] **Confirm percussion sound** — Listen to both profiles at normal volume. Expected: `boink` and `hihat` are distinct, audible, not clipped, and fire once per accepted contact entry.

- [ ] Move the Stick/target more than the configured user-distance allowance and attempt a strike. Expected: distant geometry does not create a false positive.

- [ ] Release Grip while in contact. Expected: the collider disables, contact IDs clear, no delayed strike fires, Stick presentation hides, and normal ray interaction returns.

## 7. Looper connections, transport, and recording

Use two Metronomes, several Loopers, and at least two Honks. Keep one Looper track visually identifiable throughout replacement and restoration.

- [ ] **Connect honk to looper** — Pull Trigger on an open track node, hold it while aiming the temporary wire at a Honk connector, then release. Expected: the track stores that Honk’s stable ID, a persistent wire appears with the track color, and both endpoints follow transforms.

- [ ] **Replace connected honk** — Start a wire from the same node and release on a second Honk connector. Expected: old automation/action voice clears, the old assignment is replaced rather than duplicated, the wire moves to the second Honk, and only the new ID persists.

- [ ] **Disconnect honk** — Grip the connected Honk and perform the configured shake gesture. Expected: every matching track disconnects after the duration/intensity threshold, wires dispose, automation releases, and cooldown prevents immediate retrigger. If a direct disconnect UI is exposed, verify it produces the same cleanup.

- [ ] Reconnect a Honk, move and scale both endpoints, and observe the wire from short, long, side, and rear angles. Expected: no detached endpoint, stale geometry, or duplicate wire appears; the cable leaves and enters along the socket directions, uses additional smooth spans for longer/sharper routes, and sags downward instead of forming a fixed upward arch.

- [ ] **Draw both Metronome connection types** — Pull Trigger on each of the four Metronome ports and move the ray before releasing. Connect one port to any Looper track node and another to a Honk connector. Expected: a temporary adaptive wire follows every frame, release creates a purple clock/pulse wire, cancellation or an invalid release removes the preview, and the Looper node’s existing track recording/`connectedHonkId` is unchanged.

- [ ] **Reconnect and enforce one incoming clock** — Reconnect one source port to a new target, then connect a second Metronome to the first target. Expected: the old relationship and wire disappear exactly once, the new one replaces it, repeating the identical connection is visually idempotent, and each target has only one incoming Metronome.

- [ ] **Move, rotate, and scale clock endpoints** — Transform both the Metronome and its target Looper/Honk through several scales and orientations. Expected: both wire endpoints and socket directions remain attached with no stale or duplicate geometry.

- [ ] **Start several linked Loopers together** — Connect several recorded Loopers to different ports on one Metronome. Press Play on each between beats. Expected: each shows armed/silent until the next beat, every playhead begins at zero together, and their internal event offsets remain intact rather than snapping each note to a beat.

- [ ] **First-sound recording origin** — With the Metronome running, press Record just after a beat, wait several beats without performing, then squeeze a connected Honk halfway between two beats and stop later. Expected: Record remains armed until the squeeze, the recorded timeline starts at the beat immediately before that squeeze, the first note retains its within-beat offset, and none of the pre-performance wait is included. Repeat with a Stick/percussion onset and press Stop before any sound to confirm clean cancellation.

- [ ] **Independent beat-quantized Looper transport** — While a linked Looper is playing, pause the Metronome between beats. Expected: clicks, pendulum motion, and direct Honk pulses stop immediately, but the Looper continues on the silent clock grid. Press the Looper’s Pause between beats; expected: it keeps playing until the next beat, then silences. Press Looper Play while the Metronome remains off; expected: it waits for the next grid beat and restarts at playhead zero. Restarting the Metronome resumes clicks on the same phase without starting, stopping, or restarting the Looper.

- [ ] **Long-running drift and live BPM** — Let several linked Loopers repeat for at least ten minutes while comparing loop boundaries to clicks. Change BPM several times during playback. Expected: boundaries remain beat-aligned with no accumulating drift, phase stays continuous through BPM changes, and no Looper restarts solely because BPM changed.

- [ ] **Independent Metronomes** — Run both Metronomes at distinct BPM values with different linked Loopers. Expected: each Looper follows only its wired clock; starting/stopping either Metronome has no effect on the other group.

- [ ] **Pulse a touching Honk chord per beat** — Wire a Metronome port to an isolated Honk. Expected: it visibly squeezes and sounds once per beat in addition to the normal click. While the Metronome runs, bring a second Honk into contact with the wired Honk; expected: both Honks visibly squeeze and sound on the pulse, and bending the wired Honk bends both voices while each member retains its own pitch, octave, vowel, and nose note volume. Separate them again and confirm the next pulse returns to the wired Honk alone. Low/high BPM stays discrete and a tracking/frame hitch does not produce a catch-up burst.

- [ ] **Record squeeze** — Connect a track, press Record, squeeze/release the Honk for longer than the minimum action duration, then stop recording. Expected: the track becomes active and playback reproduces squeeze timing plus the configured loop gap.

- [ ] **Record bend** — During recording, squeeze and roll through positive and negative bends. Expected: playback reproduces bend direction/amount and returns to neutral during the loop gap.

- [ ] **Record morph changes** — During recording, change ears, nose, and vowel. Expected: numeric fields interpolate according to timeline sampling, vowel steps deterministically, and clearing playback does not erase the Honk’s direct live state.

- [ ] **Record stick percussion** — While recording, strike the connected Honk and the Looper. Expected: Honk `boink` is recorded on the connected track, Looper `hihat` on the self-percussion track, and playback fires deterministic events once per loop.

- [ ] **Delayed-Stop phrase boundary at 120 BPM** — Set a connected Metronome to 120 BPM (`B = 500 ms`) and Gap 0. Record attacks approximately 100, 1100, and 1600 ms after the launch beat, releasing normally. First press Stop around 2200 ms; repeat the same performance but wait until about 5000 ms, then repeat with a much longer wait. Expected: all takes have the same 2000 ms base/total loop, the same onset list and first-onset phase, and repeated attacks at about 2100, 3100, 3600, 4100 ms onward. Stop remains available throughout the wait and recording never ends merely because the performer is idle.

- [ ] **Release tail and held-note Stop** — Repeat the phrase with a normal/smoothed release after the 2000 ms boundary, then with the final Honk still held when Stop is pressed several beats later. Expected: both base durations remain 2000 ms; the held take receives one safe release, no voice crosses the wrap, and no duplicate release, missing attack, empty track, stuck voice, or catch-up burst occurs.

- [ ] **Exact-beat, single-note, and cross-track boundaries** — At Gap 0, record (a) one attack exactly on a beat, (b) one off-beat attack, (c) simultaneous Honk attacks on multiple tracks, (d) percussion only, and (e) mixed Honk/percussion with the final onset on a different track. Expected: the boundary is always the first beat strictly after the latest onset, never shorter than one beat, and simultaneous attacks do not add another boundary.

- [ ] **Connected first-onset phase and Gap 0–4** — With a Metronome connected, record a phrase whose first onset is visibly/audibly off the launch beat. Play it at Gap 0 through Gap 4. Expected: every repetition keeps that same clock-relative within-beat first-onset offset; the base phrase never changes; Gap 0 adds no silent beat and each higher Gap step adds exactly one whole beat.

- [ ] **Inferred and fallback standalone recordings** — Disconnect the clock and record a clear multi-onset 120 BPM phrase after a short Record-button pre-roll, then wait before Stop. Expected: successful inference trims the first action to time zero, removes Stop-time padding, and at Gap 0 repeats the first note on the beat immediately after the preceding phrase. Record a one-onset/non-inferable phrase separately; expected: the same ordinary pre-roll trim/content-duration fallback remains and no tempo is invented.

- [ ] **Delayed-Stop persistence repair** — Exit XR after making a delayed-Stop phrase, reload, and compare onset phase, base duration, Gap, playback schedule, tracks, and releases. Also load a backed-up older JSON fixture whose beat-aware `recordedDurationMs`/`durationMs` includes Stop-time padding. Expected: round-trip data remains musical-onset-derived and the older padding is repaired without moving real events.

- [ ] **Standalone Play** — Disconnect the Looper clock and press Play from stopped state. Expected: recorded tracks enter playing state immediately, the head animates, and standalone behavior remains independent of any globally playing Metronome.

- [ ] **Stress the mix** — Play several recorded tracks, sustain multiple live Honks, and strike both percussion sounds concurrently. Expected: the shared low-pass retains useful brightness, peak limiting prevents digital crackle/clipping, and the mix remains responsive without pumping or a large loudness jump.

- [ ] **Pause** — Press Pause during playback. Expected: an unconnected Looper pauses immediately. A connected Looper remains audible until the next beat-grid boundary, then its playhead stops, applied automation/action voices release, tracks stop presenting playback, and the transport reports paused.

- [ ] **Standalone resume** — With no Metronome connection, resume through the intended play/resume path. Expected: playback continues from the paused position. With a clock connected, pressing Play after Pause instead arms a restart at playhead zero on the next beat.

- [ ] **Stop** — Press Stop while playing, paused, and recording in separate trials. Expected: transport becomes stopped, voices/layers clear, recording finalizes safely, and invalid/repeated stop does not corrupt timeline state.

- [ ] **Gap lever direction and retired controls** — Spawn a fresh Looper before touching any controls. Expected: both the right-hand Gap handle and its collider begin at the physical bottom endpoint, normalized `-1`/zero beats, rather than at the middle. Drag it to the top/four beats and back; its right-handle up/down morph must agree with collider travel. Confirm the old bottom handle is inert and no Speed control remains anywhere in interaction/debug presentation.

- [ ] **Interact with honk during playback** — While Looper automation plays, squeeze, bend, change a morph, and release. Expected: live squeeze combines by maximum, bend combines additively, direct input remains responsive, and ending live input leaves automation running.

- [ ] Connect playback to a member of an unlocked touching formation. Expected: current contact-chain performance may fan out during playback, but the track persists only the originally connected Honk ID.

## 8. Deletion and cleanup

Use disposable fixtures; do not destroy the scene intended for persistence tests.

- [ ] **Delete connected honk** — Connect and actively automate a Honk, then point at it and press Left X. Expected: all matching tracks disconnect, automation/action/direct voices release, wires dispose, contact/lock state clears, interaction targets unregister, root/resources dispose, registry entry disappears, and the Looper remains usable.

- [ ] **Delete honk in locked formation** — Delete a member of a three-Honk lock group. Expected: the member leaves the graph/group/registry, survivors preserve world transforms, and deleting the anchor reanchors safely. Delete another member; expected: a one-member group dissolves and lock visuals clear.

- [ ] **Delete looper during playback** — Start playback, then delete the Looper with Left X. Expected: recording/playback stops, every automation layer and action voice clears, all connections/wires/targets/view resources dispose, the Looper registry/root disappears, and connected Honks remain interactive.

- [ ] **Delete Metronome connection endpoints** — In separate trials, delete a running Metronome, its linked Looper, and the Honk anchoring a touching-chord pulse. Expected: affected armed/automation/pulse voices and transient squeeze layers on every chord member release immediately, stable relationships disappear, preview/persistent wires dispose once, and unrelated clocks/targets continue.

- [ ] **Delete or unequip stick** — Release Grip to exercise normal unequip; if an instrument-deletion path for Stick is exposed in the tested build, exercise it too. Expected: controller attachment/maps and contact IDs clear, collider disables, resources/targets dispose on deletion, and no late haptic/audio event fires.

- [ ] Delete an instrument currently hovered or gripped by the other controller. Expected: both controller states release their references and no subsequent frame accesses a disposed root.

- [ ] Cancel a multi-entity preview, then inspect the registry and saved scene. Expected: every preview entity is absent and repeated cancellation is safe.

## 9. Persistence and restoration

Create a deliberate fixture: two tuned Honks in a locked group, one separate unlocked touching pair, several Loopers with recorded gesture/percussion, two Metronomes, both Metronome target kinds, non-default Looper controls, and a Stick preference.

- [ ] **Exit-only save** — Note the current `face-orchestra:scene:v3` value, then change instruments and relationships. Expected: storage does not change during those actions. Exit XR once; exactly one write produces plain JSON with `schemaVersion: 3`, stable instrument IDs, canonical transforms/scales, Honk state, complete Looper timelines/Volume/Gap, Metronome BPM/Volume, lock/Looper/Metronome connection IDs, and equipment preference.

- [ ] **Exit during recording** — Start a Looper recording, perform a held squeeze/bend and a percussion hit, then exit XR without pressing Stop. Expected: the final sample and neutral release events are committed, timeline duration is non-zero and normalized, the recording restores and plays fully, and no recording/playing/paused transport flag is stored.

- [ ] **Reload scene** — Reload the page and re-enter XR without clearing storage. Expected: initialization completes without duplicates or uncaught errors and relationship restoration occurs only after all instrument entities exist.

- [ ] **Restore honks** — Compare count, stable IDs, transforms, scales, tuning/note labels, and saved defaults. Expected: every valid Honk restores once; pending previews and transient live squeeze/bend do not restore.

- [ ] **Restore loopers and Metronomes** — Compare counts, stable IDs, transforms, controls, timeline duration/events, BPM/Volume, and stopped state. Expected: all restore once with durable state intact; Loopers are stopped/unarmed and Metronomes stopped regardless of exit-time state, with no stale voice, beat state, or preview wire.

- [ ] **Restore locked groups** — Compare group ID, anchor, members, and relative layout. Expected: lock visuals and transform targeting return; moving/scaling any member moves the restored group without a jump.

- [ ] **Restore looper connections** — Compare `{looperId, trackId, honkId}` records and visible wires. Expected: every valid endpoint reconnects by ID after both entities exist, missing endpoints are skipped, and no direct Honk object is present in saved data.

- [ ] **Restore Metronome connections** — Compare `{metronomeId, portId, targetKind, targetId, targetPortId}` records and recreated purple wires. Expected: relationships restore only after all entities and Looper assignments exist; missing endpoint/port records are skipped without aborting, and no wire mesh or live object appears in JSON.

- [ ] **Confirm unlocked chord formations recalculate from contact** — Reload with an unlocked pair placed in collider overlap. Expected: no unlocked membership exists in JSON; the contact system rebuilds the edge/component from current geometry after its entry debounce. Move them apart and confirm exit recalculation.

- [ ] Inspect `equipment.preferredStickType`. Expected: preference restores without serializing a controller, collider, or world Stick entity.

- [ ] Corrupt or remove one relationship endpoint in a backed-up test payload and reload. Expected: valid instruments restore, the invalid lock/connection is skipped, and restoration continues.

## 10. Legacy migration

Run this section separately with a backed-up storage profile.

- [ ] Place a representative v2 payload under `face-orchestra:scene:v2` with a Looper containing saved `controls.gap` plus the retired control, and no v3 key. Expected: migration occurs only in memory, Gap moves the new right-hand lever to its saved value, the retired value is dropped, and `metronomeConnections` starts empty. XR exit writes the v3 key once.

- [ ] Place a representative v1 payload under `face-orchestra:spawned-instruments:v1` with no newer key, then reload. Expected: Honk/Looper records migrate through v2 to v3 in memory with unique stable IDs and plain transforms/tuning; no write occurs until XR exit, when the v3 key is written once.

- [ ] Confirm migration does not invent lock memberships or Looper connections that were not recoverable from v1. Legacy appearance flags may remain as migration evidence.

- [ ] Provide invalid JSON under a test key/profile. Expected: a warning is logged, boot continues with no restored scene, and the application does not overwrite unrelated storage.

## 11. Final leak and stability pass

- [ ] Repeat enter/exit XR at least three times. Expected: controller roots, event listeners, instruction views, Stick objects, and render loops do not multiply.

- [ ] Perform 20 squeeze press/releases, 20 Stick contacts with full separation, and 10 Looper play/pause cycles. Expected: no increasing delay, stuck voice, repeated haptic, duplicate strike, or console exception.

- [ ] Spawn, cancel, place, transform, and delete each instrument kind while watching the console. Expected: no access to disposed Object3D/material/geometry and no unresolved stable ID.

- [ ] Re-run `npm run verify` after returning debug configuration to its committed values.

## Failure report template

```text
Checklist item:
Result: FAIL | BLOCKED
Build/commit:
Headset/browser:
Starting scene/storage:
Exact steps:
Expected:
Actual:
Frequency: always | intermittent (N/M attempts)
Console output:
Saved payload excerpt (plain data only):
Video/screenshot:
Notes on tracking, network, audio, or certificate state:
```

Never attach private keys, local certificate contents, authentication tokens, or unrelated local-storage data to a failure report.
