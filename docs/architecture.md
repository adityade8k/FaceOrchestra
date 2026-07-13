# Face Orchestra architecture

This document describes the runtime architecture as implemented. It focuses on ownership, data flow, dependency direction, frame ordering, persistence, and lifecycle behavior. User-facing setup and controls are in the [README](../README.md); hardware regression steps are in the [manual XR checklist](manual-xr-regression.md).

## Domain vocabulary and invariants

Face Orchestra has exactly three instrument kinds:

```text
InstrumentEntity
├── HonkInstrument
├── StickInstrument
└── LooperInstrument
```

These terms are intentionally distinct:

- **Instrument kind** — `honk`, `stick`, or `looper`.
- **Honk tuning** — pitch, octave, note label, and snapping configuration for one Honk.
- **Formation recipe** — a spawn command whose members become independent Honks at configured offsets.
- **Contact formation** — transient runtime state: a connected component in the graph of touching Honk squeeze colliders.
- **Lock group** — a persistent stable-ID relationship with an anchor and member-relative transforms.

There is no chord instrument or composite chord entity. A recipe is not registered or persisted. An unlocked contact formation is recalculated. A lock group persists relationships between otherwise ordinary Honks.

Other invariants:

- Every instrument has a stable ID and an exact kind.
- `InstrumentRegistry` is the only authoritative instrument collection.
- Looper tracks store Honk IDs, never live Honk objects.
- Lock groups store member IDs, never duplicated leader/follower fields on each member.
- Three.js `userData` contains small ownership/role descriptors, not full mutable application state.
- Persistence is versioned plain JSON and contains no Three.js objects, audio nodes, functions, or class instances.
- Direct input and Looper automation remain separate layers until Honk performance resolution.
- The Stick emits events; it never mutates a Looper timeline directly.

## System context

```mermaid
flowchart TD
    Main[main.js] --> App[FaceOrchestraApp]
    Main --> XRButton[ARButton / VRButton]
    App --> Scene[SceneRuntime]
    App --> Scheduler[FrameScheduler]
    App --> Host[RuntimeHost]
    Host --> Registries[Instrument + interaction registries]
    Host --> Domains[Honk / Stick / Looper / formations]
    Host --> XR[XR input + intent + interaction systems]
    Host --> Spawn[Spawn catalog + placement]
    Host --> Audio[AudioSystem]
    Host --> Persistence[ScenePersistence]
    Domains --> Scene
    Domains --> Audio
    Scheduler --> Host
```

`createFaceOrchestraApp` is the composition entry point. It constructs or accepts a `SceneRuntime` and `AudioSystem`, composes a `RuntimeHost`, and returns `FaceOrchestraApp`.

`FaceOrchestraApp` has a deliberately small lifecycle:

- `initialize()` loads runtime assets and restores the saved scene once.
- `start()` starts the scene runtime and installs the renderer animation loop.
- `update(delta, elapsed, now)` advances the frame scheduler.
- `onXRSessionStart()` applies the XR blend mode and starts session UI behavior.
- `onXRSessionEnd()` saves/releases runtime interaction state and restores the desktop environment.
- `endXRSession()` requests session termination when one exists.
- `dispose()` tears down runtime and renderer resources.

`RuntimeHost` is the application-level dependency container and presentation bridge. It constructs the registries and domain services, wires adapters, and exposes behavior-preserving runtime methods grouped by responsibility in `src/app/runtime/`. It does not maintain a second instrument array; `instrumentStates` is a filtered view of `InstrumentRegistry`.

The runtime method slices are:

| Module | Responsibility |
| --- | --- |
| `InstrumentAssetRuntime` | Model/template loading, collider/presentation state creation, note labels, instruction view. |
| `SpawnRuntime` | Radial selection, preview behavior, placement/cancellation, duplication presentation flow. |
| `XRInteractionRuntime` | Semantic intent handlers for ray targets, grip, transforms, morph drags, lock toggles. |
| `HonkPerformanceRuntime` | Live interaction collection, playback advance, performance resolution, morph/audio application. |
| `HonkPresentationRuntime` | Honk visual/morph helpers and note-label presentation. |
| `RelationshipRuntime` | Runtime-facing lock, unlock, group visuals, and transform-following calls. |
| `StickRuntime` | Behavior-preserving Stick model/presentation helpers around the Stick domain services. |
| `LooperConnectionRuntime` | Wire interaction, shake disconnect, wire geometry, and connection presentation. |
| `LooperTransportRuntime` | Looper buttons, controls, record/play calls, and visual state. |
| `LifecycleRuntime` | Controller-state detachment around the central instrument deletion pipeline. |
| `SessionRuntime` | Instruction/session behavior and controller-facing session cleanup. |

## Module ownership

### Application and frame ownership

`src/app/` may compose all other layers. It owns application startup, dependency injection, session entry/exit, and frame orchestration. Domain modules do not import the app.

`FrameScheduler` owns the ordered phase list and ordered callbacks within each phase. Constructors do not hide frame callbacks; `FaceOrchestraApp.configureFramePhases()` is the readable schedule.

### Scene

`SceneRuntime` owns the scene, camera, renderer, resize handling, lighting, desktop fallback environment, XR blend-mode presentation, render call, and renderer disposal.

`AssetRepository` owns cached model, texture-set, and font loading. Asset paths are centralized in `src/config/assets.js`; cloning uses Three.js `SkeletonUtils.clone` to preserve skinned-model behavior.

The scene layer does not interpret controller inputs or own instrument behavior.

### Core instruments

`InstrumentEntity` contains only genuinely shared state and behavior:

- stable `id` and exact `kind`;
- root Object3D and transform access;
- capabilities;
- `created → initialized → disposed` lifecycle;
- interaction-target registration;
- plain transform serialization/restoration;
- detach and disposal hooks.

Default capabilities are:

| Kind | Capabilities |
| --- | --- |
| Honk | `placeable`, `transformable`, `playable`, `morphable`, `chord-capable`, `looper-connectable`, `persistable` |
| Looper | `placeable`, `transformable`, `playable`, `recordable`, `persistable` |
| Stick | `equippable`, `playable`, `collision-driven`, `recordable-source`, `persistable-preference` |

`InstrumentRegistry` owns add/remove/lookup and kind/capability indexes. It resolves an Object3D by walking ancestors and reading only a stable descriptor or registered root. Registry removal emits an event before calling idempotent disposal; this lets relationship subscribers release references while the entity is still available to the removal event.

`InteractionTargetRegistry` stores real handlers and metadata. An Object3D receives only:

```js
{
  targetId,
  ownerId,
  role
}
```

Roles include `honk.body`, `honk.mouth`, `honk.squeeze`, ears, nose, connector, Looper buttons/controls/nodes, and `stick.strike-volume`.

`InstrumentFactory` is a registered creator map for the three exact kinds. `RuntimeHost` injects the shared registries and registers creators for `HonkInstrument`, `LooperInstrument`, and `StickInstrument`. Deserialization preserves the supplied stable ID before relationships are restored.

`TransformTargetResolver` first resolves a source Object3D/entity/ID to its instrument, then asks `FormationTransformResolver` whether that Honk belongs to a lock group, then wraps the result in the appropriate scale profile. A Looper therefore does not inherit Honk scale bounds, and a locked member resolves to the group proxy rather than moving alone.

`InstrumentLifecycleService` coordinates cross-domain cleanup and leaves resource ownership on the entity. It provides deletion results/events and an injectable full-session reset contract.

### Honk

`HonkInstrument` composes:

- root model and stable entity identity;
- tuning from `HonkTuning`;
- semantic interaction targets and squeeze collider;
- `HonkPerformanceState`;
- `MorphTargetController`;
- injected voice service;
- note-label view;
- serialization and owned-resource disposal.

External systems use semantic methods such as `beginSqueeze`, `updateSqueeze`, `endSqueeze`, `setLiveBend`, `clearLiveBend`, `setEar`, `setNose`, `setVowel`, `cycleVowel`, `setAutomationLayer`, and `clearAutomationLayer`.

`HonkPerformanceState` holds live state separately from any number of automation layers. Resolution preserves interaction during playback:

- squeeze sources resolve by maximum rather than replacing each other;
- bend sources combine additively and clamp at the output boundary;
- direct input remains present while automation is active;
- each automation layer can be cleared independently;
- the most recently updated applicable automation layer wins stepped morph/vowel fields.

`HonkColliderFactory` owns the Honk collider construction contract. Its squeeze collider provides a world-sphere accessor consumed by `HonkContactSystem`. Collider dimensions, names, morph names, scale limits, and sensitivities live in Honk/formation configuration.

### Contact formations and lock relationships

`HonkContactSystem` measures every visible, undisposed Honk pair and updates `HonkContactGraph`. The graph is undirected and symmetric. Connected components support chains: if A touches B and B touches C, the formation is `{A, B, C}` even when A and C do not overlap.

Contact state is debounced in `src/config/formations.js`:

| Setting | Current value |
| --- | ---: |
| Entry overlap ratio | `0.20` |
| Exit overlap ratio | `0.14` |
| Consecutive entry updates | `2` |
| Consecutive exit updates | `3` |

The lower exit threshold and longer exit count keep an existing edge alive through small tracking fluctuations. Removing a Honk removes its incident edges and pair debounce state.

`ChordFormationService` is a read-only view over graph components. Returned formation IDs are derived from sorted member IDs and are transient. These memberships are never serialized.

Lock flow:

1. `HonkLockService.lockFormation(honkId)` asks the formation service for the entire connected component.
2. It rejects singletons, missing/disposed Honks, and members already assigned to a group.
3. `HonkLockGroup` receives a stable group ID, stable member IDs, an anchor ID, and captured member-relative transforms.
4. `FormationTransformResolver` returns a group transform proxy for any member.
5. Grip movement changes the anchor transform; `HonkLockService.updateTransforms()` applies the saved offsets to followers.
6. Unlock removes only the relationship, so every root keeps its current world transform.

The implementation uses an anchor/proxy and transform math rather than reparenting model roots. This avoids unsafe scene-parent changes while retaining stable relative transforms.

Lock rules:

- separation does not unlock a group;
- touching an extra Honk does not add it;
- touching two groups does not merge them;
- Looper connections stay on individual member IDs;
- each member keeps its own performance/audio state;
- deleting a member reanchors the survivors when necessary;
- fewer than two members dissolves the group;
- `reset()` unlocks all groups without disposing the reusable service.

### Stick

`StickInstrument` is a first-class equippable entity. It owns controller identity, collider activation, current contact IDs, strike sequencing, event subscription, equipment preference serialization, and idempotent cleanup.

`StickEquipmentSystem` owns controller attachment and the controller↔Stick maps. `StickColliderFactory` owns strike-volume geometry. `StickCollisionSystem` owns motion sampling and contact enter/exit detection. `ThreeStickCollisionAdapter` performs broad-phase bounds checks followed by triangle/box intersection. `StickHapticsAdapter` translates semantic strikes into controller actuator calls with cooldown.

A contact entry emits a frozen event:

```js
{
  type: "stick.strike",
  eventId,
  stickId,
  controllerId,
  targetId,
  percussionType,
  velocity,
  timestamp
}
```

The target-kind profile maps Honk to `boink` and Looper to `hihat`. The Stick remembers the target ID until contact exit, so a resting collider does not retrigger every frame.

`RuntimeHost` subscribes independent consumers to a strike: haptics, percussion audio, and Looper event recording. A Looper hit records to its self-percussion track; a Honk hit records on an actively recording Looper track connected to that Honk ID. The Stick domain never imports Looper timeline code.

The Stick is not a world-persisted entity. Persistence stores only `preferredStickType`.

### Looper

`LooperInstrument` owns or composes:

- `LooperController`;
- `LooperTransport`;
- `LooperTrack` instances;
- `LooperTimeline` and split action/track/event types;
- `LooperGestureRecorder`;
- `LooperGestureApplier`;
- `LooperPlaybackEngine`;
- `LooperConnectionManager`;
- controls, transient wire references, serialization, and cleanup.

The transport state machine has four states: `stopped`, `recording`, `playing`, and `paused`. It validates transitions. Ordinary play restarts; the explicit resume path continues a paused playhead. Recording resets the prior recording; pause is accepted only during playback; stop and reset return to stopped state safely.

Each track has a stable `trackId` and nullable `connectedHonkId`. Connecting validates the ID through an injected registry adapter. Replacing a connection first clears that track’s automation. Disconnecting clears automation/playback state and disposes its wire. Deleting a Honk explicitly disconnects matching tracks before the registry removes the Honk, so the target can still be resolved while automation and action voices are released.

Looper connection interaction is presentation-only until completion:

```text
Trigger on track node
→ create temporary wire
→ update endpoint from ray
→ release over Honk connector
→ validate Honk ID
→ replace/connect track
→ create persistent presentation wire
```

Gripping and shaking a connected Honk can disconnect its matching tracks; thresholds and cooldown live in Looper configuration.

The timeline records sampled Honk action snapshots and deterministic percussion events. Playback applies an automation layer whose ID is derived from Looper and track IDs. `HonkPerformanceState` combines that layer with live input instead of replacing it. Playback can target the current contact component, but persisted assignment remains the one connected Honk ID.

`looperControlMapping.js` maps control values to volume, gap, and speed; it is not an audio engine. Web Audio remains in the audio layer.

### Audio

`AudioSystem` is the facade composed from:

- `AudioContextService` — lazy creation/resume after a user gesture;
- `MasterBus` — input gain, compressor, output gain, destination;
- `HonkVoiceService` and `HonkVoice` — per-ID oscillator/formant/nasal voice behavior;
- `PercussionVoiceService` — Stick percussion voices;
- pitch/formant/audio math modules.

Voice IDs encode the source/controller, stable instrument ID, and Looper automation layer where applicable. This permits targeted cleanup without placing audio nodes in entities or persistence. `AudioSystem.releaseAll()` is the session/application safety net.

No Tone.js dependency is used. Looper controls never reach into audio graph internals; adapters translate resolved domain state into stable AudioSystem calls.

## XR input and intent flow

```text
Gamepad/XR controller
→ XRInputSourceManager: button transitions and axis steps
→ XRIntentMapper: semantic intent
→ XRInteractionCoordinator: explicit controller mode/state and routing
→ RuntimeHost handler
→ registry/domain service/instrument
```

`XRInputSourceManager` is the only layer that reads configured gamepad button/axis indices. It emits hardware-neutral events such as `button.transition` and `axis.step` with stable controller IDs.

`XRIntentMapper` maps these to semantic types such as:

- `spawn.menu.open` and `spawn.menu.confirm`;
- `instrument.delete` and `instrument.scale.step`;
- `interaction.trigger.begin/end`;
- `interaction.grip.begin/end`;
- `context.secondary`.

`XRInteractionCoordinator` owns the queued input boundary and per-controller interaction state. Explicit modes include `IDLE`, `MENU_OPEN`, `SPAWN_PREVIEW`, `RAY_INTERACTING`, `GRIP_TRANSFORMING`, and `STICK_EQUIPPED`. It routes intent to injected handlers; it does not know synth, morph, or timeline internals.

`RaycastSystem` resolves visible hit targets and their instrument owner through the registry. `GripTransformSystem` requests a generic transform target and therefore treats ordinary entities and lock groups uniformly. `HapticsService` owns general raycast feedback; the Stick uses its narrower adapter.

## UX flow routing

| Flow | Route and owner |
| --- | --- |
| Application boot | `main.js` → `createFaceOrchestraApp` → `FaceOrchestraApp.initialize` → controller setup, instruction view, asset loads, two-pass restore → animation loop. |
| Desktop fallback | `SceneRuntime` uses the perspective camera, opaque background, fallback environment, lights, resize listener, and normal render loop. |
| Enter XR | AR/VR button starts the session → `FaceOrchestraApp.onXRSessionStart` sets blend mode → session runtime shows or suppresses instructions. |
| Exit XR | Session event → save current scene → release controller/live interaction state and voices → subsystem resets → `SceneRuntime.resetAfterXR`. Persisted instruments remain for the next session. |
| Dismiss instructions | Trigger raycast resolves the close button → instruction view hides → spawn flow becomes available. |
| Open/select spawn menu | XR input → `spawn.menu.open` → `SpawnMenuController`/radial view; controller orientation selects an entry. A release confirms. |
| Preview/place/cancel | Catalog action creates one entity or several recipe Honks → preview attaches roots to a controller-local group → thumbstick scales → Trigger preserves world transforms and places; Grip/lifecycle cancellation removes preview entities. |
| Spawn formation recipe | `SpawnCatalog` resolves a recipe ID → each `FormationSpawner`/runtime recipe member creates an ordinary Honk with its own stable ID and tuning. |
| Raycast Honk interactions | Ray target descriptor → owning Honk → semantic squeeze/vowel/ear/nose method → performance state; presentation applies morph/audio later in the frame. |
| Grip move/rotate/scale | Ray/grip hit → registry owner → `TransformTargetResolver` → entity or lock proxy → `GripTransformSystem`; relationship phase updates group followers. |
| Contact formation | Collision phase measures squeeze spheres → debounced graph edge changes → `ChordFormationService` derives connected components. |
| Lock/unlock | Right secondary intent on a Honk → full connected component → `HonkLockService`; visual state updates via relationship events. |
| Equip/strike Stick | Grip with no transform hit → equipment service/controller attachment → active collider → collision enter → semantic strike → independent haptic/audio/Looper consumers. Grip release clears contacts and unequips. |
| Connect/replace Looper track | Trigger track node → temporary wire → release on Honk connector → stable ID validation → `LooperConnectionManager.connect`; replacement clears old automation first. |
| Disconnect Looper track | Connection manager explicit disconnect, connected-Honk deletion, or configured grip-shake gesture → clear layer/voice → disconnect ID → dispose wire. |
| Record Honk gestures | Record button → transport recording → automation phase samples live snapshots by connected Honk ID into the track timeline. |
| Record Stick percussion | Strike subscriber finds recording self/connected track → adds a deterministic percussion event through Looper public methods. |
| Play/pause/resume/stop | Looper button → controller → validated transport transition → playback engine/layer application → presentation morphs and audio. |
| Live interaction during playback | XR updates live state while Looper updates its own automation layer; Honk resolution combines both before presentation. |
| Delete instrument | Delete intent → controller references detached → `InstrumentLifecycleService` relationship/audio cleanup → registry removal → entity-owned resource disposal → persistence dirty/save. |
| Restore scene | Store parses/migrates plain JSON → pass 1 creates every stable-ID entity and restores state → pass 2 restores lock groups and Looper connections → equipment preference. |

## Deterministic frame phases

`FRAME_PHASES` and callback registration live in `FrameScheduler.js` and `FaceOrchestraApp.configureFramePhases()`.

| Order | Phase | Current callback behavior |
| ---: | --- | --- |
| 1 | `INPUT` | Record whether a preview already existed; poll XR hardware and enqueue transitions/axis steps. |
| 2 | `INTENT` | Flush queued input through intent mapping and runtime handlers. |
| 3 | `TRANSFORM` | Update scene objects and instruction placement. If previewing, update the preview and advance Looper playback through the preview-safe path. Otherwise update radial menus, hover, active trigger drags, and grip transforms. |
| 4 | `COLLISION` | Update Honk contact graph; sample camera position; update Stick collision/strike events. |
| 5 | `RELATIONSHIPS` | Update Looper follower transforms, locked Honk followers, and shake-disconnect validation. |
| 6 | `AUTOMATION` | Sample active Looper recordings. |
| 7 | `PERFORMANCE` | Collect live Honk interactions, advance Looper playback, resolve live plus automation state, and update Honk/action voices. |
| 8 | `PRESENTATION` | Update Looper morph animations and wires; Honk morph/audio application occurs as part of the performance resolver used by the behavior-preserving runtime. |
| 9 | `MAINTENANCE` | Save the scene only when persistence is dirty. |

Preview mode deliberately short-circuits the remaining normal phases after its transform callback. It explicitly uses a preview-safe Looper playback path before setting `skipRemaining`, which prevents ray/grip/collision side effects while keeping existing loops audible and animated.

The scheduler accepts an `order` within each phase and exposes `describe()` for debugging. A callback can set `skipRemaining` or `skipToPhase`; those controls should remain exceptional and visible in the composition root.

## Persistence architecture

`ScenePersistence` coordinates dirty state, `PersistenceStore`, `SceneSerializer`, and `SceneRestorer`.

Current storage:

```text
schemaVersion: 2
key: face-orchestra:scene:v2
legacy key: face-orchestra:spawned-instruments:v1
```

Conceptual payload:

```js
{
  schemaVersion: 2,
  instruments: [
    { id, kind: "honk", transform, tuning, performanceDefaults },
    { id, kind: "looper", transform, controls, timeline }
  ],
  relationships: {
    honkLocks: [
      { id, memberIds, anchorId, memberLocalTransforms }
    ],
    looperConnections: [
      { looperId, trackId, honkId }
    ]
  },
  equipment: {
    preferredStickType: "default"
  }
}
```

Serialization includes only visible, placed, persistable entities. Stick entities are excluded because their capability is `persistable-preference`, not `persistable`. Unlocked contact formations are excluded because the contact graph is derived from current colliders.

Restore uses two passes:

1. Validate every instrument record, create it with its saved ID, apply transforms, and restore relationship-free entity state. Looper timelines are explicitly deferred.
2. Filter missing/wrong-kind targets, restore valid lock groups, connect valid Looper track/Honk pairs, restore deferred timelines without replacing those ID connections, then restore equipment preferences.

Missing relationship endpoints are skipped rather than failing the whole scene.

The v1 migrator maps legacy components to `honk` or `looper`, creates unique deterministic IDs for that migration run, converts position/quaternion/base scale into a plain transform, moves legacy scale notes into tuning, and marks legacy lock appearance. It cannot reconstruct lock memberships or object-reference Looper connections that the legacy payload did not contain, so it does not invent relationships.

## Lifecycle and deletion

Deletion is coordinated before registry disposal so cross-domain services can still resolve targets.

Honk deletion:

```text
disconnect every matching Looper track while Honk is resolvable
→ clear track automation/action voices and dispose wires
→ remove contact graph node and debounce pairs
→ remove lock membership/reanchor/dissolve as required
→ release injected runtime-owned audio voices
→ registry.remove(..., { dispose: true })
→ Honk releases owned voices, targets, scene attachment, geometry/materials
```

Looper deletion:

```text
registry removal
→ LooperInstrument.dispose
→ stop recording/playback
→ clear applied automation/action voices
→ disconnect tracks
→ dispose wires and owned collider/view resources
→ clear controller/timeline runtime data and targets
→ detach scene root
```

Stick unequip/deletion:

```text
equipment system clears controller maps/attachment
→ Stick clears contact IDs
→ disables collider and emits unequip state
→ disposes owned collider resources and targets
```

Deleting an entity that was already directly disposed still removes the stale registry entry without double-disposal. Deletion and session-reset events are observable for UI/persistence integration.

Ordinary XR exit preserves placed instruments, so it saves the scene and calls interaction subsystem resets rather than deleting the registry. A full `InstrumentLifecycleService.resetSession()` contract is available for cases that intentionally clear all entities; it deletes in Honk→Stick→Looper order, then invokes injected contact, lock, equipment, audio, and external resetters.

## Dependency rules

| Layer | May | Must not |
| --- | --- | --- |
| `app/` | Import and compose every subsystem; inject adapters; schedule phases. | Become a second owner of domain state or hide update order. |
| `xr/` | Read hardware, emit semantic intents, resolve generic targets, request haptics. | Modify synth internals, morph meshes, or Looper timelines directly. |
| `ui/` | Render state and emit/request semantic actions. | Construct or mutate instruments directly. |
| `instruments/honk/` | Own Honk tuning, performance, morph, collider, voice-facing behavior. | Know Quest button names or import XR hardware. |
| `instruments/stick/` | Own equipment, contacts, strike events, haptic adapter boundary. | Write Looper timelines directly. |
| `instruments/looper/` | Resolve Honks by stable ID through an injected adapter; own recording/playback. | Own, serialize, or persist live Honk objects. |
| `instruments/formations/` | Work with Honk IDs, collider measurements, components, and transforms. | Create a chord instrument or persist unlocked membership. |
| `persistence/` | Store/migrate/version plain data; resolve IDs during restore. | Store Three.js objects, Web Audio nodes, mutable runtime state, or class instances. |
| `scene/` | Own renderer environment and assets. | Contain instrument-specific interaction rules. |
| `audio/` | Own Web Audio graph and voices behind stable APIs. | Read XR buttons or own Looper timelines. |
| `spawning/` | Resolve catalog commands, previews, placement, and recipe members through injected creators. | Turn a recipe into a persistent composite instrument. |

Potential cycles are broken with registries and injected adapters. Examples include the Looper adapter resolving Honk IDs, the Stick strike subscriber recording via Looper public methods, and the transform resolver asking a formation service for a proxy.

## Verification strategy

The repository deliberately uses Node’s built-in test runner rather than a browser-heavy framework. Pure tests cover:

- graph edge/component/hysteresis behavior;
- lock membership, transform math, deletion, reset, and serialization;
- live plus automation performance resolution;
- registry and interaction descriptors;
- lifecycle/deletion coordination;
- Stick contact-entry events and percussion routing;
- Looper transport, connections, timeline sampling/events, and JSON round trips;
- schema migration and two-pass persistence;
- pitch mapping.

`scripts/verify-imports.mjs` checks JavaScript syntax, every relative import, forbidden legacy patterns, and local certificate material. It does not instantiate browser-only Three.js modules in Node.

Headset-only behavior remains outside automated verification: XR controller ergonomics, tracking noise, grip/raycast feel, haptic intensity, model collider alignment, passthrough blending, audible mix, and visual morph fidelity. Use [manual-xr-regression.md](manual-xr-regression.md).

## Developer tools

`tools/collider-editor/` is a separate desktop application with its own HTML, CSS, JavaScript, and HTTP server. It may read runtime asset/config files but is not imported by `src/main.js` or any runtime domain. This boundary prevents authoring tools from becoming production dependencies.

Local TLS material belongs under ignored `certs/`. `scripts/serve-https.py` reads it at runtime; no certificate or private key is tracked.

## Larger cohesive files

Several files remain near the repository’s 500-line review guideline:

- `SpawnRuntime` retains the tightly coupled glass-preview, placement, cancellation, duplication, and camera-relative presentation details while delegating canonical selection, recipes, and preview state to the spawning services.
- `LooperTransportRuntime` and `LooperConnectionRuntime` retain the model-specific controls, wire gestures, shake-disconnect presentation, and visual feedback needed to preserve the existing Looper UX. Canonical transport, tracks, connections, recording, and playback remain in the Looper domain.
- `LooperController` is the orchestration boundary for transport, recorder, applier, playback, tracks, and timeline. The underlying concepts are already split into focused modules, so its remaining size reflects the cohesive Looper use-case API.

The former flat runtime binding bridge and generic collider builder were removed. Body-grip construction now belongs to `instruments/core/BodyGripTargetFactory`, Looper geometry belongs to `instruments/looper/LooperColliderFactory`, and other presentation helpers live with Honk, spawning, Looper view, or UI ownership.

These files should still be reviewed when changed. A future extraction is justified when a new independently testable owner appears, not solely to reduce line count.

## Assumptions and intentional follow-up boundaries

- Quest-style A/B/X mappings are preserved because the current UI and runtime target that controller layout. Supporting more hardware should add binding profiles without leaking button names into domains.
- Current model names, morph names, collider transforms, synthesis behavior, and interaction sensitivity are treated as behavior contracts.
- The WebXR visual/audio pass cannot be proven by Node tests; no claim of headset verification should be made without completing the manual record.
- The v1 format cannot provide relationship data it never stored. Migration preserves recoverable entity data and intentionally skips invented relationships.
- Browser imports currently depend on the public `unpkg.com` CDN. Bundling/offline asset vendoring is a separate deployment decision.
- Runtime presentation slices can be reduced further only with a headset regression pass to protect interaction feel. That work is follow-up, not a reason to duplicate old and new architectures.
