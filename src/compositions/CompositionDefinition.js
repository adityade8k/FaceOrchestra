export function validateComposition(definition) {
  const d = definition;
  if (!d || d.schemaVersion !== 1 || !d.id || !d.title || !d.contentVersion)
    throw new Error("Invalid composition identity/version");
  if (!Number.isFinite(d.bpm) || d.bpm < 30 || d.bpm > 240)
    throw new Error("Unsupported composition tempo");
  if (
    !Array.isArray(d.lessons) ||
    !d.lessons.length ||
    !d.lessons.some((l) => l.completePerformance)
  )
    throw new Error(
      "Composition requires complete guided lessons and a final performance",
    );
  const ids = new Set();
  for (const lesson of d.lessons) {
    if (
      !lesson.id ||
      ids.has(lesson.id) ||
      !lesson.goal ||
      !lesson.practice ||
      !lesson.demonstration ||
      !lesson.assessment ||
      !lesson.skip
    )
      throw new Error("Incomplete guided lesson");
    ids.add(lesson.id);
  }
  if (!d.recording || !d.liveRole || !d.score || !d.arrangement)
    throw new Error(
      "Composition requires one score, arrangement, live role and recording policy",
    );
  if (d.recording.bpm !== undefined &&
      (!Number.isFinite(d.recording.bpm) || d.recording.bpm < 30 || d.recording.bpm > 240))
    throw new Error("Invalid recording tempo");
  const events = d.score.events ?? d.arrangement.liveEvents ?? [];
  const roles = new Map((d.arrangement.recipes || []).map(recipe => [recipe.role, recipe]));
  if (roles.size !== (d.arrangement.recipes || []).length) throw new Error("Duplicate instrument role");
  for (const recipe of roles.values()) {
    if (!recipe.role || (recipe.position && (recipe.position.length !== 3 || !recipe.position.every(Number.isFinite))) ||
        (recipe.pitchBendRange !== undefined && ![4, 5].includes(recipe.pitchBendRange)))
      throw new Error("Invalid instrument layout or bend range");
  }
  for (const event of events) {
    if (event.beat !== undefined && (!Number.isFinite(event.beat) || event.beat < 0 || !(event.beats > 0)))
      throw new Error("Invalid score timing");
    if (event.bend && (!Array.isArray(event.bend) || event.bend.some((point, index) =>
      !Number.isFinite(point.semitones) ||
      !Number.isFinite(point.fraction ?? point.seconds) ||
      (index && (point.fraction ?? point.seconds) < (event.bend[index - 1].fraction ?? event.bend[index - 1].seconds)))))
      throw new Error("Invalid ordered bend landmarks");
    if (event.pitchTargets && (!Array.isArray(event.pitchTargets) || event.pitchTargets.some((target, index) =>
      !Number.isFinite(target.midi) || !Number.isFinite(target.beat) ||
      (index && target.beat < event.pitchTargets[index - 1].beat))))
      throw new Error("Invalid ordered pitch targets");
  }
  if (d.practiceBpm !== undefined && (!(d.practiceBpm >= 30) || d.practiceBpm > (d.maxBpm ?? d.bpm)))
    throw new Error("Invalid practice tempo");
  if (d.recording.countIn !== undefined && (!Number.isInteger(d.recording.countIn) || d.recording.countIn < 0))
    throw new Error("Invalid recording count-in");
  if (d.arrangement.fixedBacking) {
    const { outputGroups, volume, placement, terminalGapBeats } = d.arrangement.fixedBacking;
    if (!Number.isInteger(terminalGapBeats) || terminalGapBeats < 1 || terminalGapBeats > 4 || !Array.isArray(outputGroups) || outputGroups.length > 4 || new Set(outputGroups).size !== outputGroups.length ||
        !Number.isFinite(volume) || volume < -1 || volume > 1 || placement?.length !== 3 || !placement.every(Number.isFinite))
      throw new Error("Invalid fixed backing outputs or placement");
  }
  const plain = (value) => {
    if (value === null || ["string", "boolean"].includes(typeof value)) return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (Array.isArray(value)) {
      value.forEach(plain);
      return;
    }
    if (
      typeof value === "object" &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      Object.values(value).forEach(plain);
      return;
    }
    throw new Error("Composition must contain finite serializable plain data");
  };
  plain(d);
  return d;
}

