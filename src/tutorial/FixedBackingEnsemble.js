import { getLooperGapControlFromBeats } from '../instruments/looper/looperControlMapping.js';
import { LiveMelodyEnsemble } from './live-melody/LiveMelodyEnsemble.js';
import { validateRishte } from '../compositions/MelodyScore.js';
import { validateKuchOrchestra, compileKuchPattern } from './kuch-orchestra/score.js';
import { compilePattern } from '../compositions/CompositionCompiler.js';
import { fixedBackingPlan, sequenceKey } from '../compositions/FixedBackingPlan.js';

// This conductor only prepares ordinary recordings and issues ordinary Play,
// queued Play and Stop. LooperPortTransport continues to own boundary timing.
export class FixedBackingEnsemble extends LiveMelodyEnsemble {
  constructor(host, definition) { super(host, definition); this.loopers = []; }
  validateDefinition() {
    (this.definition.playback === 'honk-kuch-orchestra-v1' ? validateKuchOrchestra : validateRishte)(this.definition);
  }
  prepare(options = {}) {
    this.dispose();
    this.loopers = [];
    this.expected = new Map(); this.rolesById = new Map();
    this.plan = fixedBackingPlan(this.definition);
    super.prepare(options);
    for (const recipe of this.definition.arrangement.recipes)
      if (recipe.part === 'chords') this.a.get(recipe.role).setVowel('O');
    this.prepareAttempt();
  }
  prepareAttempt({ backing = this.definition.arrangement.backing, startBeat = 0,
    endBeat = this.definition.score.durationBeats } = {}) {
    if (this.anchor !== null) throw new Error('Stop before preparing another backing sequence.');
    this.validate(); // Never retire a learner-edited take while changing excerpts.
    const key = sequenceKey(backing, startBeat, endBeat), sequence = this.plan.sequences.get(key);
    if (!sequence) throw new Error('Unknown backing sequence.');
    const wanted = new Set(sequence.blocks.flatMap(block => block.patterns).filter(Boolean));
    for (const h of [...this.loopers]) if (!wanted.has(this.rolesById.get(h.id))) {
      this.r.deleteInstrument(h);
      this.a.roles.delete(this.rolesById.get(h.id)); this.rolesById.delete(h.id); this.expected.delete(h.id);
      this.loopers.splice(this.loopers.indexOf(h), 1);
    }
    const ports = [...this.metro.connectionPorts.keys()];
    for (const [index, pattern] of this.plan.patterns.filter(p => wanted.has(p.role)).entries()) {
      if (this.a.get(pattern.role)) continue; // Same take and routes: keep the prepared instrument.

      if (!this.r.createSpawnedComponent('looper', { name: pattern.role, baseScale: .45 }))
        throw new Error(`Cannot prepare ${pattern.role}`);
      const h = this.r.activeInstrumentState;
      // The editable backing placement is separate from the movable melody frame.
      const placement = this.definition.arrangement.fixedBacking.placement;
      h.root.position.set(placement[0] + (index % 8) * .45, placement[1] + Math.floor(index / 8) * .35, placement[2])
        .applyQuaternion(this.a.layoutRotation).add(this.a.anchor);
      h.root.quaternion.copy(this.a.layoutRotation); h.root.updateMatrixWorld(true);
      this.a.roles.set(pattern.role, [h.id]); this.r.syncLooperTransformReference(h);
      this.loopers.push(h); this.rolesById.set(h.id, pattern.role);
      if (!this.r.metronomeConnectionManager.connect({ metronomeId: this.metro.id, portId: ports[pattern.output],
        targetKind: 'looper', targetId: h.id, targetPortId: h.tracks[0].trackId }))
        throw new Error(`Cannot connect ${pattern.role} to its output.`);
      const routes = {};
      for (const role of new Set(pattern.events.map(e => e.role))) {
        if (role === 'hihat') { routes[role] = { trackId: 'looper-self-percussion' }; continue; }
        const track = h.tracks.find(t => t.index > 0 && t.connectedHonkId == null);
        if (!track) throw new Error('Backing exceeds seven available instrument tracks.');
        this.r.connectLooperTrackToHonk(h, track.index, this.a.get(role).id);
        routes[role] = { trackId: track.trackId, trackIndex: track.index };
      }
      const timeline = this.definition.playback === 'honk-kuch-orchestra-v1'
        ? compileKuchPattern(pattern, routes, this.definition.bpm)
        : compilePattern({ ...pattern, routes, beatMs: 60000 / this.definition.bpm });
      h.looperController.restoreState(h, { timeline: timeline.toJSON(),
        controls: { recordBeats: pattern.beats, gap: getLooperGapControlFromBeats(pattern.gapBeats), volume: pattern.volume } }, { preserveConnections: true });
      this.expected.set(h.id, { identity: this.identity(h), timeline: h.timeline });
    }
    this.preparedSequence = key;
    this.validate();
  }
  identity(h) {
    const wire = this.r.metronomeConnectionManager.getConnectionForTarget('looper', h.id);
    return JSON.stringify({ revision: h.looperData.takeRevision,
      controls: [h.looperData.gapBeats, h.looperData.volume, h.looperData.recordBeats],
      routes: h.tracks.map(t => [t.trackId, t.connectedHonkId]),
      clock: wire && [wire.metronomeId, wire.portId, wire.targetPortId] });
  }
  validate() {
    super.validate();
    for (const h of this.loopers) {
      if (h.disposed || h.transport.recording || h.transport.recordArmed || (this.identity(h) !== this.expected.get(h.id)?.identity || h.timeline !== this.expected.get(h.id)?.timeline))
        throw new Error('Backing recording activity or connections changed. Your recordings are preserved; prepare again when ready.');
    }
    return true;
  }
  schedule(options) {
    this.cancel(); this.validate();
    const startBeat = options.startBeat ?? 0, endBeat = options.endBeat ?? this.definition.score.durationBeats;
    const backing = options.backing ?? this.definition.arrangement.backing;
    const sequence = this.plan.sequences.get(sequenceKey(backing, startBeat, endBeat));
    if (!sequence || this.preparedSequence !== sequenceKey(backing, startBeat, endBeat))
      throw new Error('Prepare this backing sequence before starting.');
    super.schedule(options);
    this.blocks = sequence.blocks;
    this.playbackEvents = options.events ?? this.definition.score.events;
    this.origin = options.origin || 'performance';
    this.audioAnchor = { wallMs: options.wallNow, audioSeconds: options.audioNow };
    this.handoffs = []; this.queued = new Set();
    this.current = new Map();
    try {
      for (let lane = 0; lane < this.definition.arrangement.fixedBacking.outputGroups.length; lane++) {
        const first = this.blocks.find(block => block.patterns[lane]);
        if (first) this.launch(first.patterns[lane], first.beat, options.wallNow);
      }
    } catch (error) { this.cancel(); throw error; }
  }
  launch(role, beat, now) {
    const h = this.a.get(role), c = h.looperController;
    if (!c.armPlayback(h, now, c.getTimingForLooper(h, now), {
      targetBeat: this.clockStartBeat + beat - this.startBeat, audioAnchor: this.audioAnchor, origin: this.origin,
    })) throw new Error(`Backing could not start ${role} on its Metronome output.`);
  }
  update(now) {
    if (this.anchor === null) return;
    try { this.validate(); } catch (error) { this.cancel(); throw error; }
    if (!this.metro.playing || this.r.audioSystem.audioContextService.context?.state !== 'running') { this.cancel(); return; }
    const beat = this.beatAt(now);
    this.hands?.update(this.playbackEvents, beat);
    if (beat >= this.endBeat - 1e-9) { this.cancel(); this.stoppedBeat = this.endBeat; return; }
    const index = this.blocks.findIndex(b => beat >= b.beat && beat < b.beat + b.beats);
    if (index < 0) return;
    const block = this.blocks[index], next = this.blocks[index + 1];
    for (const [lane, role] of block.patterns.entries()) {
      const old = this.current.get(lane);
      if (!role) {
        if (old) this.a.get(old).looperController.stopPlayback(this.a.get(old));
        this.current.set(lane, null);
        const upcoming = this.blocks.slice(index + 1).find(b => b.patterns[lane]);
        const key = `start-${lane}-${upcoming?.beat}`;
        if (upcoming && !this.queued.has(key)) {
          this.launch(upcoming.patterns[lane], upcoming.beat, now); this.queued.add(key);
        }
        continue;
      }
      this.current.set(lane, role);
      const h = this.a.get(role), c = h.looperController;
      c.getPortTransport().update(h.looperData.portGroup, now);
      const nextRole = next?.patterns[lane], key = `${lane}-${index}`;
      // Queuing before the initial launch would replace it. Wait until the
      // outgoing take really plays; sharing an output alone never advances it.
      if (nextRole && nextRole !== role && h.transport.playing && !this.queued.has(key)) {
        this.launch(nextRole, next.beat, now); this.queued.add(key);
        this.handoffs.push({ from: role, to: nextRole, beat: next.beat, lane });
      }
    }
  }
  cancel() {
    for (const h of this.loopers || []) if (!h.disposed) h.looperController.stopPlayback(h);
    this.queued?.clear(); this.current?.clear();
    super.cancel();
    this.playbackEvents = null;
  }
}
