/* Explicit local descent preview. Never connects to or publishes a real mission. */
(function(root){
 'use strict';
 function sample(elapsed,now,runId){
  const flight=Math.max(-10,Math.min(elapsed,180/7)),altitude=Math.max(0,180-7*elapsed),landed=altitude<=0,geo=root.Flash7.recovery.moved({lat:35.15,lon:128.1},flight*3,flight);
  return root.Flash7.missionSchema.normalize({version:1,runId,sentAt:now,sampleAgeMs:0,telemetry:{receivedAt:now,source:'SIM',simulation:true,connected:true,stageId:1,mission:'ARAEA-I · 하강 시뮬 미리보기',state:landed?'LANDED':'DESCENT',countdown:'T+ '+Math.floor(Math.max(0,elapsed)/60).toString().padStart(2,'0')+':'+Math.floor(Math.max(0,elapsed)%60).toString().padStart(2,'0'),altitude,speed:landed?0:7,gforce:1+.025*Math.sin(elapsed),gyro:[Math.sin(elapsed)*2,Math.cos(elapsed),Math.sin(elapsed*.6)],quick:{connection:'SIMULATION · 10 Hz',chip:'--°C',perf:'--%',power:'--',storage:'SIM',arm:'--',pyro:'--',attitude:[0,85,0]},timeline:{steps:['standby','count','ignition','powered','coasting','ejection','descent','landed'],active:landed?'landed':'descent',progress:landed?1:6/7},airbrake:{deploymentPercent:0,servoAngleDeg:0,mode:'RECOVERY'}},recovery:{phase:landed?'LANDED':'DESCENT',altitudeM:altitude,verticalSpeedMps:landed?0:-7,chuteCommanded:true,chuteConfirmed:false,gps:{...geo,fix:true,ageMs:0,accuracyM:5}}});
 }
 (root.Flash7=root.Flash7||{}).missionDemo={sample};
 if(typeof module==='object'&&module.exports)module.exports={sample};
})(typeof globalThis!=='undefined'?globalThis:window);
