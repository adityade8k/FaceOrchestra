# Rishte Naate — human melody tutorial (ver-14)

Open **Tutorials → next library page → rishte naate.mid**. **Preview full
arrangement** is available immediately. It plays the same simplified melody
and Looper accompaniment used in practice. **Replay full arrangement** starts
a new four-beat count-in. **Practice / Retry** plays only the accompaniment;
the learner plays the upper melody arc. **Previous**, **Next phrase**,
**Tempo −5 / +5**, **Stop**, and **Exit** fit the eight existing XR panel slots.
The main toolbar retains **Recenter**. The Metronome handle also changes tempo.

The initial tempo is **75 BPM**, adjustable from 45 to 115 BPM. A tempo change
preserves the current beat phase; the Loopers, preview, guidance and assessment
follow that same Metronome. Practice contains 22 two-bar phrases and a final
complete-melody lesson. Preview never awards practice credit. Record Songs
also loads the revised arrangement with the existing XR/receiver workflow.

## Version preservation and source

`ver-14` was created from clean `ver-13` at
`fee629663085e8f9c4b245c35963c0e73c4070af`. The `ver-13` branch, original MIDI,
normalized source, version-1 score and its immutable copies are unchanged.
No push or deployment is part of this change. The [version-13 report](rishte-naate-ver13.md)
retains the original conversion and verification details. Its custom MIDI
player remains a historical source-comparison fixture, outside the revised
catalog playback path.

The supplied MIDI's SHA-256 is
`b5f63cb589b93c0bdab89edbcdaf44a1b0ce6ad4e3e72b6575cf0b96d70eea35`.
It is a format-0 piano file: one mixed track, 960 ticks per quarter, 296 notes,
74.046177 seconds, one 115.000029 BPM tempo event and one 4/4 signature.
All notes are on channel 1; both channels 1 and 2 contain 50 pedal messages,
but channel 2 has no notes. Pitches span E2–B5 (40–83), velocities 31–103.
288 notes have pedal extensions. There are no program changes, separate vocal
or percussion tracks, lyrics, or song-section markers. Track name:
`Pianoteq 6.7`; instrument-name text: `Bluethner Cinematic (copy)2`.
These names do not select a Honk voice.

## Melody interpretation and musical adaptations

The learner line is an interpretation of the sung melody inside the piano's
right hand. It is not a register split or a claim of verified lyric alignment.
The explicit source-ID plan follows recurring contours and cadential arrivals:

- The opening B–C♯–D♯ rise/return and A♯–B–C♯ answers recur with consistent,
  simplified rhythms.
- Repeated E anchors and the later G♯–C–D♯–G♯ rise retain their arrivals.
- Repeated D♯/C♯ answers and B landings remain in the later phrases.
- High descending piano runs, quick neighbours, connecting figures, inner
  arpeggios and the closing arpeggio belong to the Loopers. Left-hand bass and
  harmony also remain in the accompaniment.

Every source note has a traceable disposition in `human-composition.json`:
107 retained melody attacks, 29 repeated attacks combined into those melodic
holds, and 160 notes transferred to backing. No source note is unaccounted for;
no new percussion or lyrics are invented. Pitches are unchanged, and no octave
transposition is needed within the existing MIDI 36–84 Honk tuning range.

This is deliberately an authored teaching arrangement. Harmonic changes in the
performed piano take define 26 four- or eight-beat Looper blocks on a regular
4/4 grid. Two four-beat changes form one practice phrase. Source attack order
and simultaneous supporting notes are retained where the reduction permits;
backing onsets snap to quarter-beat subdivisions. Live attacks use deliberate
phrase rhythms with release gaps. Thus the original expressive timing and
rests are not claimed to be exact. The full revised arrangement is 176 beats,
or 140.8 seconds at 75 BPM, excluding the 3.2-second count-in.

The source tempo, meter, velocities, physical releases and pedal ends remain
in the preserved source data. The active arrangement uses its teaching tempo
and ordinary trigger strength. Pedal extensions are not converted into long
Honk gates. Backing gates derive from physical key holds, capped at 2.2 beats
and bounded before the next equal-pitch attack or pattern end. Melody holds
are intentionally simplified. Normal Honk release tails remain audible.

## Measured human-performance changes

The baseline values were recomputed from the version-13 score before selecting
the new melody. Geometry and event measurements are in `human-metrics.json`.

| Measure | Version 13 | Version 14 at 75 BPM |
| --- | --- | --- |
| Required live attacks | 181 | 107 |
| Live attack intervals below 300 ms | 74 | 0 |
| Fastest attack interval | 177.7 ms | 600 ms |
| Overlapping required holds | 30 | 0 |
| Minimum release-to-next-attack time | Overlaps present | 200 ms |
| Melody targets across the piece | 11 | 9; at most 4 in a short phrase |
| Target layout width | 2.4 m row | 0.860 m arc |
| Travel at the fastest old transition | 0.48 m in 177.7 ms | No corresponding rapid move required |
| Largest adjacent-target travel | 2.16 m | 0.342 m |
| First practice phrase | 99 notes / 39.84 s | 7 notes / 6.4 s |
| Short practice phrases | Long sustain-bound windows | 22 × 2 bars, at most 7 notes each |

Targets have stable positions across all phrases; unused melody targets are
hidden during short practice. Backing Honks sit lower and farther away.
The quickest live intervals are 0.75 beats. They meet the 500 ms design target
through 90 BPM; the optional 95–115 BPM settings are labelled advanced and
have shorter intervals (391 ms at 115 BPM).

## Normal sound and actual Looper playback

The revised catalog entry loads `rishte.js`, `RishteEnsemble` and
`RishteTutorial`. It does not instantiate `MidiScorePlayer`. The shared sound
engine, normal Honk implementation, Looper transport and other compositions
are unchanged. Honks are spawned normally with only tuning, placement and
scale configured. No automatic vowel, nose, instrument patch, custom voice,
MIDI gain envelope, vibrato or release override is applied.

Preview melody presses and releases the same ray-selected trigger used by a
normal Honk. Backing compiles into existing fixed-window Looper timelines with
ordinary trigger strength and controller release. Four visible Loopers form
two Metronome output groups: bass/harmony and upper support. Each group
alternates between two banks. Their existing port transport schedules the
handoff at a complete four- or eight-beat boundary. Each bank uses at most
seven Honk sockets, leaving the eighth socket for the clock. All connections
are real visible cables. Where a block has no upper fill, that lane carries
an existing inner-voice note; there are no invented transport-only notes.

The ordinary Looper volume control is set to −0.35 (its existing mapping gives
0.36275 amplitude) to keep accompaniment below the live melody and provide
mix headroom. This is the existing Looper knob, not an audio-engine override.
The Metronome's ordinary volume control starts at 0.15 for a quiet timing click.
Example patterns are ready on entry. Before each attempt, all four takes,
connections and controls are saved and restored on Stop, Retry, navigation
or completion. A newer learner take changes its revision and cancels the
example without restoring over that take. Exit restores the prior Play scene.

The last patterns have an explicit audio scheduling boundary so a late frame
cannot replay their opening notes after the ending. No extra song repeat or
silent tail is added. Preview is tagged demonstration; only released,
learner-origin live notes enter pitch, onset and duration assessment. Historical
tempo segments keep assessment correct even when a hold crosses a tempo change.

## Rebuild and verification

```sh
node scripts/midi/arrange-rishte-naate-human.mjs
npm run verify
node scripts/check-rishte-human-browser.mjs
node scripts/check-rishte-human-browser.mjs --practice-only
npm run test:audit:browser
```

On macOS the focused browser scripts select native graphics. The source MIDI
and version-13 fixtures remain independently tested. The revised tests check
all 296 source dispositions and unchanged pitches, attack/release spacing,
reachable geometry, phrase lengths, every Looper pattern, ordinary gesture
fields, release origin, tempo-aware assessment and registry integration.

`npm run verify` passed all **699 tests** plus syntax, import and architecture
checks. The [complete browser run](audits/rishte-human-browser.json) played
107 melody and 160 backing attacks across all 26 blocks and 25 handoffs.
Exactly two banks sounded concurrently, with zero measured beat drift at
handoffs. The sampled output peaked at **0.95655**, below full scale. The
ending left no owned voices, restored the takes and awarded no preview credit.
Normal-trigger and ordinary-Looper comparisons at B4 matched pitch controls,
neutral vowel, nose, bend, normal gain mapping and controller release behavior.

The [practice check](audits/rishte-human-practice.json) matched all seven live
notes while changing from 75 to 60 BPM during a hold; the Looper phase error
after that change was below 0.000001 beats. An empty retry failed honestly.
Actual learner recordings survived preview/navigation, newer recording
activity remained protected, cancelled record arming restored the original take,
a later phrase switched its one-bar backing,
and Exit restored a prior Play scene containing a recorded take. The revised
composition also loaded through Record Songs.

The [existing regression audit](audits/rishte-human-regression.json) passed
both prior song scenes, 50 mode transitions, workspace recovery, saved clock
connections and 49 manual-Honk comparisons. All browser reports have zero
runtime errors. The shared sound engine, instruments and other compositions
have no diff from `ver-13`.

Temporary screenshots and raw
reports go to `test-results/rishte-human/`. The browser checks exercise actual
Web Audio, normal virtual-controller trigger interactions, live Looper
recording, Metronome handoffs, preview, practice, retry, tempo adjustment,
phrase navigation, ending, Stop, Exit and restoration of prior takes.

Physical headset testing remains necessary for controller reach, comfort,
legibility, cable visibility, tracking interruptions and sustained frame rate
in the 40-instrument scene. Desktop audio measurements and sound-parameter
comparisons do not replace listening on the headset. No vocal stem, lyrics,
or Pianoteq audio render was supplied for a verified sung-line comparison.

## Changed files

- `src/compositions/CompositionRegistry.js` and `src/compositions/rishte.js`:
  register and load content version 2 through the existing tutorial/recording APIs.
- `src/compositions/rishte-naate/human-composition.json`, `human-metrics.json`:
  reviewed melody, supporting patterns, source decisions, layout and measurements.
- `src/tutorial/rishte/{RishteEnsemble,RishteTutorial,score}.js`: real Looper
  orchestration, scoped controls, preview, tempo-aware guidance and assessment.
- `scripts/midi/arrange-rishte-naate-human.mjs`: reproducible source-ID reduction.
- `tests/midi/rishte-human.test.js` and the two Rishte human browser scripts:
  source, transport, learner, preservation and sound verification.
- `README.md`, the Rishte reports and audit JSON: access and evidence.
