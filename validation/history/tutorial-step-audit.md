# Tutorial step audit

All 49 steps keep exactly Previous Step, Next Step, Demonstrate, Practice, Recenter and Exit. Labels and positions never change. Demonstrate and Practice toggle cancellation; Practice also retries results. Navigation cancels outgoing activity and preserves user placement and recordings.

Setup validates automatically and never advances automatically. A preview has no role or credit. Every learner spawn uses the radial menu. Neither Next, Demonstrate nor Practice repairs prerequisites. Music and recording can be skipped honestly; missing takes never block Next. Only the separately invoked full simulation builds its scene.

| Step | Current requirement | Demonstrate | Completion / navigation |
| --- | --- | --- | --- |
| 1. intro | None | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 2. metronome | Committed metronome | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 3. chordLooper | Committed looper | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 4. percussionLooper | Committed looper | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 5. clock-chordLooper | Actual compatible clock route | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 6. clock-percussionLooper | Actual compatible clock route | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 7. tempo | 80 BPM running; both Gaps 0 | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 8. spawn-group-1 | Committed jog-group-1 | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 9. wire-group-1 | Actual representative route | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 10. spawn-group-2 | Committed jog-group-2 | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 11. wire-group-2 | Actual representative route | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 12. spawn-group-3 | Committed jog-group-3 | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 13. wire-group-3 | Actual representative route | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 14. spawn-group-4 | Committed jog-group-4 | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 15. wire-group-4 | Actual representative route | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 16. audition-E | Current musical target | Real conductor example; restores checkpoint | First completed event or 20 s; Next can skip |
| 17. audition-O | Current musical target | Real conductor example; restores checkpoint | First completed event or 20 s; Next can skip |
| 18. timbre | O, softened noses, lowered backing volume | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 19. chord | Current musical target | Real conductor example; restores checkpoint | First completed event or 20 s; Next can skip |
| 20. chords-rehearse | Current musical target | Real conductor example; restores checkpoint | Count-in + 16 beats + ≤0.9 beat release grace; Next can skip |
| 21. record-chords | Targets, clock and recording routes; no prior take | Real conductor example; restores checkpoint | Count-in + 16 beats + ≤0.9 beat release grace; Next can skip |
| 22. finalize-chords | Existing take for this action; optional for Next | Real conductor example; restores checkpoint | 30 s recovery bound; Next can skip |
| 23. playback-chords | Existing take for this action; optional for Next | Real conductor example; restores checkpoint | 30 s recovery bound; Next can skip |
| 24. percussion | Committed honk | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 25. percussion-wire | Actual representative route | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 26. stick | Physical Grip held | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 27. tap-percussion | Current musical target | Real conductor example; restores checkpoint | First completed event or 20 s; Next can skip |
| 28. tap-metronome | Current musical target | Real conductor example; restores checkpoint | First completed event or 20 s; Next can skip |
| 29. tap-percussionLooper | Current musical target | Real conductor example; restores checkpoint | First completed event or 20 s; Next can skip |
| 30. drums-rehearse | Current musical target | Real conductor example; restores checkpoint | Count-in + 16 beats + ≤0.9 beat release grace; Next can skip |
| 31. record-percussion | Targets, clock and recording routes; no prior take | Real conductor example; restores checkpoint | Count-in + 16 beats + ≤0.9 beat release grace; Next can skip |
| 32. finalize-percussion | Existing take for this action; optional for Next | Real conductor example; restores checkpoint | 30 s recovery bound; Next can skip |
| 33. playback-percussion | Existing take for this action; optional for Next | Real conductor example; restores checkpoint | 30 s recovery bound; Next can skip |
| 34. start-all | Both takes for this action; optional for Next | Real conductor example; restores checkpoint | 30 s recovery bound; Next can skip |
| 35. unequip | Physical Grip released | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 36. melody | Committed jog-melody | Disabled; observe setup | Automatic completion; Next waits for valid setup |
| 37. learn-C4 | Current musical target | Real conductor example; restores checkpoint | First completed event or 20 s; Next can skip |
| 38. learn-Eb4 | Current musical target | Real conductor example; restores checkpoint | First completed event or 20 s; Next can skip |
| 39. learn-E4 | Current musical target | Real conductor example; restores checkpoint | First completed event or 20 s; Next can skip |
| 40. learn-F4 | Current musical target | Real conductor example; restores checkpoint | First completed event or 20 s; Next can skip |
| 41. learn-G4 | Current musical target | Real conductor example; restores checkpoint | First completed event or 20 s; Next can skip |
| 42. learn-Bb4 | Current musical target | Real conductor example; restores checkpoint | First completed event or 20 s; Next can skip |
| 43. learn-C5 | Current musical target | Real conductor example; restores checkpoint | First completed event or 20 s; Next can skip |
| 44. learn-bend | Current musical target | Real conductor example; restores checkpoint | First completed event or 20 s; Next can skip |
| 45. phrase-A | Melody targets and clock; zero, one or two takes | Real conductor example; restores checkpoint | Count-in + 16 beats + ≤0.9 beat release grace; Next can skip |
| 46. phrase-B | Melody targets and clock; zero, one or two takes | Real conductor example; restores checkpoint | Count-in + 16 beats + ≤0.9 beat release grace; Next can skip |
| 47. phrase-C | Melody targets and clock; zero, one or two takes | Real conductor example; restores checkpoint | Count-in + 16 beats + ≤0.9 beat release grace; Next can skip |
| 48. phrase-D | Melody targets and clock; zero, one or two takes | Real conductor example; restores checkpoint | Count-in + 16 beats + ≤0.9 beat release grace; Next can skip |
| 49. performance | Melody targets and clock; zero, one or two takes | Real conductor example; restores checkpoint | Count-in + 96 beats + ≤0.9 beat release grace; Next can skip |

Only learner-origin musical events earn practice credit. Demonstrations restore settings, takes and transport state on completion, cancellation and navigation. A successful intentional recording persists; failed or cancelled recording attempts restore the prior take.
