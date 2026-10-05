# Rishte Naate — screenshot melody for two hands (ver-14)

Open **Tutorials → next library page → rishte naate.mid**. **Preview full
arrangement** is available immediately and simulates the suggested two hands
while actual Loopers play the accompaniment. **Replay full arrangement** starts
a fresh four-beat count-in. **Demonstrate** plays the current step; the final
step demonstrates the full arrangement. **Practice / Retry** leaves the selected
melody to the learner. **Previous**, **Next phrase**, **Tempo −5 / +5**, **Stop**,
and **Exit** remain available. The toolbar retains **Recenter**.
The Metronome handle also changes tempo. Record Songs loads the same version-3
arrangement through the existing XR/receiver workflow.

During preview and practice, a **white circle** marks the next note until its
expected Trigger attack. At the attack, a **red square** marks the current note
and white moves to the next note. During the final preparation beat, a **large
yellow circle shrinks to its smallest size exactly at the attack**. Press
Trigger at that minimum, then hold as yellow expands to the red square's
edges. Release when yellow reaches red; the current red and yellow disappear
at the scored release. White remains visible through rests and the count-in.

For a repeat on the same Honk, the current red square and next white circle
appear together. Yellow finishes the current hold before the next countdown
starts large and shrinks through the remaining gap. Overlapping notes on
separate targets retain their own current markers and hold circles. Rishte no longer uses a green countdown. Cues follow
the same score beat as the preview
controllers and Metronome, including tempo changes, rather than starting from
the learner's actual press. Visual changes occur on rendered frames.

The composition and initial full preview currently run at **100 BPM** for the
requested tempo trial. The original MIDI tempo remains **115 BPM**. Learner practice
starts at **75 BPM**, with controls adjustable from **30 to 115 BPM**. There are
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
simultaneity remain on the original beat grid. At the current 100 BPM playback
tempo the full score spans **141.921875 beats / 85.1531 seconds**, plus a
2.4-second count-in. At the original 115 BPM it lasts 74.0462 seconds, plus a
2.087-second count-in. At the
75 BPM practice tempo it lasts 113.5375 seconds, plus a 3.2-second count-in. This includes
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
beat before entry; the immediate next target is always visible for its white
circle, even across a phrase boundary or rest. Targets do not move between
phrases. The right cluster
sits at local x = +0.08…+0.56 m; the left at −0.08…−0.56 m, relative to the
centred layout anchor. Each hand has 11 targets, with unused targets hidden in
short practice. Nine pitches have a copy on each side to support alternation
and holds: G♯4, A♯4, B4, C♯5, D♯5, E5, F♯5, A♯5 and B5. Both copies use the
same normal Honk settings. **R** labels are mint and **L** labels orange;
upcoming/held labels brighten beside the normal timing highlights.
Backing Honks sit lower and farther away; all four Loopers and clock are
ordinary visible instruments with real cables. The full scene has 47 Honks,
four Loopers and one Metronome.

### Place the melody before playing

The tutorial shows a blue cuboid around all 22 melody Honks while idle. Hold
Grip (or Trigger) on a rail or **MOVE MELODY** to drag the group in space.
Drag an orange corner to scale the group uniformly; thumbstick left/right
while holding changes size by 10 percentage points. Release to place it.
Both target sizes and spacing scale together from **60% to 200%**. Targets
hidden until later phrases move with the group. Backing Honks, Loopers and
the Metronome keep their positions and sizes.

On desktop, drag the frame or corners with the mouse. **Size**, **Closer**,
**Farther** and **Reset layout** controls are also available. The frame's
**RESET** handle restores the initial placement in XR. Placement stays fixed
and the frame hides during Demonstrate, Preview and Practice, then returns
after Stop or completion. Phrase changes and retries preserve placement for
the current tutorial visit. Hand labels and timing cues follow the targets.

Every one of the 18 steps has **Demonstrate**. Each of the 17 short phrases
demonstrates its melody with its matching Looper accompaniment, using the
same recommended tempo limit as Practice (75 BPM, or 50/40 BPM for the two
fast phrases). A lower chosen tempo is retained. The last step's
**Demonstrate full arrangement** plays all 175 melody notes and 121 backing
notes, including the opening and ending. **Preview full arrangement** remains
available on the short steps. Demonstrations preserve takes, earn no practice
credit, and may be stopped or replayed. The XR panel has an additional action
row so Demonstrate, full preview, tempo and Stop are all available.

The travel measurements below use the initial 100% layout. Resizing scales
these distances by the chosen factor; phrase timing and hand assignments stay
the same.

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
coordination. The full preview at 100 BPM retains the
faster passages; reduce tempo if needed. `human-metrics.json` lists every
flagged transition and travel measurement. These are geometry/timing measures,
not a claim that comfort has been verified on a physical headset.

## Actual Looper playback and recording preservation

The catalog loads `rishte.js`, `RishteEnsemble` and `RishteTutorial`.
`RishteHands` drives two ordinary controller rays for preview; the established
Honk trigger/hold/release path produces the melody. No direct MIDI audio
scheduler is used. MIDI instrument names and velocities do not select a sound.

The backing articulation correction makes scheduled `HonkVoice.update` calls
use the same gain and pitch smoothing as live calls, at their scheduled audio
time. Previously, a separate scheduled branch snapped pitch immediately and
used a 4 ms attack, making backing notes much more percussive than live Honks.
The existing sawtooth source, vowel formants, vibrato, live envelope settings,
gain mapping and controller release are retained. This corrects the common
Looper voice path; ordinary live Honk behavior is unchanged. Note gates and
the composition's 100 BPM playback tempo are unchanged.

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
this boundary clipping is restricted to isolated phrase practice and
demonstration, not the full arrangement.

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
node scripts/check-rishte-human-browser.mjs --cues-only
node scripts/check-rishte-human-browser.mjs --layout-only
node scripts/check-rishte-human-browser.mjs --demonstrations-only
# Isolate the full audio/controller sequence if headless GPU stalls interrupt it:
node scripts/check-rishte-human-browser.mjs --demonstrations-only --audio-timing-only
node scripts/check-honk-articulation-browser.mjs
npm run test:audit:browser
```

Run the timing-sensitive Chrome checks sequentially. On macOS the focused
scripts select native graphics at half pixel ratio for timing checks; the
enlarged-layout and step-demonstration checks use quarter pixel ratio. Initial
runs hit the app's interruption guard (including a run with concurrent
renderers); software rendering was also too slow. The guard remains intact.
The application keeps its normal renderer settings. Current-phrase target
visibility reduces visual clutter and drawing work during the full preview.

The [placement and demonstration audit](audits/rishte-layout-demonstrations.json)
records 711 passing automated tests and checks all 18 Demonstrate controls.
Native browser pointer/controller checks cover moving and resizing all 22
melody targets, including hidden targets, the 60–200% range, fixed backing,
Reset and placement preservation. The final step completed all **175 melody
and 121 backing attacks**, with both hands, 12 backing transitions, restored
takes and a clean ending at a moved 130% layout.

Timing verification has a material limit: full native WebGL runs hit the
existing frame-interruption guard. The completed full-song check therefore
used real Web Audio/controller logic with scene matrix updates during
playback, without rasterizing the 3D scene. It still measured a maximum
77.875 ms late backing onset and 151.025 ms melody onset delay under headless
load. The strict 2 ms backing timing check did **not** pass. These results
verify note coverage and control behavior, not headset frame-rate or timing
performance. The optional `--audio-timing-only` flag affects only the test
harness; the application keeps its renderer and interruption guard.

After the red/white role swap, 711 automated tests passed. A deterministic
browser check sampled 1,053 score positions across all 175 melody notes,
including 81 overlapping-hold samples and 170 same-target repeat samples.
Current red squares, next white circles, unchanged yellow sizes and cleanup
at the ending passed; rendered count-in and hold screenshots were inspected.
This check sampled score positions rather than replaying the audio and did
not test a physical headset.

Before the red/white role swap, the [timing-cue browser check](audits/rishte-timing-cues.json) verified all
175 melody attacks at 100 BPM: yellow changed from shrinking to expanding on
the same rendered frame as each preview controller attack (0 ms frame
difference; maximum delay from the score beat was 16.475 ms). Every frame
checked the nearest red square, countdown size, hold growth and white target,
including two simultaneous holds, repeats, rests and phrase transitions.
Practice showed all eight expected cues without automatic melody, including
a 75 → 50 BPM change. Stop and the ending cleared the cues. Screenshots of
preparation, attack, hold and overlapping notes were inspected. These are
desktop browser checks, not physical headset testing.

The latest [Honk articulation check](audits/rishte-honk-articulation.json)
passed a complete **100 BPM** preview after the sound fix: all 175 melody and
121 backing attacks, all 13 windows and 12 transitions, zero measured clock
drift, backing onset error below 0.000001 ms, and a maximum melody frame delay
of 20.125 ms. The sampled mix peak was 0.95934. Stop, Retry, tempo changes and
phrase navigation passed; the ending released all voices and restored saved
takes without preview credit. There were no browser errors. The earlier
[100 BPM startup check](audits/rishte-tempo-100.json) also confirmed the separate
75 BPM practice setting. The 115 BPM comparison below is retained as history.

The previous [full browser comparison](audits/rishte-human-browser.json) at
115 BPM passed with
**175 learner attacks and 121 backing attacks**, the exact melody pitch order,
two overlapping controller holds, 22 hand labels, all 13 backing windows and
12 transitions. At most two current-window Loopers played together. Measured
clock drift was below 0.000001 beats; maximum backing onset error was below 0.000001 ms and
maximum controller-preview onset delay was **19.34 ms**. The sampled mix peak
was **0.95335**, below full scale. Both hand copies matched normal Honk sound
controls and gain; backing matched the ordinary Looper gain and controller
release path. The ending left no owned voices, restored the takes and earned
no preview credit. All eight playback/navigation controls were exercised.

The data checks verify every source assignment, unchanged pitch and key ticks,
velocity provenance, exact backing windows, supported capacities, hand
occupancy, recommended-tempo attack spacing, and near-simultaneous controller
attack order. Preview attacks follow render frames; MIDI and Looper score data
retain the precise beat timing. Physical note releases are checked against the
source before compiling ordinary trigger gates.

`npm run verify` passed **705 tests**, plus syntax, import and architecture
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
three original browser reports contain zero runtime errors. Those reports
precede the scheduled Honk articulation correction described above; its new
audio regression renders 24 pairs of live/scheduled Honks through real Web
Audio at 48 kHz. It covers MIDI 40, 55, 71 and 83, holds of 60, 350 and 1400 ms,
and both fixed and moving squeeze values. With identical performance inputs,
the maximum relative waveform RMS difference is below 0.00000006, and all
releases end in silence. The previous implementation fails this same check.
This compares synthesized waveforms, not just the values sent to the voice.
`ver-13` remains at `fee629663085e8f9c4b245c35963c0e73c4070af`.

The frame/demonstration checks reproduced the previously observed extra
backing starts and traced them to late scheduling recovery. The Looper used
to cancel all scheduled voices and restart any currently held notes after
falling behind. Recovery now preserves the existing voice when its same
source note is still held. It cancels expired notes, skips missed attacks,
and respects bounded playback windows. Deterministic tests cover a stall
inside a hold, the original release, a missed release, and no attack beyond
the final window. This correction does not change note data or Honk timbre.

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
- `src/audio/honk/HonkVoice.js`, `tests/audio/HonkVoice.test.js` and
  `scripts/check-honk-articulation-browser.mjs`: preserve normal Honk articulation
  during scheduled backing playback and compare real rendered waveforms.
- `docs/audits/rishte-honk-articulation.json`: audio comparison and complete
  100 BPM preview results after the articulation fix.
- `src/tutorial/attackCueState.js`, `src/tutorial/TutorialTimingCues.js` and
  the Rishte guidance: red current-note squares, white next-note circles and
  yellow circles shrinking to the attack, then expanding to the red boundary.
- `tests/tutorial/RishteTimingCues.test.js` and
  `scripts/validate-rishte-cues-browser.mjs`: attack boundaries, rests, repeats,
  overlapping notes, tempo changes and real preview-controller frame checks.
- `docs/audits/rishte-timing-cues.json`: complete preview and practice cue results.
- `src/tutorial/rishte/RishteLayoutFrame.js`, `RishteTutorial.js`,
  `RishteEnsemble.js`, `RishteHands.js`, `src/tutorial/TutorialRuntime.js`,
  `src/app/runtime/RuntimeHost.js` and `style.css`: melody-only placement,
  uniform sizing, controller capture, playback locking and cleanup.
- `src/tutorial/TutorialPanel.js`: one additional optional XR action row for
  per-step Demonstrate alongside full preview and existing session controls.
- `tests/tutorial/RishteLayoutFrame.test.js`,
  `scripts/validate-rishte-layout-browser.mjs` and
  `scripts/validate-rishte-demonstrations-browser.mjs`: frame interaction,
  placement preservation, all lesson demonstrations and moved-layout playback.
- `src/instruments/looper/LooperController.js` and
  `tests/instruments/looper/LooperLaunchRules.test.js`: keep an existing held
  voice during late scheduling recovery instead of creating an extra attack.
- `docs/audits/rishte-layout-demonstrations.json`: placement, step controls,
  full note coverage, and the observed headless timing limitations.
