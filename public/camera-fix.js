(function(){
  'use strict';

  let warmPromise=null;

  function forceClockPhotosOn(){
    try{
      if(typeof state!=='undefined' && state && state.config && state.config.settings){
        // Public kiosk sessions only receive the public site list, so they do
        // not receive the private clockPhotos setting. Photos are enabled for
        // kiosks by policy; keep this local flag on so the clock flow actually
        // asks the browser for the camera.
        state.config.settings.clockPhotos=true;
      }
    }catch(_e){}
  }

  function cameraErrorText(err){
    const name=String(err&&err.name||'');
    if(name==='NotAllowedError' || name==='SecurityError') return 'camera permission is blocked for this site/app';
    if(name==='NotFoundError' || name==='DevicesNotFoundError') return 'no camera was found on this tablet';
    if(name==='NotReadableError' || name==='TrackStartError') return 'the camera is already in use by another app';
    if(name==='OverconstrainedError' || name==='ConstraintNotSatisfiedError') return 'the tablet camera could not use the requested mode';
    if(name==='AbortError') return 'the camera request was interrupted';
    const msg=String(err&&err.message||'').trim();
    return msg || 'the camera could not be opened';
  }

  function requestCamera(){
    forceClockPhotosOn();
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      return Promise.reject(Object.assign(new Error('Camera API is not available in this browser'),{name:'NotSupportedError'}));
    }
    if(!warmPromise){
      warmPromise=navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:'user'},width:{ideal:640},height:{ideal:480}},
        audio:false
      }).catch(err=>{ warmPromise=null; throw err; });
    }
    return warmPromise;
  }

  // Ask for the camera directly from the user's tap, before the clock RPC.
  // Some Android browsers/webviews will not show a permission prompt if the
  // request happens only after an awaited network call.
  function warmFromClockTap(e){
    const el=e.target && e.target.closest ? e.target.closest('[data-action="do-clock"]') : null;
    if(!el) return;
    forceClockPhotosOn();
    requestCamera().catch(()=>{});
  }
  document.addEventListener('pointerdown',warmFromClockTap,true);
  document.addEventListener('touchstart',warmFromClockTap,{capture:true,passive:true});

  // Replace the silent capture helper with one that reuses the camera opened
  // by the direct tap and reports the real Android/Chrome error if it fails.
  try{
    captureClockPhoto=async function(){
      let stream=null;
      try{
        stream=await requestCamera();
        const video=document.createElement('video');
        video.playsInline=true;
        video.muted=true;
        video.autoplay=true;
        video.srcObject=stream;
        await video.play();
        if(!video.videoWidth || !video.videoHeight){
          await Promise.race([
            new Promise(resolve=>video.addEventListener('loadedmetadata',resolve,{once:true})),
            new Promise(resolve=>setTimeout(resolve,900))
          ]);
        }
        await new Promise(resolve=>setTimeout(resolve,450));
        const vw=video.videoWidth||640, vh=video.videoHeight||480;
        const w=320, h=Math.max(180,Math.round(vh*(w/vw)));
        const canvas=document.createElement('canvas');
        canvas.width=w; canvas.height=h;
        const ctx=canvas.getContext('2d');
        if(!ctx) throw new Error('Camera image canvas is unavailable');
        ctx.drawImage(video,0,0,w,h);
        const image=canvas.toDataURL('image/jpeg',0.55);
        if(!image || image.length<1000) throw new Error('Camera returned an empty image');
        return image;
      }catch(err){
        console.error('Shift Board camera failed:',err);
        try{ showToast('Camera error — '+cameraErrorText(err),true); }catch(_e){}
        return null;
      }finally{
        if(stream){ try{ stream.getTracks().forEach(t=>t.stop()); }catch(_e){} }
        warmPromise=null;
      }
    };
  }catch(_e){}

  forceClockPhotosOn();
})();
