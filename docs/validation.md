# Automated validation and headset checks

Run checks against the current working files. Reports under `validation/history/` are historical evidence, not current pass results.

```sh
npm run verify
npm run test:compositions:browser -- --full
npm run test:jog:browser
npm run test:basics:browser
npm run test:capture:browser
```

`verify` checks syntax and relative imports in `src/`, `capture/` and every maintained JavaScript script, then runs all Node tests. This includes dynamic import paths, capture workers/worklets, MIDI authoring, musical migration signatures, Looper transport, assessment, snapping, dial/haptics and capture lifecycle.

The common composition browser runner checks the five-entry catalog and displayed Nazariya title, tutorial entry, phrase/full demonstration, melody order, fixed backing takes/routes, exact backing attack counts and scheduled onsets, tempo selection, frame movement/scaling/reset, guided recording and scene restoration. Raag Jog retains its procedural tutorial; its dedicated recording runner covers prepare, restart, simultaneous backing, capture identity and restoration. The shared-source tests check all authored bends in Jog, Kuch and Nazariya in practice and guided recording, including delayed progression, reversals, retries, turning/final limits and independent controller ownership.

`FixedBackingEnsemble.test.js` exercises actual Looper transports for every phrase, Kuch’s 120-beat compact run-through, and both complete performances. It compares scheduled pitched attacks, releases, percussion strikes and Kuch vowel/nose controls, checks simultaneous output layers, fixed timelines/routes, queued boundaries, cancellation, restart and conflicting edits. Normal-play feedback tests cover both bend ranges, processed pitch, jitter protection, one pulse per frame, release, deletion, disconnection and disabled feedback. It has no score or pitch-writing API.

MIDI regression signatures compare every retained score, live event, backing event and Honk recipe to the pre-cleanup working files. Generator round trips run in temporary copies and ensure that authoring preserves music, settings and compatibility metadata without recreating redundant hash-named JSON. Historical Nazariya provenance hashes and renamed reference paths are checked separately.

The capture browser check covers real app assets and PCM, forced receiver disconnection/recovery, deterministic replay/scrubbing, presentation transforms, editor calibration, project reopening, ray styling, video decoding, MP4/PNG/WAV export (including 1080×1920 at 60 fps), and portable archive import. Guided capture preparation waits for acknowledged resources before starting audio; a regression check verifies bounded preparation and cancellation.

Browser runners create isolated profiles and temporary take stores. They remove those stores when finished. Screenshots and reports go to `test-results/` or the OS temporary directory, never maintained documentation. Remove `test-results/` after reviewing disposable results. Do not use the user's normal browser profile or recordings for validation. The legacy `run-tutorial-browser.mjs` intentionally attaches to an explicitly opened dedicated CDP test profile; it remains useful for procedural and port-specific checks.

A desktop synthetic controller/recording fixture does not establish headset behavior. Complete the [manual XR checks](manual-xr-regression.md) for controller feel and wrist sensitivity, independent haptics and jitter, audio mix, five-semitone reach, frame rotation/placement, controller loss/reconnection, XR session changes, passthrough and phone-video alignment. The larger fixed backing setups need a real headset run; no performance-neutrality claim is made.

## Cleanup verification record

The pre-edit verification passed 882 tests and loaded all six then-current compositions in isolated Chrome. The recoverable source checkpoint is `/private/tmp/honk-orchestra-checkpoint-20261014-110807/` (`source.tar.gz`, SHA-256 manifest, working-tree patch and baseline musical definitions). It excludes recordings, disposable generated reports, dependencies and vendor files.

The cleanup removed Tu Kisi Rail Si — Easy, retained Nazariya's internal ID while renaming its display title, and preserved all retained melody/backing signatures. The completed `npm run verify` passes 864 tests and checks 308 source files. Isolated Chrome loaded all five retained compositions; all four prepared-song full demonstrations and guided captures passed. The final Kuch and Rishte full runs matched all 1,087 and 121 backing attacks respectively, with scheduled onsets within 2 ms and fixed takes/routes. Jog's dedicated fixture passed three captures and restart/cancellation. Capture/replay/export, including the full-resolution export and archive round trip, also passed. Frame browser checks passed full grab rotation, edited-pose preservation, deleted-Honk reset/recovery and rotated demonstrations. The Basics browser fixture completed all procedural lessons with no browser errors. The Rishte learner fixture passed swapped hands, live tempo changes (50→40 BPM), empty-attempt rejection, conflicting take preservation, clock Stop and nonempty workspace restoration. Local recording and temporary validation output directories are cleared after verification. Physical headset checks remain unperformed.
