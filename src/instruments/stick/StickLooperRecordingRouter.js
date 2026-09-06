import { INSTRUMENT_KINDS } from "../core/capabilities.js";

/**
 * Records a semantic stick strike in each affected Looper. A direct Looper hit
 * uses its percussion lane, a Honk hit uses the connected Honk track, and a
 * Metronome hit uses the track selected by each Metronome cable.
 */
export function routeStickStrikeToLooperRecordings({
  event,
  target,
  loopers = [],
  metronomeConnectionManager = null,
  resolveInstrument = null,
} = {}) {
  if (!event?.percussionType || !target?.id) {
    return 0;
  }

  if (target.kind === INSTRUMENT_KINDS.looper) {
    return target.recordSelfDrumHit?.(event.percussionType, event.timestamp) ? 1 : 0;
  }

  if (target.kind === INSTRUMENT_KINDS.metronome) {
    let recordedCount = 0;
    const looperById = new Map([...loopers].map((looper) => [looper.id, looper]));
    for (const connection of metronomeConnectionManager?.getConnectionsForMetronome?.(target.id) || []) {
      if (connection.targetKind !== INSTRUMENT_KINDS.looper) continue;
      const looper = resolveInstrument?.(connection.targetId) || looperById.get(connection.targetId);
      if (looper?.kind !== INSTRUMENT_KINDS.looper) continue;
      if (looper.recordTrackDrumHit?.(
        connection.targetPortId,
        event.percussionType,
        event.timestamp,
      )) {
        recordedCount += 1;
      }
    }
    return recordedCount;
  }

  if (target.kind !== INSTRUMENT_KINDS.honk) {
    return 0;
  }

  let recordedCount = 0;
  for (const looper of loopers) {
    const track = looper.tracks?.find(({ connectedHonkId }) => connectedHonkId === target.id);
    if (track && looper.recordTrackDrumHit?.(
      track.trackId,
      event.percussionType,
      event.timestamp,
    )) {
      recordedCount += 1;
    }
  }
  return recordedCount;
}
