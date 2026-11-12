import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Path,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
} from "three";

export const NOTE_SQUARE_SIZE = 0.055;
export const NOTE_SQUARE_REST_SCALE = 0.8;
export const NOTE_SQUARE_OPACITY = 0.25;

// Use score time, not frame history: repeats remain readable after scrubbing,
// tempo changes and guided-play offsets, including attacks with no release gap.
export function noteSquareScale(event, beat, beatMs) {
  if (!event || !Number.isFinite(beat) || !(event.beats > 0) || !(beatMs > 0)) return 1;
  const attack = Math.min(80 / beatMs, event.beats / 3);
  const release = Math.min(60 / beatMs, event.beats / 3);
  const phase = Math.max(
    0,
    Math.min(1, (beat - event.beat) / attack, (event.beat + event.beats - beat) / release),
  );
  const smooth = phase * phase * (3 - 2 * phase);
  return NOTE_SQUARE_REST_SCALE + (1 - NOTE_SQUARE_REST_SCALE) * smooth;
}

export function createNoteSquare(name = "Tutorial note square") {
  const material = () =>
    new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: NOTE_SQUARE_OPACITY,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    });
  const square = new Mesh(new PlaneGeometry(1, 1), material());
  const shape = new Shape();
  shape.moveTo(-0.5, -0.5);
  shape.lineTo(0.5, -0.5);
  shape.lineTo(0.5, 0.5);
  shape.lineTo(-0.5, 0.5);
  shape.closePath();
  const hole = new Path();
  hole.moveTo(-0.455, -0.455);
  hole.lineTo(-0.455, 0.455);
  hole.lineTo(0.455, 0.455);
  hole.lineTo(0.455, -0.455);
  hole.closePath();
  shape.holes.push(hole);
  const outline = new Mesh(new ShapeGeometry(shape), material());
  square.name = name;
  outline.name = `${name} outline`;
  for (const mesh of [square, outline]) {
    mesh.raycast = () => {};
    mesh.renderOrder = 101;
  }
  square.add(outline);
  square.userData.tutorialBillboard = true;
  setNoteSquare(square, false);
  return square;
}

export function setNoteSquare(square, active) {
  square.material.opacity = active ? 1 : 0;
  // The solid active square replaces the faint inactive outline.
  square.children[0].visible = !active;
  square.userData.activeNote = Boolean(active);
}

export function disposeNoteSquare(square) {
  square.removeFromParent();
  square.traverse((mesh) => {
    mesh.geometry?.dispose();
    mesh.material?.dispose();
  });
}
