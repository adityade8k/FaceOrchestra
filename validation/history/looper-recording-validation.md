# Looper recording regression validation

Started from clean local `Tutorial` at `47f76d1`, retaining the newer radial/tutorial work. `git fetch origin` confirmed the reviewed remote branch remained at `ef47265`. Older timeline implementations were inspected: the earlier last-onset boundary could truncate a held note; its later beat-rounded replacement retained holds but added silence. This fix uses completed musical endpoints.

## Confirmed causes and changes

- `TutorialLessonFlow.finishPractice` restored `practiceBackup` after a failed score. Practice rollback is removed. Scores update feedback/progress only; actual new recordings survive low scores, cancellation and Next. Cancelling before the first sound retains the existing take through ordinary record-armed Stop.
- `h.stop()` stopped playback, not active capture. Tutorial finalization now uses ordinary physical Stop semantics, guarded against idle Stop (which intentionally clears a take). Outgoing navigation also finalizes manual captures before releasing input or snapshotting the free-play scene.
- `beginArmedRecordingFromOnset` started on the preceding beat. It now starts on the actual sound. Finalization/migration subtracts one shared first-onset offset across all tracks, preserving relative gates, expression, percussion and baseline/interpolation support.
- Beat rounding and post-sound automation extended duration. Musical endpoints now determine content length: full Honk holds through their releases, including forced held-at-Stop releases, and finite percussion envelope/resonator lifetimes. Silent motion and cleanup do not extend content. Interior rests remain.
- The final expression could be scheduled after its voice had been released from the active lookup. The scheduler publishes that expression first and retains the existing amplitude-release envelope. Equal-time gates retain their recorded order.
- Fractional cycle arithmetic could miss percussion events at shared scheduler-window boundaries. Scheduling now enumerates cycle indices directly. Wrapping does not cancel sounding percussion tails.
- Schema 7 records explicit percussion lifetimes and the shared normalization offset. Loading earlier snapshots reconstructs content bounds from musical events instead of trusting beat/Stop padding. Source tempo, content duration and Gap remain separate; Gap changes do not move events or accumulate padding.
- Demonstration restoration checks session identity and Looper operation revisions. A newer learner Record/Stop/Play or control change prevents that Looper’s old snapshot from being restored. Asynchronous readiness cannot start a cancelled operation.

The runtime order is `INPUT → PERFORMANCE (resolve live input, record canonical state) → PRESENTATION (observe release, finalize, publish cached take, assess)`. A still-active capture defers assessment until ordinary Stop has finalized it. A low score is independent of recording success.

## Automated checks

- `npm run check`: **164 source files passed** syntax, relative-import and architecture checks.
- Targeted Looper/tutorial suite: **195 passed**.
- Full `npm test`: **472 tests, 471 passed, one pre-existing failure**. `MetronomeHandleRig.test.js:43` expects −90° while the unchanged configuration is −80°.
- `git diff --check`: passed.

New coverage includes empty/prior takes, genuine imperfect capture, cancellation/retry, other-Looper preservation, demo ownership and stale audio readiness; identical performances with immediate/2-second/10-second Stop delays; full final bends and releases; overlapping tracks and interior rests; held-at-Stop, empty and single-strike recordings; repeated fractional wraps; Gap 0 → positive → 0; connected/internal clocks; tempo changes and unequal Start All cycles; migration and save/load. Existing voice, release, contact, scheduler, radial and performance tests remain covered. Tests that formerly required beat padding now assert exact content bounds.

## Browser evidence

[Recording evidence](looper-recording-browser.json) contains **152 recording assertions**, alongside **742 radial/tutorial assertions**. The browser used the application's learner controller objects, real ray selection, physical Looper colliders, recording and audio scheduler. No expected score events or replacement timelines were injected.

Both intentionally incomplete chord attempts scored **5/100**. Their actual takes (666.7 ms and 649.9 ms) remained through results and Next. Physical Play scheduled nine chord voices per observation and produced nonzero Web Audio signal with Metronome clicks muted. The other Looper's real manual take remained unchanged. Armed cancellation retained the prior take; partial cancellation finalized the new one. A physical Record during Demonstrate invalidated demo cleanup and preserved the learner's subsequent capture.

Manual recordings outside Practice were stopped immediately, 2 seconds later and 10 seconds later. Each stored endpoint matched its actual release within 1 ms. These separately performed browser gestures lasted 650, 700 and 683.3 ms because frame/input timing varied; they are **not claimed to be identical performances**. Deterministic recorder tests supply identical samples and verify identical serialized content and playback timing across all three delays.

Measured peak RMS after physical Play:

| Scenario | Peak RMS |
| --- | ---: |
| Low score, initially empty Looper | 0.09236 |
| Low score, replacing a prior take | 0.08015 |
| Manual take outside Practice | 0.09999 |
| Learner take after interrupted demonstration | 0.08286 |

A separate free-play check entered the tutorial during a held recording. The normal Stop captured its release before the free-play snapshot. Returning restored the 603.9 ms take at its original internal 70 BPM reference; physical Play scheduled two repetitions without changing the take.

[Full composition evidence](looper-composition-browser.json): simulation completed in **166.227 seconds**, with four genuine chord captures, twelve real percussion collisions and A/B/A/C/B/D melody performance. Both recording demonstrations completed and restored their own takes without learner credit. Muted-clock chord/percussion audio, shared Web Audio launch, selective shake/disconnection, persistence, repeated mode cleanup, XR panel ray capture, existing Honk interactions and presentation checks passed.

The actual content cycles were **11.7162 s (chords)** and **11.7863 s (percussion)**. They launched together and later diverged in normalized phase by about **0.0449 cycle**. This is expected: the **16-beat assessment window is not a compulsory stored loop length**. Count-ins follow the Metronome; unequal loops are neither stretched nor padded to force later phrase alignment. Honk release tails and faster-tempo percussion tails can naturally overlap the next cycle.

The existing separate lesson/free-play scene lifecycle remains: Next/Previous preserve lesson instruments; Exit restores the inactive free-play scene. Lesson objects are not copied into free play or persisted by this change.

## Desktop performance

The existing profiler sampled 240 frames in each scene. Compare the [previous committed profile](tutorial-radial-performance-after.json) with the [new profile](looper-performance-after.json); these are separate runs, not simultaneous measurements.

| Scene | Previous p95 CPU/frame | New p95 CPU/frame |
| --- | ---: | ---: |
| Free play | 0.7 ms | 0.5 ms |
| Held chord | 4.4 ms | 4.1 ms |
| Percussion recording | 2.5 ms | 2.5 ms |
| Two Loopers | 1.9 ms | 1.8 ms |

Idle sampled panels produced zero DOM mutations and zero full panel texture uploads. The timings show no regression in these sampled desktop scenes; they do not establish GPU or headset performance.

## Reproduction and limitations

With the app and dedicated Chrome CDP profile running on ports 5173 and 9225:

```sh
TUTORIAL_TEST=recording npm run test:tutorial:browser -- /tmp/looper-recording-regressions.json
npm run test:tutorial:browser -- /tmp/looper-full-composition-validation.json
node scripts/run-tutorial-profile.mjs /tmp/looper-performance-after.json
```

**No headset, hardware-controller, haptic, acoustic-listening or GPU performance check was performed.** Browser rays, scheduling and measured audio signal passed; perceived tone, balance and physical ergonomics still require listening/headset checks.
