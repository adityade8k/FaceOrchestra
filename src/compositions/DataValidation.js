import { compilePattern } from "./CompositionCompiler.js";
import { LOOPER_TRACK_COUNT } from "../config/looper.js";
import { METRONOME_CONNECTION_PORTS } from "../config/metronome.js";

// Validate the generic runner's capabilities before any entity is created.
// Legacy authored-song adapters retain their own established score contracts.
export function validateDataArrangement(d) {
  const fail = (message) => {
    throw new Error(`Invalid data composition: ${message}`);
  };
  const finite = Number.isFinite;
  if (
    d.recording.countIn !== 4 ||
    !finite(d.recording.tailMs) ||
    d.recording.tailMs < 0 ||
    d.recording.tailMs > 10000 ||
    d.recording.end !== "manual" ||
    d.recording.synchronization !== "captured-noise-once"
  )
    fail("unsupported recording policy");
  const recipes = d.arrangement.recipes;
  if (!Array.isArray(recipes) || !recipes.length || recipes.length > 256)
    fail("instrument recipes");
  const roles = new Map();
  for (const r of recipes) {
    if (
      !r.role ||
      roles.has(r.role) ||
      !["honk", "looper", "metronome"].includes(r.kind) ||
      !Array.isArray(r.position) ||
      r.position.length !== 3 ||
      !r.position.every(finite) ||
      !finite(r.scale) ||
      r.scale <= 0 ||
      r.scale > 20
    )
      fail("role, layout or scale");
    if (
      r.kind === "honk" &&
      (!Number.isInteger(r.midi) || r.midi < 36 || r.midi > 84)
    )
      fail("supported numeric pitch required");
    if (
      r.orientation &&
      (!Array.isArray(r.orientation) ||
        r.orientation.length !== 4 ||
        !r.orientation.every(finite) ||
        Math.abs(Math.hypot(...r.orientation) - 1) > 0.001)
    )
      fail("unit orientation quaternion required");
    roles.set(r.role, r);
  }
  if (
    recipes.filter((r) => r.kind === "metronome").length !== 1 ||
    roles.get("metronome")?.kind !== "metronome"
  )
    fail("one metronome role required");
  const events = d.score.events;
  if (
    !Array.isArray(events) ||
    !events.length ||
    events.length > 200000 ||
    !finite(d.score.durationSeconds)
  )
    fail("score bounds");
  const ids = new Set();
  let end = 0;
  for (const e of events) {
    if (
      !e.id ||
      ids.has(e.id) ||
      roles.get(e.role)?.kind !== "honk" ||
      roles.get(e.role).midi !== e.midi ||
      !finite(e.startSeconds) ||
      e.startSeconds < end - 0.00001 ||
      !finite(e.durationSeconds) ||
      e.durationSeconds <= 0
    )
      fail(
        "live role requires ordered, non-overlapping notes and valid pitch targets",
      );
    let prior = -Infinity;
    for (const p of e.bend || []) {
      if (
        !finite(p.seconds) ||
        p.seconds < 0 ||
        p.seconds < prior ||
        p.seconds > e.durationSeconds + 0.00001 ||
        !finite(p.semitones) ||
        Math.abs(p.semitones) > 4
      )
        fail("unsupported bend curve");
      prior = p.seconds;
    }
    end = e.startSeconds + e.durationSeconds;
    ids.add(e.id);
  }
  if (end > d.score.durationSeconds + 0.00001)
    fail("score ends before note release");
  for (const l of d.lessons) {
    if (
      !Array.isArray(l.eventIds) ||
      l.eventIds.some((id) => !ids.has(id)) ||
      !finite(l.startSeconds) ||
      !finite(l.endSeconds) ||
      l.startSeconds < 0 ||
      l.endSeconds <= l.startSeconds ||
      l.endSeconds > d.score.durationSeconds + 0.00001
    )
      fail("lesson range or event reference");
    for (const name of [
      "pitchCents",
      "onsetSeconds",
      "durationSeconds",
      "bendCents",
    ])
      if (!finite(l.assessment[name]) || l.assessment[name] < 0)
        fail("explicit assessment tolerances required");
    for (const e of events.filter((e) => l.eventIds.includes(e.id)))
      if (
        e.startSeconds < l.startSeconds ||
        e.startSeconds + e.durationSeconds > l.endSeconds + 0.00001
      )
        fail("lesson splits a sustained note");
  }
  const groups = new Set(),
    owners = new Set();
  for (const p of d.arrangement.backing || []) {
    if (
      roles.get(p.role)?.kind !== "looper" ||
      owners.has(p.role) ||
      !Array.isArray(p.events) ||
      !p.events.length
    )
      fail("one nonempty pattern per looper");
    owners.add(p.role);
    groups.add(p.outputGroup || p.role);
    const routed = [...new Set(p.events.map((e) => e.role))];
    if (
      routed.length >= LOOPER_TRACK_COUNT ||
      routed.some((role) => roles.get(role)?.kind !== "honk")
    )
      fail("backing socket capacity or role");
    if (events.some((e) => routed.includes(e.role)))
      fail("automatic backing cannot perform a live target");
    compilePattern({
      ...p,
      beatMs: 60000 / d.bpm,
      routes: Object.fromEntries(
        routed.map((role, i) => [
          role,
          { trackId: `validate-${i}`, trackIndex: i },
        ]),
      ),
    });
  }
  if (groups.size > METRONOME_CONNECTION_PORTS.length)
    fail("metronome output capacity");
  return d;
}
