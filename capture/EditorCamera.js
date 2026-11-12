import { timeMap } from "/src/capture/format.js";

import { projectPoint } from "/src/capture/calibration.js";

import { CameraHistory, validCamera, normalizeBookmarks } from "/src/capture/alignment.js";

import {
  normalizeFrameMatches,
  savedFrameObservations,
  fitSavedFrames,
  cameraMatchError,
} from "/src/capture/savedFrames.js";

export class EditorCamera {
  constructor(services) {
    this.services = services;
    for (const name of Object.getOwnPropertyNames(EditorCamera.prototype))
      if (name !== "constructor") this[name] = this[name].bind(this);
    this.selectedPoint = false;
    this.pendingFrame = null;
    this.observationCache = null;
    this.cameraHistory = new CameraHistory();
    this.handleStartCamera = null;
    this.cameraFields = [
      "cam-x",
      "cam-y",
      "cam-z",
      "cam-pitch",
      "cam-yaw",
      "cam-roll",
      "cam-fov",
      "cam-cx",
      "cam-cy",
    ];
    this.cameraState = () => ({
      camera: this.services.project.current.camera,
      calibration: this.services.project.current.calibration,
      frameFit: this.services.project.current.frameFit,
    });
  }
  updateCameraInputs() {
    const values = [
      ...this.services.project.current.camera.position,
      ...this.services.project.current.camera.rotation,
      this.services.project.current.camera.fov,
      ...this.services.project.current.camera.center,
    ];
    this.cameraFields.forEach((id, i) => {
      if (document.activeElement !== this.services.view.$(id))
        this.services.view.$(id).value = values[i];
    });
    // Only this readout is rounded. Project data and fine inputs keep exact values.
    this.services.view.$("lens-fov").value = this.services.project.current.camera.fov;
    this.services.view.$("lens-value").textContent =
      `${this.services.project.current.camera.fov.toFixed(1)}°`;
    this.services.view.$("undo-camera").disabled =
      this.services.exporter.exporting || !this.cameraHistory.available(this.cameraState());
  }
  beginCameraEdit() {
    if (this.services.exporter.exporting) return;
    this.cancelFrameMatching();
    this.services.preview.pause();
    this.cameraHistory.begin(this.cameraState());
    this.selectedPoint = false;
    this.services.view.canvas.classList.remove("pick-landmark");
  }
  applyCamera(camera) {
    if (this.services.exporter.exporting || !validCamera(camera)) return;
    this.services.project.current.camera = camera;
    this.services.project.current.calibration = null;
    this.services.project.current.frameFit = null;
    this.updateCameraInputs();
    this.updateObservations();
    this.updateFrameFit();
    this.services.preview.render();
  }
  finishCameraEdit() {
    this.cameraHistory.commit(this.cameraState());
    this.updateCameraInputs();
  }
  updateBookmarks() {
    this.services.view.$("save-frame").disabled =
      this.services.exporter.exporting ||
      !this.services.project.timeline ||
      !this.services.project.videoURL;
    this.services.view.$("saved-frames").replaceChildren();
    if (!this.services.project.current.bookmarks.length) {
      const empty = document.createElement("span");
      empty.className = "empty-frames";
      empty.textContent = "Save clear controller poses to start matching.";
      this.services.view.$("saved-frames").append(empty);
    }
    for (const time of this.services.project.current.bookmarks) {
      const group = document.createElement("span");
      group.className = "bookmark";
      const count =
        this.services.project.current.frameMatches.find(
          (frame) => Math.abs(frame.videoTime - time) < 0.001,
        )?.points.length || 0;
      const visit = document.createElement("button");
      visit.textContent = `${time.toFixed(3)} s${count ? ` · ${count} matched` : ""}`;
      visit.dataset.time = time;
      visit.disabled = !this.services.project.timeline || !this.services.project.videoURL;
      visit.title = this.services.project.videoURL
        ? `Check video time ${time} seconds. Save this frame again to replace its matches.`
        : "Reselect the matching video to check this frame";
      visit.onclick = this.services.ui.run(() => this.services.preview.scrub(time));
      const remove = document.createElement("button");
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Remove saved frame ${time.toFixed(3)} seconds`);
      remove.onclick = () => {
        this.cancelFrameMatching();
        this.services.project.current.bookmarks = this.services.project.current.bookmarks.filter(
          (value) => value !== time,
        );
        this.services.project.current.frameMatches = normalizeFrameMatches(
          this.services.project.current.frameMatches,
          this.services.project.current.bookmarks,
        );
        this.refineSavedCamera();
        this.updateBookmarks();
        this.services.preview.render();
      };
      group.append(visit, remove);
      this.services.view.$("saved-frames").append(group);
    }
    this.updateFrameFit();
  }
  frameObservations() {
    if (!this.services.project.timeline) return [];
    if (
      this.observationCache?.timeline !== this.services.project.timeline ||
      this.observationCache.matches !== this.services.project.current.frameMatches ||
      this.observationCache.mapping !== this.services.project.current.mapping ||
      this.observationCache.segment !== this.services.project.current.segment
    ) {
      this.observationCache = {
        timeline: this.services.project.timeline,
        matches: this.services.project.current.frameMatches,
        mapping: this.services.project.current.mapping,
        segment: this.services.project.current.segment,
        points: savedFrameObservations(
          this.services.project.current.frameMatches,
          this.services.project.timeline,
          this.services.project.current.mapping,
          this.services.project.current.segment,
        ),
      };
    }
    return this.observationCache.points;
  }
  updateFrameFit() {
    const points = this.frameObservations(),
      rms = cameraMatchError(points, this.services.project.current.camera),
      fit = this.services.project.current.frameFit;
    this.services.view.$("frame-fit").textContent = points.length
      ? `${fit?.message || "Saved controller matches. Save another frame to refine."} ${points.length} matches · ${Number.isFinite(rms) ? rms.toFixed(1) + " px match error" : "points outside camera view"} (1080 × 1920). Approximate grip fit, not independently validated.`
      : "Save a frame, then click its left and right controllers to estimate the camera.";
    this.services.view.$("frame-fit").classList.toggle("bad", fit?.status === "rejected");
  }
  cancelFrameMatching() {
    this.pendingFrame = null;
    this.services.view.$("frame-matching").hidden = true;
    this.services.view.canvas.classList.remove("pick-landmark");
  }
  refineSavedCamera() {
    const result = fitSavedFrames(this.frameObservations(), this.services.project.current.camera);
    if (result.applied) {
      this.finishCameraEdit();
      this.beginCameraEdit();
      this.services.project.current.camera = result.camera;
      this.services.project.current.calibration = null;
    }
    const { camera, ...report } = result;
    this.services.project.current.frameFit = report;
    if (result.applied) this.finishCameraEdit();
    this.updateCameraInputs();
    this.updateObservations();
    this.updateFrameFit();
  }
  advanceFrameMatching() {
    if (!this.pendingFrame) return;
    if (this.pendingFrame.index >= this.pendingFrame.hands.length) {
      const completed = this.pendingFrame;
      this.cancelFrameMatching();
      if (completed.points.length) {
        this.services.project.current.frameMatches = normalizeFrameMatches(
          [
            ...this.services.project.current.frameMatches.filter(
              (frame) => Math.abs(frame.videoTime - completed.videoTime) >= 0.001,
            ),
            completed,
          ],
          this.services.project.current.bookmarks,
        );
        this.refineSavedCamera();
        this.services.ui.notice(this.services.project.current.frameFit.message);
      } else this.services.ui.notice("Frame saved as a bookmark. No controller matches changed.");
      this.updateBookmarks();
      this.services.preview.render();
      return;
    }
    const hand = this.pendingFrame.hands[this.pendingFrame.index];
    this.services.view.$("frame-matching").hidden = false;
    this.services.view.$("match-prompt").textContent =
      `Click the ${hand.toUpperCase()} controller in the phone video`;
    this.services.view.canvas.classList.add("pick-landmark");
    this.services.ui.notice(
      `Saved frame: click the ${hand} controller's grip center, or skip it if hidden.`,
    );
    this.services.preview.render();
  }
  updateObservations() {
    this.services.view.$("observations").replaceChildren();
    for (const [index, o] of this.services.project.current.observations.entries()) {
      const p = projectPoint(o.world, this.services.project.current.camera),
        error = p ? Math.hypot(p[0] - o.pixel[0], p[1] - o.pixel[1]) : Infinity;
      const row = document.createElement("li");
      row.textContent = `${o.heldOut ? "VALIDATE" : "FIT"} · ${o.hand} · ${o.videoTime.toFixed(3)}s · ${error.toFixed(1)} px`;
      const remove = document.createElement("button");
      remove.textContent = "Remove";
      remove.onclick = () => {
        this.services.project.current.observations.splice(index, 1);
        this.services.project.current.calibration = null;
        this.cameraHistory.clear();
        this.updateCameraInputs();
        this.updateObservations();
        this.services.preview.render();
      };
      row.append(remove);
      this.services.view.$("observations").append(row);
    }
    const c = this.services.project.current.calibration;
    this.services.view.$("fit-report").textContent = c
      ? `${c.valid ? "Fit accepted" : "FIT FAILED"} · ${c.fitRms.toFixed(2)} px RMS\nHeld-out: ${c.heldOutRms === null ? "add observations" : c.heldOutRms.toFixed(2) + " px RMS"}\n${c.validated ? "Held-out validation passed" : "Not validated: use at least two additional observations"}`
      : "Manual / uncalibrated camera";
    this.services.view.$("fit-report").classList.toggle("bad", Boolean(c && !c.valid));
  }
  async saveFrame() {
    if (!this.services.project.timeline || !this.services.project.videoURL)
      throw new Error("Load a take and video first.");
    await this.services.preview.previewSeeks.idle();
    this.cancelFrameMatching();
    this.services.preview.pause();
    await this.services.preview.seek(this.services.preview.videoTime);
    this.services.ui.readSettings();
    this.selectedPoint = false;
    const savedTime =
      this.services.project.current.bookmarks.find(
        (time) => Math.abs(time - this.services.preview.videoTime) < 0.001,
      ) ?? this.services.preview.videoTime;
    this.services.project.current.bookmarks = normalizeBookmarks(
      [...this.services.project.current.bookmarks, savedTime],
      this.services.view.video.duration,
    );
    this.updateBookmarks();
    const sceneTime = timeMap(
        this.services.preview.presentedPTS,
        this.services.project.current.mapping,
      ),
      frame = this.services.project.timeline.seek(sceneTime);
    const hands =
      frame &&
      sceneTime >= this.services.project.timeline.frames[0].t &&
      sceneTime <= this.services.project.timeline.duration &&
      !frame.gap &&
      frame.segment === this.services.project.current.segment
        ? ["left", "right"].filter((hand) =>
            frame.xr.controllers.some((c) => c.handedness === hand && c.grip),
          )
        : [];
    if (!hands.length) {
      this.services.ui.notice(
        "Frame bookmarked, but no tracked controllers at this mapped time. Check synchronization or choose another frame.",
      );
      this.services.preview.render();
      return;
    }
    this.pendingFrame = {
      videoTime: savedTime,
      sampleTime: this.services.preview.presentedPTS,
      points: [],
      hands,
      index: 0,
    };
    this.advanceFrameMatching();
    this.services.view.$("frame-matching").scrollIntoView({ block: "nearest" });
  }
  cancelMatch() {
    this.cancelFrameMatching();
    this.services.preview.render();
    this.services.ui.notice("Matching cancelled. Existing saved matches are unchanged.");
  }
}
