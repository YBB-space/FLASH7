#!/usr/bin/env node
/* flash7.html is generated. Edit ui/shared/document.html and ui/{desktop,mobile} fragments. */
const fs = require("node:fs");
const path = require("node:path");
const {renderSource} = require("./flash7-sources.cjs");

fs.writeFileSync(path.resolve(__dirname, "../flash7.html"), renderSource("ui/shared/document.html"));
fs.writeFileSync(path.resolve(__dirname, "../split-display.html"), renderSource("ui/desktop/split-display.html"));
fs.writeFileSync(path.resolve(__dirname, "../mission.html"), renderSource("ui/shared/mission-viewer.html"));
console.log("Built flash7.html from shared, desktop, and mobile presentation sources.");
