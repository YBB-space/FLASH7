/* Small same-browser display link. No board transport or command execution. */
(function(){
  "use strict";
  const runtime = window.Flash7 = window.Flash7 || {};
  runtime.createSplitSessionId = function(){
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, value=>value.toString(16).padStart(2,"0")).join("");
  };
  runtime.createSplitLink = function(session, role, receive){
    if(!/^[a-f0-9]{32}$/.test(session) || !["host","display"].includes(role)) throw new Error("Invalid display session");
    const sender = runtime.createSplitSessionId();
    const windows = new Set();
    const seen = new Map();
    let sequence = 0, closed = false, channel = null;
    function deliver(message){
      if(closed || !message || message.version !== 1 || message.session !== session ||
         message.role !== (role === "host" ? "display" : "host") ||
         typeof message.sender !== "string" || !/^[a-f0-9]{32}$/.test(message.sender) ||
         !Number.isSafeInteger(message.sequence) || message.sequence <= (seen.get(message.sender) || 0)) return;
      // Reloading a tab creates a new sender. Retire old duplicate-tracking
      // entries instead of permanently refusing the ninth reconnection.
      if(!seen.has(message.sender) && seen.size >= 8) seen.delete(seen.keys().next().value);
      seen.set(message.sender, message.sequence);
      receive(message.type, message.payload, message.sender);
    }
    try{
      channel = new window.BroadcastChannel("flash7-display-" + session);
      channel.onmessage = event=>deliver(event.data);
    }catch(_error){}
    const onWindowMessage = event=>{
      if(!windows.has(event.source) || event.origin !== window.location.origin) return;
      deliver(event.data);
    };
    window.addEventListener("message", onWindowMessage);
    return {
      id:sender,
      send(type, payload){
        if(closed) return;
        const message = {version:1, session, role, sender, sequence:++sequence, type, payload};
        if(channel) channel.postMessage(message);
        windows.forEach(target=>{
          try{
            if(target.closed) windows.delete(target);
            else target.postMessage(message, window.location.origin === "null" ? "*" : window.location.origin);
          }catch(_error){ windows.delete(target); }
        });
      },
      attachWindow(target){ if(target) windows.add(target); },
      close(){
        if(closed) return;
        closed = true;
        if(channel) channel.close();
        window.removeEventListener("message", onWindowMessage);
        windows.clear();seen.clear();
      }
    };
  };
  runtime.createSplitDiscovery = function(role, receive){
    if(!["host","display"].includes(role)) throw new Error("Invalid discovery role");
    const sender=runtime.createSplitSessionId();
    const project=String(window.location.pathname || "/").replace(/[^/]*$/, "");
    let channel=null,closed=false;
    try{
      channel=new window.BroadcastChannel("flash7-display-discovery-"+project);
      channel.onmessage=event=>{
        const message=event.data;
        if(closed || !message || message.version!==1 || message.role!==(role==="host" ? "display" : "host") ||
          typeof message.sender!=="string" || !/^[a-f0-9]{32}$/.test(message.sender) || message.sender===sender) return;
        if(role==="display"){
          if(message.type!=="offer" || typeof message.session!=="string" || typeof message.instance!=="string" ||
            !/^[a-f0-9]{32}$/.test(message.session) || !/^[a-f0-9]{32}$/.test(message.instance)) return;
          receive(message.session,message.instance);
        }else if(message.type==="find" && typeof message.session==="string" && (!message.session || /^[a-f0-9]{32}$/.test(message.session))){
          receive(message.session || "");
        }
      };
    }catch(_error){}
    const send=message=>{if(!closed && channel) channel.postMessage(Object.assign({version:1,role,sender},message));};
    return {
      announce(session,instance){if(role==="host") send({type:"offer",session,instance});},
      find(session){if(role==="display") send({type:"find",session:session || ""});},
      close(){closed=true;if(channel)channel.close();channel=null;}
    };
  };
})();
