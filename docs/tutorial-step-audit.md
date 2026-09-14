# Tutorial step audit

All 49 steps have fixed Previous / Next / Demonstrate / Practice controls. Previous is unavailable only at the beginning; Next remains an explicit override. Preparing a later step validates all preceding setup entries, not just the last one shown below. Missing takes expose Record Backing / Record Percussion and resume the pending action only after real recording succeeds.

Practice results persist with Practice Again / Next. Every active attempt also has Finish Attempt. Every demonstration has Stop Demonstration and a bounded watchdog. Navigation, retry, cancellation, tab hiding and exit release owned gestures, discard stale evidence and cancel previews/cues. Completed recordings survive navigation and cancelled/failed recording attempts. Only explicitly requested successful recordings replace a take.

| Step | Prerequisites | Demonstration | Practice evidence | Completion / recovery bound |
| --- | --- | --- | --- | --- |
| 1. intro | None | Begin command | Practice acknowledges the study | Completion check; 30 s recovery |
| 2. metronome | None | Preview → clear placement → normal placement; reuse valid role | Placed role, correct pitches, exact stable contact | Completion check; 30 s recovery |
| 3. chordLooper | Setup through metronome | Preview → clear placement → normal placement; reuse valid role | Placed role, correct pitches, exact stable contact | Completion check; 30 s recovery |
| 4. percussionLooper | Setup through chordLooper | Preview → clear placement → normal placement; reuse valid role | Placed role, correct pitches, exact stable contact | Completion check; 30 s recovery |
| 5. clock-chordLooper | Setup through percussionLooper | Normal connection API + trace actual cable | Actual shared-clock binding | Completion check; 30 s recovery |
| 6. clock-percussionLooper | Setup through clock-chordLooper | Normal connection API + trace actual cable | Actual shared-clock binding | Completion check; 30 s recovery |
| 7. tempo | Setup through clock-percussionLooper | Normal tempo/play/gap controls + hand cue | 80 BPM, running audible click, both gaps 0 | Completion check; 30 s recovery |
| 8. spawn-group-1 | Setup through tempo | Preview → clear placement → normal placement; reuse valid role | Placed role, correct pitches, exact stable contact | Completion check; 30 s recovery |
| 9. wire-group-1 | Setup through spawn-group-1 | Normal Honk route API + trace actual cable | One actual representative route | Completion check; 30 s recovery |
| 10. spawn-group-2 | Setup through wire-group-1 | Preview → clear placement → normal placement; reuse valid role | Placed role, correct pitches, exact stable contact | Completion check; 30 s recovery |
| 11. wire-group-2 | Setup through spawn-group-2 | Normal Honk route API + trace actual cable | One actual representative route | Completion check; 30 s recovery |
| 12. spawn-group-3 | Setup through wire-group-2 | Preview → clear placement → normal placement; reuse valid role | Placed role, correct pitches, exact stable contact | Completion check; 30 s recovery |
| 13. wire-group-3 | Setup through spawn-group-3 | Normal Honk route API + trace actual cable | One actual representative route | Completion check; 30 s recovery |
| 14. spawn-group-4 | Setup through wire-group-3 | Preview → clear placement → normal placement; reuse valid role | Placed role, correct pitches, exact stable contact | Completion check; 30 s recovery |
| 15. wire-group-4 | Setup through spawn-group-4 | Normal Honk route API + trace actual cable | One actual representative route | Completion check; 30 s recovery |
| 16. audition-E | Setup through wire-group-4 | Real squeeze ray and processed bend | Real released note/chord; bend when specified | 20 s or first completed event |
| 17. audition-O | Setup through wire-group-4 | Real squeeze ray and processed bend | Real released note/chord; bend when specified | 20 s or first completed event |
| 18. timbre | Setup through wire-group-4 | Normal vowel/nose/volume controls + hand cue | O, softened noses, backing volume | Completion check; 30 s recovery |
| 19. chord | Setup through timbre | Real squeeze ray and processed bend | Real released note/chord; bend when specified | 20 s or first completed event |
| 20. chords-rehearse | Setup through timbre | Score-driven real squeeze rays | Four real onset/hold/release events | 16 beats + ≤0.9 beat release grace |
| 21. record-chords | Setup through timbre | Real arm → gestures/collisions → stop → solo playback | Real musical events plus actual 16-beat take | 16 beats + ≤0.9 beat release grace |
| 22. finalize-chords | Setup through timbre; chord take | Normal recording stop/check | Captured evidence and stored timeline agree | Completion check; 30 s recovery |
| 23. playback-chords | Setup through timbre; chord take | Normal next-beat Play + full solo cycle | One observed, hands-off solo cycle | 16-beat cycle; 30 s recovery |
| 24. percussion | Setup through timbre; chord take | Preview → clear placement → normal placement; reuse valid role | Placed role, correct pitches, exact stable contact | Completion check; 30 s recovery |
| 25. percussion-wire | Setup through percussion; chord take | Normal Honk route API + trace actual cable | One actual representative route | Completion check; 30 s recovery |
| 26. stick | Setup through percussion-wire; chord take | Real Grip equipment transition | Actual learner stick equipment | Completion check; 30 s recovery |
| 27. tap-percussion | Setup through percussion-wire; chord take | Actual moving stick collider | One real collision and withdrawal | 20 s or first completed event |
| 28. tap-metronome | Setup through percussion-wire; chord take | Actual moving stick collider | One real collision and withdrawal | 20 s or first completed event |
| 29. tap-percussionLooper | Setup through percussion-wire; chord take | Actual moving stick collider | One real collision and withdrawal | 20 s or first completed event |
| 30. drums-rehearse | Setup through percussion-wire; chord take | Score-driven actual stick collisions | Twelve real collisions and withdrawals | 16 beats + ≤0.9 beat release grace |
| 31. record-percussion | Setup through percussion-wire; chord take | Real arm → gestures/collisions → stop → solo playback | Real musical events plus actual 16-beat take | 16 beats + ≤0.9 beat release grace |
| 32. finalize-percussion | Setup through percussion-wire; chord take; percussion take | Normal recording stop/check | Captured evidence and stored timeline agree | Completion check; 30 s recovery |
| 33. playback-percussion | Setup through percussion-wire; chord take; percussion take | Normal next-beat Play + full solo cycle | One observed, hands-off solo cycle | 16-beat cycle; 30 s recovery |
| 34. start-all | Setup through percussion-wire; chord take; percussion take | Shared next-beat transport + full cycle | Shared launch/phase and observed hands-off cycle | 16-beat cycle; 30 s recovery |
| 35. unequip | Setup through percussion-wire; chord take; percussion take | Real Grip release | No equipped stick | Completion check; 30 s recovery |
| 36. melody | Setup through percussion-wire; chord take; percussion take | Preview → clear placement → normal placement; reuse valid role | Placed role, correct pitches, exact stable contact | Completion check; 30 s recovery |
| 37. learn-C4 | Setup through melody; chord take; percussion take | Real squeeze ray and processed bend | Real released note/chord; bend when specified | 20 s or first completed event |
| 38. learn-Eb4 | Setup through melody; chord take; percussion take | Real squeeze ray and processed bend | Real released note/chord; bend when specified | 20 s or first completed event |
| 39. learn-E4 | Setup through melody; chord take; percussion take | Real squeeze ray and processed bend | Real released note/chord; bend when specified | 20 s or first completed event |
| 40. learn-F4 | Setup through melody; chord take; percussion take | Real squeeze ray and processed bend | Real released note/chord; bend when specified | 20 s or first completed event |
| 41. learn-G4 | Setup through melody; chord take; percussion take | Real squeeze ray and processed bend | Real released note/chord; bend when specified | 20 s or first completed event |
| 42. learn-Bb4 | Setup through melody; chord take; percussion take | Real squeeze ray and processed bend | Real released note/chord; bend when specified | 20 s or first completed event |
| 43. learn-C5 | Setup through melody; chord take; percussion take | Real squeeze ray and processed bend | Real released note/chord; bend when specified | 20 s or first completed event |
| 44. learn-bend | Setup through melody; chord take; percussion take | Real squeeze ray and processed bend | Real released note/chord; bend when specified | 20 s or first completed event |
| 45. phrase-A | Setup through melody; chord take; percussion take | Score-driven rays/bends with recorded backing | Real 16-beat melody with bends | 16 beats + ≤0.9 beat release grace |
| 46. phrase-B | Setup through melody; chord take; percussion take | Score-driven rays/bends with recorded backing | Real 16-beat melody with bends | 16 beats + ≤0.9 beat release grace |
| 47. phrase-C | Setup through melody; chord take; percussion take | Score-driven rays/bends with recorded backing | Real 16-beat melody with bends | 16 beats + ≤0.9 beat release grace |
| 48. phrase-D | Setup through melody; chord take; percussion take | Score-driven rays/bends with recorded backing | Real 16-beat melody with bends | 16 beats + ≤0.9 beat release grace |
| 49. performance | Setup through melody; chord take; percussion take | Continuous score-driven performance with backing | Real 96-beat A/B/A/C/B/D performance | 96 beats + ≤0.9 beat release grace |

Setup produced by a tutorial action is marked assisted. Demonstration and saved take evidence never become learner musical credit. Earlier setup failures are repaired explicitly; practice does not change the user's step index automatically.
