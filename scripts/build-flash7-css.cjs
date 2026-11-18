#!/usr/bin/env node
/* Build the single-request FLASH7 stylesheet from ordered source layers. */
const fs = require("fs");
const path = require("path");
const {renderSource} = require("./flash7-sources.cjs");

const root = path.resolve(__dirname, "..");
const sourceRoot = path.join(root, "styles", "src");
const outputPath = path.join(root, "styles", "flash7-app.css");
const files = fs.readdirSync(sourceRoot)
  .filter((name)=>/^\d{2}-.+\.css$/i.test(name))
  .sort();

if(!files.length){
  throw new Error("No ordered CSS source files were found in " + sourceRoot);
}

const output = files
  .map((name)=>renderSource("styles/src/" + name))
  .join("");

fs.writeFileSync(outputPath, output);
console.log("Built styles/flash7-app.css from " + files.length + " ordered layers.");
