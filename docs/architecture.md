# Architecture, performance, and testing

Updated 2026-11-16. The audit recommendations now have an initial implementation: Three.js r187, reduced invisible rendering, change-aware Honk resolution, pooled query/contact data, reusable wire buffers, explicit rendering profiles, live diagnostics, and consolidated test tooling. The original r164 measurements below remain a historical baseline. Headset frame timing, audible release quality, and long-session headset stability still require device testing.

## Implemented changes

Play exposes three scales and eight chords through the existing formation/preview pipeline. Jog lessons select their own catalog; returning to Play restores the general menu on both physical controllers. Virtual demonstration controllers do not receive radial menus. The live Honk release is 270 ms, increased from 180 ms, with its controller fade curve stretched by the same factor. Holding Trigger sustains indefinitely; Looper event-boundary fades retain their timing. See [controls](controls.md) for the musical list.

| Area                | Implementation                                                                                                                                          | Contract and limits                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invisible rendering | Six transparent Honk collider materials now use `visible = false`                                                                                       | Raycast objects remain present and enabled; rendering visibility must not disable interaction or collision.                                                                                                                                                                             |
| Label resources     | [LabelGeometryPool](../src/scene/LabelGeometryPool.js) shares immutable geometry by font, text, size, depth and curve quality                           | Reference counting protects surviving labels. Materials remain private so lesson opacity/color changes do not affect another label. This reduces allocations and geometry memory; it does not batch label draw calls.                                                                   |
| Honk resolution     | [HonkPerformanceResolver](../src/app/runtime/HonkPerformanceResolver.js) owns visual resolution through explicit callbacks                              | `HonkPerformanceState.revision` and `HonkInstrument.presentationRevision` invalidate settled signatures, alongside lock, tuning and label identity. Changed state and unsettled easing continue updating; elapsed frame time and transform-dependent label compensation remain current. |
| Ray queries         | [RaycastSystem](../src/xr/RaycastSystem.js) reuses per-owner target buckets and refreshes queried subtrees instead of whole instrument trees            | Each query reads fresh ancestor/target transforms. Same-frame movement, scale, parent changes, authoritative poses and hit priority remain supported. No frame-number hit cache was introduced.                                                                                         |
| Target membership   | [InteractionTargetRegistry](../src/instruments/core/InteractionTargetRegistry.js) caches owner views and invalidates them on membership changes         | Register/unregister/clear update membership revisions and immutable owner views. Cached membership does not freeze visibility, transforms or target state.                                                                                                                              |
| Wires               | [wireUtils](../src/instruments/looper/view/wireUtils.js) compares endpoint, tangent, geometry identity and settings snapshots before path planning      | Static wires skip planning. Moving wires reuse position/normal buffers while topology is compatible; topology changes replace geometry. Bounds and capture path data update with movement.                                                                                              |
| Contacts            | [HonkContactSystem](../src/instruments/formations/HonkContactSystem.js) and `ContactSweep` reuse candidate/sphere/index/sweep workspaces                | Authoritative world-space spheres are still sampled each update. Entry/separation hysteresis, teleports, disappearing objects and mutable resolver outputs retain their behavior.                                                                                                       |
| Tutorial roles      | [TutorialRoleRegistry](../src/tutorial/TutorialRoleRegistry.js) owns role IDs, provenance, preview/committed binding and deferred percussion assignment | Instrument/session lookups and binding policy are injected. The service is synchronous and clock-free; existing adapter delegates/maps remain compatible. Scene commands and assessment stay in the adapter for later extraction.                                                       |
| Renderer policy     | [rendering config](../src/config/rendering.js) separates desktop and XR settings                                                                        | Desktop keeps DPR cap 2 and shadows. XR keeps framebuffer scale 1, requests foveation 1, and disables shadows. Actual foveation support and acceptable image quality depend on the headset/browser.                                                                                     |
| Diagnostics         | [FrameMetrics](../src/app/FrameMetrics.js) records bounded, opt-in frame samples                                                                        | Captures phase/render/capture CPU durations, scene/render counters, voices and capture queues without clearing the scene. GPU completion and compositor timing are not measured.                                                                                                        |
| Source safeguards   | [architecture rules](../scripts/architecture-rules.mjs) inspect parsed imports and RuntimeHost composition                                              | Application modules cannot import test/server/editor tooling; foundation modules cannot import orchestration. Duplicate runtime mixin methods and duplicate class members fail checks.                                                                                                  |
| Test execution      | [suite registry](../tests/browser/suites.mjs) owns selectors, coverage, cost, environment and shared follow-ups                                         | Batch execution deduplicates shared manual-Honk/presentation checks. CI source/unit and browser jobs run independently, retaining existing coverage.                                                                                                                                    |

A deterministic 128-idle-Honk check skips 11,520 repeated resolver/morph/collider applications over 90 unchanged frames after its initial resolution. This is a work-count assertion, not a headset timing measurement.

The runtime still performs some per-Honk work to preserve transform and interaction correctness. These changes deliberately keep state ownership and musical timing intact; they do not introduce an ECS, global immutable scene snapshot, or second performance state model.

## Ownership and structure

Keep these domain boundaries as further services are extracted:

| Area                                                   | Responsibility                                                                                | Boundary to preserve                                                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app`                                              | App lifecycle, explicit frame phases, dependency construction and runtime coordination        | `RuntimeHost` is the composition root. Extract hot domains as services with explicit dependencies; remaining mixins are checked for collisions. |
| `src/xr`                                               | Hardware input, semantic intents, interaction modes, grip transforms, ray queries and haptics | Hardware input does not own musical state; queries must observe same-frame changes.                                                             |
| `src/spawning`, `src/config/spawning.js`               | Catalogs, radial navigation, preview ownership and placement                                  | Menu visibility is separate from recipe existence; cancellation owns every preview entity.                                                      |
| `src/instruments/core`                                 | Stable IDs, capabilities, registries, admission, entity lifecycle and targets                 | One canonical registry and deletion path; consumers receive narrow interfaces.                                                                  |
| `src/instruments/honk`, `looper`, `metronome`, `stick` | Instrument controls, geometry, audio routing, recording and transport                         | Each instrument owns its state; presentation consumes canonical performance rather than becoming another authority.                             |
| `src/instruments/formations`                           | Contact graph, sweep broad phase, locks and group transforms                                  | Honks stay independent; relationships use IDs rather than a second chord entity.                                                                |
| `src/audio`                                            | Web Audio context, buses, Honk voices, percussion and release ownership                       | Audio scheduling remains independent of visual frame rate.                                                                                      |
| `src/scene`                                            | Renderer, lighting, shared assets, labels and material policies                               | Every resource has an owner; shared geometry cannot be disposed by a single remaining user.                                                     |
| `src/persistence`                                      | Scene serialization, migrations, IndexedDB storage and recovery                               | Tutorial scenes never overwrite Play; partial recovery preserves original data.                                                                 |
| `src/compositions`                                     | Validated, lazy-loaded musical definitions and compilation                                    | New songs use the shared definition/adapter contracts.                                                                                          |
| `src/tutorial`, `src/navigation`, `src/performance`    | Lessons, assessment, mode transitions, demonstrations and recording sessions                  | Separate role binding, scene commands, learner evidence and visual cues incrementally.                                                          |
| `src/capture`, `capture/`, `server/capture`            | Sampling, workers/worklet, replay/editor, receiver and export                                 | Recorder ownership, bounded queues and honest incomplete-take status remain explicit.                                                           |
| `scripts`, `tests`, `.github`                          | Setup, architecture checks, deterministic tests, browser sessions and CI                      | One suite registry and one browser-session owner; test code is not imported by the application.                                                 |

[FrameScheduler](../src/app/FrameScheduler.js) preserves phase order. [InstrumentRegistry](../src/instruments/core/InstrumentRegistry.js), [InstrumentLifecycleService](../src/instruments/core/InstrumentLifecycleService.js), and [resourceOwnership](../src/scene/resourceOwnership.js) retain identity and deletion contracts. [LooperAudioScheduler](../src/instruments/looper/LooperAudioScheduler.js) retains its audio lookahead timer. Large tutorial/runtime modules remain candidates for further extraction, rather than renaming the entire repository.

## Performance evidence

### Historical r164 baseline

Measured before the optimization pass on Apple M4 Pro / ANGLE Metal, headless Chrome 157, Three.js r164, at 1440 × 1050. [Original raw report](benchmarks/scene-density-2026-11-16.json).

| Honks | Reported draw calls | Reported triangles | CPU p95, shadows on | CPU p95, shadows off |
| ----- | ------------------: | -----------------: | ------------------: | -------------------: |
| 8     |                  73 |             83,360 |              3.1 ms |               2.5 ms |
| 32    |                 289 |            333,440 |              4.4 ms |               4.1 ms |
| 64    |                 577 |            666,880 |              5.7 ms |               5.2 ms |
| 128   |               1,153 |          1,333,760 |              5.5 ms |               4.5 ms |

The isolated benchmark uses real assets and the normal frame scheduler, two controller hover rays, an idle Honk grid, 15 warmup frames and 90 sampled frames per case. It toggles shadows. It does not play notes, move instruments continuously, capture a performance, or enter an immersive session. The authored Honk GLB has 6,008 triangles in two primitives; labels and interaction objects added further rendering work in this baseline.

These are CPU update/render-submission times, not GPU completion or headset frame times. One sequential run includes JIT and scheduling noise, so times need not increase monotonically. The r164 render counters do not fully account for shadow passes; counter semantics can differ after a renderer upgrade.

Use `npm run profile:scene` through its isolated temporary browser/storage harness. **Do not invoke the exported density benchmark on a live workspace:** it clears the supplied app scene and changes controller state.

### Optimized r187 desktop comparison

[Optimized raw report](benchmarks/scene-density-optimized-2026-11-16.json), using the same hardware, viewport, grid and sample counts. Compare shadow-disabled counters: r187 includes shadow work in its reported totals, unlike the historical r164 counter behavior.

| Honks | Main-pass calls | Main-pass triangles | Geometries | CPU p50, shadows off | CPU p95, shadows off |
| ----- | --------------: | ------------------: | ---------: | -------------------: | -------------------: |
| 8     |              25 |              48,800 |         52 |               1.5 ms |               2.5 ms |
| 32    |              97 |             195,200 |        196 |               3.1 ms |               3.9 ms |
| 64    |             193 |             390,400 |        388 |               4.5 ms |               5.3 ms |
| 128   |             385 |             780,800 |        772 |               2.7 ms |               6.9 ms |

At 128 Honks, main-pass calls fell from **1,153 to 385 (66.6%)** and triangles from **1,333,760 to 780,800 (41.5%)**. Geometry count fell from 899 to 772. Invisible collider draw suppression accounts for the major call reduction; label sharing reduces geometry allocation. These results combine application changes and the renderer migration, so they do not isolate a Three.js-only gain.

Timing remains noisy: at 128 Honks with shadows disabled, median CPU time fell from 4.1 to 2.7 ms, while p95 rose from 4.5 to 6.9 ms. With shadows enabled, median/p95 changed from 5.0/5.5 to 4.3/4.8 ms. Report the reduced submissions as the measured result; do not claim a consistent frame-time speedup from one run or extrapolate it to the headset.

### Profile a real scene without clearing it

In the application browser's developer console, including remote headset debugging:

```js
const { app } = await import("/src/main.js");
app.startProfiling(600);
// Play, move objects, run Loopers, or record capture normally.
const report = app.stopProfiling();
console.log(JSON.stringify(report));
```

The profiler is disabled by default. Its bounded ring retains the latest samples; the default 600-frame capacity can be changed up to 36,000. Starting again replaces the current sample buffer. Stopping returns a detached report and disables profiling. This API observes the current scene and does not delete instruments, change mode, clear recordings or write a workspace snapshot.

Samples include wall-clock `now` milliseconds, named scheduler-phase durations, `RENDER` and `CAPTURE` CPU durations, instruments, draw calls, triangles, geometries, textures, active/releasing voices, capture queue depth and in-flight bytes. Consecutive `now` values give frame intervals. A running animation loop is required to collect samples; use the browser/device profiler for GPU and compositor information. Diagnostics add overhead, so compare equivalent enabled runs and confirm final behavior with profiling off.

On the actual headset, repeat 8/32/64/128-Honk measurements in idle, playing, moving and densely touching layouts. Add wired Loopers and capture separately, record thermal state/refresh rate, and inspect audio glitches as well as frame misses. At 90 Hz the frame period is 11.1 ms; at 72 Hz it is 13.9 ms. These are total frame constraints, not a CPU-only allowance.

## Three.js migration

The project now pins `three@0.187.0` and retains `WebGLRenderer`. The migration was staged r164 → r174 → r184 → r187, following the official [migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide). The [r187 release](https://github.com/mrdoob/three.js/releases/tag/r187) includes resource-disposal and BatchedMesh fixes; its XR camera transform/projection change is covered by the remaining headset acceptance checklist.

The npm pin, lockfile and generated core/addons are aligned. Setup reads the expected version from the package manifest and clears generated build/addon directories before copying, preventing stale modules after an upgrade. Newer npm packages omit example fonts, so the required Helvetiker font and its license now live under `model/fonts/` and remain local/offline assets. App and editor renderers explicitly use the supported `PCFShadowMap`; the editor attaches `TransformControls.getHelper()` under the new controls API.

Music/menu, shader and presentation checks passed at r174 and r184. At r187, the targeted browser batch covered music, rays, manual Honks, presentation, pitch colors, articulation and capture-server behavior. Full capture/editor integration also passed, including forced reconnect, scrubbing, camera controls and deterministic export. Full immersive AR/VR transitions, stereo culling, headset material quality, real-headset capture parity and sustained sessions remain release acceptance work. Desktop regression success is not a headset performance guarantee.

## Conditional work and remaining standardization

| Follow-up                                            | Why it is conditional                                                                                                                                                                                                                                                                                                      | Acceptance before adopting it                                                                                                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Whole-Honk instancing/batching or label atlas        | [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) needs compatible geometry/materials; [BatchedMesh](https://threejs.org/docs/pages/BatchedMesh.html) groups compatible geometry sharing materials. Independent morphs, pitch tint, locks, picking and capture bindings need a deliberate representation. | Prototype against repeated headset measurements; preserve appearance, independent expression, IDs, replay and resource ownership. Sharing label geometry alone is not draw-call batching. |
| Ray bounds and broader transform caches              | An overly small bound or stale revision can miss a ray after same-frame grip, morph, parent or scale changes. The implemented query path still refreshes transforms.                                                                                                                                                       | Define mutation coverage first; prove conservative bounds and pass locked-volume, connector-priority and same-frame transformation tests. No blanket frame-number cache.                  |
| WebGPU                                               | It changes the renderer path and may change target headset/browser and capture compatibility.                                                                                                                                                                                                                              | Verify supported hardware/browser paths and visual/capture behavior independently; compare against the optimized WebGL implementation.                                                    |
| More tutorial/runtime services and gradual `checkJs` | Honk visual resolution and tutorial role binding are extracted; other orchestration still shares the host.                                                                                                                                                                                                                 | Extract one responsibility at a time with explicit commands, event payloads and units: wall milliseconds, audio seconds and score beats. Preserve scoring and cancellation semantics.     |
| Serialization offloading/chunking                    | Persistence is deferred outside XR callbacks but snapshot serialization is still on the main thread. No measured large-scene serialization bottleneck has been established.                                                                                                                                                | Profile long tasks with representative saved timelines, then split pure snapshot preparation from storage while preserving recovery behavior.                                             |
| Capture sampling reductions                          | Existing bounds protect worker queues, but changing sampling can reduce performance fidelity.                                                                                                                                                                                                                              | Use the new live profiler with capture on/off; preserve musical onset, morph and transform timing and honest incomplete-take status.                                                      |
| Device quality tuning                                | XR foveation and shadow settings have device-dependent benefits and visual costs.                                                                                                                                                                                                                                          | Evaluate labels, peripheral readability, AR transparency and frame misses on the actual headset; adjust the centralized profile from evidence.                                            |

The source-only and desktop work can run locally. Physical-headset acceptance cannot be substituted with headless Chrome and remains outstanding; use [manual XR regression](manual-xr-regression.md) before a live performance or release.

## Test execution and consolidation

The original audit measured 917 unit tests in about 4.3 seconds. Useful musical regressions were retained; new tests cover invalidation, pooled resource ownership, diagnostics, architecture boundaries and suite planning. The maintenance problem was repeated setup and unclear routing rather than unit-test count alone.

[Suite metadata](../tests/browser/suites.mjs) is now the single registry. `--list` displays each suite's coverage, cost and environment. The shared runner owns module loading, progress, timings and isolated browser sessions; existing script wrappers remain compatible while they are migrated incrementally.

```sh
npm run test:music
npm run verify
npm run test:browser -- --list
npm run test:browser -- --batch ports radial
npm run test:compositions:browser -- --full
npm run profile:scene
```

The `ports`, `recording`, `radial` and `tutorial` selectors append the manual-Honk and presentation regressions. A combined batch runs each shared follow-up once, after its requested suites. `TUTORIAL_TEST` remains a compatibility alias; new callers should use direct selectors. `test:guided:browser` and `test:compositions:browser` still refer to the same coverage, so running both is unnecessary.

| Tier                      | When to run                                        | Coverage                                                                                                                                                         |
| ------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused tests             | Edit loop                                          | `test:music`, or `node --test` with the affected domain files.                                                                                                   |
| Source and unit           | Every completed change / PR                        | `verify`: imports/assets/workers, syntax, architecture, lint, formatting and deterministic tests.                                                                |
| Browser smoke             | Initialization, menus and transitions              | Default `test:browser`: 11 musical recipes, cancellation and practice/simulation round trips.                                                                    |
| Targeted browser batch    | Shared runtime/audio/interaction changes           | Select the affected scenarios once, using registry coverage and dependencies.                                                                                    |
| Profile                   | Performance investigation                          | `profile:scene` for isolated comparisons; `app.startProfiling()` for the current desktop/headset scene. Do not impose unstable shared-CI millisecond thresholds. |
| Full behavior and headset | Renderer/transport changes, release or performance | Full compositions/capture scenarios plus the manual checklist.                                                                                                   |

Source verification now parses each file once with the declared ESLint dependency and reuses its AST for syntax and architecture checks, instead of spawning one Node process per file. On the same 476-file working tree, the old checker from HEAD took **10.36 seconds** and the new checker took **0.99 seconds** in a single local comparison. Both passed; the new check also enforces import boundaries and duplicate RuntimeHost methods. This measures the checker stage, not the entire verification pipeline.

CI now has separate source/unit and browser jobs. Browser CI retains capture-server and compositions and adds music smoke; it does not silently reduce coverage. Existing embedded browser scripts can still be converted to `validate(app, options)` incrementally. Preserve distinct cancellation, timing, recovery and musical regressions when table-driving repeated scenarios.

## Validation recorded during implementation

- `npm run verify` passed source/import/architecture, lint, formatting and all **938 unit tests** (about 4.1 seconds for the unit stage).
- r174 and r184 music/shader/presentation checks passed; the r187 targeted batch listed above passed.
- Musical smoke checks covered all 11 tuned recipes, cancellation cleanup, three Play/Jog practice round trips and two simulation round trips.
- Articulation covered 24 Web Audio waveform cases with silent final tails.
- Capture-server checks covered pairing/origin, private paths, durable acknowledgement, restart/resume, flush, sequence and archive handling.
- Radial placement and its manual-Honk/presentation follow-ups passed after the role-service extraction.
- `test:compositions:browser -- --full` passed all six composition entries: Jog setup and five full song demonstrations with guided recordings, exact backing onsets where present, retained takes and restored Play workspaces (about eight minutes).
- Full capture/editor integration passed on r187. A first concurrent run reported an incomplete recording; both later diagnostic recordings finalized normally. Strict gap validation remains in place, with gap reasons included in failure output. Repeat capture under representative device load before performance use.
- Resource lifecycle checks cover real entity deletion and retuning of shared labels; procedural-wire checks cover capture compression and forward/reverse replay after buffer reuse.
- The historical density report retains its original measurements and environment. Updated density results are compared separately rather than overwriting that baseline.

No physical-headset validation or headset performance gain is claimed.
