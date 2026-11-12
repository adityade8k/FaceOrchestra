import test from "node:test";
import assert from "node:assert/strict";
import { BASICS_STEPS } from "../../src/tutorial/basicsSteps.js";
import { BasicsFinale, BASICS_FINALE_STEPS } from "../../src/tutorial/BasicsFinale.js";
import { TutorialSession } from "../../src/tutorial/TutorialSession.js";
import { musicUnavailable } from "../../src/tutorial/TutorialLessonPolicy.js";

test("percussion follows movement; loop switching leads to the composition and final menu lesson", () => {
  assert.deepEqual(
    BASICS_STEPS.slice(-3).map((s) => s.id),
    ["switch", "finale", "finish"],
  );
  assert.deepEqual(
    BASICS_STEPS.slice(2, 5).map((s) => s.id),
    ["move", "strike", "rotate"],
  );
  assert.deepEqual(BASICS_STEPS.at(-1).objectives, ["hide", "show"]);
  assert.deepEqual(
    BASICS_FINALE_STEPS.map((s) => s.type),
    ["record", "record", "note", "performance"],
  );
  assert.notEqual(BASICS_FINALE_STEPS[0].looperRole, BASICS_FINALE_STEPS[1].looperRole);
  assert.ok(BASICS_FINALE_STEPS[2].bend.length);
  assert.equal(BASICS_FINALE_STEPS[3].beats, 96);
});

test("finale navigation requires a successful learner attempt and cannot jump over parts", () => {
  const s = new TutorialSession({ steps: BASICS_FINALE_STEPS });
  s.requireCompletion = true;
  s.demonstrated.add(s.step.id);
  assert.equal(s.navigate(1, 10), false);
  s.startAttempt(20);
  assert.equal(s.accept({ id: "demo", origin: "demonstration", startMs: 30 }), false);
  s.finishResult({ ok: false }, 40);
  assert.equal(s.navigate(1, 50), false);
  s.startAttempt(60);
  s.finishResult({ ok: true, assisted: true }, 70);
  assert.equal(s.navigate(1, 80), false);
  s.startAttempt(90);
  s.finishResult({ ok: true }, 100);
  assert.equal(s.navigate(2, 110), false);
  assert.equal(s.navigate(1, 110), true);
  assert.equal(s.navigate(0, 120), true);
});

test("melody cannot start on missing, demonstration-only or mutually exclusive backing", () => {
  const step = BASICS_FINALE_STEPS.at(-1);
  const snapshot = { loopers: {}, takeEvidence: {} };
  assert.match(musicUnavailable(step, snapshot), /Record your own/);
  for (const role of step.requiredTakes) {
    snapshot.loopers[role] = { hasRecording: true, clockWired: true, portId: "a" };
    snapshot.takeEvidence[role] = [{ origin: "demonstration" }];
  }
  assert.match(musicUnavailable(step, snapshot), /Record your own/);
  for (const role of step.requiredTakes) snapshot.takeEvidence[role] = [{ origin: "learner" }];
  assert.match(musicUnavailable(step, snapshot), /different Metronome outputs/);
});

test("losing a backing loop during the final melody cannot pass the composition", () => {
  const s = new TutorialSession({ steps: [BASICS_FINALE_STEPS.at(-1)] });
  s.startAttempt(0);
  s.startCountIn(0);
  s.update({ aligned: false }, 750);
  assert.equal(s.phase, "results");
  assert.equal(s.result.ok, false);
  assert.match(s.result.message, /Both recorded loops/);
});

test("finale transitions expose pending restoration so Exit waits for it", async () => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const basics = { index: 28, enter: () => pending };
  const finale = Object.assign(Object.create(BasicsFinale.prototype), { basics });
  const action = finale.action("restart-finale");
  assert.equal(basics.pending, pending);
  finish();
  await action;
});
