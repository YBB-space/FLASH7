/* Rear-camera aiming overlay. Video and phone sensors remain on this device. */
(function(root){
 'use strict';
 const rad=Math.PI/180,finite=n=>typeof n==='number'&&Number.isFinite(n),wrap=n=>((n+540)%360)-180;
 function rotate(vector,angle){const a=angle*rad,c=Math.cos(a),s=Math.sin(a);return [vector[0]*c+vector[1]*s,-vector[0]*s+vector[1]*c,vector[2]];}
 function basis(alpha,beta,gamma,screenAngle=0,northOffset=0){
   if(![alpha,beta,gamma,screenAngle,northOffset].every(finite))return null;
   const a=alpha*rad,b=beta*rad,g=gamma*rad,s=screenAngle*rad,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),cg=Math.cos(g),sg=Math.sin(g);
   const x=[ca*cg-sa*sb*sg,sa*cg+ca*sb*sg,-cb*sg],y=[-sa*cb,ca*cb,sb],z=[ca*sg+sa*sb*cg,sa*sg-ca*sb*cg,cb*cg];
   return {right:rotate(x.map((n,i)=>n*Math.cos(s)+y[i]*Math.sin(s)),northOffset),up:rotate(x.map((n,i)=>-n*Math.sin(s)+y[i]*Math.cos(s)),northOffset),forward:rotate(z.map(n=>-n),northOffset)};
 }
 function rotateBasis(value,offset){return value&&{right:rotate(value.right,offset),up:rotate(value.up,offset),forward:rotate(value.forward,offset)};}
 function focal(width,height,videoWidth,videoHeight){
   // Browser camera APIs do not expose calibrated intrinsics. Use an approximate 65° long-axis FOV, including cover cropping.
   if(![width,height].every(n=>finite(n)&&n>0))return null;
   if(![videoWidth,videoHeight].every(n=>finite(n)&&n>0))return width/(2*Math.tan(30*rad));
   return Math.max(videoWidth,videoHeight)/(2*Math.tan(32.5*rad))*Math.max(width/videoWidth,height/videoHeight);
 }
 function project(target,pose,{width,height,focalPx,margin=30,reticleRadius=42,insets={}}={}){
   if(!target||!pose||![target.bearingDeg,target.elevationDeg,width,height].every(finite)||width<=0||height<=0)return null;
   const b=target.bearingDeg*rad,e=target.elevationDeg*rad,vector=[Math.sin(b)*Math.cos(e),Math.cos(b)*Math.cos(e),Math.sin(e)],dot=v=>v.reduce((sum,n,i)=>sum+n*vector[i],0);
   const x=dot(pose.right),y=dot(pose.up),z=dot(pose.forward),f=finite(focalPx)&&focalPx>0?focalPx:width/(2*Math.tan(30*rad)),front=z>.001;
   let dx,dy;
   if(front){dx=f*x/z;dy=-f*y/z;}
   else{const heading=Math.atan2(pose.forward[0],pose.forward[1])/rad,delta=wrap(target.bearingDeg-heading);dx=Math.abs(x)>.01?x:Math.sign(delta)||1;dy=-y;}
   const left=Math.max(1,width/2-(insets.left??margin)),right=Math.max(1,width/2-(insets.right??margin)),top=Math.max(1,height/2-(insets.top??margin)),bottom=Math.max(1,height/2-(insets.bottom??margin)),length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length;
   const edge=Math.min((ux>=0?right:left)/Math.max(.000001,Math.abs(ux)),(uy>=0?bottom:top)/Math.max(.000001,Math.abs(uy))),inView=front&&dx>=-left&&dx<=right&&dy>=-top&&dy<=bottom;
   const arrowDistance=inView?Math.min(78,Math.max(62,length-22)):edge;
   return {x:width/2+dx,y:height/2+dy,inView,front,aligned:inView&&Math.hypot(dx,dy)<=reticleRadius,offsetPx:front?Math.hypot(dx,dy):Infinity,arrowX:width/2+ux*arrowDistance,arrowY:height/2+uy*arrowDistance,arrowAngleDeg:Math.atan2(uy,ux)/rad+90};
 }
 function create(view,options){
   const doc=view.ownerDocument,video=view.querySelector('video'),marker=view.querySelector('[data-camera-target]'),arrow=view.querySelector('[data-camera-direction]'),message=view.querySelector('[data-camera-message]'),range=view.querySelector('[data-camera-range]'),quality=view.querySelector('[data-camera-quality]'),retry=view.querySelector('[data-camera-retry]'),closeButton=view.querySelector('[data-camera-close]'),playButton=view.querySelector('[data-camera-play]');
   const originalParent=view.parentNode,placeholder=doc.createComment('recovery-camera'),listeners=[];
   let active=false,disposed=false,generation=0,stream=null,frame=null,lastFrame=0,ready=false,selected='landing',previousFocus=null,previousOverflow='',shown=null,aligned=false,permissionTimer=null,videoTimer=null;
   const listen=(node,type,fn)=>{node.addEventListener(type,fn);listeners.push(()=>node.removeEventListener(type,fn));};
   const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
   const clearAim=()=>{marker.hidden=true;arrow.hidden=true;aligned=false;shown=null;view.dataset.aligned='false';};
   const current=attempt=>active&&!disposed&&attempt===generation;
   function clearTimers(){root.clearTimeout(permissionTimer);root.clearTimeout(videoTimer);permissionTimer=videoTimer=null;}
   function stopMedia(){clearTimers();if(frame!==null)root.cancelAnimationFrame(frame);frame=null;ready=false;const previous=stream;stream=null;previous?.getTracks().forEach(track=>track.stop());video.pause();video.srcObject=null;playButton.hidden=true;clearAim();}
   function error(error){view.dataset.cameraState='error';const name=error?.name;text(message,name==='NotAllowedError'?'카메라 권한을 허용해 주세요.':name==='NotFoundError'?'후면 카메라를 찾지 못했습니다.':name==='NotReadableError'?'다른 앱의 카메라 사용을 종료해 주세요.':error?.message||'카메라를 시작하지 못했습니다.');retry.hidden=false;}
   function acceptFrames(){
     if(!active||!stream||video.srcObject!==stream||video.readyState<2||video.paused||!video.videoWidth||!video.videoHeight)return false;
     ready=true;root.clearTimeout(videoTimer);videoTimer=null;view.dataset.cameraState='ready';playButton.hidden=true;retry.hidden=true;return true;
   }
   function requestPlay(attempt=generation){
     if(!current(attempt)||!stream)return;
     video.muted=true;video.defaultMuted=true;video.playsInline=true;video.autoplay=true;video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');
     view.dataset.cameraState='video';playButton.hidden=true;text(message,'카메라 영상 준비 중');
     root.clearTimeout(videoTimer);videoTimer=root.setTimeout(()=>{
       if(!current(attempt)||acceptFrames())return;
       if(video.paused){view.dataset.cameraState='playback';playButton.hidden=false;text(message,'영상 재생을 눌러주세요.');}
       else{stopMedia();error(new Error('카메라 영상 수신을 시작하지 못했습니다. 다시 연결해 주세요.'));}
     },10000);
     const failed=cause=>{if(!current(attempt)||ready)return;if(cause?.name==='NotAllowedError'){root.clearTimeout(videoTimer);videoTimer=null;view.dataset.cameraState='playback';playButton.hidden=false;text(message,'영상 재생을 눌러주세요.');}else{stopMedia();error(cause);}};
     try{const playing=video.play();if(playing?.then)playing.then(()=>{if(current(attempt))acceptFrames();},failed);acceptFrames();}catch(cause){failed(cause);}
   }
   function render(time=0){
     if(!active||disposed)return;frame=root.requestAnimationFrame(render);if(time-lastFrame<30)return;lastFrame=time;
     if(!ready&&!acceptFrames())return;
     const state=options.getState(),target=state.targets?.[selected];
     let waiting=state.sensorError||(!state.observer?'휴대폰 위치 수신 대기':!state.pose?'방향 센서 수신 대기':!state.absolute?'북쪽 방향 보정이 필요합니다.':state.stale?'텔레메트리 수신 복구 대기':['gps-stale','gps-rejected'].includes(state.telemetryStatus)?'기체 GPS 수신 대기':!target?(selected==='landing'?'착지 예측 데이터 대기':'기체 GPS 수신 대기'):null);
     if(waiting){clearAim();text(message,waiting);text(range,'--');text(quality,state.absolute?'GPS·방향 데이터를 기다리고 있습니다.':(!state.pose?'브라우저의 위치·방향 권한을 허용해 주세요.':'폰을 잠시 눕히고 상단을 북쪽에 맞춘 뒤 보정하세요.'));return;}
     const aim=root.Flash7.recovery.guidance(target,state.observer,null,{observerHeightM:(state.observerHeightM||0)+1.5});
     if(!aim||aim.elevationDeg===null){clearAim();text(message,'목표 높이 데이터 대기');return;}
     const width=view.clientWidth,height=view.clientHeight,pose=rotateBasis(state.pose,state.northBias||0),point=project(aim,pose,{width,height,focalPx:focal(width,height,video.videoWidth,video.videoHeight),insets:{left:30,right:30,top:height<500?90:150,bottom:height<500?100:190}});
     if(!point){clearAim();return;}
     if(point.inView){
       const gain=shown?.mode===selected?Math.min(1,(time-shown.time)/90):1;
       shown={x:shown?shown.x+(point.x-shown.x)*gain:point.x,y:shown?shown.y+(point.y-shown.y)*gain:point.y,time,mode:selected};
       marker.hidden=false;marker.style.left=shown.x+'px';marker.style.top=shown.y+'px';
     }else{marker.hidden=true;shown=null;}
     aligned=point.inView&&point.offsetPx<=(aligned?48:42)&&shown&&Math.hypot(shown.x-width/2,shown.y-height/2)<=48;
     view.dataset.aligned=String(!!aligned);arrow.hidden=!!aligned;arrow.style.left=point.arrowX+'px';arrow.style.top=point.arrowY+'px';arrow.style.transform='translate(-50%,-50%) rotate('+point.arrowAngleDeg+'deg)';
     text(message,aligned?'방향 일치':point.inView?'목표 원을 중앙 원에 맞추세요.':'화면 밖 · 삼각형 방향으로 움직이세요.');
     text(range,(aim.distanceM>=1000?(aim.distanceM/1000).toFixed(2)+' km':Math.round(aim.distanceM)+' m')+' · '+Math.round(aim.bearingDeg)+'°');
     text(quality,'방위 오차 약 ±'+Math.round(aim.bearingUncertaintyDeg)+'° · '+(selected==='landing'?'예상 착지 지점':'기체 위치')+' · 추정 표시');
   }
   async function startMedia(){
     const attempt=++generation;stopMedia();retry.hidden=true;view.dataset.cameraState='permission';text(message,'카메라 권한 확인 중');
     if(!root.isSecureContext||!root.navigator.mediaDevices?.getUserMedia){error(new Error('카메라는 HTTPS 환경에서 사용할 수 있습니다.'));return;}
     const deadline=root.setTimeout(()=>{if(!current(attempt))return;generation++;stopMedia();error(new Error('카메라 권한 응답이 없습니다. 브라우저의 카메라 허용 설정을 확인한 뒤 다시 연결해 주세요.'));},20000);permissionTimer=deadline;
     try{
       const acquired=await root.navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
       root.clearTimeout(deadline);if(permissionTimer===deadline)permissionTimer=null;
       if(!current(attempt)){acquired.getTracks().forEach(track=>track.stop());return;}
       stream=acquired;
       if(!acquired.getVideoTracks().length)throw new Error('카메라 영상이 없습니다.');
       if(acquired.getVideoTracks()[0]?.getSettings?.().facingMode==='user')throw new Error('방향 안내에는 후면 카메라가 필요합니다.');
       video.srcObject=acquired;lastFrame=0;frame=root.requestAnimationFrame(render);requestPlay(attempt);
       acquired.getVideoTracks().forEach(track=>track.addEventListener('ended',()=>{if(active&&stream===acquired){generation++;stopMedia();error(new Error('카메라 연결이 종료되었습니다.'));}},{once:true}));
     }catch(cause){root.clearTimeout(deadline);if(permissionTimer===deadline)permissionTimer=null;if(current(attempt)){stopMedia();error(cause);}}
   }
   function close(){if(!active)return;active=false;generation++;stopMedia();view.hidden=true;view.dataset.cameraState='idle';doc.body.style.overflow=previousOverflow;if(placeholder.parentNode){placeholder.replaceWith(view);}previousFocus?.focus?.();options.onClose?.();}
   function open(){if(active||disposed)return;active=true;previousFocus=doc.activeElement;previousOverflow=doc.body.style.overflow;view.before(placeholder);doc.body.append(view);doc.body.style.overflow='hidden';view.hidden=false;closeButton.focus();void startMedia();}
   listen(closeButton,'click',close);listen(retry,'click',()=>void startMedia());
   listen(playButton,'click',()=>requestPlay());
   for(const event of ['loadeddata','canplay','playing'])listen(video,event,acceptFrames);
   view.querySelectorAll('[data-camera-mode]').forEach(button=>listen(button,'click',()=>{selected=button.dataset.cameraMode;shown=null;aligned=false;view.querySelectorAll('[data-camera-mode]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));}));
   listen(view.querySelector('[data-camera-north]'),'click',()=>options.calibrate?.());
   listen(doc,'visibilitychange',()=>{if(doc.hidden)close();});listen(root,'pagehide',close);
   listen(view,'keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}else if(event.key==='Tab'){const buttons=Array.from(view.querySelectorAll('button')).filter(node=>!node.hidden&&!node.disabled),first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first?.focus();}}});
   return {open,close,isOpen:()=>active,dispose(){close();disposed=true;listeners.forEach(remove=>remove());if(view.parentNode!==originalParent&&originalParent)originalParent.append(view);}};
 }
 const api={basis,rotateBasis,focal,project,create};(root.Flash7=root.Flash7||{}).recoveryCamera=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
