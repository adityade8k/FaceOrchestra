import * as THREE from "three";
import {
  INSTRUMENT_SCALE_STEP,
} from "../config/honk.js";

const tempMatrix = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3();

export class GripTransformSystem {
  constructor({
    controllers,
    controllerStates,
    getPointedInstrumentState,
    adjustInstrumentBaseScale,
  }) {
    this.controllers = controllers;
    this.controllerStates = controllerStates;
    this.getPointedInstrumentState = getPointedInstrumentState;
    this.adjustInstrumentBaseScale = adjustInstrumentBaseScale;
  }

  begin(controller, hit) {
    const controllerState = this.controllerStates.get(controller);
    const instrumentState = hit?.object?.userData.instrumentState;
    if (!instrumentState?.root || !instrumentState.root.visible) {
      return;
    }

    controllerState.gripHeld = true;
    controllerState.gripInstrumentState = instrumentState;
    controller.updateMatrixWorld(true);
    instrumentState.root.updateMatrixWorld(true);
    controllerState.gripOffsetMatrix.copy(controller.matrixWorld).invert().multiply(instrumentState.root.matrixWorld);
  }

  release(controller) {
    const controllerState = this.controllerStates.get(controller);
    if (!controllerState) {
      return;
    }

    controllerState.gripHeld = false;
    controllerState.gripInstrumentState = null;
    controllerState.thumbstickScaleDirection = 0;
  }

  handleScaleThumbstick(controller, direction) {
    const controllerState = this.controllerStates.get(controller);
    if (!controllerState?.gripHeld || !controllerState.gripInstrumentState?.root?.visible) {
      if (controllerState) {
        controllerState.thumbstickScaleDirection = 0;
      }
      return;
    }

    if (direction === 0) {
      controllerState.thumbstickScaleDirection = 0;
      return;
    }

    const pointedState = this.getPointedInstrumentState(controller);
    if (pointedState !== controllerState.gripInstrumentState) {
      return;
    }

    if (direction === controllerState.thumbstickScaleDirection) {
      return;
    }

    controllerState.thumbstickScaleDirection = direction;
    this.adjustInstrumentBaseScale(pointedState, direction * INSTRUMENT_SCALE_STEP);
  }

  update() {
    for (const controller of this.controllers) {
      const controllerState = this.controllerStates.get(controller);
      if (!controllerState?.gripHeld || !controllerState.gripInstrumentState?.root) {
        continue;
      }

      controller.updateMatrixWorld(true);
      tempMatrix.multiplyMatrices(controller.matrixWorld, controllerState.gripOffsetMatrix);
      tempMatrix.decompose(tempPosition, tempQuaternion, tempScale);
      controllerState.gripInstrumentState.root.position.copy(tempPosition);
      controllerState.gripInstrumentState.root.quaternion.copy(tempQuaternion);
    }
  }
}
