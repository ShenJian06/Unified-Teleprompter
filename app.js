/* Unified Teleprompter Mobile (Overlay + Voice) — STOP la ultimele 2 rânduri + scroll manual OK */
(() => {
  const qs = s => document.querySelector(s);
  const qsa = s => Array.from(document.querySelectorAll(s));

  // Elements
  const cam = qs('#cam');
  const overlay = qs('#overlay');
  const viewport = qs('#viewport');
  const prompt = qs('#prompt');
  const statusChip = qs('#statusChip');

  // Buttons
  const btnCam = qs('#btnCam');
  const btnStart = qs('#btnStart');
  const btnPause = qs('#btnPause');
  const btnReset = qs('#btnReset');
  const btnMirrorH = qs('#btnMirrorH');
  const btnMirrorV = qs('#btnMirrorV');
  const btnDim = qs('#btnDim');
  const btnFS = qs('#btnFS');
  const btnVoice = qs('#btnVoice');

  // Floating controls
  const fcZoomIn = qs('#fcZoomIn');
  const fcZoomOut = qs('#fcZoomOut');
  const fcFaster = qs('#fcFaster');
  const fcSlower = qs('#fcSlower');
  const fcUp = qs('#fcUp');
  const fcDown = qs('#fcDown');

  // Sheet (editor)
  const sheet = qs('#sheet');
  const editor = qs('#editor');
  const btnPrepare = qs('#btnPrepare');
  const btnLoad = qs('#btnLoad');
  const btnSave = qs('#btnSave');
  const fileInput = qs('#fileInput');

  // Controls in sheet
  const speed = qs('#speed');
  const speedVal = qs('#speedVal');
  const fontSize = qs('#fontSize');
  const fontVal = qs('#fontVal');
  const lineHeight = qs('#lineHeight');
  const lhVal = qs('#lhVal');
  const hPadding = qs('#hPadding');
  const padVal = qs('#padVal');
  const countdownInput = qs('#countdown');

  // State
  let prepared = false;
  let running = false;
  let lastTs = 0;
  let scrollPxPerSec = +speed.value;
  let rafId = null;
  let mirrorH = false, mirrorV = false;

  // Voice
  let voiceOn = false;
  let recognition = null;

  // Auto-pause safety
  let autoPauseToken = 0;
  let pausedByAuto = false;

  // ===== Helpers =====
  const clamp = (n,min,max) => Math.max(min, Math.min(max, n));
  const setStatus = t => { statusChip.textContent = t; };

  // Linie de bază pentru „ultimele 2 rânduri”
  function getLineHeightPx(){
    const cs = getComputedStyle(prompt);
    let lh = cs.lineHeight;
    if (lh === 'normal'){
      // fallback simplu: factor 1.3 din mărimea fontului
      lh = parseFloat(cs.fontSize) * 1.3;
    } else {
      lh = parseFloat(lh);
    }
    return lh || 32;
  }
  function getMaxAutoScrollTop(){
    // oprește când ultimele 2 rânduri sunt vizibile
    const max = prompt.offsetHeight - viewport.clientHeight - getLineHeightPx()*2;
    return Math.max(0, Math.floor(max));
  }
  function clampToMaxEnd(){
    const maxTop = getMaxAutoScrollTop();
    if (viewport.scrollTop > maxTop) viewport.scrollTop = maxTop;
  }

  function applyStyleFromControls(){
    prompt.style.fontSize  = `${+fontSize.value}px`;
    prompt.style.lineHeight = String(+lineHeight.value);
    viewport.style.paddingInline = `${+hPadding.value}%`;
    speedVal.textContent = String(speed.value);
    fontVal.textContent  = String(fontSize.value);
    lhVal.textContent    = (+lineHeight.value).toFixed(1);
    padVal.textContent   = String(hPadding.value);
    clampToMaxEnd();        // dacă ai mărit fontul, recalculează limită
    updateActiveWord();
  }

  function buildPromptFromEditor(){
    const escapeHtml = s => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    const raw = editor.value.replace(/\r\n/g, '\n').replace(/\t/g, '    ');
    const tokens = raw.split(/(\[\[PAUSE\s+\d+\.?\d*s\]\])/i);
    const html = tokens.map(tok => {
      const m = tok.match(/^\[\[PAUSE\s+(\d+\.?\d*)s\]\]$/i);
      if (m){
        const sec = parseFloat(m[1]);
        return `<div class="pause" data-sec="${sec}" style="opacity:.75;margin:1em 0;font-size:.65em;">⏸ Pauză ${sec}s</div>`;
      }
      return tok
        .split(/(\s+)/)
        .map(w => /\s+/.test(w) ? w.replace(/\n/g,'<br/>') : (w ? `<span class="word">${escapeHtml(w)}</span>` : ''))
        .join('');
    }).join('');
    prompt.innerHTML = html;
  }

  function updateActiveWord(){
    const midY = viewport.getBoundingClientRect().top + viewport.clientHeight/2;
    let best=null, bestDy=Infinity;
    qsa('.word').forEach(w=>{
      const r = w.getBoundingClientRect();
      const dy = Math.abs((r.top+r.bottom)/2 - midY);
      if (dy < bestDy){ bestDy = dy; best = w; }
    });
    qsa('.word.active').forEach(w=>w.classList.remove('active'));
    if (best) best.classList.add('active');
  }

  function handleAutoPauses(){
    const midY = viewport.getBoundingClientRect().top + viewport.clientHeight/2;
    for (const p of qsa('.pause')){
      if (p.dataset.done) continue;
      const r = p.getBoundingClientRect();
      if (r.top <= midY && r.bottom >= midY){
        p.dataset.done = '1';
        const sec = parseFloat(p.dataset.sec || '0');
        const token = ++autoPauseToken;
        const prevSpeed = scrollPxPerSec;

        pausedByAuto = true;
        pauseRun(false);
        setStatus(`Paused (${sec}s)`);

        setTimeout(()=>{
          if (token === autoPauseToken && pausedByAuto){
            scrollPxPerSec = prevSpeed;
            resumeRun();
          }
        }, sec*1000);
        break;
      }
    }
  }

  function tick(ts){
    if (!running) return;
    if (!lastTs) lastTs = ts;
    const dt = (ts - lastTs)/1000;
    lastTs = ts;

    handleAutoPauses();

    const maxTop = getMaxAutoScrollTop();
    const nextTop = Math.min(viewport.scrollTop + scrollPxPerSec * dt, maxTop);
    viewport.scrollTop = nextTop;

    updateActiveWord();

    if (nextTop >= maxTop - 0.5){
      stopRun();
      setStatus('Done');
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function prepareRun(){
    buildPromptFromEditor();
    viewport.scrollTop = 0;
    qsa('.pause').forEach(p => delete p.dataset.done);
    prepared = true;
    setStatus('Ready');
    updateActiveWord();
  }

  async function startRun(){
    if (!prepared) prepareRun();

    const cd = clamp(+countdownInput.value || 0, 0, 10);
    if (cd > 0) await countdownOverlay(cd);

    running = true;
    pausedByAuto = false;
    lastTs = 0;
    setStatus('Running');
    rafId = requestAnimationFrame(tick);
  }

  function pauseRun(manual = true){
    if (!running) { setStatus('Paused'); return; }
    running = false;
    cancelAnimationFrame(rafId);
    if (manual){
      pausedByAuto = false;
      autoPauseToken++;
    }
    setStatus('Paused');
  }

  function resumeRun(){
    if (running) return;
    running = true;
    lastTs = 0;
    setStatus('Running');
    rafId = requestAnimationFrame(tick);
  }

  function stopRun(){
    running = false;
    cancelAnimationFrame(rafId);
  }

  function resetRun(){
    stopRun();
    viewport.scrollTop = 0;
    qsa('.pause').forEach(p => delete p.dataset.done);
    prepared = true;
    pausedByAuto = false;
    autoPauseToken++;
    setStatus('Idle');
    updateActiveWord();
  }

  function countdownOverlay(sec){
    return new Promise(res=>{
      const el = document.createElement('div');
      el.className = 'countdown';
      el.textContent = sec;
      document.body.appendChild(el);
      let n = sec;
      const iv = setInterval(()=>{
        n--;
        if (n <= 0){
          clearInterval(iv); el.remove(); res();
        } else el.textContent = n;
      }, 1000);
    });
  }

  // ===== Camera =====
  async function toggleCamera(){
    if (cam.srcObject){
      cam.pause();
      cam.srcObject.getTracks().forEach(t=>t.stop());
      cam.srcObject = null;
      btnCam.classList.remove('accent');
      return;
    }
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'user' }, audio:false });
      cam.srcObject = stream;
      await cam.play();
      btnCam.classList.add('accent');
    }catch(e){
      alert('Nu pot porni camera (pe iOS necesită HTTPS/localhost): ' + e.message);
    }
  }

  // ===== Controls =====
  function changeSpeed(delta){
    const v = clamp(+speed.value + delta, 10, 300);
    speed.value = v; scrollPxPerSec = v; speedVal.textContent = String(v);
  }
  function zoom(delta){
    const v = clamp(+fontSize.value + delta, 22, 84);
    fontSize.value = v; applyStyleFromControls();
  }
  function manualScroll(delta){
    viewport.scrollBy({ top: delta, behavior: 'smooth' });
    clampToMaxEnd();
    updateActiveWord();
  }

  function toggleDim(){ overlay.classList.toggle('dim'); }
  function toggleFS(){ if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }

  // ===== Voice (RO + cuvinte EN uzuale) =====
  function toggleVoice(){
    if (voiceOn){ stopVoice(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR){ alert('Comenzile vocale nu sunt suportate în acest browser.'); return; }
    recognition = new SR();
    recognition.lang = 'ro-RO';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (e) => {
      const txt = Array.from(e.results).slice(-1)[0][0].transcript.toLowerCase().trim();
      const has = (...keys) => keys.some(k => txt.includes(k));

      if (has('start','pornește','porneste','play')) { running ? null : (prepared ? resumeRun() : startRun()); }
      else if (has('pauză','pauza','pause','stop')) { pauseRun(true); }
      else if (has('de la început','de la inceput','from start','restart','stop again')) { resetRun(); startRun(); }
      else if (has('mai repede','faster','speed up','stop faster')) { changeSpeed(+20); }
      else if (has('mai încet','mai incet','slower','speed down','stop slower')) { changeSpeed(-20); }
      else if (has('derulează sus','deruleaza sus','scroll up','up')) { manualScroll(-220); }
      else if (has('derulează jos','deruleaza jos','scroll down','down')) { manualScroll(+220); }
      else if (has('mărește textul','mareste textul','zoom in','bigger')) { zoom(+2); }
      else if (has('micșorează textul','micsoreaza textul','zoom out','smaller')) { zoom(-2); }
      else if (has('mirror','oglindă','oglinda')) { mirrorH = !mirrorH; document.body.classList.toggle('mirror-h', mirrorH); }
      btnVoice.classList.add('accent'); setTimeout(()=>btnVoice.classList.remove('accent'), 180);
    };
    recognition.onend = () => { if (voiceOn) recognition.start(); };
    recognition.start();
    voiceOn = true;
    btnVoice.classList.add('accent');
    setStatus('Voice ON');
  }
  function stopVoice(){
    voiceOn = false;
    btnVoice.classList.remove('accent');
    if (recognition){ recognition.onend = null; recognition.stop(); recognition = null; }
    setStatus('Voice OFF');
  }

  // ===== Gesturi mobile =====
  const isInteractive = el =>
    el.closest('.sheet') || el.closest('.dock') || el.closest('.topbar') || el.closest('.floatctl') ||
    el.closest('textarea') || el.closest('button') || el.closest('input');

  // dublu-tap start/pause (ignorat pe UI)
  let lastTap = 0;
  document.addEventListener('touchend', (e)=>{
    if (isInteractive(e.target)) return;
    const now = Date.now();
    if (now - lastTap < 280){
      running ? pauseRun(true) : (prepared ? resumeRun() : startRun());
    }
    lastTap = now;
  }, {passive:true});

  // pinch zoom
  let pinchDist0 = null;
  document.addEventListener('touchmove', (e)=>{
    if (isInteractive(e.target)) return;
    if (e.touches.length===2){
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const d = Math.hypot(dx,dy);
      if (pinchDist0===null) pinchDist0 = d;
      const delta = d - pinchDist0;
      if (Math.abs(delta) > 8){
        zoom(delta>0 ? +1 : -1);
        pinchDist0 = d;
      }
    }
  }, {passive:true});
  document.addEventListener('touchend', ()=>{ if (pinchDist0!==null) pinchDist0=null; }, {passive:true});

  // swipe sus/jos = scroll manual
  let startY=null;
  viewport.addEventListener('touchstart', (e)=>{ if(e.touches.length===1){ startY=e.touches[0].clientY; }}, {passive:true});
  viewport.addEventListener('touchmove', (e)=>{
    if (startY!==null && e.touches.length===1){
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dy) > 6){
        manualScroll(-dy);
        startY = e.touches[0].clientY;
      }
    }
  }, {passive:true});
  viewport.addEventListener('touchend', ()=> startY=null, {passive:true});

  // ===== Wiring =====
  btnCam.addEventListener('click', toggleCamera);
  btnStart.addEventListener('click', startRun);
  btnPause.addEventListener('click', () => running ? pauseRun(true) : resumeRun());
  btnReset.addEventListener('click', resetRun);

  btnMirrorH.addEventListener('click', () => { mirrorH = !mirrorH; document.body.classList.toggle('mirror-h', mirrorH); });
  btnMirrorV.addEventListener('click', () => { mirrorV = !mirrorV; document.body.classList.toggle('mirror-v', mirrorV); });
  btnDim.addEventListener('click', toggleDim);
  btnFS.addEventListener('click', toggleFS);
  btnVoice.addEventListener('click', toggleVoice);

  fcZoomIn.addEventListener('click', () => zoom(+2));
  fcZoomOut.addEventListener('click', () => zoom(-2));
  fcFaster.addEventListener('click', () => changeSpeed(+20));
  fcSlower.addEventListener('click', () => changeSpeed(-20));
  fcUp.addEventListener('click', () => manualScroll(-220));
  fcDown.addEventListener('click', () => manualScroll(+220));

  speed.addEventListener('input', ()=>{ scrollPxPerSec = +speed.value; speedVal.textContent = String(speed.value); });
  fontSize.addEventListener('input', applyStyleFromControls);
  lineHeight.addEventListener('input', applyStyleFromControls);
  hPadding.addEventListener('input', applyStyleFromControls);

  btnPrepare.addEventListener('click', prepareRun);

  // File load/save
  btnLoad.addEventListener('click', ()=>fileInput.click());
  fileInput.addEventListener('change', async (e)=>{
    const f = e.target.files[0]; if (!f) return;
    editor.value = await f.text();
    prepareRun();
  });
  btnSave.addEventListener('click', ()=>{
    const blob = new Blob([editor.value], {type:'text/plain;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'script.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // Sheet open/close
  let sheetOpen = false, sy=null;
  sheet.addEventListener('touchstart', e=>{ sy=e.touches[0].clientY; }, {passive:true});
  sheet.addEventListener('touchmove', e=>{
    if (sy==null) return;
    const dy = e.touches[0].clientY - sy;
    if (!sheetOpen && dy < -30) { sheet.classList.add('open'); sheetOpen=true; sy=e.touches[0].clientY; }
    if (sheetOpen && dy > 30) { sheet.classList.remove('open'); sheetOpen=false; sy=e.touches[0].clientY; }
  }, {passive:true});
  qs('.status').addEventListener('click', ()=>{
    sheetOpen = !sheetOpen;
    sheet.classList.toggle('open', sheetOpen);
  });

  // Actualizează highlight la orice scroll/resize/orientare
  viewport.addEventListener('scroll', updateActiveWord, {passive:true});
  new ResizeObserver(() => { clampToMaxEnd(); updateActiveWord(); }).observe(viewport);
  window.addEventListener('orientationchange', () => setTimeout(()=>{ clampToMaxEnd(); updateActiveWord(); }, 300));

  // Cleanup cameră
  window.addEventListener('beforeunload', ()=>{
    if (cam.srcObject) cam.srcObject.getTracks().forEach(t=>t.stop());
  });

  // ===== Init =====

  // IMPORTANT: fac overlay interactiv ca să poți derula cu degetul
  overlay.style.pointerEvents = 'auto';  // (dacă vrei să nu blocheze video, poți seta doar viewport.style.pointerEvents='auto')

  editor.value = `Bun venit la varianta mobilă cu OVERLAY + VOICE.

Comenzi (RO/EN):
• start / pornește    • pauză / stop
• mai repede / faster • mai încet / slower
• derulează sus/jos / scroll up/down
• mărește/micșorează textul / zoom in/out
• de la început / stop again

Folosește [[PAUSE 2s]] pentru pauze cronometrate.`;
  applyStyleFromControls();
  prepareRun();
})();
