#!/usr/bin/env node
/* Describe the bundled board image independently of the ground-station version. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const bytes = fs.readFileSync(path.join(root, "firmware/firmware.bin"));
if(bytes[0] !== 0xE9) throw new Error("Bundled firmware is not an ESP application image.");
for(const marker of ["Altis_Intelligent3_firmware1", "Altis_Intelligent3_b3"]){
  if(!bytes.includes(Buffer.from(marker))) throw new Error("Bundled firmware target marker is missing: " + marker);
}
const manifest = {
  file:"firmware.bin",
  product:"ALTIS INTELLIGENT3",
  sha256:crypto.createHash("sha256").update(bytes).digest("hex"),
  size:bytes.length,
  target:"ESP32-S3"
};
fs.writeFileSync(path.join(root, "firmware/manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Verified bundled board image and generated hardware manifest.");
