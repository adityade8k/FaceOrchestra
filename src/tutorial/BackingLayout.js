import { InstrumentLayoutFrame } from "./InstrumentLayoutFrame.js";

// Instruments and wires keep their existing scene, registry and transport owners.
export class BackingLayout {
  constructor(host, frameOptions = {}) {
    this.host = host;
    this.frameOptions = frameOptions;
    this.frame = null;
    this.owner = null;
  }
  selection() {
    const t = this.host;
    const owner = t.dataTutorial || t.recording.session || t.session;
    if (!owner || (t.basics && !t.basics.finale)) return { owner: null, members: [] };
    const ensemble = owner.ensemble;
    const definition = owner.definition || owner.composition;
    const ids = new Set();
    const addRole = (role) => {
      for (const id of t.adapter.roles.get(role) || []) ids.add(id);
    };
    if (definition?.score.events) {
      const melody = new Set(definition.score.events.map((event) => event.role));
      const fullPalette = definition.playback === "honk-live-two-hand-v1";
      for (const recipe of definition.arrangement.recipes)
        if (
          recipe.kind !== "honk" ||
          (!fullPalette && recipe.part !== "melody" && !melody.has(recipe.role))
        )
          addRole(recipe.role);
      for (const looper of ensemble.loopers || []) ids.add(looper.id);
    } else {
      for (const role of t.adapter.roles.keys())
        if (
          role === "metronome" ||
          role === "percussion" ||
          role.endsWith("Looper") ||
          role.startsWith("group-")
        )
          addRole(role);
    }
    const members = [...ids]
      .map((id) => t.r.instrumentRegistry.get(id))
      .filter((h) => h && !h.disposed && !h.pendingPlacement);
    return { owner, members: members.some((h) => h.kind !== "metronome") ? members : [] };
  }
  update() {
    const t = this.host;
    const owner = t.dataTutorial || t.recording.session || t.session;
    if (owner !== this.owner) {
      this.dispose();
      this.owner = owner;
    }
    const view = t.r.instrumentRegistry.getInstrumentStates?.();
    const preview = t.r.spawn?.pendingSpawnPlacement;
    if (
      !view ||
      view !== this.view ||
      this.roleCount !== t.adapter.roles.size ||
      this.preview !== preview
    ) {
      this.view = view;
      this.roleCount = t.adapter.roles.size;
      this.preview = preview;
      this.refresh(this.selection().members);
    }
    const running = Boolean(
      t.busy ||
      t.demo ||
      t.dataTutorial?.phase ||
      ["starting", "count-in", "performing", "saving", "save-pending"].includes(
        t.recording.session?.phase,
      ) ||
      (t.session && (t.session.mode === "simulation" || t.session.phase === "practicing")),
    );
    this.frame?.setEnabled(!running);
  }
  refresh(members) {
    if (!members.length) {
      this.frame?.dispose();
      this.frame = null;
      return;
    }
    const recipes = members.map((h) => ({ role: h.id }));
    if (!this.frame) {
      this.frame = new InstrumentLayoutFrame(
        { host: this.host, r: this.host.r, a: this.host.adapter },
        {
          title: "Backing",
          recipes,
          resolveMember: (recipe) => this.host.r.instrumentRegistry.get(recipe.role),
          ...this.frameOptions,
        },
      );
    } else if (
      members.length !== this.frame.poses.length ||
      members.some((h, i) => this.frame.poses[i].h !== h)
    )
      this.frame.refreshMembers(recipes);
  }
  placeCreated(ensemble, instrument) {
    if (this.owner?.ensemble === ensemble) this.frame?.placeCreated(instrument);
  }
  dispose() {
    this.frame?.dispose();
    this.frame = null;
    this.owner = null;
    this.view = null;
  }
}
