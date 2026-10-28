const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg', CX = 300, PITCH = 330;
const vp = $('viewport'), world = $('world'), svg = $('wb'), bubble = $('bubble'), mouth = $('mouth'), au = $('au');
const rc = window.rough ? rough.svg(svg) : null;
const cam = { x: 0, y: 0, s: 1 };
let run = 0, paused = false, muted = false, quick = false, curIdx = 0, current = null, lessons = [];
let audioActive = false, mouthMode = 'off', analyser = null, actx = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const cardY = (i) => 170 + i * PITCH;
const fitScale = () => clamp((innerWidth - 30) / 520, 0.62, 1.2);
const apply = () => { world.style.transform = 'translate(' + cam.x + 'px,' + cam.y + 'px) scale(' + cam.s + ')'; };

function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200); }

/* ---------- Infinite board: mouse drag, one-finger pan, two-finger pinch ---------- */
const ptrs = new Map();
function zoomAt(cx, cy, f) {
  const ns = clamp(cam.s * f, 0.35, 2.5), k = ns / cam.s;
  cam.x = cx - (cx - cam.x) * k; cam.y = cy - (cy - cam.y) * k; cam.s = ns;
}
function geom() {
  const p = [...ptrs.values()];
  if (p.length < 2) return { x: p[0].x, y: p[0].y, d: 0 };
  return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2, d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) };
}
vp.addEventListener('pointerdown', (e) => {
  vp.setPointerCapture(e.pointerId); gsap.killTweensOf(cam);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); vp.classList.add('drag'); $('menu').hidden = true;
});
vp.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return;
  const before = geom();
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const after = geom();
  if (ptrs.size >= 2 && before.d && after.d) zoomAt(after.x, after.y, after.d / before.d);
  cam.x += after.x - before.x; cam.y += after.y - before.y; apply();
});
const up = (e) => { ptrs.delete(e.pointerId); if (!ptrs.size) vp.classList.remove('drag'); };
vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
vp.addEventListener('wheel', (e) => { e.preventDefault(); gsap.killTweensOf(cam); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 0.9); apply(); }, { passive: false });

function focusStep(i, dur = 1) {
  const s = fitScale();
  gsap.to(cam, { x: innerWidth / 2 - (CX + 220) * s, y: (innerHeight - 210) / 2 - (cardY(i) + 60) * s, s, duration: dur, ease: 'power2.inOut', onUpdate: apply });
}

/* ---------- Bubble: blinking + speech-synced mouth ---------- */
gsap.to(bubble, { rotation: 4, duration: 2.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });
(function blink() { gsap.to(['#eL', '#eR'], { scaleY: 0.1, duration: 0.07, yoyo: true, repeat: 1, delay: 2.5 + Math.random() * 3, onComplete: blink }); })();

function setupAnalyser() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const src = actx.createMediaElementSource(au);
    analyser = actx.createAnalyser(); analyser.fftSize = 256;
    src.connect(analyser); analyser.connect(actx.destination);
  } catch (e) { analyser = null; }
}
const buf = new Uint8Array(128);
(function mouthLoop() {
  let h = 6;
  if (!paused) {
    if (mouthMode === 'audio' && analyser) {
      analyser.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      h = 5 + Math.min(1, Math.sqrt(sum / buf.length) * 5) * 14;
    } else if (mouthMode === 'random') h = 4 + Math.random() * 10;
  }
  mouth.style.height = h + 'px';
  requestAnimationFrame(mouthLoop);
})();

/* ---------- Lesson playback: glide -> speak + type -> sketch box ---------- */
function bars(n, active) {
  const b = $('bars'); b.innerHTML = '';
  for (let i = 0; i < n; i++) { const d = document.createElement('i'); if (i <= active) d.className = 'on'; b.appendChild(d); }
  $('count').textContent = n ? Math.min(active + 1, n) + '/' + n : '0/0';
}
function wrap(t, n) {
  const l = []; let c = '';
  t.split(/\s+/).forEach((w) => { if ((c + ' ' + w).trim().length > n) { l.push(c); c = w; } else c = (c + ' ' + w).trim(); });
  if (c) l.push(c); return l;
}
const glide = (x, y) => new Promise((r) => gsap.to(bubble, { left: x, top: y, duration: 1.1, ease: 'power2.inOut', onComplete: r }));
async function hold(my) { while (paused && my === run) await sleep(100); }
function stopVoice() { au.pause(); audioActive = false; mouthMode = 'off'; if (window.speechSynthesis) speechSynthesis.cancel(); }

async function play(lesson, voice = true) {
  const my = ++run; stopVoice(); paused = false; $('bPlay').textContent = '⏸';
  const parts = lesson.text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).slice(0, 4);
  svg.innerHTML = ''; bars(parts.length, -1);
  let dur = 0;
  if (voice && lesson.audio && !quick) {
    au.src = lesson.audio; au.currentTime = 0;
    await new Promise((r) => { au.onloadedmetadata = r; au.onerror = r; setTimeout(r, 4000); });
    dur = isFinite(au.duration) ? au.duration : 0;
  }
  const total = parts.reduce((a, p) => a + p.length, 0);
  for (let i = 0; i < parts.length; i++) {
    if (my !== run) return; await hold(my);
    curIdx = i; bars(parts.length, i);
    const y = cardY(i), text = parts[i], lines = wrap(text, 32), h = 70 + lines.length * 32;
    focusStep(i);
    await glide(CX + 4, y - 110);                                  // Step A: glide first
    if (my !== run) return; await hold(my);
    const el = document.createElementNS(NS, 'text'); el.setAttribute('class', 'body'); svg.appendChild(el);
    const spans = lines.map((_, k) => { const s = document.createElementNS(NS, 'tspan'); s.setAttribute('x', CX); s.setAttribute('y', y + 20 + k * 32); el.appendChild(s); return s; });
    let ms = quick ? Math.max(900, text.length * 14) : Math.max(1800, text.length * 48);
    if (dur) {                                                      // Step B: speech + typing
      ms = dur * 1000 * text.length / total; audioActive = true; mouthMode = 'audio';
      setupAnalyser(); if (actx && actx.state === 'suspended') actx.resume();
      au.muted = muted; au.play().catch(() => { mouthMode = 'random'; });
    } else if (voice && !muted && !quick && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(text); u.lang = 'uz-UZ'; speechSynthesis.cancel(); speechSynthesis.speak(u); mouthMode = 'random';
    } else mouthMode = voice ? 'random' : 'off';
    let elapsed = 0;
    while (elapsed < ms) {
      if (my !== run) return; await hold(my);
      await sleep(30); elapsed += 30;
      let shown = Math.floor(text.length * Math.min(1, elapsed / ms));
      lines.forEach((ln, k) => { spans[k].textContent = ln.slice(0, Math.max(0, Math.min(ln.length, shown))); shown -= ln.length + 1; });
    }
    lines.forEach((ln, k) => { spans[k].textContent = ln; });
    if (dur) au.pause(); audioActive = false; mouthMode = 'off';
    if (rc) {                                                       // Step C: hand-drawn box
      const r = rc.rectangle(CX - 26, y - 22, 456, h, { stroke: '#2dd4bf', strokeWidth: 2, roughness: 1.7, bowing: 1.4 });
      svg.appendChild(r);
      r.querySelectorAll('path').forEach((p) => { const len = p.getTotalLength(); gsap.set(p, { strokeDasharray: len, strokeDashoffset: len }); gsap.to(p, { strokeDashoffset: 0, duration: 1, ease: 'power2.out' }); });
    }
    await sleep(900);
  }
  if (my === run) stopVoice();
}

/* ---------- API + UI ---------- */
async function ask(prompt) {
  prompt = prompt.trim(); if (!prompt) return;
  $('go').disabled = true; $('q').value = ''; $('menu').hidden = true;
  setupAnalyser(); if (actx && actx.state === 'suspended') actx.resume();
  try {
    toast('Bubble o\u2018ylayapti\u2026');
    const res = await fetch('/api/lesson', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, quick }) });
    if (!res.ok) throw new Error('http ' + res.status);
    const data = await res.json();
    current = { prompt, text: data.text, audio: data.audio };
    lessons.unshift(current); lessons = lessons.slice(0, 20);
    $('toast').classList.remove('on');
    play(current);
  } catch (e) {
    console.error(e); toast('Xatolik. Qayta urinib ko\u2018ring.');
  } finally { $('go').disabled = false; }
}

$('form').addEventListener('submit', (e) => { e.preventDefault(); ask($('q').value); });
$('bPlay').onclick = () => {
  paused = !paused; $('bPlay').textContent = paused ? '▶' : '⏸';
  if (audioActive) paused ? au.pause() : au.play();
  if (window.speechSynthesis) paused ? speechSynthesis.pause() : speechSynthesis.resume();
};
$('bReplay').onclick = () => current ? play(current) : toast('Hali dars yo\u2018q');
$('bMute').onclick = () => {
  muted = !muted; $('bMute').textContent = muted ? '🔇' : '🔊'; au.muted = muted;
  if (muted && window.speechSynthesis) speechSynthesis.cancel();
};
$('bShare').onclick = async () => {
  if (!current) return toast('Hali dars yo\u2018q');
  const text = current.prompt + '\n\n' + current.text;
  try { if (navigator.share) await navigator.share({ title: 'Bubble', text }); else { await navigator.clipboard.writeText(text); toast('Nusxalandi'); } } catch (e) {}
};
$('bPlus').onclick = () => toast('Fayl yuklash tez kunda');
$('bQuick').onclick = () => { quick = !quick; $('bQuick').setAttribute('aria-pressed', quick); toast(quick ? 'Tezkor rejim yoqildi' : 'Tezkor rejim o\u2018chirildi'); };
$('bMenu').onclick = () => {
  const m = $('menu'); m.innerHTML = '';
  if (!lessons.length) m.innerHTML = '<p>Savollar tarixi bo\u2018sh</p>';
  lessons.forEach((l) => { const b = document.createElement('button'); b.textContent = l.prompt; b.onclick = () => { current = l; m.hidden = true; play(l); }; m.appendChild(b); });
  m.hidden = !m.hidden;
};
addEventListener('resize', () => focusStep(curIdx, 0));

bubble.style.left = CX + 4 + 'px'; bubble.style.top = cardY(0) - 110 + 'px';
cam.s = fitScale(); focusStep(0, 0); apply();
play({ text: "Salom! Men Bubble \u2014 sizning repetitoringizman. Istalgan mavzuni yozing, men uni qadam-baqadam tushuntiraman.", audio: null }, false);
