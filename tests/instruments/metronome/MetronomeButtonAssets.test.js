import test from "node:test";
import assert from "node:assert/strict";

import { METRONOME_EYE_CONTROLS } from "../../../src/config/metronome.js";
import { attachMetronomeButtonAssets } from "../../../src/instruments/metronome/metronomeButtonAssets.js";

test("missing Metronome button meshes are restored from the primary-branch asset", () => {
  const root = object3D("root");
  const source = object3D("source");
  for (const { nodeName } of METRONOME_EYE_CONTROLS) source.add(object3D(nodeName));

  assert.equal(attachMetronomeButtonAssets(root, source), 2);
  for (const { nodeName } of METRONOME_EYE_CONTROLS) {
    const attached = root.getObjectByName(nodeName);
    assert.ok(attached);
    assert.notEqual(attached, source.getObjectByName(nodeName));
  }
  assert.equal(attachMetronomeButtonAssets(root, source), 0);
  assert.equal(root.children.length, 2);
});

function object3D(name) {
  return {
    name,
    children: [],
    add(child) { this.children.push(child); child.parent = this; },
    clone() { return object3D(this.name); },
    getObjectByName(targetName) {
      if (this.name === targetName) return this;
      for (const child of this.children) {
        const match = child.getObjectByName(targetName);
        if (match) return match;
      }
      return null;
    },
  };
}
