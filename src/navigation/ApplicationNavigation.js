import { compositionRegistry } from "../compositions/CompositionRegistry.js";
import { ApplicationModeRouter } from "./ApplicationModeRouter.js";
import { MenuController } from "./MenuController.js";
import { BasicsTutorial } from "../tutorial/BasicsTutorial.js";

export class ApplicationNavigation {
  constructor(host) {
    this.host = host;
    this.screen = "launch";
    this.libraryPage = 0;
    this.catalog = compositionRegistry;
    this.freePlayScene = null;
  }
  initialize() {
    this.menu = new MenuController({
      panel: this.host.panel,
      states: this.host.r.controllerStates,
      hit: (c) => this.host.nearestPanelHit(c, this.host.r.raycastSystem.getCurrentHit(c)),
      quiesce: (c) => {
        this.host.r.clearControllerTriggerInteraction(this.host.r.controllerStates.get(c));
        this.host.r.handleGripEndIntent(c);
        this.host.r.spawn.closeRadialMenu(c);
        if (this.host.r.controllerStates.get(c)?.stickActive) this.host.r.deactivateStick(c);
      },
      onEvent: (kind, intent) =>
        this.host.basics?.accept({
          kind,
          origin: "learner",
          intent,
          startMs: intent?.timestamp,
        }),
    });
    this.router = new ApplicationModeRouter({
      checkpoint: async () => {
        if (!["play", "launch"].includes(this.host.r.sessionMode)) return;
        this.host.flow.cancelOutgoing();
        this.freePlayScene = this.host.r.sceneSerializer.serialize();
        if (
          !this.host.r.debugMode &&
          !(await this.host.r.scenePersistence.checkpoint({ force: true }))
        )
          throw new Error(
            "Play checkpoint failed. Your scene remains open; free storage or enable site storage, then Retry.",
          );
      },
      quiesce: () => {
        this.menu.cancelDrag();
        for (const [c, s] of this.host.r.controllerStates)
          if (s.trigger || s.grip || s.primary || s.secondary) this.menu.blocked.add(c);
      },
      rollback: async () => {
        if (this.freePlayScene) await this.enterPlay();
      },
      onChange: (state) => {
        this.navigationStatus = state;
        this.host.panels.render(performance.now());
      },
    });
    this.toolbar = document.createElement("nav");
    this.toolbar.className = "orchestra-utilities";
    for (const [id, label] of [
      ["menu-toggle", "Menu"],
      ["menu-home", "Home"],
      ["recenter", "Recenter"],
    ]) {
      const b = document.createElement("button");
      b.textContent = label;
      b.onclick = () => this.host.action(id);
      this.toolbar.append(b);
    }
    const editor = document.createElement("a");
    editor.href = "/capture/";
    editor.target = "_blank";
    editor.rel = "noopener";
    editor.textContent = "Open Editor";
    this.toolbar.append(editor);
    document.body.append(this.toolbar);
    this.keydown = (e) => {
      if (
        e.key.toLowerCase() === "m" &&
        !e.repeat &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.target.isContentEditable &&
        !e.target.closest?.('input,textarea,select,[contenteditable="true"]')
      ) {
        e.preventDefault();
        this.menu.toggle();
      }
    };
    document.addEventListener("keydown", this.keydown);
    for (const c of this.host.r.controllers)
      c.addEventListener("disconnected", () => this.menu.disconnect(c));
  }
  handles(id) {
    return (
      [
        "guided-play-settings",
        "guided-offset-back",
        "menu-toggle",
        "menu-home",
        "recenter",
        "tutorials",
        "record-songs",
        "back",
        "library-prev",
        "library-next",
        "resume-mode",
        "retry-load",
        "retry-options",
        "composition-start",
        "composition-quick-practice",
        "basics",
        "play",
        "exit",
        "jog-record-exit",
      ].includes(id) ||
      ["guided-offset:", "arrangement:", "composition:"].some((prefix) => id.startsWith(prefix))
    );
  }
  async action(id) {
    if (id === "guided-play-settings") {
      this.offsetReturnScreen = this.screen || "tutorials";
      this.screen = "guided-play-settings";
      this.host.panels.render(performance.now());
      return;
    }
    if (id === "guided-offset-back") {
      this.screen = this.offsetReturnScreen || "tutorials";
      this.host.panels.render(performance.now());
      return;
    }
    if (id.startsWith("guided-offset:")) {
      if (!this.host.guidedPlayRunning()) {
        const value = id.slice("guided-offset:".length);
        this.host.guidedPlayOffset.set(
          value === "reset" ? 0 : this.host.guidedPlayOffset.milliseconds + Number(value),
        );
      }
      this.host.panels.render(performance.now());
      return;
    }
    if (id === "menu-toggle") {
      this.menu.toggle();
      return;
    }
    if (id === "menu-home") {
      this.selectionGeneration = (this.selectionGeneration || 0) + 1;
      this.screen = "launch";
      this.menu.setVisible(true);
      this.host.panels.render(performance.now());
      return;
    }
    if (id === "recenter") {
      this.menu.recenter(this.host.r.getUserCamera());
      this.host.basics?.recenter();
      return;
    }
    if (["tutorials", "record-songs", "back", "library-prev", "library-next"].includes(id)) {
      this.selectionGeneration = (this.selectionGeneration || 0) + 1;
      if (id === "back")
        this.screen =
          this.screen === "composition-options"
            ? this.compositionOptions?.library || "tutorials"
            : "launch";
      else if (id === "library-prev") this.libraryPage--;
      else if (id === "library-next") this.libraryPage++;
      else {
        this.screen = id === "record-songs" ? "record-songs" : "tutorials";
        this.libraryPage = 0;
      }
      this.host.panels.render(performance.now());
      return;
    }
    if (id === "resume-mode") {
      this.screen = null;
      this.host.panels.render(performance.now());
      return;
    }
    if (id === "retry-load" && this.lastSelection)
      return this.selectComposition(...this.lastSelection);
    if (id === "retry-options" && this.compositionOptions)
      return this.openCompositionOptions(
        this.compositionOptions.id,
        this.compositionOptions.library,
      );
    if (id.startsWith("arrangement:") && this.compositionOptions?.module) {
      const choice = id.slice(12);
      if (this.compositionOptions.module.arrangements.some((a) => a.id === choice))
        this.compositionOptions.arrangementId = choice;
      this.host.panels.render(performance.now());
      return;
    }
    if (
      ["composition-start", "composition-quick-practice"].includes(id) &&
      this.compositionOptions?.module
    ) {
      const { id: compositionId, library, arrangementId } = this.compositionOptions;
      if (id === "composition-quick-practice") {
        if (this.quickEntryPending) return;
        this.quickEntryPending = true;
        try {
          return await this.selectComposition(compositionId, library, arrangementId, {
            quick: true,
          });
        } finally {
          this.quickEntryPending = false;
        }
      }
      return this.selectComposition(compositionId, library, arrangementId);
    }
    if (id.startsWith("composition:"))
      return this.openCompositionOptions(id.slice(12), this.screen);
    if (id === "basics") return this.selectComposition("basics", "tutorials");
    if (["play", "exit", "jog-record-exit"].includes(id) && this.router) {
      try {
        await this.router.enter(
          "play",
          async () => null,
          () => this.enterPlay(),
        );
        this.screen = null;
      } catch (error) {
        this.host.uiFeedback = error.message;
      }
      this.host.panels.render(performance.now());
      return;
    }
  }
  async openCompositionOptions(id, library) {
    const generation = (this.selectionGeneration = (this.selectionGeneration || 0) + 1);
    this.compositionOptions = { id, library };
    this.screen = "composition-options";
    this.optionsError = "";
    this.host.panels.render(performance.now());
    try {
      const module = await this.catalog.load(id);
      if (this.host.disposed || generation !== this.selectionGeneration) return;
      if (!module.arrangements?.length) return this.selectComposition(id, library);
      this.compositionOptions = {
        id,
        library,
        module,
        arrangementId: module.defaultArrangement,
      };
    } catch (error) {
      if (generation !== this.selectionGeneration || this.host.disposed) return;
      this.optionsError = error.message;
    }
    this.host.panels.render(performance.now());
  }
  async selectComposition(id, library, arrangementId, { quick = false } = {}) {
    const generation = (this.selectionGeneration = (this.selectionGeneration || 0) + 1);
    this.lastSelection = [id, library, arrangementId];
    try {
      await this.router.enter(
        `${library}:${id}`,
        async (signal) => {
          if (id === "basics") return null;
          const module = await this.catalog.load(id, { signal });
          if (quick && generation !== this.selectionGeneration)
            throw new DOMException("Preparation cancelled", "AbortError");
          const selected = module.selectArrangement
            ? await module.selectArrangement(arrangementId || module.defaultArrangement)
            : module;
          if (quick) {
            await this.host.r.audioSystem.ensureAudio();
            if (generation !== this.selectionGeneration)
              throw new DOMException("Preparation cancelled", "AbortError");
          }
          return selected;
        },
        async (module) => {
          if (quick && generation !== this.selectionGeneration)
            throw new DOMException("Preparation cancelled", "AbortError");
          if (
            this.host.session ||
            this.host.basics ||
            this.host.dataTutorial ||
            this.host.recording.session
          )
            await this.enterPlay();
          await this.host.r.audioSystem.ensureAudio();
          if (quick && generation !== this.selectionGeneration)
            throw new DOMException("Preparation cancelled", "AbortError");
          this.screen = null;
          if (id === "basics") {
            this.freePlayScene ??= this.host.r.sceneSerializer.serialize();
            this.host.adapter.clear();
            this.host.adapter.begin("learner");
            this.host.basics = new BasicsTutorial(this.host);
            this.host.r.sessionMode = "basics";
          } else if (library === "record-songs") await this.host.recording.enter(module);
          else {
            await module.enterTutorial(this.host);
            if (quick && this.host.dataTutorial) {
              this.host.dataTutorial.index = this.host.dataTutorial.definition.lessons.findIndex(
                (lesson) => lesson.completePerformance,
              );
              await this.host.dataTutorial.action("step-practice");
            }
          }
        },
      );
    } catch (error) {
      if (quick && error.name === "AbortError") return;
      this.host.uiFeedback = error.message;
      this.screen = library;
    }
    this.host.panels.render(performance.now());
  }
  async enterPlay() {
    if (this.host.recording.session && !this.host.recording.session.restoring) {
      const mode = this.host.recording.session;
      await mode.transition;
      if (mode.disposed) return;
      await mode.action("exit");
      if (!mode.disposed)
        throw new Error(mode.feedback || "Recording finalization is still pending.");
      return;
    }
    this.host.flow.cancelOutgoing();
    await this.host.basics?.cancelDemo();
    this.host.dataTutorial?.dispose();
    this.host.dataTutorial = null;
    this.host.basics?.dispose();
    this.host.basics = null;
    this.host.busy = true;
    this.host.r.sessionMode = "transition";
    try {
      this.host.conductor?.stop();
      this.host.conductor = null;
      this.host.stopDemo();
      if (this.host.session?.mode === "practice")
        this.host.practiceProgress = this.host.session.exportProgress();
      if (this.host.session?.mode === "simulation")
        this.host.simulationProgress = this.host.session.exportProgress();
      this.host.session = null;
      if (this.freePlayScene) {
        this.host.adapter.clear();
        const restored = await this.host.r.sceneRestorer.restore(this.freePlayScene);
        if (restored.skipped.length) {
          this.host.recoveryScene = structuredClone(this.freePlayScene);
          this.host.r.scenePersistence.restoreReport = restored;
          this.host.r.showRuntimeFeedback(
            `Scene recovery: ${restored.skipped.length} skipped objects, ${restored.skippedConnections?.length || 0} affected clock connections. Original preserved.`,
          );
        }
        this.freePlayScene = null;
      }

      this.host.r.sessionMode = "play";
      if (this.router) this.router.identity = "play";
      this.host.screen = "play";
      this.host.r.instructionPanelClosed = true;
      this.host.r.hideInstructionPanel();
      this.screen = null;
      this.host.panels.render(performance.now());
    } catch (error) {
      this.host.uiFeedback = error.message;
      this.host.panels.render(performance.now());
      throw error;
    } finally {
      this.host.busy = false;
    }
  }
  dispose() {
    this.router?.dispose();
    this.toolbar?.remove();
    document.removeEventListener("keydown", this.keydown);
  }
}
