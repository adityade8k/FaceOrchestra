import assert from "node:assert/strict";
import test from "node:test";

import { routeStickStrikeToLooperRecordings } from "../../../src/instruments/stick/StickLooperRecordingRouter.js";

test("a Metronome strike records its wooden hit in every connected Looper track", () => {
  const calls = [];
  const loopers = [
    createLooper("looper-a", calls),
    createLooper("looper-b", calls),
  ];
  const connections = [
    { targetKind: "looper", targetId: "looper-a", targetPortId: "track-2" },
    { targetKind: "honk", targetId: "honk-a", targetPortId: "honk.looper-connector" },
    { targetKind: "looper", targetId: "looper-b", targetPortId: "track-6" },
  ];

  const recordedCount = routeStickStrikeToLooperRecordings({
    event: { percussionType: "metronomeWood", timestamp: 1420 },
    target: { id: "metronome-a", kind: "metronome" },
    loopers,
    metronomeConnectionManager: {
      getConnectionsForMetronome: (id) => id === "metronome-a" ? connections : [],
    },
    resolveInstrument: (id) => loopers.find((looper) => looper.id === id),
  });

  assert.equal(recordedCount, 2);
  assert.deepEqual(calls, [
    ["looper-a", "track-2", "metronomeWood", 1420],
    ["looper-b", "track-6", "metronomeWood", 1420],
  ]);
});

test("direct Looper and connected Honk strikes preserve their existing recording routes", () => {
  const calls = [];
  const looper = createLooper("looper-a", calls);
  looper.tracks = [{ trackId: "track-1", connectedHonkId: "honk-a" }];
  looper.recordSelfDrumHit = (type, timestamp) => {
    calls.push([looper.id, "self", type, timestamp]);
    return true;
  };

  routeStickStrikeToLooperRecordings({
    event: { percussionType: "hihat", timestamp: 100 },
    target: looper,
    loopers: [looper],
  });
  routeStickStrikeToLooperRecordings({
    event: { percussionType: "boink", timestamp: 200 },
    target: { id: "honk-a", kind: "honk" },
    loopers: [looper],
  });

  assert.deepEqual(calls, [
    ["looper-a", "self", "hihat", 100],
    ["looper-a", "track-1", "boink", 200],
  ]);
});

function createLooper(id, calls) {
  return {
    id,
    kind: "looper",
    tracks: [],
    recordTrackDrumHit(trackId, type, timestamp) {
      calls.push([id, trackId, type, timestamp]);
      return true;
    },
  };
}
