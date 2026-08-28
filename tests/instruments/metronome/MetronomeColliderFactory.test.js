import test from "node:test";
import assert from "node:assert/strict";

import {
  METRONOME_CONNECTION_PORTS,
  METRONOME_CONNECTION_ROLE,
  METRONOME_SETTINGS,
} from "../../../src/config/metronome.js";
import { MetronomeInstrument } from "../../../src/instruments/metronome/MetronomeInstrument.js";
import { createMetronomeConnectionPortMaterial } from "../../../src/instruments/metronome/metronomeConnectionPortPresentation.js";

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
        baseHitOpacity: METRONOME_SETTINGS.connectionPortOpacity,
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

test("connection-port materials are colored visible wireframes in debug mode", () => {
  const THREE = createThreeStub();
  const materials = METRONOME_CONNECTION_PORTS.map(({ colliderColor }) =>
    createMetronomeConnectionPortMaterial({
      THREE,
      color: colliderColor,
      showDebug: true,
    }));

  assert.equal(materials.length, 4);
  for (const [index, material] of materials.entries()) {
    assert.equal(material.opacity, METRONOME_SETTINGS.connectionPortOpacity);
    assert.equal(material.color, METRONOME_CONNECTION_PORTS[index].colliderColor);
    assert.equal(material.wireframe, true);
    assert.equal(material.depthTest, false);
    assert.equal(material.userData.disposeWithOwner, true);
  }
});

test("connection-port materials are fully transparent outside debug mode", () => {
  const THREE = createThreeStub();
  const materials = METRONOME_CONNECTION_PORTS.map(({ colliderColor }) =>
    createMetronomeConnectionPortMaterial({
      THREE,
      color: colliderColor,
      showDebug: false,
    }));

  assert.equal(materials.length, 4);
  for (const material of materials) {
    assert.equal(material.opacity, 0);
    assert.equal(material.wireframe, false);
    assert.equal(material.depthTest, true);
    assert.equal(material.userData.disposeWithOwner, true);
  }
});

test("production connection ports remain registered raycast targets without becoming visible", () => {
  const THREE = createThreeStub();
  const targets = Object.fromEntries(METRONOME_CONNECTION_PORTS.map((config) => {
    const material = createMetronomeConnectionPortMaterial({
      THREE,
      color: config.colliderColor,
      showDebug: false,
    });
    return [`connectionPort:${config.portId}`, {
      visible: true,
      material,
      userData: {
        isHitTarget: true,
        isMetronomeConnectionPort: true,
        metronomePortId: config.portId,
        baseHitOpacity: 0,
      },
    }];
  }));
  const metronome = new MetronomeInstrument({
    id: "production-metro-ports",
    root: { visible: true, userData: {} },
    targets,
  });

  assert.equal(Object.keys(targets).length, 4);
  for (const { portId } of METRONOME_CONNECTION_PORTS) {
    const target = targets[`connectionPort:${portId}`];
    assert.equal(metronome.hasConnectionPort(portId), true);
    assert.equal(target.userData.isHitTarget, true);
    assert.equal(target.userData.isMetronomeConnectionPort, true);
    assert.equal(target.userData.metronomePortId, portId);
    assert.equal(target.userData.baseHitOpacity, 0);
    assert.equal(target.material.opacity, 0);
    assert.equal(target.visible, true, "the transparent mesh must stay in the raycast graph");
  }
});

function createThreeStub() {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.set(x, y, z);
    }

    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
  }

  class MeshBasicMaterial {
    constructor(options) {
      Object.assign(this, options);
      this.userData = {};
    }
  }

  return { MeshBasicMaterial, Vector3 };
}
