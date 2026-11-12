const MELODY_HELP =
  "Aim at the Honk with the highlighted square and hold Trigger to play. The white circle marks the next note. Release Trigger to stop; hold Trigger and roll to bend. Backing parts are automatic.";

const RUNNING = new Set(["starting", "count-in", "performing"]);
export const PHONE_REMINDER =
  "Start your external phone video first. Its microphone must hear the headset speakers. The phone may keep recording across takes.";

// One serialized owner of the existing recorder. Generations cancel work across
// asynchronous receiver/audio readiness and across XR-origin interruptions.
export class SongRecordingSession {
  constructor({
    composition,
    createGuidance,
    recorder,
    ensemble,
    demonstration,
    ensureAudio,
    trackingReady,
    onExit,
    onChange = () => {},
    prepareLayout = () => {},
    guidedPlayOffsetMs = () => 0,
    now = () => performance.now(),
    uuid = () => crypto.randomUUID(),
  }) {
    this.composition = composition;
    this.bpm = composition.recording?.bpm ?? composition.bpm;
    this.beatMs = 60000 / this.bpm;
    this.createGuidance = createGuidance;
    Object.assign(this, {
      recorder,
      ensemble,
      demonstration,
      ensureAudio,
      trackingReady,
      onExit,
      prepareLayout,
      guidedPlayOffsetMs,
      now,
    });
    this.onChange = () => {
      this.ensemble.layoutFrame?.setEnabled(this.phase === "ready");
      onChange();
    };
    this.groupId = uuid();
    this.attempt = 0;
    this.generation = 0;
    this.phase = "unprepared";
    this.playback = "live";
    this.demonstrationFinished = false;
    this.feedback = "";
    this.transition = null;
    recorder.claim(this);
    this.changed = () => {
      if (this.phase === "saving" && !recorder.connected) this.cancelRestart = true;
      if (
        RUNNING.has(this.phase) &&
        (recorder.state === "stopping" || (recorder.active && !recorder.connected))
      )
        this.interrupt(recorder.stopReason || "receiver-disconnected");
      if (this.phase === "save-pending" && !recorder.pendingFinalization) {
        this.phase = "ready";
        this.feedback = this.savedMessage();
        this.onChange();
      }
    };
    recorder.addEventListener("change", this.changed);
  }
  captureCommand(id) {
    if (id === "capture-toggle") return this.action(RUNNING.has(this.phase) ? "stop" : "start");
    if (id === "capture-pose") this.recorder.markPose();
    // Sync belongs to the attempt; desktop/radial Mark Sync cannot duplicate it.
  }
  action(id) {
    if (
      this.disposed ||
      ![
        "prepare",
        "start",
        "demonstrate",
        "restart",
        "stop",
        "exit",
        "interrupt",
        "check-saving",
      ].includes(id)
    )
      return Promise.resolve();
    if (this.transition) {
      if (
        ["exit", "stop", "interrupt"].includes(id) &&
        RUNNING.has(this.phase) &&
        !this.pendingEnd
      ) {
        this.pendingEnd = id;
        this.generation++;
        this.ensemble.cancel();
        this.demonstration?.stop();
        this.recorder.audio.cancelCues();
        if (this.recorder.state === "preparing")
          this.recorder.stop(
            id === "interrupt" ? "performance-interruption" : "performance-cancelled",
            { tailMs: 0 },
          );
        return this.transition;
      }
      return this.transition;
    }
    if (["start", "demonstrate"].includes(id) && this.phase !== "ready") return Promise.resolve();
    if (id === "demonstrate" && !this.demonstration) return Promise.resolve();
    if (id === "restart" && !["count-in", "performing"].includes(this.phase))
      return Promise.resolve();
    const operation = async () => {
      try {
        if (id === "prepare") {
          this.phase = "preparing";
          this.onChange();
          if (!this.trackingReady())
            throw new Error("Enter XR with tracking, then choose Prepare ensemble.");
          await this.ensureAudio();
          this.ensemble.prepare({ bpm: this.bpm });
          this.prepareLayout();
          this.phase = "ready";
          this.feedback = "Ensemble ready. Adjust placement, then Start.";
        } else if (id === "start" || id === "demonstrate") {
          this.playback = id === "demonstrate" ? "demonstration" : "live";
          await this.begin();
        } else if (id === "check-saving") {
          this.phase = "saving";
          await this.recorder.waitForFinalization();
          this.phase = "ready";
          this.feedback = this.savedMessage();
        } else {
          this.cancelRestart = false;
          await this.end(
            id === "restart" ? "restarted" : id === "interrupt" ? "interrupted" : "stopped",
          );
          if (id === "restart" && !this.cancelRestart) await this.begin();
          if (id === "exit") await this.exit();
        }
      } catch (error) {
        this.generation++;
        this.ensemble.cancel();
        this.demonstration?.stop();
        this.recorder.audio.cancelCues();
        if (this.recorder.pendingFinalization) {
          this.phase = "save-pending";
          this.feedback = error.message;
          if (this.recorder.active)
            await this.recorder.stop("performance-interruption", {
              owner: this,
              tailMs: 0,
            });
        } else {
          this.phase = this.ensemble.prepared ? "ready" : "unprepared";
          this.feedback = error.message;
        }
      } finally {
        this.onChange();
      }
      // Cancellation requested during readiness runs only after that readiness
      // finishes; it cannot replace a worker still creating the earlier take.
      if (this.pendingEnd) {
        const next = this.pendingEnd;
        this.pendingEnd = null;
        await this.end(next === "interrupt" ? "interrupted" : "stopped");
        if (next === "exit") await this.exit();
      }
    };
    // Start on a microtask so the transition lock precedes synchronous callbacks.
    this.transition = Promise.resolve()
      .then(operation)
      .catch((error) => {
        this.phase = "save-pending";
        this.feedback = error.message;
        this.onChange();
      })
      .finally(() => {
        this.transition = null;
        this.onChange();
      });
    return this.transition;
  }
  async begin() {
    const token = ++this.generation;
    this.interruption = null;
    this.demonstrationFinished = false;
    this.phase = "starting";
    this.feedback = "Checking receiver, XR and audio…";
    this.onChange();
    this.ensemble.cancel();
    this.demonstration?.stop();
    this.ensemble.validate();
    if (!this.trackingReady())
      throw new Error("XR tracking is unavailable. Enter XR and try Start again.");
    await this.ensureAudio();
    if (token !== this.generation) return;
    const status = await this.recorder.readiness();
    if (token !== this.generation) return;
    if (!status.paired)
      throw new Error(
        "Use Mixed Reality Capture on the headset browser page to enter the existing receiver pairing code, then return to XR.",
      );
    if (!this.trackingReady())
      throw new Error("XR tracking was interrupted. Start again when tracking is available.");
    this.ensemble.validate();
    const attempt = ++this.attempt;
    if (this.playback === "demonstration") this.demonstration.start();
    await this.recorder.startReady({
      owner: this,
      includeUI: false,
      performance: {
        mode: "song-mixed-reality",
        playback: this.playback,
        compositionId: this.composition.id,
        compositionVersion: this.composition.contentVersion,
        compositionHash: this.composition.contentHash || null,
        bpm: this.bpm,
        sourceMidiHash: this.composition.source?.sha256 || null,
        arrangementProvenance: this.composition.arrangement?.provenance || null,
        arrangementId: this.composition.arrangement?.id || null,
        arrangementVersion: this.composition.arrangement?.version || null,
        groupId: this.groupId,
        attempt,
        label: `${this.composition.title} — ${this.playback === "demonstration" ? "Demo " : ""}Take ${String(attempt).padStart(2, "0")}`,
        completionAction: null,
        performanceStart: null,
      },
    });
    if (token !== this.generation) return;
    if (!this.trackingReady() || !this.recorder.connected)
      throw new Error("Tracking or receiver connection interrupted before count-in.");
    const cue = this.recorder.markSync(this);
    if (!cue) throw new Error("Capture is not ready for sync.");
    const audio = this.recorder.audio,
      audioNow = audio.context.currentTime,
      wallNow = this.now();
    const countContextTime = Math.max(cue.endContextTime + 0.12, audioNow + 0.1);
    const countAt = wallNow + (countContextTime - audioNow) * 1000,
      beatZero = countAt + 4 * this.beatMs;
    this.anchor = {
      token,
      countAt,
      beatZero,
      contextTime: countContextTime + (4 * this.beatMs) / 1000,
    };
    this.melodyGuide = this.createGuidance(beatZero);
    // Headset cues follow authored playback; clean capture still excludes UI.
    this.melodyGuide.mode = this.playback === "demonstration" ? "demonstration" : "practice";
    this.recorder.updatePerformance(
      {
        sync: cue,
        scheduledPerformanceStart:
          audio.mapping.sceneTime + this.anchor.contextTime - audio.mapping.contextTime,
      },
      "count-in",
    );
    audio.countIn(countContextTime, this.beatMs / 1000);
    this.ensemble.schedule({
      countAt,
      beatZero,
      wallNow,
      audioNow,
      bpm: this.bpm,
      origin: this.playback === "demonstration" ? "demonstration" : "performance",
    });
    this.phase = "count-in";
    if (this.playback === "demonstration")
      this.demonstration.schedule?.(
        (now) => this.melodyGuide.beatAt(now),
        (error) => this.interrupt(error.message),
      );
    this.lastFrame = wallNow;
    this.feedback = "Recording · Sync cue, then 4, 3, 2, 1.";
    this.onChange();
  }
  update(now = this.now()) {
    this.ensemble.layoutFrame?.update();
    try {
      this.ensemble.update?.(now);
      if (
        this.demonstrating &&
        !this.demonstrationFinished &&
        this.anchor?.token === this.generation
      )
        this.demonstration.update(now, this.melodyGuide.beatAt(now));
    } catch (error) {
      this.interrupt(error.message);
      return;
    }
    if (!["count-in", "performing"].includes(this.phase)) return;
    if (!this.trackingReady() || this.recorder.audio.context.state !== "running") {
      this.interrupt("tracking-or-audio-interruption");
      return;
    }
    this.lastFrame = now;
    if (this.anchor?.token !== this.generation) return;
    if (this.phase === "count-in" && now >= this.anchor.beatZero) {
      this.phase = "performing";
      this.ensemble.play();
      this.feedback = this.demonstrating
        ? "Recording the full demonstration. Press Stop Recording when you want to finish the take."
        : "Recording. Follow the highlighted squares; Stop Recording finishes the take.";
      const t =
        this.recorder.audio.mapping.sceneTime +
        this.anchor.contextTime -
        this.recorder.audio.mapping.contextTime;
      this.recorder.updatePerformance({ performanceStart: t }, "performance-start", t);
      this.onChange();
    }
    if (
      this.demonstrating &&
      !this.demonstrationFinished &&
      this.phase === "performing" &&
      this.melodyGuide.complete(now)
    ) {
      // End authored playback without ending capture; the player controls the tail.
      this.demonstrationFinished = true;
      this.demonstration.stop();
      this.ensemble.cancel();
      this.feedback = "Demonstration finished. Recording continues until you press Stop Recording.";
      this.onChange();
    }
  }
  interrupt(reason = "interrupted") {
    if (this.phase === "saving") {
      this.cancelRestart = true;
      return;
    }
    if (!RUNNING.has(this.phase)) return;
    this.interruption = reason;
    this.generation++;
    this.ensemble.cancel();
    this.demonstration?.stop();
    this.recorder.audio.cancelCues();
    this.recorder.updatePerformance({
      completionAction: "interrupted",
      interruption: reason,
    });
    return this.action("interrupt");
  }
  async end(completionAction) {
    ++this.generation;
    this.phase = "saving";
    this.feedback = "Saving…";
    this.onChange();
    this.recorder.audio.cancelCues();
    this.ensemble.cancel();
    this.demonstration?.stop();
    this.anchor = null;
    if (this.recorder.pendingFinalization)
      await this.recorder.stopAndFinalize({
        owner: this,
        completionAction,
        tailMs: this.composition.recording?.tailMs ?? 500,
        reason:
          completionAction === "interrupted"
            ? this.interruption || "performance-interruption"
            : "stop",
      });
    this.phase = this.ensemble.prepared ? "ready" : "unprepared";
    this.feedback = this.savedMessage();
  }
  savedMessage() {
    const saved = this.recorder.saved
      ? this.recorder.saved.complete
        ? "Take saved."
        : "Take saved with capture interruptions. Inspect gaps in the local editor."
      : "Ready.";
    return this.interruption
      ? `Playback interrupted: ${this.interruption}. ${saved} Start again when ready.`
      : saved;
  }
  async exit() {
    await this.onExit();
    this.disposed = true;
    this.recorder.removeEventListener("change", this.changed);
    this.recorder.release(this);
  }
  guidance(now = this.now()) {
    return !this.disposed &&
      !this.demonstrationFinished &&
      ["count-in", "performing"].includes(this.phase) &&
      this.anchor?.token === this.generation &&
      now >= this.anchor.countAt
      ? this.melodyGuide
      : null;
  }
  get demonstrating() {
    return this.playback === "demonstration" && RUNNING.has(this.phase);
  }
  model(now = this.now()) {
    const running = RUNNING.has(this.phase),
      saving = ["saving", "save-pending"].includes(this.phase);
    const button = (id, label, disabled = false) => ({
      id: `jog-record-${id}`,
      label,
      disabled,
    });
    const countdown =
      this.anchor && this.anchor.token === this.generation && now >= this.anchor.countAt
        ? Math.ceil((this.anchor.beatZero - now) / this.beatMs)
        : null;
    return {
      visible: true,
      title: `${this.composition.title} · ${this.composition.arrangement?.title || "Mixed reality"}`,
      progress: this.attempt
        ? `${this.composition.title} — TAKE ${String(this.attempt).padStart(2, "0")}`
        : `${this.composition.title} · ${this.bpm} BPM`,
      instruction:
        this.phase === "performing" && this.demonstrationFinished
          ? "Press Stop Recording when you are ready to end this take."
          : PHONE_REMINDER,
      feedback:
        (this.phase === "starting" && this.recorder.state === "preparing"
          ? this.recorder.message
          : this.feedback) +
        (this.phase === "ready"
          ? `\n\n${this.ensemble.layoutFrame ? "Hold Grip on the blue Melody frame to move and rotate the horns. Drag an orange corner to resize; Reset restores the default layout.\n\n" : ""}${this.composition.recording?.instructions || MELODY_HELP}`
          : ""),
      transport:
        this.phase === "count-in"
          ? countdown === null
            ? "Sync…"
            : countdown > 0
              ? String(countdown)
              : "Play"
          : this.phase === "performing"
            ? this.demonstrationFinished
              ? "Recording · Demonstration complete"
              : "Play · Recording"
            : this.phase === "saving"
              ? "Saving…"
              : "",
      ...this.guidance(now)?.model(now),
      ...(this.guidance(now)
        ? {
            instruction: this.guidance(now).model(now + (this.guidedPlayOffsetMs?.() || 0))
              .instruction,
          }
        : {}),
      actions: running
        ? [
            button("restart", "Restart Recording", this.phase === "starting"),
            button("stop", "Stop Recording"),
            button("exit", "Exit"),
          ]
        : saving
          ? [
              button("check-saving", "Check saving", this.phase === "saving"),
              button("exit", "Exit", this.phase === "saving"),
            ]
          : [
              button(
                this.ensemble.prepared ? "start" : "prepare",
                this.ensemble.prepared ? "Start" : "Prepare ensemble",
                Boolean(this.transition),
              ),
              ...(this.ensemble.prepared && this.demonstration
                ? [button("demonstrate", "Demonstrate", Boolean(this.transition))]
                : []),
              ...(this.ensemble.prepared && this.feedback.includes("Repair")
                ? [button("prepare", "Prepare ensemble")]
                : []),
              button("exit", "Exit", Boolean(this.transition)),
            ],
    };
  }
}
