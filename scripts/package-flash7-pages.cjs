#!/usr/bin/env node
/* Publish only browser assets; source, native projects and local files stay out. */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "_site");
const {runtimeModules} = require(path.join(root, "flash7-loader.js"));
const files = [...new Set([
  "index.html", "flash7.html", "split-display.html", "overlay.html",
  "flash7-loader.js", "flash7.runtime.js", "manifest.webmanifest", "CNAME",
  "styles/flash7-app.css", "firmware/firmware.bin", "firmware/manifest.json",
  "scripts/ui/desktop/split-display.js",
  ...runtimeModules.map(name=>"scripts/" + name),
  ...["i18n", "zip", "mesh", "export", "watchdog"].map(name=>"scripts/flash7-" + name + ".js")
])];
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
fs.writeFileSync(path.join(output, ".nojekyll"), "");
console.log("Packaged FLASH7 browser assets in _site for GitHub Pages.");
