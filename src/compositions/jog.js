import { definition } from './jog/definition.js';
import { JogEnsemble } from '../performance/JogEnsemble.js';
import { JogMelodyGuidance } from '../performance/JogMelodyGuidance.js';
export { definition };
export const enterTutorial = (host, simulate = false) =>
  host.enter(simulate ? "simulation" : "practice");
export const createEnsemble = (host) => new JogEnsemble(host);
export const createGuidance = (anchor) => new JogMelodyGuidance(anchor);
