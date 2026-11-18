const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../scripts/ui/shared/countdown-audio.js'),'utf8'),context);
(async()=>{
 let now=0;const sources=[];
 const ctx={state:'running',get currentTime(){return now/1000;},destination:{},
  createBufferSource(){const source={playbackRate:{value:1},connect(){},disconnect(){},start(when){this.when=when;},stop(){this.stopped=true;}};sources.push(source);return source;},
  createBuffer(channels,length,rate){const data=Array.from({length:channels},()=>new Float32Array(length));return{numberOfChannels:channels,length,sampleRate:rate,duration:length/rate,getChannelData:ch=>data[ch]};}};
 const voice=ctx.createBuffer(1,1500,1000);voice.getChannelData(0).fill(.5,170,650);
 const trimmed=context.trimCountdownVoice(ctx,voice);assert.ok(trimmed.duration>.5&&trimmed.duration<.6,'leading latency and long trailing silence are removed');
 const player=context.createCountdownVoicePlayer({now:()=>now,context:()=>ctx,load:async key=>({duration:.5,key})});
 await player.prime();player.update(10000,{counting:true});
 assert.equal(sources.length,11,'one decoded voice per second plus ignition');
 assert.deepEqual(sources.map(s=>s.when),Array.from({length:11},(_,i)=>i),'voices are scheduled on exact audio-clock seconds');
 for(let i=1;i<80;i++){now=i*100;player.update(10000-now+(i%2?35:-35),{counting:true});}
 assert.equal(sources.length,11,'telemetry jitter never replays a count');
 now=10020;player.update(0,{counting:false,launched:true});assert.equal(sources.length,11,'T-0 can be skipped without losing or duplicating ignition');
 assert.ok(sources.every(s=>!s.stopped),'T+ does not cut off the ignition voice');
 player.stop();assert.ok(sources.every(s=>s.stopped),'abort cancels all pending speech');
 now=11000;player.update(10000,{counting:true});assert.equal(sources.length,22,'a new run gets its own schedule');
 player.update(9900,{counting:true,enabled:false});assert.ok(sources.slice(11).every(s=>s.stopped),'paused/disabled audio cancels future cues');
 const before=sources.length;player.dispose();player.update(10000,{counting:true});assert.equal(sources.length,before,'disposed player is inert');
 const late=context.createCountdownVoicePlayer({now:()=>now,context:()=>ctx,load:async key=>({duration:.5,key})});await late.prime();late.update(6400,{counting:true});
 assert.equal(sources.length-before,7,'joining a running countdown skips past numbers instead of bursting them');
 late.dispose();
 const spoken=[];const fallback=context.createCountdownVoicePlayer({now:()=>now,context:()=>null,load:async()=>null,fallback:key=>spoken.push(key)});
 await fallback.prime();fallback.update(1000,{counting:true});now+=1000;fallback.update(0,{launched:true});fallback.update(0,{launched:true});
 assert.deepEqual(spoken,[1,0],'file-preview fallback emits ignition once even without a zero packet');fallback.dispose();
 console.log('FLASH7 countdown audio: PASS (silence trimming, exact deadline, jitter, skipped T-0, abort/restart, pause, late join, disposal)');
})().catch(error=>{console.error(error);process.exitCode=1;});
