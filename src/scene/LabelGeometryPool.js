import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Geometry is immutable and shared; each label retains its own material so
// lesson opacity/color changes cannot alter another instrument's label.
export class LabelGeometryPool {
  constructor() {
    this.fonts = new Map();
    this.entries = new Map();
  }
  acquire(font, text, settings) {
    let labels = this.fonts.get(font);
    if (!labels) this.fonts.set(font, (labels = new Map()));
    const key = JSON.stringify([text, settings.size, settings.depth, settings.curveSegments]);
    let entry = labels.get(key);
    if (!entry) {
      const lines = text.split("\n");
      const rows = lines.map((line, index) => {
        const row = new TextGeometry(line, {
          font,
          size: settings.size,
          depth: settings.depth,
          curveSegments: settings.curveSegments,
        });
        row.computeBoundingBox();
        const bounds = row.boundingBox;
        if (bounds)
          row.translate(
            -(bounds.min.x + bounds.max.x) / 2,
            -(bounds.min.y + bounds.max.y) / 2 + (lines.length - index - 1) * settings.size * 1.4,
            0,
          );
        return row;
      });
      const geometry = rows.length === 1 ? rows[0] : mergeGeometries(rows);
      if (rows.length > 1) for (const row of rows) row.dispose();
      geometry.computeBoundingBox();
      entry = { geometry, references: 0, font, key };
      labels.set(key, entry);
      this.entries.set(geometry, entry);
    }
    entry.references++;
    return entry.geometry;
  }
  release(geometry) {
    const entry = this.entries.get(geometry);
    if (!entry) return;
    if (--entry.references > 0) return;
    entry.geometry.dispose();
    this.entries.delete(geometry);
    const labels = this.fonts.get(entry.font);
    labels.delete(entry.key);
    if (!labels.size) this.fonts.delete(entry.font);
  }
  dispose() {
    for (const { geometry } of this.entries.values()) geometry.dispose();
    this.entries.clear();
    this.fonts.clear();
  }
}
