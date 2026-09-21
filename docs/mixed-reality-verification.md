# Mixed Reality Capture verification

Editor alignment changes were made locally on `mixed-reality-capture`, starting from `fe2001f` with a clean working tree. Changes remain uncommitted for local review. No GitHub writes, pushes, pull requests, merges or publishing were performed.

## Checks

- Baseline: **540 existing tests passed**.
- Final `npm run verify`: **579 tests passed**, plus syntax, relative-import and architecture checks.
- `npm run test:capture:server`: paired Origin/host checks, protected private paths, durable acknowledgements, duplicates, receiver restart/resume, final flush, sequence gaps and invalid archives passed.
- `npm run test:capture:browser`: passed in isolated desktop Chrome using a loopback-only test service. The test terminated the capture socket mid-take and verified automatic recovery. Headset TLS trust remains a device acceptance check.
- `git diff --check` passed. Certificates, captures and generated vendor files are not tracked.

Unit coverage includes normal/early-exit frame ordering, grip/ray separation, tracking loss/reference reset, parent visibility for equipped objects, reusable bindings, morphs, discontinuous seeking, bounded queues and resource fragments, lost finalization replies, worklet pool exhaustion/sample indices, isolated master-bus tapping, sparse PCM, drift/offset math, robust calibration and responsive pixel coordinates.

## Editor alignment verification

Actual isolated Chrome browser checks used the synthetic take and locally served Three.js controls:

- Actual pointer drags scrubbed forward and backward before mouse-up, then rapidly reversed direction and visited both video endpoints. The thumb retained the requested position; video, recorded controller poses and mapped clean audio agreed. Numeric seeking and keyboard steps within one source frame worked. Both streams stayed paused and the fixed camera was unchanged.

- Pointer drags picked translation, rotation and scale handles. Each changed camera settings and composite pixels; both video and clean audio paused on pointer-down. Orbit was disabled during each drag and restored afterward.
- A pointer orbit changed the inspection camera while leaving the composite camera and composite pixels unchanged.
- Undo restored the exact previous camera after translation, rotation, scale and keyboard lens adjustment. Scale changed FOV while preserving position, rotation, portrait aspect and metric geometry. W/E/R/Q switched tools, and typing in a field left the tool unchanged. An exact numeric position edit survived the real **Save project** browser download without rounding the lens or other camera values.
- Saved timestamps paused and sought both streams without changing the camera until controller matches were supplied. Chrome pointer clicks on the left/right dots measured directly from decoded synthetic video refined the camera across six poses. Automatic fitting was undoable; cancelling replacement or skipping occluded controllers preserved existing matches; removing a saved frame removed its constraints. Crop changes cleared incompatible clicks. Reopening restored the camera, controller matches, timestamps, trim and mapping; legacy version 1 files without these fields still loaded.
- A different take or video cleared incompatible bookmarks.
- Solid left/right controller spheres and target rays changed composite pixels independently when toggled. Seeking checked sphere grip positions and ray positions/orientations against recorded poses, on a fixture with no optional ray presentation nodes. Guide choices survived a project reopen.
- Guide proxies were visible in preview and separate from recorded nodes. Three actual exported transparent PNGs were **byte-for-byte identical** with controller spheres, headset guides, inspection helpers and transform handles enabled versus disabled, while controller rays stayed on.
- A further three-frame export with controller rays disabled differed from the matching rays-enabled export in every PNG. The exported rays were also visually inspected; spheres and inspection helpers were absent. Rays now use the same output-layer setting in preview and export.
- The updated side-by-side editor screenshot was visually inspected. Tracked captions retain a readable screen size while inspecting the metric scene.

Separate Node unit tests cover serialized preview seeking, replacement of queued intermediate positions, zero-time requests, duplicate release events and recovery after decode failure, plus grouped undo, camera-state cloning, `YXZ` rotation conversion, uniform frustum scaling without compounding drag updates, FOV limits, full-precision JSON, bookmark validation/legacy defaults, video matching, projection with nonzero image-center offsets, independent grip/target-ray poses, guide toggles and tracking loss, and the renderer boundary including controller rays while excluding preview spheres and headset proxies. These unit checks do not substitute for the pointer and export checks above.

Additional regressions cover presentation callbacks arriving before seek completion or decoded-data readiness, same-source-frame seeks without callbacks, timeout/error cleanup, progressive camera estimation, rejection of contradictory matches, degenerate pose sets, saved-match migration, and re-sampling matches after time mapping changes. The browser export check deliberately delays reported video readiness after presentation notifications and checks the phone background in every one of 60 exported frames.

## Ray appearance verification

Ray colors, opacity and length were exercised through the real editor controls in Chrome. Each input changed preview pixels immediately; opacity/length zero matched hiding the ray layer while preserving controller spheres. Reset restored the original appearance. Custom settings survived project reopening; older projects without `rayStyle` restored defaults. Unit checks cover malformed settings, bounds, JSON round trips, target-ray origin/orientation, unchanged beam thickness and independent sphere colors.

Focused export checks compared the first and last frames of a three-frame MP4/PNG export and a three-frame transparent export using custom magenta/cyan colors, 42% opacity and 2.1 m length. Transparent overlays matched preview RGBA pixels exactly. Composite frames differed by at most one 8-bit channel level because export snapshots phone pixels before scaling; both export projects retained the selected style. The comparison clears its destination canvas between transparent images to avoid accumulating alpha. Local evidence: [ray style report](../test-results/capture/ray-style-report.json), [controls screenshot](../test-results/capture/ray-style.png).

## Reported phone-frame regression

The supplied `frame-001112.png` showed the editor's “Select a phone video” placeholder composited beneath instruments. The old export seek could resolve on a presentation callback while the media element was still seeking or lacked current decoded data. Export now waits for both conditions and snapshots the decoded pixels before drawing the overlay; decode failures stop with a timestamp instead of writing the placeholder.

Using the original local phone video and saved project, `scripts/capture/check-phone-export.mjs` exported new clips covering **36.866667–37.266667 s** (12 frames around the reported frame) and **107.735733–107.885733 s** (5 endpoint frames). All 17 frames matched a fresh decoded composite, with no pixels differing by more than three channel levels. Original files were unchanged. The corrected frame was also visually inspected. This checks those intervals, not every frame of the full take.

Local evidence: [phone export report](../test-results/capture-phone-export/report.json), [corrected frame](../captures/exports/0db74036-61c9-43f0-8602-2377fb7db3c5/frame-000006.png). Reproduce a targeted check with `node scripts/capture/check-phone-export.mjs PROJECT_JSON PHONE_VIDEO VIDEO_TIME`.

## Browser evidence

Take `68dd5e45-fd00-455d-9e2e-d9fb4128777b` contains 120 synthetic samples and reconstructs 73 presentation nodes using the actual Honk, Looper, Metronome and Stick assets. Six checkpoints matched root scale, child animation and grip coordinates after round trip. The fixture includes an already-playing Looper, lock state, spawn/delete, procedural wire, actual Honk/percussion audio, sync cues and a half-second stop tail.

The test loaded a local WebM, fitted a synthetic camera, sought forward/backward deterministically, reopened a saved project in a fresh page, reselected video and checked that trim, camera, matches and mapping survived. A portable take including pinned assets (47,583,273 bytes) exported/imported successfully. No external page network requests were observed. An earlier run stopped before editor checks when the simulated capture interruption produced an incomplete take; the subsequent runs completed the recovery and editor checks.

Synthetic measured-landmark fitting RMS: 7.601e-11 px. Held-out RMS: 4.316e-10 px. Near-zero errors demonstrate recovery of generated coordinates, not physical-camera accuracy. The new controller-click workflow instead measured dots from the compressed video: six saved frames yielded **5.54 px fitting RMS** and **8.24 px maximum projection error on an unseen pose**, in 1080 × 1920 coordinates.

- 30 fps export: **60 frames / 2.000 seconds**, H.264/AAC at 270 × 480; codecs, frame count, dimensions and duration verified with ffprobe. Clean audio was non-silent.
- Full portrait export: **1080 × 1920 at 60 fps**, **6 frames**, verified with ffprobe.
- Encoder absent: **3 real transparent PNGs + aligned WAV**. A decoded PNG had 4,773 nonzero-alpha and 124,827 transparent pixels. The standard tar archive was inspected with the system tar utility.
- The report retains chosen output/video timestamps and decoded source PTS. Calibration uses source PTS; preview and export share the playhead-to-scene mapping.

Local, gitignored evidence: [report](../test-results/capture/report.json), [editor screenshot](../test-results/capture/editor.png), [synthetic video](../test-results/capture/phone.webm), [reopened project](../test-results/capture/reopen.json), [PNG/WAV archive](../test-results/capture/fallback-frames.tar).

Movies: [30 fps fixture](../captures/exports/1b8cce08-658e-4640-8dca-279f6e1ed0a7/composite.mp4), [1080 × 1920 / 60 fps fixture](../captures/exports/0437dc90-f288-4599-bbd2-03bd8c90fc97/composite.mp4). Recreate them with `npm run test:capture:browser`; generate a standalone demo with `npm run capture:demo`.

## Performance and limits

Across 120 desktop fixture samples, capture measured **0.235 ms average** and **1.00 ms maximum** per callback. This includes sampling/worker handoff, excludes deferred resource encoding, and is not a headset benchmark.

Chrome reported 17.88 MiB page JS heap before the short performance and 15.90 MiB afterward. Garbage collection occurred: this is not a retained-memory analysis or a long-take guarantee. Live queues/buffers and recovery spooling are explicitly bounded.

Video identity uses filename, size and decoded dimensions/duration, not a content hash. Undo history is session-local. The second view adds a desktop WebGL renderer; long-session editor memory and performance have not been benchmarked.

Not validated here: physical headset/phone capture, real controller landmark offsets, real-camera reprojection accuracy, phone lens/rotation/HDR behavior, two-minute native-refresh headset cost/memory, device latency/drift, certificate installation, or Premiere interaction. See the [setup guide and real-device checklist](mixed-reality-capture.md).

Scope limits: fixed camera; no automatic body/hand occlusion or segmentation; no controller-offset estimation or lens-distortion fitting; SDR workflow; recenter ends the take and requires recalibration. Incomplete takes remain marked and expose missing intervals.
