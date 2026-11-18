const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const {runtimeModules} = require("../flash7-loader.js");
const read = name=>fs.readFileSync(path.join(root, name), "utf8");

// Exercise the deployed loader, including relative URLs, bundle fallback and source mode.
for(const sourceMode of [false, true]){
  const scripts = [];
  const window = {};
  const context = {
    window, URL, Set, Date, performance, setInterval, clearInterval, setTimeout, clearTimeout,
    location:{search:sourceMode ? "?runtime_modules=1" : ""},
    document:{
      currentScript:{src:"file:///gcs/FLASH7/flash7-loader.js?v=smoke"},
      baseURI:"file:///gcs/FLASH7/flash7.html",
      createElement:()=>({dataset:{}}),
      head:{appendChild:script=>scripts.push(script)}
    }
  };
  vm.runInNewContext(read("flash7-loader.js"), context);
  assert.equal(window.Flash7.version, "7");
  if(!sourceMode){
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].src, "file:///gcs/FLASH7/flash7.runtime.js?v=smoke");
    scripts.shift().onerror();
  }
  assert.deepEqual(scripts.map(script=>script.src), runtimeModules.map(name=>
    "file:///gcs/FLASH7/scripts/" + name + "?v=smoke"
  ));
  scripts.forEach(script=>script.onload());
  assert.equal(window.__flashBoot.runtimeManifestReady, true);
  assert.equal(Object.keys(window.Flash7.modules).length, runtimeModules.length);
}

// A small desktop window must retain mouse behavior; phones and tablets keep their touch layouts.
for(const device of [
  {width:1440, height:900, touch:false, mobile:false, desktop:true, tablet:false},
  {width:540, height:800, touch:false, mobile:false, desktop:false, tablet:false},
  {width:390, height:844, touch:true, mobile:true, desktop:false, tablet:false},
  {width:844, height:390, touch:true, mobile:true, desktop:false, tablet:false},
  {width:1024, height:768, touch:true, mobile:false, desktop:false, tablet:true}
]){
  function matches(query){
    return query.split(",").some(part=>{
      for(const match of part.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)){
        if(match[1] === "min" && device.width < Number(match[2])) return false;
        if(match[1] === "max" && device.width > Number(match[2])) return false;
      }
      if(part.includes("orientation: landscape") && device.width <= device.height) return false;
      if(part.includes("pointer: fine") && device.touch) return false;
      if(part.includes("pointer: coarse") && !device.touch) return false;
      return true;
    });
  }
  const context = vm.createContext({
    window:{matchMedia:query=>({matches:matches(query)})},
    navigator:{maxTouchPoints:device.touch ? 1 : 0, userAgent:"test"},
    uiSettings:{mobileHudPreview:false}
  });
  vm.runInContext(read("scripts/ui/shared/layout.js"), context);
  assert.equal(vm.runInContext("isMobileLayout()", context), device.mobile);
  assert.equal(vm.runInContext("isDesktopLayout()", context), device.desktop);
  assert.equal(vm.runInContext("isTabletControlsLayout()", context), device.tablet);
}

class Target {
  constructor(legacy = false){
    this.listeners = new Map();
    this.matches = false;
    if(legacy) this.addEventListener = undefined;
  }
  addEventListener(type, callback){
    if(!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback){ this.listeners.get(type)?.delete(callback); }
  addListener(callback){ Target.prototype.addEventListener.call(this, "change", callback); }
  removeListener(callback){ this.removeEventListener("change", callback); }
  emit(type){ for(const callback of this.listeners.get(type) || []) callback({matches:this.matches}); }
  count(){ return [...this.listeners.values()].reduce((sum, set)=>sum + set.size, 0); }
}

for(const legacy of [false, true]){
  const calls = new Map();
  const frames = new Map();
  const cleanups = [];
  let nextFrame = 0;
  const context = {
    window:new Target(), document:new Target(),
    MOBILE_PANEL_MEDIA:new Target(legacy), PHONE_LANDSCAPE_MEDIA:new Target(legacy),
    TABLET_CONTROLS_MEDIA:new Target(legacy),
    DESKTOP_LAYOUT_MEDIA:new Target(legacy),
    gyroGl:null, connOk:false, serialConnected:false, wsConnected:false,
    requestAnimationFrame:callback=>{ frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame:id=>frames.delete(id),
    scope:{add:callback=>cleanups.push(callback)}
  };
  const effects = [
    "hideMobileControlsPanel", "applyTabletControlsLayout", "applyPhoneLandscapeLayout",
    "syncDesktopGyroPreviewMount", "syncCameraMapPreviewMount", "syncMobileMapPreviewMount",
    "resizeMobileMockup3d", "refreshChartLayout", "scheduleStatusMapRefresh",
    "renderChipTempModal", "syncWelcomeConnectScreen", "syncMobileImmersiveToggleState"
  ];
  for(const name of effects) context[name] = ()=>calls.set(name, (calls.get(name) || 0) + 1);
  vm.createContext(context);
  vm.runInContext(read("scripts/ui/shared/layout-events.js"), context);
  vm.runInContext("bindPlatformLayoutEvents(scope); bindPlatformLayoutEvents(scope);", context);
  assert.equal(context.window.count(), 2, "binding twice must not duplicate viewport listeners");
  for(let i = 0; i < 20; i++) context.window.emit("resize");
  context.window.emit("orientationchange");
  context.MOBILE_PANEL_MEDIA.emit("change");
  context.PHONE_LANDSCAPE_MEDIA.emit("change");
  context.TABLET_CONTROLS_MEDIA.emit("change");
  context.DESKTOP_LAYOUT_MEDIA.emit("change");
  assert.equal(frames.size, 1, "a viewport event burst must schedule only one frame");
  const callback = [...frames.values()][0];
  frames.clear();
  callback();
  for(const name of effects.filter(name=>name !== "syncMobileImmersiveToggleState")){
    assert.equal(calls.get(name), 1, name + " must refresh once");
  }
  context.document.emit("fullscreenchange");
  assert.equal(calls.get("syncMobileImmersiveToggleState"), 1);
  context.window.emit("resize");
  assert.equal(frames.size, 1);
  while(cleanups.length) cleanups.pop()();
  assert.equal(frames.size, 0, "dispose must cancel queued drawing");
  for(const target of [context.window, context.document, context.MOBILE_PANEL_MEDIA,
    context.PHONE_LANDSCAPE_MEDIA, context.TABLET_CONTROLS_MEDIA, context.DESKTOP_LAYOUT_MEDIA]){
    assert.equal(target.count(), 0, "dispose must remove modern and legacy listeners");
  }
  context.window.emit("resize");
  assert.equal(frames.size, 0);
}

async function checkStartup(){
  const shell = read("scripts/flash7-shell.js");
  const startup = shell.slice(0, shell.indexOf('    const SETTINGS_KEY'));
  for(const stalled of [false, true]){
    const timers = new Map();
    const classes = new Set();
    let timerId = 0;
    const splash = {classList:{add:name=>classes.add('splash:' + name)}, remove:()=>{}};
    const app = {classList:{add:name=>classes.add('app:' + name)}};
    const context = vm.createContext({
      Image:class {
        set src(_value){ if(!stalled) queueMicrotask(()=>this.onload()); }
      },
      document:{getElementById:()=>splash, querySelector:()=>app},
      setTimeout:(callback, delay)=>{ timers.set(++timerId, {callback, delay}); return timerId; },
      clearTimeout:id=>timers.delete(id)
    });
    vm.runInContext(startup, context);
    const complete = vm.runInContext('runSplashAndPreload()', context);
    if(stalled){
      const timeout = [...timers.values()].find(timer=>timer.delay === 900);
      assert.ok(timeout, 'stalled preloads must have a bounded fallback');
      timeout.callback();
    }
    await complete;
    assert.ok(classes.has('app:ready'));
    assert.ok(classes.has('splash:hide'));
    assert.ok([...timers.values()].every(timer=>timer.delay === 350), 'only the cosmetic splash removal may remain queued');
  }

  const html = read('ui/shared/document.html');
  const loaderStart = html.indexOf('window.__flashBoot.loadScriptLater = function');
  const loaderEnd = html.indexOf('      function versioned', loaderStart);
  const timers = [];
  const context = vm.createContext({window:{__flashBoot:{}}, setTimeout:(_callback, delay)=>timers.push(delay)});
  vm.runInContext(html.slice(loaderStart, loaderEnd), context);
  vm.runInContext('window.__flashBoot.loadScriptLater("probe", "./test.js", 0)', context);
  assert.deepEqual(timers, [0], 'zero delay must not become the old 500ms default');
}

checkStartup().then(()=>{
  console.log("FLASH7 UI regression: PASS (loader fallback, device layouts, frame coalescing, lifecycle cleanup, startup timing)");
}).catch(error=>{
  console.error(error);
  process.exitCode = 1;
});
