#!/usr/bin/env node
/* Build the single-request runtime from ordered classic-script source modules. */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "flash7.runtime.js");
const {runtimeModules} = require("../flash7-loader.js");

const output =
  "/* Generated FLASH7 runtime bundle. Edit the sources listed in flash7-loader.js. */\n" +
  runtimeModules
    .map((name)=>fs.readFileSync(path.join(root, "scripts", name), "utf8"))
    .join("\n");

fs.writeFileSync(outputPath, output);
console.log(
  "Built flash7.runtime.js from " + runtimeModules.length + " ordered modules."
);
