import { parseMidi } from "midi-file";
import { createHash } from "node:crypto";
export const IMPORTER_VERSION = 1;
export const PARSER_VERSION = "midi-file@1.2.4";

// Preflight the bytes before invoking the parser (which trusts chunk lengths).
// Limits are explicit import constraints, never silently truncated material.
export function preflight(
  bytes,
  { maxBytes = 16 * 1024 * 1024, maxEvents = 200000, maxTracks = 256 } = {},
) {
  if (
    bytes.length > maxBytes ||
    bytes.length < 14 ||
    bytes.toString("ascii", 0, 4) !== "MThd"
  )
    throw new Error("Invalid or excessive MIDI header");
  const length = bytes.readUInt32BE(4),
    format = bytes.readUInt16BE(8),
    tracks = bytes.readUInt16BE(10);
  if (
    length !== 6 ||
    format > 2 ||
    !tracks ||
    tracks > maxTracks ||
    (format === 0 && tracks !== 1)
  )
    throw new Error("Unsupported MIDI structure");
  const division = bytes.readUInt16BE(12);
  if (
    !division ||
    (division & 0x8000 &&
      (![-24, -25, -29, -30].includes(bytes.readInt8(12)) || !(division & 255)))
  )
    throw new Error("Invalid MIDI timing division");
  let offset = 14,
    count = 0;
  for (let track = 0; track < tracks; track++) {
    if (
      offset + 8 > bytes.length ||
      bytes.toString("ascii", offset, offset + 4) !== "MTrk"
    )
      throw new Error("Missing/truncated track");
    const end = offset + 8 + bytes.readUInt32BE(offset + 4);
    offset += 8;
    if (end > bytes.length) throw new Error("Truncated track");
    let running = 0;
    const byte = () => {
      if (offset >= end) throw new Error("Truncated event");
      return bytes[offset++];
    };
    const vlq = () => {
      let n = 0;
      for (let i = 0; i < 4; i++) {
        const b = byte();
        n = n * 128 + (b & 127);
        if (!(b & 128)) return n;
      }
      throw new Error("Excessive MIDI variable length");
    };
    while (offset < end) {
      if (++count > maxEvents) throw new Error("Excessive MIDI event count");
      vlq();
      let status = byte();
      if (status < 128) {
        if (!running) throw new Error("Running status without status");
        offset--;
        status = running;
      }
      if (status === 255 || status === 240 || status === 247) {
        if (status === 255) byte();
        else running = 0;
        const size = vlq();
        if (size > 65536 || offset + size > end)
          throw new Error("Truncated or excessive meta/SysEx payload");
        offset += size;
      } else {
        if (status < 128 || status >= 240)
          throw new Error("Unsupported MIDI status");
        running = status;
        const size = [12, 13].includes(status >> 4) ? 1 : 2;
        for (let i = 0; i < size; i++)
          if (byte() > 127) throw new Error("Invalid channel data byte");
      }
    }
  }
  if (offset !== bytes.length)
    throw new Error("Unexpected trailing MIDI bytes");
  return count;
}

export function tempoMapper(events, division, warnings = []) {
  if (division.kind === "smpte")
    return (tick) => tick / (division.fps * division.ticksPerFrame);
  const map = [{ tick: 0, us: 500000, seconds: 0, assumed: true }];
  for (const e of events.filter((e) => e.type === "setTempo")) {
    if (!(e.microsecondsPerBeat > 0)) throw new Error("Invalid tempo");
    const prior = map.at(-1);
    if (
      prior.tick === e.tick &&
      !prior.assumed &&
      prior.us !== e.microsecondsPerBeat
    )
      warnings.push({
        event: e.id,
        issue: "conflicting simultaneous tempo",
        decision: "last in stable track/event order",
      });
    const value = {
      tick: e.tick,
      us: e.microsecondsPerBeat,
      seconds:
        prior.seconds + ((e.tick - prior.tick) * prior.us) / division.ppq / 1e6,
    };
    if (prior.tick === e.tick) map.pop();
    map.push(value);
  }
  const seconds = (tick) => {
    let lo = 0,
      hi = map.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (map[mid].tick <= tick) lo = mid + 1;
      else hi = mid;
    }
    const p = map[Math.max(0, lo - 1)];
    return p.seconds + ((tick - p.tick) * p.us) / division.ppq / 1e6;
  };
  seconds.map = map;
  return seconds;
}

export function normalizeMidi(input, options = {}) {
  const bytes = Buffer.from(input);
  preflight(bytes, options.limits);
  let parsed;
  try {
    parsed = parseMidi(bytes);
  } catch (error) {
    throw new Error(`MIDI parse failed: ${error.message || error}`);
  }
  const warnings = [],
    ppq = parsed.header.ticksPerBeat;
  const division = ppq
    ? { kind: "ppq", ppq }
    : {
        kind: "smpte",
        fps:
          parsed.header.framesPerSecond === 29
            ? 30000 / 1001
            : parsed.header.framesPerSecond,
        ticksPerFrame: parsed.header.ticksPerFrame,
      };
  const tracks = parsed.tracks.map((events, track) => {
    let tick = 0,
      port = 0;
    return events.map((event, index) => {
      tick += event.deltaTime;
      if (!Number.isSafeInteger(tick) || tick > 2 ** 40)
        throw new Error("Excessive MIDI time");
      if (event.type === "portPrefix") port = event.port;
      return {
        ...event,
        ...(event.data ? { data: [...event.data] } : {}),
        id: `t${track}-e${index}`,
        track,
        index,
        port,
        tick,
      };
    });
  });
  const groups =
    parsed.header.format === 2 ? tracks.map((track) => [track]) : [tracks];
  const sequences = groups.map((group, sequence) => {
    const events = group
      .flat()
      .sort(
        (a, b) => a.tick - b.tick || a.track - b.track || a.index - b.index,
      );
    const seconds = tempoMapper(events, division, warnings),
      notes = [],
      active = new Map(),
      states = new Map(),
      sounding = new Map();
    const endTick = events.at(-1)?.tick || 0;
    const stateFor = (e) => {
      const key = `${e.port}:${e.channel}`;
      if (!states.has(key))
        states.set(key, {
          pedal: false,
          bend: 0,
          range: options.assumedBendRange ?? 2,
          assumedRange: true,
          rpnMsb: 127,
          rpnLsb: 127,
        });
      return states.get(key);
    };
    const channelNotes = (e) => {
      const key = `${e.port}:${e.channel}`;
      if (!sounding.has(key)) sounding.set(key, new Set());
      const set = sounding.get(key);
      for (const note of set)
        if (note.soundingEndTick !== null) set.delete(note);
      return set;
    };
    for (const e of events) {
      e.seconds = seconds(e.tick);
      if (e.seconds > 86400)
        throw new Error("MIDI exceeds 24-hour import bound");
      if (ppq) e.quarterBeat = e.tick / ppq;
      if (e.channel === undefined) continue;
      const state = stateFor(e),
        key = `${e.track}:${e.port}:${e.channel}:${e.noteNumber}`;
      if (e.type === "noteOn") {
        const note = {
          id: e.id,
          track: e.track,
          port: e.port,
          channel: e.channel,
          midi: e.noteNumber,
          velocity: e.velocity,
          startTick: e.tick,
          releaseTick: null,
          releaseVelocity: null,
          soundingEndTick: null,
          bend: [
            {
              tick: e.tick,
              value14: state.bend + 8192,
              range: state.range,
              semitones: (state.bend / 8192) * state.range,
              assumedRange: state.assumedRange,
            },
          ],
          expression: [],
        };
        const soundingNotes = channelNotes(e);
        if (soundingNotes.size >= 2048)
          throw new Error("Excessive simultaneous MIDI voices");
        soundingNotes.add(note);
        notes.push(note);
        if (!active.has(key)) active.set(key, []);
        active.get(key).push(note);
      } else if (e.type === "noteOff") {
        const note = active.get(key)?.shift();
        if (!note) warnings.push({ event: e.id, issue: "unmatched note-off" });
        else {
          note.releaseTick = e.tick;
          note.releaseVelocity = e.velocity;
          if (!state.pedal) note.soundingEndTick = e.tick;
        }
      } else if (e.type === "controller") {
        if (e.controllerType === 64) {
          state.pedal = e.value >= 64;
          if (!state.pedal)
            for (const n of channelNotes(e))
              if (n.releaseTick !== null) n.soundingEndTick = e.tick;
        } else if (e.controllerType === 101) state.rpnMsb = e.value;
        else if (e.controllerType === 100) state.rpnLsb = e.value;
        else if (
          [6, 38].includes(e.controllerType) &&
          state.rpnMsb === 0 &&
          state.rpnLsb === 0
        ) {
          if (e.controllerType === 6) state.range = e.value + (state.range % 1);
          else state.range = Math.floor(state.range) + e.value / 100;
          state.assumedRange = false;
          for (const n of channelNotes(e))
            n.bend.push({
              tick: e.tick,
              value14: state.bend + 8192,
              range: state.range,
              semitones: (state.bend / 8192) * state.range,
              assumedRange: false,
            });
        } else if (e.controllerType === 120 || e.controllerType === 123) {
          for (const n of channelNotes(e)) {
            n.releaseTick ??= e.tick;
            if (!state.pedal || e.controllerType === 120)
              n.soundingEndTick = e.tick;
          }
          for (const [id, queue] of active)
            if (queue[0]?.port === e.port && queue[0]?.channel === e.channel)
              active.delete(id);
        } else if (e.controllerType === 121) {
          state.pedal = false;
          state.bend = 0;
          for (const n of channelNotes(e)) {
            if (n.releaseTick !== null) n.soundingEndTick = e.tick;
            else
              n.bend.push({
                tick: e.tick,
                value14: 8192,
                range: state.range,
                semitones: 0,
                assumedRange: state.assumedRange,
              });
          }
        } else
          warnings.push({
            event: e.id,
            issue: `controller ${e.controllerType} retained; runtime mapping required`,
          });
      } else if (e.type === "pitchBend") {
        state.bend = e.value;
        for (const n of channelNotes(e))
          n.bend.push({
            tick: e.tick,
            value14: e.value + 8192,
            range: state.range,
            semitones: (e.value / 8192) * state.range,
            assumedRange: state.assumedRange,
          });
      } else if (["noteAftertouch", "channelAftertouch"].includes(e.type)) {
        for (const n of channelNotes(e))
          if (e.type === "channelAftertouch" || n.midi === e.noteNumber)
            n.expression.push({
              event: e.id,
              tick: e.tick,
              type: e.type,
              value: e.amount,
            });
      }
    }
    for (const n of notes) {
      if (n.releaseTick === null || n.soundingEndTick === null)
        warnings.push({
          event: n.id,
          issue: "missing key/pedal end",
          decision: "closed at sequence end",
          tick: endTick,
        });
      n.releaseTick ??= endTick;
      n.soundingEndTick ??= endTick;
      n.startSeconds = seconds(n.startTick);
      n.releaseSeconds = seconds(n.releaseTick);
      n.endSeconds = seconds(n.soundingEndTick);
      n.durationSeconds = n.endSeconds - n.startSeconds;
      if (ppq) {
        n.beat = n.startTick / ppq;
        n.beats = (n.soundingEndTick - n.startTick) / ppq;
      }
      n.bend = n.bend.map((p) => ({ ...p, seconds: seconds(p.tick) }));
    }
    const meter = events
      .filter((e) => e.type === "timeSignature")
      .map((e) => ({
        event: e.id,
        tick: e.tick,
        numerator: e.numerator,
        denominator: e.denominator,
        quarterBeatsPerBar: (e.numerator * 4) / e.denominator,
        metronome: e.metronome,
      }));
    for (let i = 1; i < meter.length; i++)
      if (
        meter[i].tick === meter[i - 1].tick &&
        (meter[i].numerator !== meter[i - 1].numerator ||
          meter[i].denominator !== meter[i - 1].denominator)
      )
        warnings.push({
          event: meter[i].event,
          issue: "conflicting simultaneous meter",
        });
    if (!meter.length)
      warnings.push({
        sequence,
        issue: "no meter; teaching grid must be declared",
      });
    if (events.some((e) => ["sysEx", "endSysEx"].includes(e.type)))
      warnings.push({
        sequence,
        issue: "SysEx retained as bytes, never executed",
      });
    return {
      id: `sequence-${sequence}`,
      events,
      notes,
      tempo: seconds.map || [],
      meter,
      durationSeconds: seconds(endTick),
      soundingEndSeconds: notes.reduce(
        (max, n) => Math.max(max, n.endSeconds),
        0,
      ),
    };
  });
  const source = {
    filename: options.filename || "source.mid",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.length,
    importerVersion: IMPORTER_VERSION,
    parserVersion: PARSER_VERSION,
    options,
    format: parsed.header.format,
    division,
  };
  const inventory = sequences.map((seq) => ({
    sequence: seq.id,
    duration: seq.durationSeconds,
    soundingEnd: seq.soundingEndSeconds,
    tracks: [...new Set(seq.events.map((e) => e.track))].map((track) => {
      const notes = seq.notes.filter((n) => n.track === track),
        events = seq.events.filter((e) => e.track === track);
      const changes = notes
        .flatMap((n) => [
          [n.startSeconds, 1],
          [n.endSeconds, -1],
        ])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let voices = 0,
        polyphony = 0;
      for (const [, delta] of changes)
        polyphony = Math.max(polyphony, (voices += delta));
      return {
        track,
        name: events.find((e) => e.type === "trackName")?.text || "",
        channels: [...new Set(notes.map((n) => n.channel))],
        ports: [...new Set(notes.map((n) => n.port))],
        notes: notes.length,
        pitchRange: notes.length
          ? [
              notes.reduce((v, n) => Math.min(v, n.midi), 127),
              notes.reduce((v, n) => Math.max(v, n.midi), 0),
            ]
          : [],
        maximumPolyphony: polyphony,
        density: notes.length / Math.max(seq.durationSeconds, 0.001),
        programs: events.filter(
          (e) =>
            e.type === "programChange" ||
            (e.type === "controller" && [0, 32].includes(e.controllerType)),
        ),
        likelyRole:
          notes.every((n) => n.channel === 9) && notes.length
            ? "percussion"
            : polyphony > 1
              ? "chords/support"
              : "melody-or-bass (confirm)",
      };
    }),
  }));
  return {
    source,
    sequences,
    inventory,
    warnings,
    capabilities: {
      mpe: "channel and expression events preserved; zone-aware rendering requires an explicit arrangement decision",
      percussion: "source pitches retained; map before compiling",
      smpte: "seconds preserved; no invented PPQ",
    },
  };
}
