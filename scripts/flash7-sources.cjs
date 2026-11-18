/* Assemble source fragments in place so legacy DOM order and CSS cascade stay stable. */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function renderSource(name, ancestors = []){
  if(ancestors.includes(name)) throw new Error("Circular source include: " + name);
  const source = fs.readFileSync(path.join(root, name), "utf8");
  return source.replace(
    /<!-- @include (ui\/[\w/.-]+) -->|\/\* @include (ui\/[\w/.-]+) \*\//g,
    (_match, html, css)=>{
      const include = html || css;
      if(include.split("/").includes("..")) throw new Error("Invalid source include: " + include);
      return renderSource(include, [...ancestors, name]);
    }
  );
}

module.exports = {renderSource};
