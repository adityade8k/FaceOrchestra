# Kuch practice update on ver-12

Implemented locally; nothing pushed or published. Existing local work was preserved. The earlier green-ring corrections, conservative 18-pair Easier bends arrangement, observed bend assessment, hidden connection badge and practice CPU reductions were already present before this follow-up. Original remains available. Easier bends still contains 167 held gestures covering all 185 source pitch landmarks.

The new shared radial gauge compares the required bend **now** with the correct live gesture's processed sounded bend. A hollow triangle, filled circle on a separate radial lane, signed arc, destination notch and ±4 semitone ticks distinguish the values even when they match. Missing input reads “You —”; wrong direction, overshoot and on-target states use the authored tolerance. Demonstrations use actual virtual-controller input, are labeled Demo and earn no credit. Tutorial and Record Songs share this renderer. Guidance survives menu hiding, resets on cancellation/release/deletion, and is excluded from clean MR unless UI capture is explicitly enabled. Visual resources are pooled and numerical labels update only when dirty, at most 10 Hz outside ownership or phase changes.

The current ring animation keeps a fixed white circle on every upcoming or sounding target. Green keeps its one-beat shrink-to-attack countdown. Yellow starts at zero and grows outward through the hold, disappearing exactly when it reaches white at release. Percussion uses the same outward motion over its short strike window. The radial UI appears in the green stage with its start and destination visible, no borrowed input from a previous gesture, and a stationary green target. At attack the target turns yellow; rotation follows the authored curve after its initial hold, while yellow grows. Untimed bend practice previews without inventing an onset deadline; its bend clock begins with the learner's hold. The same pooled objects are reused throughout.

Section definitions are now version 2:

| Part | Performance beats | Source events | Notes | Local backing changes |
| --- | --- | --- | ---: | --- |
| 1 | [0,16) | lead-0–21 | 22 | D at 0 |
| 2 | [16,40) | lead-22–60 | 39 | Change at 0, D at 16 |
| 3 | [48,88) | lead-61–121 | 61 | D at 0, Change at 16, D at 32 |
| 4 | [96,136) | lead-122–184 | 63 | D at 0, Change at 16, D at 32 |

Every source note belongs to one section; no note or merged bend is split. Section practice has an explicitly separate eight-beat training bridge after Part 1 and genuine eight-beat interludes after Parts 2 and 3. Backing continues, melody targets clear, and the panel shows the next part and remaining beats. Starting the next attempt is an explicit action with a fresh count-in. Full-song practice and Record Songs remain 136 beats with only the actual rests at [40,48) and [88,96).

Each part and full song independently starts at 60 BPM. The available progression is now 40 → 50 → 60 → 70 → 80 → 92, so selecting 40 or 50 adds slower stages without changing existing results or awarding skipped stages. Advancement requires at least 85/100 plus required bend, hold and release criteria. Success records the actual attempt BPM and selects the next stage without starting it. Failure retains the attempted tempo; manual selections do not award completion. Persistence is separated by composition, arrangement and section version. A shared immutable attempt timing context drives count-ins, demos, live cues, assessment, backing and completion without changing source beat data. Existing looper tempo conversion preserves sixteen-beat patterns and pitch.

All five practice pages have a native desktop range with keyboard support and an XR ray-drag slider, 40–92 in steps of one, with six presets. Preview does not restart audio; release commits once. An active practice commit cancels without failure and restarts the same section with a fresh four-beat count-in, preserving takes and placement. Metronome changes use the same action. Hiding, tracking loss and disconnect cancel unfinished drags. Active MR takes cannot change practice tempo.

**Practice full song — backing ready** prepares three real compiled backing patterns and one metronome immediately, from either song entry or lesson navigation. Chord alternatives share an exclusive output; percussion plays simultaneously from a separate output. Melody stays live. Shared layout and backing preparation serve tutorial and recording without a second tutorial instance. Compatible learner takes are reused, temporary replacements are snapshotted, and retries reuse the scene. Double clicks and cancelled async preparation cannot install a stale scene; exit restores Play.

The reported white branch was reproduced. Its 2048×2048 bark image is embedded in `model/branch/scene.glb`. Three.js fetches that image as a local blob, which the recording server's `connect-src` policy blocked even though `img-src` allowed blobs. The server now permits local blob fetches while retaining its network-origin restrictions. No artwork or model was replaced. A browser check verifies the embedded map, surface maps, held-stick clones, scene restoration, capture asset reference and visible brown bark in the actual render, with no policy violations. Evidence: [branch-texture.json](audits/branch-texture.json); local image: `test-results/branch-texture/branch.png`. Restart an already-running recording server and reload the headset page to receive the corrected policy.

Validation:

| Check | Result |
| --- | --- |
| `npm run verify` | 678 passed, zero failed; includes 40/50 BPM full-score assessment, outward yellow growth to white, active white boundaries, untimed holds and bend previews |
| Focused practice browser regression | 46 checks passed, including 40 BPM real backing, six-second count-in, tempo restarts, both XR slider limits, green-stage gauge preview, yellow-before-roll, capture policy and recording integration |
| Complete Easier bends browser run | 167 gestures, 185 landmarks, 2,965 ring checks and 740 bend-ring checks passed |
| Earlier bend/input regression rerun | 62 checks passed |
| General browser smoke | Navigation, persistence, restoration, Basics and 49 actual-mesh ray comparisons passed |
| Native keyboard and visual review | Home committed 40 BPM; ArrowRight committed 41 BPM to slider, session and metronome. Verified fixed white circles, zero-radius yellow onset, outward growth and disappearance at release in the rendered snapshots |
| Jog recording browser regression | Passed recording, restart and save through the local receiver with synthetic tracking |
| Branch texture browser regression | Passed loaded-map, clone/lifecycle and pixel-render checks |
| Capture server regression | Pairing, Origin/private-path restrictions, stream resume, finalization and invalid-input checks passed |

Commands and detailed arrangement/assessment rules are in [kuch-tutorial.md](kuch-tutorial.md). Run the branch check with `CAPTURE_SOFTWARE_GL=0 node scripts/capture/check-branch-texture.mjs`. Browser reports are under [audits](audits/); screenshots and raw measurements are under ignored `test-results/`. The 46-check practice run covers the previous 40 BPM update; the latest outward-yellow revision was checked by the 678-test suite and the native-control/rendered-phase browser check. Complete-song and Jog browser runs are historical evidence and were not repeated for these ring follow-ups; both arrangements remain covered by the current Node suite. The new synthetic XR endpoint check initially aimed through an instrument collider; moving the test panel clear of the ensemble made the real nearest-hit path pass, including cancellation of a confirmed active drag. Product occlusion behavior was retained.

Performance remains an open headset validation item. Earlier changes reduced detailed-body raycasts, redundant XR keyboard DOM work and hidden-menu canvas updates. A warm seven-scenario desktop profile had full-song update CPU p95 around 1.2 ms with no sampled frame gaps above 25 ms. A later fresh-browser full-song run had severe gaps: 136/359 intervals above 25 ms with the panel shown and 156/359 hidden. Heavy unrelated CPU consumers were observed afterward, but that does not establish the cause. Both profiles are retained in [kuch-practice-performance.json](audits/kuch-practice-performance.json), with scope and historical failures in [practice-performance.md](practice-performance.md). These profiles preceded the final embedded-texture correction.

No physical headset was attached (`adb devices -l` was empty). Actual XR slider ergonomics, radial readability, bend comfort, acoustic timing and headset GPU/compositor frame timing were **not run**. Desktop/synthetic XR checks do not establish that the reported headset frame drops are fixed.
