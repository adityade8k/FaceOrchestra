import * as THREE from "three";
import {
  COLLIDER_DEBUG_VISUAL_SETTINGS,
  DEBUG_SHOW_COLLIDERS,
} from "../../config/debug.js";
import {
  LOOPER_BUTTON_COLLIDERS,
  LOOPER_BUTTON_ACTIONS,
  LOOPER_COLLIDER_OPACITY,
  LOOPER_COLLIDER_GEOMETRY,
  LOOPER_COLLIDER_TRANSFORM_DEFAULTS,
  LOOPER_CONTROL_COLLIDERS,
  LOOPER_CONTROL_DEFAULT_VALUES,
  LOOPER_CONTROL_MOTION_DEFAULTS,
  LOOPER_DEBUG_COLORS,
  LOOPER_NODE_COLLIDER_LAYOUT,
  LOOPER_TRACK_COUNT,
} from "../../config/looper.js";
import {
  getLooperButtonName,
  getLooperControlName,
  getLooperNodeName,
} from "./looperNames.js";
import { getLooperControlColliderPosition } from "./view/looperControlPresentation.js";

const tempBox = new THREE.Box3();
const tempBoxCenter = new THREE.Vector3();
const tempBoxSize = new THREE.Vector3();
const tempArcPoints = [];

export class LooperColliderFactory {
  constructor({ makeHitTargetMaterial } = {}) {
    this.makeHitTargetMaterial = makeHitTargetMaterial;
  }

  create(root, hitTargets = {}) {
    tempBox.setFromObject(root);
    tempBox.getCenter(tempBoxCenter);
    tempBox.getSize(tempBoxSize);

    const maxSize = Math.max(
      tempBoxSize.x,
      tempBoxSize.y,
      tempBoxSize.z,
      LOOPER_COLLIDER_GEOMETRY.minModelSize,
    );
    const nodeLayout = LOOPER_NODE_COLLIDER_LAYOUT;
    const buttonScale = LOOPER_COLLIDER_GEOMETRY.buttonScale;
    const buttonGeometry = new THREE.BoxGeometry(
      maxSize * buttonScale.x,
      maxSize * buttonScale.y,
      maxSize * buttonScale.z,
    );
    const nodeGeometry = new THREE.SphereGeometry(
      maxSize * getNumber(nodeLayout.sphereScale, LOOPER_NODE_COLLIDER_LAYOUT.sphereScale),
      getNumber(nodeLayout.sphereSegments, LOOPER_NODE_COLLIDER_LAYOUT.sphereSegments),
      getNumber(nodeLayout.sphereRings, LOOPER_NODE_COLLIDER_LAYOUT.sphereRings),
    );
    const controlGeometry = new THREE.SphereGeometry(
      maxSize * LOOPER_COLLIDER_GEOMETRY.controlSphereScale,
      LOOPER_COLLIDER_GEOMETRY.controlSphereSegments,
      LOOPER_COLLIDER_GEOMETRY.controlSphereRings,
    );
    const looperColliderOpacity = getDebugHitOpacity(LOOPER_COLLIDER_OPACITY);

    const addCollider = (mesh, name, color, userData = {}) => {
      mesh.name = name;
      mesh.userData.isHitTarget = true;
      mesh.userData.isLooperCollider = true;
      mesh.userData.baseHitOpacity = looperColliderOpacity;
      mesh.userData.hitColor = color;
      mesh.userData.currentHitColor = color;
      Object.assign(mesh.userData, userData);
      markOwnedResource(mesh.geometry);
      for (const material of toMaterialArray(mesh.material)) {
        markOwnedResource(material);
        material.opacity = looperColliderOpacity;
      }
      mesh.renderOrder = LOOPER_COLLIDER_GEOMETRY.renderOrder;
      root.add(mesh);
      hitTargets[name] = mesh;
    };

    for (const action of LOOPER_BUTTON_ACTIONS) {
      const buttonConfig = LOOPER_BUTTON_COLLIDERS[action];
      const button = new THREE.Mesh(
        buttonGeometry.clone(),
        this.makeHitTargetMaterial(
          getLooperButtonName(action),
          LOOPER_DEBUG_COLORS.button[action],
          looperColliderOpacity,
        ),
      );
      applyConfiguredColliderTransform(
        button,
        buttonConfig,
        LOOPER_COLLIDER_GEOMETRY.buttonDefaultTransform,
      );
      addCollider(button, getLooperButtonName(action), LOOPER_DEBUG_COLORS.button[action], {
        isLooperButton: true,
        looperButtonAction: action,
        looperMorphName: buttonConfig.morphTarget,
      });
      createColliderTransformDebug(
        button,
        getLooperButtonName(action),
        maxSize * LOOPER_COLLIDER_GEOMETRY.buttonDebugAxisScale,
      );
    }

    const columnCount = Math.max(
      Math.round(getNumber(nodeLayout.columns, LOOPER_NODE_COLLIDER_LAYOUT.columns)),
      LOOPER_NODE_COLLIDER_LAYOUT.minColumns,
    );
    const nodeCenter = nodeLayout.center || {};
    for (let index = 0; index < LOOPER_TRACK_COUNT; index += 1) {
      const column = index % columnCount;
      const row = Math.floor(index / columnCount);
      const columnOffset = (column - LOOPER_NODE_COLLIDER_LAYOUT.centerColumn) *
        getNumber(nodeLayout.columnSpacing, LOOPER_NODE_COLLIDER_LAYOUT.columnSpacing);
      const node = new THREE.Mesh(
        nodeGeometry.clone(),
        this.makeHitTargetMaterial(
          getLooperNodeName(index),
          LOOPER_DEBUG_COLORS.nodeOpen,
          looperColliderOpacity,
        ),
      );
      node.position.set(
        tempBoxCenter.x +
          tempBoxSize.x *
          (getNumber(nodeCenter.x, LOOPER_NODE_COLLIDER_LAYOUT.center.x) + columnOffset),
        tempBoxCenter.y +
          tempBoxSize.y *
          (getNumber(nodeCenter.y, LOOPER_NODE_COLLIDER_LAYOUT.center.y) -
            row * getNumber(nodeLayout.rowSpacing, LOOPER_NODE_COLLIDER_LAYOUT.rowSpacing)),
        tempBoxCenter.z +
          tempBoxSize.z * getNumber(nodeCenter.z, LOOPER_NODE_COLLIDER_LAYOUT.center.z) +
          maxSize * getNumber(nodeLayout.forwardOffsetScale, LOOPER_NODE_COLLIDER_LAYOUT.forwardOffsetScale),
      );
      addCollider(node, getLooperNodeName(index), LOOPER_DEBUG_COLORS.nodeOpen, {
        isLooperNode: true,
        looperTrackIndex: index,
        wireSocketOutward: { ...nodeLayout.wireDirection },
      });
    }

    const controlColors = {
      volume: LOOPER_DEBUG_COLORS.controlVolume,
      gap: LOOPER_DEBUG_COLORS.controlGap,
    };
    for (const [control, controlConfig] of Object.entries(LOOPER_CONTROL_COLLIDERS)) {
      const color = controlColors[control] || LOOPER_DEBUG_COLORS.controlVolume;
      const controlSphere = new THREE.Mesh(
        controlGeometry.clone(),
        this.makeHitTargetMaterial(getLooperControlName(control), color, looperColliderOpacity),
      );
      const controlPosition = applyConfiguredColliderTransform(
        controlSphere,
        controlConfig,
        LOOPER_COLLIDER_GEOMETRY.controlDefaultTransform,
      );
      const movementRange = getNumber(
        controlConfig.movementRange,
        LOOPER_CONTROL_MOTION_DEFAULTS.movementRange,
      );
      configureControlMotion(controlSphere, controlConfig, {
        neutralX: controlPosition.x,
        neutralY: controlPosition.y,
        neutralZ: controlPosition.z,
        size: tempBoxSize,
      });
      addCollider(controlSphere, getLooperControlName(control), color, {
        isLooperControl: true,
        looperControl: control,
        looperMorphTargets: controlConfig.morphTargets,
        neutralY: controlPosition.y,
        minY: controlPosition.y - tempBoxSize.y * movementRange,
        maxY: controlPosition.y + tempBoxSize.y * movementRange,
      });
      const defaultPosition = getLooperControlColliderPosition(
        controlSphere.userData,
        LOOPER_CONTROL_DEFAULT_VALUES[control] ?? 0,
      );
      controlSphere.position.set(defaultPosition.x, defaultPosition.y, defaultPosition.z);
      createControlArcDebug(root, getLooperControlName(control), color, controlSphere.userData);
      createColliderTransformDebug(
        controlSphere,
        getLooperControlName(control),
        maxSize * LOOPER_COLLIDER_GEOMETRY.controlDebugAxisScale,
      );
    }

    buttonGeometry.dispose();
    nodeGeometry.dispose();
    controlGeometry.dispose();
    return hitTargets;
  }
}

export function createLooperColliders(root, hitTargets, options = {}) {
  return new LooperColliderFactory(options).create(root, hitTargets);
}

function applyConfiguredColliderTransform(mesh, config = {}, defaults = {}) {
  const defaultPosition = LOOPER_COLLIDER_TRANSFORM_DEFAULTS.position;
  const x = getNumber(config.x, getNumber(defaults.x, defaultPosition.x));
  const y = getNumber(config.y, getNumber(defaults.y, defaultPosition.y));
  const z = getNumber(config.z, getNumber(defaults.z, defaultPosition.z));
  mesh.position.set(
    tempBoxCenter.x + tempBoxSize.x * x,
    tempBoxCenter.y + tempBoxSize.y * y,
    tempBoxCenter.z + tempBoxSize.z * z,
  );

  const rotationDegrees = config.rotationDegrees || {};
  const defaultRotationDegrees =
    defaults.rotationDegrees || LOOPER_COLLIDER_TRANSFORM_DEFAULTS.rotationDegrees;
  mesh.rotation.set(
    THREE.MathUtils.degToRad(getNumber(rotationDegrees.x, defaultRotationDegrees.x)),
    THREE.MathUtils.degToRad(getNumber(rotationDegrees.y, defaultRotationDegrees.y)),
    THREE.MathUtils.degToRad(getNumber(rotationDegrees.z, defaultRotationDegrees.z)),
  );

  const scale = config.scale || {};
  const defaultScale = defaults.scale || LOOPER_COLLIDER_TRANSFORM_DEFAULTS.scale;
  mesh.scale.set(
    getNumber(scale.x, defaultScale.x),
    getNumber(scale.y, defaultScale.y),
    getNumber(scale.z, defaultScale.z),
  );

  return mesh.position;
}

function configureControlMotion(mesh, controlConfig, { neutralX, neutralY, neutralZ, size }) {
  mesh.userData.movementMode =
    controlConfig?.movementMode || LOOPER_CONTROL_MOTION_DEFAULTS.movementMode;
  mesh.userData.neutralX = neutralX;
  mesh.userData.neutralY = neutralY;
  mesh.userData.neutralZ = neutralZ;
  mesh.userData.dragRange = Math.max(
    size.y * getNumber(controlConfig?.movementRange, LOOPER_CONTROL_MOTION_DEFAULTS.movementRange),
    LOOPER_CONTROL_MOTION_DEFAULTS.minDragRange,
  );
  mesh.userData.dragSensitivity = Math.max(
    getNumber(controlConfig?.dragSensitivity, LOOPER_CONTROL_MOTION_DEFAULTS.dragSensitivity),
    LOOPER_CONTROL_MOTION_DEFAULTS.minDragSensitivity,
  );

  if (mesh.userData.movementMode !== "arc" || !controlConfig?.arc) {
    return;
  }

  const radius = Math.max(
    size.x * getNumber(controlConfig.arc.radius, LOOPER_CONTROL_MOTION_DEFAULTS.defaultArcRadius),
    LOOPER_CONTROL_MOTION_DEFAULTS.minArcRadius,
  );
  const defaultArcSide = LOOPER_CONTROL_MOTION_DEFAULTS.defaultArcSide;
  const side =
    getNumber(controlConfig.arc.side, defaultArcSide) <
      LOOPER_CONTROL_MOTION_DEFAULTS.arcSideNegativeThreshold
      ? -defaultArcSide
      : defaultArcSide;
  mesh.userData.arcRadius = radius;
  mesh.userData.arcSide = side;
  mesh.userData.arcRotationZ = mesh.rotation.z;
  mesh.userData.arcMinAngle = THREE.MathUtils.degToRad(
    getNumber(controlConfig.arc.minDegrees, LOOPER_CONTROL_MOTION_DEFAULTS.defaultArcMinDegrees),
  );
  mesh.userData.arcMaxAngle = THREE.MathUtils.degToRad(
    getNumber(controlConfig.arc.maxDegrees, LOOPER_CONTROL_MOTION_DEFAULTS.defaultArcMaxDegrees),
  );
}

function createColliderTransformDebug(mesh, name, length) {
  if (!DEBUG_SHOW_COLLIDERS) {
    return;
  }

  const geometry = new THREE.BufferGeometry();
  const axisPositions = COLLIDER_DEBUG_VISUAL_SETTINGS.axisPositions.map((value) => value * length);
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      axisPositions,
      COLLIDER_DEBUG_VISUAL_SETTINGS.axisItemSize,
    ),
  );
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      COLLIDER_DEBUG_VISUAL_SETTINGS.axisColors,
      COLLIDER_DEBUG_VISUAL_SETTINGS.axisItemSize,
    ),
  );
  markOwnedResource(geometry);

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: COLLIDER_DEBUG_VISUAL_SETTINGS.axisOpacity,
    depthWrite: false,
    depthTest: false,
  });
  markOwnedResource(material);

  const axes = new THREE.LineSegments(geometry, material);
  axes.name = `DEBUG_transform_axes_${name}`;
  axes.renderOrder = COLLIDER_DEBUG_VISUAL_SETTINGS.axisRenderOrder;
  axes.raycast = () => {};
  mesh.add(axes);
}

function createControlArcDebug(root, name, color, userData) {
  if (!DEBUG_SHOW_COLLIDERS || userData.movementMode !== "arc") {
    return;
  }

  tempArcPoints.length = 0;
  const steps = COLLIDER_DEBUG_VISUAL_SETTINGS.arcSteps;
  const midpointAngle = THREE.MathUtils.lerp(
    userData.arcMinAngle,
    userData.arcMaxAngle,
    COLLIDER_DEBUG_VISUAL_SETTINGS.arcMidpointT,
  );
  const midpointX = -userData.arcSide * Math.cos(midpointAngle) * userData.arcRadius;
  const midpointY = Math.sin(midpointAngle) * userData.arcRadius;
  const rotationZ = getNumber(
    userData.arcRotationZ,
    LOOPER_CONTROL_MOTION_DEFAULTS.defaultArcRotationZ,
  );
  const rotationCos = Math.cos(rotationZ);
  const rotationSin = Math.sin(rotationZ);
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const angle = THREE.MathUtils.lerp(userData.arcMinAngle, userData.arcMaxAngle, t);
    const localX = -userData.arcSide * Math.cos(angle) * userData.arcRadius - midpointX;
    const localY = Math.sin(angle) * userData.arcRadius - midpointY;
    tempArcPoints.push(
      new THREE.Vector3(
        userData.neutralX + localX * rotationCos - localY * rotationSin,
        userData.neutralY + localX * rotationSin + localY * rotationCos,
        userData.neutralZ,
      ),
    );
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(tempArcPoints);
  markOwnedResource(geometry);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: COLLIDER_DEBUG_VISUAL_SETTINGS.arcOpacity,
    depthWrite: false,
    depthTest: false,
  });
  markOwnedResource(material);
  const arcLine = new THREE.Line(geometry, material);
  arcLine.name = `DEBUG_control_arc_${name}`;
  arcLine.renderOrder = COLLIDER_DEBUG_VISUAL_SETTINGS.arcRenderOrder;
  arcLine.raycast = () => {};
  root.add(arcLine);
}

function markOwnedResource(resource) {
  if (!resource) {
    return;
  }
  resource.userData ||= {};
  resource.userData.disposeWithOwner = true;
  resource.userData.disposeOnInstrumentDelete = true;
}

function toMaterialArray(material) {
  return Array.isArray(material) ? material : [material];
}

function getNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function getDebugHitOpacity(opacity) {
  return DEBUG_SHOW_COLLIDERS ? opacity : 0;
}
