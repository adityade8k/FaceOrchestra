import * as THREE from "three";
import {
  clearControllerGripTarget,
  setControllerGripTarget,
} from "./controllerGripState.js";

const tempMatrix = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3();

export class GripTransformSystem {
  constructor({ controllers, controllerStates, resolveOwner, getPointedTarget, transformTargetResolver }) {
    this.controllers = controllers;
    this.controllerStates = controllerStates;
    this.resolveOwner = resolveOwner;
    this.getPointedTarget = getPointedTarget;
    this.transformTargetResolver = transformTargetResolver;
  }

  begin(controller, hit) {
    const controllerState = this.controllerStates.get(controller);
    const source = this.resolveOwner(hit?.object);
    const target = this.transformTargetResolver.resolve(source);
    if (!controllerState || !target?.root?.visible || target.canTransform === false) return null;

    setControllerGripTarget(controllerState, target, source);
    controller.updateMatrixWorld(true);
    target.root.updateMatrixWorld(true);
    controllerState.gripOffsetMatrix.copy(controller.matrixWorld).invert().multiply(target.root.matrixWorld);
    return target;
  }

  release(controller) {
    const state = this.controllerStates.get(controller);
    if (!state) return null;
    const target = state.gripInstrumentState;
    clearControllerGripTarget(state);
    state.thumbstickScaleDirection = 0;
    return target;
  }

  handleScaleStep(controller, direction) {
    const state = this.controllerStates.get(controller);
    const target = state?.gripInstrumentState;
    if (!state?.gripHeld || !target?.root?.visible) {
      if (state) state.thumbstickScaleDirection = 0;
      return;
    }
    if (direction === 0) {
      state.thumbstickScaleDirection = 0;
      return;
    }
    const pointedTarget = this.transformTargetResolver.resolve(this.getPointedTarget(controller));
    if (pointedTarget?.id !== target.id || direction === state.thumbstickScaleDirection) return;
    state.thumbstickScaleDirection = direction;
    const step = target.profile?.scaleStep ?? target.transformProfile?.scaleStep ?? 0.25;
    target.setScale?.(target.getScale() + direction * step);
  }

  update() {
    for (const controller of this.controllers) {
      const state = this.controllerStates.get(controller);
      const target = state?.gripInstrumentState;
      if (!state?.gripHeld || !target?.root) continue;
      controller.updateMatrixWorld(true);
      tempMatrix.multiplyMatrices(controller.matrixWorld, state.gripOffsetMatrix);
      tempMatrix.decompose(tempPosition, tempQuaternion, tempScale);
      target.root.position.copy(tempPosition);
      target.root.quaternion.copy(tempQuaternion);
      target.onTransformChanged?.();
    }
  }

  reset() {
    for (const controller of this.controllers) this.release(controller);
  }
}
