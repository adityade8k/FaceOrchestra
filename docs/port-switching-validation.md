# Port-group playback validation — ver-12

## Branch

Fetched remote refs before editing; the working tree was clean. `ver-12` did not exist locally or remotely. Created it from `codex/kuch-tutorial` at `871054d11758b71ccade2e23be12350824a635d3`, the newest local app/tutorial implementation containing both Jog and Kuch lessons. Its ancestor `origin/fix/faithful-looper-playback` remains at `472e6df9`; `origin/kuch-toh-hua-hai` remains at `179aa674`. The divergent composition branch was not merged. All implementation changes are on `ver-12`.

## Behavior

Each Looper retains one recording with its instrument tracks and simultaneous voices. Alternative pattern Loopers share one Metronome output and keep separate cables. Each `(metronome ID, port ID)` group has one active reservation and one pending selection. Other outputs remain independent.

Idle Play selects the requested recording for the next beat. Start All preserves active/armed selections and pending switches, choosing the most recently connected eligible recording for each idle output. Same-port selection queues until the outgoing full cycle ends, including rests and Gap. The audio scheduler prevents the outgoing next repetition, cancels stale incoming/future percussion work and retimes a prepared handoff when BPM changes. A legacy fractional cycle waits only until the first beat at or after completion.

Playing, queued, starting and idle states are visible on the existing Looper label; the queued Play indicator pulses amber. Cleanup covers Stop, Pause, recording, clearing, disconnection, deletion, clock stop and scene reset. Direct Metronome-to-Honk behavior remains covered.

Jog and Kuch each use separate alternative pattern Loopers and a separate output for percussion. Both have real switch-and-return exercises. Kuch no longer swaps alternate saved takes into one Looper. Learner credit requires fresh transport handoffs and observed queued states; demonstrations cannot earn learner credit.

## Automated checks

- `npm run verify`: **540 tests passed**, zero failures; syntax, imports and architecture guards passed for 170 source files.
- `git diff --check`: passed.
- Static browser ES-module application: no `build` script or bundling step is configured. The source checks and browser runs validate the served application.
- Focused regressions cover fan-out connections and removal, serialization/restore, reserved starts, explicit/fallback selection, independent clocks/ports, full-cycle switching, rests/offsets, different lengths, legacy timing, tempo changes in lookahead, replacement/cancellation, queued percussion promises, recording replacement, all playback entry points and tutorial evidence/cleanup.
- Corrected stale handle-travel test expectations to the existing base configuration (-80/30 BPM handle; -30/90 volume handle). No handle implementation or configuration changed.

## Real browser checks

Runs used an isolated Chrome profile, real wall time, normal controller/contact recording and Web Audio.

- [Jog evidence](ver-12-jog-browser.json): complete simulation; two real handoffs; three visible cables; per-step Demonstrate with no learner credit and recordings restored; fresh learner switch-and-return credit; actual scene save/load; individual cable removal; no playback automatically resumed by restore.
- [Kuch evidence](ver-12-kuch-browser.json): all 185 melody notes and 20 stick hits; two actual exercise handoffs and six song handoffs; queued states observed; nonzero audio below clipping; recording cancellation and free-play scene restoration.

Repeat with the app on port 5173 and a dedicated Chrome debug profile on port 9225:

```sh
npm run test:ports:browser
npm run test:kuch:browser
```

Set `TUTORIAL_CDP_URL` / `TUTORIAL_APP_URL` for alternate endpoints. The validation runs used `TUTORIAL_CDP_URL=http://[::1]:9225`.

## Remaining manual checks

Use the ver-12 section of [the XR checklist](manual-xr-regression.md): listen on the headset for boundary attacks, clean releases, bends, offsets and any click/overlap; check queued-label legibility and button pulsing; exercise locked Loopers and both controllers while changing BPM near a handoff. Automated browser verification does not replace listening or ergonomic headset checks.
