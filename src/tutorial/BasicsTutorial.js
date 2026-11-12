import { Vector3 } from "three";
import { INSTRUMENT_BASE_SCALE } from "../config/honk.js";
import { getHonkNoteGainFromNose } from "../config/audio.js";
import { BASICS_STEPS, BASICS_THRESHOLDS, BASICS_EARS, BASICS_VOWELS } from "./basicsSteps.js";
import { BasicsInputGate } from "./BasicsInputGate.js";
import { BasicsFixtures } from "./BasicsFixtures.js";
import { BasicsGuidance } from "./BasicsGuidance.js";
import { BasicsFinale } from "./BasicsFinale.js";
export { BASICS_STEPS } from "./basicsSteps.js";

export class BasicsTutorial {
  constructor(host) {
    this.host = host;
    this.r = host.r;
    this.a = host.adapter;
    this.thresholds = { ...BASICS_THRESHOLDS };
    this.index = 0;
    this.completed = new Set();
    this.outcomes = {};
    this.fixtures = new BasicsFixtures(this);
    this.guidance = new BasicsGuidance(this);
    this.setup = true;
    this.fixtures.prepare("honk");
    this.fixtures.checkpoint("honk");
    this.setup = false;
    this.beginAttempt(performance.now());
  }
  get step() {
    return BASICS_STEPS[this.index];
  }
  get firstUnfinished() {
    const i = BASICS_STEPS.findIndex((s) => !this.completed.has(s.id));
    return i < 0 ? BASICS_STEPS.length - 1 : i;
  }
  get horn() {
    return this.fixtures.get("basic");
  }
  get looper() {
    return this.fixtures.get(
      ["second-record", "shared-clock"].includes(this.step.id)
        ? "alternativeLooper"
        : "chordLooper",
    );
  }
  get activeObjectives() {
    return this.step.objectives.filter((id) => !this.objectives.has(id));
  }
  beginAttempt(now) {
    this.enteredAt = now;
    this.gate = new BasicsInputGate(now);
    this.objectives = new Set();
    this.fresh = new Map();
    this.before = new Map();
    this.soundSince = new Map();
    this.visited = this.completed.has(this.step.id);
    this.successAt = null;
    this.error = "";
    this.help = false;
    this.playRequested = new Set();
    this.recordRequest = null;
    this.sizePushes = 0;
    this.pauseRequested = false;
    this.audibleLoops = new Set();
    this.approvedSticks = new Set();
    this.frozenId = null;
    this.lastPulse = null;
    this.pulses = 0;
    this.tempoChanged = false;
    this.metroStarted = false;
    this.returnScale = null;
    this.tempoBaseline = this.fixtures.get("metronome")?.bpm;
    this.wireChanged = false;
    this.chordMoved = false;
    this.practicing = true;
    if (this.step.id === "finish") {
      this.host.navigation.menu.setVisible(true);
      this.guidance.recenter();
    }
    this.host.panel.setTransport("");
    this.host.lastDraw = -Infinity;
  }
  persist() {
    // Old skip-based progress is intentionally not imported as completion.
    this.host.learningProgress.save("basics", 2, {
      index: this.index,
      outcomes: this.outcomes,
    });
  }
  quiesce() {
    this.setup = true;
    this.fixtures.quiesce();
    this.setup = false;
    this.fresh?.clear();
    this.soundSince?.clear();
  }
  async enter(index, { reset = false } = {}) {
    if (
      this.setup ||
      this.disposed ||
      index < 0 ||
      index > this.firstUnfinished ||
      index >= BASICS_STEPS.length
    )
      return;
    this.setup = true;
    this.successAt = null;
    this.guidance.reset();
    this.finale?.dispose();
    this.finale = null;
    this.fixtures.quiesce();
    try {
      const step = BASICS_STEPS[index];
      if (this.fixtures.checkpoints.has(step.id)) await this.fixtures.restore(step.id);
      else {
        this.fixtures.prepare(step.entry);
        this.fixtures.checkpoint(step.id);
      }
      if (this.disposed) return;
      this.index = index;
      this.beginAttempt(performance.now());
      if (step.id === "finale") this.finale = new BasicsFinale(this);
      if (reset) this.help = true;
      this.persist();
    } catch (error) {
      this.error = error.message;
    } finally {
      this.setup = false;
      this.host.lastDraw = -Infinity;
    }
  }
  async action(id) {
    if (this.setup || this.disposed) return;
    if (this.finale && id !== "restart") return this.finale.action(id);
    if (id === "previous-step" && this.index > 0) this.pending = this.enter(this.index - 1);
    if (id === "next-step" && this.completed.has(this.step.id))
      this.pending = this.enter(this.index + 1);
    if (id === "reset-lesson" || id === "step-practice")
      this.pending = this.enter(this.index, { reset: true });
    if (id === "step-help" || id === "step-demo") {
      this.help = !this.help;
      // Help is a static movement cue, never a source of instrument evidence.
    }
    if (id === "restart") {
      this.finale?.dispose();
      this.finale = null;
      this.quiesce();
      this.setup = true;
      this.a.clear();
      this.a.begin("learner");
      this.completed.clear();
      this.outcomes = {};
      this.fixtures.checkpoints.clear();
      this.index = 0;
      this.fixtures.prepare("honk");
      this.fixtures.checkpoint("honk");
      this.setup = false;
      this.beginAttempt(performance.now());
      this.persist();
    }
    await this.pending;
  }
  // Kept as lifecycle hooks for the shared tutorial host. Help does not play
  // instruments or mutate the scene; it cannot earn completion.
  demonstrate() {
    this.help = true;
  }
  async cancelDemo() {
    await this.pending;
    if (this.finale) this.host.flow.stopDemo(false);
    this.help = false;
  }
  recenter() {
    if (this.finale) return this.host.panel.recenter(this.r.getUserCamera(), true);
    this.guidance.recenter({ pin: true });
  }
  relocateToViewer() {
    if (this.finale) this.suspend();
    this.quiesce();
    this.setup = true;
    this.fixtures.relocateToViewer();
    this.setup = false;
    this.beginAttempt(performance.now());
    if (this.finale) this.recenter();
    else this.guidance.recenter();
  }
  suspend() {
    if (this.finale) {
      this.host.flow.cancelOutgoing();
      return;
    }
    this.quiesce();
    this.beginAttempt(performance.now());
  }
  captureIntent(intent, state) {
    if (this.disposed || this.finale) return false;
    const ending =
      intent.type.endsWith(".end") ||
      intent.type === "spawn.menu.confirm" ||
      (intent.type === "instrument.scale.horizontal.step" && !intent.direction);
    if (
      this.setup ||
      (this.successAt !== null && !this.step.keepInteractive) ||
      this.host.navigation.screen
    )
      return !ending;
    if (!this.gate.accept(intent)) return !ending;
    const c = intent.controller;
    const target = this.r.instrumentRegistry.getFromObject3D(this.r.getCurrentHit(c)?.object);
    this.before.set(c, {
      target,
      hit: this.r.getCurrentHit(c)?.object,
      honks: this.fixtures.honks.map((h) => h.id),
      lock: target && this.r.honkLockService.getGroupForMember(target.id),
      source: state.gripSourceInstrumentState,
      scale: state.gripSourceInstrumentState?.baseScale,
      routes: this.routesKey(),
    });
    // A/X retain their ordinary meanings elsewhere. Cap only tutorial horn
    // duplication, and clear only objects owned by this isolated session.
    if (
      intent.type === "spawn.menu.open" &&
      state.grip &&
      state.gripSourceInstrumentState?.kind === "honk"
    ) {
      const limit =
        this.step.id === "duplicate"
          ? 2
          : ["chord", "freeze", "unfreeze", "clear"].includes(this.step.id)
            ? 3
            : 1;
      if (this.fixtures.honks.length >= limit) return true;
    }
    if (intent.type === "instrument.delete" && this.step.id === "clear") {
      const count = this.fixtures.honks.length;
      this.fixtures.clearHorns();
      if (count && this.fixtures.honks.length === 0) this.award("clear");
      return true;
    }
    return false;
  }
  routesKey() {
    return JSON.stringify({
      clocks: this.r.metronomeConnectionManager.getConnections(),
      tracks: this.r.instrumentRegistry
        .getByKind("looper")
        .map((l) => l.tracks.map((t) => t.connectedHonkId)),
    });
  }
  onIntent(intent) {
    if (this.finale) return;
    if (this.setup || this.disposed || (this.successAt !== null && !this.step.keepInteractive))
      return;
    const c = intent.controller,
      before = this.before.get(c);
    if (
      !before ||
      c.userData.virtualTutorial ||
      (c.userData.tutorialOrigin && c.userData.tutorialOrigin !== "learner")
    )
      return;
    this.before.delete(c);
    const s = this.r.controllerStates.get(c),
      id = this.step.id;
    let fresh = this.fresh.get(c);
    if (!fresh) this.fresh.set(c, (fresh = {}));
    if (intent.type === "interaction.trigger.begin") {
      fresh.trigger = true;
      fresh.routes = before.routes;
      fresh.interaction = s.activeTriggerInteraction;
      fresh.bend = this.horn?.getProcessedLivePerformanceState().bend || 0;
      fresh.soundingBend = undefined;
      fresh.bendLatched = false;
      fresh.parameter = this.parameterValue(s.activeTriggerInteraction);
      fresh.objective = this.activeObjectives[0];
      const l = this.looper,
        action = before.hit?.userData.looperButtonAction;
      if (
        before.target === l &&
        action === "record" &&
        (l.transport.recordArmed || l.transport.recording)
      ) {
        this.recordRequest = { id: l.id, revision: l.looperData.takeRevision };
        this.objectives.clear();
        this.award("armed");
      }
      if (
        ["record", "second-record"].includes(id) &&
        before.target === l &&
        action === "stop" &&
        this.recordRequest?.id === l?.id &&
        this.objectives.has("sound") &&
        !l.transport.recording &&
        !l.transport.recordArmed &&
        l.timeline.hasRecording()
      )
        this.award("stopped");
      if (before.target?.kind === "looper" && action === "play")
        this.playRequested.add(before.target.id);
      if (
        id === "playback" &&
        before.target === l &&
        action === "pause" &&
        this.objectives.has("heard")
      )
        this.pauseRequested = true;
      if (
        id === "metronome" &&
        before.target === this.fixtures.get("metronome") &&
        before.hit?.userData.metronomeButtonAction === "play" &&
        before.target.playing
      ) {
        this.metroStarted = true;
        this.lastPulse = before.target.lastEmittedBeatOrdinal;
        this.pulses = 0;
      }
    }
    if (intent.type === "interaction.grip.begin" && s.gripHeld && s.gripInstrumentState) {
      const target = s.gripInstrumentState;
      fresh.grip = {
        id: target.id,
        position: target.root.position.clone(),
        quaternion: target.root.quaternion.clone(),
        sourceId: s.gripSourceInstrumentState?.id,
        members: this.fixtures.honks.map((h) => [h.id, h.root.position.clone()]),
      };
    }
    if (intent.type === "interaction.grip.begin" && s.stickActive && s.equippedStickId)
      this.approvedSticks.add(s.equippedStickId);
    if (
      intent.type === "instrument.scale.horizontal.step" &&
      fresh.grip &&
      s.gripHeld &&
      before.source === this.horn &&
      before.scale !== this.horn.baseScale
    ) {
      if ((id === "small" && intent.direction < 0) || (id === "big" && intent.direction > 0)) {
        this.sizePushes++;
        if (this.sizePushes >= this.thresholds.sizePushes) this.award(id);
      }
    }
    if (intent.type === "spawn.menu.open" && before.source?.kind === "honk" && fresh.grip) {
      const added = this.fixtures.honks.filter((h) => !before.honks.includes(h.id));
      if (added.length === 1) {
        if (id === "duplicate" && this.fixtures.honks.length === 2) this.award("duplicate");
        if (id === "chord" && this.fixtures.honks.length === 3) this.award("three");
        // Duplication transfers the actual grip to the copy.
        const target = s.gripInstrumentState;
        fresh.grip = {
          id: target.id,
          sourceId: added[0].id,
          position: target.root.position.clone(),
          quaternion: target.root.quaternion.clone(),
        };
      }
    }
    if (intent.type === "context.secondary" && before.target?.kind === "honk") {
      const group = this.r.honkLockService.getGroupForMember(before.target.id);
      if (
        id === "freeze" &&
        !before.lock &&
        group?.size === 3 &&
        [...group.memberIds].every((member) => this.fixtures.owned.has(member))
      ) {
        this.frozenId = group.id;
        this.award("freeze");
      }
      if (
        id === "unfreeze" &&
        before.lock?.size === 3 &&
        !group &&
        [...before.lock.memberIds].every(
          (member) =>
            this.fixtures.owned.has(member) && !this.r.instrumentRegistry.get(member)?.locked,
        )
      )
        this.award("unfreeze");
    }
    if (intent.type === "interaction.trigger.end") {
      if (fresh.trigger && fresh.routes !== this.routesKey()) this.wireChanged = true;
      fresh.trigger = false;
      fresh.interaction = null;
      this.soundSince.delete(c);
    }
    if (intent.type === "interaction.grip.end") fresh.grip = null;
  }
  placed(instruments, preview) {
    if (this.finale) return;
    const limit =
      this.step.id === "duplicate"
        ? 2
        : ["chord", "freeze", "unfreeze", "clear"].includes(this.step.id)
          ? 3
          : 1;
    for (const extra of this.fixtures.honks.slice(limit)) this.r.deleteInstrument(extra);
    if (
      this.setup ||
      this.successAt !== null ||
      this.step.id !== "create" ||
      preview?.controller?.userData.virtualTutorial
    )
      return;
    const horn = instruments.find((h) => h.kind === "honk" && !h.pendingPlacement);
    // Placement must have come from a fresh Trigger on the ordinary preview.
    if (horn && this.before.has(preview?.controller)) {
      this.a.roles.set("basic", [horn.id]);
      this.award("create");
    }
  }
  parameterValue(interaction) {
    const h = interaction?.instrumentState,
      l = interaction?.looperState;
    if (interaction?.dragType === "ear")
      return h.getLivePerformanceState()[interaction.side === "left" ? "earLeft" : "earRight"];
    if (interaction?.dragType === "nose") return h.getLivePerformanceState().nose;
    if (interaction?.type === "metronomeControlDrag") return h.bpm;
    if (interaction?.type === "looperControlDrag")
      return interaction.control === "recordLength"
        ? l.looperData.recordBeats
        : interaction.control === "gap"
          ? l.looperData.gapBeats
          : l.looperData.volume;
    return null;
  }
  award(objective) {
    if (
      !this.practicing ||
      this.setup ||
      this.disposed ||
      !this.step.objectives.includes(objective)
    )
      return;
    this.objectives.add(objective);
  }
  accept(event) {
    if (this.step.id === "finish") {
      const intent = event.intent;
      if (
        this.setup ||
        this.disposed ||
        event.origin !== "learner" ||
        !Number.isFinite(event.startMs) ||
        event.startMs <= this.enteredAt ||
        intent?.type !== "menu.toggle" ||
        intent.handedness !== "left" ||
        intent.controller?.userData?.virtualTutorial ||
        (intent.controller?.userData?.tutorialOrigin &&
          intent.controller.userData.tutorialOrigin !== "learner")
      )
        return;
      if (event.kind === "menu.hide") this.award("hide");
      if (event.kind === "menu.show" && this.objectives.has("hide")) this.award("show");
      return;
    }
    if (
      this.step.id !== "strike" ||
      this.setup ||
      event.origin !== "learner" ||
      event.startMs <= this.enteredAt ||
      event.kind !== "strike" ||
      !event.withdrawn ||
      event.targetId !== this.horn?.id
    )
      return;
    if (!this.approvedSticks.has(event.stickId)) return;
    this.award(this.objectives.has("first") ? "second" : "first");
  }
  sounding(c, state, now) {
    const h = state.raySqueezeInstrumentState;
    const freshTrigger = this.fresh.get(c)?.trigger && state.trigger;
    if (!freshTrigger || !h || !this.fixtures.owned.has(h.id)) {
      this.soundSince.delete(c);
      return [];
    }
    const chain = this.r.getTouchingInstrumentChain(h);
    if (
      !chain.every(
        (member) =>
          member.getProcessedLivePerformanceState().squeeze > 0.025 &&
          member.hasAudioVoice(this.r.getInstrumentVoiceId(this.r.getControllerVoiceId(c), member)),
      )
    )
      return [];
    const key = h.id + ":" + h.getLivePerformanceState().vowel;
    if (this.soundSince.get(c)?.key !== key) this.soundSince.set(c, { key, at: now });
    return now - this.soundSince.get(c).at >= this.thresholds.soundMs ? chain : [];
  }
  audioRunning() {
    return this.r.audioSystem.audioContextService?.context?.state === "running";
  }
  loopAudible(l) {
    if (!l?.transport.playing || l.transport.paused || !this.audioRunning()) return false;
    return l.tracks.some((track) => {
      const h = this.r.instrumentRegistry.get(track.connectedHonkId);
      if (!h || !(track.automationSnapshot?.squeeze > 0.025)) return false;
      return [...h.activeVoiceIds].some(
        (id) => String(id).includes("looper-" + l.id + ":") && h.hasAudioVoice(id),
      );
    });
  }
  sample(now) {
    if (this.finale) return;
    if (
      this.setup ||
      this.disposed ||
      this.host.navigation.screen ||
      (this.successAt !== null && !this.step.keepInteractive)
    )
      return;
    const id = this.step.id,
      horn = this.horn;
    const sounds = new Set();
    for (const [c, s] of this.r.controllerStates) {
      this.gate.observe(c, s);
      if (
        c.userData.virtualTutorial ||
        (c.userData.tutorialOrigin && c.userData.tutorialOrigin !== "learner")
      )
        continue;
      let fresh = this.fresh.get(c);
      if (!fresh) this.fresh.set(c, (fresh = {}));
      const chain = this.audioRunning() ? this.sounding(c, s, now) : [];
      for (const h of chain) sounds.add(h.id);
      if (chain.includes(horn)) {
        if (id === "honk") this.award("honk");
        if (["bend", "pitch"].includes(id) && s.trigger && fresh.trigger) {
          fresh.soundingBend ??= horn.getProcessedLivePerformanceState().bend;
          const delta = Math.abs(horn.getProcessedLivePerformanceState().bend - fresh.soundingBend);
          if (delta < 0.07) fresh.bendLatched = false;
          if (
            !fresh.bendLatched &&
            this.activeObjectives[0]?.startsWith("bend-") &&
            delta >= (id === "pitch" ? this.thresholds.pitchBend : this.thresholds.bend)
          ) {
            this.award(this.activeObjectives[0]);
            fresh.bendLatched = true;
          }
        }
        if (id === "vowels") {
          const objective = this.activeObjectives[0];
          if (objective?.split("-")[0] === horn.getLivePerformanceState().vowel)
            this.award(objective);
        }
        if (
          id === "chord" &&
          this.objectives.has("group") &&
          this.fixtures.honks.length === 3 &&
          this.fixtures.honks.every((h) => chain.includes(h))
        )
          this.award("play");
      }
      const grip = fresh.grip,
        target = s.gripInstrumentState;
      if (grip && s.gripHeld && target?.id === grip.id) {
        const moved = target.root.position.distanceTo(grip.position) >= this.thresholds.move;
        if (id === "move" && grip.sourceId === horn?.id) {
          if (target.root.position.distanceTo(grip.position) >= this.thresholds.movePractice)
            this.award("move");
          const distance = target.root
            .getWorldPosition(new Vector3())
            .distanceTo(this.r.getUserCamera().getWorldPosition(new Vector3()));
          if (this.objectives.has("move") && distance <= this.thresholds.reach)
            this.award("closer");
        }
        if (
          id === "rotate" &&
          grip.sourceId === horn?.id &&
          target.root.quaternion.angleTo(grip.quaternion) >= this.thresholds.rotation
        )
          this.award("rotate");
        if (id === "chord" && moved) this.chordMoved = true;
        if (
          id === "freeze" &&
          this.objectives.has("freeze") &&
          target.id === this.frozenId &&
          moved &&
          this.r.honkLockService.getGroup(this.frozenId)?.size === 3 &&
          grip.members?.every(
            ([memberId, start]) =>
              this.r.instrumentRegistry.get(memberId)?.root.position.distanceTo(start) >=
              this.thresholds.move * 0.8,
          )
        )
          this.award("move");
      }
    }
    // Evaluate two-handed gestures after collecting sound from BOTH hands.
    for (const [c, fresh] of this.fresh) {
      const s = this.r.controllerStates.get(c),
        interaction = s?.activeTriggerInteraction;
      if (!fresh.trigger || !s?.trigger || !interaction || interaction !== fresh.interaction)
        continue;
      const objective = this.activeObjectives[0];
      if (fresh.objective !== objective) {
        fresh.objective = objective;
        fresh.parameter = this.parameterValue(interaction);
      }
      const value = this.parameterValue(interaction),
        delta = value - fresh.parameter;
      if (["pitch", "volume"].includes(id) && !sounds.has(horn?.id)) {
        fresh.parameter = value;
        continue;
      }
      if (interaction.instrumentState === horn && interaction.dragType === "ear") {
        if (id === "ears") {
          const cue = BASICS_EARS[this.objectives.size];
          if (cue && interaction.side === cue.side && delta * cue.direction >= this.thresholds.ear)
            this.award(objective);
        }
        if (
          id === "pitch" &&
          objective?.startsWith("ear-") &&
          sounds.has(horn.id) &&
          delta * (objective.startsWith("ear-up-") ? 1 : -1) >= this.thresholds.ear
        )
          this.award(objective);
      }
      if (
        id === "volume" &&
        interaction.instrumentState === horn &&
        interaction.dragType === "nose" &&
        sounds.has(horn.id)
      ) {
        // The real nose mapping decreases gain as the nose is raised.
        const gainDelta = getHonkNoteGainFromNose(value) - getHonkNoteGainFromNose(fresh.parameter);
        if (objective?.startsWith("up-") && gainDelta <= -this.thresholds.volume)
          this.award(objective);
        if (objective?.startsWith("down-") && gainDelta >= this.thresholds.volume)
          this.award(objective);
      }
      if (
        id === "bpm" &&
        interaction.instrumentState === this.fixtures.get("metronome") &&
        interaction.type === "metronomeControlDrag" &&
        Math.abs(delta) >= this.thresholds.bpm &&
        !this.tempoChanged
      ) {
        this.tempoChanged = true;
        this.pulses = 0;
        this.lastPulse = interaction.instrumentState.lastEmittedBeatOrdinal;
      }
      if (interaction.looperState === this.looper && interaction.type === "looperControlDrag") {
        if (
          id === "length" &&
          interaction.control === "recordLength" &&
          value === 0 &&
          value !== fresh.parameter
        )
          this.award("length");
        if (id === "gap" && interaction.control === "gap") {
          if (objective === "gap" && delta >= 1) this.award("gap");
          if (objective === "zero" && value === 0 && delta < 0) this.award("zero");
        }
      }
    }
    const m = this.fixtures.get("metronome"),
      l = this.looper;
    if (
      id === "bpm" &&
      this.tempoChanged &&
      Math.abs(m.bpm - this.tempoBaseline) < this.thresholds.bpm
    ) {
      this.tempoChanged = false;
      this.pulses = 0;
    }
    if (
      m?.playing &&
      this.audioRunning() &&
      m.volume > 0 &&
      Number.isInteger(m.lastEmittedBeatOrdinal) &&
      m.lastEmittedBeatOrdinal !== this.lastPulse
    ) {
      this.lastPulse = m.lastEmittedBeatOrdinal;
      this.pulses++;
      if (id === "metronome" && this.metroStarted && this.pulses >= 2) this.award("pulse");
      if (id === "bpm" && this.tempoChanged && this.pulses >= 2) this.award("tempo");
    }
    if (id === "chord" && this.chordMoved && this.objectives.has("three")) {
      const members = this.r.chordFormationService.getFormationForHonk(horn.id)?.memberIds || [];
      if (members.length === 3 && this.fixtures.honks.every((h) => members.includes(h.id)))
        this.award("group");
    }
    if (this.wireChanged && l) {
      if (id === "wire-horn" && l.tracks.some((t) => t.connectedHonkId === horn?.id))
        this.award("wire");
      const connection = this.r.metronomeConnectionManager.getConnectionForTarget("looper", l.id);
      if (id === "wire-clock" && connection?.metronomeId === m?.id) this.award("wire");
      const first = this.fixtures.get("chordLooper");
      const firstConnection =
        first && this.r.metronomeConnectionManager.getConnectionForTarget("looper", first.id);
      if (
        id === "shared-clock" &&
        connection?.metronomeId === m?.id &&
        connection?.portId === firstConnection?.portId
      )
        this.award("wire");
    }
    if (["record", "second-record"].includes(id) && this.recordRequest?.id === l?.id) {
      if (l.transport.recording && sounds.has(horn?.id)) this.award("sound");
      if (
        this.objectives.has("sound") &&
        this.objectives.has("stopped") &&
        !l.transport.recording &&
        !l.transport.recordArmed &&
        l.timeline.hasRecording() &&
        l.looperData.takeRevision > this.recordRequest.revision &&
        l.looperData.recordingCompletion?.observedAtMs > this.enteredAt
      )
        this.award("recorded");
    }
    if (id === "playback" && this.playRequested.has(l?.id)) {
      if (this.loopAudible(l)) this.audibleLoops.add(l.id);
      const engine = l?.looperData.playbackEngine;
      const elapsed =
        engine?.clockElapsedMs ?? now - (l?.looperData.audioScheduling?.startWallMs ?? now);
      if (
        l?.transport.playing &&
        this.audibleLoops.has(l.id) &&
        elapsed >= l.timeline.recordedDurationMs
      )
        this.award("heard");
      // Clocked Pause takes effect on a beat, not necessarily on the button frame.
      if (
        this.pauseRequested &&
        this.objectives.has("heard") &&
        l.transport.paused &&
        l.timeline.hasRecording()
      )
        this.award("paused");
    }
    if (id === "switch") {
      const first = this.fixtures.get("chordLooper"),
        second = this.fixtures.get("alternativeLooper");
      if (this.playRequested.has(first?.id) && this.loopAudible(first)) this.award("first");
      if (
        this.objectives.has("first") &&
        this.playRequested.has(second?.id) &&
        second.looperData.queued
      )
        this.award("queued");
      if (this.objectives.has("queued") && !first.transport.playing && this.loopAudible(second))
        this.award("second");
    }
    if (
      this.step.objectives.length &&
      this.activeObjectives.length === 0 &&
      !this.visited &&
      this.successAt === null
    )
      this.complete(now);
  }
  complete(now) {
    this.completed.add(this.step.id);
    this.outcomes[this.step.id] = "passed";
    this.successAt = now;
    this.host.panel.completeEffect(now, true);
    this.persist();
    if (this.step.id === "big") {
      this.returnScale = { from: this.horn.baseScale, at: now };
      this.quiesce();
    }
    this.host.lastDraw = -Infinity;
  }
  update(now) {
    if (this.finale) return;
    if (this.setup || this.disposed) return;
    if (this.returnScale && this.horn) {
      const t = Math.min(1, (now - this.returnScale.at) / 750),
        ease = t * t * (3 - 2 * t);
      this.r.setInstrumentBaseScale(
        this.horn,
        this.returnScale.from + (INSTRUMENT_BASE_SCALE - this.returnScale.from) * ease,
      );
      if (t === 1) this.returnScale = null;
    }
    this.guidance.update(now);
    if (
      this.successAt !== null &&
      !this.step.keepInteractive &&
      now - this.successAt >= this.thresholds.successMs &&
      !this.host.navigation.screen
    ) {
      this.pending = this.enter(this.index + 1);
    }
  }
  progressText() {
    const id = this.step.id;
    if (id === "ears") {
      const cue = BASICS_EARS[this.objectives.size];
      return cue
        ? cue.name +
            " " +
            (cue.direction > 0 ? "↑ up" : "↓ down") +
            " · " +
            this.objectives.size +
            "/4"
        : "Both ears explored · 4/4";
    }
    if (id === "duplicate")
      return this.objectives.has("duplicate")
        ? "Copy created · Move it with Grip, release, then choose Continue"
        : "Hold Grip + A to make a copy";
    if (id === "move")
      return this.objectives.has("move")
        ? "Keep holding Grip · bring the horn within arm’s reach"
        : "Hold Grip · move the horn at least 45 cm in any direction";
    if (id === "finish")
      return this.objectives.has("show")
        ? "✓ Menu hidden and shown · Ready for free play"
        : this.objectives.has("hide")
          ? "Click the left joystick again to show the menu"
          : "Click the left joystick to hide the menu";
    if (id === "bend")
      return `${this.objectives.size}/3 bends · Return wrist to center between bends`;
    if (id === "vowels") {
      const round = Math.min(3, Math.floor(this.objectives.size / 5) + 1);
      return (
        `Round ${round}/3 · ` +
        BASICS_VOWELS.map((v) => (this.objectives.has(`${v}-${round}`) ? "✓ " : "○ ") + v).join(
          "   ",
        )
      );
    }
    if (id === "chord")
      return !this.objectives.has("three")
        ? "Horns: " + this.fixtures.honks.length + "/3"
        : !this.objectives.has("group")
          ? "Bring the horns together."
          : "Squeeze to play all three.";
    if (id === "volume") {
      const gain = getHonkNoteGainFromNose(this.horn?.getLivePerformanceState().nose ?? 0.5);
      return (
        (this.activeObjectives[0]?.startsWith("down-") ? "Nose ↓ down" : "Nose ↑ up") +
        ` · Round ${Math.min(3, Math.floor(this.objectives.size / 2) + 1)}/3` +
        " · Volume " +
        "▰".repeat(Math.round(gain * 8)) +
        "▱".repeat(8 - Math.round(gain * 8))
      );
    }
    if (["record", "second-record"].includes(id)) {
      const p = this.looper?.looperController.recording.getRecordingProgress(this.looper);
      if (p?.state === "armed") return "READY · Waiting for your first sound";
      if (p?.state === "recording")
        return "RECORDING · Play as long as you like · Press Stop when done";
      if (this.objectives.has("stopped")) return "Phrase saved";
    }
    if (id === "bpm")
      return (
        (this.fixtures.get("metronome")?.bpm || 80) +
        " BPM" +
        (this.tempoChanged ? " · Listen…" : "")
      );
    if (id === "length")
      return this.looper?.looperData.recordBeats === 0
        ? "Open length · Beats count up until you press Stop"
        : this.looper?.looperData.recordBeats + " beats · Pull the right handle fully down";
    if (["small", "big"].includes(id))
      return `${this.sizePushes}/7 pushes · Center the joystick between pushes`;
    if (id === "gap")
      return (
        (this.looper?.looperData.gapBeats || 0) +
        " gap beats · " +
        (this.objectives.has("gap") ? "Return to zero" : "Add a gap")
      );
    const next = {
      pitch:
        `Round ${Math.min(3, Math.floor(this.objectives.size / 3) + 1)}/3 · ` +
        (this.activeObjectives[0]?.startsWith("ear-")
          ? "Keep sounding · right ear " +
            (this.activeObjectives[0].startsWith("ear-up-") ? "↑ up" : "↓ down")
          : "Quick wrist bend · then return to center"),
      freeze: this.objectives.has("freeze")
        ? "Grip and move the frozen group"
        : "B · Freeze the chord",
      playback: this.objectives.has("paused")
        ? "Paused · Recording kept"
        : this.objectives.has("heard")
          ? "Press Pause"
          : "Press Play · listen to your phrase",
      switch: this.objectives.has("second")
        ? "Keep switching with Play · Choose Continue when ready"
        : this.objectives.has("queued")
          ? "QUEUED · Listen for the switch"
          : this.objectives.has("first")
            ? "Press Play on the second looper"
            : "Press Play on the first looper",
    }[id];
    return (
      next ||
      (this.step.objectives.length > 1
        ? this.objectives.size + "/" + this.step.objectives.length + " actions"
        : "")
    );
  }
  model() {
    const b = (id, label, disabled = false) => ({ id, label, disabled });
    const finished = this.step.id === "finish";
    const passed = this.completed.has(this.step.id);
    const required = this.guidance.target();
    const missing =
      !finished &&
      !["clear", "create"].includes(this.step.id) &&
      (!required ||
        required
          .getWorldPosition(this.guidance.scratch)
          .distanceTo(this.r.getUserCamera().getWorldPosition(this.guidance.eye)) > 2.8);
    return {
      visible: true,
      compact: true,
      title: this.step.title,
      instruction: this.step.instruction,
      progress: "BASICS · " + (this.index + 1) + "/" + BASICS_STEPS.length,
      feedback: this.setup
        ? "Preparing lesson…"
        : this.error ||
          (missing
            ? "Target missing or out of reach. Use Reset lesson."
            : this.successAt !== null
              ? this.step.keepInteractive
                ? this.progressText()
                : "✓ Completed"
              : (passed ? "✓ Completed · Review or choose Next.\n" : "") +
                this.progressText() +
                (this.help || finished ? "\n" + this.step.helper : "")),
      result: passed ? "passed" : null,
      navigation: [
        b("previous-step", "Back", this.index === 0 || this.setup),
        b(
          "next-step",
          this.step.keepInteractive && !finished ? "Continue" : "Next",
          !passed || finished || this.setup,
        ),
        b("step-help", this.help ? "Hide help" : "Help"),
        b("reset-lesson", "Reset lesson", this.setup),
      ],
      actions: [
        b("restart", finished ? "Replay" : "Restart", this.setup),
        b("recenter", "Recenter"),
        b("exit", finished ? "Free play" : "Exit"),
      ],
    };
  }
  dispose() {
    this.finale?.dispose();
    this.finale = null;
    if (this.disposed) return;
    this.disposed = true;
    this.successAt = null;
    this.returnScale = null;
    this.guidance.dispose();
    this.fixtures.dispose();
    this.fresh.clear();
    this.before.clear();
    this.host.panel.setCompact(false);
    this.host.panel.setTransport("");
  }
}
