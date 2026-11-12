import { normalizeFrameMatches } from "/src/capture/savedFrames.js";
import { ChunkedTimeline } from "/src/capture/ChunkedTimeline.js";

import { Timeline } from "/src/capture/Timeline.js";
import { ReplayScene, DEFAULT_REPLAY_LAYERS } from "/src/capture/ReplayScene.js";

import {
  defaultCamera,
  validCamera,
  normalizeBookmarks,
  sameVideo,
} from "/src/capture/alignment.js";

import { normalizeRayStyle } from "/src/capture/rayStyle.js";
export class EditorProject {
  constructor(services) {
    this.services = services;
    for (const name of Object.getOwnPropertyNames(EditorProject.prototype))
      if (name !== "constructor") this[name] = this[name].bind(this);
    this.timeline = null;
    this.take = null;
    this.videoURL = null;
    this.selectedVideo = null;
    this.restoreVideoSettings = false;
    this.expectedVideo = null;
    this.takeLoadGeneration = 0;
    this.takeAbort = null;
    this.videoLoadGeneration = 0;
    this.currentLoadGeneration = 0;
    this.current = {
      version: 1,
      takeId: null,
      segment: 0,
      mapping: { a: 1, b: 0 },
      camera: defaultCamera(),
      crop: { zoom: 1, x: 0, y: 0 },
      observations: [],
      bookmarks: [],
      frameMatches: [],
      frameFit: null,
      trim: { start: 0, end: 1 },
      output: { width: 1080, height: 1920, fps: 30 },
      layers: { ...this.services.preview.replay.layers },
      rayStyle: normalizeRayStyle(),
      opacity: 1,
      calibration: null,
    };
  }
  async readNDJSON(path, signal, headers) {
    const response = await fetch(path, { signal, headers });
    if (!response.ok) throw new Error(`Cannot read ${path}`);
    const records = [];
    let pending = "";
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      let at;
      while ((at = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, at);
        pending = pending.slice(at + 1);
        if (line) records.push(JSON.parse(line));
      }
    }
    return records;
  }
  async refresh() {
    const status = await this.services.ui.api("/api/status");
    this.services.view.$("connection").textContent = status.paired
      ? "Local receiver connected"
      : "Receiver available · pairing required";
    this.services.view.$("pair").hidden = status.paired;
    if (!status.paired) return;
    const takes = await this.services.ui.api("/api/takes");
    this.services.view.$("takes").replaceChildren(new Option("Select a take", ""));
    for (const row of takes)
      this.services.view
        .$("takes")
        .add(
          new Option(
            `${row.synthetic ? "SYNTHETIC · " : ""}${row.performance?.label ? row.performance.label + " · " : ""}${row.created?.slice(0, 19) || row.id} · ${row.performance?.completionAction ? row.performance.completionAction + " · " : ""}${row.status}`,
            row.id,
          ),
        );
    if (this.take) this.services.view.$("takes").value = this.take.id;
  }
  async loadTake(id, { projectGeneration = null } = {}) {
    if (projectGeneration === null) this.currentLoadGeneration++;
    if (!id) return;
    const generation = ++this.takeLoadGeneration;
    this.takeAbort?.abort();
    const abort = new AbortController();
    this.takeAbort = abort;
    const signal = abort.signal;
    await this.services.preview.previewSeeks.idle();
    if (generation !== this.takeLoadGeneration) return;
    this.services.camera.cancelFrameMatching();
    this.services.ui.notice("Loading take and recorded presentation assets…");
    this.services.preview.pause();
    const changed = this.take?.id !== id;
    const metadata = await this.services.ui.api(`/api/takes/${id}`, { signal });
    const receiver = await this.services.ui.api("/api/status", { signal });
    if (!metadata.assetsBundled)
      for (const [path, hash] of Object.entries(metadata.build?.assets || {}))
        if (receiver.build.assets[path] !== hash)
          throw new Error(
            `Asset version mismatch for ${path}. Open the portable take with its matching repository assets.`,
          );
    const [index, events] = await Promise.all([
      this.services.ui.api(`/api/takes/${id}/sample-index`, { signal }),
      this.readNDJSON(`/api/takes/${id}/events.ndjson`, signal),
    ]);
    const rangeAbort = new AbortController();
    const next =
      index.bytes > 16 * 1024 * 1024
        ? new ChunkedTimeline(
            index,
            events,
            metadata.gaps || [],
            (start, end) =>
              this.readNDJSON(`/api/takes/${id}/samples.ndjson`, rangeAbort.signal, {
                Range: `bytes=${start}-${end}`,
              }),
            {
              onReady: () => {
                this.services.camera.observationCache = null;
                if (this.timeline === next) this.services.preview.render();
              },
            },
          )
        : new Timeline(
            await this.readNDJSON(`/api/takes/${id}/samples.ndjson`, signal),
            events,
            metadata.gaps || [],
          );
    next.onDispose = () => rangeAbort.abort();
    if (next.ensure) await next.ensure(0);
    next.onError = (error) => this.services.ui.notice(error.message, true);
    const scene = new ReplayScene(this.services.view.renderer, {
      assetURL: (path) => (metadata.assetsBundled ? `/api/takes/${id}/assets${path}` : path),
    });
    try {
      await scene.load(events);
      if (generation !== this.takeLoadGeneration) {
        scene.dispose();
        next.dispose?.();
        return;
      }
    } catch (error) {
      scene.dispose();
      next.dispose?.();
      throw error;
    }
    this.services.preview.replay.dispose();
    this.timeline?.dispose?.();
    this.services.preview.replay = scene;
    this.timeline = next;
    this.take = metadata;
    this.current.takeId = id;
    this.current.takeIdentity = {
      id,
      originalId: metadata.originalId,
      created: metadata.created,
      build: metadata.build,
    };
    this.current.segment = next.frames[0].segment;
    this.services.view.$("takes").value = id;
    this.services.view.$("gaps").replaceChildren();
    for (const gap of [...(metadata.gaps || []), ...(metadata.missingIntervals || [])]) {
      const item = document.createElement("li");
      item.textContent = `${gap.stream}: ${gap.start.toFixed(3)}–${gap.end === null ? "unknown end" : gap.end.toFixed(3)} s · ${gap.reason}`;
      this.services.view.$("gaps").append(item);
    }
    this.services.view.audio.src = `/api/takes/${id}/audio.wav`;
    this.services.view.audio.load();
    this.services.view.$("take-info").textContent =
      `${metadata.synthetic ? "SYNTHETIC DEMO. " : ""}${metadata.performance?.label ? metadata.performance.label + " · " + (metadata.performance.completionAction || "in progress") + " · " : ""}${metadata.performance?.performanceStart != null ? "Play starts at " + metadata.performance.performanceStart.toFixed(2) + " s · " : ""}${metadata.duration?.toFixed(2) || next.duration.toFixed(2)} s · ${metadata.status}. ${metadata.complete ? "All expected streams saved." : `${metadata.reason || "Not finalized"}; inspect ${metadata.gaps?.length || 0} reported gaps. Use Finalize interrupted take after disconnecting to rebuild WAV.`}`;
    this.services.view.$("download-take").hidden = false;
    this.services.view.$("download-take").href = `/api/takes/${id}/archive`;
    this.services.view.$("marks").replaceChildren();
    for (const e of events.filter((e) =>
      ["sync", "calibration-mark", "reference-reset"].includes(e.data.kind),
    )) {
      const b = document.createElement("button");
      b.textContent = `${e.data.kind} ${e.t.toFixed(3)}s`;
      b.onclick = this.services.ui.run(() =>
        this.services.preview.scrub((e.t - this.current.mapping.b) / this.current.mapping.a),
      );
      this.services.view.$("marks").append(b);
    }
    if (!this.videoURL) {
      this.services.view.$("timeline").max = String(next.duration);
      this.current.trim.end = next.duration;
    }
    this.current.camera = defaultCamera();
    this.current.observations = [];
    this.current.calibration = null;
    this.current.frameMatches = [];
    this.current.frameFit = null;
    if (changed) this.current.bookmarks = [];
    this.services.camera.cameraHistory.clear();
    this.restoreVideoSettings = false;
    this.expectedVideo = null;
    this.services.ui.updateInputs();
    this.services.preview.render();
    this.services.ui.notice(
      scene.issues.length
        ? scene.issues.join(" ")
        : metadata.synthetic
          ? "Synthetic take loaded. This does not validate real headset or phone capture."
          : "Take loaded. Select video, match timing, then position the phone camera.",
      scene.issues.length > 0,
    );
  }
  async loadVideo(e) {
    const file = e.target.files[0];
    if (!file) return;
    const generation = ++this.videoLoadGeneration;
    await this.services.preview.previewSeeks.idle();
    if (generation !== this.videoLoadGeneration) return;
    this.services.camera.cancelFrameMatching();
    if (!this.services.view.video.requestVideoFrameCallback)
      throw new Error(
        "Video presentation timestamps are unavailable. Use a current desktop Chrome browser for calibration and export.",
      );
    const previousVideo = this.expectedVideo || this.current.video;
    const candidate = document.createElement("video"),
      candidateURL = URL.createObjectURL(file);
    candidate.muted = true;
    candidate.preload = "auto";
    try {
      await new Promise((resolve, reject) => {
        candidate.onloadeddata = resolve;
        candidate.onerror = () =>
          reject(new Error("Unsupported video codec. Convert to a seekable SDR MP4 locally."));
        candidate.src = candidateURL;
      });
      if (!Number.isFinite(candidate.duration)) throw new Error("Video has no finite duration.");
      if (generation !== this.videoLoadGeneration) {
        URL.revokeObjectURL(candidateURL);
        return;
      }
      this.services.preview.pause();
      if (this.videoURL) URL.revokeObjectURL(this.videoURL);
      this.videoURL = candidateURL;
      await new Promise((resolve, reject) => {
        this.services.view.video.onloadeddata = resolve;
        this.services.view.video.onerror = reject;
        this.services.view.video.src = candidateURL;
        this.services.view.video.muted = true;
      });
      if (generation !== this.videoLoadGeneration) return;
    } catch (error) {
      URL.revokeObjectURL(candidateURL);
      throw error;
    } finally {
      candidate.removeAttribute("src");
      candidate.load();
    }
    this.selectedVideo = {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      width: this.services.view.video.videoWidth,
      height: this.services.view.video.videoHeight,
      duration: this.services.view.video.duration,
    };
    const changed = Boolean(previousVideo && !sameVideo(previousVideo, this.selectedVideo));
    if (changed) {
      this.current.bookmarks = [];
      this.current.observations = [];
      this.current.calibration = null;
      this.current.frameMatches = [];
      this.current.frameFit = null;
      this.services.camera.cameraHistory.clear();
    }
    if (!this.restoreVideoSettings || changed)
      this.current.trim.end = this.services.view.video.duration;
    this.current.bookmarks = normalizeBookmarks(
      this.current.bookmarks,
      this.services.view.video.duration,
    );
    this.current.frameMatches = normalizeFrameMatches(
      this.current.frameMatches,
      this.current.bookmarks,
    );
    this.current.video = this.selectedVideo;
    this.restoreVideoSettings = false;
    this.expectedVideo = null;
    this.services.view.$("timeline").max = this.services.view.video.duration;
    this.services.view.$("video-info").textContent =
      `${file.name} · ${this.services.view.video.videoWidth} × ${this.services.view.video.videoHeight} · ${this.services.view.video.duration.toFixed(3)}s. Rotation decoded by browser.`;
    this.services.ui.updateInputs();
    await this.services.preview.seek(0);
    this.services.ui.notice(
      changed
        ? "Different video selected. Saved frames and calibration observations cleared; match timing again."
        : "Video ready. Match a sync cue or controller gesture.",
    );
  }
  async loadProject(e) {
    const file = e.target.files[0];
    if (!file) return;
    const generation = ++this.currentLoadGeneration;
    const loaded = JSON.parse(await file.text());
    if (generation !== this.currentLoadGeneration) return;
    if (
      loaded.version !== 1 ||
      !loaded.takeId ||
      !validCamera(loaded.camera) ||
      !loaded.output ||
      !Array.isArray(loaded.observations)
    )
      throw new Error("Unsupported project file.");
    if (this.take?.id !== loaded.takeId) {
      const rows = await this.services.ui.api("/api/takes");
      const target = rows.find((t) => t.id === loaded.takeId || t.originalId === loaded.takeId);
      if (!target) throw new Error("Import the project’s portable take first.");
      await this.loadTake(target.id, { projectGeneration: generation });
      if (generation !== this.currentLoadGeneration) return;
      loaded.takeId = target.id;
    }
    await this.services.preview.previewSeeks.idle();
    if (generation !== this.currentLoadGeneration) return;
    this.services.camera.cancelFrameMatching();
    this.services.preview.pause();
    this.current = {
      ...loaded,
      frameFit: loaded.frameFit || null,
      layers: { ...DEFAULT_REPLAY_LAYERS, ...loaded.layers },
      rayStyle: normalizeRayStyle(loaded.rayStyle),
      bookmarks: normalizeBookmarks(loaded.bookmarks, loaded.video?.duration),
    };
    this.current.frameMatches = normalizeFrameMatches(loaded.frameMatches, this.current.bookmarks);
    this.services.camera.cameraHistory.clear();
    this.expectedVideo = loaded.video || null;
    this.restoreVideoSettings = true;
    this.services.camera.selectedPoint = false;
    this.services.view.canvas.classList.remove("pick-landmark");
    const matches =
      this.videoURL && (!this.expectedVideo || sameVideo(this.selectedVideo, this.expectedVideo));
    if (!matches && this.videoURL) {
      URL.revokeObjectURL(this.videoURL);
      this.videoURL = null;
      this.services.view.video.removeAttribute("src");
      this.services.view.video.load();
      this.selectedVideo = null;
    }
    this.services.view.$("timeline").max = matches
      ? this.services.view.video.duration
      : loaded.video?.duration || this.timeline.duration;
    if (!matches) {
      this.services.preview.videoTime = 0;
      this.services.view.$("video-info").textContent = this.expectedVideo
        ? `Reselect ${this.expectedVideo.name} to keep its saved frames and alignment.`
        : "Choose the local phone video.";
    }
    this.services.ui.updateInputs();
    this.services.ui.readSettings();
    this.services.preview.render();
    this.services.ui.notice(
      matches
        ? "Project restored with the selected video."
        : "Project restored. Reselect the matching local video; saved camera, frames, crop, trim and timing will be retained.",
    );
  }
}
