# FLASH7 structure

Start with [README.md](README.md) and [CODEMAP.md](CODEMAP.md).

- HTML: `ui/shared/document.html`, platform fragments under `ui/desktop/` and `ui/mobile/`.
- Platform behavior: `scripts/ui/shared/`, `scripts/ui/desktop/`, `scripts/ui/mobile/`.
- 3D camera framing and controls: `scripts/ui/shared/scene3d.js`; source markup and styles live in the corresponding shared and platform UI directories.
- Shared runtime: `scripts/flash7-*.js`.
- CSS: ordered `styles/src/*.css` with platform includes at their original cascade positions.
- Runtime order: `flash7-loader.js`, also imported by build/check/benchmark tools.
- Runtime API: `window.Flash7`, including `telemetryStore`, `createScope`, and `appScope`.
- Entry: `index.html` redirects to generated `flash7.html` and preserves query/hash state.

`npm run build` creates HTML, the single runtime bundle, application CSS, and verified board-image metadata. `npm run check` validates sources, outputs and platform regression behavior.

The runtime uses classic-script lexical scope for static hosting, direct file preview and Capacitor. Both platform modules currently load; some DOM remains shared. Documented current navigation uses the dashboard/camera, mission, terminal and hardware screens.

`mobile_app_native/www/` and native `public/` directories are packaged copies. Copy from the root build instead of editing them. Compiled native build directories are disposable artifacts.

The board image keeps its original bytes. `scripts/build-flash7-firmware.cjs` verifies target markers and computes `firmware/manifest.json`; it does not claim the image is a new firmware release.
