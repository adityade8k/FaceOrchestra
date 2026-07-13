export class TransformTargetResolver {
  constructor({ instrumentRegistry, formationTransformResolver = null, profileResolver = null } = {}) {
    this.instrumentRegistry = instrumentRegistry;
    this.formationTransformResolver = formationTransformResolver;
    this.profileResolver = profileResolver;
  }

  resolve(target) {
    const instrument = this.resolveInstrument(target);
    if (!instrument) {
      return null;
    }
    const formationTarget = this.formationTransformResolver?.resolve?.(instrument);
    return this.withProfile(formationTarget || instrument, instrument);
  }

  resolveInstrument(target) {
    if (!target) {
      return null;
    }
    if (typeof target === "string") {
      return this.instrumentRegistry?.get(target) || null;
    }
    if (target.id && target.root) {
      return this.instrumentRegistry?.get(target.id) || target;
    }
    return this.instrumentRegistry?.getFromObject3D(target) || null;
  }

  withProfile(transformTarget, sourceInstrument) {
    const profile = this.profileResolver?.(transformTarget, sourceInstrument) || null;
    if (!profile) {
      return transformTarget;
    }
    return {
      id: transformTarget.id,
      root: transformTarget.root,
      source: transformTarget,
      profile,
      getScale: () => transformTarget.getScale(),
      setScale: (scale) => {
        const clamped = Number.isFinite(scale)
          ? Math.min(Math.max(scale, profile.minScale ?? -Infinity), profile.maxScale ?? Infinity)
          : scale;
        return transformTarget.setScale(clamped);
      },
    };
  }
}
