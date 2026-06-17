import * as THREE from "three";
import { DEBUG_SHOW_BOUNDING_BOXES } from "../config.js";
import { setChordBounds } from "../instrument/ChordBounds.js";

export class DebugVisuals {
  constructor(root) {
    this.root = root;
    this.helpers = [];

    if (DEBUG_SHOW_BOUNDING_BOXES) {
      this.create();
    }
  }

  create() {
    this.chordBounds = new THREE.Box3();
    this.instrumentBox = new THREE.Box3Helper(this.chordBounds, 0xffd36a);
    this.instrumentBox.name = "DEBUG_chord_bounds";
    this.root.parent?.add(this.instrumentBox);
    this.helpers.push(this.instrumentBox);
  }

  update() {
    if (!DEBUG_SHOW_BOUNDING_BOXES) {
      return;
    }

    setChordBounds(this.root, this.chordBounds);

    for (const helper of this.helpers) {
      helper.visible = !this.chordBounds.isEmpty();
    }
  }

  dispose() {
    for (const helper of this.helpers) {
      helper.removeFromParent();
      helper.geometry?.dispose?.();
      helper.material?.dispose?.();
    }
    this.helpers.length = 0;
  }
}
