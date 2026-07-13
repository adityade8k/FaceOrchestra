export class FormationTransformResolver {
  constructor({ lockService } = {}) {
    this.lockService = lockService;
  }

  resolve(instrument) {
    if (!instrument?.id) {
      return null;
    }
    const group = this.lockService?.getGroupForMember(instrument.id);
    return group ? new LockGroupTransformTarget(group) : instrument;
  }
}

export class LockGroupTransformTarget {
  constructor(group) {
    this.group = group;
    this.id = group.id;
    this.kind = "honk-lock-group";
  }

  get root() {
    return this.group.root;
  }

  getScale() {
    return this.group.getScale();
  }

  setScale(scale) {
    this.group.setScale(scale);
    return this;
  }

  updateMembers() {
    this.group.updateMemberTransforms();
  }
}
