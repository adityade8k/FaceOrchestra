export async function validate() {
  const { r, t, d, check, wait, layoutBefore } = window.__rishte;
  const { Group, Vector3 } = await import("three");
  const f = d.ensemble.layoutFrame, a = t.adapter;
  check(f?.members.length === 22 && f.root.visible, "Melody frame missing");
  check(f.root.position.distanceTo(f.home) > .05, "Mouse drag did not move the frame");
  check(f.scale > 1.1 && f.scale < 1.3, "Corner drag did not resize the frame: " + f.scale);
  const mouseScale = f.scale;
  const unchangedBacking = () => layoutBefore.filter(p => !p.role.startsWith("lead-")).every(p => {
    const h = a.get(p.role);
    return h.root.position.distanceTo(new Vector3(...p.position)) < 1e-8 && h.baseScale === p.scale;
  });
  check(unchangedBacking(), "Placement moved backing instruments");
  for (const { h, offset, scale } of f.poses) {
    const expected = offset.clone().multiplyScalar(f.scale).add(f.root.position);
    check(h.root.position.distanceTo(expected) < 1e-8, "Hidden or visible target lost its place");
    check(Math.abs(h.baseScale - scale * f.scale) < 1e-8, "Target size differs from frame scale");
  }
  const controller = new Group(); controller.userData.handedness = "right"; r.scene.add(controller);
  r.interactionCoordinator.registerController(controller);
  const input = (button, pressed) => r.interactionCoordinator.receiveInput({ type: "button.transition", controller,
    controllerId: "layout-test", handedness: "right", button, pressed, timestamp: performance.now() });
  try {
    controller.position.copy(f.moveHandle.getWorldPosition(new Vector3())).add(new Vector3(0, 0, .5));
    input("grip", true);
    check(f.drag?.controller === controller, "XR Grip missed the frame");
    const previous = f.root.position.clone(); controller.position.x += .08; controller.position.y += .04;
    f.update(); check(f.root.position.distanceTo(previous.clone().add(new Vector3(.08, .04, 0))) < 1e-8, "XR drag position");
    r.interactionCoordinator.receiveInput({ type: "axis.step", axis: "thumbstickX", direction: 1, controller });
    check(Math.abs(f.scale - mouseScale - .1) < 1e-8, "XR scale step");
    input("grip", false); check(!f.drag && !f.blocked.size, "Grip release did not place frame");
    check(r.instrumentRegistry.getByKind("honk").every(h => !h.activeVoiceIds.size), "Moving the frame played notes");
    // Exercise the accessible desktop size control, including its lower limit.
    f.slider.value = "60"; f.slider.dispatchEvent(new Event("input", { bubbles: true }));
    check(f.scale === .6, "Size slider minimum");
    f.slider.value = "130"; f.slider.dispatchEvent(new Event("input", { bubbles: true }));
    check(f.scale === 1.3, "Size slider");
    // Every later phrase must remain selectable at both scale limits.
    d.ensemble.showMelody();
    for (const size of [.6, 1.3, 2]) {
      f.apply(f.root.position, size);
      for (const h of f.members) {
        controller.position.copy(h.getSqueezeColliderSphere().center).add(new Vector3(0, 0, .38));
        controller.updateMatrixWorld(true);
        check(r.getCurrentHit(controller)?.object === h.squeezeCollider, "Unreachable target at size " + size);
      }
    }
    f.apply(f.root.position, 1.3);
    d.ensemble.showMelody(d.step.startBeat, d.step.endBeat);
    const placed = f.root.position.clone(), scale = f.scale;
    await t.action("next-step"); await t.action("previous-step");
    check(f.scale === scale && f.root.position.distanceTo(placed) < 1e-8, "Navigation lost placement");
    d.index = 0; d.cancel();
    await t.action("rishte-preview"); check(!f.root.visible && f.controls.hidden, "Frame did not hide for preview");
    check(!f.apply(f.home, 1), "Playback allowed a layout change");
    await wait(6500);
    check(d.phase === "demo", "Moved preview failed: " + d.feedback);
    const circles = t.cues.pool.filter(p => p.yellow.visible);
    check(circles.length > 0, "No timing cue after placement");
    for (const pair of circles) check(pair.yellow.position.distanceTo(a.get(pair.yellow.userData.role).getSqueezeColliderSphere().center) < 1e-8, "Timing cue did not follow moved target");
    await t.action("rishte-stop"); await wait(500);
    check(f.root.visible && !f.controls.hidden && f.scale === scale && f.root.position.distanceTo(placed) < 1e-8, "Stop lost chosen placement");
    check(unchangedBacking(), "Backing changed after positioned preview");
    // Check reset, then restore this placement for the full learner regression.
    f.reset(); check(f.scale === 1 && f.root.position.distanceTo(f.home) < 1e-8, "Reset layout");
    f.apply(placed, scale);
    return { melodyTargets: f.members.length, hiddenTargetsMoved: true, desktopDrag: true, cornerResize: true,
      mouseScale, xrGripDrag: true, xrThumbstickResize: true, scaleLimits: [f.minScale, f.maxScale],
      preservedAcrossPhrasesAndStop: true, fixedDuringPlayback: true, cuesFollowTargets: true,
      backingUnchanged: true, reset: true, learnerRegressionScale: scale };
  } finally {
    input("trigger", false); input("grip", false);
    r.controllerStates.delete(controller); controller.removeFromParent();
  }
}
