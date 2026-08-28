export const ASSET_PATHS = Object.freeze({
  models: Object.freeze({
    honk: "./model/honk/horn_gltf.glb",
    looper: "./model/looper/recorder.glb",
    metronome: "./model/metronome/metronome_outlets.glb",
    stick: "./model/branch/scene.glb",
  }),
  textures: Object.freeze({
    honk: Object.freeze({
      baseMap: "./model/honk/clown_horn_diffuse_map.png",
      lockedBaseMap: "./model/honk/clown_horn_diffuse_map_locked.png",
      normalMap: "./model/honk/Clay001_2K-JPG_NormalGL.jpg",
      roughnessMap: "./model/honk/Clay001_2K-JPG_Roughness_curves.png",
    }),
    looper: Object.freeze({
      baseMap: "./model/looper/recorder2_lambert1SG_BaseColor.png",
      lockedBaseMap: "./model/looper/recorder2_lambert1SG_BaseColor_locked.png",
      normalMap: "./model/looper/recorder2_lambert1SG_Normal.png",
      metalnessMap: "./model/looper/recorder2_lambert1SG_Metallic.png",
      roughnessMap: "./model/looper/recorder2_lambert1SG_Roughness.png",
    }),
    metronome: Object.freeze({
      baseMap: "./model/metronome/metronome_for_painter_lambert1_BaseColor.png",
      normalMap: "./model/metronome/metronome_for_painter_lambert1_Normal.png",
      roughnessMap: "./model/metronome/metronome_for_painter_lambert1_Roughness.png",
      metalnessMap: "./model/metronome/metronome_for_painter_lambert1_Metallic.png",
      heightMap: "./model/metronome/metronome_for_painter_lambert1_Height.png",
    }),
    stick: Object.freeze({
      normalMap: "./model/branch/branch_3d_model_pbr_normal.JPEG",
      metalnessMap: "./model/branch/branch_3d_model_pbr_metallic.JPEG",
      roughnessMap: "./model/branch/branch_3d_model_pbr_roughness.JPEG",
    }),
  }),
  fonts: Object.freeze({
    noteLabel: "https://unpkg.com/three@0.164.1/examples/fonts/helvetiker_regular.typeface.json",
  }),
});
