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
| Starting storage state | Fresh / migrated v1 / existing v2 |
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
- [ ] For a clean run, remove only `face-orchestra:scene:v2`, then reload.
- [ ] Keep both controllers awake and verify handedness is reported correctly.
- [ ] Confirm headset and browser volume are audible. Web Audio must be unlocked by a user gesture.
- [ ] Leave `DEBUG_SHOW_COLLIDERS` off for the primary experience pass. If collider placement fails, repeat the affected section with it enabled and restore the flag afterward.

## Control baseline

The expected Quest-style map is:

| Input | Expected intent |
| --- | --- |
| Right A press/release | Open/confirm spawn menu |
| Right B press | Contextual Honk formation or Looper lock toggle |
| Left X press | Delete pointed instrument |
| Trigger press/release | Place preview or interact with the current ray target |
| Grip press/release | Cancel menu/preview, transform a pointed body, or equip/unequip Stick when no body is targeted |
| Right thumbstick Y | Scale preview or active grip target |

If the physical map differs, stop and report the input source profile, handedness, button index, expected intent, and actual intent.

## 1. Boot and session lifecycle

- [ ] **Application boot** — Load the root URL with a clean console. Expected: the status overlay appears, local models load, the animation loop starts, there are no unresolved imports or uncaught initialization errors, and an AR or VR entry button is offered when supported.

- [ ] **Desktop fallback** — View the page without entering XR and resize the window. Expected: the opaque fallback environment and lighting render, camera aspect updates, the scene remains responsive, and the status explains whether WebXR is available.

- [ ] **Enter XR** — Enter immersive AR when available, otherwise immersive VR. Expected: the session starts once, controllers/rays appear, passthrough hides the opaque fallback environment when the blend mode permits it, and no duplicate scene or controller roots are created.

- [ ] **Exit XR** — Exit while the scene contains at least one Honk and one Looper. Expected: the scene saves, live voices and controller interactions stop, rays/menus/Stick state reset, the desktop fallback returns, and placed instruments are not accidentally deleted from persisted data.

- [ ] **Dismiss instructions** — Aim at the instruction panel close target and pull Trigger. Expected: the panel hides, ray hover/haptic behavior clears, and the spawn menu becomes available. Re-enter XR and confirm instruction visibility follows the configured session behavior.

- [ ] Exit XR while squeezing a Honk, holding a grip transform, running Looper playback, and/or holding the Stick. Expected: no stuck audio, automation voice, grip, haptic loop, visible Stick, active contact, or hidden ray survives the session boundary.

## 2. Spawn menu, preview, and placement

Use a fresh scene or leave enough space to distinguish each result. Right A opens the menu only after instructions are dismissed.

- [ ] **Spawn basic honk** — Hold Right A, rotate to `Honk`, release A, then pull Trigger to place. Expected: one independent Honk appears at the preview transform with a stable interaction set, note label behavior, normal material, and no preview glass.

- [ ] **Spawn tuned honk** — Choose a tuning-bearing Honk catalog entry such as `Honk C`, place it, and inspect one member as the tuned-Honk target. Expected: its label/pitch follows the recipe tuning and ear manipulation clears/changes preset tuning as designed. The current catalog exposes tuned Honks as members of rows; record N/A with justification if a future catalog has no tuning-bearing entry.

- [ ] **Spawn formation recipe** — Place a known triad such as `C Maj`. Expected: exactly three separately registered Honks appear at centered configured offsets, each has its own stable ID/performance/audio state, and there is no composite chord scene entity. A scale recipe should create eight independent Honks.

- [ ] **Spawn looper** — Select `Looper`, preview, and place it. Expected: one Looper appears with eight track nodes, transport buttons, volume/gap/speed targets, body grip target, and no active wire.

- [ ] **Equip stick** — Point away from instrument transform targets and hold Grip. Expected: the Stick attaches to that controller using the configured local transform, the ray hides, its strike collider activates, and it disappears/clears contacts on Grip release.

- [ ] **Cancel spawn preview** — Select any item, then press Grip before placement. Expected: the preview group and every preview entity are removed through lifecycle cleanup, nothing is saved, no glass material remains, and normal interactions resume.

- [ ] **Scale spawn preview** — Create a multi-Honk preview and step the right thumbstick up and down. Expected: every member scales together once per direction transition, stays within Honk limits, keeps its spacing, and does not drift or place early.

- [ ] **Place spawn preview** — Move/rotate the preview controller, then pull Trigger. Expected: all roots preserve their preview world transforms when attached to the scene, pending flags clear, normal materials/interactions return, and the placement persists after reload.

- [ ] Open the radial menu and press Grip before releasing A. Expected: the menu cancels without creating a preview, then closes cleanly.

- [ ] Begin a preview while a Looper is already playing. Expected: ordinary ray/grip/collision interactions pause during preview, but Looper playback/audio/presentation continues through the preview-safe update path.

- [ ] Duplicate a supported instrument using the existing grip-plus-spawn gesture. Expected: the duplicate receives a new stable ID; a duplicated Looper copies timeline/controls but starts with no copied live connections or wires.

## 3. Transform targets

Use an unlocked isolated Honk and an unlocked Looper first. Keep the controller ray on the intended body/grip target.

- [ ] **Move honk** — Hold Grip on the Honk body and translate the controller. Expected: only that Honk follows with a stable offset; release commits the transform and marks persistence dirty.

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

- [ ] **Manipulate nose** — Trigger-drag the nose vertically through its range. Expected: the nose collider/morph follows, audio formant/nasal character updates without pitch jumps, and release ends the drag.

- [ ] **Release all interactions** — Release both Triggers and Grips and move rays off targets. Expected: no active squeeze holder, bend source, ray squeeze, drag, action voice, or haptic remains; latched vowel/ear/nose values may remain by design.

- [ ] Squeeze the same Honk from both controllers, release one, then release the other. Expected: squeeze remains active until the last live source ends and audio does not double-release.

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

Use a Looper plus at least two Honks. Keep one track visually identifiable throughout replacement and restoration.

- [ ] **Connect honk to looper** — Pull Trigger on an open track node, hold it while aiming the temporary wire at a Honk connector, then release. Expected: the track stores that Honk’s stable ID, a persistent wire appears with the track color, and both endpoints follow transforms.

- [ ] **Replace connected honk** — Start a wire from the same node and release on a second Honk connector. Expected: old automation/action voice clears, the old assignment is replaced rather than duplicated, the wire moves to the second Honk, and only the new ID persists.

- [ ] **Disconnect honk** — Grip the connected Honk and perform the configured shake gesture. Expected: every matching track disconnects after the duration/intensity threshold, wires dispose, automation releases, and cooldown prevents immediate retrigger. If a direct disconnect UI is exposed, verify it produces the same cleanup.

- [ ] Reconnect a Honk, move and scale both endpoints, and observe the wire. Expected: no detached endpoint, stale geometry, or duplicate wire appears.

- [ ] **Record squeeze** — Connect a track, press Record, squeeze/release the Honk for longer than the minimum action duration, then stop recording. Expected: the track becomes active and playback reproduces squeeze timing plus the configured loop gap.

- [ ] **Record bend** — During recording, squeeze and roll through positive and negative bends. Expected: playback reproduces bend direction/amount and returns to neutral during the loop gap.

- [ ] **Record morph changes** — During recording, change ears, nose, and vowel. Expected: numeric fields interpolate according to timeline sampling, vowel steps deterministically, and clearing playback does not erase the Honk’s direct live state.

- [ ] **Record stick percussion** — While recording, strike the connected Honk and the Looper. Expected: Honk `boink` is recorded on the connected track, Looper `hihat` on the self-percussion track, and playback fires deterministic events once per loop.

- [ ] **Play** — Press Play from stopped state. Expected: recorded tracks enter playing state, the head animates, automation/audio starts, and ordinary Play restarts rather than silently resuming an old paused offset.

- [ ] **Pause** — Press Pause during playback. Expected: playhead progression stops, applied automation/action voices release, tracks stop presenting playback, and the transport reports paused.

- [ ] **Resume** — Resume through the intended play/resume path. Expected: playback continues from the paused position without an unintended restart and automation returns cleanly.

- [ ] **Stop** — Press Stop while playing, paused, and recording in separate trials. Expected: transport becomes stopped, voices/layers clear, recording finalizes safely, and invalid/repeated stop does not corrupt timeline state.

- [ ] Drag volume, gap, and speed through their ranges. Expected: controls/morphs track the gesture, values clamp, volume changes mix only, gap changes silent loop spacing, speed changes playback rate, and saved values restore.

- [ ] **Interact with honk during playback** — While Looper automation plays, squeeze, bend, change a morph, and release. Expected: live squeeze combines by maximum, bend combines additively, direct input remains responsive, and ending live input leaves automation running.

- [ ] Connect playback to a member of an unlocked touching formation. Expected: current contact-chain performance may fan out during playback, but the track persists only the originally connected Honk ID.

## 8. Deletion and cleanup

Use disposable fixtures; do not destroy the scene intended for persistence tests.

- [ ] **Delete connected honk** — Connect and actively automate a Honk, then point at it and press Left X. Expected: all matching tracks disconnect, automation/action/direct voices release, wires dispose, contact/lock state clears, interaction targets unregister, root/resources dispose, registry entry disappears, and the Looper remains usable.

- [ ] **Delete honk in locked formation** — Delete a member of a three-Honk lock group. Expected: the member leaves the graph/group/registry, survivors preserve world transforms, and deleting the anchor reanchors safely. Delete another member; expected: a one-member group dissolves and lock visuals clear.

- [ ] **Delete looper during playback** — Start playback, then delete the Looper with Left X. Expected: recording/playback stops, every automation layer and action voice clears, all connections/wires/targets/view resources dispose, the Looper registry/root disappears, and connected Honks remain interactive.

- [ ] **Delete or unequip stick** — Release Grip to exercise normal unequip; if an instrument-deletion path for Stick is exposed in the tested build, exercise it too. Expected: controller attachment/maps and contact IDs clear, collider disables, resources/targets dispose on deletion, and no late haptic/audio event fires.

- [ ] Delete an instrument currently hovered or gripped by the other controller. Expected: both controller states release their references and no subsequent frame accesses a disposed root.

- [ ] Cancel a multi-entity preview, then inspect the registry and saved scene. Expected: every preview entity is absent and repeated cancellation is safe.

## 9. Persistence and restoration

Create a deliberate fixture: two tuned Honks in a locked group, one separate unlocked touching pair, one Looper with at least one connection and recorded gesture/percussion, non-default Looper controls, and a Stick preference.

- [ ] **Save scene** — Perform a persistence-dirtying action and exit XR or wait for maintenance save. Expected: `face-orchestra:scene:v2` contains parseable plain JSON with `schemaVersion: 2`, stable instrument IDs, transforms/state, lock relationships, Looper connection IDs, and equipment preference. It contains no Object3D/audio/function/class serialization.

- [ ] **Reload scene** — Reload the page and re-enter XR without clearing storage. Expected: initialization completes without duplicates or uncaught errors and relationship restoration occurs only after all instrument entities exist.

- [ ] **Restore honks** — Compare count, stable IDs, transforms, scales, tuning/note labels, and saved defaults. Expected: every valid Honk restores once; pending previews and transient live squeeze/bend do not restore.

- [ ] **Restore loopers** — Compare count, stable IDs, transforms, controls, timeline duration/events, and stopped runtime state. Expected: Loopers restore once with no stale action voice or preview wire.

- [ ] **Restore locked groups** — Compare group ID, anchor, members, and relative layout. Expected: lock visuals and transform targeting return; moving/scaling any member moves the restored group without a jump.

- [ ] **Restore looper connections** — Compare `{looperId, trackId, honkId}` records and visible wires. Expected: every valid endpoint reconnects by ID after both entities exist, missing endpoints are skipped, and no direct Honk object is present in saved data.

- [ ] **Confirm unlocked chord formations recalculate from contact** — Reload with an unlocked pair placed in collider overlap. Expected: no unlocked membership exists in JSON; the contact system rebuilds the edge/component from current geometry after its entry debounce. Move them apart and confirm exit recalculation.

- [ ] Inspect `equipment.preferredStickType`. Expected: preference restores without serializing a controller, collider, or world Stick entity.

- [ ] Corrupt or remove one relationship endpoint in a backed-up test payload and reload. Expected: valid instruments restore, the invalid lock/connection is skipped, and restoration continues.

## 10. Legacy migration

Run this section separately with a backed-up storage profile.

- [ ] Place a representative v1 payload under `face-orchestra:spawned-instruments:v1` with no v2 key, then reload. Expected: Honk/Looper records migrate to schema v2 with unique stable IDs and plain transforms/tuning; the v2 key is written.

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
