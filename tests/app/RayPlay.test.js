import test from "node:test";
import assert from "node:assert/strict";
import { fixture, flushAudio } from "../helpers/manualHonkFixture.mjs";

for (const locked of [false, true])
  test(`aiming is silent; Trigger plays and releasing stops (${locked ? "locked" : "unlocked"})`, async () => {
    const f = fixture({ locked }),
      c = f.controllers[0],
      h = f.honks[0];
    c.hit = h.squeezeCollider;
    c.roll = 0.6;
    f.frame();
    await flushAudio();
    assert.equal(f.host.controllerStates.get(c).trigger, false);
    assert.equal(f.audio.voices.size, 0);
    assert.equal(h.getLivePerformanceState().bend, 0, "hover never bends");
    f.press();
    f.frame();
    await flushAudio();
    assert.equal(f.audio.voices.size, 1);
    for (let i = 0; i < 20; i++) f.frame();
    assert.equal(f.counters.starts, 1);
    f.release();
    f.frame();
    assert.equal(f.audio.voices.size, 0);
    assert.equal(c.hit, h.squeezeCollider, "Release stops sound without moving the ray");
  });

test("leaving a sustained target stops the note; reentry with Trigger held starts a fresh voice", async () => {
  const f = fixture(),
    c = f.controllers[0],
    h = f.honks[0],
    state = f.host.controllerStates.get(c);
  c.hit = h.squeezeCollider;
  c.roll = 0.3;
  f.frame();
  await flushAudio();
  assert.equal(f.audio.voices.size, 0);
  f.press();
  f.frame();
  await flushAudio();
  const voice = f.audio.voices.get("left:h0");
  assert.ok(voice);
  assert.equal(h.getLivePerformanceState().bend, 0);
  f.frame(100);
  c.roll = 0.31;
  c.hit = null;
  f.frame();
  assert.equal(h.getLivePerformanceState().bend, 0);
  assert.equal(
    f.audio.voices.size,
    0,
    "Leaving the target stops a sustained note below the bend threshold",
  );
  assert.equal(state.raySqueezeTarget, null);
  assert.equal(state.trigger, true);
  c.hit = h.squeezeCollider;
  f.frame();
  await flushAudio();
  assert.ok(f.audio.voices.has("left:h0"));
  assert.notEqual(f.audio.voices.get("left:h0"), voice, "Reentry starts a new attack");
  assert.equal(h.getLivePerformanceState().bend, 0, "Reentry resets the wrist reference");
  state.trigger = false;
  f.host.handleTriggerEndIntent(c);
  f.frame();
  assert.equal(f.audio.voices.size, 0);
  assert.equal(h.getLivePerformanceState().bend, 0);
  c.hit = null;
  f.frame();
  assert.equal(f.audio.voices.size, 0);
});

test("two Trigger holds have independent voices; retargeting releases only the departing owner", async () => {
  const f = fixture({ count: 3 });
  f.honks[1].x = 5;
  f.honks[2].x = 10;
  for (let i = 0; i < 4; i++) f.frame();
  f.press(f.honks[0].squeezeCollider, f.controllers[0]);
  f.press(f.honks[2].squeezeCollider, f.controllers[1]);
  f.frame();
  await flushAudio();
  assert.equal(f.audio.voices.size, 2);
  const right = f.audio.voices.get("right:h2");
  f.frame(100);
  f.controllers[0].hit = f.honks[1].squeezeCollider;
  f.frame();
  await flushAudio();
  assert.equal(f.audio.voices.has("left:h0"), false);
  assert.equal(f.audio.voices.get("right:h2"), right);
  assert.ok(f.audio.voices.has("left:h1"));
});

for (const locked of [false, true])
  test(`held Trigger can switch targets and return without another press (locked=${locked})`, async () => {
    const f = fixture({ count: 2, locked }),
      c = f.controllers[0];
    f.honks[1].x = 5;
    for (let i = 0; i < 4; i++) f.frame();
    f.press();
    f.frame();
    await flushAudio();
    assert.ok(f.audio.voices.has("left:h0"));
    c.hit = null;
    c.lockedHit = null;
    f.frame();
    assert.equal(f.audio.voices.size, 0, "An unbent hold stops as soon as the ray leaves");
    c.roll = 0.7;
    c.hit = f.honks[1].squeezeCollider;
    f.frame();
    await flushAudio();
    assert.equal(f.host.controllerStates.get(c).trigger, true, "No new press was needed");
    assert.equal(f.audio.voices.has("left:h0"), false);
    assert.ok(f.audio.voices.has("left:h1"));
    assert.equal(
      f.honks[1].getLivePerformanceState().bend,
      0,
      "New target starts with a neutral bend",
    );
    c.hit = f.honks[0].squeezeCollider;
    f.frame();
    await flushAudio();
    assert.ok(
      f.audio.voices.has("left:h0"),
      "Can return to the earlier Honk after playing another",
    );
    f.release();
    f.frame();
    assert.equal(f.audio.voices.size, 0);
  });

for (const reason of ["hidden-controller", "disconnected", "menu", "placement", "panel", "stick"])
  test(`${reason} stops Trigger-held play`, async () => {
    const f = fixture(),
      c = f.controllers[0],
      state = f.host.controllerStates.get(c);
    f.press();
    f.frame();
    await flushAudio();
    c.roll = 0.5;
    f.frame(100);
    assert.equal(state.raySqueezeTarget, f.honks[0].squeezeCollider);
    assert.equal(state.raySqueezeLatched, true);
    if (reason === "hidden-controller") c.visible = false;
    if (reason === "disconnected") c.userData.inputConnected = false;
    if (reason === "menu") state.radialMenuOpen = true;
    if (reason === "placement") f.host.spawn.pendingSpawnPlacement = {};
    if (reason === "panel")
      f.host.tutorial = { nearestPanelHit: () => ({}), blocksController: () => false };
    if (reason === "stick") state.stickActive = true;
    f.frame();
    assert.equal(f.audio.voices.size, 0);
    assert.equal(state.raySqueezeTarget, null, "Interruptions clear the played target");
    assert.equal(state.raySqueezeLatched, false);
  });

for (const locked of [false, true])
  for (const direction of [-1, 1])
    test(`bending captures the original Honk across other targets and neutral (locked=${locked}, direction=${direction})`, async () => {
      const f = fixture({ count: 2, locked }),
        c = f.controllers[0],
        h = f.honks[0],
        state = f.host.controllerStates.get(c);
      f.honks[1].x = 5;
      for (let i = 0; i < 4; i++) f.frame();
      f.press();
      f.frame();
      await flushAudio();
      const voice = f.audio.voices.get("left:h0");
      // A fast bend can cross the threshold and leave the target in one frame.
      c.roll = direction * 0.5;
      c.hit = f.honks[1].squeezeCollider;
      f.frame(0);
      await flushAudio();
      assert.equal(state.raySqueezeLatched, true);
      assert.equal(f.audio.voices.get("left:h0"), voice);
      assert.equal(f.audio.voices.has("left:h1"), false, "Other Honks cannot steal a bend-lock");
      for (const hit of [null, { userData: { isLooperCollider: true } }, h.squeezeCollider]) {
        c.hit = hit;
        for (const bend of [direction * 0.8, 0, direction * -0.4]) {
          c.roll = bend;
          f.frame();
          assert.equal(
            f.audio.voices.get("left:h0"),
            voice,
            "Bending and returning to neutral never retriggers",
          );
          assert.equal(h.getLivePerformanceState().bend, bend);
        }
      }
      assert.equal(f.counters.starts, 1);
      f.release();
      f.frame();
      assert.equal(f.audio.voices.size, 0);
      assert.equal(state.raySqueezeLatched, false);
      f.press();
      f.frame();
      await flushAudio();
      assert.equal(
        h.getLivePerformanceState().bend,
        0,
        "Every new press resets the wrist reference",
      );
      c.hit = null;
      f.frame();
      assert.equal(f.audio.voices.size, 0, "A fresh press does not inherit the previous bend-lock");
    });

test("small wrist jitter does not retain a straight hold, and rolling empty space cannot reacquire it", async () => {
  const f = fixture(),
    c = f.controllers[0];
  f.press();
  f.frame();
  await flushAudio();
  c.roll = 0.01;
  c.hit = null;
  f.frame();
  assert.equal(f.audio.voices.size, 0);
  c.roll = 0.7;
  f.frame();
  await flushAudio();
  assert.equal(f.audio.voices.size, 0, "A bend must start on an acquired Honk");
  c.hit = f.honks[0].squeezeCollider;
  f.frame();
  await flushAudio();
  assert.equal(f.audio.voices.size, 1);
  assert.equal(
    f.honks[0].getLivePerformanceState().bend,
    0,
    "Reacquisition uses a fresh wrist reference",
  );
  f.release();
});

test("each hand owns its bend-lock while another straight hold stops on leaving", async () => {
  const f = fixture(),
    [left, right] = f.controllers,
    h = f.honks[0];
  f.press(h.squeezeCollider, left);
  f.frame(100);
  await flushAudio();
  f.press(h.squeezeCollider, right);
  f.frame(0);
  await flushAudio();
  const voice = f.audio.voices.get("left:h0");
  left.roll = 0.5;
  right.hit = null;
  f.frame();
  assert.equal(f.audio.voices.get("left:h0"), voice);
  assert.equal(f.audio.voices.has("right:h0"), false);
  assert.equal(h.getLivePerformanceState().bend, 0.5);
  left.hit = null;
  f.frame();
  assert.equal(f.audio.voices.get("left:h0"), voice, "Only the bent hand remains locked");
  assert.equal(f.host.controllerStates.get(left).raySqueezeLatched, true);
  assert.equal(f.host.controllerStates.get(right).raySqueezeLatched, false);
  f.release(left);
  assert.equal(f.audio.voices.size, 0);
  f.release(right);
});
