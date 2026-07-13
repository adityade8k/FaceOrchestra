import { STICK_SETTINGS } from "../../config/stick.js";

export class StickHapticsAdapter {
  constructor({ gamepadResolver, settings = STICK_SETTINGS.haptics } = {}) {
    this.gamepadResolver = gamepadResolver;
    this.settings = settings;
    this.cooldownUntilByController = new Map();
  }

  handleStrike(event) {
    if (event?.type !== "stick.strike" || this.settings?.enabled === false) {
      return null;
    }
    const now = event.timestamp;
    const cooldownUntil = this.cooldownUntilByController.get(event.controllerId) || 0;
    if (now < cooldownUntil) {
      return null;
    }
    const intensity = clamp(this.settings.intensity ?? 0, 0, 1);
    const durationMs = Math.max(this.settings.durationMs ?? 0, 0);
    if (intensity <= 0 || durationMs <= 0) {
      return null;
    }
    const promise = pulseGamepad(this.gamepadResolver?.(event.controllerId), intensity, durationMs);
    if (promise) {
      this.cooldownUntilByController.set(
        event.controllerId,
        now + Math.max(this.settings.cooldownMs ?? 0, 0),
      );
    }
    return promise;
  }

  reset() {
    this.cooldownUntilByController.clear();
  }
}

export function pulseGamepad(gamepad, intensity, durationMs) {
  if (!gamepad) return null;
  try {
    const pulses = [];
    for (const actuator of gamepad.hapticActuators || []) {
      if (typeof actuator?.pulse === "function") pulses.push(actuator.pulse(intensity, durationMs));
    }
    if (pulses.length > 0) return Promise.all(pulses);
    if (typeof gamepad.vibrationActuator?.playEffect === "function") {
      return gamepad.vibrationActuator.playEffect("dual-rumble", {
        startDelay: 0,
        duration: durationMs,
        weakMagnitude: intensity,
        strongMagnitude: intensity,
      });
    }
  } catch (error) {
    return Promise.reject(error);
  }
  return null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, min), max);
}
