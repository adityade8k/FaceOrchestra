# Basics onboarding

Basics runs in the existing isolated tutorial session. The mode router checkpoints Play before clearing it; Exit restores that scene, including its instruments, recordings, and connections. Restart clears only the tutorial workspace.

Implementation files: `BasicsTutorial.js` owns progression and evidence; `basicsSteps.js`, `BasicsInputGate.js`, `BasicsFixtures.js`, and `BasicsGuidance.js` define lessons, freshness, recovery, and presentation. `TutorialPanel.js` and `TutorialRuntime.js` integrate the layout and lifecycle. `RuntimeHost.js` and `XRInteractionCoordinator.js` add the optional accepted-intent observation hook. The package scripts, README, unit tests, browser walkthrough, and existing browser audit were updated with this workflow.

## Final sequence

Step numbers and totals come from `src/tutorial/basicsSteps.js`.

1. Honk.
2. Bend a sounding note.
3. Move the horn.
4. Rotate it.
5. Reach minimum scale.
6. Reach maximum scale, then return smoothly to working size.
7. Right ear up/down, then left ear up/down.
8. Sound and bend, then sound while adjusting an ear.
9. Move the nose up and down while sounding.
10. Sound A, E, I, O, and U.
11. Duplicate with Grip + A.
12. Duplicate to three, move into contact, and play the chord.
13. Freeze with B, then grab and move the frozen group.
14. Unfreeze with a fresh B press.
15. Clear tutorial horns with X.
16. Create and place a horn through the instrument menu.
17. Start the metronome and hear two pulses.
18. Change BPM and hear the changed pulse.
19. Choose four beats with the looper's right handle.
20. Connect a looper socket to the horn.
21. Connect a metronome output to a free looper socket.
22. Arm and record a usable phrase through the actual recording lifecycle.
23. Play the recorded phrase, hear it through its duration, and stop.
24. Add a repeat gap, then return to zero.
25. Record a second phrase.
26. Connect the second looper to the first looper's metronome output.
27. Play the first, queue the second, and hear the switch.
28. Equip a stick and make two separate strikes with withdrawal.
29. Finish: return to free play or replay onboarding.

Song practice and mixed-reality capture remain in their existing workflows.

## Completion and recovery

`BasicsTutorial` maintains the current index, completed IDs, objective evidence, fresh input tokens, and the pending success transition. `BasicsFixtures` tracks tutorial-owned entity IDs and stores a scene checkpoint at each lesson's entry. Back, Next review, and Reset restore that checkpoint without resetting completion history. This restores the appropriate horn count, frozen group, routes, and actual learner takes. Missing or distant targets show a Reset lesson message. Entering XR relocates the tutorial workspace and its checkpoints to the tracked viewer.

The normal XR coordinator reports accepted intents after their handlers run. Entry timestamps and `BasicsInputGate` reject queued input, held buttons, uncentered sticks, and virtual/demo controllers. Continuous checks run after the normal performance pass. Setup, Help, navigation, and restored state cannot award objectives. Completed review steps never schedule automatic advancement.

Evidence uses real live pitch/volume parameters, confirmed controller audio voices and a running AudioContext, grip displacement/quaternion changes, supported scale limits, contact-graph membership, lock-service membership, connections, recording revisions and completion, and the playback engine's sounding tracks. Compound objectives have separate evidence; the ears and nose require ordered changes. Silent vowel clicks do not count. Silent ear/nose movement cannot be saved up and credited when sound begins later.

Thresholds are centralized in `basicsSteps.js`: 9 cm translation, 20° rotation, 0.22 normalized bend (0.88 semitones), 0.22 ear change, 0.16 actual nose-gain change, 0.015 scale tolerance, and 5 BPM. Sound is observed for 140 ms; success remains visible for 850 ms before advancing.

## Guidance and control audit

- The compact panel faces the viewer above the active instrument or chord bounds, with a 10 cm clearance. Its pose is smoothed, its position stays stable during grip transforms, and it remains in place when horns are cleared. Later lessons anchor near the relevant clock or looper. The existing pitch label is kept small and close to the hat. The shared panel returns to its original layout for other modes.
- Target rings, direction arrows, controller badges, the existing bend gauge, a volume bar, vowel checks, and recording status provide feedback without success sounds. Help exposes the current lesson's explanation without playing or altering instruments.
- A already duplicates the gripped instrument; without Grip it opens the radial menu. Left Y also opens that menu. No remapping was needed.
- Scaling is edge-based: each left/right joystick push changes size by 0.25. The helper explains centering between pushes. Limits remain 0.5 and 8.
- Existing collider aliases are viewer-relative: the authored `left` target is at negative local X. Onboarding uses the clown's perspective, so its right ear refers to that target. Instrument pitch mappings are unchanged. Completion reads canonical live parameters, rather than rendered morph weights.
- B already freezes contact-group membership and relative transforms, disables facial edits, and still permits sounding the chord. Onboarding uses this real lock service.
- X normally deletes the pointed instrument. Only the clear-horns lesson intercepts X to delete all tutorial-owned horns. It never operates on the saved Play composition.
- The right looper handle supports 2/4/8/16 beats. The bottom handle supports a 0–4 beat gap; zero adds no gap.
- There is no fixed pre-roll countdown in this recording workflow: Record arms it, silence waits indefinitely, and the first sound starts the beat window. READY and RECORDING are shown separately.
- Direct looper-to-looper sequencing is absent. The lesson teaches the supported alternative: connect loopers to the same metronome output and queue a switch at the cycle boundary. Exclusivity is per output; different outputs may play together.

## Verification

`npm run check` validates imports and architecture. `npm test` includes the onboarding input/progression tests alongside existing tests. `npm run test:basics:browser` starts a loopback server and an isolated temporary Chrome profile. It drives actual controller poses and semantic inputs through the unchanged frame scheduler, raycasting, contacts, Web Audio, and looper recorder. Software rendering is separated from the musical frame timer. No objectives, hit results, or recording timelines are injected.

The browser walkthrough covers all 29 steps, silent vowel rejection, held-input rejection, multi-action requirements, ordinary radial creation, duplicate limits, Back after deletion, frozen/unfrozen fixtures, restored playback, restart, cleanup, and preservation of the Play scene (floating-point transform tolerance 1e-8). Results are written to `/tmp/face-orchestra-basics-validation.json`. The existing browser audit also checks other tutorial modes and repeated transitions.

No physical headset was available. Headset readability and occlusion, controller ergonomics, tracking loss/re-entry, and acoustic listening still require XR testing.

Latest local results: all 689 automated tests passed; the browser walkthrough reached Finish through all 28 action lessons; the existing browser audit passed 50 mode transitions plus the Jog, Kuch, persistence, and manual-horn regressions. Both browser runs reported zero runtime exceptions. Evidence is checked in at [onboarding.json](audits/onboarding.json) and [browser.json](audits/browser.json).
