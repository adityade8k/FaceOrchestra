import * as THREE from "three";
import { RADIAL_MENU_SETTINGS } from "../config/spawning.js";
import {
  choosePullAxisTowardViewer,
  getRadialLayerPresentation,
  lockPositionToOpeningPlane,
  projectControllerRelativePullDistance,
  RadialMenuPhase,
  relativeZRoll,
} from "../spawning/radialMenuNavigation.js";

const RADIAL_MENU_TOP_ANGLE = Math.PI / 2;
const RADIAL_MENU_BASE_OPACITY = 0.38;
const RADIAL_MENU_HIGHLIGHT_OPACITY = 0.88;

const tempControllerPosition = new THREE.Vector3();
const tempControllerQuaternion = new THREE.Quaternion();
const tempInverseControllerQuaternion = new THREE.Quaternion();
const tempMenuWorldPosition = new THREE.Vector3();
const tempLockedMenuWorldPosition = new THREE.Vector3();
const tempMenuWorldCorrection = new THREE.Vector3();
const tempViewerPosition = new THREE.Vector3();

export class RadialSpawnMenu {
  constructor({
    categories = [],
    settings = RADIAL_MENU_SETTINGS,
    getViewerWorldPosition = null,
  } = {}) {
    this.categories = categories;
    this.settings = settings;
    this.getViewerWorldPosition = getViewerWorldPosition;
  }

  create(categories = this.categories) {
    this.categories = categories;
    const group = new THREE.Group();
    group.name = "SpawnRadialMenu";
    group.position.set(0, 0, -this.settings.distance);
    group.visible = false;
    group.renderOrder = 1100;

    const parentRing = this.createRing(categories, "Parent", 1100);
    group.add(parentRing);
    group.userData.parentRing = parentRing;

    const childRings = new Map();
    for (const category of categories) {
      const childRing = this.createRing(category.entries, `Child_${category.id}`, 1120);
      childRing.visible = false;
      group.add(childRing);
      childRings.set(category.id, childRing);
    }
    group.userData.childRings = childRings;
    return group;
  }

  createRing(options, name, renderOrder) {
    const ring = new THREE.Group();
    ring.name = `SpawnRadialRing_${name}`;
    ring.renderOrder = renderOrder;
    ring.userData.segments = [];
    ring.userData.labels = [];

    const dial = new THREE.Group();
    dial.name = `SpawnRadialDial_${name}`;
    dial.renderOrder = renderOrder;
    ring.add(dial);
    ring.userData.dial = dial;

    const optionCount = Math.max(options.length, 1);
    const arc = (Math.PI * 2) / optionCount;
    const startOffset = RADIAL_MENU_TOP_ANGLE + arc * 0.5;
    options.forEach((option, index) => {
      const startAngle = startOffset - index * arc;
      const endAngle = startAngle - arc;
      const segment = new THREE.Mesh(
        this.createSegmentGeometry(startAngle, endAngle),
        new THREE.MeshBasicMaterial({
          color: option.color,
          transparent: true,
          opacity: RADIAL_MENU_BASE_OPACITY,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
        }),
      );
      segment.name = `SpawnRadialSegment_${option.id}`;
      segment.renderOrder = renderOrder;
      dial.add(segment);
      ring.userData.segments.push(segment);

      const label = this.createLabel(option.label, renderOrder + 10);
      const midAngle = (startAngle + endAngle) * 0.5;
      const labelRadius = this.settings.radius * 0.64;
      label.position.set(Math.cos(midAngle) * labelRadius, Math.sin(midAngle) * labelRadius, 0.006);
      dial.add(label);
      ring.userData.labels.push(label);
    });
    return ring;
  }

  createSegmentGeometry(startAngle, endAngle) {
    const shape = new THREE.Shape();
    shape.moveTo(
      Math.cos(startAngle) * this.settings.innerRadius,
      Math.sin(startAngle) * this.settings.innerRadius,
    );
    shape.lineTo(
      Math.cos(startAngle) * this.settings.radius,
      Math.sin(startAngle) * this.settings.radius,
    );
    shape.absarc(0, 0, this.settings.radius, startAngle, endAngle, true);
    shape.lineTo(
      Math.cos(endAngle) * this.settings.innerRadius,
      Math.sin(endAngle) * this.settings.innerRadius,
    );
    shape.absarc(0, 0, this.settings.innerRadius, endAngle, startAngle, false);
    shape.closePath();
    return new THREE.ShapeGeometry(shape, 36);
  }

  createLabel(labelText, renderOrder) {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#10100e";
    ctx.font = "700 32px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(labelText, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.042), material);
    label.name = `SpawnRadialLabel_${labelText}`;
    label.renderOrder = renderOrder;
    return label;
  }

  open(controller, state) {
    const menu = controller?.userData.radialMenu;
    if (!controller || !state || !menu) return;

    menu.position.set(0, 0, -this.settings.distance);
    controller.updateMatrixWorld(true);
    controller.getWorldPosition(state.radialMenuOpeningWorldPosition);
    controller.getWorldQuaternion(state.radialMenuOpeningWorldQuaternion);
    state.radialMenuParentStartQuaternion.copy(state.radialMenuOpeningWorldQuaternion);
    this.resolveViewerPosition(state.radialMenuOpeningWorldPosition, tempViewerPosition);
    state.radialMenuOpeningViewerWorldPosition.copy(tempViewerPosition);
    const pullFrame = choosePullAxisTowardViewer(
      state.radialMenuOpeningWorldPosition,
      state.radialMenuOpeningWorldQuaternion,
      tempViewerPosition,
    );
    state.radialMenuPullAxis.fromArray(pullFrame.axis);
    state.radialMenuPullAxisLocalZSign = pullFrame.localZSign;
    menu.updateMatrixWorld(true);
    menu.getWorldPosition(state.radialMenuOpeningMenuWorldPosition);
    state.radialMenuOpen = true;
    state.radialMenuCancelled = false;
    state.radialMenuPhase = RadialMenuPhase.parent;
    state.radialMenuParentSelectedIndex = 0;
    state.radialMenuChildSelectedIndex = 0;
    state.radialMenuLatchedParentIndex = null;
    state.radialMenuParentControllerRoll = 0;
    state.radialMenuChildControllerRoll = 0;
    state.radialMenuParentDialRotation = 0;
    state.radialMenuChildDialRotation = 0;
    state.radialMenuParentDialBaseRotation = 0;
    state.radialMenuChildDialBaseRotation = 0;
    state.radialMenuParentRingRotation = 0;
    state.radialMenuChildRingRotation = 0;
    state.radialMenuParentRingBaseRotation = 0;
    state.radialMenuChildRingBaseRotation = 0;
    state.radialMenuPullDistance = 0;
    menu.visible = true;
    this.resetRings(menu, state);
    this.updateVisuals(controller, state);
  }

  close(controller, state) {
    if (state) {
      state.radialMenuOpen = false;
      state.radialMenuCancelled = false;
      state.radialMenuPhase = RadialMenuPhase.parent;
      state.radialMenuLatchedParentIndex = null;
      state.radialMenuPullDistance = 0;
    }
    if (controller?.userData.radialMenu) controller.userData.radialMenu.visible = false;
  }

  cancel(controller, state) {
    if (!state?.radialMenuOpen) return;
    state.radialMenuCancelled = true;
    this.close(controller, state);
  }

  updatePullDistance(controller, state) {
    if (!controller || !state?.radialMenuOpen) return 0;
    controller.updateMatrixWorld(true);
    controller.getWorldPosition(tempControllerPosition);
    this.resolveViewerPosition(state.radialMenuOpeningViewerWorldPosition, tempViewerPosition);
    state.radialMenuPullDistance = projectControllerRelativePullDistance({
      openingControllerPosition: state.radialMenuOpeningWorldPosition,
      currentControllerPosition: tempControllerPosition,
      openingViewerPosition: state.radialMenuOpeningViewerWorldPosition,
      currentViewerPosition: tempViewerPosition,
      pullAxis: state.radialMenuPullAxis,
    });
    return state.radialMenuPullDistance;
  }

  updateParentSelection(controller, state) {
    const presentation = this.getLayerPresentation(controller, {
      startQuaternion: state.radialMenuParentStartQuaternion,
      optionCount: this.categories.length,
      dialBaseRotation: state.radialMenuParentDialBaseRotation,
      ringBaseRotation: state.radialMenuParentRingBaseRotation,
    });
    state.radialMenuParentControllerRoll = presentation.controllerRoll;
    state.radialMenuParentDialRotation = presentation.dialRotation;
    state.radialMenuParentRingRotation = presentation.ringRotation;
    state.radialMenuParentSelectedIndex = presentation.selectedIndex;
  }

  beginChildLayer(controller, state) {
    controller.updateMatrixWorld(true);
    controller.getWorldQuaternion(state.radialMenuChildStartQuaternion);
    state.radialMenuLatchedParentIndex = state.radialMenuParentSelectedIndex;
    state.radialMenuChildSelectedIndex = 0;
    state.radialMenuChildControllerRoll = 0;
    state.radialMenuChildDialRotation = 0;
    state.radialMenuChildDialBaseRotation = 0;
    state.radialMenuChildRingRotation = 0;
    state.radialMenuChildRingBaseRotation = 0;
  }

  updateChildSelection(controller, state) {
    const category = this.categories[state.radialMenuLatchedParentIndex];
    const presentation = this.getLayerPresentation(controller, {
      startQuaternion: state.radialMenuChildStartQuaternion,
      optionCount: category?.entries.length || 0,
      dialBaseRotation: state.radialMenuChildDialBaseRotation,
      ringBaseRotation: state.radialMenuChildRingBaseRotation,
    });
    state.radialMenuChildControllerRoll = presentation.controllerRoll;
    state.radialMenuChildDialRotation = presentation.dialRotation;
    state.radialMenuChildRingRotation = presentation.ringRotation;
    state.radialMenuChildSelectedIndex = presentation.selectedIndex;
  }

  returnToParentLayer(controller, state) {
    const parentRing = controller?.userData.radialMenu?.userData.parentRing;
    controller.updateMatrixWorld(true);
    controller.getWorldQuaternion(state.radialMenuParentStartQuaternion);
    state.radialMenuParentDialBaseRotation = state.radialMenuParentDialRotation;
    state.radialMenuParentRingBaseRotation = parentRing?.rotation.z ?? state.radialMenuParentRingRotation;
    state.radialMenuParentRingRotation = state.radialMenuParentRingBaseRotation;
    state.radialMenuParentControllerRoll = 0;
    state.radialMenuParentSelectedIndex = state.radialMenuLatchedParentIndex ?? 0;
    state.radialMenuLatchedParentIndex = null;
  }

  updateVisuals(controller, state) {
    const menu = controller?.userData.radialMenu;
    if (!menu || !state) return;
    this.lockMenuToOpeningPlane(controller, state, menu);
    const parentRing = menu.userData.parentRing;
    const childPhase = state.radialMenuPhase === RadialMenuPhase.child;
    parentRing.visible = !childPhase;
    parentRing.rotation.z = childPhase
      ? state.radialMenuParentRingRotation - state.radialMenuChildControllerRoll
      : state.radialMenuParentRingRotation;
    parentRing.userData.dial.rotation.z = state.radialMenuParentDialRotation;
    if (!childPhase) this.applyRingVisuals(parentRing, state.radialMenuParentSelectedIndex);

    for (const [categoryId, childRing] of menu.userData.childRings) {
      const category = this.categories[state.radialMenuLatchedParentIndex];
      const active = childPhase && category?.id === categoryId;
      childRing.visible = active;
      childRing.position.z = this.settings.layerSeparationM * state.radialMenuPullAxisLocalZSign;
      if (!active) continue;
      childRing.rotation.z = state.radialMenuChildRingRotation;
      childRing.userData.dial.rotation.z = state.radialMenuChildDialRotation;
      this.applyRingVisuals(childRing, state.radialMenuChildSelectedIndex);
    }
  }

  getSelectedIndex(_controller, state) {
    return state?.radialMenuPhase === RadialMenuPhase.child
      ? state.radialMenuChildSelectedIndex
      : state?.radialMenuParentSelectedIndex || 0;
  }

  getLayerPresentation(controller, options) {
    controller.updateMatrixWorld(true);
    controller.getWorldQuaternion(tempControllerQuaternion);
    const controllerRoll = relativeZRoll(options.startQuaternion, tempControllerQuaternion);
    return {
      controllerRoll,
      ...getRadialLayerPresentation({
        controllerRoll,
        optionCount: options.optionCount,
        dialBaseRotation: options.dialBaseRotation,
        ringBaseRotation: options.ringBaseRotation,
        settings: this.settings,
      }),
    };
  }

  applyRingVisuals(ring, selectedIndex) {
    for (const [index, segment] of ring.userData.segments.entries()) {
      const selected = index === selectedIndex;
      segment.material.opacity = selected ? RADIAL_MENU_HIGHLIGHT_OPACITY : RADIAL_MENU_BASE_OPACITY;
      segment.scale.setScalar(selected ? 1.08 : 1);
    }
    for (const label of ring.userData.labels) label.material.opacity = 1;
  }

  resetRings(menu, state) {
    const parentRing = menu.userData.parentRing;
    parentRing.rotation.z = 0;
    parentRing.userData.dial.rotation.z = 0;
    for (const childRing of menu.userData.childRings.values()) {
      childRing.visible = false;
      childRing.rotation.z = 0;
      childRing.userData.dial.rotation.z = 0;
      childRing.position.z = this.settings.layerSeparationM * state.radialMenuPullAxisLocalZSign;
    }
  }

  lockMenuToOpeningPlane(controller, state, menu) {
    menu.position.set(0, 0, -this.settings.distance);
    controller.updateMatrixWorld(true);
    menu.updateMatrixWorld(true);
    menu.getWorldPosition(tempMenuWorldPosition);
    tempLockedMenuWorldPosition.fromArray(lockPositionToOpeningPlane(
      state.radialMenuOpeningMenuWorldPosition,
      tempMenuWorldPosition,
      state.radialMenuPullAxis,
    ));
    tempMenuWorldCorrection.subVectors(tempLockedMenuWorldPosition, tempMenuWorldPosition);
    controller.getWorldQuaternion(tempInverseControllerQuaternion).invert();
    tempMenuWorldCorrection.applyQuaternion(tempInverseControllerQuaternion);
    menu.position.add(tempMenuWorldCorrection);
    controller.updateMatrixWorld(true);
  }

  resolveViewerPosition(openPosition, target) {
    target.copy(openPosition);
    const result = this.getViewerWorldPosition?.(target);
    return result || target;
  }
}
