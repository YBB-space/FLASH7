import { DurableObject } from 'cloudflare:workers';
import '../../../scripts/ui/shared/mission-snapshot.js';
const encoder=new TextEncoder(),alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
function same(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const un64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function key(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function ticket(meta,role){const body=b64(encoder.encode(JSON.stringify({role,exp:Math.min(meta.expiresAt,Date.now()+60000),nonce:random().slice(0,16)})));const sig=b64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(meta.secret),encoder.encode(body))));return body+'.'+sig;}
async function verify(meta,token){try{const [body,signature,...extra]=token.split('.');if(extra.length||!signature)return null;const valid=await crypto.subtle.verify('HMAC',await key(meta.secret),un64(signature),encoder.encode(body));if(!valid)return null;const claims=JSON.parse(new TextDecoder().decode(un64(body)));return ['host','viewer'].includes(claims.role)&&claims.exp>Date.now()&&claims.exp<=meta.expiresAt?claims:null;}catch{return null;}}
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim());
  if(!origin||!allowed.includes(origin))return json({error:'허용되지 않은 접속 주소입니다.'},403);
  const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST,DELETE,GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Vary':'Origin'};
  const finish=response=>{if(response.status===101)return response;const headers=new Headers(response.headers);for(const [k,v]of Object.entries(cors))headers.set(k,v);return new Response(response.body,{status:response.status,headers});};
  if(request.method==='OPTIONS')return finish(new Response(null,{status:204}));
  const url=new URL(request.url);
  try{
   if(url.pathname==='/health')return finish(json({ok:true,service:'FLASH7 mission relay'}));
   if(url.pathname==='/api/missions'&&request.method==='POST'){
    if(!env.PUBLISH_KEY||env.PUBLISH_KEY.length<32)return finish(json({error:'중계 서버에 송신 키가 설정되지 않았습니다.'},503));
    const supplied=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
    if(!same(await hash(supplied),await hash(env.PUBLISH_KEY)))return finish(json({error:'송신 키를 확인하세요.'},401));
    const code=Array.from(crypto.getRandomValues(new Uint8Array(8)),v=>alphabet[v%alphabet.length]).join('');
    const room=env.MISSIONS.get(env.MISSIONS.idFromName(code));
    return finish(await room.fetch(new Request('https://room/create',{method:'POST',body:JSON.stringify({code,ttl:Math.min(14400,Math.max(600,Number(env.MISSION_TTL_SECONDS)||7200))})})));
   }
   const match=url.pathname.match(/^\/api\/missions\/([A-Z2-9]{8})\/(join|socket|end)$/);
   if(!match)return finish(json({error:'미션 주소를 확인하세요.'},404));
   const room=env.MISSIONS.get(env.MISSIONS.idFromName(match[1]));
   const forwarded=new Request('https://room/'+match[2],request);
   return finish(await room.fetch(forwarded));
  }catch{return finish(json({error:'중계 서버 요청을 처리하지 못했습니다.'},500));}
 }
};
export class MissionRoom extends DurableObject {
 constructor(ctx,env){
  super(ctx,env);this.ctx=ctx;this.meta=null;this.latest=null;this.history=[];this.lastPersisted=0;
  ctx.blockConcurrencyWhile(async()=>{this.meta=await ctx.storage.get('meta');this.latest=await ctx.storage.get('latest');});
  ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}','{"type":"pong"}'));
 }
 async fetch(request){
  const route=new URL(request.url).pathname;
  if(route==='/create'&&request.method==='POST'){
   if(this.meta)return json({error:'미션 코드 충돌입니다. 다시 시도하세요.'},409);
   const {code,ttl}=await request.json(),hostToken=random();
   this.meta={code,hostHash:await hash(hostToken),secret:random(),expiresAt:Date.now()+ttl*1000,ended:false};
   await this.ctx.storage.put('meta',this.meta);await this.ctx.storage.setAlarm(this.meta.expiresAt);
   return json({code,hostToken,expiresAt:this.meta.expiresAt},201);
  }
  if(!this.meta)return json({error:'접근 코드를 확인하세요.'},404);
  if(this.meta.ended||Date.now()>=this.meta.expiresAt)return json({error:'종료되었거나 만료된 미션입니다.'},410);
  if(route==='/join'&&request.method==='POST'){
   const body=await request.json(),role=body.role;
   if(!['host','viewer'].includes(role))return json({error:'접속 역할이 올바르지 않습니다.'},400);
   if(role==='host'&&!same(await hash((request.headers.get('Authorization')||'').replace(/^Bearer /,'')),this.meta.hostHash))return json({error:'송신 권한이 없습니다.'},401);
   return json({ticket:await ticket(this.meta,role),expiresAt:this.meta.expiresAt});
  }
  if(route==='/end'&&request.method==='DELETE'){
   if(!same(await hash((request.headers.get('Authorization')||'').replace(/^Bearer /,'')),this.meta.hostHash))return json({error:'송신 권한이 없습니다.'},401);
   await this.expire();return json({ended:true});
  }
  if(route!=='/socket'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'WebSocket 연결이 필요합니다.'},400);
  const protocols=(request.headers.get('Sec-WebSocket-Protocol')||'').split(',').map(v=>v.trim());
  const claims=protocols[0]==='flash7'?await verify(this.meta,protocols[1]||''):null;
  if(!claims)return json({error:'접속 인증이 만료되었습니다.'},401);
  if(claims.role==='viewer'&&this.ctx.getWebSockets('viewer').length>=16)return json({error:'미션 조회 인원이 가득 찼습니다.'},429);
  if(claims.role==='host')for(const previous of this.ctx.getWebSockets('host'))previous.close(4009,'다른 송신 연결로 전환되었습니다.');
  const [client,server]=Object.values(new WebSocketPair());
  this.ctx.acceptWebSocket(server,[claims.role]);server.serializeAttachment({role:claims.role,sequence:0,lastAt:0});
  server.send(JSON.stringify({type:'welcome',role:claims.role,expiresAt:this.meta.expiresAt,now:Date.now(),latest:this.latest,history:claims.role==='viewer'?this.history:[],hostOnline:this.ctx.getWebSockets('host').length>0}));
  this.broadcast({type:'presence',viewers:this.ctx.getWebSockets('viewer').length,hostOnline:this.ctx.getWebSockets('host').length>0});
  return new Response(null,{status:101,webSocket:client,headers:{'Sec-WebSocket-Protocol':'flash7'}});
 }
 async webSocketMessage(ws,message){
  if(!this.meta||this.meta.ended||Date.now()>=this.meta.expiresAt){ws.close(4004,'미션이 만료되었습니다.');return;}
  if(typeof message!=='string'||message.length>16384){ws.close(1009,'메시지가 너무 큽니다.');return;}
  let data;try{data=JSON.parse(message);}catch{ws.close(1008,'잘못된 메시지입니다.');return;}
  const auth=ws.deserializeAttachment();
  if(data.type==='ping'){ws.send('{"type":"pong"}');return;}
  if(auth?.role!=='host'){ws.close(4003,'조회 전용 연결입니다.');return;}
  if(data.type!=='snapshot'||!Number.isSafeInteger(data.sequence)||data.sequence<=auth.sequence){ws.close(1008,'잘못된 송신 순서입니다.');return;}
  const now=Date.now();if(now-auth.lastAt<80)return;
  const payload=globalThis.Flash7.missionSchema.normalize(data.payload);if(!payload){ws.close(1008,'잘못된 텔레메트리입니다.');return;}
  auth.lastAt=now;auth.sequence=data.sequence;ws.serializeAttachment(auth);
  const changed=!this.latest||this.latest.payload.telemetry.receivedAt!==payload.telemetry.receivedAt||this.latest.payload.runId!==payload.runId||this.latest.payload.telemetry.stageId!==payload.telemetry.stageId;
  if(this.latest&&(this.latest.payload.runId!==payload.runId||this.latest.payload.telemetry.stageId!==payload.telemetry.stageId))this.history=[];
  this.latest={payload,at:now};
  if(changed){this.history.push({at:now,runId:payload.runId,sampleAgeMs:payload.sampleAgeMs,recovery:payload.recovery,telemetry:{receivedAt:payload.telemetry.receivedAt,stageId:payload.telemetry.stageId,altitude:payload.telemetry.altitude,speed:payload.telemetry.speed,gforce:payload.telemetry.gforce,gyro:payload.telemetry.gyro}});this.history=this.history.slice(-120);}
  this.broadcast({type:'snapshot',...this.latest},'viewer');
  if(now-this.lastPersisted>=5000){this.lastPersisted=now;await this.ctx.storage.put('latest',this.latest);}
 }
 broadcast(data,tag){const text=JSON.stringify(data);for(const ws of this.ctx.getWebSockets(tag)){try{ws.send(text);}catch{try{ws.close(1011,'연결 오류');}catch{}}}}
 webSocketClose(ws,code,reason){try{ws.close(code===1005?1000:code,reason);}catch{}this.broadcast({type:'presence',viewers:this.ctx.getWebSockets('viewer').filter(s=>s!==ws).length,hostOnline:this.ctx.getWebSockets('host').some(s=>s!==ws)});}
 webSocketError(ws){try{ws.close(1011,'연결 오류');}catch{}}
 async expire(){this.meta.ended=true;for(const ws of this.ctx.getWebSockets())ws.close(4004,'미션이 종료되었습니다.');await this.ctx.storage.deleteAll();await this.ctx.storage.deleteAlarm();this.latest=null;this.history=[];}
 async alarm(){if(this.meta&&Date.now()>=this.meta.expiresAt)await this.expire();}
}
