export const SINGLE_METRONOME_MESSAGE = 'Only one metronome can be placed. Use the existing metronome.';

// One policy per active registry. Serialized snapshots never reserve a slot.
export class InstrumentAdmissionPolicy {
  constructor(registry, onRejected = () => {}) {
    this.registry = registry;
    this.onRejected = onRejected;
    this.reservation = null;
  }

  reserve(kind, token = null) {
    if (kind !== 'metronome') return {};
    const existing = this.registry.getByKind('metronome').find(h => !h.disposed);
    if (existing || (this.reservation && this.reservation !== token)) {
      this.onRejected(SINGLE_METRONOME_MESSAGE, existing);
      return null;
    }
    return this.reservation ||= token || {};
  }

  admit(instrument) {
    if (instrument.kind !== 'metronome') return true;
    const token = this.reserve(instrument.kind, instrument.creationReservation);
    if (!token) return false;
    this.release(token);
    return true;
  }

  release(token) {
    if (token === this.reservation) this.reservation = null;
  }
}
