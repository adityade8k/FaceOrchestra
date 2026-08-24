import * as THREE from "three";
import { stepSpawnPreviewDistance } from "./spawnPreviewControls.js";

export class SpawnPreview {
  constructor({ controller, instruments = [], catalogEntry = null, distance = 1.5, spacing = 0.32 } = {}) {
    this.controller = controller;
    this.instruments = instruments;
    this.group = new THREE.Group();
    this.group.name = "PendingSpawnPlacement";
    this.group.userData.isPendingSpawnPlacement = true;
    this.group.position.set(0, 0, -distance);
    this.distance = distance;
    this.distanceDirection = 0;
    this.scaleDirection = 0;
    this.thumbstickScaleDirection = 0;
    controller?.add(this.group);

    const hasRecipeLayout = instruments.length > 1 && catalogEntry?.action === "formation";
    const firstOffset = -((instruments.length - 1) * spacing) * 0.5;
    instruments.forEach((instrument, index) => {
      this.group.add(instrument.root);
      if (!hasRecipeLayout) {
        instrument.root.position.set(firstOffset + index * spacing, 0, 0);
        instrument.root.rotation.set(0, 0, 0);
      }
      instrument.pendingPlacement = true;
      instrument.root.userData.pendingPlacement = true;
    });
  }

  setScaleDirection(direction, applyStep) {
    if (direction === 0) {
      this.scaleDirection = 0;
      this.thumbstickScaleDirection = 0;
      return;
    }
    if (direction === this.scaleDirection) return;
    this.scaleDirection = direction;
    this.thumbstickScaleDirection = direction;
    for (const instrument of this.instruments) applyStep(instrument, direction);
  }

  setDistanceDirection(direction) {
    if (direction === 0) {
      this.distanceDirection = 0;
      return;
    }
    if (direction === this.distanceDirection) return;
    this.distanceDirection = direction;
    this.distance = stepSpawnPreviewDistance(this.distance, direction);
    this.group.position.z = -this.distance;
  }

  place(scene) {
    scene.updateMatrixWorld(true);
    this.group.updateMatrixWorld(true);
    for (const instrument of this.instruments) {
      instrument.root.updateMatrixWorld(true);
      scene.attach(instrument.root);
      instrument.pendingPlacement = false;
      instrument.root.userData.pendingPlacement = false;
    }
    this.group.removeFromParent();
    return [...this.instruments];
  }

  cancel(removeInstrument) {
    for (const instrument of this.instruments) removeInstrument(instrument.id);
    this.group.removeFromParent();
  }
}
