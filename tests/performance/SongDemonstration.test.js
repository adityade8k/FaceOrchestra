import test from "node:test";
import assert from "node:assert/strict";
import { SongDemonstration } from "../../src/performance/SongDemonstration.js";

function fixture() {
  const calls = [];
  const note = { id: "note", role: "lead", hand: "R", beat: 1, beats: 0.25 };
  const helper = { visible: true };
  const adapter = {
    labels: new Map([["note", helper]]),
    setVirtualsActive: (...args) => calls.push(args),
    releaseVirtuals() {},
    focus() {},
  };
  const ensemble = {
    anchor: 0,
    hands: { play: (...args) => calls.push(args), release() {}, labels: new Map() },
  };
  const driver = new SongDemonstration(
    {
      adapter,
      cues: {
        reset() {
          assert.fail("Playback must not clear headset guidance");
        },
      },
      liveBendFeedback: {
        reset() {
          assert.fail("Playback must not clear bend feedback");
        },
      },
    },
    ensemble,
    { score: { events: [note], durationBeats: 2 } },
  );
  return { driver, calls, helper };
}

test("recorded demonstration preserves headset cues while hiding virtual controllers", () => {
  const { driver, calls, helper } = fixture();
  driver.start();
  assert.deepEqual(calls[0], [true, "demonstration", { showHelpers: false }]);
  assert.equal(helper.visible, true);
  driver.update(0, 0);
  driver.update(1000, 1.1);
  driver.update(1500, 1.5);
  assert.equal(driver.nextEvent, 1);
  assert.equal(calls.length, 4);
  driver.stop();
  assert.equal(helper.visible, true);
  assert.equal(driver.active, false);
});

test("a frame stall cannot silently skip a note in a completed demonstration", () => {
  const { driver } = fixture();
  driver.start();
  driver.update(0, 0);
  assert.throws(() => driver.update(1500, 1.5), /missed a note/);
  driver.stop();
  driver.start();
  assert.equal(driver.nextEvent, 0, "Restart checks every event again");
  driver.update(1000, 1);
  driver.stop();
});

test("demonstration input advances without a rendered frame and stops its timer", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const { driver, calls } = fixture();
  let beat = 1.1;
  const errors = [];
  driver.start();
  driver.schedule(
    () => beat,
    (error) => errors.push(error),
  );
  t.mock.timers.tick(16);
  assert.equal(driver.nextEvent, 1);
  assert.equal(calls.length, 2);
  driver.update(0, 0.9);
  assert.equal(calls.length, 2, "An older animation timestamp cannot retrigger a note");
  driver.stop();
  const count = calls.length;
  t.mock.timers.tick(32);
  assert.equal(calls.length, count);
  driver.start();
  beat = 1.5;
  driver.schedule(
    () => beat,
    (error) => errors.push(error),
  );
  t.mock.timers.tick(16);
  assert.match(errors[0].message, /missed a note/);
  driver.stop();
});

test("score completion cannot retrigger a final hold that exceeds the endpoint by floating point rounding", () => {
  const { driver, calls } = fixture();
  driver.events[0].beat = 0.1;
  driver.events[0].beats = 0.2;
  driver.definition.score.durationBeats = 0.3;
  assert.ok(driver.events[0].beat + driver.events[0].beats > 0.3);
  let releases = 0;
  driver.ensemble.hands.release = () => releases++;
  driver.start();
  driver.update(150, 0.15);
  const before = calls.length;
  driver.ensemble.anchor = null;
  driver.update(300, 0.3);
  driver.update(320, 0.3);
  assert.equal(calls.length, before, "No play call after the conductor's final release");
  assert.equal(releases, 1);
  driver.stop();
});
