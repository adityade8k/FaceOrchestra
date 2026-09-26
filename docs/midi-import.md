# Import the next MIDI

Use the actual binary file. The importer never obtains notes from a song title, screenshot, or generated event list. No real song was added in this audit; `tests/midi/fixtures/synthetic.mid` is an explicit test fixture.

Run the inventory first:

```sh
npm run midi:import -- /path/to/attached.mid /tmp/honk-import
```

The output contains the original bytes named by SHA-256, `normalized.json`, `inventory.json`, and `import-options.json`. Normalized sources and generated compositions also have hash-named copies; composition provenance references its specific normalized copy. It records filename, byte length, parser/importer versions, options, format, PPQ or SMPTE division, independent sequences, track/channel/port identities, note ranges, density, polyphony, programs, tempo/meter maps, sustain, bends, expression, warnings and repairs. Original event IDs link arrangement decisions back to the source.

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

Re-import retains explicit `authored.lessons` and `authored.recipes` overrides. Changing the source or arrangement requires a newer content version; identical re-imports retain the same hash. Rejected conversions leave current files untouched. Before replacing current files, the command retains the prior bundle under `versions/`; hash-named source and composition copies also remain available. Historical capture replay uses recorded presentation and audio, without importing the score or MIDI.

Run `node --test tests/midi/import.test.js`, `npm run verify`, and `npm run test:audit:browser`. Listen to representative passages against a reference render and perform a headset pass before describing a real-song conversion as musically verified.
