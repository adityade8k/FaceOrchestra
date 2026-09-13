import test from "node:test";
import assert from "node:assert/strict";

import { HonkVoiceService } from "../../../src/audio/honk/HonkVoiceService.js";
import { HonkContactGraph } from "../../../src/instruments/formations/HonkContactGraph.js";
import { HonkInstrument } from "../../../src/instruments/honk/HonkInstrument.js";
import { LooperController } from "../../../src/instruments/looper/LooperController.js";
import { LooperActionEventType } from "../../../src/instruments/looper/timeline/LooperActionEvent.js";

test("scheduled playback cancels only departing transitive followers during a held note", () => {
  const harness = createHarness({ noteStartMs: 0, noteEndMs: 500, durationMs: 1000 });
  harness.graph.setContact("honk-a", "honk-b", true);
  harness.graph.setContact("honk-b", "honk-c", true);

  harness.start();
  assert.deepEqual(harness.startedHonks(), ["honk-a", "honk-b", "honk-c"]);

  harness.graph.setContact("honk-a", "honk-b", false);
  harness.advance(200);

  assert.deepEqual(harness.cancelledHonks(), ["honk-b", "honk-c"]);
  assert.equal(harness.cancelledHonks().includes("honk-a"), false);

  harness.advance(400);
  harness.advance(520);
  assert.equal(harness.releasesFor("honk-a").length, 1);
  assert.equal(harness.startsFor("honk-a").length, 1);
});

test("a follower departing before a queued attack cannot sound later", () => {
  const harness = createHarness({ noteStartMs: 100, noteEndMs: 300, durationMs: 1000 });
  harness.graph.setContact("honk-a", "honk-b", true);
  harness.graph.setContact("honk-b", "honk-c", true);

  harness.start();
  assert.deepEqual(harness.startedHonks(), ["honk-a", "honk-b", "honk-c"]);

  harness.graph.setContact("honk-a", "honk-b", false);
  harness.advance(50);

  assert.deepEqual(harness.cancelledHonks(), ["honk-b", "honk-c"]);
  assert.equal(harness.controller.applier.scheduledGenerations.size, 1);
});

test("new transitive followers join a held note at the current phase exactly once", () => {
  const harness = createHarness({ noteStartMs: 0, noteEndMs: 500, durationMs: 1000 });
  harness.start();
  assert.deepEqual(harness.startedHonks(), ["honk-a"]);

  harness.graph.setContact("honk-a", "honk-b", true);
  harness.graph.setContact("honk-b", "honk-c", true);
  harness.advance(200);

  assert.equal(harness.startsFor("honk-a").length, 1);
  assert.equal(harness.startsFor("honk-b").length, 1);
  assert.equal(harness.startsFor("honk-c").length, 1);
  assert.ok(Math.abs(harness.startsFor("honk-b")[0].scheduledTime - 10.2) < 1e-10);
  assert.ok(Math.abs(harness.startsFor("honk-c")[0].scheduledTime - 10.2) < 1e-10);
  const joinedUpdate = harness.calls.find(
    (call) => call.kind === "update" &&
      call.voiceId === harness.startsFor("honk-b")[0].voiceId &&
      Math.abs(call.scheduledTime - 10.2) < 1e-10,
  );
  assert.equal(joinedUpdate.snapshot.squeeze, 1);
  assert.equal(joinedUpdate.snapshot.bend, 0.25);

  harness.advance(400);
  harness.advance(520);
  assert.equal(harness.releasesFor("honk-b").length, 1);
  assert.equal(harness.releasesFor("honk-c").length, 1);
  assert.equal(harness.releasesFor("honk-b")[0].scheduledTime, 10.5);
  assert.equal(harness.releasesFor("honk-c")[0].scheduledTime, 10.5);
});

test("joining during a rest stays silent but reconstructs an already queued future note", () => {
  const harness = createHarness({ noteStartMs: 100, noteEndMs: 150, durationMs: 1000 });
  harness.start();
  harness.graph.setContact("honk-a", "honk-b", true);
  harness.graph.setContact("honk-b", "honk-c", true);
  harness.advance(50);

  for (const honkId of ["honk-b", "honk-c"]) {
    assert.equal(harness.startsFor(honkId).length, 1);
    assert.ok(Math.abs(harness.startsFor(honkId)[0].scheduledTime - 10.1) < 1e-12);
    assert.equal(harness.releasesFor(honkId).length, 1);
    assert.ok(Math.abs(harness.releasesFor(honkId)[0].scheduledTime - 10.15) < 1e-12);
  }
  harness.advance(60);
  assert.equal(harness.startsFor("honk-b").length, 1);
  assert.equal(harness.startsFor("honk-c").length, 1);
});

test("departure cancels a generation even when its future end is already queued", () => {
  const harness = createHarness({ noteStartMs: 0, noteEndMs: 50, durationMs: 1000 });
  harness.graph.setContact("honk-a", "honk-b", true);
  harness.start();
  const departedVoiceId = harness.startsFor("honk-b")[0].voiceId;
  assert.equal(harness.releasesFor("honk-b").length, 1);

  harness.graph.setContact("honk-a", "honk-b", false);
  harness.advance(20);

  const cancellation = harness.calls.find(
    (call) => call.kind === "cancel" && call.voiceId === departedVoiceId,
  );
  assert.ok(cancellation);
  assert.equal(cancellation.fadeSeconds, 0.035);
  assert.equal(harness.controller.applier.scheduledGenerations.size, 1);
});

test("departure during a release tail cancels retained generation ownership", () => {
  const harness = createHarness({ noteStartMs: 0, noteEndMs: 50, durationMs: 1000 });
  harness.graph.setContact("honk-a", "honk-b", true);
  harness.start();
  const releasedVoiceId = harness.releasesFor("honk-b")[0].voiceId;

  harness.graph.setContact("honk-a", "honk-b", false);
  harness.advance(60);

  assert.ok(harness.calls.some(
    (call) => call.kind === "cancel" && call.voiceId === releasedVoiceId,
  ));
  assert.equal(
    [...harness.controller.applier.scheduledGenerations.values()]
      .some(({ honkId }) => honkId === "honk-b"),
    false,
  );
});

test("rapid leave and rejoin creates a fresh generation immune to the old queued end", () => {
  const harness = createHarness({ noteStartMs: 0, noteEndMs: 80, durationMs: 1000 });
  harness.graph.setContact("honk-a", "honk-b", true);
  harness.start();
  const oldVoiceId = harness.startsFor("honk-b")[0].voiceId;

  harness.graph.setContact("honk-a", "honk-b", false);
  harness.advance(20);
  harness.graph.setContact("honk-a", "honk-b", true);
  harness.advance(30);

  const starts = harness.startsFor("honk-b");
  assert.equal(starts.length, 2);
  assert.notEqual(starts[0].voiceId, starts[1].voiceId);
  assert.ok(harness.calls.some((call) => call.kind === "cancel" && call.voiceId === oldVoiceId));
  assert.ok(harness.releasesFor("honk-b").some(
    (call) => call.voiceId === starts[1].voiceId && Math.abs(call.scheduledTime - 10.08) < 1e-10,
  ));
});

test("removing one graph edge preserves a follower reachable by an alternate path", () => {
  const harness = createHarness({ noteStartMs: 0, noteEndMs: 500, durationMs: 1000 });
  harness.graph.setContact("honk-a", "honk-b", true);
  harness.graph.setContact("honk-b", "honk-c", true);
  harness.graph.setContact("honk-a", "honk-c", true);
  harness.start();

  harness.graph.setContact("honk-a", "honk-b", false);
  harness.advance(200);

  assert.deepEqual(harness.cancelledHonks(), []);
  assert.equal(harness.startsFor("honk-b").length, 1);
  assert.equal(harness.startsFor("honk-c").length, 1);
});

test("multiple short notes in one lookahead window retain distinct target generations", () => {
  const harness = createHarness({
    notes: [[10, 20], [30, 40], [50, 60]],
    durationMs: 200,
  });
  harness.graph.setContact("honk-a", "honk-b", true);
  harness.start();

  const starts = harness.startsFor("honk-b");
  assert.equal(starts.length, 3);
  assert.equal(new Set(starts.map(({ voiceId }) => voiceId)).size, 3);
  assert.deepEqual(
    harness.releasesFor("honk-b").map(({ voiceId }) => voiceId),
    starts.map(({ voiceId }) => voiceId),
  );
});

test("two loopers and a manual voice keep exact ownership when a contact splits", () => {
  const graph = new HonkContactGraph();
  graph.addHonk("honk-a");
  graph.addHonk("honk-b");
  graph.setContact("honk-a", "honk-b", true);
  const calls = [];
  const first = createHarness({
    graph,
    calls,
    looperId: "looper-one",
    connectedHonkId: "honk-a",
    noteStartMs: 0,
    noteEndMs: 500,
    durationMs: 1000,
  });
  const second = createHarness({
    graph,
    calls,
    looperId: "looper-two",
    connectedHonkId: "honk-b",
    noteStartMs: 0,
    noteEndMs: 500,
    durationMs: 1000,
  });
  first.start();
  second.start();
  graph.setContact("honk-a", "honk-b", false);
  first.advance(200);
  second.advance(200);

  const cancelled = calls.filter(({ kind }) => kind === "cancel");
  assert.equal(cancelled.length, 2);
  assert.ok(cancelled.some(({ voiceId, honkId }) => voiceId.includes("looper-one") && honkId === "honk-b"));
  assert.ok(cancelled.some(({ voiceId, honkId }) => voiceId.includes("looper-two") && honkId === "honk-a"));
  assert.equal(cancelled.some(({ voiceId }) => voiceId === "honk-a:manual"), false);
  assert.equal(cancelled.some(({ voiceId }) => voiceId === "honk-b:manual"), false);
});

test("a scheduled-only target is reconciled even without a visual target entry", () => {
  const harness = createHarness({ noteStartMs: 100, noteEndMs: 200, durationMs: 1000 });
  harness.graph.setContact("honk-a", "honk-b", true);
  const data = harness.looper.looperData;
  data.transport.play();
  data.audioScheduling.startWallMs = 0;
  data.audioScheduling.startSourceMs = 0;
  data.audioScheduling.scheduledThroughSourceMs = 120;
  data.audioScheduling.includeStart = false;
  data.audioScheduling.lastRate = 1;
  harness.controller.applier.initializeAudioTargets(harness.looper, data.tracks[0]);
  harness.controller.scheduleSourceRange(harness.looper, 0, 120, {
    includeStart: true,
    sourceNow: 0,
    rate: 1,
    audioNow: 10,
  });
  assert.equal(harness.controller.applier.appliedTracks.size, 0);

  harness.graph.setContact("honk-a", "honk-b", false);
  harness.advance(50);

  assert.equal(harness.cancelledHonks().includes("honk-b"), true);
  assert.equal(
    [...harness.controller.applier.scheduledGenerations.values()]
      .some(({ honkId }) => honkId === "honk-b"),
    false,
  );
});

test("controller cancellation reaches the Honk voice service and invalidates async readiness", async () => {
  const graph = new HonkContactGraph();
  graph.addHonk("honk-a");
  graph.addHonk("honk-b");
  graph.setContact("honk-a", "honk-b", true);
  let resolveFollowerAudio;
  let followerCreateCount = 0;
  const followerService = new HonkVoiceService({
    ensureAudio: () => new Promise((resolve) => { resolveFollowerAudio = resolve; }),
    getDestination: () => null,
    createVoice: () => {
      followerCreateCount += 1;
      return {};
    },
  });
  const instruments = new Map([
    ["honk-a", createHonk("honk-a", {
      startVoice() {},
      updateVoice() {},
      releaseVoice() {},
      cancelVoice() {},
    })],
    ["honk-b", createHonk("honk-b", followerService)],
  ]);
  let wallNow = 0;
  let audioNow = 10;
  const controller = new LooperController({
    ensureAudio() {},
    getAudioCurrentTime: () => audioNow,
    getTimingForLooper: () => ({ connected: false }),
    isPlayableHonkId: (honkId) => instruments.get(honkId)?.isPlayable() || false,
    getPlaybackTargetIds: (_track, honkId) => [...graph.getConnectedComponent(honkId)],
    startActionVoice: (voiceId, honkId, options) =>
      instruments.get(honkId)?.startAudioVoice(voiceId, options),
    updateActionVoiceByHonkId() {},
    releaseActionVoice: (voiceId, honkId, options) =>
      instruments.get(honkId)?.releaseAudioVoice(voiceId, options),
    cancelActionVoice: (voiceId, honkId, options) =>
      instruments.get(honkId)?.cancelAudioVoice(voiceId, options),
    setAutomationLayerByHonkId() {},
    clearAutomationLayerByHonkId() {},
    updateVisuals() {},
  });
  const looper = { id: "looper-a", root: { visible: true }, hitTargets: {} };
  looper.looperData = controller.createStateData(looper, { trackCount: 1 });
  looper.looperData.tracks[0].connectedHonkId = "honk-a";
  looper.looperData.timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeStart,
    timeMs: 100,
    value: 1,
    gateOnly: true,
  });
  looper.looperData.timeline.addActionEvent("track-0", {
    trackIndex: 0,
    type: LooperActionEventType.SqueezeEnd,
    timeMs: 200,
    value: 0,
    gateOnly: true,
  });
  looper.looperData.timeline.finalizeDuration();
  looper.looperData.timeline.durationMs = 1000;
  looper.looperData.hasRecording = true;
  audioNow -= 0.2;
      controller.startPlayback(looper, wallNow - 200);
      audioNow += 0.2;
      controller.updateClockedTransports([looper], wallNow);
      controller.schedulePlaybackAudioForLooper(looper, wallNow);
  controller.stopAudioScheduler(looper, { release: false });
  assert.equal(followerService.startingVoices.size, 1);

  graph.setContact("honk-a", "honk-b", false);
  wallNow = 50;
  audioNow = 10.05;
  controller.updatePlaybackForLooper(looper, wallNow);
  controller.schedulePlaybackAudioForLooper(looper, wallNow);
  resolveFollowerAudio({});
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(followerCreateCount, 0);
  assert.equal(followerService.startTokens.size, 0);
  assert.equal(followerService.startingVoices.size, 0);
  assert.equal(instruments.get("honk-b").activeVoiceIds.size, 0);
});

test("mid-note join reconstructs its end after the shared cursor has queued it", () => {
  const harness = createHarness({ noteStartMs: 0, noteEndMs: 150, durationMs: 1000 });
  harness.start();
  harness.advance(30);
  assert.equal(harness.looper.looperData.audioScheduling.scheduledThroughSourceMs, 150);

  harness.graph.setContact("honk-a", "honk-b", true);
  harness.advance(50);

  assert.equal(harness.startsFor("honk-b").length, 1);
  assert.equal(harness.startsFor("honk-b")[0].scheduledTime, 10.05);
  assert.equal(harness.releasesFor("honk-b").length, 1);
  assert.ok(Math.abs(harness.releasesFor("honk-b")[0].scheduledTime - 10.15) < 1e-12);
  assert.equal(harness.startsFor("honk-a").length, 1);
});

test("mid-note join reconstructs remaining work at the changed playback rate", () => {
  const harness = createHarness({ noteStartMs: 0, noteEndMs: 500, durationMs: 1000 });
  harness.start();
  harness.looper.looperData.audioScheduling.scheduledThroughSourceMs = 600;
  harness.graph.setContact("honk-a", "honk-b", true);

  harness.controller.reconcilePlaybackAudioTargets(harness.looper, 200, {
    sourceNow: 200,
    audioNow: 10.2,
    rate: 2,
  });

  assert.equal(harness.startsFor("honk-b").length, 1);
  assert.ok(Math.abs(harness.startsFor("honk-b")[0].scheduledTime - 10.2) < 1e-10);
  assert.equal(harness.releasesFor("honk-b").length, 1);
  assert.equal(harness.releasesFor("honk-b")[0].scheduledTime, 10.35);
  assert.equal(harness.startsFor("honk-a").length, 1);
});

test("repeated contact changes across loop boundaries leave bounded ownership maps", () => {
  const harness = createHarness({ noteStartMs: 10, noteEndMs: 40, durationMs: 100 });
  harness.start();
  for (let wallMs = 25; wallMs <= 1000; wallMs += 25) {
    harness.graph.setContact("honk-a", "honk-b", wallMs % 100 < 50);
    harness.advance(wallMs);
    assert.ok(harness.controller.applier.scheduledGenerations.size <= 12);
    assert.ok(harness.controller.applier.scheduledVoices.size <= 12);
  }
  harness.controller.stopPlayback(harness.looper);
  assert.equal(harness.controller.applier.scheduledGenerations.size, 0);
  assert.equal(harness.controller.applier.scheduledVoices.size, 0);
  assert.equal(harness.controller.applier.audioTargetsByLayer.size, 0);
});

function createHarness({
  noteStartMs,
  noteEndMs,
  notes = [[noteStartMs, noteEndMs]],
  durationMs,
  graph = new HonkContactGraph(),
  calls = [],
  looperId = "looper-a",
  connectedHonkId = "honk-a",
}) {
  for (const honkId of ["honk-a", "honk-b", "honk-c"]) graph.addHonk(honkId);
  let wallNow = 0;
  let audioNow = 10;
  const adapter = {
    ensureAudio() {},
    getAudioCurrentTime: () => audioNow,
    getTimingForLooper: () => ({ connected: false }),
    isPlayableHonkId: (honkId) => graph.hasHonk(honkId),
    getPlaybackTargetIds: (_track, honkId) => [...graph.getConnectedComponent(honkId)],
    startActionVoice: (voiceId, honkId, options = {}) =>
      calls.push({ kind: "start", voiceId, honkId, ...options }),
    updateActionVoiceByHonkId: (voiceId, honkId, snapshot, _volume, options = {}) =>
      calls.push({ kind: "update", voiceId, honkId, snapshot: { ...snapshot }, ...options }),
    releaseActionVoice: (voiceId, honkId, options = {}) =>
      calls.push({ kind: "release", voiceId, honkId, ...options }),
    cancelActionVoice: (voiceId, honkId, options = {}) =>
      calls.push({ kind: "cancel", voiceId, honkId, ...options }),
    setAutomationLayerByHonkId() {},
    clearAutomationLayerByHonkId() {},
    updateVisuals() {},
  };
  const controller = new LooperController(adapter);
  const looper = { id: looperId, root: { visible: true }, hitTargets: {} };
  looper.looperData = controller.createStateData(looper, { trackCount: 1 });
  looper.looperData.tracks[0].connectedHonkId = connectedHonkId;
  const timeline = looper.looperData.timeline;
  for (const [startMs, endMs] of notes) {
    timeline.addActionEvent("track-0", {
      trackIndex: 0,
      type: LooperActionEventType.SqueezeStart,
      timeMs: startMs,
      value: 1,
      gateOnly: true,
    });
    timeline.addActionEvent("track-0", {
      trackIndex: 0,
      type: LooperActionEventType.GestureSnapshot,
      timeMs: startMs,
      values: { squeeze: 1, bend: 0.25 },
      interpolation: "linear",
    });
    timeline.addActionEvent("track-0", {
      trackIndex: 0,
      type: LooperActionEventType.SqueezeEnd,
      timeMs: endMs,
      value: 0,
      gateOnly: true,
      releaseOrigin: "controller",
    });
  }
  timeline.finalizeDuration();
  timeline.durationMs = durationMs;
  timeline.recordedDurationMs = durationMs;
  looper.looperData.hasRecording = true;

  return {
    graph,
    controller,
    looper,
    calls,
    start() {
      audioNow -= 0.2;
      controller.startPlayback(looper, wallNow - 200);
      audioNow += 0.2;
      controller.updateClockedTransports([looper], wallNow);
      controller.schedulePlaybackAudioForLooper(looper, wallNow);
      controller.stopAudioScheduler(looper, { release: false });
    },
    advance(nextWallMs) {
      wallNow = nextWallMs;
      audioNow = 10 + wallNow / 1000;
      controller.updatePlaybackForLooper(looper, wallNow);
      controller.schedulePlaybackAudioForLooper(looper, wallNow);
    },
    startedHonks: () => calls.filter(({ kind }) => kind === "start").map(({ honkId }) => honkId),
    cancelledHonks: () => calls.filter(({ kind }) => kind === "cancel").map(({ honkId }) => honkId),
    startsFor: (honkId) => calls.filter((call) => call.kind === "start" && call.honkId === honkId),
    releasesFor: (honkId) => calls.filter((call) => call.kind === "release" && call.honkId === honkId),
  };
}

function createHonk(id, voiceService) {
  return new HonkInstrument({
    id,
    root: {
      userData: {},
      visible: true,
      position: {},
      quaternion: {},
      rotation: {},
      scale: {},
    },
    voiceService,
    morphController: {
      resetAll() {},
      applyPerformanceState() {},
    },
  });
}
