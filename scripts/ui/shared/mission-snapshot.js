/* Versioned read-only transport schema shared by GCS, viewer and relay. */
(function(root){
  'use strict';
  const value=(v,min=-1e9,max=1e9)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):null;
  const text=(v,n=80)=>typeof v==='string'?v.slice(0,n):'';
  const vec=v=>[0,1,2].map(i=>value(Array.isArray(v)?v[i]:null));
  function normalize(input){
    if(!input||typeof input!=='object'||Array.isArray(input)||input.version!==1)return null;
    const s=input.telemetry,r=input.recovery;if(!s||!r||![1,2].includes(s.stageId))return null;
    const quick=s.quick||{},gps=r.gps||{};
    const timeline=s.timeline||{},steps=Array.isArray(timeline.steps)?timeline.steps.slice(0,12).filter(p=>typeof p==='string').map(p=>text(p,20)):[];
    const link=s.linkQuality||{};
    return {version:1,runId:text(input.runId,64),sentAt:value(input.sentAt,0),sampleAgeMs:value(input.sampleAgeMs,0,86400000)??86400000,
      telemetry:{receivedAt:value(s.receivedAt,0),source:text(s.source,12),connected:s.connected===true,simulation:s.simulation===true,stageId:s.stageId,mission:text(s.mission),state:text(s.state,40),countdown:text(s.countdown,24),altitude:value(s.altitude),speed:value(s.speed),gforce:value(s.gforce),gyro:vec(s.gyro),
        quick:{connection:text(quick.connection),chip:text(quick.chip,20),perf:text(quick.perf,20),power:text(quick.power,20),storage:text(quick.storage,24),delaySeconds:value(quick.delaySeconds,0,3600),arm:text(quick.arm,24),armLocked:quick.armLocked===true,pyro:text(quick.pyro,40),attitude:vec(quick.attitude)},
        timeline:{steps,active:text(timeline.active,20),progress:value(timeline.progress,0,1)},
        airbrake:s.simulation===true&&s.airbrake?{deploymentPercent:value(s.airbrake.deploymentPercent,0,100),servoAngleDeg:value(s.airbrake.servoAngleDeg,0,180),predictedApogeeM:value(s.airbrake.predictedApogeeM,0),mode:text(s.airbrake.mode,20)}:null,
        linkQuality:{now:value(link.now,0),stages:Array.isArray(link.stages)?link.stages.slice(0,2).map(p=>({stageId:p.stageId===2?2:1,time:value(p.time,0),available:p.available===true,rssi:value(p.rssi,-150,0),loss:value(p.loss,0,100),hz:value(p.hz,0,1000)})):[]}},
      recovery:{phase:text(r.phase,30),altitudeM:value(r.altitudeM,-1000,1000000),verticalSpeedMps:value(r.verticalSpeedMps,-1500,1500),chuteCommanded:r.chuteCommanded===true,chuteConfirmed:r.chuteConfirmed===true,
        gps:{lat:value(gps.lat,-90,90),lon:value(gps.lon,-180,180),alt:value(gps.alt,-1000,1000000),fix:gps.fix===true,ageMs:value(gps.ageMs,0,86400000),accuracyM:value(gps.accuracyM,0,10000)}}};
  }
  (root.Flash7=root.Flash7||{}).missionSchema={normalize};if(typeof module==='object'&&module.exports)module.exports=root.Flash7.missionSchema;
})(typeof globalThis!=='undefined'?globalThis:window);
