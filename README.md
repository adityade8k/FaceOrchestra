# Face Orchestra XR

Face Orchestra is a browser-based WebXR musical playground built with Three.js and the Web Audio API. In a headset, you can place expressive horn faces (“Honks”), arrange and lock them into spatial chord formations, record their gestures with Loopers, and strike Honks or Loopers with an equipped Stick.

The runtime has exactly three instrument kinds:

- **Honk** — a placeable, transformable, playable instrument with tuning, morphs, colliders, and its own resolved performance state.
- **Looper** — a placeable recorder/player with tracks, transport, controls, timelines, stable-ID Honk connections, and adaptive spline wires.
- **Stick** — an equippable collision-driven instrument that emits semantic percussion events.

A chord is not an instrument. An unlocked chord formation is a transient connected component derived from touching Honk squeeze colliders. A locked formation is a persistent relationship between ordinary Honks.

For implementation details, see [Architecture](docs/architecture.md). Before merging behavior changes, run the [manual XR regression checklist](docs/manual-xr-regression.md).

## Requirements

- A modern browser with ES modules, WebGL, and Web Audio.
- A WebXR-capable browser/headset for immersive interaction. The current controller map targets Quest-style controllers.
- Python 3 for the included HTTP/HTTPS development servers.
- Node.js 20 or newer is recommended for verification.
- Network access while loading the page. Three.js, Three.js addons, and the note-label font are loaded from `unpkg.com`.

There are currently no npm runtime dependencies to install; the browser import map pins Three.js to `0.164.1`.

## Run locally

For the desktop fallback:

```sh
npm run dev
```

Open <http://localhost:5173>. The desktop view verifies boot, asset loading, fallback lighting/environment, resize behavior, and scene restoration. Full interaction requires XR controllers.

### Run on a headset

Immersive WebXR requires a secure context. The included HTTPS server expects these untracked local files:

```text
certs/localhost.pem
certs/localhost-key.pem
```

Create certificates trusted by both the development machine and headset. One local option is `mkcert`:

```sh
mkdir -p certs
mkcert -install
mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1 ::1 YOUR_LAN_IP
npm run dev:https
```

Then open `https://YOUR_LAN_IP:8443` in the headset browser. Replace `YOUR_LAN_IP` with the development machine’s address on the shared network. The headset must trust the issuing certificate authority; accepting an untrusted warning is not sufficient on every WebXR browser.

Certificates and private keys are ignored by Git. Never commit them.

The entry point prefers immersive AR/passthrough when supported and falls back to immersive VR. Requested optional XR features are `local-floor`, `bounded-floor`, and `dom-overlay`.

## Quest-style controls

Hardware button indices live in [`src/xr/controllerBindings.js`](src/xr/controllerBindings.js). Hardware transitions become semantic intents in `XRIntentMapper` before runtime behavior is invoked.

| Input | Context | Behavior |
| --- | --- | --- |
| Right A, hold | Instructions dismissed, no preview, Grip released | Open the radial spawn menu. Rotate the controller to select. |
| Right A, release | Spawn menu open | Confirm the selected catalog entry and create a translucent placement preview. |
| Grip + Right A press | Actively gripping an unlocked Honk or Looper | Create one immediate duplicate and transfer the active grip to it. The radial menu stays closed. |
| Trigger | Spawn preview active | Place the preview. |
| Grip | Spawn menu or preview active | Cancel the menu or preview. |
| Right thumbstick Y | Preview active | Scale every instrument in the preview one step at a time. |
| Trigger | Honk target | Squeeze, bend, cycle the vowel, or drag an ear/nose target according to the hit target. |
| Grip, hold | Pointing at a transform target | Move and rotate the instrument; a locked Honk resolves to its lock-group transform target. |
| Right thumbstick Y | Grip transform active | Scale the current transform target. Honks and Loopers use separate scale profiles. |
| Grip, hold | No transform target under the ray | Equip the Stick; releasing Grip unequips it. |
| Right B | Pointing at a Honk | Lock its full current contact formation, or unlock its existing group. |
| Right B | Pointing at a Looper | Toggle its lock state. Triggering a locked Looper toggles play/pause. |
| Left X | Pointing at an instrument | Delete the instrument through the lifecycle pipeline. |
| Trigger | Looper button/control/node | Press transport buttons, drag controls, or start a track wire. |
| Trigger release | Track wire aimed at a Honk connector | Connect or replace that track’s stable Honk ID. |

The Stick maps Honk strikes to `boink` and Looper strikes to `hihat`. A persistent contact produces one strike; the objects must separate before the same pair can trigger again.

## Typical session

1. Enter AR or VR and dismiss the instruction panel with its raycast close button.
2. Hold Right A, rotate to a catalog entry, release A, aim the preview, optionally scale with the right thumbstick, and pull Trigger to place.
3. Use Trigger on Honk targets to perform. Hold Grip on an instrument to transform it.
4. Move Honks until their squeeze colliders overlap. Point at a member and press Right B to lock the complete connected formation.
5. Spawn a Looper. Pull Trigger on a track node, aim the temporary wire at a Honk’s connector, and release Trigger.
6. Use the Looper’s record/play/pause/stop buttons and volume/gap/speed controls.
7. Hold Grip away from a transform target to equip the Stick, then strike a Honk or Looper.
8. Exit XR. The current scene is saved, live interactions are released, and XR subsystems reset.

## Spawn catalog and formation recipes

The radial catalog is configured in [`src/config/spawning.js`](src/config/spawning.js). It currently exposes:

- a basic Honk;
- C major, F natural minor, and F-sharp natural minor Honk rows;
- C major, G major, F major, and A minor triad recipes;
- a Looper.

The Stick is a catalog capability but is equipped through Grip rather than placed as a world object.

Formation recipes in [`src/instruments/formations/formationRecipes.js`](src/instruments/formations/formationRecipes.js) are spawn commands. Each member becomes an independent `HonkInstrument`; the recipe itself never enters the instrument registry and is never persisted.

## Architecture at a glance

`src/main.js` creates a `FaceOrchestraApp` from a `SceneRuntime`, `AudioSystem`, and composed `RuntimeHost`. The app initializes assets and persistence, starts the renderer loop, and advances an explicit `FrameScheduler`:

```text
INPUT → INTENT → TRANSFORM → COLLISION → RELATIONSHIPS
      → AUTOMATION → PERFORMANCE → PRESENTATION
```

Core ownership rules:

- `InstrumentRegistry` is the single source of truth for instrument entities.
- `InteractionTargetRegistry` keeps mutable handlers out of Three.js `userData`; scene objects carry only small descriptors.
- `InstrumentFactory` creates exactly `honk`, `stick`, or `looper` entities.
- Honk, Stick, and Looper behavior lives under their respective `src/instruments/` domains.
- Contact formations and lock relationships live under `src/instruments/formations/`.
- XR input emits semantic intent and does not mutate audio nodes, morph meshes, or timelines directly.
- Persistence stores versioned plain JSON and restores entities before relationships.
- `InstrumentLifecycleService` coordinates cross-domain deletion and session reset while each instrument disposes the resources it owns.

See [docs/architecture.md](docs/architecture.md) for module responsibilities, dependency rules, flow routing, persistence shape, and frame-phase details.

## Project layout

```text
src/
├── app/                 composition root, runtime bridge, frame scheduler
├── audio/               Web Audio context, bus, Honk and percussion voices
├── config/              assets and domain-specific tuning/interaction settings
├── instruments/
│   ├── core/            entity, capabilities, registries, factory, lifecycle
│   ├── formations/      Honk contact graph and persistent lock relationships
│   ├── honk/            Honk state, tuning, morphs, colliders
│   ├── looper/          transport, tracks, timeline, recorder, playback, wires
│   └── stick/           equipment, collisions, haptics, percussion mapping
├── persistence/         schema v2, store, serializer, restorer, migrations
├── scene/               renderer, camera, lighting, environment, assets
├── spawning/            catalog, menu, preview, placement, recipe spawning
├── ui/                  instruction and radial-menu views
└── xr/                  hardware input, intent mapping, raycast, grip, haptics

scripts/                 HTTPS server and source/import verification
tests/                  pure Node test suites
```

## Persistence

Scenes use schema version `2` under the local-storage key `face-orchestra:scene:v2`. The payload contains:

- persistable Honks and Loopers with stable IDs and plain transforms;
- Honk tuning/performance defaults;
- Looper controls and timeline data;
- locked Honk groups by member ID and relative transform;
- Looper track connections as `{ looperId, trackId, honkId }`;
- the preferred Stick type.

The browser writes this snapshot once, when the immersive XR session exits. Spawning, deleting, transforming, recording, and adjusting controls only change the in-memory scene during the session. If a Looper is still recording at exit, its last sample and release events are finalized before the snapshot is written.

Looper recordings, controls, locked appearance, and connections persist. Transport state does not: recording, playing, paused, and playback-position data are excluded, so every restored Looper starts stopped. Honk transforms, user-set scale, tuning, ear/nose values, and vowel persist; held squeeze/bend gestures remain transient.

Unlocked contact formations, pending previews, Three.js objects, audio nodes, colliders, wires, and class instances are not serialized. Restoration is two-pass: create all instruments first, then resolve locks and Looper connections by ID, restore deferred Looper timelines, and apply equipment preferences. The v1 migration reads `face-orchestra:spawned-instruments:v1`, assigns stable IDs, and maps legacy components to Honks/Loopers in memory; the next XR exit writes schema v2. Legacy data did not contain recoverable ID-based relationships, so migration cannot invent them.

To clear only the current v2 scene during development:

```js
localStorage.removeItem("face-orchestra:scene:v2");
```

## Verification

```sh
npm run check
npm test
npm run verify
```

- `npm run check` checks JavaScript syntax, resolves every relative import, rejects forbidden legacy architecture patterns, and verifies that local certificate material is absent.
- `npm test` runs the lightweight Node test suites for contact/lock relationships, performance layering, registries/lifecycle, Stick events, Looper transport/timeline/connections/wire paths, the master audio bus, pitch, and persistence.
- `npm run verify` runs both checks in order.

Automated tests intentionally focus on pure domain logic. Rendering, WebXR controller mappings, headset tracking, haptics, spatial collision feel, model morphs, and audible output require the manual headset pass.

## Configuration

- `src/config/assets.js` — central model, texture, and font manifest.
- `src/config/audio.js` — gain, master filtering/limiting, synthesis, and percussion settings.
- `src/config/honk.js` — morph names, collider layout, drag sensitivity, and Honk scale limits.
- `src/config/looper.js` — tracks, controls, collider layout, transport presentation, adaptive wire geometry, and shake-disconnect thresholds.
- `src/config/stick.js` — equipment transform, strike collider, range, and haptics.
- `src/config/formations.js` — contact hysteresis, minimum lock size, and recipe spacing.
- `src/config/spawning.js` — catalog actions and placement defaults.
- `src/config/ui.js` — instruction, label, menu, and thumbstick UI settings.
- `src/config/xr.js` — optional XR features and raycast haptics.
- `src/config/debug.js` — collider/ray visibility and diagnostics.

Keep headset-sensitive values in configuration rather than scattering constants through runtime systems.

## Troubleshooting

- **No XR entry button:** confirm the browser exposes `navigator.xr`, the page is in a secure context, and immersive AR or VR is supported.
- **The headset cannot open the page:** use the machine’s LAN address, allow port `8443` through the firewall, keep both devices on the same network, and verify certificate trust.
- **Models or labels do not load:** inspect the browser console and network panel. Model files are local, while Three.js and the note-label font require access to `unpkg.com`.
- **No sound:** Web Audio starts only after a user gesture. Interact with the spawn menu or an instrument and confirm the browser has not muted the page.
- **Old or unexpected objects restore:** inspect or clear the v2 local-storage key. Preserve a copy first when testing migration behavior.
- **Contact formations flicker:** verify headset tracking and collider placement before changing `src/config/formations.js`; entry and exit already use separate thresholds and frame debounce.
- **A Stick repeats too rapidly:** verify that the collider fully separates from the same target before striking again.

## Manual verification boundary

Run [docs/manual-xr-regression.md](docs/manual-xr-regression.md) on real target hardware after changes to XR input, models, colliders, transforms, audio, spawning, persistence, lifecycle, or Looper behavior. Record headset/browser versions and evidence; a passing Node suite does not replace this check.
