const buttonFor = (intent) => ({
  'interaction.trigger.begin': 'trigger', 'interaction.grip.begin': 'grip',
  'spawn.menu.open': intent.handedness === 'left' ? 'secondary' : 'primary',
  'context.secondary': 'secondary', 'instrument.delete': 'primary',
  'instrument.scale.horizontal.step': 'axis',
})[intent.type];

// Independent of XR hardware: only neutral -> engaged transitions occurring
// after entry can produce evidence. Queued inputs retain their original time.
export class BasicsInputGate {
  constructor(now) { this.enteredAt = now; this.ready = new Map(); }
  observe(controller, state) {
    let keys = this.ready.get(controller);
    if (!keys) this.ready.set(controller, keys = new Set());
    for (const key of ['trigger', 'grip', 'primary', 'secondary'])
      if (!state[key]) keys.add(key);
    const axis = controller.userData.gamepad?.axes?.[2] ?? state.thumbstickScaleDirection ?? 0;
    if (Math.abs(axis) < 0.25) keys.add('axis');
  }
  accept(intent) {
    if (intent.controller.userData.virtualTutorial ||
        (intent.controller.userData.tutorialOrigin && intent.controller.userData.tutorialOrigin !== 'learner')) return false;
    if (!Number.isFinite(intent.timestamp) || intent.timestamp <= this.enteredAt) return false;
    const key = buttonFor(intent);
    if (!key || (key === 'axis' && !intent.direction)) return true;
    const keys = this.ready.get(intent.controller);
    if (!keys?.has(key)) return false;
    keys.delete(key);
    return true;
  }
}
