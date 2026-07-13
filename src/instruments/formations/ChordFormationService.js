export class ChordFormationService {
  constructor({ contactGraph, minimumMembers = 2 } = {}) {
    if (!contactGraph) {
      throw new TypeError("ChordFormationService requires a HonkContactGraph.");
    }
    this.contactGraph = contactGraph;
    this.minimumMembers = minimumMembers;
  }

  getFormationForHonk(honkId, { includeSingleton = false } = {}) {
    const memberIds = this.contactGraph.getConnectedComponent(honkId);
    const minimum = includeSingleton ? 1 : this.minimumMembers;
    return memberIds.size >= minimum ? createFormation(memberIds) : null;
  }

  getFormations({ includeSingletons = false } = {}) {
    const minimumSize = includeSingletons ? 1 : this.minimumMembers;
    return this.contactGraph
      .getConnectedComponents({ minimumSize })
      .map(createFormation);
  }

  areInSameFormation(firstId, secondId) {
    return this.contactGraph.getConnectedComponent(firstId).has(secondId);
  }
}

function createFormation(memberSet) {
  const memberIds = [...memberSet].sort();
  return Object.freeze({
    id: `contact-formation:${memberIds.join("+")}`,
    memberIds: Object.freeze(memberIds),
    size: memberIds.length,
    transient: true,
  });
}
