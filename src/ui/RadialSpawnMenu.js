import * as THREE from "three";
import { SPAWN_COMPONENT_OPTIONS } from "../config/ui.js";

const RADIAL_MENU_RADIUS = 0.18;
const RADIAL_MENU_INNER_RADIUS = 0.035;
const RADIAL_MENU_DISTANCE = 0.22;
const RADIAL_MENU_ROLL_STEP = THREE.MathUtils.degToRad(32);
const RADIAL_MENU_ROLL_DEADZONE = THREE.MathUtils.degToRad(9);
const RADIAL_MENU_BASE_OPACITY = 0.38;
const RADIAL_MENU_HIGHLIGHT_OPACITY = 0.88;

const tempStartInverseQuaternion = new THREE.Quaternion();
const tempControllerQuaternion = new THREE.Quaternion();
const tempEuler = new THREE.Euler();

export class RadialSpawnMenu {
  create() {
    const group = new THREE.Group();
    group.name = "SpawnRadialMenu";
    group.position.set(0, 0, -RADIAL_MENU_DISTANCE);
    group.visible = false;
    group.renderOrder = 1100;
    group.userData.segments = [];

    const optionCount = Math.max(SPAWN_COMPONENT_OPTIONS.length, 1);
    const arc = (Math.PI * 2) / optionCount;
    const startOffset = Math.PI / 2;

    SPAWN_COMPONENT_OPTIONS.forEach((option, index) => {
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
      segment.renderOrder = 1100;
      group.add(segment);
      group.userData.segments.push(segment);

      const label = this.createLabel(option.label);
      const midAngle = (startAngle + endAngle) * 0.5;
      const labelRadius = RADIAL_MENU_RADIUS * 0.64;
      label.position.set(Math.cos(midAngle) * labelRadius, Math.sin(midAngle) * labelRadius, 0.006);
      group.add(label);
    });

    return group;
  }

  createSegmentGeometry(startAngle, endAngle) {
    const shape = new THREE.Shape();
    shape.moveTo(Math.cos(startAngle) * RADIAL_MENU_INNER_RADIUS, Math.sin(startAngle) * RADIAL_MENU_INNER_RADIUS);
    shape.lineTo(Math.cos(startAngle) * RADIAL_MENU_RADIUS, Math.sin(startAngle) * RADIAL_MENU_RADIUS);
    shape.absarc(0, 0, RADIAL_MENU_RADIUS, startAngle, endAngle, true);
    shape.lineTo(Math.cos(endAngle) * RADIAL_MENU_INNER_RADIUS, Math.sin(endAngle) * RADIAL_MENU_INNER_RADIUS);
    shape.absarc(0, 0, RADIAL_MENU_INNER_RADIUS, endAngle, startAngle, false);
    shape.closePath();
    return new THREE.ShapeGeometry(shape, 36);
  }

  createLabel(labelText) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#10100e";
    ctx.font = "700 34px Arial";
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
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.042), material);
    label.name = `SpawnRadialLabel_${labelText}`;
    label.renderOrder = 1110;
    return label;
  }

  open(controller, state) {
    if (!controller || !state) {
      return;
    }

    controller.updateMatrixWorld(true);
    controller.getWorldQuaternion(state.radialMenuStartQuaternion);
    state.radialMenuOpen = true;
    state.radialMenuCancelled = false;
    state.radialMenuSelectedIndex = 0;
    controller.userData.radialMenu.visible = true;
    this.updateVisuals(controller, state);
  }

  close(controller, state) {
    if (state) {
      state.radialMenuOpen = false;
      state.radialMenuCancelled = false;
    }
    if (controller?.userData.radialMenu) {
      controller.userData.radialMenu.visible = false;
    }
  }

  cancel(controller, state) {
    if (!state?.radialMenuOpen) {
      return;
    }

    state.radialMenuCancelled = true;
    this.close(controller, state);
  }

  update(controller, state) {
    if (!state?.radialMenuOpen) {
      return;
    }

    state.radialMenuSelectedIndex = this.getSelectedIndex(controller, state);
    this.updateVisuals(controller, state);
  }

  getSelectedIndex(controller, state) {
    const optionCount = SPAWN_COMPONENT_OPTIONS.length;
    if (optionCount <= 1) {
      return 0;
    }

    controller.updateMatrixWorld(true);
    controller.getWorldQuaternion(tempControllerQuaternion);
    tempStartInverseQuaternion.copy(state.radialMenuStartQuaternion).invert();
    tempControllerQuaternion.premultiply(tempStartInverseQuaternion);
    tempEuler.setFromQuaternion(tempControllerQuaternion, "XYZ");

    const roll = tempEuler.z;
    if (Math.abs(roll) < RADIAL_MENU_ROLL_DEADZONE) {
      return 0;
    }

    if (roll > 0) {
      return 0;
    }

    return THREE.MathUtils.clamp(Math.ceil(Math.abs(roll) / RADIAL_MENU_ROLL_STEP), 1, optionCount - 1);
  }

  updateVisuals(controller, state) {
    const menu = controller?.userData.radialMenu;
    if (!menu || !state) {
      return;
    }

    for (const [index, segment] of menu.userData.segments.entries()) {
      const selected = index === state.radialMenuSelectedIndex;
      segment.material.opacity = selected ? RADIAL_MENU_HIGHLIGHT_OPACITY : RADIAL_MENU_BASE_OPACITY;
      segment.scale.setScalar(selected ? 1.08 : 1);
    }
  }
}
