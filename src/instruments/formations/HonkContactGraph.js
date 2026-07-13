export class HonkContactGraph {
  constructor() {
    this.adjacency = new Map();
    this.listeners = new Set();
  }

  addHonk(honkId) {
    if (!honkId) {
      return false;
    }
    if (this.adjacency.has(honkId)) {
      return false;
    }
    this.adjacency.set(honkId, new Set());
    this.emit({ type: "honk.added", honkId });
    return true;
  }

  removeHonk(honkId) {
    const contacts = this.adjacency.get(honkId);
    if (!contacts) {
      return false;
    }
    for (const otherId of [...contacts]) {
      this.setContact(honkId, otherId, false);
    }
    this.adjacency.delete(honkId);
    this.emit({ type: "honk.removed", honkId });
    return true;
  }

  hasHonk(honkId) {
    return this.adjacency.has(honkId);
  }

  setContact(firstId, secondId, touching) {
    if (!firstId || !secondId || firstId === secondId) {
      return false;
    }
    if (!touching && (!this.adjacency.has(firstId) || !this.adjacency.has(secondId))) {
      return false;
    }
    if (touching) {
      this.addHonk(firstId);
      this.addHonk(secondId);
    }
    const firstContacts = this.adjacency.get(firstId);
    const secondContacts = this.adjacency.get(secondId);
    const active = firstContacts.has(secondId);
    const shouldBeActive = Boolean(touching);
    if (active === shouldBeActive) {
      return false;
    }

    if (shouldBeActive) {
      firstContacts.add(secondId);
      secondContacts.add(firstId);
    } else {
      firstContacts.delete(secondId);
      secondContacts.delete(firstId);
    }
    this.emit({
      type: shouldBeActive ? "contact.enter" : "contact.exit",
      firstId,
      secondId,
    });
    return true;
  }

  hasContact(firstId, secondId) {
    return Boolean(this.adjacency.get(firstId)?.has(secondId));
  }

  getContacts(honkId) {
    return new Set(this.adjacency.get(honkId) || []);
  }

  getConnectedComponent(startId) {
    if (!this.adjacency.has(startId)) {
      return new Set();
    }
    const component = new Set();
    const queue = [startId];
    while (queue.length > 0) {
      const honkId = queue.shift();
      if (component.has(honkId)) {
        continue;
      }
      component.add(honkId);
      for (const neighborId of this.adjacency.get(honkId) || []) {
        if (!component.has(neighborId)) {
          queue.push(neighborId);
        }
      }
    }
    return component;
  }

  getConnectedComponents({ minimumSize = 1 } = {}) {
    const components = [];
    const visited = new Set();
    for (const honkId of this.adjacency.keys()) {
      if (visited.has(honkId)) {
        continue;
      }
      const component = this.getConnectedComponent(honkId);
      for (const memberId of component) {
        visited.add(memberId);
      }
      if (component.size >= minimumSize) {
        components.push(component);
      }
    }
    return components;
  }

  getEdges() {
    const edges = [];
    const seen = new Set();
    for (const [firstId, contacts] of this.adjacency) {
      for (const secondId of contacts) {
        const key = canonicalPairKey(firstId, secondId);
        if (!seen.has(key)) {
          seen.add(key);
          edges.push([firstId, secondId]);
        }
      }
    }
    return edges;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear() {
    for (const honkId of [...this.adjacency.keys()]) {
      this.removeHonk(honkId);
    }
  }

  emit(event) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export function canonicalPairKey(firstId, secondId) {
  return String(firstId) < String(secondId)
    ? `${firstId}\u0000${secondId}`
    : `${secondId}\u0000${firstId}`;
}
