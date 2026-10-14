# Import the next MIDI

Use the actual binary file. The importer never obtains notes from a song title, screenshot, or generated event list. `tests/midi/fixtures/synthetic.mid` is an explicit test fixture.

Run the inventory first:

```sh
npm run midi:import -- /path/to/attached.mid /tmp/honk-import
```

The output contains the original bytes named by SHA-256, `normalized.json`, `inventory.json`, and `import-options.json`. There is one `normalized.json` and one canonical `composition.json`; provenance records their hashes. Redundant hash-named copies are not generated. It records filename, byte length, parser/importer versions, options, format, PPQ or SMPTE division, independent sequences, track/channel/port identities, note ranges, density, polyphony, programs, tempo/meter maps, sustain, bends, expression, warnings and repairs. Original event IDs link arrangement decisions back to the source.

The parser is the development-only [midi-file package](https://github.com/carter-thaxton/midi-file), pinned to 1.2.4. A bounded binary preflight rejects malformed/truncated chunks, invalid variable lengths, excessive tracks/events and oversized meta/SysEx payloads before parser allocation. Embedded text and SysEx are retained as data. Parser code never enters XR startup.

Review the inventory before assigning musical roles. Tracks can contain multiple channels. Format 2 sequences must be selected individually. If melody, bass or accompaniment roles remain ambiguous, propose a track/channel/port mapping and ask the user one focused question before authoring the arrangement.

For the supported automatic arrangement path, create an options file:

```json
{
  "id": "stable-composition-id",
  "title": "Composition title",
  "version": 1,
  "sequence": 0,
  "live": { "track": 1, "channel": 0, "port": 0 },
  "transpose": 0,
  "exclusionsReason": "An explicit, reviewed reason for excluding other source roles"
}
```

Then run:

```sh
npm run midi:import -- /path/to/attached.mid /tmp/honk-import /path/to/options.json
```

The source normalization preserves tempo changes, 6/8 and meter changes, pickups, rests, swing/tuplets, equal-pitch overlaps, key releases versus sustain ends, 14-bit bend and declared RPN sensitivity. Missing tempo uses the explicit MIDI default, 500,000 μs/quarter. Missing meter is reported rather than silently assigned. SMPTE stays in seconds. Conflicting simultaneous tempo/meter events are reported with stable ordering. MPE and unsupported controls remain in the source with capability warnings.

Automatic arrangement currently supports a monophonic, constant-tempo live role, at most 28 stable pitch targets, MIDI 36–84, and bends within ±4 semitones. It rejects variable-tempo arrangement generation, overlapping live notes, percussion and pressure mapping that need further authoring. It does **not** automatically arrange every orchestral role. Do not present rejected features or explicitly excluded parts as an exact conversion. Authored backing can use the shared compiler and supported 2/4/8/16-beat timelines; independent chord members need independent routes/durations. Longer or odd-meter backing requires explicit valid splits or additional tested transport support.

The generated definition has one score, stable numeric pitches, source provenance, import options, role assignments, recorded exclusions, layout recipes, phrase lessons and a full guided performance. It references the hash of the separate immutable normalized source. Demonstration, learner assessment, guidance and recording consume that definition. Automatic phrase cuts extend a sixteen-beat window to note releases; review musical phrase boundaries and preserve authored refinements. Imported note velocity remains a cue; source timbre is explicitly substituted by the existing Honk sound.

To register an authored definition, place its JSON under `src/compositions/`, then add only metadata and a lazy loader to `CompositionRegistry.js`:

```js
{
  id: "stable-composition-id",
  title: "Composition title",
  version: 1,
  load: () => import("./DataComposition.js")
    .then(m => m.loadDataComposition("/src/compositions/my-composition.json"))
}
```

Keep the complete import directory (original MIDI, normalized source, inventory, options and composition) in durable project storage before registering it; `/tmp` is only a scratch location. It appears in both libraries. Do not register it until its guided lessons and arrangement have been reviewed. Validation rejects missing guided lessons, a missing final performance, invalid numeric layouts, unsupported live overlap, broken event references, cuts through held notes, and backing that plays a live target. Authored backing uses independent logical role IDs and `outputGroup` identities: equal groups share an exclusive metronome output, different groups play simultaneously. Each Looper has one pattern and seven available Honk sockets after its clock connection. `start: false` leaves an alternate pattern for explicit selection.

Re-import retains explicit `authored.lessons` and `authored.recipes` overrides. Changing the source or arrangement requires a newer content version; identical re-imports retain the same hash. Rejected conversions leave current files untouched. Before replacing current files, the command retains the prior bundle under `versions/`; the archived bundle keeps the former normalized data and composition together. Original MIDI bytes retain their hash filenames. Historical capture replay uses recorded presentation and audio, without importing the score or MIDI.

Run `node --test tests/midi/import.test.js`, `npm run verify`, and `npm run test:audit:browser`. Listen to representative passages against a reference render and perform a headset pass before describing a real-song conversion as musically verified.

## Editing retained compositions

Use the paths in [Current compositions](compositions.md). One musical definition feeds tutorials, demonstration, guidance, assessment and recording. `CompositionDefinition.js` validates common identity, tempo, recording policy, instrument layout, ordered landmarks and lesson requirements; the score-specific validators enforce musical constraints. `SongAdapter.js` supplies the common selected-session adapter. Procedural actions remain in explicit code handlers.

For fixed backing, edit source events and the `fixedBacking` settings, then validate the derived windows and sequences. Do not edit a Looper’s take or routes during playback. Keep source IDs, note gates, rests, bend landmarks and ordered targets intact unless a musical change is explicitly intended. Repeated attacks remain separate events. Never substitute a preview audio render for ordinary Looper playback.

Retain stable IDs and versions when moving unchanged data. Track old recording hashes under `compatibility.recordingHashes`; calculate the new content hash from `JSON.stringify(definitionWithoutContentHash)`. The cleanup’s original musical signatures are in `tests/fixtures/retained-music.json`; change those only for an intentional, reviewed musical revision.

Retained generators produce the canonical definition without a duplicate hash-named JSON. Rishte’s import generator produces its historical imported reference, and its human-arrangement generator produces the current definition. Nazariya’s generator reads the explicitly named prior layout reference. Approved references and source MIDI remain provenance, not alternative editable catalog definitions.

### Definition fields

| Editable area | Fields and ownership |
| --- | --- |
| Identity and evidence | `schemaVersion`, `id`, `title`, `contentVersion`, `contentHash`, `source`, `normalizedSource`, `authoredSource`, `compatibility`; retain source IDs and local provenance references. |
| Timing and recording | `bpm`, `sourceBpm`, `practiceBpm`, `maxBpm`, `recording.bpm/countIn/tailMs/end/synchronization/instructions`; count-ins precede beat zero. |
| Musical score | `score.events` contains stable IDs, `role`, `midi`, `beat`, `beats`, hand suggestions and optional `bend` and ordered `pitchTargets`. Empty intervals are rests. Repeated presses are separate events. Jog uses its canonical phrase score and derived `arrangement.liveEvents`. |
| Instruments and placement | `arrangement.recipes` declares kind, role, pitch, position, scale and supported bend range. The shared melody frame derives its members from score roles; move/rotate/scale/reset logic remains in `MelodyLayoutFrame`. |
| Fixed backing | `arrangement.backing` is the exact musical source; `fixedBacking.outputGroups/volume/placement/terminalGapBeats` controls preparation. `FixedBackingPlan` derives deduplicated recordings, routes and per-attempt sequences. Each pattern has at most seven Honk routes, plus the clock and normal self-percussion lane. |
| Lessons and completion | `lessons` supplies stable IDs, instructions/goals, event IDs, start/end beats, recommended tempo, practice/demo/skip flags, assessment tolerances and final performance. `sequenceLessonIds` and repetitions derive compact sequences without editing source events. Procedural Jog and Basics lessons retain explicit action handlers. |

The shared validators reject invalid identity, timing, layout, ordered targets, recording policies and backing configuration. Song validators additionally check source-event membership, exact note boundaries, playable range and supported voice counts. Regenerating a retained definition preserves its compatibility metadata when the content version is unchanged.
