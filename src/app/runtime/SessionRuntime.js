import { SHOW_INSTRUCTION_PANEL } from "../../config/ui.js";


export const SessionRuntimeMethods = {
    onXRSessionStart() {
      this.xrSessionActive = true;
      this.instructionPanelClosed = !SHOW_INSTRUCTION_PANEL;
  
      if (SHOW_INSTRUCTION_PANEL) {
        this.showInstructionPanel();
      } else {
        this.hideInstructionPanel();
        if (this.instrumentStates.length === 0) {
          this.spawnDefaultInstrumentPreview();
        }
      }
    },
    onXRSessionEnd(now = performance.now()) {
      if (!this.xrSessionActive) return false;
      this.xrSessionActive = false;
      let didSave = false;
      try {
        this.hideInstructionPanel();
        this.pendingPanelPlacementFrames = 0;
        this.deletePendingSpawnPlacement();
        for (const looper of this.instrumentRegistry.getByKind("looper")) {
          if (looper.transport?.recording) {
            looper.finishRecording(now);
          }
          looper.stop();
        }
        didSave = this.savePersistedSceneOnXRExit();
      } finally {
        this.resetSubsystemsAfterSession();
      }
      return didSave;
    },
    showInstructionPanel() {
      if (!this.instructionPanel) {
        return;
      }
  
      this.instructionPanelView?.show();
      this.panelVisible = true;
      this.pendingPanelPlacementFrames = 4;
    },
    hideInstructionPanel() {
      if (!this.instructionPanel) {
        return;
      }
  
      this.instructionPanelView?.hide();
      this.panelVisible = false;
    },
    closeInstructionPanel() {
      this.hideInstructionPanel();
      this.instructionPanelClosed = true;
  
      if (this.instrumentStates.length === 0) {
        this.spawnDefaultInstrumentPreview();
      }
    },
    updatePendingPanelPlacement() {
      if (!this.pendingPanelPlacementFrames || !this.instructionPanel?.visible) {
        return;
      }
  
      this.instructionPanelView?.positionInFrontOfCamera(this.getUserCamera(), 1.15);
      this.pendingPanelPlacementFrames -= 1;
    },
    pollControllers(now = performance.now()) {
      this.inputSourceManager.poll(now);
    },
    pollController(controller, now = performance.now()) {
      this.inputSourceManager.pollController(controller, now);
    },
    findGamepad(handedness) {
      return this.inputSourceManager.findGamepad(handedness);
    },
    getControllerGamepad(controller) {
      return controller?.userData?.gamepad || this.findGamepad(controller?.userData?.handedness);
    },
    getThumbstickScaleDirection(gamepad) {
      return this.inputSourceManager.getThumbstickScaleDirection(gamepad);
    },
    getRightController() {
      return this.inputSourceManager.getRightController();
    },
    getControllerVoiceId(controller) {
      return controller.userData.handedness || `controller-${controller.userData.index}`;
    },
    getInstrumentVoiceId(controllerVoiceId, instrumentState) {
      return `${controllerVoiceId}:instrument-${instrumentState.id}`;
    },
};
