import { ColliderEditorApp } from "./ColliderEditorApp.js";

const app = new ColliderEditorApp();
globalThis.__colliderEditorApp = app;
app.initialize().catch((error) => {
  console.error("Collider editor initialization failed:", error);
});
