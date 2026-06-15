import * as THREE from "three";
import { DEBUG_SHOW_BOUNDING_BOXES } from "../config.js";

export class DebugVisuals {
  constructor(root, hitTargets) {
    this.root = root;
    this.hitTargets = hitTargets;
    this.helpers = [];

    if (DEBUG_SHOW_BOUNDING_BOXES) {
      this.create();
    }
  }

  create() {
    this.instrumentBox = new THREE.BoxHelper(this.root, 0xffd36a);
    this.instrumentBox.name = "DEBUG_instrument_bounds";
    this.root.add(this.instrumentBox);
    this.helpers.push(this.instrumentBox);

    for (const target of Object.values(this.hitTargets)) {
      const helper = new THREE.BoxHelper(target, 0x60d8ff);
      helper.name = `DEBUG_bounds_${target.name}`;
      this.root.add(helper);
      this.helpers.push(helper);
    }
  }

  update() {
    if (!DEBUG_SHOW_BOUNDING_BOXES) {
      return;
    }

    for (const helper of this.helpers) {
      helper.update();
      helper.visible = true;
    }
  }
}
