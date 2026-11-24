/* Separate-device mission viewer. Contains no board transport or actuator commands. */
(function(){
 'use strict';
 const runtime=window.Flash7,adapter=runtime.remoteTelemetry,form=document.querySelector('[data-mission-join-form]'),wait=document.getElementById('splitDisplayWait'),banner=document.querySelector('[data-online-status]'),panel=runtime.recoveryPanel.createPanel(document.querySelector('.online-recovery-layout .recovery-panel'),{observeVisibility:false});
 const codeInput=form.querySelector('[data-mission-join-code]'),joinButton=form.querySelector('[data-mission-join]'),status=form.querySelector('[data-mission-join-status]');
 let client=null,lastReceived=0,lastPacket=null,joined=false,disposed=false,endpoint='',code='',lastRun='';
 const hash=new URLSearchParams(location.hash.slice(1));
 codeInput.value=(hash.get('code')||'').replace(/[\s-]/g,'').toUpperCase();
 function showBanner(text){banner.textContent=text;banner.hidden=!text;}
 function apply(payload,age=0,received=Date.now()){
   const normalized=runtime.missionSchema.normalize(payload);if(!normalized)return;
   if(lastRun&&lastRun!==normalized.runId)adapter.clear();lastRun=normalized.runId;
   lastReceived=received;lastPacket=normalized;const extra=Math.max(0,age);
   normalized.telemetry.connected=normalized.telemetry.connected&&normalized.sampleAgeMs+extra<5000;
   adapter.apply(normalized.telemetry);panel.update(normalized,received,extra);
   if(!joined&&document.body.dataset.onlineTab==='recovery')panel.setActive(true);joined=true;wait.classList.add('hidden');joinButton.disabled=false;
   showBanner(!normalized.telemetry.connected?'기체 수신이 끊겼습니다. 마지막 수신값을 표시합니다.':normalized.telemetry.simulation?'시뮬레이션 미션 · 실제 비행 데이터가 아닙니다.':'');
 }
 function incoming(message){
   if(message.type==='welcome'){
     const points=Array.isArray(message.history)?message.history.slice(-120):[];
     adapter.seed(points);
     for(const point of points){panel.update({version:1,runId:point.runId,sampleAgeMs:point.sampleAgeMs,telemetry:point.telemetry,recovery:point.recovery},Date.now(),Math.max(0,message.now-point.at));}
     if(message.latest?.payload)apply(message.latest.payload,Math.max(0,message.now-message.latest.at));
     else status.textContent='미션 연결됨 · PC 텔레메트리를 기다리고 있습니다.';
     if(!message.hostOnline)showBanner('송신 PC 연결 대기 · 마지막 수신값');
   }else if(message.type==='snapshot')apply(message.payload);
   else if(message.type==='presence'&&!message.hostOnline){showBanner('송신 PC 연결 끊김 · 자동 재연결 대기');adapter.stale();}
 }
 function state(name,detail){
   if(name==='connected'){status.textContent='미션 연결됨 · 텔레메트리 수신 대기';return;}
   if(['offline','reconnecting'].includes(name)){status.textContent='중계 연결 끊김 · 자동 재연결 중';if(joined){showBanner(status.textContent);adapter.stale();}}
   else if(name==='rejected'){joinButton.disabled=false;status.textContent=detail||'접근 코드 또는 미션 상태를 확인하세요.';if(joined){showBanner(status.textContent);adapter.stale();}else wait.classList.remove('hidden');}
   else if(name==='connecting')status.textContent='미션에 연결하고 있습니다.';
 }
 function connect(){
   client?.close();client=runtime.missionClient.createClient({endpoint,code,role:'viewer',onState:state,onMessage:incoming});client.connect();
 }
 form.addEventListener('submit',event=>{event.preventDefault();try{endpoint=runtime.missionClient.endpoint(runtime.missionConfig.configuredEndpoint());code=codeInput.value.replace(/[\s-]/g,'').toUpperCase();if(!/^[A-Z2-9]{8}$/.test(code))throw new Error('접근 코드 8자리를 확인하세요.');joinButton.disabled=true;const url=new URL(location.href);url.hash=new URLSearchParams({code}).toString();history.replaceState(null,'',url.href);connect();}catch(error){joinButton.disabled=false;status.textContent=error.message;}});
 document.querySelectorAll('button[data-online-tab]').forEach(button=>button.addEventListener('click',()=>{document.body.dataset.onlineTab=button.dataset.onlineTab;document.querySelectorAll('button[data-online-tab]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));panel.setActive(button.dataset.onlineTab==='recovery');window.dispatchEvent(new Event('resize'));panel.render();}));
 document.querySelector('[data-online-leave]').addEventListener('click',()=>{panel.setActive(false);client?.close();client=null;joined=false;lastPacket=null;lastReceived=0;adapter.clear();showBanner('');wait.classList.remove('hidden');joinButton.disabled=false;status.textContent='미션에서 나왔습니다.';const url=new URL(location.href);url.hash='';history.replaceState(null,'',url.href);codeInput.focus();});
 const timer=setInterval(()=>{if(lastPacket&&Date.now()-lastReceived+lastPacket.sampleAgeMs>5000){adapter.stale();showBanner('텔레메트리 수신 끊김 · 마지막 수신값 · 예측 갱신 중지');}},1000);
 window.addEventListener('pagehide',event=>{client?.close();client=null;if(!event.persisted){disposed=true;clearInterval(timer);panel.dispose();}});
 window.addEventListener('pageshow',event=>{if(event.persisted&&!disposed){if(endpoint&&code)connect();}});
 if(hash.get('code'))form.requestSubmit();
})();
