# Rishte Naate — screenshot melody for two hands (ver-14)

Open **Tutorials → next library page → rishte naate.mid**. **Preview full
arrangement** is available immediately and simulates the suggested two hands
while actual Loopers play the accompaniment. **Replay full arrangement** starts
a fresh four-beat count-in. **Practice / Retry** leaves the selected melody to
the learner. **Previous**, **Next phrase**, **Tempo −5 / +5**, **Stop**, and
**Exit** use the existing eight panel slots. The toolbar retains **Recenter**.
The Metronome handle also changes tempo. Record Songs loads the same version-3
arrangement through the existing XR/receiver workflow.

Initial tempo is **75 BPM**, adjustable from **30 to 115 BPM**. There are
**17 short phrases**, containing 8–13 notes over 5.75–8.79 beats, followed by
**Complete melody**. Phrase 3 starts at at most 50 BPM and phrase 9 at at most
40 BPM; learners can adjust tempo during an attempt. Slower settings persist
between phrases. Tempo changes preserve beat phase and scale melody, backing,
guidance and assessment together. Preview never awards practice credit.

## Source and exact screenshot selection

`ver-13` remains at `fee629663085e8f9c4b245c35963c0e73c4070af`. Its original
MIDI, normalized source, version-1 score and immutable copies are unchanged.
The [version-13 report](rishte-naate-ver13.md) retains the earlier conversion
and verification details. The historical MIDI player is outside this revised
catalog playback path. No push or deployment is part of this change.

The supplied MIDI SHA-256 is
`b5f63cb589b93c0bdab89edbcdaf44a1b0ce6ad4e3e72b6575cf0b96d70eea35`.
It is format 0, one mixed piano track, 960 ticks per quarter, 296 notes and
74.046177 seconds. It contains one 115.000029 BPM tempo event and one 4/4
signature. All notes are on MIDI channel 1 (zero-based channel 0). Channels
1 and 2 each contain 50 pedal messages, but channel 2 has no notes. Pitches
span E2–B5 (40–83), velocities 31–103; 288 notes have pedal extensions.
There are no program changes, separate vocal/percussion tracks, lyrics or
song-section markers. Track name: `Pianoteq 6.7`; instrument-name text:
`Bluethner Cinematic (copy)2`. These names do not configure a Honk voice.

The supplied piano-roll image is preserved as `melody-reference.png`.
`screenshot-match.json` records all **175 visible green rectangles**, each
matched uniquely to a MIDI source ID by pitch and one shared time transform.
The maximum horizontal residual is **0.522 pixels**. The image's **C4 label
corresponds to MIDI 72 / app C5**: its octave-label convention differs by one,
and no musical transposition is applied. This is an explicit sequence match,
not a pitch threshold: selected lower inner notes and overlapping figures are
retained, while an unselected high B5 remains backing.

The first visible selected note is `t0-e25` at source time 2.509239 seconds;
the last is `t0-e693` at 71.454330 seconds. The cropped opening does not identify
a learner part before that first visible note. All unshown source notes,
including the opening, go to backing. No visible match is ambiguous. Short
rectangles have a minimum drawn width, so their durations come from MIDI key
releases, not image width. No lyrics or additional song details are inferred.

`human-composition.json` assigns **175 notes to the learner** and **121 to
backing**, exactly once each. Each event retains its source ID, pitch,
velocity, attack tick and key-release tick. Nothing is deleted, combined,
quantized or transposed; no learner event is doubled by a Looper. All pitches
fit the existing MIDI 36–84 Honk tuning range. Source timing, rests and
simultaneity remain on the original beat grid. At 75 BPM the full score spans
**141.921875 beats / 113.5375 seconds**, plus a 3.2-second count-in. This includes
the source's ending interval; the last padded Looper window stops at the exact
score end instead of repeating.

The source tempo, velocities and pedal ends remain in the preserved data.
In accordance with the requested normal Honk sound, physical key durations
control trigger holds, ordinary trigger strength replaces MIDI dynamics, and
pedal extensions do not lengthen the gates. Normal Honk release tails remain.
No Pianoteq patch, automated vowel changes or piano envelope is applied.

## Hand plan and remaining difficulty

**Right: 115 notes; left: 60 notes.** Hand assignment considers the actual
sequence, occupied hands, attack spacing, release gaps and target travel,
with a preference for the right hand when either is practical. It does not
assign hands by pitch. Overlapping key holds use separate hands; there is no
same-hand hold overlap. Assessment accepts either controller and either
same-pitch target.

Targets remain in stable positions across the entire piece. Full preview and
complete performance show the current phrase and reveal the next phrase one
beat before entry; they do not move targets between phrases. The right cluster
sits at local x = +0.08…+0.56 m; the left at −0.08…−0.56 m, relative to the
centred layout anchor. Each hand has 11 targets, with unused targets hidden in
short practice. Nine pitches have a copy on each side to support alternation
and holds: G♯4, A♯4, B4, C♯5, D♯5, E5, F♯5, A♯5 and B5. Both copies use the
same normal Honk settings. **R** labels are mint and **L** labels orange;
upcoming/held labels brighten beside the normal timing highlights.
Backing Honks sit lower and farther away; all four Loopers and clock are
ordinary visible instruments with real cables. The full scene has 47 Honks,
four Loopers and one Metronome.

| Measurement | Right hand | Left hand |
| --- | ---: | ---: |
| Minimum attack spacing at 75 BPM | 289.17 ms | 591.67 ms |
| Minimum release-to-next-attack gap at 75 BPM | 34.17 ms | 54.17 ms |
| Largest consecutive-target travel | 0.506 m | 0.400 m |
| Notes / distinct targets | 115 / 11 | 60 / 11 |

The two sub-500 ms same-hand transitions at 75 BPM are right-hand
`t0-e123 → t0-e126` (349.17 ms, 0.16 m) and `t0-e306 → t0-e308`
(289.17 ms, 0.16 m). Phrase 3's 50 BPM and phrase 9's 40 BPM extend these to
523.75 and 542.19 ms respectively. All same-hand attack spacings within short
phrases exceed 500 ms at their recommended tempos.

Some legato release gaps remain tight even at those tempos. A held Honk stays
captured while the learner aims toward the next target, but this requires
coordination. The full preview/complete performance at 75 BPM retains the
faster passages; reduce tempo if needed. `human-metrics.json` lists every
flagged transition and travel measurement. These are geometry/timing measures,
not a claim that comfort has been verified on a physical headset.

## Actual Looper playback and recording preservation

The catalog loads `rishte.js`, `RishteEnsemble` and `RishteTutorial`.
`RishteHands` drives two ordinary controller rays for preview; the established
Honk trigger/hold/release path produces the melody. No direct MIDI audio
scheduler is used. Shared sound-engine and instrument code are unchanged.

Backing uses **13 supported 2/4/8/16-beat windows**. Boundaries occur only when
no backing key remains held, preserving all 121 attacks and complete key
durations without fabricated tie attacks. Two windows are genuine backing
rests. Each window splits across at most two Loopers, with at most seven Honk
sockets per Looper and the remaining socket for its clock connection.

Four visible Loopers alternate between two banks. Each connects to a separate
output of the shared Metronome. The existing Looper scheduler pre-arms the
next window at its absolute clock beat; source-duration limits prevent the
old window from repeating while its transport flag awaits the next render
frame. Empty lanes remain silent without dummy notes. Practice excerpts may
start with an already-held backing key and cut backing at the excerpt end;
this boundary clipping is restricted to isolated practice, not full preview.

Accompaniment uses the ordinary Looper volume setting −0.35 (existing mapping:
0.36275 amplitude). The Metronome volume starts at 0.15. These are existing
instrument controls; Honk vowels, timbre, envelopes, vibrato and gain behavior
are unchanged. Examples are prepared on entry. Each attempt saves and restores
all four takes, connections and controls on Stop, Retry, navigation or ending.
New recordings or clears cancel the example and remain protected. Arming then
cancelling without a new take restores the prior take. Exit restores the prior
Play workspace. Preview is demonstration-origin and cannot earn learner credit.

## Rebuild and verification

```sh
python3 scripts/midi/match-rishte-screenshot.py
node scripts/midi/arrange-rishte-naate-human.mjs
npm run verify
node scripts/check-rishte-human-browser.mjs
node scripts/check-rishte-human-browser.mjs --practice-only
npm run test:audit:browser
```

Run the timing-sensitive Chrome checks sequentially. On macOS the focused
scripts select native graphics at half pixel ratio for timing checks. Initial
runs hit the app's interruption guard (including a run with concurrent
renderers); software rendering was also too slow. The guard remains intact.
The application keeps its normal renderer settings. Current-phrase target
visibility reduces visual clutter and drawing work during the full preview.

The [full browser comparison](audits/rishte-human-browser.json) passed with
**175 learner attacks and 121 backing attacks**, the exact melody pitch order,
two overlapping controller holds, 22 hand labels, all 13 backing windows and
12 transitions. At most two current-window Loopers played together. Measured
clock drift was zero; maximum backing onset error was below 0.000001 ms and
maximum controller-preview onset delay was **19.54 ms**. The sampled mix peak
was **0.95666**, below full scale. Both hand copies matched normal Honk sound
controls and gain; backing matched the ordinary Looper gain and controller
release path. The ending left no owned voices, restored the takes and earned
no preview credit. All eight playback/navigation controls were exercised.

The data checks verify every source assignment, unchanged pitch and key ticks,
velocity provenance, exact backing windows, supported capacities, hand
occupancy, recommended-tempo attack spacing, and near-simultaneous controller
attack order. Preview attacks follow render frames; MIDI and Looper score data
retain the precise beat timing. Physical note releases are checked against the
source before compiling ordinary trigger gates.

`npm run verify` passed **700 tests**, plus syntax, import and architecture
checks. The [practice browser check](audits/rishte-human-practice.json) passed
all eight notes in a phrase with overlapping holds while deliberately swapping
the suggested controllers and changing 50 → 40 BPM during playback. Measured
Looper phase error was below 0.000001 beats. An empty retry was rejected;
learner takes survived preview/navigation, cancelled record arming preserved
the original take, a newer clear remained protected, and Stop/Exit restored
clean state. Both slower phrase starts and Record Songs content version 3
were checked. The saved Play scene, including its recorded take, was restored.

The [existing-composition regression audit](audits/rishte-human-regression.json)
passed both earlier song scenes, 50 mode transitions, saved-clock relationships,
workspace recovery, Basics preservation and 49 manual-Honk comparisons. All
three final browser reports contain zero runtime errors. The shared audio
engine, instruments and earlier song implementations have no diff from
`ver-13`.

An earlier completed headless run logged four additional backing voice starts;
the final traced run had exactly 121 and matched every scheduled onset. The
extra starts' cause was not confirmed. Together with the observed frame stalls,
this remains a reason to check playback under actual headset load rather than
claiming that the desktop result establishes XR timing performance.

Physical headset testing remains outstanding for reach, comfort, text/cable
visibility, tracking interruptions and frame rate in the 52-instrument scene.
Browser audio measurements and control-path comparisons do not replace
headset listening. No vocal stem or Pianoteq audio render was supplied;
comparison is against the MIDI events and screenshot, not a sung recording.

## Changed files in this revision

- `src/compositions/CompositionRegistry.js`: content version 3 registration.
- `src/compositions/rishte-naate/{human-composition,human-metrics,screenshot-match}.json`
  and `melody-reference.png`: exact assignments, layout, timing and source image.
- `src/tutorial/rishte/{RishteEnsemble,RishteTutorial,RishteHands,patterns,score}.js`:
  two-hand preview, labels, real Looper windows, practice and assessment.
- `scripts/midi/{match-rishte-screenshot.py,arrange-rishte-naate-human.mjs}`:
  reproducible image match and arrangement generation.
- `tests/midi/rishte-human.test.js`, `scripts/check-rishte-human-browser.mjs`
  and `scripts/validate-rishte-human-practice-browser.mjs`: automated verification.
- `README.md`, this report and `docs/audits/rishte-human-*.json`: usage and evidence.
