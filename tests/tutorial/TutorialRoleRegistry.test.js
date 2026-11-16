import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TutorialAdapter } from "../../src/tutorial/TutorialAdapter.js";
import { TutorialRoleRegistry } from "../../src/tutorial/TutorialRoleRegistry.js";
import { committedRoleBindings } from "../../src/tutorial/TutorialRoleBindings.js";
import { PITCHES } from "../../src/compositions/songs/jog/definition.js";

test("adapter previews bind simulation roles but practice waits for committed placement", (t) => {
  const instruments = new Map();
  const runtime = {
    scene: new THREE.Group(),
    instrumentRegistry: { get: (id) => instruments.get(id) },
    tutorial: { session: { mode: "simulation" } },
    setInstrumentBaseScale() {},
  };
  const adapter = new TutorialAdapter(runtime, () => {});
  t.after(() => {
    adapter.focusRing.geometry.dispose();
    adapter.focusRing.material.dispose();
  });
  const notes = Object.keys(PITCHES).map((id) => ({ id, kind: "honk", pendingPlacement: true }));
  for (const h of notes) instruments.set(h.id, h);
  const preview = { instruments: notes };
  adapter.bindPreview(
    preview,
    { id: "jog-melody" },
    { userData: { tutorialOrigin: "simulation" } },
  );
  assert.equal(adapter.get("melody-E4"), instruments.get("E4"));
  assert.equal(adapter.roleForId("E4"), "melody-E4");
  assert.equal(adapter.bindings.get("melody-E4").source, "simulation");
  assert.equal(adapter.members("melody").length, 7);
  assert.equal(adapter.snapshotAt, -Infinity);

  adapter.roleRegistry.clear();
  runtime.tutorial.session = { mode: "practice" };
  adapter.snapshotAt = 123;
  adapter.bindPreview(preview, { id: "jog-melody" });
  assert.equal(adapter.roles.size, 0);
  assert.deepEqual(adapter.bindCommitted("jog-melody", notes), []);
  for (const h of notes) h.pendingPlacement = false;
  adapter.addLabel = () => {};
  adapter.placed(notes, preview);
  assert.equal(preview.tutorialEntry, undefined);
  assert.equal(adapter.get("melody-E4"), instruments.get("E4"));
  assert.equal(adapter.bindings.get("melody-E4").source, "learner");
  assert.equal(adapter.snapshotAt, -Infinity);
});

test("deferred ordinary Honks bind only in the current percussion practice step", () => {
  const instruments = new Map([
    ["disposed", { id: "disposed", disposed: true }],
    ["pending", { id: "pending", pendingPlacement: true }],
    ["ready", { id: "ready" }],
  ]);
  let session = { mode: "practice", step: { role: "melody" } };
  const registry = new TutorialRoleRegistry({
    getInstrument: (id) => instruments.get(id),
    getSession: () => session,
    resolveCommitted: committedRoleBindings,
  });
  registry.rememberOrdinaryHonks([{ id: "deleted" }, ...instruments.values()]);
  registry.bindOrdinaryPercussion();
  assert.equal(registry.get("percussion"), undefined);
  session = { mode: "simulation", step: { role: "percussion" } };
  registry.bindOrdinaryPercussion();
  assert.equal(registry.get("percussion"), undefined);
  session = { mode: "practice", step: { role: "percussion" } };
  registry.bindOrdinaryPercussion();
  assert.equal(registry.get("percussion"), instruments.get("ready"));
  assert.deepEqual([...registry.ordinaryHonks], ["pending", "ready"]);
  instruments.delete("ready");
  instruments.get("pending").pendingPlacement = false;
  registry.bindOrdinaryPercussion();
  assert.equal(registry.get("percussion"), instruments.get("pending"));
});

test("role queries read live scene state and clearing retains the shared map identities", () => {
  const instruments = new Map([["one", { id: "one" }]]);
  let changes = 0;
  const registry = new TutorialRoleRegistry({
    getInstrument: (id) => instruments.get(id),
    getSession: () => undefined,
    resolveCommitted: committedRoleBindings,
    onChange: () => changes++,
  });
  const { roles, bindings } = registry;
  registry.assign("metronome", ["one"], { source: "simulation", entryId: "metronome" });
  assert.equal(registry.get("metronome"), instruments.get("one"));
  instruments.delete("one");
  assert.equal(registry.get("metronome"), undefined);
  assert.deepEqual(registry.members("metronome"), []);
  registry.remove("metronome");
  assert.equal(bindings.size, 0);
  registry.rememberOrdinaryHonks([{ id: "one" }]);
  registry.clear();
  registry.clear();
  assert.equal(registry.roles, roles);
  assert.equal(registry.bindings, bindings);
  assert.equal(registry.ordinaryHonks.size, 0);
  assert.equal(changes, 4);
  roles.set("next-song-role", ["one"]);
  instruments.set("one", { id: "one", restored: true });
  assert.equal(registry.get("next-song-role").restored, true);
});
