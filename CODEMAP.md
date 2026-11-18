# FLASH7 code map

Search the exact element ID or function with `rg` before reading a large file.

| Area | Source file |
| --- | --- |
| Shared markup, DAQ panels, boot loading | `ui/shared/document.html` |
| PC navigation and extracted dashboard styles | `ui/desktop/navigation.html`, `ui/desktop/dashboard.css` |
| Mobile navigation and board header | `ui/mobile/navigation.html`, `ui/mobile/board-header.html` |
| Mobile extracted dashboard styles | `ui/mobile/dashboard.css` |
| PC drawers and presentation controls | `scripts/ui/desktop/layout.js` |
| PC large map placement | `ui/desktop/flight-data.css`, `scripts/ui/desktop/layout.js` |
| Desktop split entry, waiting screen and companion display | `ui/desktop/split-entry.html`, `ui/desktop/split-display.html`, `ui/desktop/split-display.css`, `scripts/ui/desktop/split-entry.js`, `scripts/ui/desktop/split-display.js` |
| Display-session handshake, isolation and cleanup | `scripts/ui/shared/split-link.js` |
| Companion plots, muted palette and shared gyro scale | `scripts/ui/shared/flight-charts.js` |
| Shared link-quality scales and 30-second charts | `scripts/ui/shared/link-quality.js` |
| Touch panels, tablet controls, fullscreen | `scripts/ui/mobile/layout.js` |
| Platform detection and event coordination | `scripts/ui/shared/layout.js`, `scripts/ui/shared/layout-events.js` |
| 3D framing, view controls and render budget | `scripts/ui/shared/scene3d.js`, `ui/shared/scene3d-controls.html` |
| 3D sky, ground and adaptive grid | `scripts/ui/shared/scene3d-environment.js` |
| 3D shared and platform styles | `ui/shared/scene3d.css`, `ui/desktop/scene3d.css`, `ui/mobile/scene3d.css` |
| Ordered runtime manifest and lifecycle/store | `flash7-loader.js` |
| DAQ mock state, sequence, event log | `scripts/flash7-shell.js` |
| DOM bindings and button events | `scripts/flash7-bootstrap.js` |
| Shared rendering and shared UI | `scripts/flash7-views.js` |
| Telemetry processing | `scripts/flash7-telemetry.js` |
| Storage and replay | `scripts/flash7-storage.js`, `scripts/flash7-charts-replay.js` |
| Shared DAQ component styles | `styles/src/03-components.css` |
| Shared consistency styles | `styles/src/04-consistency.css` |

Generated outputs: `flash7.html`, `split-display.html`, `flash7.runtime.js`, `styles/flash7-app.css`, `mobile_app_native/www/`. Edit sources, then `npm run build` and `npm run check`.

`FLASH7_PROGRAM_DIAGRAM.md` describes the protocol/runtime architecture; use this map for current presentation source paths.
