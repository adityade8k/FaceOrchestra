import * as THREE from "three";

const tempPosition = new THREE.Vector3();
const tempForward = new THREE.Vector3();
const tempTarget = new THREE.Vector3();

export class InstructionPanel {
  constructor() {
    this.group = this.create();
    this.closeButton = this.group.getObjectByName("PANEL_CLOSE");
  }

  attachTo(scene) {
    scene.add(this.group);
  }

  show() {
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }

  positionInFrontOfCamera(camera, distance) {
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(tempPosition);
    camera.getWorldDirection(tempForward);

    this.group.position.copy(tempPosition).addScaledVector(tempForward, distance);
    this.group.position.y = tempPosition.y - 0.02;

    tempTarget.copy(tempPosition);
    tempTarget.y = this.group.position.y;
    this.group.lookAt(tempTarget);
  }

  create() {
    const panelGroup = new THREE.Group();
    panelGroup.name = "InstructionPanel";

    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(20, 20, 18, 0.92)";
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 36);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = "#f7efe2";
    ctx.font = "700 58px Arial";
    ctx.fillText("Face Orchestra XR", 72, 100);

    ctx.font = "38px Arial";
    ctx.fillStyle = "rgba(247, 239, 226, 0.92)";
    const lines = [
      "Close this panel to spawn the first face instrument.",
      "After closing, hold A and roll your wrist to choose a spawn category.",
      "Pull the controller toward you, roll to choose an item, then release A.",
      "Press grip while the menu is open to cancel.",
      "Aim at the mouth and press trigger to cycle vowels.",
      "Aim at the horn and hold trigger to squeeze and play sound.",
      "Aim at ears or nose and hold trigger, then move up/down.",
      "Hold grip on the instrument to move and rotate it.",
    ];
    lines.forEach((line, index) => {
      ctx.fillText(line, 72, 176 + index * 70);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.45, 0.87),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
      }),
    );
    panelGroup.add(panel);

    const closeButton = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.12),
      new THREE.MeshBasicMaterial({
        color: 0x2a2925,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
      }),
    );
    closeButton.name = "PANEL_CLOSE";
    closeButton.position.set(0.635, 0.355, 0.004);
    closeButton.userData.isCloseButton = true;
    panelGroup.add(closeButton);

    const xCanvas = document.createElement("canvas");
    xCanvas.width = 256;
    xCanvas.height = 256;
    const xCtx = xCanvas.getContext("2d");
    xCtx.fillStyle = "#f7efe2";
    xCtx.font = "700 170px Arial";
    xCtx.textAlign = "center";
    xCtx.textBaseline = "middle";
    xCtx.fillText("X", 128, 134);
    const xTexture = new THREE.CanvasTexture(xCanvas);
    xTexture.colorSpace = THREE.SRGBColorSpace;
    const xLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.12),
      new THREE.MeshBasicMaterial({ map: xTexture, transparent: true, side: THREE.DoubleSide }),
    );
    xLabel.name = "PANEL_CLOSE";
    xLabel.userData.isCloseButton = true;
    xLabel.position.z = 0.006;
    closeButton.add(xLabel);

    panelGroup.visible = false;
    return panelGroup;
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
