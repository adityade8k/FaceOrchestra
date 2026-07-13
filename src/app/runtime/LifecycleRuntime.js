

export const LifecycleRuntimeMethods = {
    handleInstrumentDeleteIntent(controller) {
      if (this.pendingSpawnPlacement) {
        return;
      }
  
      const instrumentState = this.getPointedInstrumentState(controller);
      if (!instrumentState) {
        return;
      }
  
      this.deleteInstrument(instrumentState);
    },
    deleteInstrument(instrumentState) {
      for (const controller of this.controllers) {
        const controllerState = this.controllerStates.get(controller);
        const interaction = controllerState?.activeTriggerInteraction;
        if (interaction?.activeVoiceIds?.has(this.getInstrumentVoiceId(interaction.voiceId, instrumentState))) {
          this.releaseHonkVoice(this.getInstrumentVoiceId(interaction.voiceId, instrumentState));
        }
  
        for (const activeVoiceId of controllerState?.raySqueezeActiveVoiceIds || []) {
          if (activeVoiceId === this.getInstrumentVoiceId(controllerState.raySqueezeVoiceId, instrumentState)) {
            this.releaseHonkVoice(activeVoiceId);
            controllerState.raySqueezeActiveVoiceIds.delete(activeVoiceId);
          }
        }
  
        if (interaction?.instrumentState === instrumentState) {
          if (interaction.type === "holdSqueeze") {
            for (const activeVoiceId of interaction.activeVoiceIds || []) {
              this.releaseHonkVoice(activeVoiceId);
            }
          }
          controllerState.activeTriggerInteraction = null;
        }
  
        if (controllerState?.gripInstrumentState === instrumentState) {
          controllerState.gripHeld = false;
          controllerState.gripInstrumentState = null;
          controllerState.gripSourceInstrumentState = null;
        }
  
        if (controllerState?.gripSourceInstrumentState === instrumentState) {
          controllerState.gripSourceInstrumentState = null;
        }
  
        if (controllerState?.raySqueezeInstrumentState === instrumentState) {
          controllerState.raySqueezeInstrumentState = null;
        }
  
        if (controllerState?.hoveredTarget && this.isObjectInInstrument(controllerState.hoveredTarget, instrumentState)) {
          this.setTargetHighlight(controllerState.hoveredTarget, false);
          controllerState.hoveredTarget = null;
        }

        if (interaction?.looperState === instrumentState) {
          if (interaction.type === "looperWire") this.disposeWireMesh(interaction.wireMesh);
          controllerState.activeTriggerInteraction = null;
        }
      }
  
      this.instrumentLifecycle.deleteInstrument(instrumentState.id);
  
      if (this.activeInstrumentState === instrumentState) {
        this.activeInstrumentState = this.instrumentStates.at(-1) || null;
      }
      this.savePersistedScene();
    },
    isObjectInInstrument(object, instrumentState) {
      let current = object;
      while (current) {
        if (current === instrumentState.root) {
          return true;
        }
        current = current.parent;
      }
      return false;
    },
};
