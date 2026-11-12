import { validateLiveMelody } from "../../../tutorial/live-melody/score.js";
import { fixedBackingPlan } from "../../FixedBackingPlan.js";
import { isImmutableComposition } from "../../CompositionDefinition.js";

const validated = new WeakSet();
export function validateAlfaaz(d) {
  if (isImmutableComposition(d) && validated.has(d)) return d;
  // Reuse the live melody contract: the learner owns every melody gate.
  validateLiveMelody({
    ...d,
    playback: "honk-live-two-hand-v1",
    requirements: { ...d.requirements, maxLoopers: 0 },
    arrangement: { ...d.arrangement, backing: [] },
  });
  if (d.playback !== "honk-percussion-backing-v1") throw new Error("Invalid percussion playback");
  const roles = new Map(d.arrangement.recipes.map((r) => [r.role, r]));
  const ids = new Set(d.score.events.map((e) => e.id));
  let previous = 0;
  for (const e of d.arrangement.backing) {
    const r = roles.get(e.role);
    if (
      !e.id ||
      ids.has(e.id) ||
      r?.part !== "percussion" ||
      e.part !== "percussion" ||
      r.midi !== e.midi ||
      !["boink", "metronomeWood"].includes(e.sound) ||
      !Number.isFinite(e.beat) ||
      e.beat < previous ||
      !(e.beats > 0) ||
      e.beat + e.beats > d.score.durationBeats ||
      !Number.isFinite(e.gain) ||
      e.gain < 0 ||
      e.gain > 1
    )
      throw new Error("Invalid native percussion backing");
    ids.add(e.id);
    previous = e.beat;
  }
  if (
    !d.arrangement.backing.length ||
    d.score.events.some((e) => roles.get(e.role)?.part !== "melody")
  )
    throw new Error("Separate live melody from percussion backing");
  const plan = fixedBackingPlan(d);
  const maximum = Math.max(
    ...[...plan.sequences.values()].map(
      (s) => new Set(s.blocks.flatMap((b) => b.patterns).filter(Boolean)).size,
    ),
  );
  if (d.requirements.maxLoopers !== maximum) throw new Error("Invalid percussion Looper capacity");
  if (isImmutableComposition(d)) validated.add(d);
  return d;
}
