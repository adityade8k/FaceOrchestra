import * as THREE from "three";

const vector = new THREE.Vector3(),
  quaternion = new THREE.Quaternion(),
  scale = new THREE.Vector3();
const textureSlots = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "emissiveMap",
  "alphaMap",
  "aoMap",
];
const layers = (node, inherited) =>
  /label/i.test(node.name) ? "labels" : inherited;
const materialList = (node) =>
  node.material
    ? Array.isArray(node.material)
      ? node.material
      : [node.material]
    : [];

/** Cached presentation bindings, not a persistence serializer or a second simulation.
 * Node IDs are take-scoped paths assigned at first bind; no reload UUID assumptions.
 * Resource encoding is deferred until after the XR callback.
 */
export class PresentationCapture {
  constructor(runtime, emit, { includeUI = false } = {}) {
    this.runtime = runtime;
    this.emit = emit;
    this.includeUI = includeUI;
    this.bindings = [];
    this.roots = new Map();
    this.ids = new WeakMap();
    this.resources = new WeakMap();
    this.pending = [];
    this.nextResource = 0;
    this.nextNode = 0;
    this.buffers = [];
    this.inflight = 0;
  }
  resource(value, kind, version = 0) {
    if (!value) return null;
    let record = this.resources.get(value);
    if (!record) {
      record = { versions: new Map() };
      this.resources.set(value, record);
    }
    if (record.versions.has(version)) return record.versions.get(version);
    const id = `r${++this.nextResource}`;
    record.versions.clear();
    record.versions.set(version, id);
    this.pending.push({ id, value, kind });
    return id;
  }
  bind(node, parent, owner, layer, t) {
    if (this.ids.has(node)) return this.ids.get(node);
    const id = `${owner}/n${++this.nextNode}`;
    this.ids.set(node, id);
    const binding = {
      id,
      node,
      parent,
      owner,
      layer: layers(node, layer),
      children: [],
      geometry: null,
      maps: [],
      descriptor: null,
    };
    this.bindings.push(binding);
    this.emit(
      "node",
      {
        id,
        parent,
        owner,
        layer: binding.layer,
        name: node.name,
        type: node.type,
        renderOrder: node.renderOrder,
        castShadow: node.castShadow,
        receiveShadow: node.receiveShadow,
        morphDictionary: node.morphTargetDictionary || null,
      },
      t,
    );
    return id;
  }
  scanRoots(t) {
    const candidates = [];
    for (const entity of this.runtime.instrumentRegistry.values())
      candidates.push([entity.id, entity.root, "instruments", entity]);
    // Wires are direct scene children. This is a shallow scan, never a scene traversal.
    for (const node of this.runtime.scene.children)
      if (/^(LOOPER|METRONOME|CONNECTION)_wire/.test(node.name))
        candidates.push([`wire-${node.id}`, node, "wires", null]);
    if (this.includeUI) {
      // Guidance is opt-in alongside UI; clean MR never binds these roots.
      for (const node of this.runtime.tutorial?.cues?.captureRoots?.() || [])
        candidates.push([`guidance-${node.id}`, node, "tutorial", null]);
      for (const [index, c] of this.runtime.controllers.entries()) {
        if (c.userData.radialMenu)
          candidates.push([
            `menu-${index}`,
            c.userData.radialMenu,
            "tutorial",
            null,
          ]);
        if (c.userData.rayLine)
          candidates.push([`ray-${index}`, c.userData.rayLine, "rays", null]);
      }
      for (const node of [
        this.runtime.instructionPanel,
        this.runtime.tutorial?.panel?.group,
      ])
        if (node) candidates.push([`ui-${node.id}`, node, "tutorial", null]);
      const adapter = this.runtime.tutorial?.adapter;
      for (const node of [
        ...(adapter?.labels?.values?.() || []),
        adapter?.focusRing,
      ])
        if (node)
          candidates.push([`tutorial-${node.id}`, node, "tutorial", null]);
    }
    const active = new Set(candidates.map((c) => c[0]));
    for (const [owner, entry] of this.roots)
      if (!active.has(owner)) {
        this.emit("delete", { owner }, t);
        this.roots.delete(owner);
        entry.deleted = true;
      }
    for (const [owner, node, layer, entity] of candidates)
      if (!this.roots.has(owner)) {
        this.roots.set(owner, { node, entity });
        this.bind(node, null, owner, layer, t);
        this.emit(
          "create",
          {
            owner,
            kind: entity?.kind || layer,
            componentId: entity?.componentId || null,
          },
          t,
        );
      }
    const removed = new Set();
    this.bindings = this.bindings.filter((b) => {
      const keep =
        this.roots.has(b.owner) &&
        (!b.parent ||
          (this.ids.get(b.node.parent) === b.parent && !removed.has(b.parent)));
      if (!keep) {
        removed.add(b.id);
        this.ids.delete(b.node);
      }
      return keep;
    });
  }
  sample(t) {
    this.scanRoots(t);
    // Bind only changed child lists. Iteration is over cached bindings in steady state.
    for (const binding of this.bindings) {
      if (!this.roots.has(binding.owner)) continue;
      const children = binding.node.children;
      if (
        children.length !== binding.children.length ||
        children.some((c, i) => c !== binding.children[i])
      ) {
        binding.children = children.slice();
        for (const child of children)
          this.bind(child, binding.id, binding.owner, binding.layer, t);
      }
    }
    let floats = 0;
    for (const b of this.bindings)
      if (this.roots.has(b.owner))
        floats +=
          11 +
          (b.node.morphTargetInfluences?.length || 0) +
          materialList(b.node).length * 8;
    let buffer = this.buffers.pop();
    if (!buffer || buffer.byteLength < floats * 4)
      buffer = new ArrayBuffer(floats * 4);
    const data = new Float32Array(buffer);
    const nodes = [];
    let at = 0;
    for (const b of this.bindings) {
      if (!this.roots.has(b.owner)) continue;
      const n = b.node,
        begin = at,
        materials = materialList(n);
      if (!b.parent) {
        n.updateWorldMatrix(true, false);
        n.matrixWorld.decompose(vector, quaternion, scale);
      } else {
        vector.copy(n.position);
        quaternion.copy(n.quaternion);
        scale.copy(n.scale);
      }
      vector.toArray(data, at);
      at += 3;
      quaternion.toArray(data, at);
      at += 4;
      scale.toArray(data, at);
      at += 3;
      let attached = true;
      if (b.parent) attached = this.ids.get(n.parent) === b.parent;
      else {
        let p = n;
        while (p && p !== this.runtime.scene) {
          if (!p.visible) attached = false;
          p = p.parent;
        }
        attached = attached && Boolean(p);
      }
      data[at++] = n.visible && attached ? 1 : 0;
      const morphs = n.morphTargetInfluences || [];
      for (const weight of morphs) data[at++] = weight;
      for (const m of materials) {
        for (const v of [
          m.color?.r ?? 1,
          m.color?.g ?? 1,
          m.color?.b ?? 1,
          m.emissive?.r ?? 0,
          m.emissive?.g ?? 0,
          m.emissive?.b ?? 0,
          m.opacity ?? 1,
          m.emissiveIntensity ?? 1,
        ])
          data[at++] = v;
      }
      const wire = n.userData.wirePathPlan;
      const geometry = wire ? null : this.resource(n.geometry, "geometry");
      const mats = materials.map((m) => {
        const maps = textureSlots.map((slot) =>
          this.resource(
            m[slot],
            "texture",
            m[slot]?.isCanvasTexture ? m[slot].version : 0,
          ),
        );
        // Material settings are recorded discretely; colors/opacity are in the sample.
        const key = `${maps.join(",")}/${m.visible}/${m.transparent}/${m.depthWrite}/${m.depthTest}/${m.side}/${m.wireframe}/${m.roughness}/${m.metalness}`;
        let cache = this.resources.get(m);
        if (!cache) {
          cache = { versions: new Map() };
          this.resources.set(m, cache);
        }
        if (!cache.versions.has(key)) {
          const id = `r${++this.nextResource}`;
          cache.versions.set(key, id);
          this.pending.push({
            id,
            kind: "material",
            value: m,
            maps: Object.fromEntries(
              textureSlots.map((slot, i) => [slot, maps[i]]),
            ),
          });
        }
        return cache.versions.get(key);
      });
      const skeleton = n.isSkinnedMesh
        ? {
            bones: n.skeleton.bones.map((bone) => this.ids.get(bone)),
            inverses: n.skeleton.boneInverses.map((m) => m.toArray()),
            bindMatrix: n.bindMatrix.toArray(),
          }
        : null;
      nodes.push({
        id: b.id,
        offset: begin,
        length: at - begin,
        morphs: morphs.length,
        geometry,
        materials: mats,
        wire: wire
          ? {
              plan: wire,
              radius: n.geometry.parameters?.radius,
              radialSegments: n.geometry.parameters?.radialSegments,
            }
          : null,
        skeleton,
      });
    }
    const semantic = [];
    for (const [owner, { entity: e }] of this.roots)
      if (e)
        semantic.push({
          id: owner,
          kind: e.kind,
          locked: Boolean(e.locked),
          pending: Boolean(e.pendingPlacement),
          equipped: Boolean(e.equipped),
          tuning: e.tuning ? { ...e.tuning } : null,
          performance: e.getResolvedPerformanceState?.() || null,
          transport: e.transport
            ? {
                state: e.transport.state,
                playing: Boolean(e.transport.playing),
                recording: Boolean(e.transport.recording),
                playArmed: Boolean(e.transport.playArmed),
                recordArmed: Boolean(e.transport.recordArmed),
                pauseArmed: Boolean(e.looperData?.pauseArmed),
                pendingLaunchBeat:
                  e.looperData?.pendingLaunch?.targetBeat ?? null,
                queuedLooperId:
                  e.looperData?.portGroup?.pending?.looper?.id ?? null,
              }
            : null,
          connections: (e.getTracks?.() || []).map((track) => ({
            trackId: track.trackId,
            honkId: track.connectedHonkId || null,
          })),
          bpm: e.bpm,
          volume: e.volume,
        });
    semantic.push({
      metronomeConnections:
        this.runtime.metronomeConnectionManager?.getConnections?.() || [],
    });
    return { buffer, nodes, semantic };
  }
  flushResources(t, { budgetMs = Infinity } = {}) {
    const began = performance.now();
    while (this.pending.length) {
      if (performance.now() - began >= budgetMs) break;
      const item = this.pending.shift();
      let data;
      if (item.kind === "geometry") {
        if (item.value.userData.captureAsset) {
          this.emit(
            "resource",
            {
              id: item.id,
              kind: "asset-geometry",
              data: item.value.userData.captureAsset,
            },
            t,
          );
          continue;
        }
        // Serialize the actual buffers even for procedural Text/ShapeGeometry.
        const proxy = new THREE.BufferGeometry();
        proxy.copy(item.value);
        data = proxy.toJSON();
        proxy.dispose();
      } else if (item.kind === "texture") {
        if (item.value.userData.captureAsset) {
          const tex = item.value;
          this.emit(
            "resource",
            {
              id: item.id,
              kind: "asset-texture",
              data: {
                ...tex.userData.captureAsset,
                offset: tex.offset.toArray(),
                repeat: tex.repeat.toArray(),
                rotation: tex.rotation,
                flipY: tex.flipY,
                colorSpace: tex.colorSpace,
                wrapS: tex.wrapS,
                wrapT: tex.wrapT,
              },
            },
            t,
          );
          continue;
        }
        const tex = item.value,
          meta = { textures: {}, images: {} };
        const source = tex.source?.data;
        let url = source?.currentSrc || source?.src;
        if (url) {
          const parsed = new URL(url, location.href);
          if (parsed.origin === location.origin) url = parsed.pathname;
          else if (!url.startsWith("data:"))
            throw new Error("Remote capture texture is not supported.");
        }
        if (url) meta.images[tex.source.uuid] = { uuid: tex.source.uuid, url };
        data = tex.toJSON(meta);
        data = { ...data, images: Object.values(meta.images) };
      } else {
        const m = item.value;
        data = {
          type: m.type,
          visible: m.visible,
          side: m.side,
          transparent: m.transparent,
          depthTest: m.depthTest,
          depthWrite: m.depthWrite,
          wireframe: m.wireframe,
          roughness: m.roughness,
          metalness: m.metalness,
          alphaTest: m.alphaTest,
          blending: m.blending,
          toneMapped: m.toneMapped,
          normalScale: m.normalScale?.toArray(),
          maps: item.maps,
        };
      }
      this.emit("resource", { id: item.id, kind: item.kind, data }, t);
    }
  }
  recycle(buffer) {
    if (this.buffers.length < 4) this.buffers.push(buffer);
  }
}
