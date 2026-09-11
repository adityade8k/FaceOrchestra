import { runtimeModule } from './runtimeModule.mjs';
import { HonkInstrument, HONK_INTERACTION_ROLES } from '../../src/instruments/honk/HonkInstrument.js';
import { InstrumentRegistry } from '../../src/instruments/core/InstrumentRegistry.js';
import { InteractionTargetRegistry } from '../../src/instruments/core/InteractionTargetRegistry.js';
import { HonkContactSystem } from '../../src/instruments/formations/HonkContactSystem.js';
import { AudioSystem } from '../../src/audio/AudioSystem.js';
import { INTERACTION_TARGET_NAMES } from '../../src/config/honk.js';
const { XRInteractionRuntimeMethods } = await runtimeModule(new URL('../../src/app/runtime/XRInteractionRuntime.js', import.meta.url));
const { HonkPerformanceRuntimeMethods } = await runtimeModule(new URL('../../src/app/runtime/HonkPerformanceRuntime.js', import.meta.url));
const { XRInteractionCoordinator } = await runtimeModule(new URL('../../src/xr/XRInteractionCoordinator.js', import.meta.url));
const { LifecycleRuntimeMethods } = await import('../../src/app/runtime/LifecycleRuntime.js');
export const flushAudio = () => new Promise(resolve => setImmediate(resolve));

export function fixture({ count = 1, locked = false, ensureContext = null } = {}) {
  const instrumentRegistry = new InstrumentRegistry();
  const targets = new InteractionTargetRegistry();
  const scene = { visible: true };
  const context = audioContext();
  const audioSystem = new AudioSystem({ audioContextService: {
    context, ensureContext: ensureContext || (async () => context),
  }, masterBus: { input: {}, initialize() {} } });
  const honks = Array.from({ length: count }, (_, index) => {
    const root = { visible: true, parent: scene, userData: {} };
    const h = new HonkInstrument({ id: `h${index}`, root, interactionTargetRegistry: targets,
      voiceService: audioSystem, morphController: { applyPerformanceState() {} } });
    h.locked = locked;
    h.x = index * 1.4;
    h.hitTargets = {};
    for (const [key, role] of Object.entries(HONK_INTERACTION_ROLES)) {
      const name = key === 'squeeze' ? INTERACTION_TARGET_NAMES.horn :
        INTERACTION_TARGET_NAMES[key] || 'HIT_honk_connector';
      const target = { name, visible: true, parent: root, position: { y: 0 }, userData: {
        isHitTarget: true, isBodyGripTarget: key === 'body', isProceduralMorphTarget: key !== 'body',
      } };
      h.registerHonkTarget(role, target);
      h.hitTargets[name] = target;
    }
    h.squeezeCollider.userData.getWorldSphere = () => ({ center: [h.x, 0, 0], radius: 1 });
    h.hornHolders = new Set(); h.activeBends = new Map();
    instrumentRegistry.add(h, { initialize: false });
    return h;
  });
  const interactionCoordinator = new XRInteractionCoordinator({});
  const controllers = ['left', 'right'].map(id => ({ id, roll: 0, position: { y: 0 }, userData: {} }));
  for (const controller of controllers) interactionCoordinator.registerController(controller);
  const counters = { queries: 0, locked: 0, starts: 0, morphEdits: 0, gripBegins: 0 };
  const originalStart = audioSystem.startVoice.bind(audioSystem);
  audioSystem.startVoice = (...args) => { counters.starts++; return originalStart(...args); };
  const host = Object.assign({}, XRInteractionRuntimeMethods, HonkPerformanceRuntimeMethods, LifecycleRuntimeMethods, {
    instrumentRegistry, audioSystem, controllers, interactionCoordinator,
    controllerStates: interactionCoordinator.controllerStates,
    isControllerStickActive() { return false; }, handleLooperTriggerPress() { return false; },
    updateLooperPlayback() {}, updateLooperPlaybackAudio() {}, applyResolvedHonkMorphState() {},
    applyInstrumentVisualScale() {}, cycleVowel() { counters.morphEdits++; },
    getInteractionValue() { counters.morphEdits++; return 0; },
    getCurrentHit(controller) { counters.queries++; return controller.hit ? { object: controller.hit } : null; },
    getLockedInstrumentStateFromRay(controller) { counters.locked++; return controller.lockedHit || null; },
    getControllerVoiceId(controller) { return controller.id; },
    getInstrumentVoiceId(voice, honk) { return `${voice}:${honk.id}`; },
    resetRaySqueezeReference(controller, state) { state.raySqueezeStartInverseQuaternion = { roll: controller.roll }; },
    getControllerRollBend(controller, interaction) { return controller.roll - interaction.bendStartInverseQuaternion.roll; },
    cancelAllMetronomeWireInteractions() {},
    instrumentLifecycle: { deleteInstrument(id) { instrumentRegistry.remove(id); } },
    triggerRaycastHitHaptics() {}, setTargetHighlight() {}, clearControllerHover() {},
    getGripHit(controller) { return controller.hit ? { object: controller.hit } : null; },
    gripTransformSystem: { begin() { counters.gripBegins++; return true; } },
  });
  Object.defineProperty(host, 'instrumentStates', { get: () => [...instrumentRegistry.values()] });
  const contact = new HonkContactSystem({ instrumentRegistry });
  host.honkContactGraph = contact.graph;
  contact.update(); contact.update();
  let now = 0;
  const frame = (dt = 1000 / 90) => {
    now += dt; context.currentTime = now / 1000;
    contact.update(); host.updateHorn(now);
  };
  const press = (target = honks[0].squeezeCollider, controller = controllers[0]) => {
    controller.hit = target;
    const owner = instrumentRegistry.getFromObject3D(target);
    controller.lockedHit = owner?.locked ? owner : null;
    host.controllerStates.get(controller).trigger = true;
    host.handleTriggerBeginIntent(controller);
  };
  const release = (controller = controllers[0]) => {
    host.controllerStates.get(controller).trigger = false;
    host.handleTriggerEndIntent(controller);
  };
  return { host, honks, controllers, context, audio: audioSystem.honkVoices, counters, frame, press, release, contact };
}

function audioContext() {
  const nodes = [];
  const parameter = () => ({ value: 0, events: [],
    setValueAtTime(value, time) { this.value = value; this.events.push({ type: 'value', value, time }); },
    setTargetAtTime(value, time, constant) { this.value = value; this.events.push({ type: 'target', value, time, constant }); },
    linearRampToValueAtTime(value, time) { this.value = value; this.events.push({ type: 'ramp', value, time }); },
    cancelScheduledValues() {}, cancelAndHoldAtTime() {},
  });
  const node = kind => {
    const value = { kind, frequency: parameter(), detune: parameter(), Q: parameter(), gain: parameter(),
      starts: [], stops: [], connect() {}, disconnect() {},
      start(time) { this.starts.push(time); }, stop(time) { this.stops.push(time); },
    }; nodes.push(value); return value;
  };
  return { currentTime: 0, nodes, destination: {},
    createOscillator: () => node('oscillator'), createBiquadFilter: () => node('filter'), createGain: () => node('gain') };
}
