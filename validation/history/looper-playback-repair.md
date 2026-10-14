# Looper presentation and playback repair

Baseline: clean `fix/faithful-looper-playback`, local and fetched remote HEAD `a55cf5167ddeaf2ce231719fbe59cbda5dcd3160`. No intervening remote changes. The repair is an uncommitted working-tree diff on that branch.

## Changes and ownership

- `HonkPerformanceSampling`, `HonkPerformanceRuntime`, `HonkPerformanceState`: transient presentation state follows continuous targets directly and decays offsets at discontinuities, membership changes, and release. Rising squeeze clears an old release offset so fast attacks remain distinct. The decay is elapsed-time based (0.18 at 60 Hz). Live processing, canonical capture, resolved musical values and scheduler timestamps remain separate. Recorded release curves remain stored; audio gate semantics remain unchanged.
- `InstrumentAssetRuntime`, `HonkInstrument`, `RuntimeHost`: authored model children sit under an identity presentation group. The root retains its authoritative pulse, preserving procedural colliders and wire sockets; a compensating child scale gives the visible mesh its eased pulse. Body-mesh raycasts and stick tests temporarily use the authoritative morph/scale, restore presentation in `finally`, and skip this work when the poses agree. Authored subtrees, shared geometry/materials, bone hierarchy, instrument roots and grip ownership remain intact. Restore, duplication/new construction, disposal and session teardown initialize/reset transient state; stop and disconnect release through the frame-driven presentation path, including pending-spawn playback.
- `LooperController`: each changed track batches joined targets, starts its current phase once, and reconstructs only its own queued performance events. The shared cursor does not move; percussion is excluded from reconstruction.
- `LooperTrackTimeline`, `LooperPlaybackEngine`: sorted drum, gate, performance and owning-note indexes replace recording-length scans. Scheduled event ownership is a map lookup; arbitrary playhead ownership uses binary search. Queries rebuild after timeline mutation. Visual playback skips drum enumeration when scheduled audio owns delivery; fallback adapters still emit drums.
- `HonkContactGraph`, `LooperGestureApplier`, `RuntimeHost`: revision-invalidated component caches return independent sets. Per-track membership caches share results across presentation and scheduling, while playability is checked on each use. Adapters without revision support recompute safely. Layer/note/target generation indexes include queued and releasing voices and are removed together on prune/cancel/cleanup.
- `HonkVoiceService`: future vowel requests are coalesced against their projected sequence, including out-of-order insertion. Genuine A→E→A changes retain timestamps. Redundant points are retained only until their scheduled time so later insertion can restore a required return; callbacks are cleared on cancellation or release completion.
- `HonkContactSystem`: copy each candidate sphere once per collision update, including mutable resolver centers. Pair count, overlap thresholds and entry/exit hysteresis are unchanged.

No dependency, renderer-quality, recording-fidelity, or wire-geometry change is included. Larger wire changes remain contingent on a representative profile. All caches and presentation state stay out of saved JSON.

## Automated and desktop validation

- `npm run check`: 144 source files passed syntax, relative-import and architecture checks.
- `npm test`: 347 tests, 346 passed, one unchanged baseline failure in `tests/instruments/metronome/MetronomeHandleRig.test.js:43` (configured −80, expected −90). The unrelated configuration/test was not modified.
- New tests cover the eight-track/eight-follower percussion regression and queued ends; separate contact components; stable-cache operation counts and playability changes; same-time end/start/gesture ownership, mutation/normalization/restore/wrap; graph-copy invalidation and mutable sphere snapshots; 60/72/90/120 Hz release plus dropped frames, continuous/live gestures, rapid attacks, actual presentation runtime isolation, and interaction-pose restoration; projected vowels and cancellation.
- Existing faithful playback, phrase, clock/metronome, contact lifecycle, automation integrity, pending-spawn, asynchronous start and prequeued-release tests pass.
- `verify-looper-traces.mjs`: all 26,746 start/update/release/cancel/percussion adapter calls are identical to `a55cf51` across eight unaffected scenarios (1/10-second loops, 1/8 tracks, 1/8 contact members), including loop seams.
- Headless desktop Chrome loaded the real model and pinned Three.js 0.164.1. Release rendered squeeze 0.8200000000000004 while authoritative squeeze/bend were zero; visual scale compensation was 1.0287 at root scale 2.5. Collider sphere and socket world coordinates matched before/during authoritative interaction pose. All 81 grid raycasts matched the authoritative mesh (55 intersections). A render completed with 10 geometry resources and 10 draw calls. This is a geometry/render smoke check, not a frame-time or headset profile.

Browser smoke check: start `npm run dev`, open the application, and run `(await import("/scripts/validate-honk-presentation-browser.mjs")).validate()` in DevTools. It creates an isolated application with memory-only storage, validates the real model, then disposes it.

## Reproducible CPU benchmark

Run `node scripts/benchmark-looper-playback.mjs <repository-root> 5`. Use separate checkouts or `git archive` extracts for `e6497e7` and `a55cf51`; the same fixture imports each version’s actual controller, graph, timeline and applier. Run `node scripts/verify-looper-traces.mjs <a55-checkout>` for trace equivalence. The scripts are opt-in and never imported by the app.

Environment: Node v24.7.0, macOS arm64. Each case stores combined gesture snapshots at 90 Hz, two gates pairs/second, 300 ms notes and 200 ms rests. Three simulated seconds merge 90 presentation updates/second and 40 scheduler ticks/second; the first second warms up. Results are the median of five repetitions of measured playback-method CPU, divided by the two measured seconds. Setup/index construction is excluded. Versions were run in separate processes; JIT/order and system load affect absolute times. Adapters count calls without real audio nodes or rendering. These are CPU ms per simulated second, not FPS, acoustic quality or CI thresholds.

| Recording seconds | Tracks | Component members | e6497e7 | a55cf51 | Fix |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 1 | 1 | 1.18 | 1.40 | 0.60 |
| 10 | 1 | 8 | 1.45 | 1.64 | 0.68 |
| 10 | 8 | 1 | 3.77 | 4.03 | 2.51 |
| 10 | 8 | 8 | 5.26 | 7.13 | 4.31 |
| 60 | 1 | 1 | 1.64 | 1.93 | 0.23 |
| 60 | 1 | 8 | 1.95 | 2.21 | 0.46 |
| 60 | 8 | 1 | 13.75 | 15.00 | 1.83 |
| 60 | 8 | 8 | 15.80 | 17.91 | 3.45 |
| 120 | 1 | 1 | 3.11 | 3.54 | 0.21 |
| 120 | 1 | 8 | 3.45 | 3.88 | 0.45 |
| 120 | 8 | 1 | 24.33 | 27.52 | 1.77 |
| 120 | 8 | 8 | 25.63 | 30.78 | 5.51 |

Join fixture: eight tracks, 0–500 ms holds, snapshots every 10 ms, one self-percussion event at 150 ms; shared audio horizon at 220 ms, eight followers join at 110 ms. Counts include the current-phase start entries. Split is measured separately at 115 ms.

| One join update | a55cf51 | Fix |
| --- | ---: | ---: |
| Range calls | 64 | 8 |
| Scheduled-entry visits | 5696 | 96 |
| Joining voice starts | 64 | 64 |
| Audio update calls | 3232 | 768 |
| Additional percussion triggers | 64 | 0 |

Median join CPU: 4.843 → 0.386 ms. Median split CPU: 0.161 → 0.057 ms; both cancel exactly 64 departing generations. Parent `e6497e7` does not implement current-phase join reconstruction, so its zero reconstruction work is not behaviorally comparable.

For the 120-second/eight-track/eight-member stable case, adapter graph queries over two measured seconds drop from 3552 to 0. Scheduled-entry visits remain 1504, proportional to the event window. Graph cache traversal itself is shared across members. At 48 Honks, collider sphere reads drop from 2,256 to 48 while all 1,128 pair tests remain. Ninety future updates matching a voice's initial vowel allocate zero vowel timers instead of 90; the A→E→A test schedules its two genuine transitions.

## Headset verification still required

No headset was available. The headless desktop run does not establish XR frame-time distributions, tracking feel, audible release quality, or wire allocation cost. Before accepting the visual tuning:

1. At each available refresh rate (60/72/90/120 Hz), record held squeezes, continuous rolls, quick repeated notes and a slow release. Replay freely and with a metronome. Confirm distinct attacks, eased visual note-off, preserved pitch/timbre/gain and exact audible note lengths. Add live squeeze/bend over playback and overlap two loopers on one Honk.
2. Test loop seams, tail padding, Gap, tempo changes, pause/resume/restart/stop; spawn and cancel a preview during playback. Stop midway through a note, disconnect and reconnect, duplicate a performing Honk, restore a saved scene, delete source/follower/looper, exit XR and re-enter. Check neutral restored visuals and no stuck or delayed voices.
3. Join eight followers to eight playing tracks around 110 ms after onset, during a rest, and before a queued attack. Split/rejoin A–B–C transitively, preserve alternate paths, and use independent contact components and two loopers. Percussion must sound once; departing followers must cancel promptly without cutting other owners. Exercise body grip/raycast and stick hits during a visible release tail.
4. Record a 120-second dense loop and play eight tracks into an eight-Honk component. Capture 30-second browser/Quest Performance traces for static groups, moving groups and moving connected wires, both free-running and metronome-linked. After warm-up, export p50/p95/p99 frame times, missed display intervals, per-phase CPU, scheduler duration and late events, graph queries, voice/generation/vowel-callback counts, and geometry allocation/disposal. Compare identical scenes against a55cf51; separate steady playback from join/split bursts. Track renderer resource counts through repeated creation/deletion/session cycles.
5. Use temporary DevTools instrumentation or the profiler, disabled outside the measurement run. Investigate wire planning/TubeGeometry only if that trace attributes meaningful cost to it. Keep renderer quality and recording samples unchanged.
