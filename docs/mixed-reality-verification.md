# Mixed Reality Capture verification

Branch: `mixed-reality-capture`. Base: fetched `origin/ver-12`, `23cd48b5354a1c0486456044d1c775f4c48edb38`. The initial working tree was clean. Nothing was merged or deployed.

## Checks

- Baseline: **540 existing tests passed**.
- Final `npm run verify`: **559 tests passed**, plus syntax, relative-import and architecture checks. No pre-existing failures were found.
- `npm run test:capture:server`: paired Origin/host checks, protected private paths, durable acknowledgements, duplicates, receiver restart/resume, final flush, sequence gaps and invalid archives passed.
- `npm run test:capture:browser`: passed in isolated desktop Chrome using a loopback-only test service. The test terminated the capture socket mid-take and verified automatic recovery. Headset TLS trust remains a device acceptance check.
- `git diff --check` passed. Certificates, captures and generated vendor files are not tracked.

Unit coverage includes normal/early-exit frame ordering, grip/ray separation, tracking loss/reference reset, parent visibility for equipped objects, reusable bindings, morphs, discontinuous seeking, bounded queues and resource fragments, lost finalization replies, worklet pool exhaustion/sample indices, isolated master-bus tapping, sparse PCM, drift/offset math, robust calibration and responsive pixel coordinates.

## Browser evidence

Take `e0571d6f-6aa5-47f8-b110-a0e656a9e094` contains 120 synthetic samples and reconstructs 73 presentation nodes using the actual Honk, Looper, Metronome and Stick assets. Six checkpoints matched root scale, child animation and grip coordinates after round trip. The fixture includes an already-playing Looper, lock state, spawn/delete, procedural wire, actual Honk/percussion audio, sync cues and a half-second stop tail.

The test loaded a local WebM, fitted a synthetic camera, sought forward/backward deterministically, reopened a saved project in a fresh page, reselected video and checked that trim, camera and mapping survived. A portable take including pinned assets (47,653,238 bytes) exported/imported successfully. No external page network requests were observed.

Synthetic fitting RMS: 1.503e-10 px. Held-out RMS: 7.963e-10 px. Near-zero errors demonstrate recovery of generated coordinates, not physical-camera accuracy.

- 30 fps export: **60 frames / 2.000 seconds**, H.264/AAC at 270 × 480; codecs, frame count, dimensions and duration verified with ffprobe. Clean audio was non-silent.
- Full portrait export: **1080 × 1920 at 60 fps**, **6 frames**, verified with ffprobe.
- Encoder absent: **3 real transparent PNGs + aligned WAV**. A decoded PNG had 4,588 nonzero-alpha and 125,012 transparent pixels. The standard tar archive was inspected with the system tar utility.
- The report retains chosen output/video timestamps and decoded source PTS. Calibration uses source PTS; preview and export share the playhead-to-scene mapping.

Local, gitignored evidence: [report](../test-results/capture/report.json), [editor screenshot](../test-results/capture/editor.png), [synthetic video](../test-results/capture/phone.webm), [reopened project](../test-results/capture/reopen.json), [PNG/WAV archive](../test-results/capture/fallback-frames.tar).

Movies: [30 fps fixture](../captures/exports/537baa10-e358-43cf-ab5c-43de5c380777/composite.mp4), [1080 × 1920 / 60 fps fixture](../captures/exports/e9b50a6e-f77a-42ab-bcdd-7e2bcaa68a03/composite.mp4). Recreate them with `npm run test:capture:browser`; generate a standalone demo with `npm run capture:demo`.

## Performance and limits

Across 120 desktop fixture samples, capture measured **0.230 ms average** and **1.20 ms maximum** per callback. This includes sampling/worker handoff, excludes deferred resource encoding, and is not a headset benchmark. Maximum unacknowledged queue: **3.31 MiB**, including the forced reconnect.

Chrome reported 17.88 MiB page JS heap before the short performance and 15.83 MiB afterward. Garbage collection occurred: this is not a retained-memory analysis or a long-take guarantee. Live queues/buffers and recovery spooling are explicitly bounded.

Not validated here: physical headset/phone capture, real controller landmark offsets, real-camera reprojection accuracy, phone lens/rotation/HDR behavior, two-minute native-refresh headset cost/memory, device latency/drift, certificate installation, or Premiere interaction. See the [setup guide and real-device checklist](mixed-reality-capture.md).

Scope limits: fixed camera; no automatic body/hand occlusion or segmentation; no controller-offset estimation or lens-distortion fitting; SDR workflow; recenter ends the take and requires recalibration. Incomplete takes remain marked and expose missing intervals.
