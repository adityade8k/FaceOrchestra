import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from "three";

// Two ordinary controller rays, not a second sound path. Hand identity is a
// teaching suggestion only; note assessment never checks the controller ID.
export class RishteHands {
  constructor(ensemble) {
    this.ensemble = ensemble; this.a = ensemble.a; this.r = ensemble.r;
    this.notes = {}; this.labels = new Map(); this.offset = new Vector3();
    for (const recipe of ensemble.definition.arrangement.recipes.filter(r => r.hand)) {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 96;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = recipe.hand === "R" ? "#153f36" : "#58381d"; ctx.fillRect(0, 0, 96, 96);
      ctx.fillStyle = recipe.hand === "R" ? "#73e0c1" : "#ffb45c";
      ctx.font = "bold 72px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(recipe.hand, 48, 51);
      const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
      const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }));
      sprite.name = `Suggested ${recipe.hand} hand: ${recipe.role}`;
      sprite.userData.tutorialBillboard = true; sprite.raycast = () => {}; sprite.scale.set(.055, .055, 1); sprite.renderOrder = 101;
      this.r.scene.add(sprite); this.labels.set(recipe.role, sprite);
    }
  }
  trigger(hand, role, active, now) {
    const controller = this.a.virtuals[hand === "R" ? 0 : 1];
    if (!active) { this.a.input(controller, "trigger", false, now); this.a.park(controller); return; }
    const h = this.a.get(role), state = this.r.controllerStates.get(controller);
    if (!h?.isPlayable()) throw new Error(`Missing melody target ${role}`);
    if (!state.trigger) {
      controller.position.copy(h.getSqueezeColliderSphere().center); controller.position.z += .38;
      controller.quaternion.identity(); controller.updateMatrixWorld(true);
      if (this.r.getCurrentHit(controller)?.object !== h.squeezeCollider) throw new Error(`Cannot select ${role}; move it clear of other controls.`);
      this.a.input(controller, "trigger", true, now);
    }
  }
  play(events, beat, now, { swapHands = false } = {}) {
    const next = Object.fromEntries(["R", "L"].map(hand => [hand, events.find(e => e.hand === hand && beat >= e.beat && beat < e.beat + e.beats)]));
    let released = false;
    for (const hand of ["R", "L"]) if (next[hand]?.id !== this.notes[hand]) {
      this.trigger(swapHands ? hand === "R" ? "L" : "R" : hand, null, false, now); released = true;
    }
    if (released) { this.r.updateHorn(now); this.a.observe(now); }
    // Preserve attack order when two near-simultaneous MIDI notes become due
    // in the same animation frame, regardless of which hand plays first.
    for (const hand of ["R", "L"].sort((a, b) => (next[a]?.beat ?? Infinity) - (next[b]?.beat ?? Infinity))) {
      const changed = next[hand]?.id !== this.notes[hand];
      this.notes[hand] = next[hand]?.id;
      if (next[hand]) {
        this.trigger(swapHands ? hand === "R" ? "L" : "R" : hand, next[hand].role, true, now);
        if (changed) this.r.updateHorn(now);
      }
    }
  }
  update(events = null, beat = 0) {
    for (const [role, sprite] of this.labels) {
      const h = this.a.get(role), upcoming = events?.some(e => e.role === role && beat >= e.beat - 1 && beat < e.beat + e.beats);
      sprite.visible = Boolean(h?.root.visible);
      if (!sprite.visible) continue;
      const sphere = h.getSqueezeColliderSphere();
      this.offset.set(.07, .07, 0).applyQuaternion(this.a.layoutRotation);
      sprite.position.copy(sphere.center).add(this.offset);
      sprite.material.opacity = !events || upcoming ? 1 : .35;
      sprite.scale.setScalar(upcoming ? .07 : .055);
    }
  }
  release() {
    for (const hand of ["R", "L"]) this.trigger(hand, null, false, performance.now());
    this.notes = {};
  }
  dispose() {
    this.release();
    for (const sprite of this.labels.values()) { sprite.removeFromParent(); sprite.material.map.dispose(); sprite.material.dispose(); }
    this.labels.clear();
  }
}
