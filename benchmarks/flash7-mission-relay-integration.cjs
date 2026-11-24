/* Local Worker integration only. Never points at an online mission. */
const assert=require('node:assert/strict');
const WebSocket=require('../services/mission-relay/node_modules/ws');
const base='http://127.0.0.1:8787',origin='http://127.0.0.1:8099',key='flash7-local-e2e-only-not-for-production-key';
const sockets=[];
async function request(route,{method='POST',body,token,requestOrigin=origin}={}){const response=await fetch(base+route,{method,headers:{Origin:requestOrigin,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};}
function next(ws,predicate){return new Promise((resolve,reject)=>{const found=ws.messages.findIndex(predicate);if(found>=0){resolve(ws.messages.splice(found,1)[0]);return;}const timeout=setTimeout(()=>{ws.off('packet',fn);reject(new Error('WebSocket message timeout'));},5000);function fn(message){if(predicate(message)){clearTimeout(timeout);ws.off('packet',fn);const index=ws.messages.indexOf(message);if(index>=0)ws.messages.splice(index,1);resolve(message);}}ws.on('packet',fn);});}
async function socket(code,role,token){const auth=await request('/api/missions/'+code+'/join',{body:{role},token});assert.equal(auth.status,200);const ws=new WebSocket(base.replace('http','ws')+'/api/missions/'+code+'/socket',['flash7',auth.data.ticket],{origin});ws.messages=[];sockets.push(ws);ws.on('message',data=>{const message=JSON.parse(data);ws.messages.push(message);ws.emit('packet',message);});ws.on('error',()=>{});const welcome=await next(ws,m=>m.type==='welcome');return {ws,welcome};}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 assert.equal((await request('/api/missions',{token:key,requestOrigin:'https://untrusted.invalid'})).status,403);
 assert.equal((await request('/api/missions',{token:'incorrect'})).status,401);
 assert.equal((await request('/api/missions/AAAAAAAA/join',{body:{role:'viewer'}})).status,404);
 const created=await request('/api/missions',{token:key});assert.equal(created.status,201);const {code,hostToken}=created.data;
 assert.equal((await request('/api/missions/'+code+'/join',{body:{role:'host'},token:code})).status,401,'viewer code cannot acquire publisher privileges');
 const {ws:host}=await socket(code,'host',hostToken);
 const viewers=[];for(let i=0;i<10;i++)viewers.push((await socket(code,'viewer')).ws);
 const payload={version:1,runId:'local-regression',sentAt:Date.now(),sampleAgeMs:0,telemetry:{stageId:1,receivedAt:Date.now(),connected:true,mission:'LOCAL TEST',state:'DESCENT',altitude:700,speed:7,gforce:1,gyro:[0,0,0],quick:{arm:'OFF'},timeline:{steps:['standby','descent','landed'],active:'descent',progress:.5}},recovery:{phase:'DESCENT',altitudeM:700,verticalSpeedMps:-7,chuteCommanded:true,gps:{lat:35.15,lon:128.1,fix:true,ageMs:0,accuracyM:5}}};
 host.send(JSON.stringify({type:'snapshot',sequence:1,payload}));
 for(const viewer of viewers){const data=await next(viewer,m=>m.type==='snapshot');assert.equal(data.payload.telemetry.receivedAt,payload.telemetry.receivedAt);assert.equal(data.payload.sentAt,payload.sentAt);assert.equal(data.payload.telemetry.altitude,700);assert.equal(data.payload.recovery.gps.lat,35.15);assert.ok(!JSON.stringify(data).includes(hostToken));}
 host.send('{"type":"ping"}');await next(host,m=>m.type==='pong');
 const late=await socket(code,'viewer');assert.equal(late.welcome.latest.payload.telemetry.mission,'LOCAL TEST');assert.equal(late.welcome.history.length,1,'late viewers receive bounded recent history');
 const forbidden=await socket(code,'viewer');const closed=new Promise(resolve=>forbidden.ws.once('close',code=>resolve(code)));forbidden.ws.send(JSON.stringify({type:'snapshot',sequence:2,payload}));assert.equal(await closed,4003,'read-only client cannot inject telemetry');
 const originalClosed=new Promise(resolve=>host.once('close',code=>resolve(code)));const replacement=await socket(code,'host',hostToken);assert.equal(await originalClosed,4009,'publisher reconnect replaces the previous socket');
 await pause(100);replacement.ws.send(JSON.stringify({type:'snapshot',sequence:1,payload:{...payload,telemetry:{...payload.telemetry,receivedAt:Date.now(),altitude:690}}}));assert.equal((await next(viewers[0],m=>m.type==='snapshot')).payload.telemetry.altitude,690);const recovered=await socket(code,'viewer');assert.equal(recovered.welcome.history.length,2,'successive epoch-stamped samples remain distinct in recovery history');
 assert.equal((await request('/api/missions/'+code+'/end',{method:'DELETE',token:'bad'})).status,401);
 assert.equal((await request('/api/missions/'+code+'/end',{method:'DELETE',token:hostToken})).status,200);
 assert.ok([404,410].includes((await request('/api/missions/'+code+'/join',{body:{role:'viewer'}})).status));
 console.log('FLASH7 mission relay: PASS (local Worker, publisher authentication, origin checks, 10 simultaneous viewers, snapshots/history, viewer injection rejection, reconnect, authenticated end access)');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{for(const ws of sockets)ws.terminate();});
