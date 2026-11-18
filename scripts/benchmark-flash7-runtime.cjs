#!/usr/bin/env node
/* Repeatable parser benchmark for the deployed FLASH7 classic-script runtime. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {performance} = require("perf_hooks");

const root = path.resolve(__dirname, "..");
const iterations = Math.max(5, Math.min(200, Number(process.argv[2]) || 25));
const {runtimeModules} = require("../flash7-loader.js");

const sources = runtimeModules.map((name)=>({
  name,
  source:fs.readFileSync(path.join(root, "scripts", name), "utf8")
}));
const loaderSource = fs.readFileSync(path.join(root, "flash7-loader.js"), "utf8");
const combinedSource = sources.map((entry)=>entry.source).join("\n");
const bundleSource = fs.readFileSync(path.join(root, "flash7.runtime.js"), "utf8");

function percentile(sorted, ratio){
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1)
  );
  return sorted[index];
}

function benchmark(label, compile){
  const values = [];
  for(let i = 0; i < iterations; i += 1){
    const started = performance.now();
    compile(i);
    values.push(performance.now() - started);
  }
  values.sort((a, b)=>a - b);
  console.log(
    label.padEnd(28) +
    " median " + percentile(values, 0.5).toFixed(2).padStart(7) + " ms" +
    " · p95 " + percentile(values, 0.95).toFixed(2).padStart(7) + " ms"
  );
}

console.log(
  "FLASH7 parser benchmark · " + iterations + " iterations · Node " + process.version
);
console.log(
  "Runtime " + Buffer.byteLength(combinedSource).toLocaleString("en-US") +
  " bytes · " + runtimeModules.length + " modules"
);
benchmark("manifest loader", (iteration)=>new vm.Script(
  loaderSource + "\n;void " + iteration
));
benchmark("combined runtime", (iteration)=>new vm.Script(
  combinedSource + "\n;void " + iteration
));
benchmark("deployed runtime bundle", (iteration)=>new vm.Script(
  bundleSource + "\n;void " + iteration
));
benchmark("module-by-module total", (iteration)=>{
  for(const entry of sources){
    new vm.Script(
      entry.source + "\n;void " + iteration,
      {filename:entry.name}
    );
  }
});
