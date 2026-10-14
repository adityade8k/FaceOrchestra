# Capture, replay and export

Use this guide to record a performance with your phone and headset, align the instruments with the footage, and export a portrait video with clean audio and controller rays.

**The phone and headset record independently.** Starting or stopping headset capture does not control your phone camera. Start the phone first, stop it last, then match shared sync cues in the editor. One cue corrects the different start times; a second cue corrects clock drift. Trim removes the extra footage.

If you already have both recordings, start at **Step 4**.

## 1. Start the laptop receiver

1. Open Terminal and go to the project:

   ```sh
   cd "/Users/adityade/Documents/ITP/Sem2/Code of Music/Finals/FaceOrchestra"
   ```

2. If dependencies are not installed yet, run:

   ```sh
   npm ci
   ```

3. Start the recording receiver:

   ```sh
   npm run capture:serve
   ```

4. Keep that terminal open. Note its **six-digit pairing code** and headset URL.
5. Connect the laptop and headset to the same Wi-Fi network.

This requires Node 22 or newer. If HTTPS certificates are not set up, complete [headset HTTPS setup](../README.md#start-https-for-a-headset) first. Use `capture:serve` for recording; the ordinary development server does not receive takes.

For MP4 export, install FFmpeg if it is missing. On a Mac with Homebrew:

```sh
brew install ffmpeg
```

## 2. Prepare the phone and headset

1. Mount the phone securely in **portrait orientation**. Keep it in exactly the same position throughout the take.
2. Use **SDR video**, one lens, and one zoom setting. Lock focus/exposure where possible and disable stabilization that changes the crop.
3. Make sure the phone microphone can hear the headset's sync tones.
4. In the headset browser, open the laptop URL printed by the receiver, such as `https://YOUR_LAPTOP_LAN_IP:8443/`. Replace the placeholder with the actual laptop IP; do not use `localhost` on the headset.
5. Expand **Mixed Reality Capture**, enter the pairing code, and confirm **Receiver ready**.
6. Enter XR.

## 3. Record in this order

1. **Start recording on the phone first.** Leave it running while you start the headset capture.
2. Open the headset radial menu by holding **right A / left Y**. Select **Capture**, pull into its child menu, then choose **Start Mixed Reality Recording**.
3. Wait until capture reports that it is recording.
4. Choose **Mark Sync**. This plays three rising tones and saves a headset timestamp. Make sure the phone records the sound.
5. Hold the controllers still in **4–6 different poses** for a few seconds each. Spread them across the image, at different heights and distances from the phone. Keep them visible. You can use **Mark Calibration Pose** to mark these holds.
6. Perform your piece.
7. While both recordings are still running, choose **Mark Sync** again near the end.
8. Choose **Stop Mixed Reality Recording** in the headset. Keep the app open until it says **Take saved**. Normal stopping includes a short audio release tail.
9. **Stop the phone recording last.**

The order is: **phone start → headset start → sync cue → poses/performance → sync cue → headset stop → Take saved → phone stop**.

Avoid recentering during the take: it ends headset capture. If you recenter or move the phone, start a new take and align it again.

## 4. Load both recordings

1. Transfer the original phone video to your laptop.
2. With the receiver running, open **`https://localhost:8443/capture/`** in desktop Chrome. Refresh the page if it was already open before the editor updates.
3. Enter the receiver code under **Receiver pairing code**, then click **Pair this browser** if prompted. A receiver restart requires pairing again.
4. Click **Refresh**, then choose your recording under **Recorded take**.
5. Under **Phone video — stays on this computer**, select the matching phone video file.
6. Open **Crop & output**. Set any crop zoom or pan you need now, before positioning the camera. The default is a centered portrait crop.

The **3D scene** shows the reconstructed performance and editable phone camera. **Video + instruments** shows the composite you are aligning.

## 5. Match the recording times

### Match the first cue

1. Under **02 / Synchronize**, enable **Listen to phone audio for sync**.
2. Click **Play** and listen for the early three-tone cue. Pause and replay around it to locate the beginning of the first tone. Read its phone timestamp from **Video time (s)**.
3. Find the corresponding `sync …s` marker under **Synchronize**. Its printed number is the cue's **headset scene time**.
4. Enter the phone timestamp in **Video 1 (s)** and the matching headset timestamp in **Scene 1 (s)**.
5. Leave **Video 2 (s)** and **Scene 2 (s)** empty for now.
6. Click **Apply anchors**.

For example, if the same cue occurs at **8.000 seconds in the phone video** and **2.000 seconds in the headset take**, enter:

| Field | Value |
| --- | --- |
| Video 1 (s) | `8.000` |
| Scene 1 (s) | `2.000` |

After applying, **Rate a** is `1` and **Offset b (s)** is `-6`: phone video time 8 seconds plays headset scene time 2 seconds. You do not need to have pressed Record simultaneously.

Clicking a sync marker only jumps to its estimated video position using the current timing settings. It does not find the sound in the phone video or fill in the anchor fields automatically. Paused timeline dragging is silent; use **Play** to hear the cue.

### Match the second cue

1. Find the late three-tone cue in the phone recording the same way.
2. Enter its phone time in **Video 2 (s)** and its matching `sync` marker time in **Scene 2 (s)**.
3. Click **Apply anchors** again. The two cues should be well separated, ideally near the beginning and end.
4. Disable **Listen to phone audio for sync** to hear the clean recorded instrument audio.
5. Check recognizable controller movements near both ends of the take. Correct timing before adjusting camera position.

The editor now uses `sceneTime = a × videoTime + b` for the replay and exported clean audio. If you forgot the tones, use recognizable controller gestures visible in both recordings as your matching points.

## 6. Scrub and position the camera

1. Drag the timeline left or right to move backward or forward. Dragging pauses playback and updates both views. Use **← Frame**, **Frame →**, or **Video time (s)** for finer positioning. Frame buttons use the selected output frame rate.
2. Pause on a clear, still controller pose.
3. Below **Video + instruments**, enable **Controller spheres** and **Controller rays (exported)**. Green spheres represent the left controller; orange spheres represent the right. Open **Ray appearance** to choose each ray's color and adjust ray opacity and length. These controls update the preview immediately and export with the same settings.
4. In **3D scene**, adjust the yellow phone camera while watching the composite:

   | Tool | Shortcut | Action |
   | --- | --- | --- |
   | Translate | **W** | Drag the camera's arrows or plane squares to move it. |
   | Rotate | **E** | Drag the rings to point the camera. |
   | Scale | **R** | Drag a box outward for a wider view, inward for a tighter view. |
   | Inspect scene | **Q** | Drag to orbit, right-drag to pan, scroll to zoom your inspection viewpoint. |

5. Start with the phone's approximate physical position, then adjust its rotation, then **Lens / field of view**. A larger field of view makes objects appear smaller; a smaller field of view makes them appear larger. Scale adjusts this lens setting without changing the size of the recorded world.
6. Compare the spheres with the approximate grip positions of the real controllers. They are tracking guides, not exact controller outlines.
7. Click **Save this frame**. The instruments temporarily disappear so you can click the **left controller's grip center** in the phone image, then the **right controller's grip center**. Left/right means the performer's hand, not the side of the image. Skip a controller if it is hidden.
8. After the clicks, the editor automatically estimates the camera using all your matched frames. The first frames produce an **early estimate**. Repeat for **4–6 different poses**, including different heights and depths, to refine camera position, rotation, and lens together.
9. Watch the **match error** below the timeline and check another pose you did not use for fitting. Click a saved timestamp to revisit it; press **Save this frame** again to replace its controller clicks. **×** removes the frame and its matches. Cancelling matching keeps any previous matches for that frame.
10. Use **Undo camera edit** if an automatic or manual change makes alignment worse. Open **Fine camera adjustments** for precise position and angle values.

**Every saved frame contributes to the same fixed camera.** An adjustment affects the whole take; these are not animated camera positions. Controller grip centers provide approximate matches, so a few frames cannot guarantee perfect alignment. Match error measures the clicks used for fitting, not independent accuracy. Timing still comes from Step 5.

Dragging the background in the 3D view or using **Inspect scene** only changes how you look around the scene. Drag the camera handles to change the composite. Keyboard shortcuts do not operate while you are typing in an input field.

You can leave **Advanced calibration** closed for this workflow. Changing the crop clears controller clicks because their image coordinates have changed; save and match those frames again. Timing changes automatically update the tracked positions used by existing matches.

## 7. Trim and save your project

1. Find the beginning of the performance you want to keep. Enter its phone timestamp in **Trim in (video s)**.
2. Find the ending and enter its phone timestamp in **Trim out (video s)**.
3. Keep this interval within the portion recorded by both devices. The playhead displays both **VIDEO** and mapped **SCENE** times so you can check coverage. Exclude the setup and sync cues if you do not want them in the final movie.
4. Click **Save project** to download the project JSON. It preserves camera alignment, saved frames and controller clicks, timing, crop, trim, layers, and ray appearance.
5. Click **Download portable take** to save a `.honk` backup of the headset recording.
6. Keep the **original phone video**, **project JSON**, and **portable take** together. The project JSON does not contain the recordings.

For the earlier `-6` second offset example, phone time `6` maps to scene time `0`. If the headset recorded 60 seconds, the shared phone interval is `6–66` seconds, assuming the phone covers it. Choose your desired performance inside that interval.

To resume later, start and pair with the receiver, use **Load project**, and reselect the matching phone video. On another computer, use **Import portable take** before loading the project.

## 8. Export the video

1. In **Crop & output**, choose **1080 × 1920** and **30** or **60** fps. A short trim at **270 × 480 (test)** is useful for checking the result first.
2. Leave **Controller rays (exported)** checked if you want the rays coming out of the controllers in the finished video.
3. Use **Visible instrument layers** to choose which recorded instrument elements appear.
4. Click **Export frames & clean audio** and wait for completion.
5. With FFmpeg installed, click **Download MP4**. The movie uses the synchronized clean instrument audio instead of the phone microphone audio.
6. Play the exported file and check timing near the beginning and end, camera alignment, crop, and controller rays.

Export waits for each phone frame to decode. If decoding fails, it stops with the affected timestamp instead of saving a blank background or “Select a phone video” message. Re-export older files that contain those frames; the original headset take does not need to be recorded again.

Under **Ray appearance**, choose **Left ray color** and **Right ray color**, then use **Ray opacity** (0–100%) and **Ray length** (0–10 meters) for both rays. **Reset ray appearance** restores green/orange, 85% opacity, and 1.5 meters. Overall **Overlay** opacity also affects the rays. Saving the project keeps these choices.

Controller rays appear in the export with the same color, opacity, and length as the preview. Controller spheres, the headset guide, inspection grid, phone camera model, and editing handles stay out of the export. Rays show controller pointing direction at your chosen length; they do not reconstruct the distance to a hit object.

Without FFmpeg, download **Transparent PNG sequence + WAV** and follow the [Premiere assembly instructions](mixed-reality-capture.md#export-and-premiere). Export files also remain under `captures/exports/` on your laptop.

## If something is wrong

| Problem | What to do |
| --- | --- |
| Phone recording does not follow headset Start/Stop | Start the phone first and stop it last. Match cues in Step 5, then trim in Step 7. Remote phone recording control is not implemented. |
| Timing matches at the start but drifts later | Add the second matching cue and apply both anchors. |
| Timeline dragging still snaps back | Refresh the editor to load the updated code, then select your sources or reopen the project. |
| Alignment works for only one pose | Recheck timing, then refine the same camera against several saved frames at different depths. |
| Saved frames say “Early estimate” | Keep adding varied poses. At least eight controller matches with enough depth variation are needed for a full fit. |
| Saved matches disagree | Recheck timing and left/right clicks. Revisit a frame and save it again to replace its clicks. A rejected fit keeps the current camera. |
| Controllers or rays disappear | Check the toggles and mapped scene time. Ray opacity or length set to zero also hides rays. Missing tracking cannot provide a controller pose. |
| Recording was interrupted | If the headset tab has pending data, pair and use **Recover this browser's pending takes** there. If it is unavailable, select the take in the editor and click **Finalize interrupted take**. Inspect reported gaps before exporting. |
| Instruments cover real hands | Body/hand occlusion is not implemented; camera alignment cannot fix this. |
| No MP4 download appears | Check FFmpeg installation and the export error/status. PNG/WAV export is available without FFmpeg. |

The following sections describe guided recording, recovery, and measured calibration.

## Record Raag Jog in mixed reality

Pair the headset and computer with the existing receiver code. Enter XR, then choose **Record Raag Jog in mixed reality** beside **Play** and **Tutorials**. Selecting it on desktop instead shows **Prepare ensemble**; enter XR before preparing.

The mode saves your current free-play scene in memory and prepares the canonical `virag-2-jog-study` version 3 arrangement at 80 BPM: the seven-note melody row, four chord groups, percussion Honk, Metronome, and three recorded Loopers. All transports start stopped. Move instruments to comfortable positions before starting. The chord and alternative Loopers share one output; percussion uses another. The standard chord pattern and percussion start together; the alternative recording remains available through the ordinary Looper controls. There are no demonstration hands, melody autoplay, lesson steps or scoring.

1. Start the external phone video and let its microphone hear the headset speakers. Phone recording stays independent and may run across several attempts.
2. Press **Start**. The app checks tracking, pairing, audio and the prepared ensemble. It opens a distinct take, prepares its presentation resources, and waits for receiver and PCM readiness. One automatic **Mark Sync** cue plays, followed by **4, 3, 2, 1**, then **Play**. Sync and count-in are included in master audio. The two backing parts use the same scheduled beat-zero anchor as the count-in.
3. Perform the melody yourself with the tutorial's guidance. Green rings shrink toward the next Honk; squeeze Trigger when yellow opens, hold while it stays open, and release as it shrinks. The orange wrist guide follows each held Eb-to-C bend. The panel names the current and next note, beat/phrase, rests and bend instructions. All cues follow the same scheduled beat zero as the backing and restart from the beginning on each take. These rings appear only for the player: they are excluded from recorded scene data, replay and composite exports, even with UI capture enabled. At the end of the written melody, guidance clears and the panel invites you to continue freely. Recording and backing continue until you stop. **Restart Recording** and **Stop Recording** remain on the XR panel during the count-in and performance.
4. **Restart Recording** cancels pending cues, backing starts and pattern switches, releases voices, records the normal release tail, and waits for acknowledged saving. It then opens the next numbered take with a fresh sync and count-in. Recordings, instrument placement and XR origin stay in place.
5. **Stop Recording** follows the same save path and returns to Start. **Exit** saves an active take before restoring your prior free-play scene. Exit from ready creates no take. Saved scenes and tutorial progress are not overwritten.

**Saving…** means the receiver has not yet acknowledged finalization. If saving times out, keep the tab and receiver open, restore the connection, and choose **Check saving**. The current worker and spool remain available; no new take replaces them. A late acknowledgement returns to ready without an automatic retry. XR/session loss, hidden XR, tracking loss, reference-space reset, audio suspension or a capture gap cancels musical actions. Start again explicitly after an interruption. Desktop/radial capture commands use the same recorder owner; Mark Sync cannot add a second cue to this mode's attempt.

In the paired computer editor, each attempt appears as **Raag Jog — Take 01**, **Take 02**, and so on, with its date, musical completion action and capture status. **restarted** describes the performance choice; it does not make an otherwise intact take incomplete. The information panel shows the performance-start time in take seconds for trimming. Align each take's own sync cue to the corresponding point in the continuously recorded phone video. Every saved attempt can be selected, replayed and downloaded as a portable take.

Optional `take.performance` metadata keeps the mode, composition ID/version, session `groupId`, attempt number, readable label, sync cue, scheduled and actual performance-start timestamps, and completion action (`stopped`, `restarted`, `interrupted`). Ordinary take ID/creation time and capture integrity (`complete`, `gaps`, missing streams, reason) keep their existing meanings. Timestamped events carry updates through recovery. Portable archives and receiver reopens retain the metadata; older takes need none of these fields.

### Implementation and local validation

Changed files for this workflow:

- Preparation, performance ownership and melody guidance: `src/performance/JogEnsemble.js`, `JogRecordingSession.js`, `JogMelodyGuidance.js`; the existing `src/tutorial/TutorialTimingCues.js` renders the rings outside capture roots.
- Launch, XR panel and tracking integration: `src/tutorial/TutorialRuntime.js`, `src/tutorial/TutorialRoutes.js`, `src/app/FaceOrchestraApp.js`.
- Capture readiness, finalization and cues: `src/capture/CaptureRecorder.js`, `AudioCapture.js`, `CaptureControls.js`, `pcm-worklet.js`, `stream-worker.js` in that same directory.
- Optional take metadata and editor labels: `scripts/capture/storage.mjs`, `capture/editor.js`. The archive format and capture protocol remain version 1.
- Validation: `tests/performance/JogEnsemble.test.js`, `JogRecordingSession.test.js`, `JogMelodyGuidance.test.js`; `tests/capture/lifecycle.test.js`, `jog-archive.test.js`, `audio.test.js`, `worker.test.js`; `scripts/capture/check-jog.mjs`; the `test:jog:browser` command in `package.json`; this document.

Current automated commands and scope are in [Validation](validation.md). Earlier results are retained as [historical capture evidence](../validation/history/mixed-reality-verification.md).

The Jog fixture uses an isolated Chrome profile, temporary receiver storage, synthetic tracking/capture, and reduced raster resolution for the software renderer. Browser texture encoding caused startup audio gaps during development; presentation preparation and the bounded PCM reserve resolved those gaps in the final fixture. Native headset frame rate and acoustic timing still require the checks below.

### Headset check

- Reach Start, Restart Recording, Stop Recording and Exit with both controllers; confirm the side panel does not obstruct the melody row.
- Hear one rising sync cue, then four evenly spaced count-in clicks without overlap. Confirm the phone records that cue.
- Check that chord and percussion begin together on Play, and that selecting the alternative never layers both chord patterns on their shared output.
- Follow the highlighted melody Honks, hold/release rings, rests and orange Eb-to-C wrist guide through all six phrases. Check readability from playing position; verify the rings stay out of the computer composite. After the melody ends, keep playing and confirm capture/backing continue.
- Restart once during count-in and once while holding a note. Check for cancelled old cues, no stuck notes, unchanged placement and a fresh count-in each time.
- Stop, wait for **Take saved**, then Exit and inspect the restored scene. Verify at least two distinct numbered takes in the computer editor, replay both, and download/import one.
- Interrupt tracking or Wi-Fi during an attempt. Confirm music stops, saving is reported honestly, and recovery does not automatically restart a count-in or move the ensemble.

The automated browser fixture uses synthetic capture, real app instruments and Web Audio, and a local receiver. It does not verify headset controllers, tracking quality, audible speaker/phone alignment or device performance.

## Storage, recovery and portability

Each take is written incrementally under gitignored `captures/<take-id>/`: metadata, sample/event/audio NDJSON streams, PCM, finalized WAV and a snapshot of model/texture assets. Access is through paired local API endpoints. HTTPS/WSS use same-origin/host checks and HttpOnly pairing cookies; there is no cloud account system.

Samples, events and audio have independent sequences. Acknowledgements follow writes and `datasync`. Duplicates do not produce duplicate records; sequence gaps are rejected. Reconnection resends unacknowledged packets from the receiver's durable counters. A **32 MiB** worker queue and four-buffer frame handoff bound memory. The same pending queue is spooled to IndexedDB; it is not a whole-take download. Spool availability/quota errors are shown. Queue exhaustion stops capture, records its affected stream/time interval and preserves recovery. The XR callback never waits on disk or network. Before guided recording starts audio, scene preparation sends one complete resource at a time and waits for receiver acknowledgement. This prevents larger fixed backing setups from overflowing the same queue; resource data, audio fidelity, and queue limits are unchanged.

Keep the tab open during reconnection. After a tab reload, pair and use **Recover this browser's pending takes**, one take per click. If the headset tab is unavailable, select the take in the editor and use **Finalize interrupted take** to rebuild WAV from intact PCM. Known missing intervals are displayed; an unknown end is explicitly unknown. Incomplete presentation resources hide affected nodes and report the problem, while intact data remains usable. Power loss may lose unspooled/unacknowledged data, but the laptop's durable portions remain.

**Download portable take** streams a `.honk` archive with metadata, state, PCM/WAV and pinned model/texture files. Import it in this repository's editor on another machine. Asset checksums are verified; import gets a new local ID and retains original identity for project matching. Existing takes are not overwritten. Import limits are 8 GiB total and 4 GiB per file. Version 1 uses RIFF WAV, so split very long recordings before the 4 GiB audio limit.

## Align the fixed phone camera

Select a take and local video. The video does not need to upload to the receiver. Browser decoding respects rotation metadata; preview uses decoded dimensions. Output uses aspect-preserving portrait crop with optional pan/zoom, never stretching. All calibration coordinates mean **1080 × 1920 cropped-output pixels**, origin top left, even at a smaller preview/export size. Changing crop invalidates observations/calibration.

Phone and headset recording start/stop are independent; headset capture does not remotely control the phone. Alignment is manual using a shared sync cue or gesture, then trim selects the portion covered by both recordings. The mapping is `sceneTime = a * videoTime + b`. One anchor fits offset `b`; two anchors at least one second apart also fit clock drift `a`. Use cue positions in phone audio or controller gestures. The clean WAV starts at scene time zero, including initial silence. Phone audio is muted in final exports. **Listen to phone audio for sync** temporarily replaces clean preview audio instead of doubling it. Calibration clicks use the displayed video frame's presentation timestamp. Frame-step buttons step the selected 30/60 fps output grid, not an assumed constant input rate.

After matching timing:

1. Drag the timeline forward or backward to scrub continuously, or use **← Frame / Frame →** and the numeric video-time field. Dragging pauses video and clean audio. Both views follow decoded frames at the same playhead; rapid drags skip intermediate queued positions and settle at your latest choice. Pause on a clear pose for alignment.
2. In **3D scene**, use **Inspect scene** to orbit (drag), pan (right-drag) or zoom (scroll). This changes only your inspection viewpoint. The labeled headset, green left grip and orange right grip show the recorded tracking poses; the yellow phone and portrait frustum show the composite camera.
3. Select **Translate** (**W**, selected by default) and drag its arrows or plane squares. Select **Rotate** (**E**) and drag its rings. Select **Scale** (**R**) and drag a box outward to widen the camera view or inward to narrow it. Scaling changes the lens uniformly, preserving the portrait aspect and metric scene; it does not stretch the phone or instruments. **Q** selects **Inspect scene**. Shortcuts are inactive while typing in fields or exporting. Editing pauses video and clean audio. Orbit is disabled while dragging a handle; dragging elsewhere still lets you inspect the scene.
4. Adjust **Lens / field of view** while watching **Video + instruments**. **Undo camera edit** reverses a complete translation, rotation, scale drag, lens change, numeric edit, reset or solver fit. **Reset camera** returns to the initial camera and can itself be undone.
5. Press **Save this frame**, then click the real **left** and **right** controller grip centers in the phone image (wearer's hands). Instruments are hidden during matching. Skip an occluded controller; lost tracking cannot supply a match. Each completed frame refines the one fixed camera across all saved matches. The first frames use a regularized estimate near the current camera; at least eight well-spread matches enable the full pose/FOV solve. Use 4–6 varied poses. The displayed pixel error is fitting error in 1080 × 1920 coordinates, not independent validation. Grip-center clicks are approximate physical correspondences, kept separate from verified measured landmarks. They do not promise a perfect fit or adjust temporal synchronization.
6. Click saved timestamps to revisit them; save again to replace their clicks, or use **×** to remove a frame and its constraints. Cancel leaves previous matches intact. Each automatic camera change can be undone. Inconsistent full fits are rejected without moving the camera. Open **Fine camera adjustments** for exact position, pitch/yaw/roll, vertical FOV and image-center offsets. The lens readout rounds for display; project files retain full numeric precision. Set trim/output and export after checking an additional pose.

**Controller spheres** and **Controller rays (exported)**, directly below **Video + instruments**, are enabled by default for new projects and can be toggled independently. Solid green/left and orange/right spheres mark tracked grip origins. Matching rays follow the recorded target-ray positions and orientations, even when optional ray presentation objects were not recorded. **Ray appearance** provides independent left/right colors, shared opacity (0–100%) and shared length (0–10 m). Defaults are green/orange, 85% opacity and 1.5 m; **Reset ray appearance** restores them. Length scales only the beam along its pointing direction, preserving origin, orientation and thickness. Rays are direction indicators, not reconstructed hit distances. When enabled, they appear in both the composite preview and exported MP4/PNG frames with the same style. Overall **Overlay** opacity multiplies ray opacity too. Settings are saved as `rayStyle`; old projects without it retain the original appearance. **Headset guide** is a separate optional toggle. Spheres are approximate grip markers, not physical controller outlines. Inspection grid, labels, phone/frustum and handles live in a separate inspection scene. Tracked preview spheres and the headset proxy are also separate from the recorded scene and appear only in the composite preview. Inspection helpers, controller spheres and the headset proxy never render in exports. Controller rays have their own output layer and use the same recorded target-ray poses in preview and export. Guide toggles are saved with the project, including explicit off settings in older projects. Recorded instrument labels remain controlled by **Visible instrument layers**.

Save a project to keep its camera, saved timestamps and controller clicks (`frameMatches`). Reopening restores them; reselect the matching local video. Version 1 projects without matches or saved frames still open. Selecting a different take clears saved frames and resets the camera. Selecting a different video clears saved frames and observations and requires checking timing again. Video matching uses filename, size and decoded dimensions/duration; it is not a content fingerprint. Crop changes keep timestamps but clear image measurements. Timing changes re-sample saved matches from recorded grip poses and refit; advanced measured observations must be collected again. Undo history belongs to the current editing session and is cleared on source/project replacement.

### Optional measured-landmark calibration

Manual alignment requires no landmark offsets or solver setup. Expand **Advanced calibration** only to fit a camera from measured physical landmarks.

Identify a visible physical point on the correct controller model. Enter a **calibrated offset from that controller's XR grip origin**, in meters, and name the landmark. Obtain it from a verified model/profile coordinate mapping or prior measured calibration. This version does not assert a physical landmark for arbitrary controllers or estimate unknown offsets. A generic sphere/grip origin is only a proxy; do not mark its offset verified without an actual calibration. Handedness, profile and offset are saved per observation.

At each synchronized still frame choose the hand, press **Click a controller landmark in video**, and click that physical point. Repeat across holds, reserving at least two additional observations as held-out. The 3D point comes from the recorded **grip pose**, independently of target ray. Lost tracking cannot provide a landmark.

The JavaScript solver fits one fixed metric camera with Huber-weighted nonlinear least squares and multiple pose/FOV initializations. Pose-only mode retains known FOV; pose + focal mode also fits FOV with a fixed image center (centered initially). Insufficient/degenerate/planar observations are rejected. Fitting and held-out pixel errors stay visible. A fit above 15 px fitting RMS or 20 px held-out RMS is flagged failed; it cannot silently become a successful export calibration. Two held-out observations below threshold are needed for the validation indicator. These thresholds do not establish real-camera accuracy.

Fine camera adjustments retain position, pitch/yaw/roll, vertical FOV and image-center offsets. Rotation is Three.js `YXZ` Euler order, displayed as pitch/yaw/roll degrees; camera forward is `-Z`. Projection uses Three.js conventions directly, avoiding an OpenCV axis conversion. Metric scene scale stays fixed. Calibration dots appear on matching frames and are hidden in export, along with controller/headset proxies. Save a project to retain the fixed camera, saved frames, landmarks, profile offsets, fit, mapping, crop, layers, trim, output and take identity. Reselect its video when reopening. Recalibrate after phone movement or an XR-origin change.

## Export and Premiere

Default output is **1080 × 1920**, selectable 30/60 fps. Smaller portrait sizes help testing. Trim is in **video seconds**. Export pauses playback, seeks/decode-waits at each chosen output timestamp, renders through the same camera/crop/layers, then streams one PNG at a time to disk. It does not rely on realtime screen recording or store all rendered frames in browser memory. Cancellation leaves partial files and does not claim a finished movie.

Video presentation callbacks can precede `seeked` and decoded-data readiness. Export waits for completed seeking and `HAVE_CURRENT_DATA`, then copies the phone pixels into a fixed snapshot before compositing. Same-source-frame seeks do not require a fresh presentation callback. Decode failures stop export with the video timestamp; the preview's loading/selection placeholder is never a valid export background. Re-export affected older movies from the saved project and original video.

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

Capture runs after runtime updates, immediately before render, outside scheduler phases that can exit early during spawn preview. Serialization/resource encoding is deferred outside the XR callback. AudioWorklet captures an independent branch of `MasterBus.output`, leaving the speaker connection and gain untouched; its own output is silent. The ordinary recorder uses an eight-buffer pool of stereo blocks of 2048 frames. Jog performance mode requests a bounded 64-buffer reserve (1 MiB) so brief texture-encoding stalls can recycle PCM without dropping blocks; block size and timestamps are unchanged. Sample-index and AudioContext-frame timestamps map to scene time through recorded clock anchors with quantum uncertainty and output-latency diagnostics. PCM is placed at its scene-time offset, preserving gaps. Audio suspension ends/flags the take. External speaker/phone latency is handled by video sync anchors.

Replay constructs only Three presentation objects and shared lighting, with alpha background and no fallback environment, transport, collisions, haptics or synth. Recorded layers cover instruments, labels, wires, tutorial and rays; tracked controller spheres and headset guides are preview-only. Controller target rays are a separate selectable output layer. RGB video has **no reliable body depth**: an overlaid instrument covers a foreground hand. No automatic segmentation or correct occlusion is claimed. The alpha/layer structure supports future imported masks or foreground/background assignments; a person silhouette alone would not solve all hand/instrument ordering.


Guidance capture is explicit: clean MR excludes tutorial/live bend dials; UI capture includes them. Validation recordings use temporary directories and are removed afterward. The app recreates `captures/` and export directories when a real recording needs them.
