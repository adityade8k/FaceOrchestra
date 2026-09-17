# Kuch To Hua Hai

Open **Tutorials → Kuch To Hua Hai** in the main app. **Start Lesson** prepares the instruments and presents seven exercises: D-major accompaniment, C-to-D accompaniment, stick groove, three melody verses, and the complete performance. **Full Simulation** records both chord patterns and the percussion groove through the normal controller/contact and looper recording systems, then plays the melody once.

The clock is the app's metronome at 92 BPM with a quiet audible tick and four-beat count-ins. Both backing loopers record fixed four-bar (16-beat) windows with no extra gap. The melody uses all 185 notes from the original MIDI's **Guitar** track. Its pitches, durations and velocities are retained; the two sixteen-beat interludes are shortened to eight beats. The full melody arrangement lasts 136 beats, approximately 89 seconds, after the backing-recording passes.

## Practice

- **Demonstrate** plays the current exercise; **Practice** starts a learner attempt. The same button stops an active attempt. **Next Step** skips an exercise.
- On desktop, hold the labeled note/chord buttons to squeeze and release. Focus a button and hold Space or Enter to use the keyboard. Tap **Boink** or **Hihat** to move the simulated stick through the real collision target and withdraw it.
- In XR, aim at a Honk's bottom sphere and hold Trigger. Touching Honks form each chord. Keep the wrist neutral to preserve the written pitch. Grip in empty space equips the stick; strike the percussion Honk or percussion looper body, withdrawing between hits.
- Practice on each accompaniment step records an actual take. D and C-to-D takes are retained separately in lesson memory and switched through the same chord looper. Record both patterns and the stick groove before practicing the full performance. Melody exercises stay live and do not record another looper.
- Feedback compares observed learner pitches, attack timing, holds, releases and stick withdrawals. Examples do not count toward a learner's score. Recordings remain available even when the score is imperfect; a cancelled recording restores the take from before the attempt.

The prepared ensemble and takes belong to the lesson session. **Exit** restores the previous free-play scene. Examples preserve learner takes. Hiding the tab, losing focus, exiting XR, or a long frame interruption stops the exercise; restart with a fresh count-in. The normal frame loop drives the conductor, so the lesson owns no scheduling timers. At the final musical boundary both backing loopers stop and voices release.

## Musical source

`src/tutorial/kuch/midiReference.js` contains note tuples extracted from the supplied `m4-gtr35-kuch-to-hua-hai.mid`: ticks, duration ticks, MIDI pitch/identifier and velocity at 480 ticks per beat. The Classical Guitar supplies D3/A3/D4/F♯4 and C3/E3/G3/C4/E4 voicings and their rhythm. Drumset beat 24–40 supplies twelve bass-drum and eight snare hits, adapted to the existing boink and hihat stick sounds. Drum identifiers never become pitched Honks. Chord strums receive a short release gap so their gates remain distinct at normal display frame rates.

Score checks: `node --test tests/tutorial/KuchScore.test.js`. Shared regression checks: `npm run verify`. With the app open in a dedicated Chrome profile on debugging port 9225, run `npm run test:kuch:browser`. Set `TUTORIAL_APP_URL` if the server uses a port other than 5173. The browser check performs the full arrangement at normal speed and verifies all 185 live melody notes, recorded stick contacts, harmony launches, audio level, cancellation and scene restoration.
