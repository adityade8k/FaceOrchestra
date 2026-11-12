import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { BasicsTutorial } from "../../src/tutorial/BasicsTutorial.js";
import { BasicsInputGate } from "../../src/tutorial/BasicsInputGate.js";
import { BASICS_STEPS, BASICS_THRESHOLDS } from "../../src/tutorial/basicsSteps.js";

const controller = () => ({ userData: {}, uuid: "hand" });
const intent = (c, type, timestamp = 110, extra = {}) => ({
  controller: c,
  type,
  timestamp,
  handedness: "right",
  ...extra,
});
test("fresh input requires a neutral observation, rejects queued and demo inputs", () => {
  const gate = new BasicsInputGate(100),
    c = controller(),
    start = intent(c, "interaction.trigger.begin");
  assert.equal(gate.accept(start), false);
  gate.observe(c, { trigger: true });
  assert.equal(gate.accept(start), false);
  gate.observe(c, { trigger: false });
  assert.equal(gate.accept({ ...start, timestamp: 99 }), false);
  assert.equal(gate.accept(start), true);
  assert.equal(gate.accept(start), false);
  gate.observe(c, { trigger: false });
  c.userData.tutorialOrigin = "demonstration";
  assert.equal(gate.accept(start), false);
  c.userData.tutorialOrigin = "learner";
  c.userData.virtualTutorial = true;
  assert.equal(gate.accept(start), false);
});
test("held B and joystick need release/neutral before another lesson", () => {
  const c = controller(),
    gate = new BasicsInputGate(100);
  c.userData.gamepad = { axes: [0, 0, 1, 0] };
  gate.observe(c, { secondary: true });
  assert.equal(gate.accept(intent(c, "context.secondary")), false);
  assert.equal(
    gate.accept(intent(c, "instrument.scale.horizontal.step", 110, { direction: 1 })),
    false,
  );
  c.userData.gamepad.axes[2] = 0;
  gate.observe(c, { secondary: false });
  assert.equal(gate.accept(intent(c, "context.secondary")), true);
  assert.equal(
    gate.accept(intent(c, "instrument.scale.horizontal.step", 110, { direction: 1 })),
    true,
  );
});

function fixture(id) {
  const t = Object.create(BasicsTutorial.prototype),
    c = controller();
  const live = {
    vowel: "A",
    bend: 0,
    squeeze: 1,
    nose: 0.5,
    earLeft: 0,
    earRight: 0,
  };
  const horn = {
    id: "h",
    kind: "honk",
    root: new THREE.Group(),
    baseScale: 2.5,
    getLivePerformanceState: () => live,
    getProcessedLivePerformanceState: () => live,
    getEarAmount: (side) => live[side === "left" ? "earLeft" : "earRight"],
    hasAudioVoice: () => true,
    activeVoiceIds: new Set(),
  };
  const l = {
    id: "l",
    kind: "looper",
    tracks: [],
    transport: {},
    timeline: { hasRecording: () => false },
    looperData: { takeRevision: 1 },
  };
  const m = {
    id: "m",
    playing: false,
    volume: 0.5,
    lastEmittedBeatOrdinal: null,
  };
  const objects = new Map([
    ["basic", horn],
    ["chordLooper", l],
    ["metronome", m],
  ]);
  const s = { trigger: true, raySqueezeInstrumentState: horn };
  t.r = {
    controllerStates: new Map([[c, s]]),
    controllers: [c],
    getUserCamera: () => new THREE.Group(),
    audioSystem: { audioContextService: { context: { state: "running" } } },
    getTouchingInstrumentChain: () => [horn],
    getInstrumentVoiceId: () => "voice",
    getControllerVoiceId: () => "hand",
    instrumentRegistry: {
      get: (id) => (id === "h" ? horn : null),
      getByKind: () => [],
    },
    metronomeConnectionManager: { getConnectionForTarget: () => null },
    honkLockService: { getGroup: () => null },
  };
  t.host = {
    navigation: { screen: null, menu: { setVisible() {} } },
    panel: { setTransport() {}, completeEffect() {} },
    learningProgress: { save() {} },
  };
  t.fixtures = {
    owned: new Set(["h", "l", "m"]),
    get: (role) => objects.get(role),
    honks: [horn],
    checkpoints: new Map(),
    prepare() {},
    checkpoint() {},
    quiesce() {},
  };
  t.guidance = { reset() {}, recenter() {} };
  t.index = BASICS_STEPS.findIndex((step) => step.id === id);
  t.completed = new Set();
  t.outcomes = {};
  t.thresholds = { ...BASICS_THRESHOLDS };
  t.beginAttempt(100);
  t.fresh.set(c, { trigger: true, bend: 0, objective: t.activeObjectives[0] });
  return { t, c, s, horn, live, l, m, objects };
}
test("Next cannot bypass an unfinished lesson even through direct action calls", async () => {
  const { t } = fixture("honk");
  await t.action("next-step");
  assert.equal(t.index, 0);
  await t.enter(3);
  assert.equal(t.index, 0);
  t.completed.add("honk");
  await t.action("next-step");
  assert.equal(t.index, 1);
  assert.equal(t.completed.has("honk"), true);
});
test("review keeps history and never schedules auto-advance on a repeated honk", () => {
  const { t } = fixture("honk");
  t.completed.add("honk");
  t.visited = true;
  t.sample(110);
  t.sample(300);
  assert.equal(t.objectives.has("honk"), true);
  assert.equal(t.successAt, null);
  assert.equal(t.index, 0);
});
test("sound requires real voice, active audio context and fresh learner squeeze", () => {
  const { t, c, horn } = fixture("honk");
  horn.hasAudioVoice = () => false;
  t.sample(110);
  t.sample(300);
  assert.equal(t.completed.size, 0);
  horn.hasAudioVoice = () => true;
  t.fresh.get(c).trigger = false;
  t.sample(500);
  assert.equal(t.completed.size, 0);
  t.fresh.get(c).trigger = true;
  t.r.audioSystem.audioContextService.context.state = "suspended";
  t.sample(700);
  assert.equal(t.completed.size, 0);
  t.r.audioSystem.audioContextService.context.state = "running";
  t.sample(800);
  t.sample(1000);
  assert.equal(t.completed.has("honk"), true);
});
test("bend ignores jitter and requires the sounding parameter to change", () => {
  const { t, live } = fixture("bend");
  t.sample(110);
  live.bend = 0.04;
  t.sample(300);
  assert.equal(t.completed.size, 0);
  live.bend = 0.3;
  t.sample(400);
  assert.equal(t.objectives.size, 1);
  t.sample(500);
  assert.equal(t.objectives.size, 1, "Holding one bend cannot earn repetitions");
  live.bend = 0.04;
  t.sample(600);
  live.bend = -0.3;
  t.sample(700);
  assert.equal(t.objectives.size, 2);
  live.bend = 0.04;
  t.sample(800);
  live.bend = 0.3;
  t.sample(900);
  assert.equal(t.completed.has("bend"), true);
});
test("all five vowels must be sounded; cycling without a fresh squeeze is insufficient", () => {
  const { t, c, live } = fixture("vowels");
  t.fresh.get(c).trigger = false;
  for (const [i, vowel] of ["A", "E", "I", "O", "U"].entries()) {
    live.vowel = vowel;
    t.sample(200 + i * 300);
  }
  assert.equal(t.objectives.size, 0);
  t.fresh.get(c).trigger = true;
  for (const [i, vowel] of Array(3).fill(["A", "E", "I", "O", "U"]).flat().entries()) {
    live.vowel = vowel;
    t.sample(2000 + i * 300);
    t.sample(2200 + i * 300);
    assert.equal(t.completed.has("vowels"), i === 14);
  }
});
test("ear objectives are sequential, parameter-based, and need both directions on both ears", () => {
  const { t, c, s, horn, live } = fixture("ears");
  const interaction = { instrumentState: horn, dragType: "ear", side: "left" };
  s.activeTriggerInteraction = interaction;
  Object.assign(t.fresh.get(c), { interaction, parameter: 0 });
  live.earRight = 0.8;
  t.sample(110);
  assert.equal(t.objectives.size, 0);
  live.earLeft = 0.3;
  t.sample(200);
  assert.equal(t.objectives.size, 1);
  t.sample(220);
  t.sample(240);
  assert.equal(t.objectives.size, 1);
  live.earLeft = -0.2;
  t.sample(300);
  assert.equal(t.objectives.size, 2);
  live.earRight = 0;
  interaction.side = "right";
  t.sample(320);
  live.earRight = 0.3;
  t.sample(400);
  assert.equal(t.objectives.size, 3);
  t.sample(420);
  assert.equal(t.completed.size, 0);
  live.earRight = -0.1;
  t.sample(450);
  assert.equal(t.completed.has("ears"), true);
});
test("a silent ear adjustment cannot be banked for a later sounding pitch objective", () => {
  const { t, c, s, horn, live } = fixture("pitch");
  t.award("bend-1");
  const interaction = { instrumentState: horn, dragType: "ear", side: "left" };
  s.activeTriggerInteraction = interaction;
  s.raySqueezeInstrumentState = null;
  Object.assign(t.fresh.get(c), {
    interaction,
    objective: "ear-up-1",
    parameter: 0,
  });
  live.earLeft = 0.5;
  t.sample(120);
  s.raySqueezeInstrumentState = horn;
  t.sample(200);
  t.sample(400);
  assert.equal(t.completed.size, 0);
  live.earLeft = 0.8;
  t.sample(500);
  assert.equal(t.objectives.has("ear-up-1"), true);
  assert.equal(t.completed.has("pitch"), false, "All three rounds still required");
});
test("recording requires a user arm, sound inside capture, finalization and usable content", () => {
  const { t, l } = fixture("record");
  l.timeline.hasRecording = () => true;
  l.looperData.recordingCompletion = { observedAtMs: 200 };
  l.looperData.takeRevision = 2;
  t.sample(110);
  t.sample(300);
  assert.equal(t.completed.size, 0);
  t.recordRequest = { id: l.id, revision: 2 };
  t.award("armed");
  l.transport.recording = true;
  t.sample(400);
  assert.equal(t.objectives.has("sound"), true);
  l.transport.recording = false;
  t.sample(500);
  assert.equal(t.completed.size, 0);
  l.looperData.takeRevision = 3;
  l.looperData.recordingCompletion.observedAtMs = 600;
  t.sample(600);
  assert.equal(t.completed.has("record"), false, "Finishing alone does not replace physical Stop");
  t.award("stopped");
  t.sample(700);
  assert.equal(t.completed.has("record"), true);
});
test("setup and non-learner strikes cannot earn credit", () => {
  const { t } = fixture("strike");
  t.setup = true;
  t.award("first");
  assert.equal(t.objectives.size, 0);
  t.setup = false;
  t.accept({
    kind: "strike",
    startMs: 200,
    origin: "demonstration",
    withdrawn: true,
    targetId: "h",
  });
  assert.equal(t.objectives.size, 0);
});

test("onboarding requires a fresh Trigger hold; aiming alone never completes the Honk lesson", () => {
  const { t, c, s, horn } = fixture("honk");
  t.fresh.clear();
  s.trigger = false;
  t.sample(110);
  t.sample(300);
  assert.equal(t.completed.size, 0, "Inherited aiming does not pass a new lesson");
  s.raySqueezeInstrumentState = null;
  t.sample(310);
  s.raySqueezeInstrumentState = horn;
  t.sample(320);
  s.raySqueezeInstrumentState = null;
  t.sample(400);
  s.raySqueezeInstrumentState = horn;
  t.sample(410);
  t.sample(500);
  assert.equal(t.completed.size, 0, "Aiming cannot earn Honk credit");
  t.sample(600);
  assert.equal(t.completed.has("honk"), false);
  s.trigger = true;
  t.fresh.set(c, { trigger: true });
  t.sample(610);
  t.sample(810);
  assert.equal(t.completed.has("honk"), true);
});

test("movement has no fixed destination and requires bringing the horn within reach", () => {
  const { t, c, s, horn } = fixture("move");
  horn.root.position.set(0, 0, -1.3);
  Object.assign(s, {
    trigger: false,
    gripHeld: true,
    gripInstrumentState: horn,
  });
  t.fresh.set(c, {
    grip: {
      id: horn.id,
      sourceId: horn.id,
      position: horn.root.position.clone(),
    },
  });
  horn.root.position.x = -0.025;
  t.sample(120);
  assert.equal(t.objectives.size, 0, "Jitter does not pass movement");
  horn.root.position.x = -0.5;
  t.sample(140);
  assert.equal(t.objectives.has("move"), true, "Movement in either direction counts");
  assert.equal(t.completed.has("move"), false, "Distant horn still needs bringing closer");
  horn.root.position.set(-0.2, 0, -0.5);
  t.sample(160);
  assert.equal(t.completed.has("move"), true);
});

test("playback waits for physical Pause to take effect and preserves the take", () => {
  const { t, c, l } = fixture("playback");
  l.timeline.hasRecording = () => true;
  l.timeline.recordedDurationMs = 500;
  l.transport.playing = true;
  l.looperData.playbackEngine = { clockElapsedMs: 600 };
  t.playRequested.add(l.id);
  t.audibleLoops.add(l.id);
  t.sample(200);
  assert.equal(t.objectives.has("heard"), true);
  const press = (action) => {
    t.before.set(c, {
      target: l,
      hit: { userData: { looperButtonAction: action } },
    });
    t.onIntent(intent(c, "interaction.trigger.begin", 220));
  };
  press("stop");
  assert.equal(t.pauseRequested, false, "Stop cannot satisfy Pause");
  press("pause");
  t.sample(300);
  assert.equal(t.completed.has("playback"), false, "Wait for the clocked pause");
  l.transport.paused = true;
  t.sample(400);
  assert.equal(t.completed.has("playback"), true);
  assert.equal(l.timeline.hasRecording(), true);
});

test("successful loop switching stays interactive until the learner chooses Next", () => {
  const { t, c, s, l, objects } = fixture("switch");
  const second = {
    id: "second",
    transport: { playing: false },
    looperData: { queued: true },
  };
  objects.set("alternativeLooper", second);
  t.loopAudible = (looper) => looper.transport.playing;
  t.playRequested.add(l.id);
  l.transport.playing = true;
  t.sample(200);
  t.playRequested.add(second.id);
  t.sample(220);
  second.transport.playing = true;
  l.transport.playing = false;
  t.sample(250);
  assert.equal(t.completed.has("switch"), true);
  t.guidance.update = () => {};
  t.enter = () => {
    throw new Error("Switch lesson must not auto-advance");
  };
  t.update(3000);
  assert.equal(second.transport.playing, true);
  const hit = { userData: { looperButtonAction: "play" } };
  t.r.getCurrentHit = () => ({ object: hit });
  t.r.instrumentRegistry.getFromObject3D = () => l;
  t.r.honkLockService.getGroupForMember = () => null;
  t.routesKey = () => "routes";
  s.trigger = false;
  t.sample(3100);
  const press = intent(c, "interaction.trigger.begin", 3200);
  assert.equal(t.captureIntent(press, s), false, "Play is still delivered to the instrument");
  t.playRequested.delete(l.id);
  t.onIntent(press);
  assert.equal(t.playRequested.has(l.id), true, "Another switch remains usable after success");
  assert.equal(t.successAt, 250, "Completion is not repeatedly re-awarded");
});

test("final lesson requires fresh learner left-joystick hide then show", () => {
  const { t, c } = fixture("finish");
  const toggle = (kind, extra = {}, startMs = 150) =>
    t.accept({
      kind,
      origin: "learner",
      startMs,
      intent: intent(c, "menu.toggle", startMs, {
        handedness: "left",
        ...extra,
      }),
    });
  t.accept({ kind: "menu.hide", origin: "learner" });
  toggle("menu.hide", {}, 90);
  toggle("menu.hide", { handedness: "right" });
  toggle("menu.show");
  assert.equal(
    t.objectives.size,
    0,
    "Programmatic, stale, wrong-hand or show-first input is ignored",
  );
  c.userData.virtualTutorial = true;
  toggle("menu.hide");
  assert.equal(t.objectives.size, 0);
  c.userData.virtualTutorial = false;
  toggle("menu.hide");
  t.sample(160);
  assert.equal(t.completed.has("finish"), false);
  toggle("menu.show", {}, 180);
  t.sample(200);
  assert.equal(t.completed.has("finish"), true);
  t.guidance.update = () => {};
  t.enter = () => {
    throw new Error("Final menu lesson must stay open");
  };
  t.update(3000);
});
