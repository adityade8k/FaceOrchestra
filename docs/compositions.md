# Current compositions and musical provenance

Each retained song has one editable definition. `src/compositions/CompositionRegistry.js` contains the small lazy catalog. Internal IDs, content versions and lesson IDs stay stable; changed recording hashes retain their previous identities in `compatibility.recordingHashes`. Historical captures replay their stored presentation/audio rather than loading today’s score. The migration baseline is locked by `tests/fixtures/retained-music.json`.

| Composition | Editable definition | Honks | Prepared Loopers |
| --- | --- | ---: | ---: |
| Raag Jog | `src/compositions/jog/definition.js` | 20 | 3 |
| Kuch To Hua Hai | `src/compositions/kuch-honk-orchestra/composition.json` | 25 | 21 full / 14 compact / 2–4 phrase (previously 4) |
| Rishte Naate | `src/compositions/rishte-naate/composition.json` | 47 | 22 full / 2–4 phrase (previously 4) |
| Tu Kisi Rail Si | `src/compositions/tu-kisi-rail-si/composition.json` | 10 | 0 |
| Nazariya Ki Maari | `src/compositions/nazariya-honk-bends/composition.json` | 10 | 0 |

Each prepared ensemble uses one Metronome. Kuch therefore grows from 30 to 47 total instruments for full performance (40 compact, 28–30 phrase), and Rishte from 52 to 70 (50–52 phrase). Before each attempt, only its required patterns are prepared. Matching unchanged recordings and routes are reused across attempts; unused unedited patterns can be retired. The complete pattern inventory across every excerpt contains 33 Kuch and 64 Rishte patterns, but they do not all need simultaneous instruments. These changes have not been established as performance-neutral. Rendering quality, audio scheduling, fidelity and dependencies are unchanged.

Tu Kisi Rail Si — Easy was removed from Tutorials, Record Songs and the catalog. Its dedicated definition, adapter, generator and tests were removed. Saved Play workspaces are not erased. Nazariya Ki Maari keeps the internal ID `nazariya-honk-bends`; only its displayed title changed. Approved reference files can retain historical titles because their bytes and hashes are provenance.

## Fixed backing in free play

Use the same ordinary Honks, Loopers, Metronome cables and transport controls as in Play. The `arrangement.backing` events are the musical source. `BackingPatterns.js` partitions them into supported 2/4/8/16-beat windows without cutting a full-song held note. `FixedBackingPlan.js` derives distinct recordings and each lesson’s ordered sequence. `arrangement.fixedBacking` supplies output groups, volume and placement. The compact sequence derives from `sequenceLessonIds` in the same definition.

1. Place the Honks at their recipe pitches and ranges. Keep melody targets separate from backing tracks. Use the authored vowel/nose expression and Looper volume shown by the definition/compiler.
2. Prepare one Looper per distinct pattern. Reserve track 0 for its clock; at most seven remaining tracks route to Honks. Hi-hat uses the normal Looper self-percussion lane. Keep each recording’s full window, including rests, and set Gap to zero for patterns with an immediate successor. The last pattern before a written silence or ending uses the ordinary one-beat Gap control; Stop during that silent gap prevents another repetition without cutting the final hold. Its recording still contains the complete original cycle. A terminal variant is separate when the same pattern also needs zero-gap repetitions earlier.
3. Connect every **foundation** alternative to one Metronome output and every **figures** alternative to another. The layers can sound together; alternatives on one output are exclusive. Jog uses one shared output for Chord/Alternative Loopers and an independent output for percussion.
4. Start the clock and select each layer’s first pattern at its authored start. Leading or intervening silent layers stay stopped until their scheduled start. While a pattern actually plays, press Play on the next alternative to queue its handoff at the outgoing cycle boundary. A shared output does not automatically visit every connected Looper. Repeated identical patterns can keep looping. Use Stop at a written silent segment or the performance end.
5. Leave recordings and connections fixed during the attempt. Stop cancels all armed launches and queued alternatives. A recording or connection edit interrupts guided backing and keeps the learner’s work; explicitly prepare again to replace it. Changing excerpts never silently discards an edited take.

There are four Metronome outputs, eight tracks per Looper, supported beat windows of 2/4/8/16 and a 120-second recording bound. No limit was extended. Even a 16-beat window at the minimum 30 BPM fits the recording bound. There is no hard free-play Honk/Looper count cap; only one Metronome is admitted. The conductor issues ordinary transport actions; it does not synthesize a parallel backing player.

## Kuch To Hua Hai

The tutorial is version 7, using approved arrangement version 6 of `kuch-to-hua-hai`, at 92 BPM and 192 beats (about 2:05). It replaces the shortened version in Tutorials and Record Songs, including the older Kuch launch buttons.

The user plays only the melody. All 185 original melody pitch targets remain at their original onsets, grouped into 65 gestures with 36 continuous bent holds: 19 fewer Trigger presses than version 3. Phrases 2, 4 and 6 now use the approved two-hold split. The G4 hold continues through F♯4–E4–D4, followed by a separate B3–A3 hold, instead of three back-to-back holds. The existing repeated A3 joins remain. Phrases 1, 3 and 5 and all backing are unchanged.

Only the G4 melody Honk has an extended five-semitone bend range, allowing its descent to D4. Other Honks retain four semitones. Pitch change per wrist degree and the current reduced sensitivity remain unchanged; the extra semitone requires extra wrist travel. Guidance, demonstration, audio, and saved Honks share the range. The bend gauge and Guided Play Offset use the same score in phrase practice, the six-phrase run-through, and recording.

- 213 hi-hat strikes at the original Drumset onsets, on each Looper's self-percussion track.
- 289 boink strikes on the percussion Honk, at the original bass-guitar onsets.
- 90 flute notes sung by A-vowel Honks, retaining their pitches and lengths.
- 495 chord notes from the classical-guitar part, on O-vowel Honks with the original voicings and timing.

The intro, instrumental breaks, and outro are included. The two unassigned pad tracks are excluded, matching the approved five-part preview. No melody target is connected to any backing Looper. Learners are never asked to recreate the backing before practicing the melody.

The arrangement uses the existing HonkVoice, stick-percussion profiles, Looper playback, Metronome, and controller-based demonstration path. Ordinary recorded vowel/nose controls and Looper volume balance the backing; the synthesis and master audio settings are unchanged. No preview audio file is played inside the app.

The six phrase lessons preserve their exact excerpts. Lesson 7 joins them into a 120-beat run-through after one two-beat count-in. The complete lesson and guided recording retain the full 192 beats at 92 BPM, including intro, breaks and outro. All 185 melody pitch targets and 65 gestures are unchanged by this cleanup.

The source MIDI, `approved-composition.json` and `approved-preview.json` remain beside the canonical definition, with hashes checked by tests.

## Rishte Naate

175 screenshot-selected melody notes and 121 backing notes retain all 296 MIDI attacks and key releases. Playback stays at 100 BPM, source tempo at 115 BPM and suggested practice at 75 BPM; controls permit 30–115 BPM. There are 17 phrase lessons and one complete performance. Either hand can play each target; demonstration hands preserve overlaps. The screenshot’s C4 corresponds to MIDI 72 / app C5; no transposition was applied. `melody-reference.png` and `screenshot-match.json` preserve this evidence.

The source is a mixed piano track at 960 PPQ, with pedal metadata, no independent vocal or percussion track and no authored melody bends. The earlier imported arrangement is retained at `provenance/imported-arrangement.json` for MIDI import/player validation. It is not the catalog definition. Detailed historical matching and hand-planning evidence is in [the historical record](../validation/history/rishte-naate.md).

## Tu Kisi Rail Si

All 159 MIDI notes retain their original pitches, onsets, key releases, overlaps and opening rest. Ten shared Honks cover the distinct pitches. Fifteen phrases precede the complete performance at 120 BPM; recommended practice starts at 60 BPM. There is no automatic backing and no authored bend. The source MIDI, normalized source and import options remain beside the definition. Rebuild with `node scripts/midi/arrange-tu-kisi-rail-si.mjs` after reviewing source changes.

## Nazariya Ki Maari

The approved 70 BPM screenshot arrangement retains 58 gestures, 26 authored bends and 135 ordered screenshot pitch targets. Ten Honks, seven phrases and a complete performance use the shared tutorial, demonstration, assessment and recording path. No melody or bend treatment changed. Preserve the original MIDI, `screenshot-notes.json`, the approved arrangements and the `provenance/layout-v1.json` through `layout-v4.json` reference chain. Version 4 supplies the established placement. Historical snapshots keep their content hashes; `provenance/references.json` resolves their former hash-based paths. `authoredSource.sourceCompositionFile` resolves that reference explicitly.

## Raag Jog

“VIRAG 2 — JOG STUDY” is an original Jog-inspired instrument study. It does not reproduce a named song or traditional bandish. Sa is C, tempo is 80 BPM, and the written 16-beat exercise spans 12 seconds. Completed backing loops retain 16 beats; manually shortened loops retain their actual performed lengths with no added gap. The accompaniment and percussion pattern are an original arrangement, not a claim of authentic tabla bols.

The note treatment draws on [Tanarang's Jog description](https://tanarang.com/raag-jog/) and [Rajan Parrikar's Jog discussion](https://www.parrikar.org/hindustani/jog/). Both discuss the Ga variants and the descending komal-Ga-to-Sa gesture. Parrikar describes differing treatments of Ni; this study consistently chooses komal Ni (Bb) and does not prescribe a universal vadi. D and A are not settled melody notes. Continuous bends may pass through intermediate frequencies.

The physical melody Honks are C4, Eb4, E4, F4, G4, Bb4, C5. The panel distinguishes `G = E4` (shuddha Ga) and `g = Eb4` (komal Ga). Each descending bend holds Eb for 20%, glides down over 50%, and settles on C for 30%. A following C4 event is articulated separately.
