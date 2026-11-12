import { ReplayScene } from "/src/capture/ReplayScene.js";
import { projectPoint, cropRect } from "/src/capture/calibration.js";
import { timeMap } from "/src/capture/format.js";

import { PreviewSeekQueue } from "/src/capture/PreviewSeekQueue.js";
import { readVideoFrame } from "/src/capture/videoFrame.js";

export class EditorPreview {
  constructor(services) {
    this.services = services;
    for (const name of Object.getOwnPropertyNames(EditorPreview.prototype))
      if (name !== "constructor") this[name] = this[name].bind(this);
    this.replay = new ReplayScene(this.services.view.renderer);
    this.videoTime = 0;
    this.presentedPTS = 0;
    this.previewSeeks = new PreviewSeekQueue(
      (time) => this.seek(time, { preview: true }),
      () => this.render(),
    );
    this.currentPlayhead = () =>
      this.previewSeeks.target ??
      (this.services.project.videoURL && !this.services.view.video.paused
        ? this.services.view.video.currentTime
        : this.videoTime);
  }
  render({
    time = this.videoTime,
    transparent = false,
    calibration = !this.services.exporter.exporting,
    videoSource = this.services.view.video,
    strict = false,
  } = {}) {
    const w = this.services.view.canvas.width,
      h = this.services.view.canvas.height;
    this.services.view.ctx.clearRect(0, 0, w, h);
    if (!transparent) {
      const ready =
        videoSource === this.services.view.video
          ? this.services.view.video.readyState >= 2 && !this.services.view.video.seeking
          : videoSource?.width > 0 && videoSource?.height > 0;
      if (strict && !ready)
        throw new Error(
          `Phone video is missing at ${time.toFixed(3)} s. Export stopped before saving this frame.`,
        );
      this.services.view.ctx.fillStyle = "#17221b";
      this.services.view.ctx.fillRect(0, 0, w, h);
      if (ready) {
        const c = cropRect(
          videoSource.videoWidth || videoSource.width,
          videoSource.videoHeight || videoSource.height,
          w,
          h,
          this.services.project.current.crop,
        );
        this.services.view.ctx.drawImage(videoSource, c.sx, c.sy, c.sw, c.sh, 0, 0, w, h);
      } else {
        this.services.view.ctx.fillStyle = "#afc3aa";
        this.services.view.ctx.font = "18px system-ui";
        this.services.view.ctx.textAlign = "center";
        this.services.view.ctx.fillText(
          this.services.project.videoURL ? "Loading video frame…" : "Select a phone video",
          w / 2,
          h / 2,
        );
      }
    }
    const sceneTime = timeMap(time, this.services.project.current.mapping);
    this.replay.setRayStyle(this.services.project.current.rayStyle);
    this.replay.setCamera(this.services.project.current.camera, w, h);
    const frame = this.services.project.timeline?.seek(sceneTime);
    if (frame) {
      this.replay.layers = { ...this.services.project.current.layers };
      if (!calibration) {
        this.replay.layers.controllers = false;
        this.replay.layers.headset = false;
      }
      this.replay.apply(frame);
      this.replay.render({ guides: calibration });
      if (!this.services.camera.pendingFrame || !calibration) {
        this.services.view.ctx.globalAlpha = this.services.project.current.opacity;
        this.services.view.ctx.drawImage(this.services.view.renderer.domElement, 0, 0, w, h);
        this.services.view.ctx.globalAlpha = 1;
      }
      this.services.view.$("profiles").textContent =
        frame.xr.controllers
          .map((c) => `${c.handedness}: ${c.profiles.join(", ") || "no profile"}`)
          .join(" · ") || "No tracked controllers at this timestamp.";
      if (calibration && !this.services.camera.pendingFrame)
        for (const observation of [
          ...this.services.project.current.observations,
          ...this.services.camera.frameObservations(),
        ]) {
          if (Math.abs(observation.videoTime - time) > 0.12) continue;
          const p = projectPoint(observation.world, this.services.project.current.camera);
          const x = (observation.pixel[0] / 1080) * w,
            y = (observation.pixel[1] / 1920) * h;
          this.services.view.ctx.strokeStyle = observation.hand === "right" ? "#ffb56e" : "#96edb1";
          this.services.view.ctx.lineWidth = 2;
          this.services.view.ctx.beginPath();
          this.services.view.ctx.arc(x, y, 5, 0, 2 * Math.PI);
          this.services.view.ctx.stroke();
          if (p) {
            this.services.view.ctx.beginPath();
            this.services.view.ctx.moveTo(x, y);
            this.services.view.ctx.lineTo((p[0] / 1080) * w, (p[1] / 1920) * h);
            this.services.view.ctx.stroke();
            this.services.view.ctx.fillStyle = "#ff716a";
            this.services.view.ctx.fillRect((p[0] / 1080) * w - 3, (p[1] / 1920) * h - 3, 6, 6);
          }
        }
    }
    if (calibration && this.services.camera.pendingFrame)
      for (const point of this.services.camera.pendingFrame.points) {
        this.services.view.ctx.fillStyle = point.hand === "left" ? "#66edbe" : "#ffa96c";
        this.services.view.ctx.beginPath();
        this.services.view.ctx.arc(
          (point.pixel[0] / 1080) * w,
          (point.pixel[1] / 1920) * h,
          5,
          0,
          Math.PI * 2,
        );
        this.services.view.ctx.fill();
      }
    if (!this.services.exporter.exporting) this.services.view.inspector.update(this.replay, frame);
    const requested = this.previewSeeks.target ?? time;
    this.services.view.$("frame-time").textContent =
      `VIDEO ${time.toFixed(3)} s · SCENE ${sceneTime.toFixed(3)} s`;
    this.services.view.$("seek-time").value = requested.toFixed(3);
    this.services.view.$("timeline").value = requested;
    for (const button of this.services.view.$("saved-frames").querySelectorAll("[data-time]"))
      button.setAttribute(
        "aria-current",
        String(Math.abs(Number(button.dataset.time) - time) < 0.001),
      );
  }
  async seek(time, { preview = false } = {}) {
    this.videoTime = Math.max(
      0,
      Math.min(
        time,
        this.services.project.videoURL
          ? this.services.view.video.duration
          : this.services.project.timeline?.duration || time,
      ),
    );
    await this.services.project.timeline?.ensure?.(
      timeMap(this.videoTime, this.services.project.current.mapping),
    );
    let decoded;
    if (this.services.project.videoURL)
      decoded = await readVideoFrame(this.services.view.video, this.videoTime, {
        presentedTime: this.presentedPTS,
        capture: this.services.exporter.exporting
          ? (source) => {
              // Freeze the decoded pixels while readiness is known, before yielding back
              // to the export loop. Later media events cannot replace this with a slate.
              this.services.exporter.exportVideo.width = source.videoWidth;
              this.services.exporter.exportVideo.height = source.videoHeight;
              this.services.exporter.exportVideoContext.drawImage(source, 0, 0);
              return this.services.exporter.exportVideo;
            }
          : undefined,
      });
    if (decoded) this.presentedPTS = decoded.presentedPTS;
    if (!this.services.exporter.exporting && this.services.view.audio.readyState >= 1) {
      this.services.view.audio.currentTime = Math.max(
        0,
        timeMap(this.videoTime, this.services.project.current.mapping),
      );
      this.services.view.audio.playbackRate = this.services.project.current.mapping.a;
    }
    if (!this.services.exporter.exporting) this.render();
    return { videoTime: this.videoTime, presentedPTS: this.presentedPTS, source: decoded?.source };
  }
  stopPlayback() {
    this.services.view.video.pause();
    this.services.view.audio.pause();
    this.services.view.$("play").textContent = "Play";
  }
  pause() {
    this.stopPlayback();
    if (this.services.project.videoURL && !this.services.exporter.exporting) {
      this.videoTime = this.services.view.video.currentTime;
      this.render();
    }
  }
  scrub(time) {
    if (this.services.exporter.exporting) return Promise.resolve();
    if (!Number.isFinite(time)) throw new Error("Enter a finite video time.");
    const target = Math.max(
      0,
      Math.min(
        time,
        this.services.project.videoURL
          ? this.services.view.video.duration
          : this.services.project.timeline?.duration || time,
      ),
    );
    // Stop without redrawing: a redraw here would overwrite the slider's input.
    this.services.camera.cancelFrameMatching();
    this.stopPlayback();
    this.services.view.$("timeline").value = target;
    this.services.view.$("seek-time").value = target.toFixed(3);
    return this.previewSeeks.request(target);
  }
  async play() {
    if (!this.services.project.videoURL) throw new Error("Choose a video first.");
    this.services.camera.cancelFrameMatching();
    if (!this.services.view.video.paused) {
      this.pause();
      return;
    }
    await this.previewSeeks.idle();
    this.services.ui.readSettings();
    this.services.view.audio.currentTime = Math.max(
      0,
      timeMap(this.services.view.video.currentTime, this.services.project.current.mapping),
    );
    this.services.view.audio.playbackRate = this.services.project.current.mapping.a;
    this.services.view.audio.muted = this.services.view.$("phone-audio").checked;
    this.services.view.video.muted = !this.services.view.$("phone-audio").checked;
    await this.services.view.video.play();
    if (this.services.project.take)
      this.services.view.audio
        .play()
        .catch(() =>
          this.services.ui.notice("Clean WAV is not ready. Finalize or recover the take.", true),
        );
    this.services.view.$("play").textContent = "Pause";
  }
  videoFrame(_, metadata) {
    this.presentedPTS = metadata.mediaTime;
    if (!this.services.exporter.exporting && !this.services.view.video.paused) {
      const desired = timeMap(
        this.services.view.video.currentTime,
        this.services.project.current.mapping,
      );
      if (desired < 0) {
        this.services.view.audio.pause();
      } else if (
        this.services.view.audio.readyState >= 2 &&
        Math.abs(this.services.view.audio.currentTime - desired) > 0.08
      ) {
        this.services.view.audio.currentTime = desired;
        this.services.view.audio.play().catch(() => {});
      }
    }
    this.services.view.video.requestVideoFrameCallback(this.videoFrame);
  }
  animatePreview() {
    if (
      !this.services.exporter.exporting &&
      this.services.project.videoURL &&
      !this.services.view.video.paused
    ) {
      this.videoTime = this.services.view.video.currentTime;
      this.render();
    }
    requestAnimationFrame(this.animatePreview);
  }
}
