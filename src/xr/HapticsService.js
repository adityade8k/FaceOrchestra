export class HapticsService {
  pulse(gamepad, { intensity = 1, durationMs = 25 } = {}) {
    if (!gamepad || intensity <= 0 || durationMs <= 0) return null;
    const magnitude = Math.min(Math.max(intensity, 0), 1);
    try {
      const pulses = [];
      for (const actuator of gamepad.hapticActuators || []) {
        if (typeof actuator?.pulse === "function") pulses.push(actuator.pulse(magnitude, durationMs));
      }
      if (pulses.length) return Promise.all(pulses);
      if (typeof gamepad.vibrationActuator?.playEffect === "function") {
        return gamepad.vibrationActuator.playEffect("dual-rumble", {
          startDelay: 0,
          duration: durationMs,
          weakMagnitude: magnitude,
          strongMagnitude: magnitude,
        });
      }
    } catch (error) {
      return Promise.reject(error);
    }
    return null;
  }
}
