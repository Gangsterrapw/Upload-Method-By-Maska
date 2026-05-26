const beastGet = id => document.getElementById(id);
let beastSelectedFile=null, beastIsProcessing=false, beastVideoWidth=0, beastVideoHeight=0, beastDetectedFps=60, beastNeedsDownscale=false, beastNeedsCompression=false;
const BEAST_MAX_FILE_BYTES=100*1024*1024;

const beastToggleBtn=beastGet('beastToggleBtn'), beastStatusPill=beastGet('beastStatusPill'), beastFpsCard=beastGet('beastFpsCard'), beastToggleWrap=beastGet('beastToggleWrap');
const beastDropZone=beastGet('beastDropZone'), beastDropLabel=beastGet('beastDropLabel'), beastDropTag=beastGet('beastDropTag'), beastFileInput=beastGet('beastFileInput');
const beastActionBtn=beastGet('beastActionBtn'), beastActionLabel=beastGet('beastActionLabel'), beastTerminal=beastGet('beastTerminal'), beastDownscaleNote=beastGet('beastDownscaleNote');
const beastOverlay=beastGet('beastOverlay'), beastOverlayPct=beastGet('beastOverlayPct'), beastOverlayPhase=beastGet('beastOverlayPhase'), beastOverlaySub=beastGet('beastOverlaySub');
const beastOverlayElapsed=beastGet('beastOverlayElapsed'), beastOverlayEta=beastGet('beastOverlayEta'), beastOverlayBar=beastGet('beastOverlayBar');
const beastRingCanvas=beastGet('beastRingCanvas'), beastRingCtx=beastRingCanvas.getContext('2d'), beastRingLabel=beastGet('beastRingLabel');

let beastOvStart=0, beastTimerInt=null, beastCurPct=0;

function beastDrawRing(pct){
  const cx=48,cy=48,r=42; beastRingCtx.clearRect(0,0,96,96); beastRingCtx.beginPath(); beastRingCtx.arc(cx,cy,r,0,Math.PI*2);
  beastRingCtx.strokeStyle='rgba(255,255,255,0.04)'; beastRingCtx.lineWidth=4; beastRingCtx.stroke();
  if(pct>0){ beastRingCtx.beginPath(); beastRingCtx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+(pct/100)*Math.PI*2); beastRingCtx.strokeStyle='#d946ef'; beastRingCtx.lineWidth=4; beastRingCtx.lineCap='round'; beastRingCtx.stroke(); }
}
function beastFmt(s){return`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
function beastTickTimer(){
  const el=Math.floor((Date.now()-beastOvStart)/1000); beastOverlayElapsed.textContent=beastFmt(el);
  if(beastCurPct>2&&beastCurPct<99) beastOverlayEta.textContent=beastFmt(Math.max(0,Math.ceil((100-beastCurPct)/(beastCurPct/Math.max(1,el)))));
  else if(beastCurPct>=99) beastOverlayEta.textContent='0:00';
}
function beastShowOverlay(lbl){
  beastCurPct=0; beastOvStart=Date.now(); beastOverlay.classList.add('show'); beastOverlayPhase.textContent=lbl||'PREPARING'; beastDrawRing(0);
  beastOverlayBar.style.width='0%'; beastOverlayPct.textContent='0%'; beastOverlayElapsed.textContent='0:00'; beastOverlayEta.textContent='—';
  ['msDot1','msDot2','msDot3','msDot4'].forEach(id=>beastGet(id).className='ms-dot'); ['msLine1','msLine2','msLine3'].forEach(id=>beastGet(id).className='ms-line');
  clearInterval(beastTimerInt); beastTimerInt=setInterval(beastTickTimer,500);
}
function beastHideOverlay(){beastOverlay.classList.remove('show');clearInterval(beastTimerInt);}
function beastSetProgress(pct,sub){ beastCurPct=Math.min(pct,100); beastDrawRing(beastCurPct); beastOverlayBar.style.width=beastCurPct+'%'; beastOverlayPct.textContent=Math.round(beastCurPct)+'%'; if(sub) beastOverlaySub.textContent=sub; }
function beastSetPhase(lbl,step){ beastOverlayPhase.textContent=lbl; beastRingLabel.textContent=['','SCAN','PROC','ENC','INJECT'][step]||''; if(!step) return; for(let i=1;i<=4;i++) beastGet('msDot'+i).className=i<step?'ms-dot done':i===step?'ms-dot active':'ms-dot'; for(let i=1;i<=3;i++) beastGet('msLine'+i).className=i<step?'ms-line done':'ms-line'; }
function beastLog(msg,type='normal'){ const l=document.createElement('div'); l.className='log-line '+type; l.textContent='> '+msg; beastTerminal.appendChild(l); beastTerminal.scrollTop=beastTerminal.scrollHeight; while(beastTerminal.children.length>40) beastTerminal.removeChild(beastTerminal.firstChild); }
function beastNotifyParentSize(){ if(window.top===window) return; const h=Math.ceil(document.documentElement.scrollHeight||document.body.scrollHeight||560); window.parent.postMessage({source:'beast-popup',type:'resize',height:h},window.location.origin); }

function beastUpdateToggleUI(on){ beastStatusPill.textContent=on?'ACTIVE':'OFF'; beastStatusPill.classList.toggle('on',on); beastToggleWrap.classList.toggle('on',on); }

beastToggleBtn.addEventListener('change',async()=>{
  const on=beastToggleBtn.checked; beastUpdateToggleUI(on); chrome.storage.local.set({beast_fps_active:on});
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.url?.includes('tiktok.com')) return;
  chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:(a)=>{a?window.beastActivate?.():window.beastDeactivate?.();},args:[on]}).catch(()=>{});
});

(async()=>{
  const s=await chrome.storage.local.get('beast_fps_active');
  if(s.beast_fps_active===true){
    beastToggleBtn.checked=true; beastUpdateToggleUI(true);
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(tab?.url?.includes('tiktok.com')) chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:()=>window.beastActivate?.()}).catch(()=>{});
  }
})();

window.addEventListener('load',beastNotifyParentSize);
new ResizeObserver(()=>beastNotifyParentSize()).observe(document.body);

beastDropZone.addEventListener('click',()=>{if(!beastIsProcessing) beastFileInput.click();});

beastFileInput.addEventListener('change',async(e)=>{
  const file=e.target.files[0]; if(!file) return;
  beastSelectedFile=file; beastNeedsDownscale=false; beastNeedsCompression=false;
  beastDropLabel.textContent=file.name.length>30?file.name.slice(0,27)+'...':file.name;
  beastDropTag.textContent='FILE LOADED'; beastDropZone.classList.add('has-file'); beastDropZone.classList.remove('busy');
  beastDownscaleNote.classList.remove('show');
  ['ms-b-res','ms-b-fps','ms-b-kbps','ms-b-mb'].forEach(id=>beastGet(id).textContent='—');
  ['sb-res','sb-fps','sb-kbps','sb-mb'].forEach(id=>beastGet(id).classList.remove('lit'));
  beastLog('Scanning MP4...','highlight');
  
  const frameCount=await beastReadFrameCount(await file.slice(0,157286400).arrayBuffer());
  const vid=document.createElement('video'); vid.preload='metadata';
  vid.onloadedmetadata=()=>{
    beastVideoWidth=vid.videoWidth; beastVideoHeight=vid.videoHeight;
    const mb=(file.size/1048576).toFixed(1), mbps=vid.duration>0?((file.size*8)/vid.duration/1e6).toFixed(1):'?';
    const fps=(frameCount&&vid.duration>0)?Math.round(frameCount/vid.duration):'?';
    beastDetectedFps=(typeof fps==='number'&&fps>60)?fps:60;
    beastNeedsDownscale=Math.max(beastVideoWidth,beastVideoHeight)>1920;
    
    beastGet('ms-b-res').textContent=`${beastVideoWidth}×${beastVideoHeight}`;
    beastGet('ms-b-fps').textContent=`${fps}`; beastGet('ms-b-kbps').textContent=`${mbps}`; beastGet('ms-b-mb').textContent=`${mb}`;
    ['sb-res','sb-fps','sb-kbps','sb-mb'].forEach(id=>beastGet(id).classList.add('lit'));
    
    if(file.size>BEAST_MAX_FILE_BYTES){
      beastNeedsCompression=true;
      alert(`File is ${(file.size/1048576).toFixed(1)}MB. Maximum supported size is 100MB. Please compress your video before uploading.`);
      beastLog('File too large. Compress to under 100MB.','error');
      return;
    }
    
    if(beastNeedsDownscale){ 
      beastDownscaleNote.classList.add('show'); 
      beastLog(`${beastVideoWidth}x${beastVideoHeight} > 1080p — Downscale required.`,'error'); 
      beastActionBtn.disabled=true;
      beastActionLabel.textContent='DOWNSCALE REQUIRED';
      return;
    }
    
    beastLog(`${beastVideoWidth}x${beastVideoHeight} · ${fps}fps · ${mbps}Mbps`,'normal');
    beastLog(`Ready: ${file.name.slice(0,28)}`,'highlight');
    beastActionBtn.disabled=false; beastActionBtn.classList.add('ready');
    beastActionLabel.textContent='POST VIA BEAST';
  };
  vid.src=URL.createObjectURL(file);
});

beastActionBtn.addEventListener('click',async()=>{
  if(!beastSelectedFile||beastIsProcessing) return;
  if(beastNeedsDownscale){ beastLog('Please downscale this video to 1080p first.','error'); return; }
  if(beastNeedsCompression){ beastLog('Please compress this file before posting.','error'); return; }
  
  beastIsProcessing=true; beastActionBtn.disabled=true; beastActionBtn.classList.remove('ready');
  beastDropZone.classList.add('busy'); beastDropZone.classList.remove('has-file');
  beastDownscaleNote.classList.remove('show'); beastShowOverlay('STARTING'); 
  
  let bufferToUpload = await beastSelectedFile.arrayBuffer();
  const bypassState = await chrome.storage.local.get('beast_fps_active');
  const isBypassActive = bypassState.beast_fps_active === true;

  if (isBypassActive) {
    beastSetProgress(50,'Optimizing');
    beastSetPhase('PROCESSING',2); beastLog('Applying structural patch...','normal'); beastSetProgress(63,'Optimizing...');
    bufferToUpload = beastPatchElstBox(bufferToUpload); 
    beastLog('Optimization complete','success'); beastSetProgress(73,'Prepared');
  } else {
    beastSetProgress(50,'Standard');
    beastLog('Preparing video for upload...','normal'); beastSetProgress(73,'Prepared');
  }
  
  beastSetPhase('ENCODING',3); beastLog('Encoding...','normal'); beastSetProgress(81,'Encoding...');
  const dataURL=await beastBufferToDataURL(bufferToUpload);
  const outName=beastSelectedFile.name; 
  
  beastSetPhase('INJECTING',4); beastLog('Finding TikTok...','normal'); beastSetProgress(88,'Searching...');
  let tid=null; const tabs=await chrome.tabs.query({url:'*://*.tiktok.com/*'});
  if(tabs.length>0){ const up=tabs.find(t=>t.url&&(t.url.includes('/upload')||t.url.includes('/creator-center'))); tid=(up||tabs[0]).id; beastLog('TikTok found','normal'); }
  else{ beastLog('Opening TikTok...','normal'); const nt=await chrome.tabs.create({url:'https://www.tiktok.com/upload',active:false}); tid=nt.id; await new Promise(r=>{chrome.tabs.onUpdated.addListener(function w(id,info){if(id===nt.id&&info.status==='complete'){chrome.tabs.onUpdated.removeListener(w);setTimeout(r,2500);}});}); }
  
  beastSetProgress(93,'Injecting...');
  try{
    const res=await chrome.scripting.executeScript({target:{tabId:tid},args:[dataURL,outName],func:beastDeliverToUploader});
    const r=res?.[0]?.result; if(!r?.ok) throw new Error(r?.error||'Failed');
    chrome.tabs.update(tid,{active:true}); beastSetProgress(100,'DONE'); beastLog('DELIVERED TO TIKTOK ✓','success');
    setTimeout(()=>{ beastHideOverlay(); beastActionBtn.classList.add('ok'); beastActionLabel.textContent='✓ SENT TO TIKTOK'; beastDropZone.classList.remove('busy'); beastDropTag.textContent='DONE!'; setTimeout(beastResetUI,4000); },1000);
  }catch(err){
    beastLog('ERROR: '+err.message,'error'); beastHideOverlay(); beastActionBtn.disabled=false;
    beastActionBtn.classList.add('ready'); beastActionLabel.textContent='RETRY';
    beastDropZone.classList.remove('busy'); beastDropZone.classList.add('has-file'); beastIsProcessing=false;
  }
});

function beastResetUI(){
  beastActionBtn.classList.remove('ok','ready'); beastActionLabel.textContent='Select a file first';
  beastActionBtn.disabled=true; beastSelectedFile=null; beastNeedsDownscale=false; beastNeedsCompression=false; beastIsProcessing=false;
  beastFileInput.value=''; beastDropZone.classList.remove('has-file','busy');
  beastDropLabel.textContent='Drag & drop video'; beastDropTag.textContent='SELECT FILE';
  beastDownscaleNote.classList.remove('show');
  ['ms-b-res','ms-b-fps','ms-b-kbps','ms-b-mb'].forEach(id=>beastGet(id).textContent='—');
  ['sb-res','sb-fps','sb-kbps','sb-mb'].forEach(id=>beastGet(id).classList.remove('lit'));
  beastNotifyParentSize();
}