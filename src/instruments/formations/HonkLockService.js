import { HONK_LOCK_SETTINGS } from "../../config/formations.js";
import { INSTRUMENT_KINDS } from "../core/capabilities.js";
import { createIdFactory } from "../core/id.js";
import { createTransformAdapter, HonkLockGroup } from "./HonkLockGroup.js";

export class HonkLockService {
  constructor({
    instrumentRegistry,
    formationService,
    transformAdapter = createTransformAdapter(),
    idFactory = createIdFactory(HONK_LOCK_SETTINGS.idPrefix),
    minimumMembers = HONK_LOCK_SETTINGS.minimumMembers,
  } = {}) {
    if (!instrumentRegistry || !formationService) {
      throw new TypeError("HonkLockService requires instrumentRegistry and formationService.");
    }
    this.instrumentRegistry = instrumentRegistry;
    this.formationService = formationService;
    this.transformAdapter = transformAdapter;
    this.idFactory = idFactory;
    this.minimumMembers = minimumMembers;
    this.groups = new Map();
    this.groupIdByMember = new Map();
    this.listeners = new Set();
    this.unsubscribeRegistry = instrumentRegistry.subscribe?.((event) => {
      if (event.type === "instrument.removed") {
        this.removeMember(event.instrumentId);
      }
    }) || null;
  }

  lockFormation(honkId) {
    const existing = this.getGroupForMember(honkId);
    if (existing) {
      return existing;
    }
    const formation = this.formationService.getFormationForHonk(honkId);
    if (!formation) {
      return null;
    }

    // Existing lock groups are immutable memberships. Contacting them neither
    // adds a new honk nor merges two groups.
    const eligibleMemberIds = formation.memberIds.filter((memberId) => !this.groupIdByMember.has(memberId));
    if (!eligibleMemberIds.includes(honkId) || eligibleMemberIds.length < this.minimumMembers) {
      return null;
    }
    return this.lockMembers(eligibleMemberIds, { anchorId: honkId });
  }

  lockMembers(memberIds, {
    id = this.idFactory(),
    anchorId = memberIds?.[0],
    memberLocalTransforms = null,
  } = {}) {
    const uniqueMemberIds = [...new Set(memberIds || [])].filter((memberId) => {
      const instrument = this.instrumentRegistry.get(memberId);
      return instrument?.kind === INSTRUMENT_KINDS.honk && !instrument.disposed;
    });
    if (uniqueMemberIds.length < this.minimumMembers || !uniqueMemberIds.includes(anchorId)) {
      return null;
    }
    if (this.groups.has(id) || uniqueMemberIds.some((memberId) => this.groupIdByMember.has(memberId))) {
      return null;
    }

    const group = new HonkLockGroup({
      id,
      memberIds: uniqueMemberIds,
      anchorId,
      resolveInstrument: (memberId) => this.instrumentRegistry.get(memberId),
      transformAdapter: this.transformAdapter,
      memberLocalTransforms,
    });
    this.groups.set(group.id, group);
    for (const memberId of group.memberIds) {
      this.groupIdByMember.set(memberId, group.id);
    }
    this.emit({ type: "honk-lock.created", group });
    return group;
  }

  unlockGroup(groupOrId, { reason = "user" } = {}) {
    const group = typeof groupOrId === "string" ? this.groups.get(groupOrId) : groupOrId;
    if (!group || !this.groups.has(group.id)) {
      return null;
    }
    this.groups.delete(group.id);
    for (const memberId of group.memberIds) {
      if (this.groupIdByMember.get(memberId) === group.id) {
        this.groupIdByMember.delete(memberId);
      }
    }
    this.emit({ type: "honk-lock.removed", group, reason });
    return group;
  }

  unlockMember(honkId, options = {}) {
    const group = this.getGroupForMember(honkId);
    return group ? this.unlockGroup(group, options) : null;
  }

  removeMember(honkId) {
    const group = this.getGroupForMember(honkId);
    if (!group) {
      return null;
    }
    this.groupIdByMember.delete(honkId);
    group.removeMember(honkId);
    this.emit({ type: "honk-lock.member-removed", group, honkId });
    if (group.size < this.minimumMembers) {
      this.unlockGroup(group, { reason: "insufficient-members" });
      return null;
    }
    return group;
  }

  getGroup(groupId) {
    return this.groups.get(groupId) || null;
  }

  getGroupForMember(honkId) {
    const groupId = this.groupIdByMember.get(honkId);
    return groupId ? this.groups.get(groupId) || null : null;
  }

  updateTransforms() {
    for (const group of this.groups.values()) {
      group.updateMemberTransforms();
    }
  }

  serialize() {
    return [...this.groups.values()].map((group) => group.serialize());
  }

  restore(serializedGroups = []) {
    const restored = [];
    for (const serialized of serializedGroups) {
      const group = this.lockMembers(serialized.memberIds, {
        id: serialized.id,
        anchorId: serialized.anchorId,
        memberLocalTransforms: serialized.memberLocalTransforms,
      });
      if (group) {
        group.updateMemberTransforms();
        restored.push(group);
      }
    }
    return restored;
  }

  reset({ reason = "session-reset" } = {}) {
    const removed = [];
    for (const group of [...this.groups.values()]) {
      const unlocked = this.unlockGroup(group, { reason });
      if (unlocked) {
        removed.push(unlocked);
      }
    }
    return removed;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose() {
    this.unsubscribeRegistry?.();
    this.unsubscribeRegistry = null;
    this.reset({ reason: "service-disposed" });
    this.listeners.clear();
  }

  emit(event) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
