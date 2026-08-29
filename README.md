# Face Orchestra XR

Face Orchestra is a browser-based WebXR instrument for building music in space. Place expressive horn faces (“Honks”), arrange them into chords, record performances with Loopers, drive the room from one or more Metronomes, and play percussion with a handheld Stick.

This page is the user manual. Developers should use [the architecture document](docs/architecture.md) and [the manual XR regression checklist](docs/manual-xr-regression.md).

## What you need

- A Quest-style headset and controllers for the full experience. The controller map is designed around Meta Quest button names and handedness.
- A WebXR browser with WebGL and Web Audio. Passthrough AR is preferred when available; immersive VR is the fallback.
- A development computer on the same network as the headset.
- Python 3 for the included web servers.
- Node.js 20 or newer only if you want to run the automated checks.
- Internet access when the page loads. Three.js, its browser addons, and the note-label font are loaded from `unpkg.com`.

There are no npm runtime packages to install. The browser import map pins Three.js `0.164.1`.

## Start the app

For a desktop boot and asset check:

```sh
npm run dev
```

Open <http://localhost:5173>. The desktop view can confirm that the scene, assets, lighting, saved scene, and resize handling load. Performing and placing instruments require XR controllers.

## Collider & Motion Editor

The standalone desktop calibration tool loads the current repository metronome configuration into mutable editor state without starting the XR runtime or reading its saved scene:

```sh
npm run dev
```

Open <http://localhost:5173/collider-editor.html>. The large viewport supports orbit, pan, zoom, perspective/orthographic cameras, six fixed camera views, model display modes, and toggles for the grid, axes, model bounds, colliders, and motion paths. Select an item in the viewport or the object list. Use the toolbar or `W`, `E`, and `R` for translate, rotate, and scale; `F` frames the selection. Delete is intentionally blocked for required runtime colliders. Numeric inspector fields provide precise changes alongside TransformControls, and Undo, Redo, Reset selected, and Reset all operate only on the editor state.

Metronome outlet positions are normalized against the loaded model bounds:

```text
actualPosition = boundsCenter + boundsSize * configuredPosition
radius = maxModelDimension * colliderScale
```

Moving or scaling an outlet sphere converts the result back through those same formulas. The inspector also exposes socket-direction arrows and axis presets. Handle previews use the runtime value-to-angle mapping, normalized axis, plane-projected collider offset, imported rest quaternion, and attached collider orbit. Pendulum previews premultiply a fresh axis-angle delta onto the imported rest quaternion. Eye controls preview their configured pressed offsets when their named nodes exist.

Use **Copy JSON**, **Download JSON**, **Import JSON**, or the paste area for a versioned calibration round trip. **Copy JavaScript** generates valid, readable replacement constants with `0xrrggbb` colors for `src/config/metronome.js`; the browser never rewrites that file automatically. Unfinished work autosaves only to `face-orchestra-metronome-editor-v1`, which is separate from the production scene key, and the editor asks before restoring a draft. A local `.glb` can be loaded for re-export checks without presenting its object URL as a repository model path.

The current `metronome_outlets.glb` contains `body_geo`, `L_handle_geo`, `R_handle_geo`, and `pendulum_geo`, but it does not contain the configured `L_button_geo` or `R_button_geo` eye nodes. The editor reports both bindings as missing and leaves them unbound; use their searchable node fields after a corrected GLB is exported.

### Start HTTPS for a headset

WebXR on a headset requires a secure context. The HTTPS server reads two local, Git-ignored files:

```text
certs/localhost.pem
certs/localhost-key.pem
```

Create a certificate trusted by both the computer and headset. For example, with `mkcert`:

```sh
mkdir -p certs
mkcert -install
mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1 ::1 YOUR_LAN_IP
npm run dev:https
```

Open `https://YOUR_LAN_IP:8443` in the headset browser. The headset and computer must share a network, the firewall must allow port `8443`, and the headset must trust the certificate authority. Never commit the certificate or private key.

When XR begins, Face Orchestra restores the last saved scene. If that scene has no Metronome, one Metronome is placed automatically in front of you. More Metronomes can be spawned from the menu.

The optional in-headset instruction panel is currently disabled because `SHOW_INSTRUCTION_PANEL` is `false`. If a developer enables it, close it with Trigger before the automatic Metronome appears and the spawn menu becomes available.

## Quest-style controls

Trigger and Grip work on either hand. Menu, lock, and delete actions have fixed handedness.

| Control | What it does |
| --- | --- |
| Hold **Right A** | Open the category ring. Roll the right controller to choose Instruments, Scales, Chords, or Presets; pull it toward you to open that category's depth-separated item ring. |
| Release **Right A** | On the item ring, confirm the highlighted item and create its placement preview. On the category ring, close without a preview. |
| **Trigger** during preview | Place the preview. |
| **Grip** during menu or preview | Cancel it. |
| Right thumbstick left/right during preview | Scale the entire preview down/up in steps. |
| Right thumbstick down/up during preview | Move the entire preview closer to/farther from the controller in steps. |
| Hold **Grip** on an instrument | Move and rotate it with that controller. |
| Thumbstick left/right on the gripping hand | Scale the current instrument or locked Honk group down/up in steps. |
| **Grip + Right A** | Duplicate the unlocked Honk, Looper, or Metronome being gripped and transfer the grip to the copy. A locked Honk group is not partially duplicated. |
| **Right B** | Lock or unlock the pointed Honk formation, Looper, or Metronome. |
| **Left X** | Delete the pointed instrument and clean up its audio and connections. |
| Hold **Grip** where no transform target is pointed at | Equip the Stick; release Grip to put it away. |

The radial menu is suppressed whenever Grip is active, including a Grip+A duplication. It pulses the right controller when the menu opens, the highlighted parent or child changes, the active depth layer changes, or the menu is confirmed, dismissed, cancelled, or otherwise closed. If placement is cancelled, every instrument in that preview is removed.

## Spawn menu

The radial menu has two depth phases with one ring visible at a time. Keep A held while navigating: roll to select a parent category, pull the controller physically toward the headset to hide the category ring and reveal that category's item ring, then roll from the new baseline to select an item. Push the controller away to hide the item ring and restore the category ring. The categories and items are:

- **Instruments:** Honk (one default F4 Honk), Looper (one eight-track Looper), and Metronome.
- **Scales:** C Major Scale; F Natural Minor Scale; and F-sharp Natural Minor Scale. Each creates its existing eight-Honk row.
- **Chords:** A Minor (`A4 C4 E5`); E Major (`E3 B4 G#4`); C Major (`C4 E4 G4`); and D Minor (`F4 A4 D5`). Each creates a three-Honk row in the listed order.
- **Presets:** Quiet (`G3 C4 E4 D5 C5 B4 A4 G#4`); Melody (`G#4 A4 B4 C4 D4 E4 F4 E6 E4`); Bass (`C4 E4 G4 A4`); Decoration (`C4 D4 E5`); Still Believe (`G#5 A5`); and Metronome 93, which creates one metronome initialized at 93 BPM. The note order and Melody's repeated E4 are intentional.

Scale, chord, and Honk-row preset entries are placement recipes. Their Honks remain independent instruments after placement; you can retune, move, connect, lock, duplicate, or delete them individually. Metronome 93 uses the ordinary metronome placement and persistence path with its initial BPM set to 93. Parent categories are navigation only and releasing A on that ring creates nothing. The Stick is equipment, so it is not shown in the radial menu.

## Play a Honk

Aim at a Honk control and use Trigger:

- **Horn:** hold Trigger to squeeze and sound the Honk. Roll the controller while holding to bend pitch, up to four semitones in either direction. Release Trigger to end the controller-held note with its controller-specific de-click release.
- **Mouth:** press Trigger to cycle through A, E, I, O, and U vowels.
- **Left ear:** hold Trigger and move vertically to tune from five semitones below F through seven semitones above F. Preset rows keep their configured scale tuning until you move the ear.
- **Right ear:** hold Trigger and move vertically to select the octave range from octave 2 through octave 6.
- **Nose:** hold Trigger and move vertically to shape the nose and the note’s gain; the legacy/default nose position preserves full note gain.

The label above each Honk shows the nearest chromatic note and octave, such as `F4`. Ear changes update it immediately.

### Touching and locked formations

When squeeze colliders overlap steadily, touching Honks form a live contact chain. Squeezing any member plays the entire connected chain while each Honk keeps its own pitch, vowel, nose level, and identity. Moving the Honks apart removes the live relationship after a short separation debounce.

Point at a touching member and press Right B to lock the complete connected component. A locked group keeps its member IDs and relative layout even after the colliders separate, and gripping or scaling any member transforms the group. Touching another Honk does not silently add it to an existing locked group. Press Right B on a member again to unlock without moving the Honks.

## Record with a Looper

Each Looper has eight track nodes, four transport buttons, and two controls:

- **Record** starts or arms capture.
- **Stop** finishes recording or stops playback. Pressing Stop again while fully idle clears the recording.
- **Play** starts immediately when unconnected, or arms playback for the next beat when clocked.
- **Pause** pauses immediately when unconnected, or on the next clock beat when clocked.
- **Volume** controls Looper playback level.
- **Gap** chooses 0, 1, 2, 3, or 4 extra whole beats between repetitions. A new Looper starts at Gap 0 with the right-hand Gap handle at its bottom endpoint.

### Connect tracks

Pull Trigger on a track node, aim the temporary wire at a Honk connector, and release Trigger. Reconnecting the same node replaces its previous Honk. The wire follows both endpoints while they move and scale.

To disconnect a Honk from Loopers, Grip the connected Honk and shake it through the configured gesture. Matching track assignments and wires are removed cleanly. Duplicated Loopers copy their controls, scale, and timeline into independent runtime state; track connections are intentionally left disconnected on the copy.

### Record and finish a phrase

A Metronome-connected Looper waits for the first Honk attack or Stick strike, then launches the recording timeline at the beat immediately before that onset. This removes the wait before the performance while preserving the first note’s real position inside its beat. An unconnected Looper starts recording immediately; at Stop it trims the idle time before the first performance action, uses the existing beat detector when a reliable beat can be inferred, and otherwise keeps the ordinary non-tempo fallback.

Stop always remains under the musician’s control. Recording does not automatically stop after the final note, so you may wait and play another note whenever you choose.

When you do press Stop:

- Stop ends capture but does not add trailing silence.
- The base loop boundary is the beat immediately after the final played onset—Honk attack or percussion strike—not the time Stop was pressed.
- A Metronome-connected first note keeps its clock-relative position within the beat on every repetition; an ordinary recording begins at its first performance action.
- Gap 0 adds no extra beat. Gap 1–4 adds exactly that many whole beats.
- Waiting one second or twenty seconds before Stop does not change the finished rhythm.
- A held final Honk is safely released at Stop, but that safety release does not lengthen the phrase.

Recorded attacks, releases, bends, vowels, nose/ear motion, and percussion keep their captured timing apart from the existing small rhythmic-gate correction used by beat analysis.

### Record Stick hits

Strike a connected Honk while its Looper records to place that percussion event on the matching track. Strike the Looper itself to record its self-percussion track. Playback reproduces the hit times deterministically with the recorded Honk gestures.

Locked Loopers can still be triggered from their body to toggle Play/Pause. Right B changes lock state without changing the Looper’s authored normal/locked texture policy.

## Use a Metronome

Every Metronome has:

- a left **Play** eye and right **Pause** eye;
- a left **BPM** handle, adjustable from 30 to 240 BPM;
- a right **Volume** handle;
- a live BPM label;
- a swinging pendulum;
- four independent output ports.

Pull Trigger on a port, aim at any Looper track node or Honk connector, and release Trigger. Each port owns at most one connection, and each target accepts at most one incoming Metronome; making a replacement removes the prior wire.

A Looper follows only its wired Metronome. Multiple Metronomes can run at different tempos without becoming a global clock. A Honk connection pulses that Honk once per beat; any Honks touching it at that moment join the pulse. Frame hitches do not create a catch-up burst.

Pausing a Metronome silences its clicks, stops its pendulum, and releases direct Honk pulses immediately. Its clock phase remains available, so connected Loopers continue on the same silent grid. Changing BPM preserves phase rather than restarting linked playback. Play resumes audible clicks on that phase.

Right B can lock or unlock a Metronome. Lock changes must leave its authored material and texture untouched. Play, Pause, BPM, Volume, ports, wires, duplication, placement, and pendulum behavior remain the same.

## Use the Stick

Hold Grip while pointing away from an instrument transform target. The Stick attaches to that controller and its ray is hidden until Grip is released.

- Strike a Honk for a `boink`.
- Strike a Looper for a `hihat`.

One continuous contact creates one strike and one haptic pulse. Separate the Stick and target before striking again. Stick hits can be recorded by an active Looper as described above.

## Saving and restoring

Face Orchestra saves once when you exit immersive XR. If a Looper is still recording, exit finalizes it through the same Stop path before serialization. The next load restores:

- Honks, Loopers, and Metronomes with stable IDs, transforms, and scales;
- Honk tuning, note defaults, ears, nose, and vowel;
- locked Honk groups and Looper locked appearance;
- Looper timelines, Volume, Gap, Honk track assignments, and wires;
- Metronome BPM, Volume, target connections, and wires;
- the preferred Stick type.

Loopers restore stopped and unarmed. Metronomes restore paused and unlocked. Live Trigger holds, audio nodes, temporary contact formations, menu/placement previews, controller state, pendulum phase, and other transient XR state are not saved.

To clear only the current saved scene during development:

```js
localStorage.removeItem("face-orchestra:scene:v3");
```

## Troubleshooting

- **No Enter AR/VR button:** use a WebXR-capable browser. Desktop browsers without `navigator.xr` can only show the fallback scene.
- **Headset refuses XR over the LAN:** use `https://`, confirm the headset trusts the certificate authority, and open port `8443` on the computer firewall.
- **Blank model or missing note labels:** confirm the headset has internet access and check the console for failed GLB, texture, Three.js CDN, or font requests.
- **No sound:** interact once to allow the browser to start Web Audio, raise the relevant Honk/Looper/Metronome volume, and confirm the headset is not muted.
- **A opens no menu:** release Grip, finish or cancel any active placement, and remember the menu is bound to the right-hand primary button. Pull toward the headset while holding A to enter the item ring.
- **A preview will not place:** use Trigger; Grip cancels it. The right thumbstick changes preview scale.
- **Cannot transform an object:** aim at its body transform target and hold Grip. If no target is selected, Grip intentionally equips the Stick.
- **Looper starts later than expected:** a clocked Play waits for the next beat. A clocked Record waits for the first musical onset. Stop-time waiting should never become a loop gap; use the XR regression checklist if it does.
- **Looper has no tempo when unconnected:** beat inference needs a usable rhythmic pattern. If it cannot infer one, the Looper deliberately keeps its ordinary fallback instead of inventing a BPM.
- **Saved scene did not update:** saving occurs on immersive XR exit, not on each edit. Exit XR cleanly and inspect browser storage for `face-orchestra:scene:v3`.
- **Metronome appearance changes after Right B:** that is a regression. Its map identity should remain authored through repeated lock/unlock; follow the Metronome section of the XR checklist.

For automated checks:

```sh
npm run check
npm test
npm run verify
```
