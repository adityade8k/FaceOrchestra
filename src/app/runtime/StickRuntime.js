import * as THREE from "three";
import { clone as cloneSkeletonAware } from "three/addons/utils/SkeletonUtils.js";
import { RAYCAST_HAPTICS } from "../../config/xr.js";
import { STICK_SETTINGS } from "../../config/stick.js";
import { INTERACTION_TARGET_NAMES } from "../../config/honk.js";
import { HONK_INTERACTION_PROFILE } from "../../instruments/honk/HonkInteractionProfile.js";
import { ControllerMode } from "../../xr/XRInteractionCoordinator.js";

const userPosition = new THREE.Vector3();

export const StickRuntimeMethods = {
  createStickObject() {
    if (!this.stickTemplate) return null;
    const root = new THREE.Group();
    root.name = "HeldStick";
    root.visible = false;
    root.userData.isHeldStick = true;

    const model = cloneSkeletonAware(this.stickTemplate);
    model.name = "HeldStickModel";
    model.visible = true;
    root.add(model);

    const collider = this.createStickCollider();
    if (collider) root.add(collider);
    return { root, collider };
  },

  createStickCollider() {
    return this.stickColliderFactory.create();
  },

  getOrCreateControllerStick(controller, controllerState) {
    if (!controller || !controllerState) return null;
    const existing = controllerState.equippedStickId
      ? this.instrumentRegistry.get(controllerState.equippedStickId)
      : this.stickEquipmentSystem.getEquippedStick(controller.userData.controllerId);
    if (existing) return existing;

    const object = this.createStickObject();
    if (!object) return null;
    const stick = this.instrumentFactory.create({
      kind: "stick",
      root: object.root,
      collider: object.collider,
      stickType: this.stickEquipmentSystem.preferredStickType,
    });
    if (object.collider) {
      stick.registerInteractionTarget("stick.strike-volume", object.collider);
    }
    return stick;
  },

  clearControllerHover(controllerState) {
    if (!controllerState) return;
    if (controllerState.hoveredTarget) {
      this.setTargetHighlight(controllerState.hoveredTarget, false);
      controllerState.hoveredTarget = null;
    }
    controllerState.raycastContactTarget = null;
  },

  clearControllerTriggerInteraction(controllerState) {
    if (!controllerState) return;
    const interaction = controllerState.activeTriggerInteraction;
    if (interaction?.type === "looperWire") {
      this.disposeWireMesh(interaction.wireMesh);
      interaction.wireMesh = null;
    }
    if (interaction?.type === "holdSqueeze") {
      for (const voiceId of interaction.activeVoiceIds || []) this.releaseHonkVoice(voiceId);
    }
    controllerState.activeTriggerInteraction = null;
    this.releaseRaySqueeze(controllerState);
  },

  activateStick(controller) {
    if (!STICK_SETTINGS.enabled || !this.stickTemplate) return false;
    const controllerState = this.controllerStates.get(controller);
    const stick = this.getOrCreateControllerStick(controller, controllerState);
    if (!stick) return false;

    this.clearControllerHover(controllerState);
    this.clearControllerTriggerInteraction(controllerState);
    this.resetShakeDisconnectTracking(controllerState);
    this.gripTransformSystem.release(controller);
    this.closeRadialMenu(controller);
    this.audioSystem.ensureAudio();

    this.stickEquipmentSystem.equip(stick, controller);
    controllerState.equippedStickId = stick.id;
    controllerState.stickActive = true;
    this.interactionCoordinator.setMode(controller, ControllerMode.STICK_EQUIPPED);
    if (controller.userData.rayLine) controller.userData.rayLine.visible = false;
    return true;
  },

  deactivateStick(controller) {
    const controllerState = this.controllerStates.get(controller);
    if (!controllerState) return;
    const controllerId = controller.userData.controllerId;
    const stick = this.stickEquipmentSystem.getEquippedStick(controllerId)
      || this.instrumentRegistry.get(controllerState.equippedStickId);
    if (stick?.equipped) this.stickEquipmentSystem.unequip(stick);
    controllerState.stickActive = false;
    controllerState.equippedStickId = stick?.id || controllerState.equippedStickId;
    this.interactionCoordinator.setMode(controller, ControllerMode.IDLE);
  },

  isControllerStickActive(controller) {
    const state = this.controllerStates.get(controller);
    const stick = state?.equippedStickId ? this.instrumentRegistry.get(state.equippedStickId) : null;
    return Boolean(state?.stickActive && stick?.equipped);
  },

  updateStickPercussionContacts(now = performance.now()) {
    this.getUserCamera().getWorldPosition(userPosition);
    this.stickCollisionSystem.update(now, { userPosition });
  },

  triggerRaycastHitHaptics(controller, controllerState, now = performance.now()) {
    if (RAYCAST_HAPTICS.enabled === false || !controller || !controllerState) return;
    if (now < (controllerState.raycastHapticCooldownUntilMs || 0)) return;
    const pulse = this.hapticsService.pulse(this.getControllerGamepad(controller), RAYCAST_HAPTICS);
    if (!pulse) return;
    controllerState.raycastHapticCooldownUntilMs = now + Math.max(RAYCAST_HAPTICS.cooldownMs || 0, 0);
    pulse.catch?.((error) => console.warn("Could not pulse raycast haptics:", error));
  },

  pulseGamepadHaptics(gamepad, intensity, durationMs) {
    return this.hapticsService.pulse(gamepad, { intensity, durationMs });
  },

  playStickPercussion(percussionType, { volume = 1 } = {}) {
    if (!percussionType) return;
    const playing = this.audioSystem.triggerStickPercussion?.(percussionType, { volume });
    playing?.catch?.((error) => console.warn("Could not play stick percussion:", error));
  },

  isStickBlockingRayHit(hit, lockedInstrument = null) {
    const target = hit?.object;
    if (!target) return false;
    if (target.userData.isCloseButton || lockedInstrument) return true;
    if (
      target.userData.isProceduralMorphTarget ||
      target.userData.isHonkConnectionTarget ||
      this.isLooperColliderTarget(target)
    ) return true;
    const config = HONK_INTERACTION_PROFILE[target.name];
    return Boolean(config && target.name !== INTERACTION_TARGET_NAMES.body);
  },
};
