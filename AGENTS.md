# FLASH7 project rules

Work within this project unless the user explicitly requests workspace or firmware changes.

- Search with `rg` first; keep reads and output narrow.
- HTML source: `ui/shared/document.html`, `ui/desktop/`, `ui/mobile/`.
- Platform behavior: `scripts/ui/shared/`, `scripts/ui/desktop/`, `scripts/ui/mobile/`.
- Shared runtime: `scripts/flash7-*.js`. Preserve classic-script lexical scope and manifest ordering.
- CSS: `styles/src/*.css` and platform includes. Preserve cascade positions.
- Runtime manifest: `flash7-loader.js`. Use `window.Flash7` without version aliases.
- Never edit generated HTML, runtime/CSS bundles, firmware manifest, packaged `www/` or native `public/` files directly. Rebuild/copy from source.
- Do not search `vendor/`, dependencies, packaged files or compiled native builds except for targeted verification.
- Run `npm run build` and `npm run check` here. Run `npm run sync:web` and `npx cap copy` from `mobile_app_native` for packaged assets.
- Preserve actual board protocol frame layouts, data formats and the bundled image bytes. Hardware identity is independent of the app version.
- Delete unused features together with their DOM, events, state and styles after checking references and dynamic entry points.
- Validate the 80-byte mission-sync export header while retaining 64-byte file compatibility. The regression suite also checks replay confirmation before navigation.
- Known verification limitation: direct-file simulation can raise a Leaflet `_fadeAnimated` error; HTTP preview is verified. Report failures honestly.
