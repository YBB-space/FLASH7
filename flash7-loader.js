/* FLASH7 runtime manifest loader.
 * Keeps classic-script semantics for file preview, static hosting, ESP32 AP,
 * and the Capacitor wrapper while splitting the application by responsibility.
 */
(function(){
  "use strict";

  // Shared by the browser loader and Node build/check/benchmark tools.
  var manifest = Object.freeze({
    version: "7",
    runtimeModules: Object.freeze([
      "flash7-core.js",
      "flash7-shell.js",
      "flash7-daq.js",
      "flash7-views.js",
      "ui/shared/link-quality.js",
      "ui/shared/layout.js",
      "ui/shared/control-center.js",
      "ui/shared/welcome-screen.js",
      "ui/shared/scene3d.js",
      "ui/shared/scene3d-motion.js",
      "ui/shared/scene3d-environment.js",
      "ui/shared/flight-charts.js",
      "ui/shared/araea-flight-sim.js",
      "ui/shared/countdown-audio.js",
      "ui/shared/split-link.js",
      "ui/shared/recovery-estimator.js",
      "ui/shared/mission-snapshot.js",
      "ui/shared/mission-config.js",
      "ui/shared/mission-client.js",
      "ui/mobile/recovery-camera.js",
      "ui/shared/recovery-panel.js",
      "ui/shared/mission-operations.js",
      "ui/desktop/layout.js",
      "ui/desktop/split-entry.js",
      "ui/mobile/layout.js",
      "ui/shared/layout-events.js",
      "flash7-charts-replay.js",
      "flash7-protocol.js",
      "flash7-transport.js",
      "flash7-firmware-update.js",
      "flash7-telemetry.js",
      "flash7-storage.js",
      "flash7-polling.js",
      "flash7-interactions.js",
      "flash7-mission.js",
      "flash7-hardware.js",
      "flash7-report.js",
      "flash7-command.js",
      "flash7-bootstrap.js"
    ])
  });
  if(typeof module === "object" && module.exports){
    module.exports = manifest;
    return;
  }

  var boot = window.__flashBoot = window.__flashBoot || {};
  if(boot.runtimeManifestLoading || boot.runtimeManifestReady) return;
  boot.runtimeManifestLoading = true;
  boot.phase = "runtime_manifest";

  var runtime = window.Flash7 = window.Flash7 || {};
  runtime.version = manifest.version;
  runtime.modules = runtime.modules || Object.create(null);

  function createScope(name){
    var cleanups = [];
    var disposed = false;
    function addCleanup(fn){
      if(typeof fn !== "function") return fn;
      if(disposed){
        try{ fn(); }catch(_e){}
        return fn;
      }
      cleanups.push(fn);
      return fn;
    }
    return {
      name:name || "scope",
      add:addCleanup,
      listen:function(target, type, listener, options){
        if(!target || typeof target.addEventListener !== "function") return listener;
        target.addEventListener(type, listener, options);
        addCleanup(function(){
          try{ target.removeEventListener(type, listener, options); }catch(_e){}
        });
        return listener;
      },
      interval:function(callback, delay){
        var id = setInterval(callback, delay);
        addCleanup(function(){ clearInterval(id); });
        return id;
      },
      timeout:function(callback, delay){
        var id = setTimeout(callback, delay);
        addCleanup(function(){ clearTimeout(id); });
        return id;
      },
      dispose:function(){
        if(disposed) return;
        disposed = true;
        while(cleanups.length){
          try{ cleanups.pop()(); }catch(_e){}
        }
      }
    };
  }

  function createStore(initialState){
    var state = initialState || {};
    var listeners = new Set();
    return {
      getSnapshot:function(){ return state; },
      set:function(nextState){
        state = nextState || {};
        listeners.forEach(function(listener){
          try{ listener(state); }catch(_e){}
        });
        return state;
      },
      patch:function(partial){
        return this.set(Object.assign({}, state, partial || {}));
      },
      subscribe:function(listener){
        if(typeof listener !== "function") return function(){};
        listeners.add(listener);
        return function(){ listeners.delete(listener); };
      }
    };
  }

  runtime.createScope = runtime.createScope || createScope;
  runtime.appScope = runtime.appScope || runtime.createScope("app");
  runtime.telemetryStore = runtime.telemetryStore || createStore({
    connected:false,
    source:"",
    receivedAt:0,
    sample:null,
    derived:null
  });

  var current = document.currentScript;
  var currentUrl = current && current.src
    ? new URL(current.src, document.baseURI)
    : new URL("./flash7-loader.js", document.baseURI);
  boot.loaderUrl = currentUrl.href;
  boot.loaderFile = "flash7-loader.js";
  var version = currentUrl.searchParams.get("v") || "";
  var baseUrl = new URL("./scripts/", currentUrl);
  var modules = manifest.runtimeModules;
  var loadedCount = 0;
  var manifestFailed = false;

  function emit(stage, detail){
    try{
      if(boot && typeof boot.emit === "function") boot.emit(stage, detail || "");
    }catch(_e){}
  }

  function fail(name, detail){
    if(manifestFailed) return;
    manifestFailed = true;
    boot.runtimeManifestLoading = false;
    boot.runtimeManifestReady = false;
    boot.lastError = "runtime module failed: " + name;
    boot.phase = "runtime_module_fail";
    emit("runtime_module_fail", name + (detail ? ":" + detail : ""));
    if(typeof boot.showBootError === "function"){
      boot.showBootError(
        "FLASH7 런타임 모듈을 불러오지 못했습니다.\n" +
        "module: " + name + (detail ? "\n" + detail : "")
      );
    }
  }

  function markLoaded(name){
    if(manifestFailed) return;
    loadedCount += 1;
    runtime.modules[name] = {
      loaded:true,
      loadedAt:(typeof performance !== "undefined" && performance.now)
        ? performance.now()
        : Date.now()
    };
    emit("runtime_module_loaded", name);
    if(loadedCount >= modules.length){
      boot.runtimeManifestLoading = false;
      boot.runtimeManifestReady = true;
      emit("runtime_manifest_ready", String(modules.length));
    }
  }

  function loadManifest(){
    // `async = false` preserves classic-script execution order while appending
    // every request up front, allowing the browser to transfer modules in
    // parallel instead of paying one network round trip per module.
    modules.forEach(function(name){
      var url = new URL(name, baseUrl);
      if(version) url.searchParams.set("v", version);
      var script = document.createElement("script");
      script.async = false;
      script.src = url.href;
      script.dataset.flash7Module = name;
      script.onload = function(){ markLoaded(name); };
      script.onerror = function(){ fail(name, url.href); };
      document.head.appendChild(script);
    });
  }

  function loadBundle(){
    var url = new URL("./flash7.runtime.js", currentUrl);
    if(version) url.searchParams.set("v", version);
    var script = document.createElement("script");
    script.async = false;
    script.src = url.href;
    script.dataset.flash7Bundle = "runtime";
    script.onload = function(){
      boot.runtimeBundle = true;
      modules.forEach(markLoaded);
      emit("runtime_bundle_loaded", "flash7.runtime.js");
    };
    script.onerror = function(){
      boot.runtimeBundle = false;
      emit("runtime_bundle_fallback", url.href);
      loadManifest();
    };
    document.head.appendChild(script);
  }

  emit("runtime_manifest_start", String(modules.length));
  if(/(?:^|[?&])runtime_modules=1(?:&|$)/.test(String(location.search || ""))){
    boot.runtimeBundle = false;
    loadManifest();
  }else{
    loadBundle();
  }
})();
