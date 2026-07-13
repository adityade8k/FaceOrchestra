export const RelationshipRuntimeMethods = {
  lockConnectedChordStates(startInstrument) {
    if (startInstrument?.kind !== "honk") return null;
    const group = this.honkLockService.lockFormation(startInstrument.id);
    if (!group) return null;
    this.applyLockGroupVisualState(group, true);
    this.scenePersistence?.markDirty?.();
    return group;
  },

  unlockHonkFormation(honkOrId) {
    const honkId = typeof honkOrId === "string" ? honkOrId : honkOrId?.id;
    const group = this.honkLockService.getGroupForMember(honkId);
    if (!group) return null;
    this.applyLockGroupVisualState(group, false);
    const unlocked = this.honkLockService.unlockGroup(group);
    this.scenePersistence?.markDirty?.();
    return unlocked;
  },

  applyLockGroupVisualState(group, locked) {
    for (const memberId of group?.getMemberIds?.() || group?.memberIds || []) {
      const member = this.instrumentRegistry.get(memberId);
      if (!member) continue;
      member.locked = Boolean(locked);
      this.updateLockVisual(member);
    }
  },

  updateLockedHonkGroupTransforms() {
    this.honkLockService.updateTransforms();
  },
};
