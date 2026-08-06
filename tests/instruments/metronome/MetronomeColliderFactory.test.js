import test from "node:test";
import assert from "node:assert/strict";

import {
  METRONOME_CONNECTION_PORTS,
  METRONOME_CONNECTION_ROLE,
} from "../../../src/config/metronome.js";
import { MetronomeInstrument } from "../../../src/instruments/metronome/MetronomeInstrument.js";

test("every Metronome has exactly four stable procedural connection ports", () => {
  assert.equal(METRONOME_CONNECTION_PORTS.length, 4);
  const targets = Object.fromEntries(METRONOME_CONNECTION_PORTS.map((config) => {
    const target = {
      visible: true,
      userData: {
        isHitTarget: true,
        isBodyGripTarget: false,
        isMetronomeTarget: true,
        isMetronomeConnectionPort: true,
        metronomePortId: config.portId,
        interactionRole: METRONOME_CONNECTION_ROLE,
        wireSocketOutward: { ...config.socketDirection },
        baseHitOpacity: 0,
        hitColor: config.colliderColor,
      },
    };
    return [`connectionPort:${config.portId}`, target];
  }));
  const ports = Object.values(targets);

  assert.equal(ports.length, 4);
  assert.deepEqual(
    ports.map(({ userData }) => userData.metronomePortId),
    METRONOME_CONNECTION_PORTS.map(({ portId }) => portId),
  );
  for (const port of ports) {
    assert.equal(port.userData.interactionRole, METRONOME_CONNECTION_ROLE);
    assert.deepEqual(Object.keys(port.userData).sort(), [
      "baseHitOpacity",
      "hitColor",
      "interactionRole",
      "isBodyGripTarget",
      "isHitTarget",
      "isMetronomeConnectionPort",
      "isMetronomeTarget",
      "metronomePortId",
      "wireSocketOutward",
    ]);
  }

  const metronome = new MetronomeInstrument({
    id: "metro-ports",
    root: { visible: true, userData: {} },
    targets,
  });
  for (const { portId } of METRONOME_CONNECTION_PORTS) {
    assert.equal(metronome.hasConnectionPort(portId), true);
  }
  assert.equal(metronome.hasConnectionPort("port-4"), false);
});
