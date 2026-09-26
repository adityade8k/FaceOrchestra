import { mkdir, writeFile } from "node:fs/promises";

// Keep raw gesture evidence locally; checked-in evidence contains results and
// event counts rather than thousands of interpolated squeeze snapshots.
export async function writeGuidedAudit(song, report) {
  const directory = "test-results/guided";
  await mkdir(directory, { recursive: true });
  const rawEvidence = `${directory}/${song}.json`;
  await writeFile(rawEvidence, JSON.stringify(report, null, 2));
  const compact = (value) => {
    if (Array.isArray(value)) return value.map(compact);
    if (!value || typeof value !== "object") return value;
    if (value.lengthMode && Array.isArray(value.tracks)) {
      return {
        ...value,
        tracks: value.tracks.map(({ events = [], ...track }) => ({
          ...track,
          eventCount: events.length,
          eventTypes: events.reduce((counts, event) => {
            counts[event.type] = (counts[event.type] || 0) + 1;
            return counts;
          }, {}),
        })),
      };
    }
    const result = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, compact(child)]),
    );
    if (
      Array.isArray(value.checks) &&
      value.checks.every((item) => typeof item === "string")
    ) {
      result.checkCount = value.checks.length;
      result.checks = [...new Set(value.checks)];
    }
    return result;
  };
  await writeFile(
    `docs/audits/${song}-tutorial.json`,
    JSON.stringify({ ...compact(report), rawEvidence }, null, 2),
  );
}
