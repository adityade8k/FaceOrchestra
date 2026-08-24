import assert from "node:assert/strict";
import test from "node:test";

import { SPAWN_PREVIEW_DISTANCE_SETTINGS } from "../../src/config/spawning.js";
import { stepSpawnPreviewDistance } from "../../src/spawning/spawnPreviewControls.js";
import { SpawnPlacementController } from "../../src/spawning/SpawnPlacementController.js";

test("preview distance steps farther and closer and clamps to its configured range", () => {
  const settings = SPAWN_PREVIEW_DISTANCE_SETTINGS;
  assert.equal(stepSpawnPreviewDistance(1.5, 1), 1.5 + settings.step);
  assert.equal(stepSpawnPreviewDistance(1.5, -1), 1.5 - settings.step);
  assert.equal(stepSpawnPreviewDistance(settings.max, 1), settings.max);
  assert.equal(stepSpawnPreviewDistance(settings.min, -1), settings.min);
});

test("placement controller routes distance steps only to the owning preview controller", () => {
  const owner = {};
  const other = {};
  const directions = [];
  const placement = new SpawnPlacementController({
    scene: {},
    createEntry: () => [],
    previewFactory: () => null,
  });
  placement.preview = {
    controller: owner,
    setDistanceDirection: (direction) => directions.push(direction),
  };

  placement.distance(other, 1);
  placement.distance(owner, 1);
  placement.distance(owner, 0);
  placement.distance(owner, -1);
  assert.deepEqual(directions, [1, 0, -1]);
});
