# Mixed Reality Capture: step by step

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

This requires Node 22 or newer. If HTTPS certificates are not set up, complete [Setup and pairing](mixed-reality-capture.md#setup-and-pairing) first. Use `capture:serve` for recording; the ordinary development server does not receive takes.

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

For setup details, recovery behavior, and optional measured calibration, see the [technical capture guide](mixed-reality-capture.md).
