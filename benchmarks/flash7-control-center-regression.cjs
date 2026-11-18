const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const nodes = new Map();
class Node {
  constructor(id=''){
    this.id=id; this.children=[]; this.parentNode=null; this.inert=false; this.hidden=false;
    this.attributes=new Map(); this.classes=new Set(); this.disabled=false; this.scrollTop=0;
    this.classList={add:(...s)=>s.forEach(x=>this.classes.add(x)),remove:(...s)=>s.forEach(x=>this.classes.delete(x)),
      toggle:(s,on)=>{if(on)this.classes.add(s);else this.classes.delete(s);},contains:s=>this.classes.has(s)};
    this.properties=new Map();
    this.style={setProperty:(k,v)=>this.properties.set(k,v),removeProperty:k=>this.properties.delete(k)};
    if(id) nodes.set(id,this);
  }
  get nextSibling(){const siblings=this.parentNode?.children || [];return siblings[siblings.indexOf(this)+1] || null;}
  get isConnected(){return this===body || !!this.parentNode?.isConnected;}
  appendChild(n){return this.insertBefore(n,null);}
  insertBefore(n,next){if(n.parentNode)n.parentNode.children.splice(n.parentNode.children.indexOf(n),1);
    this.children.splice(next?this.children.indexOf(next):this.children.length,0,n);n.parentNode=this;return n;}
  querySelector(selector){
    if(selector.includes('[role="dialog"]'))return this.dialog || null;
    if(selector.includes('data-control-center-action'))return back;
    return nodes.get(selector.slice(1)) || null;
  }
  setAttribute(k,v){this.attributes.set(k,String(v));}
  getAttribute(k){return this.attributes.get(k) ?? null;}
  removeAttribute(k){this.attributes.delete(k);}
  closest(){let n=this;while(n){if(n.hidden || n.inert || n.classes.has('hidden'))return n;n=n.parentNode;}return null;}
  focus(){document.activeElement=this;}
  click(){this.onclick?.();}
}
const body=new Node('body'), panel=new Node('controlCenterPanel'), home=new Node('controlCenterHome');
const title=new Node('controlCenterPageTitle');
const content=new Node('controlCenterContent'),back=new Node('back'),trigger=new Node('trigger');
body.appendChild(panel); panel.appendChild(home);panel.appendChild(content);panel.appendChild(back);home.appendChild(trigger);
const document={activeElement:trigger,getElementById:id=>nodes.get(id)};
let open=false;
const context=vm.createContext({document,el:{controlCenterPanel:panel},controlCenterIsOpen:()=>open,
  setControlCenterOpen:value=>{open=value;}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../scripts/ui/shared/control-center.js'),'utf8')+
  '\nglobalThis.api={mountControlCenterSurface,releaseControlCenterSurface,dismissControlCenterSurface,dismissAllControlCenterSurfaces,navigateControlCenterBack,hasControlCenterSurface,controlCenterSurfaceStack};',context);
const api=context.api;
function surface(id,closeId){
  const node=new Node(id),next=new Node(id+'-next');body.appendChild(node);body.appendChild(next);
  node.dialog=new Node();node.dialog.setAttribute('aria-modal','true');node.appendChild(node.dialog);
  const cancel=closeId?new Node(closeId):null;
  if(cancel){node.dialog.appendChild(cancel);cancel.onclick=()=>{
    node.classList.add('hidden');node.setAttribute('aria-hidden','true');api.releaseControlCenterSurface(node);
  };}
  return {node,next,cancel};
}
const storage=surface('dataListOverlay','dataListCloseBtn'),reset=surface('dataResetConfirmOverlay','dataResetCancelBtn');
assert.equal(api.mountControlCenterSurface(storage.node),true);
assert.equal(title.textContent,'저장공간');
assert.equal(open,true);assert.equal(home.hidden,true);assert.equal(content.hidden,false);assert.equal(back.hidden,false);
assert.equal(storage.node.parentNode,content);assert.equal(storage.node.dialog.getAttribute('aria-modal'),'false');
api.mountControlCenterSurface(storage.node);assert.equal(api.controlCenterSurfaceStack.length,1,'duplicate open preserves the home');
const listBack=new Node('dataListBackBtn');let listBackCount=0;listBack.hidden=false;listBack.onclick=()=>{listBackCount++;listBack.hidden=true;};storage.node.appendChild(listBack);api.navigateControlCenterBack();assert.equal(listBackCount,1);assert.equal(api.controlCenterSurfaceStack.length,1,'record-list Back retains storage page');
panel.scrollTop=90;content.scrollTop=120;storage.cancel.focus();api.mountControlCenterSurface(reset.node);
assert.equal(title.textContent,'저장공간 초기화');
assert.equal(storage.node.inert,true);assert.equal(storage.node.getAttribute('aria-hidden'),'true');
assert.equal(reset.node.inert,false);assert.equal(reset.node.getAttribute('aria-hidden'),'false');
reset.cancel.disabled=true;assert.equal(api.dismissControlCenterSurface(),false,'disabled cancellation remains blocked');
assert.equal(api.controlCenterSurfaceStack.length,2);reset.cancel.disabled=false;
assert.equal(api.dismissControlCenterSurface(),true);assert.equal(storage.node.inert,false);
assert.equal(storage.node.getAttribute('aria-hidden'),'false');assert.equal(panel.scrollTop,90);assert.equal(content.scrollTop,120,'back restores the inner tool scroll position');
assert.equal(document.activeElement,storage.cancel,'back restores focus to the previous tool');
assert.equal(reset.node.parentNode,body);assert.equal(reset.node.nextSibling,reset.next);
assert.equal(reset.node.dialog.getAttribute('aria-modal'),'true');
const transfer=surface('storageDownloadProgressOverlay');api.mountControlCenterSurface(transfer.node);
assert.equal(api.dismissAllControlCenterSurfaces(),false,'a transfer is not cancelled by closing the center');
assert.equal(api.controlCenterSurfaceStack.length,2);api.releaseControlCenterSurface(transfer.node);
assert.equal(api.dismissAllControlCenterSurfaces(),true);
assert.equal(storage.node.parentNode,body);assert.equal(storage.node.nextSibling,storage.next);
assert.equal(title.textContent,'제어 센터');
assert.equal(home.hidden,false);assert.equal(content.hidden,true);assert.equal(back.hidden,true);
assert.equal(document.activeElement,trigger);assert.equal(panel.properties.has('--control-center-detail-width'),false);
assert.equal(storage.node.dialog.getAttribute('aria-modal'),'true');
open=false;const confirm=surface('confirmOverlay','confirmCancel');
assert.equal(api.mountControlCenterSurface(confirm.node),false,'unrelated sequence confirmations are not intercepted');
open=true;assert.equal(api.mountControlCenterSurface(confirm.node),true);assert.equal(api.dismissControlCenterSurface(),true);
const first=surface('hardwareServoOverlay','hardwareServoClose'),second=surface('pyroControlOverlay','pyroControlClose');
api.mountControlCenterSurface(first.node);api.mountControlCenterSurface(second.node);
api.releaseControlCenterSurface(first.node);
assert.equal(second.node.inert,false,'releasing a lower page leaves the top tool active');
assert.equal(api.dismissAllControlCenterSurfaces(),true);assert.equal(api.hasControlCenterSurface(),false);
const settings=surface('settingsOverlay','settingsClose');
let returnedHome=false;
settings.cancel.onclick=()=>{throw Error('mobile settings subsection close should not intercept the control-center Back action');};
context.hideSettings=()=>{returnedHome=true;api.releaseControlCenterSurface(settings.node);};
api.mountControlCenterSurface(settings.node);assert.equal(api.dismissControlCenterSurface(),true);assert.equal(returnedHome,true);
console.log('FLASH7 control center: PASS (same DOM, nested pages, focus/order restoration, cancellation, busy transfer, contextual confirmations)');
