# Mixed Reality Capture

Record final instrument presentation and the actual post-master audio to your laptop, then overlay a presentation-only replay on fixed-phone footage. The recorder is independent of the musical Loopers. Capture, editing and export run locally after dependency setup.

## Setup and pairing

Use Node 22+ (tested with 24.7), npm, desktop Chrome, and optional FFmpeg. From this repository:

```sh
npm ci
npm run capture:serve
```

The postinstall copies pinned **Three.js 0.164.1**, addons, fonts and license to gitignored `vendor/three`. `npm run capture:setup` recreates these copies. `ws` is pinned to **8.21.3**. No CDN, telemetry or cloud service is used at runtime.

The receiver reuses `certs/localhost.pem` and `certs/localhost-key.pem`. For a local CA certificate, install mkcert, run `mkcert -install`, then issue a certificate containing the laptop's actual LAN IP and hostname:

```sh
mkdir -p certs
mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1 YOUR_LAN_IP YOUR_LAPTOP_HOSTNAME
```

Trust the issuing CA on the headset through its supported certificate-management workflow. Laptop trust does **not** establish headset trust. The certificate must cover the exact hostname/IP used. If the headset reports an untrusted connection, fix its trust configuration before recording; do not disable browser security or allow mixed content. Never transfer the CA private key to the headset.

Keep laptop and headset on the same LAN, allow TCP **8443** through the laptop firewall, and check that Wi-Fi client isolation does not prevent communication. Keep the receiver terminal open.

- Headset app: `https://YOUR_LAN_IP:8443/`. The headset's `localhost` refers to the headset, not the laptop.
- Laptop editor: `https://localhost:8443/capture/`.
- Pair each browser with the six-digit code printed by the receiver, before entering XR. A server restart requires pairing again.
- Custom hostname allowlist: comma-separated `CAPTURE_HOSTNAMES`. Other settings: `CAPTURE_PORT`, `CAPTURE_HOST`, `CAPTURE_CERT`, `CAPTURE_KEY`, `CAPTURE_DIR`, `FFMPEG` (encoder executable).

Install FFmpeg locally for MP4 encoding, e.g. `brew install ffmpeg` on a Homebrew Mac. Without it, transparent PNG/WAV export still works. `npm run dev` remains loopback desktop preview, and `npm run dev:https` remains static HTTPS; neither accepts recording streams. All included servers exclude captures, certificates, keys and Git files from static serving. Do not use an unrestricted file server on the repository once it contains private recordings.

## Capture

1. Fix the phone securely in **portrait 9:16**. Start video first. Use standard SDR initially, keep one lens/zoom, avoid automatic lens switching, lock focus/exposure where available, and disable dynamic stabilization/cropping. A fixed phone with a changing digital crop is not a fixed projection.
2. Expand **Mixed Reality Capture** on the app page, pair, and confirm **Receiver ready**. Native XR sampling is the default; optional 60/30 Hz maximum sampling and menu/tutorial/ray recording can be selected before starting. Optional UI layers increase encoding/data cost.
3. Enter XR. Use the existing radial menu (hold right A / left Y), select **Capture**, pull into its child menu, then choose **Start Mixed Reality Recording**. It becomes **Stop Mixed Reality Recording** while active. The receiver must acknowledge the take and asset snapshot before recording is reported active. Controller and desktop status show connection, state, elapsed time and recovery messages. Capture commands do not spawn instruments or advance tutorial lessons.
4. **Mark Sync** near the beginning. It logs a timestamp and plays three short rising tones through the recorded master bus. The phone microphone must hear the headset speakers. A virtual flash would not be visible to the phone. A recognizable controller gesture can be used for manual synchronization instead.
5. Make **4–6 still calibration holds**, spread across the image at different heights and depths, preferably with varied orientations. **Mark Calibration Pose** bookmarks a hold. Collect 8–12 fitting observations plus at least two held-out observations from additional frames where possible. Three holds do not guarantee calibration.
6. Perform normally, including tutorials if desired. Add another sync cue near the end. Stop and keep the tab open until **Take saved**. Normal Stop retains **500 ms** of release tails while leaving live voices untouched. Session end, hidden/interrupted XR, audio suspension or reference-space reset flush immediately without that tail; these stops are conservatively labeled incomplete.

Recenter/reset ends the take with an explicit reset event. Start a new take and calibrate again. The recorder never joins incompatible reference spaces. A phone movement also requires new calibration.

## Storage, recovery and portability

Each take is written incrementally under gitignored `captures/<take-id>/`: metadata, sample/event/audio NDJSON streams, PCM, finalized WAV and a snapshot of model/texture assets. Access is through paired local API endpoints. HTTPS/WSS use same-origin/host checks and HttpOnly pairing cookies; there is no cloud account system.

Samples, events and audio have independent sequences. Acknowledgements follow writes and `datasync`. Duplicates do not produce duplicate records; sequence gaps are rejected. Reconnection resends unacknowledged packets from the receiver's durable counters. A **32 MiB** worker queue and four-buffer frame handoff bound memory. The same pending queue is spooled to IndexedDB; it is not a whole-take download. Spool availability/quota errors are shown. Queue exhaustion stops capture, records its affected stream/time interval and preserves recovery. The XR callback never waits on disk or network.

Keep the tab open during reconnection. After a tab reload, pair and use **Recover this browser's pending takes**, one take per click. If the headset tab is unavailable, select the take in the editor and use **Finalize interrupted take** to rebuild WAV from intact PCM. Known missing intervals are displayed; an unknown end is explicitly unknown. Incomplete presentation resources hide affected nodes and report the problem, while intact data remains usable. Power loss may lose unspooled/unacknowledged data, but the laptop's durable portions remain.

**Download portable take** streams a `.honk` archive with metadata, state, PCM/WAV and pinned model/texture files. Import it in this repository's editor on another machine. Asset checksums are verified; import gets a new local ID and retains original identity for project matching. Existing takes are not overwritten. Import limits are 8 GiB total and 4 GiB per file. Version 1 uses RIFF WAV, so split very long recordings before the 4 GiB audio limit.

## Synchronize and calibrate

Select a take and local video. The video does not need to upload to the receiver. Browser decoding respects rotation metadata; preview uses decoded dimensions. Output uses aspect-preserving portrait crop with optional pan/zoom, never stretching. All calibration coordinates mean **1080 × 1920 cropped-output pixels**, origin top left, even at a smaller preview/export size. Changing crop invalidates observations/calibration.

The mapping is `sceneTime = a * videoTime + b`. One anchor fits offset `b`; two anchors at least one second apart also fit clock drift `a`. Use cue positions in phone audio or controller gestures. The clean WAV starts at scene time zero, including initial silence. Phone audio is muted in final exports. **Listen to phone audio for sync** temporarily replaces clean preview audio instead of doubling it. Calibration clicks use the displayed video frame's presentation timestamp. Frame-step buttons step the selected 30/60 fps output grid, not an assumed constant input rate.

Identify a visible physical point on the correct controller model. Enter a **calibrated offset from that controller's XR grip origin**, in meters, and name the landmark. Obtain it from a verified model/profile coordinate mapping or prior measured calibration. This version does not assert a physical landmark for arbitrary controllers or estimate unknown offsets. A generic sphere/grip origin is only a proxy; do not mark its offset verified without an actual calibration. Handedness, profile and offset are saved per observation.

At each synchronized still frame choose the hand, press **Click a controller landmark in video**, and click that physical point. Repeat across holds, reserving at least two additional observations as held-out. The 3D point comes from the recorded **grip pose**, independently of target ray. Lost tracking cannot provide a landmark.

The JavaScript solver fits one fixed metric camera with Huber-weighted nonlinear least squares and multiple pose/FOV initializations. Pose-only mode retains known FOV; pose + focal mode also fits FOV with a fixed image center (centered initially). Insufficient/degenerate/planar observations are rejected. Fitting and held-out pixel errors stay visible. A fit above 15 px fitting RMS or 20 px held-out RMS is flagged failed; it cannot silently become a successful export calibration. Two held-out observations below threshold are needed for the validation indicator. These thresholds do not establish real-camera accuracy.

Manual position, pitch/yaw/roll, vertical FOV and image-center offsets have numeric controls/reset. Rotation is Three.js `YXZ` Euler order, displayed as pitch/yaw/roll degrees; camera forward is `-Z`. Projection uses Three.js conventions directly, avoiding an OpenCV axis conversion. Metric scene scale stays fixed. Calibration dots appear on matching frames and are hidden in export, along with controller/headset proxies. Save a project to retain landmarks, profile offsets, fit, mapping, crop, layers, trim, output and take identity. Reselect its video when reopening. Recalibrate after phone movement or an XR-origin change.

## Export and Premiere

Default output is **1080 × 1920**, selectable 30/60 fps. Smaller portrait sizes help testing. Trim is in **video seconds**. Export pauses playback, seeks/decode-waits at each chosen output timestamp, renders through the same camera/crop/layers, then streams one PNG at a time to disk. It does not rely on realtime screen recording or store all rendered frames in browser memory. Cancellation leaves partial files and does not claim a finished movie.

With FFmpeg the service produces H.264/yuv420p MP4 with AAC. Clean audio is resampled using the same mapping and trim, including silence where samples are absent. Download MP4, WAV or PNG archive. Files also remain in `captures/exports/<export-id>/`.

Without FFmpeg, **Transparent PNG sequence + WAV** downloads a standard `.tar` with `frame-000000.png` onward, aligned `audio.wav`, project and instructions. Extract it. In Premiere:

1. Import the first PNG with **Image Sequence**, and interpret it at the selected 30/60 fps.
2. Create a matching portrait sequence and place the image sequence at zero.
3. Put the phone video underneath, using identical crop and video trim. Mute phone audio.
4. Put exported `audio.wav` at zero; offset/drift/trim are already applied, so do not apply them twice.

When FFmpeg is present, the downloadable PNGs already contain the composite. Encoder failures report real errors and preserve intermediate PNG/WAV files. Unsupported video codecs report an actionable local conversion, for example for an **SDR** source:

```sh
ffmpeg -i phone.mov -vf format=yuv420p -c:v libx264 -crf 18 -c:a aac phone-sdr.mp4
```

HDR requires a deliberate local tone-mapping/color-management conversion first. The editor is SDR/sRGB and does not promise HDR matching. Lens distortion is not fitted; use a normal stable lens and inspect held-out errors, especially near the edges.

## Format and implementation

Take version 1 includes commit, source hash, asset SHA-256 versions, Three version, timebase, sampling rate, profiles, coordinate policy and initial structural snapshot. Full presentation keyframes supply what ordinary persistence omits: pending spawns, transient Looper states, equipped Sticks and animation. Assets use recorded authored GLB node paths and resource IDs; replay does not depend on new runtime UUIDs matching old ones.

Roots use capture/world meters, right-handed, +Y up. Children/bones use local space; equipped roots include their parent transform exactly once. Cached bindings sample actual animated transforms/scales, visibility, morphs and material presentation. Resources are referenced once; procedural label geometry is saved on changes. Wires reconstruct recorded Bezier segments, radius and subdivision counts. The worker emits delta samples, full keyframes at least once per second and separate lifecycle/state events. Continuous transforms/morphs interpolate with quaternion slerp; discrete state steps. Deleted/invalid poses, gaps and reference discontinuities are not interpolated together.

Capture runs after runtime updates, immediately before render, outside scheduler phases that can exit early during spawn preview. Serialization/resource encoding is deferred outside the XR callback. AudioWorklet captures an independent branch of `MasterBus.output`, leaving the speaker connection and gain untouched; its own output is silent. A fixed eight-buffer pool transfers stereo blocks of 2048 frames. Sample-index and AudioContext-frame timestamps map to scene time through recorded clock anchors with quantum uncertainty and output-latency diagnostics. PCM is placed at its scene-time offset, preserving gaps. Audio suspension ends/flags the take. External speaker/phone latency is handled by video sync anchors.

Replay constructs only Three presentation objects and shared lighting, with alpha background and no fallback environment, transport, collisions, haptics or synth. Layers cover instruments, labels, wires, tutorial, rays, controllers and headset. RGB video has **no reliable body depth**: an overlaid instrument covers a foreground hand. No automatic segmentation or correct occlusion is claimed. The alpha/layer structure supports future imported masks or foreground/background assignments; a person silhouette alone would not solve all hand/instrument ordering.

## Verification and synthetic demo

```sh
npm run verify
npm run test:capture:server
npm run test:capture:browser
npm run capture:demo
```

Browser verification/demo generation launches an isolated headless Chrome profile and a loopback-only HTTP fixture service. This is desktop testing, not a headset security workaround. Set `CHROME_BIN` if Chrome is elsewhere. Production remains HTTPS/WSS. Evidence and screenshot are in gitignored `test-results/capture/`.

`capture:demo` creates an explicitly labeled synthetic take plus `captures/demo/phone.webm`, `project.json` and `evidence.json`. Start the regular receiver, select that take, choose the video and load its project. Generated dots are known synthetic landmarks, not a physical-controller recipe. See [verification evidence](mixed-reality-verification.md) for tests, measurements and limits.

### Real-device acceptance still required

- Trust HTTPS and pair; check capture/readiness/status/menu access in normal play and a tutorial.
- Record a **two-minute** fixed-phone take with a bent Honk note, chord, Stick strike, Looper switch, lock/unlock, moved/scaled object, spawn/delete and spawn preview during playback.
- Place sync cues at both ends and make 4–6 calibration holds. Verify the actual controller/profile offsets, fit one camera and inspect withheld frames throughout the image.
- Briefly disconnect/reconnect the headset LAN; verify recovery/final flush or exact reported gaps, then reopen after receiver restart.
- Compare clean audio with live sound, release tails and alignment at both ends. Confirm phone audio is muted in final output.
- Exercise visibility loss, recenter and audio suspension. Check safe finalization and fresh calibration where needed.
- Measure headset frame cost/memory at native refresh for the full take, including spawning and optional UI layers; select lower-rate sampling and retest if needed. Desktop results do not validate headset performance.
- Inspect full portrait MP4 or PNG/WAV in Premiere for crop, rotation, timing, color and expected hand/body occlusion limitations.

API semantics: [WebXR grip space](https://developer.mozilla.org/en-US/docs/Web/API/XRInputSource/gripSpace), [reference-space reset](https://developer.mozilla.org/en-US/docs/Web/API/XRReferenceSpace/reset_event), [video presentation callbacks](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback), [audio output timestamps](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp).
