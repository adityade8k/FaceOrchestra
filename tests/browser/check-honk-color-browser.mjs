import { withBrowser } from "../../scripts/browser-session.mjs";

async function checkPitchColors() {
  const THREE = await import("three");
  const { applyHonkPitchMask, updateHonkPitchColor, honkPitchColor } =
    await import("/src/scene/honkPitchColor.js");
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(256, 128);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0.1, 10);
  camera.position.z = 2;
  scene.add(new THREE.AmbientLight(0xffffff, 3));
  const texture = (bytes, width) => {
    const t = new THREE.DataTexture(new Uint8Array(bytes), width, 1, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  };
  const red = texture([230, 25, 30, 255], 1);
  const blue = texture([20, 40, 235, 255], 1);
  const mask = texture([255, 255, 255, 255, 0, 0, 0, 255], 2);
  red.colorSpace = blue.colorSpace = THREE.SRGBColorSpace;
  const normal = texture([128, 128, 255, 255], 1);
  const roughness = texture([225, 225, 225, 255], 1);
  const original = new THREE.MeshStandardMaterial({
    map: red,
    color: 0xdddddd,
    roughness: 0.9,
    normalMap: normal,
    roughnessMap: roughness,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), original);
  scene.add(mesh);
  const state = { earLeft: 0, earRight: 0 };
  const honk = { kind: "honk", root: mesh, getResolvedPerformanceState: () => state };
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const render = (map) => {
    mesh.material.map = map;
    mesh.material.needsUpdate = true;
    renderer.render(scene, camera);
    context.drawImage(renderer.domElement, 0, 0);
    return {
      bulb: Array.from(context.getImageData(64, 64, 1, 1).data),
      unmasked: Array.from(context.getImageData(192, 64, 1, 1).data),
    };
  };
  try {
    const originalRed = render(red),
      originalBlue = render(blue);
    updateHonkPitchColor(honk, mask);
    const defaultRed = render(red),
      defaultBlue = render(blue);
    check(same(defaultRed, originalRed), "Default bulb renders the original red paint");
    check(same(defaultBlue, originalBlue), "Default bulb renders the original blue paint");

    state.earRight = 0.5;
    updateHonkPitchColor(honk, mask);
    const material = mesh.material;
    const saturation = material.color.getHSL({}).s;
    check(Math.abs(saturation - 0.49) < 1e-8, "Masked color uses half the previous saturation");
    const replacementRed = render(red),
      replacementBlue = render(blue);
    check(
      same(replacementRed.bulb, replacementBlue.bulb),
      "Custom bulb color ignores the painted color",
    );
    check(same(replacementRed.unmasked, originalRed.unmasked), "Red face paint stays untouched");
    check(same(replacementBlue.unmasked, originalBlue.unmasked), "Blue face paint stays untouched");
    check(
      material.normalMap === normal && material.roughnessMap === roughness,
      "Surface maps remain attached",
    );

    state.earRight = 0;
    updateHonkPitchColor(honk, mask);
    check(
      same(render(red), originalRed) && same(render(blue), originalBlue),
      "Returning to default restores the original texture",
    );
    state.earRight = 0.5;
    updateHonkPitchColor(honk, mask);
    check(same(render(blue), replacementBlue), "Retuning reactivates the custom masked color");

    // Older recordings must retain their original multiplied tint.
    material.color.copy(original.color).multiply(honkPitchColor(77));
    applyHonkPitchMask(material, mask, undefined, "tint");
    const legacyRed = render(red),
      legacyBlue = render(blue);
    check(!same(legacyRed.bulb, legacyBlue.bulb), "Old captures retain their multiplied tint");
    material.color.copy(honkPitchColor(77));
    applyHonkPitchMask(material, mask, undefined, "replace");
    check(
      same(render(blue), replacementBlue),
      "Changing capture mode invalidates the shader cache",
    );
    return {
      defaultTexturePreserved: true,
      defaultTextureRestored: true,
      saturation,
      replacementRed,
      replacementBlue,
      surfaceDetailPreserved: true,
      shaderModes: true,
    };
  } finally {
    renderer.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
    if (mesh.material !== original) original.dispose();
    for (const t of [red, blue, mask, normal, roughness]) t.dispose();
  }
}

const report = await withBrowser((browser) =>
  browser.evaluate(`(${checkPitchColors.toString()})()`),
);
console.log(JSON.stringify(report, null, 2));
