#!/usr/bin/env node
/* Package the FLASH7 entry and runtime assets; www is generated output. */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const output = path.resolve(__dirname, "../www");
const {runtimeModules} = require(path.join(root, "flash7-loader.js"));

require(path.join(root, "scripts/build-flash7-html.cjs"));
require(path.join(root, "scripts/build-flash7-css.cjs"));
require(path.join(root, "scripts/build-flash7-runtime.cjs"));
require(path.join(root, "scripts/build-flash7-firmware.cjs"));
require(path.join(root, "scripts/check-flash7-runtime.cjs"));
if(process.exitCode) throw new Error("FLASH7 validation failed; native assets were not replaced.");

const files = [
  "flash7.html", "split-display.html", "mission.html", "flash7-loader.js", "flash7.runtime.js",
  "scripts/ui/desktop/split-display.js", "scripts/ui/mobile/mission-viewer.js",
  "overlay.html", "manifest.webmanifest", "styles/flash7-app.css",
  "firmware/firmware.bin", "firmware/manifest.json",
  ...runtimeModules.map(name=>"scripts/" + name),
  ...["i18n", "zip", "mesh", "export", "watchdog"].map(name=>"scripts/flash7-" + name + ".js")
];
const directories = ["img", "vendor", "mp3", "tiles", "3d"];
for(const name of [...files, ...directories]){
  if(!fs.existsSync(path.join(root, name))) throw new Error("Missing web asset: " + name);
}

fs.rmSync(output, {recursive:true, force:true});
fs.mkdirSync(output, {recursive:true});
for(const name of [...files, ...directories]){
  const destination = path.join(output, name);
  fs.mkdirSync(path.dirname(destination), {recursive:true});
  fs.cpSync(path.join(root, name), destination, {
    recursive:true,
    filter:source=>!/(?:^|\/)(?:\.DS_Store|[^/]*\.textClipping|[^/]* 2\.[^/]*)$/.test(source)
  });
}
fs.copyFileSync(path.join(root, "flash7.html"), path.join(output, "index.html"));
console.log("Packaged FLASH7 web assets in mobile_app_native/www.");
