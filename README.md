# Face Orchestra XR

Face Orchestra is a browser-based WebXR instrument for building music in space. Place expressive horn faces (“Honks”), arrange them into chords, record performances with Loopers, drive the room from one Metronome, and play percussion with a handheld Stick.

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

When XR begins, Face Orchestra restores the last saved scene. If that scene has no Metronome, one Metronome is placed automatically in front of you. At most one Metronome can be active, including a pending preview. Delete or cancel it before placing another.

The optional in-headset instruction panel is currently disabled because `SHOW_INSTRUCTION_PANEL` is `false`. If a developer enables it, close it with Trigger before the automatic Metronome appears and the spawn menu becomes available.

## Quest-style controls

Trigger and Grip work on either hand. Right A and left Y open the menu on that hand; lock and delete keep their existing handedness.

| Control | What it does |
| --- | --- |
| Hold **Right A** or **Left Y** | Open the category ring. Roll that controller to choose Instruments, Scales, Chords, or Presets; pull it toward you to open that category's item ring. |
| Release **Right A** or **Left Y** | On the item ring, confirm the highlighted item and create its placement preview. On the category ring, close without a preview. |
| **Trigger** during preview | Place the preview. |
| **Grip** during menu or preview | Cancel it. |
| Owning thumbstick left/right during preview | Scale the entire preview down/up in steps. |
| Owning thumbstick down/up during preview | Move the entire preview closer to/farther from the controller in steps. |
| Hold **Grip** on an instrument | Move and rotate it with that controller. |
| Thumbstick left/right on the gripping hand | Scale the current instrument or locked Honk group down/up in steps. |
| **Grip + Right A / Left Y** | Duplicate the unlocked Honk or Looper being gripped and transfer the grip to the copy. A locked Honk group is not partially duplicated. |
| **Right B** | Lock or unlock the pointed Honk formation, Looper, or Metronome. During Practice, separate melody and percussion Honks can also be locked or unlocked. |
| **Left X** | Delete the pointed instrument and clean up its audio and connections. |
| Hold **Grip** where no transform target is pointed at | Equip the Stick; release Grip to put it away. |

The radial menu is suppressed whenever Grip is active, including duplication. It pulses the initiating controller when the menu opens, selection or depth changes, or the menu is confirmed, dismissed, cancelled or closed. If placement is cancelled, every instrument in that preview is removed.

## Spawn menu

The radial menu has two depth phases with one ring visible at a time. Keep right A or left Y held while navigating: roll to select a parent category, pull the controller physically toward the headset to hide the category ring and reveal that category's item ring, then roll from the new baseline to select an item. Push the controller away to hide the item ring and restore the category ring. The categories and items are:

- **Instruments:** Honk (one default F4 Honk), Looper (one eight-track Looper), and Metronome.
- **Scales:** C Major (the existing eight-Honk row) and Jog Study (`C4 Eb4 E4 F4 G4 Bb4 C5`).
- **Chords:** Group 1 (`C3 G3 C4`); Group 2 (`C3 F3 G3`); Group 3 (`Bb2 C3 G3`); and Group 4 (`G2 C3 C4`).
- **Presets:** Quiet (`G3 C4 E4 D5 C5 B4 A4 G#4`) and Melody (`G#4 A4 B4 C4 D4 E4 F4 E6 E4`). The note order and Melody's repeated E4 are intentional.

Scale, chord, and Honk-row preset entries are placement recipes. Free-play Honks remain independent after placement. During the tutorial, composition chords lock as groups upon placement; a later intentional unlock is respected. Release the menu button to preview on that hand, then press Trigger to place or Grip to cancel. A held Trigger must first be released. Parent categories are navigation only; releasing there creates nothing. Legacy recipes remain available internally for saved scenes. The Stick is Grip equipment and is not shown in the radial menu.

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

Each Looper has eight track nodes, four transport buttons, and three controls:

- **Record** arms capture and latches the selected recording length. Silent waiting consumes no beats.
- **Stop** finishes recording or stops playback. Pressing Stop again while fully idle clears the recording.
- **Play** restarts every eligible recorded Looper connected to the same Metronome on one shared next beat. Unconnected Loopers play independently on their silent internal 70 BPM clock. Pressing exactly on a beat selects the following beat. Recorded offsets and expression remain intact.
- **Pause** pauses immediately when unconnected, or on the next clock beat when clocked.
- **Volume** is the left handle and controls Looper playback level.
- **Gap** chooses 0, 1, 2, 3, or 4 extra whole beats between repetitions. A new Looper starts at Gap 0 with the bottom Gap handle at its down endpoint.
- **Recording length** is the right handle: 2, 4, 8 or 16 beats, bottom to top. New and legacy Loopers default to 16 at the top. The label shows the next take’s setting; changing it never changes a stored take.

### Connect tracks

Pull Trigger on a track node, aim the temporary wire at a Honk connector, and release Trigger. Reconnecting the same node replaces its previous Honk. The wire follows both endpoints while they move and scale.

To disconnect a Honk from Loopers, Grip the connected Honk and shake it through the configured gesture. Only that grabbed Honk’s direct track assignments are removed, including when its formation moves through a group wrapper. Metronome cables and recorded data remain. Gripping and deliberately shaking a Looper removes only its incoming Metronome cable, safely stops its scheduled audio, and retains all Honk assignments and recordings. Shaking the Metronome does neither. Ordinary relocation and jitter are ignored. Duplicated Loopers copy their controls, scale, and timeline into independent runtime state; track connections are intentionally left disconnected on the copy.

### Record and finish a phrase

Record waits for the first Honk attack or Stick strike. The beat at or immediately before that sound becomes beat 1, and the first sound keeps its exact offset. For example, at 60 BPM a first sound at 10.25 seconds with 4 selected beats records the 10.00–14.00 window. Connected Loopers use their running Metronome; disconnected Loopers use the 70 BPM clock. Tempo changes retain continuous beat phase.

Recording stops automatically at the selected endpoint and animates Stop. A completed take keeps the entire 2/4/8/16-beat window, including leading, interior and final rests. Held recorded gates close at the boundary, preserving final expression. The player’s live gesture continues. Natural releases and percussion tails may sound beyond the logical boundary without extending it.

Manual Stop before the endpoint is a shortened-take override. It captures the final held expression and closes the recorded gate, trims waiting before the first and after the final completed event, and preserves interior rests and complete percussion envelopes. Silent cancellation while still armed retains the prior take. An idle Stop after the completion animation clears the take.

At Gap 0, completed takes repeat at their selected beat length from a common absolute origin: 2/4/8/16-beat takes meet again every 16 beats. Gap adds its explicit 0–4 beats; shortened takes and nonzero gaps keep their own cycle lengths. Empty or recording Loopers are excluded from linked Play, which leaves existing playback sounding until the restart boundary. Stop and Pause act on their own Looper.

Save/load preserves the selector separately from the take, and stores explicit fixed-window versus content-trimmed timing. Learner takes survive Practice results and navigation regardless of score. Playback scales the recorded attacks, releases and expression together with tempo. Legacy recordings retain the existing migration policy and receive only the new 16-beat selector default; see [compatibility policy](docs/tutorial.md#clocks-and-compatibility).

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

Only one Metronome is admitted across the active free-play, tutorial or simulation scene. A pending preview reserves its slot. A second creation or duplication shows “Only one metronome can be placed. Use the existing metronome.” A Looper follows its wired Metronome; free play allows any number of Loopers. A Honk connection pulses that Honk once per beat; any Honks touching it at that moment join the pulse. Frame hitches do not create a catch-up burst.

Volume zero silences only automatic clicks: the beat clock, pendulum and synchronized Loopers continue. Recorded Metronome-body stick taps keep their own playback volume. Pause stops the clock’s performance and safely stops connected Loopers; retained recordings can be restarted once the clock runs again. Changing BPM during playback preserves musical phase.

Right B can lock or unlock a Metronome. Lock changes must leave its authored material and texture untouched. Play, Pause, BPM, Volume, ports, wires, placement, and pendulum controls remain available. Metronome duplication is rejected by the singleton policy.

## Use the Stick

Hold Grip while pointing away from an instrument transform target. The Stick attaches to that controller and its ray is hidden until Grip is released.

- Strike a Honk for a `boink`.
- Strike a Looper for a `hihat`.
- Strike the Metronome body for a wooden tap; every connected, actively recording Looper receives it on its clock-cable target track.

One continuous contact creates one strike and one haptic pulse. Separate the Stick and target before striking again. Stick hits can be recorded by an active Looper as described above.

## Saving and restoring

Face Orchestra saves once when you exit immersive XR. If a Looper is still recording, exit finalizes it through the same Stop path before serialization. The next load restores:

- Honks, Loopers, and Metronomes with stable IDs, transforms, and scales;
- Honk tuning, note defaults, ears, nose, and vowel;
- locked Honk groups and Looper locked appearance;
- Looper timelines, recording length, Volume, Gap, Honk track assignments, and wires;
- Metronome BPM, Volume, target connections, and wires;
- the preferred Stick type.

Loopers restore stopped and unarmed. Metronomes restore paused and unlocked. Live Trigger holds, audio nodes, temporary contact formations, menu/placement previews, controller state, pendulum phase, and other transient XR state are not saved.

Legacy scenes with several Metronomes restore the first in saved order and report skipped objects and affected connections. The original storage value stays untouched and autosave is blocked after a partial restore. Recovery data and details are available in `runtime.sceneRestorer.lastReport` / `runtime.scenePersistence.restoreReport`; export the original before deliberately replacing it.

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
- **Looper starts later than expected:** a clocked Play waits for the next beat. A clocked Record waits for the first musical onset. Completed automatic takes retain all selected beats; manual Stop before the endpoint trims idle waiting.
- **Looper is disconnected:** it uses the stable internal 70 BPM grid. Reconnect its Metronome cable to follow the lesson’s 80 BPM clock.
- **Saved scene did not update:** saving occurs on immersive XR exit, not on each edit. Exit XR cleanly and inspect browser storage for `face-orchestra:scene:v3`.
- **Metronome appearance changes after Right B:** that is a regression. Its map identity should remain authored through repeated lock/unlock; follow the Metronome section of the XR checklist.

For automated checks:

```sh
npm run check
npm test
npm run verify
```

The opening **Tutorial** panel teaches and simulates the original **VIRAG 2 — JOG STUDY** composition. See [desktop simulation, headset controls, architecture and verification](docs/tutorial.md).
