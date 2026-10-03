import * as THREE from 'three';
import { INSTRUMENT_BASE_SCALE } from '../config/honk.js';
import { connectTutorialHonk } from './TutorialRoutes.js';

// Every fixture is made of ordinary instruments, routes and serialized takes.
// Checkpoints are session-local and never overwrite the Play workspace.
export class BasicsFixtures {
  constructor(tutorial) {
    this.t = tutorial;
    this.r = tutorial.r;
    this.a = tutorial.a;
    this.owned = new Set();
    this.checkpoints = new Map();
    this.unsubscribe = this.r.instrumentRegistry.subscribe(event => {
      if (event.type === 'instrument.added') this.owned.add(event.instrumentId);
      if (event.type === 'instrument.removed') this.owned.delete(event.instrumentId);
    });
  }
  get honks() { return this.r.instrumentRegistry.getByKind('honk').filter(h => this.owned.has(h.id) && !h.pendingPlacement); }
  get(role) { return this.a.get(role); }
  spawn(kind, role, x = 0, y = 0, z = 0) {
    const root = this.r.createSpawnedComponent(kind, {
      name: `Onboarding ${role}`, baseScale: kind === 'honk' ? INSTRUMENT_BASE_SCALE : 0.65,
    });
    if (!root) throw new Error(`Could not prepare ${kind}. Use Reset lesson to retry.`);
    const h = this.r.activeInstrumentState;
    this.r.setInstrumentBaseScale(h, kind === 'honk' ? INSTRUMENT_BASE_SCALE : 0.65);
    root.position.copy(new THREE.Vector3(x, y, z).applyQuaternion(this.a.layoutRotation).add(this.a.anchor));
    root.quaternion.copy(this.a.layoutRotation);
    root.updateMatrixWorld(true);
    this.a.roles.set(role, [h.id]);
    return h;
  }
  quiesce() {
    this.a.releaseAll();
    this.r.deletePendingSpawnPlacement();
    for (const l of this.r.instrumentRegistry.getByKind('looper')) {
      if (l.transport.recording || l.transport.recordArmed) this.r.stopRecording(l);
      this.r.stopPlayback(l);
    }
  }
  checkpoint(id) {
    this.checkpoints.set(id, {
      scene: this.r.sceneSerializer.serialize(),
      roles: [...this.a.roles].map(([role, ids]) => [role, [...ids]]),
      clocksPlaying: this.r.instrumentRegistry.getByKind('metronome').filter(m => m.playing).map(m => m.id),
    });
  }
  async restore(id) {
    const saved = this.checkpoints.get(id);
    if (!saved) throw new Error('Lesson checkpoint missing. Restart onboarding to recover.');
    this.a.clear();
    const result = await this.r.sceneRestorer.restore(saved.scene);
    this.a.roles = new Map(saved.roles.map(([role, ids]) => [role, [...ids]]));
    for (const clockId of saved.clocksPlaying) this.r.instrumentRegistry.get(clockId)?.play(performance.now());
    if (result.skipped.length) throw new Error('Some lesson objects could not be restored. Use Reset lesson to retry.');
  }
  prepare(id) {
    let h = this.get('basic');
    if (id === 'honk') h = this.spawn('honk', 'basic');
    if (['ears', 'pitch', 'volume', 'vowels'].includes(id)) {
      // Restore a reachable face after transform exercises, and allow both
      // directions of every facial control without resetting earned progress.
      h.root.position.copy(this.a.anchor);
      h.root.quaternion.copy(this.a.layoutRotation);
      this.r.setInstrumentBaseScale(h, INSTRUMENT_BASE_SCALE);
      h.setEar('left', 0); h.setEar('right', 0); h.setNose(0.5);
      if (id === 'vowels') h.setVowel('A');
    }
    if (id === 'chord') {
      // Duplicate initially coincides with its source. Separate the two so
      // an old contact cannot satisfy the upcoming formation objective.
      this.honks.forEach((horn, i) => {
        horn.root.position.copy(this.a.anchor).add(new THREE.Vector3((i - 0.5) * 0.65, 0, 0).applyQuaternion(this.a.layoutRotation));
        horn.root.updateMatrixWorld(true);
      });
      this.r.honkContactSystem.reset();
    }
    if (id === 'metronome') this.spawn('metronome', 'metronome', -0.52, -0.18, 0.08).setBpm(80);
    if (id === 'length') this.spawn('looper', 'chordLooper', 0.48, -0.18, 0.08);
    if (id === 'gap') this.r.setLooperControlValue(this.get('chordLooper'), 'gap', -1);
    if (id === 'second-record') {
      const l = this.spawn('looper', 'alternativeLooper', -0.02, -0.32, 0.36);
      connectTutorialHonk(this.a, 'basic', 'alternativeLooper');
      // A separate output initially permits recording the second pattern.
      const m = this.get('metronome'), manager = this.r.metronomeConnectionManager;
      const first = manager.getConnectionForTarget('looper', this.get('chordLooper').id);
      const portId = [...m.connectionPorts.keys()].find(port => port !== first.portId);
      const track = l.tracks.find(t => !t.connectedHonkId);
      manager.connect({ metronomeId: m.id, portId, targetKind: 'looper', targetId: l.id, targetPortId: track.trackId });
      this.r.setLooperControlValue(l, 'recordLength', -1 / 3);
    }
    if (id === 'strike' || id === 'finish') this.get('metronome')?.pause();
    if (['wire-horn', 'wire-clock', 'record', 'playback', 'gap', 'second-record', 'shared-clock', 'switch'].includes(id))
      this.get('metronome')?.play(performance.now());
    for (const horn of this.honks) horn.root.updateMatrixWorld(true);
  }
  clearHorns() {
    for (const h of [...this.honks]) this.r.deleteInstrument(h);
  }
  relocateToViewer() {
    const previousAnchor = this.a.anchor.clone(), previousRotation = this.a.layoutRotation.clone();
    this.a.begin('learner');
    const rotation = this.a.layoutRotation.clone().multiply(previousRotation.invert());
    const position = p => p.sub(previousAnchor).applyQuaternion(rotation).add(this.a.anchor);
    for (const id of this.owned) {
      const h = this.r.instrumentRegistry.get(id);
      if (!h || h.kind === 'stick') continue;
      position(h.root.position); h.root.quaternion.premultiply(rotation);
      h.root.updateMatrixWorld(true);
    }
    for (const checkpoint of this.checkpoints.values()) {
      for (const h of checkpoint.scene.instruments) {
        h.transform.position = position(new THREE.Vector3().fromArray(h.transform.position)).toArray();
        h.transform.quaternion = new THREE.Quaternion().fromArray(h.transform.quaternion).premultiply(rotation).toArray();
      }
    }
    this.r.honkLockService.updateTransforms();
    this.r.honkContactSystem.reset();
  }
  dispose() {
    this.unsubscribe?.();
    this.quiesce();
    for (const id of [...this.owned]) {
      const h = this.r.instrumentRegistry.get(id);
      if (h) this.r.deleteInstrument(h);
    }
    this.owned.clear(); this.checkpoints.clear();
  }
}
