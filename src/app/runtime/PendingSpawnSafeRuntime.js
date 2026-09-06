export const PendingSpawnSafeRuntimeMethods = {
  updateLooperPlaybackDuringPendingSpawn(now = performance.now()) {
    this.validateMetronomeConnections();
    this.clearLiveHornInteractionState();
    this.updateMetronomes(now);
    this.updateClockedLooperTransports(now);
    this.updateLooperRecordings(now);
    this.updateLooperPlayback(now);
    this.updateMetronomeConnections(now);
    this.applyResolvedHonkPerformanceStates(now);
    this.updateLooperPlaybackAudio();
    this.updateLooperMorphAnimations(now);
    this.updateLooperWires();
    this.updateMetronomeConnectionWires();
  },
};
