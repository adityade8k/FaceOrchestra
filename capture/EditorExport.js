import { timeMap, exportTimes } from "/src/capture/format.js";

export class EditorExport {
  constructor(services) {
    this.services = services;
    for (const name of Object.getOwnPropertyNames(EditorExport.prototype))
      if (name !== "constructor") this[name] = this[name].bind(this);
    this.exportVideo = document.createElement("canvas");
    this.exportVideoContext = this.exportVideo.getContext("2d");
    this.exporting = false;
    this.cancelled = false;
  }
  async exportProject() {
    await this.services.preview.previewSeeks.idle();
    if (!this.services.project.timeline || !this.services.project.videoURL)
      throw new Error("Load a take and a phone video before exporting.");
    this.services.ui.readSettings();
    if (this.services.project.current.trim.end > this.services.view.video.duration + 0.001)
      throw new Error("Trim extends beyond the video.");
    if (
      this.services.project.current.calibration &&
      !this.services.project.current.calibration.valid
    )
      throw new Error(
        "Calibration fit failed. Correct it or adjust the manual camera before exporting.",
      );
    const times = exportTimes({
      ...this.services.project.current.trim,
      fps: this.services.project.current.output.fps,
    });
    this.services.preview.pause();
    this.exporting = true;
    this.services.view.inspector.setLocked(true);
    this.cancelled = false;
    this.services.view.$("export").disabled = true;
    this.services.view.$("cancel-export").hidden = false;
    this.services.view.$("export-progress").hidden = false;
    this.services.view.$("export-progress").max = times.count;
    this.services.view.$("export-result").replaceChildren();
    this.services.camera.selectedPoint = false;
    this.services.camera.cancelFrameMatching();
    const controls = [...document.querySelectorAll("input,select,button")]
      .filter((el) => el.id !== "cancel-export")
      .map((el) => [el, el.disabled]);
    for (const [el] of controls) el.disabled = true;
    const oldTime = this.services.preview.videoTime;
    const pts = [];
    try {
      const job = await this.services.ui.post("/api/exports", this.services.project.current);
      this.services.view.canvas.width = this.services.project.current.output.width;
      this.services.view.canvas.height = this.services.project.current.output.height;
      this.services.view.renderer.setSize(
        this.services.view.canvas.width,
        this.services.view.canvas.height,
      );
      for (let i = 0; i < times.count; i++) {
        if (this.cancelled)
          throw new Error(
            "Export cancelled. Partial frames remain on the local service; no completed movie was produced.",
          );
        const decoded = await this.services.preview.seek(times.at(i));
        this.services.preview.render({
          time: times.at(i),
          transparent: !job.ffmpeg,
          calibration: false,
          videoSource: decoded.source,
          strict: true,
        });
        pts.push({
          output: i / this.services.project.current.output.fps,
          video: times.at(i),
          presentedPTS: this.services.preview.presentedPTS,
          scene: timeMap(times.at(i), this.services.project.current.mapping),
        });
        const png = await new Promise((resolve) =>
          this.services.view.canvas.toBlob(resolve, "image/png"),
        );
        if (!png) throw new Error("PNG rendering failed.");
        await this.services.ui.api(`/api/exports/${job.id}/frame/${i}`, {
          method: "PUT",
          body: png,
        });
        this.services.view.$("export-progress").value = i + 1;
        this.services.ui.notice(
          `Rendering ${i + 1} / ${times.count} frames locally${job.ffmpeg ? "" : " · transparent PNG fallback"}`,
        );
      }
      this.services.ui.notice("Finalizing clean audio and local export…");
      const result = await this.services.ui.post(`/api/exports/${job.id}/finish`, {});
      const addLink = (name, label) => {
        const a = document.createElement("a");
        a.href = `/api/exports/${job.id}/${name}`;
        a.textContent = label;
        a.download = name;
        this.services.view.$("export-result").append(a);
      };
      if (result.ffmpeg) addLink("composite.mp4", "Download MP4");
      addLink(
        "archive.tar",
        result.ffmpeg ? "PNG sequence + WAV" : "Transparent PNG sequence + WAV",
      );
      addLink("audio.wav", "Clean WAV");
      addLink("project.json", "Project");
      addLink("README.txt", "Premiere instructions");
      this.services.ui.notice(
        result.ffmpeg
          ? "MP4 export complete. Clean audio and frame timestamps use the project mapping."
          : "Transparent PNG sequence + aligned WAV ready. Files are also in captures/exports on this laptop.",
      );
      return { ...result, timestamps: pts };
    } finally {
      this.exporting = false;
      this.services.view.inspector.setLocked(false);
      for (const [el, disabled] of controls) el.disabled = disabled;
      this.services.view.$("export").disabled = false;
      this.services.view.$("cancel-export").hidden = true;
      this.services.view.canvas.width = 540;
      this.services.view.canvas.height = 960;
      this.services.view.renderer.setSize(540, 960);
      await this.services.preview.seek(oldTime);
    }
  }
}
