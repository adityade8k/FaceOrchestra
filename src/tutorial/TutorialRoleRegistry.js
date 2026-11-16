/**
 * @typedef {{ id: string, pendingPlacement?: boolean, disposed?: boolean }} RoleInstrument
 * @typedef {{ role: string, ids: string[] }} RoleAssignment
 * @typedef {{ mode?: string, step?: { role?: string } }} RoleSession
 */

/**
 * Owns lesson role membership and binding provenance. Instruments remain owned
 * by the instrument registry: every lookup reads its current state. Binding is
 * synchronous and clock-free; the adapter invalidates its wall-millisecond
 * evidence snapshot through onChange.
 */
export class TutorialRoleRegistry {
  /**
   * @param {object} dependencies
   * @param {(id: string) => RoleInstrument | undefined} dependencies.getInstrument
   * @param {() => RoleSession | undefined} dependencies.getSession
   * @param {(entryId: string, instruments: RoleInstrument[], context: object) => RoleAssignment[]} dependencies.resolveCommitted
   * @param {Map<string, string>} dependencies.previewRoles Catalog ID to lesson role.
   * @param {Map<string, string[]>} dependencies.memberRoles Ordered child roles for a group.
   * @param {() => void} dependencies.onChange Invalidates derived lesson evidence.
   */
  constructor({
    getInstrument,
    getSession,
    resolveCommitted,
    previewRoles = new Map(),
    memberRoles = new Map(),
    onChange = () => {},
  }) {
    this.getInstrument = getInstrument;
    this.getSession = getSession;
    this.resolveCommitted = resolveCommitted;
    this.previewRoles = previewRoles;
    this.memberRoles = memberRoles;
    this.onChange = onChange;
    this.roles = new Map();
    this.bindings = new Map();
    this.ordinaryHonks = new Set();
  }

  get(role) {
    return this.getInstrument(this.roles.get(role)?.[0]);
  }

  ids(role) {
    return this.roles.get(role) || [];
  }

  members(role) {
    return this.ids(role)
      .map((id) => this.getInstrument(id))
      .filter(Boolean);
  }

  roleForId(id) {
    for (const [role, ids] of this.roles) {
      if (this.memberRoles.has(role)) continue;
      if (ids.includes(id)) return role;
    }
    return null;
  }

  assign(role, ids, { source, entryId }) {
    this.roles.set(role, ids);
    this.bindings.set(role, { source, entryId });
    this.onChange();
  }

  remove(role) {
    this.roles.delete(role);
    this.bindings.delete(role);
    this.onChange();
  }

  bindPreview(entryId, instruments, source = "learner") {
    if (this.getSession()?.mode === "practice") return false;
    const role = this.previewRoles.get(entryId);
    if (!role) return false;
    const ids = instruments.map((h) => h.id);
    this.assign(role, ids, { source, entryId });
    this.memberRoles.get(role)?.forEach((childRole, index) => {
      this.assign(childRole, [ids[index]], { source, entryId });
    });
    return true;
  }

  bindCommitted(entryId, instruments) {
    const assignments = this.resolveCommitted(entryId, instruments, {
      get: this.getInstrument,
      ids: (role) => this.ids(role),
      step: this.getSession()?.step,
    });
    for (const { role, ids } of assignments) {
      this.assign(role, ids, { source: "learner", entryId });
    }
    this.onChange();
    return assignments;
  }

  rememberOrdinaryHonks(instruments) {
    for (const h of instruments) this.ordinaryHonks.add(h.id);
  }

  bindOrdinaryPercussion() {
    const session = this.getSession();
    if (
      session?.mode !== "practice" ||
      session.step?.role !== "percussion" ||
      this.get("percussion")
    )
      return;
    for (const id of this.ordinaryHonks) {
      const h = this.getInstrument(id);
      if (!h || h.disposed) {
        this.ordinaryHonks.delete(id);
        continue;
      }
      if (!h.pendingPlacement) {
        this.bindCommitted("honk", [h]);
        break;
      }
    }
  }

  clear() {
    this.ordinaryHonks.clear();
    this.roles.clear();
    this.bindings.clear();
    this.onChange();
  }
}
