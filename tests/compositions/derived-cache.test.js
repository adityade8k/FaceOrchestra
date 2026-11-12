import test from "node:test";
import assert from "node:assert/strict";
import { compositionRegistry } from "../../src/compositions/CompositionRegistry.js";
import { fixedBackingPlan, sequenceKey } from "../../src/compositions/FixedBackingPlan.js";
import { resolveLessonSequence } from "../../src/compositions/LessonSequence.js";
import {
  validateComposition,
  freezeComposition,
} from "../../src/compositions/CompositionDefinition.js";

test("loaded definitions reuse derived plans and reject in-place musical edits", async () => {
  const { definition } = await compositionRegistry.load("kuch-to-hua-hai");
  assert.equal(fixedBackingPlan(definition), fixedBackingPlan(definition));
  assert.ok([...fixedBackingPlan(definition).sequences.keys()].every((key) => key.length < 40));
  assert.throws(() => {
    definition.arrangement.backing[0].beat++;
  }, TypeError);
});
test("edited definitions rebuild compact sequences and backing plans", async () => {
  const { definition } = await compositionRegistry.load("kuch-to-hua-hai");
  const edited = structuredClone(definition),
    lesson = edited.lessons.find((l) => l.sequenceLessonIds);
  const first = resolveLessonSequence(edited, lesson),
    plan = fixedBackingPlan(edited);
  assert.equal(resolveLessonSequence(edited, lesson), first);
  const note = edited.arrangement.backing.find(
    (e) => e.beat >= lesson.startBeat && e.beat < lesson.endBeat,
  );
  note.velocity--;
  const next = resolveLessonSequence(edited, lesson),
    revised = fixedBackingPlan(edited);
  assert.notEqual(next, first);
  assert.notDeepEqual(revised.patterns, plan.patterns);
  assert.ok(
    revised.sequences.has(
      sequenceKey(next.definition.arrangement.backing, next.lesson.startBeat, next.lesson.endBeat),
    ),
  );
  edited.score.events[0].beat = -1;
  assert.throws(() => validateComposition(edited), /timing/);
});

test("freezing an edited definition does not reuse validation from its mutable state", async () => {
  const { definition } = await compositionRegistry.load("kuch-to-hua-hai");
  const edited = structuredClone(definition);
  validateComposition(edited);
  edited.score.events[0].beat = -1;
  freezeComposition(edited);
  assert.throws(() => validateComposition(edited), /timing/);
});
