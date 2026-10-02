import { cueCanvas } from "../helpers/cueCanvas.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TutorialTimingCues } from "../../src/tutorial/TutorialTimingCues.js";
import { TutorialRuntime } from "../../src/tutorial/TutorialRuntime.js";
import { KuchTutorial } from "../../src/tutorial/kuch/KuchTutorial.js";
import {
  MELODY,
  BEAT_MS,
  DRUMS,
  CHORDS,
} from "../../src/tutorial/kuch/score.js";
import {
  createKuchGuidance,
  ARRANGEMENTS,
} from "../../src/tutorial/kuch/arrangements.js";
import { kuchTiming } from "../../src/tutorial/kuch/timing.js";

function fixture() {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    targets = new Map();
  const r = {
    scene,
    controllers: [],
    controllerStates: new Map(),
    getUserCamera: () => camera,
  };
  for (const role of new Set([
    ...MELODY.map((e) => e.role),
    "D",
    "C",
    "percussion",
    "percussionLooper",
  ])) {
    const root = new THREE.Group();
    root.position.set(targets.size * 0.3, 1, -1);
    scene.add(root);
    targets.set(role, {
      root,
      getSqueezeColliderSphere: () => ({
        center: root.getWorldPosition(new THREE.Vector3()),
        radius: root.getWorldScale(new THREE.Vector3()).x * 0.1,
      }),
    });
  }
  const metro = { getBeatTiming: () => ({ beatOriginMs: 0 }) };
  let observed = 0,
    focus = "old";
  const a = {
    r,
    get: (role) => (role === "metronome" ? metro : targets.get(role)),
    gestures: new Map(),
    lastStrikes: new Map(),
    cacheStrikeTarget: (role) => targets.get(role)?.root.position,
    observe: () => observed++,
    focus: (role) => (focus = role),
    releaseVirtuals() {},
    setVirtualsActive() {},
    releaseAll() {},
    stopSound() {},
  };
  const cues = new TutorialTimingCues(a, { createCanvas: cueCanvas });
  const host = {
    r,
    adapter: a,
    cues,
    ready: true,
    lastDraw: Infinity,
    progressSavedAt: Infinity,
    panel: { xr: false, animate() {} },
    render() {},
  };
  const k = (host.kuch = new KuchTutorial(host, ARRANGEMENTS.original));
  return {
    r,
    a,
    cues,
    host,
    k,
    targets,
    observed: () => observed,
    focus: () => focus,
  };
}
test("shared renderer keeps white on upcoming and sounding bends while yellow grows to it", () => {
  const f = fixture();
  try {
    for (const bpm of [40, 92])
      for (const event of [
        ARRANGEMENTS["easier-bends"].events.find(
          (e) => e.bend && e.transition.semitones > 0,
        ),
        ARRANGEMENTS["easier-bends"].events.find(
          (e) => e.bend && e.transition.semitones < 0,
        ),
      ]) {
        const clock = kuchTiming(bpm);
        const guide = createKuchGuidance(
          { id: "preview", kind: "melody", events: [event] },
          0,
          "practice",
          clock,
        );
        f.cues.update(guide, (event.beat - 0.8) * clock.beatMs);
        const pair = f.cues.pool.find((p) => p.green.visible);
        const size = pair.green.scale.x;
        assert.equal(pair.yellow.visible, false);
        assert.equal(pair.reference.visible, true);
        const whiteSize = pair.reference.scale.x;
        assert.equal(f.cues.gauge.root.visible, true);
        assert.equal(f.cues.gauge.state.preview, true);
        assert.equal(f.cues.gauge.actual.visible, false);
        const marker = f.cues.gauge.expected.position.clone();
        f.cues.update(guide, (event.beat - 0.2) * clock.beatMs);
        assert.ok(pair.green.scale.x < size);
        assert.deepEqual(
          f.cues.gauge.expected.position.toArray(),
          marker.toArray(),
        );
        f.cues.update(guide, event.beat * clock.beatMs);
        assert.equal(pair.green.visible, false);
        assert.equal(
          pair.yellow.visible,
          false,
          "Yellow starts at zero on the exact attack",
        );
        assert.equal(
          pair.reference.visible,
          true,
          "White still marks the sounding note at attack",
        );
        assert.equal(f.cues.gauge.state.preview, false);
        assert.equal(f.cues.gauge.state.required, 0);
        assert.equal(f.cues.gauge.expected.material.color.getHex(), 0xffd15a);
        const fraction = (event.bend[1].fraction + event.bend[2].fraction) / 2;
        f.cues.update(
          guide,
          (event.beat + fraction * event.beats) * clock.beatMs,
        );
        assert.notEqual(f.cues.gauge.state.required, 0);
        const midSize = pair.yellow.scale.x;
        assert.ok(midSize > 0 && midSize < whiteSize);
        f.cues.update(guide, (event.beat + 0.999 * event.beats) * clock.beatMs);
        assert.ok(
          pair.yellow.scale.x > midSize && pair.yellow.scale.x < whiteSize,
        );
        assert.ok(Math.abs(pair.yellow.scale.x / whiteSize - 0.999) < 1e-10);
        assert.equal(
          pair.reference.scale.x,
          whiteSize,
          "White remains fixed during the hold",
        );
        f.cues.update(guide, (event.endBeat + 0.000001) * clock.beatMs);
        assert.equal(pair.yellow.visible, false);
        assert.equal(
          pair.reference.visible,
          false,
          "Inactive notes no longer have white rings",
        );
        assert.equal(f.cues.gauge.root.visible, false);
      }
  } finally {
    f.cues.dispose();
  }
});
test("Kuch keyboard mutates only changed state and catches up after XR", () => {
  const f = fixture();
  let writes = 0,
    hidden = false;
  f.k.dom = {
    get hidden() {
      return hidden;
    },
    set hidden(value) {
      hidden = value;
      writes++;
    },
  };
  const event = MELODY[0];
  const button = (role) => {
    let disabled = false;
    return {
      get disabled() {
        return disabled;
      },
      set disabled(value) {
        disabled = value;
        writes++;
      },
      dataset: new Proxy(
        { role },
        {
          set(data, key, value) {
            data[key] = value;
            writes++;
            return true;
          },
        },
      ),
    };
  };
  f.k.buttons = [button(event.role), button("other")];
  try {
    f.k.afterFrame(0);
    writes = 0;
    for (let i = 0; i < 200; i++) f.k.afterFrame(i);
    assert.equal(writes, 0, "idle frames do not rewrite DOM attributes");
    f.host.panel.xr = true;
    f.k.afterFrame(0);
    writes = 0;
    f.k.phase = { events: [event], learner: false };
    f.k.anchor = 0;
    for (let i = 0; i < 100; i++) f.k.afterFrame(i);
    assert.equal(writes, 0, "hidden desktop controls do no per-frame DOM work");
    f.host.panel.xr = false;
    f.k.afterFrame((event.beat + 0.1) * BEAT_MS);
    assert.equal(hidden, false);
    assert.equal(f.k.buttons[0].disabled, true);
    assert.equal(f.k.buttons[0].dataset.active, "true");
    assert.equal(f.k.buttons[1].dataset.active, "false");
    writes = 0;
    f.k.afterFrame((event.beat + 0.1) * BEAT_MS);
    assert.equal(writes, 0);
  } finally {
    f.cues.dispose();
  }
});
test("untimed notes grow yellow from the real squeeze and retain white only while waiting or held", () => {
  const f = fixture(),
    controller = new THREE.Group(),
    role = MELODY[0].role;
  const guide = {
    step: { type: "note", role, timed: false, minimumMs: 450 },
    anchorMs: null,
    beatMs: 1000,
  };
  try {
    f.cues.update(guide, 0);
    const pair = f.cues.pool[0];
    assert.equal(pair.reference.visible, true);
    assert.equal(pair.yellow.visible, false);
    f.a.gestures.set(controller, { role, startMs: 100 });
    f.cues.update(guide, 100);
    assert.equal(pair.reference.visible, true);
    assert.equal(pair.yellow.visible, false);
    f.cues.update(guide, 400);
    assert.ok(
      Math.abs(pair.yellow.scale.x / pair.reference.scale.x - 0.5) < 1e-10,
    );
    f.cues.update(guide, 700);
    assert.equal(pair.yellow.visible, false);
    assert.equal(
      pair.reference.visible,
      true,
      "White remains on a note that is still physically held",
    );
    f.a.gestures.clear();
    f.cues.update(guide, 701);
    assert.equal(pair.reference.visible, false);
    assert.equal(pair.yellow.visible, false);
  } finally {
    f.cues.dispose();
  }
});
test("actual Kuch runtime dispatches stable timed guidance for Demonstrate and Practice without the legacy ring", () => {
  const f = fixture();
  try {
    for (const learner of [false, true]) {
      f.k.queue = [{ ...f.k.arrangement.parts[0], learner }];
      f.k.next(0);
      const guide = f.k.guide,
        step = guide.step;
      assert.equal(guide.mode, learner ? "practice" : "demonstration");
      assert.equal(step.type, "melody");
      assert.equal(step.timed, true);
      assert.equal(guide.beatMs, 60000 / 92);
      assert.equal(guide.anchorMs, f.k.anchor);
      assert.equal(guide.beatAt(f.k.anchor), 0);
      TutorialRuntime.prototype.afterFrame.call(
        f.host,
        f.k.anchor - 0.5 * BEAT_MS,
      );
      assert.ok(
        f.cues.pool.some(
          (p) => p.green.visible && p.green.userData.eventId === "lead-0",
        ),
      );
      TutorialRuntime.prototype.afterFrame.call(
        f.host,
        f.k.anchor + (MELODY[0].beat + 0.01) * BEAT_MS,
      );
      assert.ok(
        f.cues.pool.some(
          (p) => p.yellow.visible && p.yellow.userData.phase === "hold",
        ),
      );
      assert.equal(f.k.guide, guide);
      assert.equal(f.k.guide.step, step);
      assert.equal(f.focus(), null);
      f.k.cancel();
      assert.ok(
        f.cues.pool.every((p) => Object.values(p).every((m) => !m.visible)),
      );
    }
    assert.equal(f.observed(), 4);
  } finally {
    f.cues.dispose();
  }
});
for (const beat of [6.02, 14.02, 23.52, 97.77])
  test(`dense source passage at beat ${beat} preserves current and nearest green cues`, () => {
    const f = fixture();
    try {
      const guide = createKuchGuidance(
        { id: "dense", kind: "performance", beats: 136, events: MELODY },
        0,
      );
      f.cues.update(guide, beat * BEAT_MS);
      const next = MELODY.find((e) => e.beat > beat),
        active = MELODY.find((e) => e.beat <= beat && e.beat + e.beats > beat);
      assert.ok(
        f.cues.pool.some(
          (p) => p.green.visible && p.green.userData.eventId === next.id,
        ),
      );
      assert.ok(
        f.cues.pool.some(
          (p) => p.yellow.visible && p.yellow.userData.eventId === active.id,
        ),
      );
      for (const role of new Set([next.role, active.role]))
        assert.ok(
          f.cues.pool.some(
            (p) => p.reference.visible && p.reference.userData.role === role,
          ),
          "Each upcoming or sounding target has a white boundary",
        );
      const green = f.cues.pool
        .filter((p) => p.green.visible)
        .map((p) => p.green.userData.role);
      assert.equal(
        new Set(green).size,
        green.length,
        "nearest countdown wins on a repeated target",
      );
      const identities = f.cues.pool.flatMap((p) =>
        Object.values(p).map((m) => [m.uuid, m.geometry.uuid]),
      );
      for (let i = 0; i < 200; i++)
        f.cues.update(guide, (beat + i / 100) * BEAT_MS);
      assert.deepEqual(
        f.cues.pool.flatMap((p) =>
          Object.values(p).map((m) => [m.uuid, m.geometry.uuid]),
        ),
        identities,
      );
    } finally {
      f.cues.dispose();
    }
  });
test("rings follow authoritative transforms, retained bend target, release, cancel and untimed setup", () => {
  const f = fixture();
  try {
    const event = ARRANGEMENTS["easier-bends"].events.find((e) => e.bend);
    const guide = createKuchGuidance(
      { id: "bend", kind: "melody", beats: 136, events: [event] },
      0,
    );
    const now =
      (event.beat + event.transition.landmarkOffsetBeats + 0.1) * BEAT_MS;
    f.host.menu = { visible: false };
    f.cues.update(guide, now);
    const active = f.cues.pool.find((p) => p.yellow.visible);
    assert.equal(active.yellow.userData.role, event.role);
    assert.ok(f.cues.gauge.root.visible);
    assert.match(f.cues.bendInstruction, /F♯4/);
    const h = f.targets.get(event.role);
    h.root.position.set(3, 2, -4);
    h.root.scale.setScalar(2);
    f.cues.update(guide, now);
    assert.deepEqual(active.yellow.position.toArray(), [3, 2, -4]);
    assert.ok(Math.abs(active.reference.scale.x - 0.224) < 1e-10);
    f.cues.update(guide, (event.endBeat + 0.1) * BEAT_MS);
    assert.ok(
      f.cues.pool.every((p) => !p.yellow.visible),
      "No yellow tail after the scored release",
    );
    assert.equal(f.cues.gauge.root.visible, false);
    f.cues.update(guide, now, { active: false });
    assert.ok(
      f.cues.pool.every((p) => Object.values(p).every((m) => !m.visible)),
    );
    f.cues.update(null, now);
    assert.ok(
      f.cues.pool.every((p) => Object.values(p).every((m) => !m.visible)),
    );
    assert.equal(createKuchGuidance({ kind: "switch" }, 0), null);
    f.cues.update(
      {
        step: { type: "setup", role: event.role, timed: false },
        anchorMs: null,
        beatMs: BEAT_MS,
      },
      now,
    );
    assert.ok(
      f.cues.pool.every((p) => !p.green.visible),
      "setup has no invented countdown",
    );
    for (const [kind, events] of [
      ["drums", DRUMS],
      ["chords", CHORDS.D],
    ]) {
      f.cues.update(
        createKuchGuidance({ id: kind, kind, beats: 16, events }, 0),
        -0.1 * BEAT_MS,
      );
      assert.ok(
        f.cues.pool.some(
          (p) => p.green.visible && p.green.userData.role === events[0].role,
        ),
      );
    }
  } finally {
    f.cues.dispose();
  }
});
