/* Decoded voices share one launch deadline; packet jitter never queues extra speech. */
const COUNTDOWN_VOICE_FILES = Object.freeze({
  10:"10.mp3",9:"9.mp3",8:"8.mp3",7:"7.mp3",6:"6.mp3",5:"5.mp3",
  4:"4.mp3",3:"3.mp3",2:"2.mp3",1:"1.mp3",0:"ignition.mp3"
});

function trimCountdownVoice(ctx, buffer){
  let peak=0;
  for(let ch=0;ch<buffer.numberOfChannels;ch++){
    const values=buffer.getChannelData(ch);
    for(let i=0;i<values.length;i++) peak=Math.max(peak,Math.abs(values[i]));
  }
  if(peak<.001) return buffer;
  const threshold=Math.max(.004,peak*.02);
  let first=buffer.length,last=0;
  for(let ch=0;ch<buffer.numberOfChannels;ch++){
    const values=buffer.getChannelData(ch);
    for(let i=0;i<values.length;i++) if(Math.abs(values[i])>=threshold){first=Math.min(first,i);last=Math.max(last,i);}
  }
  first=Math.max(0,first-Math.round(buffer.sampleRate*.025));
  last=Math.min(buffer.length,last+Math.round(buffer.sampleRate*.045));
  if(last<=first) return buffer;
  const trimmed=ctx.createBuffer(buffer.numberOfChannels,last-first,buffer.sampleRate);
  for(let ch=0;ch<buffer.numberOfChannels;ch++) trimmed.getChannelData(ch).set(buffer.getChannelData(ch).subarray(first,last));
  return trimmed;
}

function createCountdownVoicePlayer(options){
  const buffers=new Map(),failed=new Set(),pending=new Map(),fired=new Set();
  let loading=null,phase="idle",deadline=0,lastRemain=0,generation=0,disposed=false;
  function cancel(){
    generation++;
    pending.forEach(entry=>{try{entry.source.stop();entry.source.disconnect();}catch(_error){}});
    pending.clear();fired.clear();phase="idle";deadline=0;lastRemain=0;
    if(options.stopFallback) options.stopFallback();
  }
  function schedule(){
    if(disposed || phase!=="countdown") return;
    const now=options.now(),ctx=options.context();
    for(let key=10;key>=0;key--){
      if(fired.has(key) || pending.has(key)) continue;
      const startMs=deadline-key*1000,delayMs=startMs-now;
      if(delayMs < -160){fired.add(key);continue;}
      const buffer=buffers.get(key);
      if(buffer && ctx && ctx.state==="running"){
        const source=ctx.createBufferSource();source.buffer=buffer;
        if(key>0) source.playbackRate.value=Math.max(1,buffer.duration/.92);
        source.connect(ctx.destination);
        const token=generation,entry={source,startMs};pending.set(key,entry);
        source.onended=()=>{
          source.disconnect();
          if(token!==generation) return;
          if(pending.get(key)===entry){pending.delete(key);fired.add(key);}
        };
        source.start(ctx.currentTime+Math.max(0,delayMs)/1000);
      }else if((!ctx || failed.has(key)) && delayMs<=0 && options.fallback){
        fired.add(key);options.fallback(key);
      }
    }
  }
  function prime(){
    if(disposed) return Promise.resolve();
    const ctx=options.context();
    if(ctx && ctx.state!=="running" && ctx.resume) void ctx.resume().then(schedule).catch(()=>{});
    if(!loading){
      loading=Promise.all(Object.keys(COUNTDOWN_VOICE_FILES).map(async text=>{
        const key=Number(text);
        try{const buffer=await options.load(key);if(disposed) return;if(buffer) buffers.set(key,buffer);else failed.add(key);}
        catch(_error){failed.add(key);}
      })).then(schedule);
    }
    return loading;
  }
  return {
    prime,
    update(remainingMs, state){
      if(disposed) return;
      if(state.enabled===false){cancel();return;}
      if(state.counting){
        const remain=Math.max(0,Number(remainingMs)||0),now=options.now(),measured=now+remain;
        if(phase!=="countdown" || remain>lastRemain+900){cancel();phase="countdown";deadline=measured;}
        else if(Math.abs(measured-deadline)>180){
          pending.forEach((entry,key)=>{
            if(entry.startMs<=now+20){fired.add(key);return;}
            pending.delete(key);try{entry.source.stop();entry.source.disconnect();}catch(_error){}
          });
          deadline=measured;
        }
        lastRemain=remain;void prime();schedule();
      }else if(state.launched && phase!=="idle"){
        // Decoded T-0 is already queued. A file-preview fallback still needs its zero cue.
        if(phase==="countdown" && !pending.has(0) && !fired.has(0) && options.fallback){
          fired.add(0);options.fallback(0);
        }
        phase="launched";
      }else if(!state.launched){cancel();}
    },
    stop:cancel,
    dispose(){cancel();disposed=true;}
  };
}

let countdownVoicePlayer=null, countdownFallback=null;
function getCountdownVoicePlayer(){
  if(!countdownVoicePlayer){
    countdownVoicePlayer=createCountdownVoicePlayer({
      now:()=>performance.now(),context:()=>getAudioCtx(),
      async load(key){
        const ctx=getAudioCtx();if(!ctx) return null;
        const url=new URL("mp3/"+COUNTDOWN_VOICE_FILES[key],document.baseURI);
        const response=await fetch(url.href);if(!response.ok) throw Error("Countdown voice unavailable");
        return trimCountdownVoice(ctx,await ctx.decodeAudioData(await response.arrayBuffer()));
      },
      fallback(key){
        if(countdownFallback) countdownFallback.pause();
        countdownFallback=new Audio(new URL("mp3/"+COUNTDOWN_VOICE_FILES[key],document.baseURI).href);
        try{countdownFallback.currentTime=.12;void countdownFallback.play().catch(()=>{});}catch(_error){}
      },
      stopFallback(){if(countdownFallback){countdownFallback.pause();countdownFallback=null;}}
    });
  }
  return countdownVoicePlayer;
}
function primeCountdownAudio(){void getCountdownVoicePlayer().prime();}
function syncCountdownAudio(remainingMs,state){getCountdownVoicePlayer().update(remainingMs,state);}
function stopCountdownAudio(){if(countdownVoicePlayer) countdownVoicePlayer.stop();}
