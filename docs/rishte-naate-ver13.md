# rishte naate.mid

The supplied MIDI is registered as **rishte naate.mid** (`rishte-naate`, content
version 1). Open **Tutorials**, go to the second library page, and select it.
**Demonstrate** plays the current section. Use **Next / Skip** to reach
**Complete performance** for the uninterrupted piece. **Practice / Retry**
plays the accompaniment while you perform the upper row. **Pause / Resume**,
**Stop**, **Previous**, **Next / Skip**, **Recenter**, and **Exit** are available.
It also appears in **Record Songs**, using the existing receiver and XR capture
workflow with a live melody and automatic accompaniment.

## Source inventory

The source is the actual 2,662-byte binary supplied by the user, preserved under
`src/compositions/rishte-naate/`. Its SHA-256 is
`b5f63cb589b93c0bdab89edbcdaf44a1b0ce6ad4e3e72b6575cf0b96d70eea35`.

| Property | MIDI evidence |
| --- | --- |
| Format and resolution | Format 0, one track, 960 ticks per quarter note |
| Track name | `Pianoteq 6.7` |
| Instrument-name metadata | `Bluethner Cinematic (copy)2` |
| MIDI programs | No program-change events; no GM program inferred |
| Channels (one-based) | Channel 1: all 296 notes and 50 sustain messages. Channel 2: 50 sustain messages, no notes |
| Tempo | One event: 521,739 microseconds per quarter note, approximately 115.000029 BPM |
| Meter | One 4/4 time-signature event |
| Duration | 74.046177140625 seconds, 141.921875 quarter-note beats |
| Pitches | MIDI 40–83 (E2–B5), 26 distinct pitches |
| Velocity | 31–103 |
| Sustain | 288 notes extend beyond key release; maximum 31 sounding voices |
| Other events | One sequencer-specific metadata event; no pitch bends, pressure, percussion, lyrics, title, or section markers |

The track and instrument names identify a piano performance. The file does not
label melody, bass, harmony, song sections, composer, or performer. The filename
is used as the title. No other song facts were inferred.

## Arrangement and adaptations

Every source note has one score event with its original event ID, pitch,
velocity, onset, key release, pedal-aware sounding end, and tick positions.
There is no quantization, transposition, trimming, note omission, or new
percussion. The source tempo and meter maps are retained. Repeated pitches
under sustain have independent voices, so a new attack does not silence an
earlier note.

The mixed piano part is split into an inferred upper melody (181 notes), bass
below MIDI 60 (67 notes), and remaining harmony (48 notes). The reviewed
upper-register accompaniment exceptions are explicit source-event IDs in
`import-options.json`; this is an arrangement interpretation, not a claim about
separate MIDI tracks. All three parts play in Demonstrate.

Thirty playable Honks form three rows. Melody uses vowel A, harmony O, and bass
U. Separate parts sometimes share the same pitch, hence 30 targets for 26
distinct pitches. Every pitch fits the existing MIDI 36–84 composition range;
no octave changes are required. Audio gain uses the original velocity divided
by 127, with bass/harmony at 65% of the melody level and fixed polyphony
headroom. The existing Honk oscillator, formants, vibrato and master bus replace
the piano timbre. A Honk sustains rather than reproducing the piano's acoustic
decay. Gates close at the source's pedal-aware endpoints, followed by the
existing voice's 10 ms de-click release.

Practice and Record Songs leave the melody to the player. Guidance and
assessment use the original melody **key-release** times; controller-held
Honks have no sustain pedal. Automatic accompaniment retains pedal duration.
Full Demonstrate preserves the entire MIDI's sounding durations. Brief
overlapping melody key holds may require both hands. No practice completion
is awarded to a demonstration or a resumed, partial practice attempt.

The generic MIDI importer only supports a non-overlapping live line, while
Looper patterns are limited to 2/4/8/16 beats and seven Honk sockets after the
clock connection. This composition therefore uses a separate score adapter
under the existing registry/ensemble/tutorial interfaces. It schedules the
existing Honk voices against Web Audio time with 150 ms look-ahead. It does
not change the generic importer, Loopers, or existing compositions. The
Metronome displays the rounded source BPM and is silent during playback;
tempo editing is locked while playing to keep source timing intact.

Five practice windows nominally begin as sixteen-beat spans and extend to
include every crossing sustain. Their endpoints are 39.844555, 49.619009,
59.694550, 68.061396, and 74.046177 seconds. They are numbered phrases, not
invented verse/chorus labels. A sixth lesson plays the whole score continuously.
There are no loops or repeated sections added. Pause cancels sounding and
scheduled voices; Resume restarts voices still held at that score position
with their remaining duration. Stop, section navigation, and Exit cancel all
owned voices. The natural ending releases the final pedal chord automatically.

All original metadata remains in the normalized source. The sequencer-specific
payload is not interpreted as instructions or reproduced as audio. Channel 2's
pedal events have no notes to affect. No unsupported source note controls were
discarded.

## Rebuild and verification

The durable bundle contains the original hash-named MIDI, normalized source
(including its immutable hash-named copy), inventory, explicit arrangement
options, and generated composition (including its hash-named copy). The runtime
loads only the selected composition. The binary parser is development-only.

To reproduce the reviewed arrangement from that bundle:

```sh
node scripts/midi/arrange-rishte-naate.mjs
node --test tests/midi/rishte-naate.test.js tests/midi/import.test.js
npm run verify
node scripts/check-rishte-naate-browser.mjs
npm run test:audit:browser
```

The focused tests independently walk the binary MIDI events and compare all
296 attacks, pitches, velocities, key releases, and pedal ends with the score.
They also verify scheduled audio times, same-pitch overlaps, section boundaries,
rest preservation, practice routing, cancellation, and resumed sustains.

The browser check loads the actual application in an isolated Chrome profile,
exercises the controls and libraries, runs the complete 74.05-second performance
at real time, compares scheduled pitches/times/velocities, measures output audio,
and checks that the ending and Exit leave no owned voices. Its report and
screenshot are written to `test-results/rishte-naate/`.

The completed [browser run](audits/rishte-naate-browser.json) played all 296
notes, reached 31 simultaneous voices, and ended with zero owned voices and
zero browser errors. Scheduled starts and releases matched the score to less
than 0.000000001 seconds. The shortest scheduling lead was 131 ms. Measured
output peaked at 0.463 (below clipping). Pause/resume, Stop, section navigation,
practice routing, Record Songs registration, and restoration of the prior Play
workspace passed. Chrome's native graphics backend was used; software rendering
stalled this scene and triggered the interruption guard.

`npm run verify` passed all 694 tests and the import/architecture checks. The
existing browser regression audit also passed, including both prior song
scenes, 50 mode transitions, workspace recovery, and manual Honk regressions.

Changed and added files:

- `src/compositions/CompositionRegistry.js`: lazy catalog registration.
- `src/compositions/rishte-naate/`: durable source and generated score bundle.
- `src/compositions/MidiPerformance.js`: composition validation, ensemble,
  guided practice and transport controls.
- `src/compositions/MidiScorePlayer.js`: independent polyphonic Honk voices.
- `scripts/midi/arrange-rishte-naate.mjs`: reproducible authored conversion.
- `scripts/check-rishte-naate-browser.mjs`: real-time application verification.
- `tests/midi/rishte-naate.test.js`: binary-source comparison and transport tests.
- `README.md`, this report, and `docs/audits/rishte-naate-browser.json`: access
  instructions, musical decisions, and recorded verification evidence.

Desktop automation does not verify physical Quest interactions or make a
listening comparison against a Pianoteq render. No such render was supplied.
The exact event comparison verifies musical data fidelity; the sound remains
an intentional Honk interpretation.
