// Desktop and XR resolution are independent. XR framebuffer scale must be set
// before entering a session; foveation is applied when its layer is available.
export const RENDER_QUALITY = Object.freeze({
  desktop: Object.freeze({ pixelRatioCap: 2, shadows: true }),
  xr: Object.freeze({ framebufferScale: 1, foveation: 1, shadows: false }),
});
