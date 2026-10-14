# Tu Kisi Rail Si

Choose **Tutorials → Tu Kisi Rail Si** for 15 phrase lessons and a complete guided performance. The song is on the third Tutorials page. Choose **Record Songs → Tu Kisi Rail Si** on the second Record Songs page to record it with the shared capture receiver.

All 10 Honks stay visible throughout lessons and guided recording; only their note indicators change with the score. Each distinct pitch has one shared Honk, reused for all repeated notes and playable with either hand. The pitches ascend left to right across two rows, with the higher pitches in the top row.

This arrangement has no Loopers or automatic backing. Every note is performed live. A Metronome keeps time, and two suggested hands preserve the MIDI's overlapping holds.

## Learn the song

1. Grab the blue melody frame to move and rotate it, or resize it with an orange corner. Honks you rearrange retain their positions, orientations, and sizes relative to the frame. **Reset** restores the original layout and brings back deleted melody Honks. Release the frame before starting.
2. Choose **Demonstrate** to hear the current phrase and watch its notes. **Preview full arrangement** plays the entire song. Demonstrations do not award practice credit.
3. Choose **Practice / Retry**. Wait for four Metronome pulses, then follow the note cues. Practice defaults to 60 BPM or your current slower tempo. Use **Tempo −5 / +5** to choose a speed between 30 and 120 BPM; your choice stays in effect across retries, demonstrations and phrase navigation. Tempo changes during the count-in preserve its remaining beats. An already-started sustain keeps its duration; subsequent notes use the new tempo.
4. Aim at the Honk with the highlighted square and hold Trigger. Once it sounds, a yellow circle grows from the center of a fixed white circle over its suggested sustain. The circles only guide you: reaching the edge never stops the sound or locks the Honk. Hold for as long as you like, release Trigger to stop, or keep Trigger held and move onto another Honk to play it. Locked Honks respond across their whole bounding box. Hold Trigger and rotate to bend a note; this MIDI contains no pitch bends.
5. The highlighted square and gray next-note circle follow the song's beat, independently of your playing. Missed notes, short notes, and held notes never delay the next cue. Either physical hand is accepted. Practice, demonstration and guided recording retain the original overlapping notes. A phrase ends on its written final beat and grades your timing, pitch and duration.
6. Use **Next phrase** to continue. The final lesson covers the full 74.5-second source performance. Set 120 BPM to play it at the original speed. **Stop** cancels the current attempt; **Exit** restores your Play scene.

The opening silence is part of the MIDI. After the full-song count-in, wait about 1.40 seconds for the first note at 120 BPM.

## Easy version with backing

Choose **Tutorials → Tu Kisi Rail Si — Easy** on the third page, or **Record Songs → Tu Kisi Rail Si — Easy** on the third recording page. This is an additional arrangement using Raag Jog's approach: play the melody live while harmony and percussion Loopers accompany you.

- 78 melody attacks instead of 159, using the same 10 distinct pitches and one melody Honk per pitch.
- The tutorial defaults to 80 BPM, adjustable from 30 to 120 BPM. Ten phrase lessons and a complete 114-second performance at the default tempo. Guided recording runs at **115 BPM**, with the count-in, backing and sustain indicators sharing that tempo.
- Attacks fall on whole beats. Repeated pitches are joined, shorter colliding ornaments are omitted, overlapping holds are shortened, and every attack has a release gap. One hand can play the entire melody; either hand is accepted.
- A gentle open-fifth harmony and percussion pulse repeat every 16 beats in two normal Loopers. Their backing Honks sit below the melody frame. Automatic backing never plays the learner's melody targets.
- All cues follow the shared Metronome through the count-in and song. If you miss a note, rejoin at the current highlighted square.

The backing is newly authored; it is not a track extracted from the original MIDI. The easy score records the source IDs behind each retained or merged note and lists omitted ornaments. The original live-only arrangement remains available. Regenerate the easy arrangement with `node scripts/midi/arrange-tu-kisi-rail-si-easy.mjs`.

## Record the song

Use the existing [receiver and phone-video setup](mixed-reality-step-by-step.md). Enter XR, choose the song in **Record Songs**, prepare the ensemble, and start your phone video before choosing **Start**. One captured synchronization cue precedes a four-beat count-in. The full melody then has the same timing cues as the tutorial, at **120 BPM for the original** or **115 BPM for Easy**. The app does not play the melody for you.

**Stop Recording** saves the take; **Restart Recording** saves the current attempt and starts a new one. The end of the score stops the Metronome; recording remains open until you stop it. Each take identifies this composition, version, arrangement, content hash and starting BPM.

## Source and authoring

- Source: `tu-kisi-rail-si.mid`, SHA-256 `ce00474f06ea7e4b5af71ae009ca99c12fe8d1ef368d9a06b73dcd7924620f46`.
- Format 0; one track, channel 0, port 0; 480 ticks per quarter; 120 BPM.
- 159 notes, MIDI 51–69, maximum two concurrent holds; approximately 74.496 seconds.
- All source attacks, pitches, key releases, overlaps, rests and velocity metadata are retained. No notes are removed, quantized, transposed or assigned to backing.
- The source contains no meter event. Teaching uses quarter-note pulses and a four-pulse count-in; no musical time signature is inferred.
- The source track is labelled “approximate performance.” The tutorial follows the supplied MIDI; this is not a claim of accuracy against a commercial recording.
- The normal Honk sound replaces the source piano program. Source velocities remain provenance; ordinary Honk Trigger-play dynamics apply.
- Original bytes, normalized events, inventory, import options and hash-addressed source/arrangement copies live under `src/compositions/tu-kisi-rail-si/`.

Regenerate the reviewed arrangement with `node scripts/midi/arrange-tu-kisi-rail-si.mjs`. It verifies the source hash, assigns two non-overlapping hand lanes and cuts phrases only where neither hand is holding a note. A different source requires a new review and content version.

## Validation

Run `npm run verify` for source integrity, shared-pitch targets, phrase coverage, backing timelines, assessment, catalog integration, Tempo button regression tests and recording-session tests. Run `node scripts/check-tu-kisi-rail-si-browser.mjs` for the original arrangement or add `--easy` for the new version. These checks cover a full demonstration, desktop and XR Tempo buttons, beat-based cues through silence and held notes, a missed phrase that finishes on time, and a saved recording through the local receiver. Captures and reports go to `test-results/tu-kisi-rail-si/` and `test-results/tu-kisi-rail-si-easy/`.

The browser test uses actual instruments, controller rays, Web Audio, the recorder and receiver, with synthetic controller input and tracking. Physical headset/controller comfort and external phone synchronization require a headset pass.
