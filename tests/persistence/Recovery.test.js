import test from "node:test";
import assert from "node:assert/strict";
import { PersistenceStore } from "../../src/persistence/PersistenceStore.js";
import { ScenePersistence } from "../../src/persistence/ScenePersistence.js";
const scene = { schemaVersion: 3, instruments: [] };
const memory = () => {
  const values = new Map();
  return {
    values,
    getItem: (k) => values.get(k) || null,
    setItem: (k, v) => values.set(k, v),
  };
};

test("throwing reads and unavailable storage are recoverable startup states", () => {
  const store = new PersistenceStore({
    storage: {
      getItem() {
        throw new Error("denied");
      },
    },
  });
  assert.equal(store.load(), null);
  assert.equal(store.status.state, "unavailable");
});
test("a corrupt or future scene preserves the source and loads the last valid copy", () => {
  for (const invalid of ["{broken", '{"schemaVersion":999}']) {
    const storage = memory(),
      store = new PersistenceStore({ storage });
    storage.setItem(store.key, invalid);
    storage.setItem(`${store.key}:recovery`, JSON.stringify(scene));
    assert.deepEqual(store.load(), scene);
    assert.equal(store.save(scene), false);
    assert.equal(storage.getItem(store.key), invalid);
  }
});
test("verified writes retain the previous valid scene and quota failure leaves it intact", () => {
  const storage = memory(),
    store = new PersistenceStore({ storage });
  assert.equal(store.save(scene), true);
  assert.equal(store.save({ ...scene, instruments: [{ id: "new" }] }), true);
  assert.deepEqual(JSON.parse(storage.getItem(`${store.key}:recovery`)), scene);
  storage.setItem = () => {
    throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
  };
  assert.equal(store.save(scene), false);
  assert.equal(store.status.state, "quota");
});
test("queued checkpoints serialize outside markDirty and cannot save a lesson scene", async () => {
  let writes = 0,
    mode = "play";
  const persistence = new ScenePersistence({
    store: {
      save: async () => {
        writes++;
        return true;
      },
    },
    serializer: { serialize: () => scene },
  });
  persistence.canCheckpoint = () => mode === "play";
  persistence.markDirty();
  assert.equal(writes, 0);
  await persistence.checkpoint();
  assert.equal(writes, 1);
  persistence.markDirty();
  mode = "practice";
  await persistence.checkpoint();
  assert.equal(writes, 1);
  persistence.dispose();
});
