#!/usr/bin/env node
/* Keep the maintained project identity and DOM bindings consistent. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const {runtimeModules} = require("../flash7-loader.js");
const {renderSource} = require("./flash7-sources.cjs");
const files = [];
function collect(relative){
  for(const entry of fs.readdirSync(path.join(root, relative), {withFileTypes:true})){
    const name = path.posix.join(relative, entry.name);
    if(entry.isDirectory()) collect(name);
    else if(/\.(?:js|cjs|mjs|html|css|md|json|webmanifest|command)$/.test(name)) files.push(name);
  }
}
for(const dir of ["scripts", "ui", "styles/src", "benchmarks", "firmware"]) collect(dir);
for(const entry of fs.readdirSync(root, {withFileTypes:true})){
  if(entry.isFile() && /\.(?:js|html|md|json|webmanifest|command)$/.test(entry.name)) files.push(entry.name);
}
let failed = false;
function fail(message){ failed = true; console.error(message); }
const retiredIdentity = /flash[ _-]?6/i;
for(const name of files){
  if(retiredIdentity.test(name) || retiredIdentity.test(fs.readFileSync(path.join(root, name), "utf8"))){
    fail("Retired project identity remains in " + name);
  }
}
const source = runtimeModules.map(name=>fs.readFileSync(path.join(root, "scripts", name), "utf8")).join("\n");
const markup = renderSource("ui/shared/document.html");
const ids = new Set(Array.from((markup + "\n" + source).matchAll(/\s+id\s*=\s*["']([^"']+)["']/g), match=>match[1]));
for(const match of source.matchAll(/\.id\s*=\s*["']([^"']+)["']/g)) ids.add(match[1]);
for(const match of source.matchAll(/\bel\.(\w+)\s*=\s*document\.getElementById\(["']([^"']+)["']\)/g)){
  if(!ids.has(match[2])) fail("DOM binding has no source element: " + match[1] + " → " + match[2]);
}
const bytes = fs.readFileSync(path.join(root, "firmware/firmware.bin"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "firmware/manifest.json"), "utf8"));
if(manifest.size !== bytes.length || manifest.sha256 !== crypto.createHash("sha256").update(bytes).digest("hex")){
  fail("Bundled firmware manifest is stale; run npm run build.");
}
if(failed) process.exitCode = 1;
else console.log("FLASH7 sources OK · project identity, DOM bindings, firmware checksum");
