
const $ = id => document.getElementById(id);

const viewport = $('viewport');
const world = $('world');
const svg = $('wb');
const bubble = $('bubble');
const mouth = $('mouth');
const form = $('form');
const input = $('q');
const sendBtn = $('go');
const audio = $('au');
const answers = $('answers');
const menu = $('menu');
const toast = $('toast');

const STORAGE_KEY = 'bubble-ai-history-v1';
const SESSIONS_KEY = 'bubble-ai-sessions-v1';
const SVG_NS = 'http://www.w3.org/2000/svg';

const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 3600;

let historyItems = [];
let sessions = [];
let camera = { x: 0, y: 0, scale: 1 };
let writeY = 180;
let answerNumber = 0;

let audioQueue = [];
let queueIndex = 0;
let speaking = false;
let paused = false;
let recognition = null;

let toastTimer;
let emotionTimer;
let pointers = new Map();
let lastPinchDistance = 0;
let lastPan = null;

let activeRequestCount = 0;
let lastAnswerY = 180;

/* =========================
   BUBBLE HARAKATI
========================= */

function moveBubbleTo(x, y) {
  const maxX = Math.max(8, viewport.clientWidth - bubble.offsetWidth - 8);
  const maxY = Math.max(8, viewport.clientHeight - bubble.offsetHeight - 8);

  bubble.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
  bubble.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
}

function bubbleCenter() {
  moveBubbleTo(
    (viewport.clientWidth - bubble.offsetWidth) / 2,
    (viewport.clientHeight - bubble.offsetHeight) / 2
  );
}

function bubbleAboveChat() {
  const dock = $('dock');
  const viewportRect = viewport.getBoundingClientRect();
  const dockRect = dock.getBoundingClientRect();

  const y = dockRect.top - viewportRect.top - bubble.offsetHeight - 12;

  moveBubbleTo(
    (viewport.clientWidth - bubble.offsetWidth) / 2,
    y
  );

  setEmotion('happy');
}

function bubbleNearAnswer(y) {
  const screenY = camera.y + y * camera.scale;
  const x = viewport.clientWidth - bubble.offsetWidth - 18;

  moveBubbleTo(x, screenY - bubble.offsetHeight - 15);
}

function bubbleWatchAnswer(y) {
  bubbleNearAnswer(y);
  setEmotion('thinking');
}

input.addEventListener('focus', bubbleAboveChat);

input.addEventListener('blur', () => {
  if (!activeRequestCount) {
    setEmotion('');
  }
});

window.addEventListener('resize', () => {
  if (document.activeElement === input) {
    bubbleAboveChat();
  } else {
    bubbleCenter();
  }
});

/* =========================
   TOAST VA EMOTSIYA
========================= */

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('on');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('on');
  }, 2800);
}

function setEmotion(name = '') {
  bubble.classList.remove(
    'thinking',
    'happy',
    'surprised',
    'sad'
  );

  if (name) bubble.classList.add(name);
}

function happy() {
  setEmotion('happy');

  clearTimeout(emotionTimer);
  emotionTimer = setTimeout(() => {
    if (!speaking && !activeRequestCount) {
      setEmotion('');
    }
  }, 1800);
}

/* =========================
   TARIX
========================= */

function saveHistory() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(historyItems.slice(-30))
    );
  } catch {
    showToast('Tarixni saqlash uchun joy yetarli emas.');
  }
}

function loadHistory() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || '[]'
    );

    historyItems = Array.isArray(saved) ? saved : [];
  } catch {
    historyItems = [];
  }
}

function saveSession() {
  if (!historyItems.length) return;

  const session = {
    id: Date.now(),
    time: new Date().toLocaleString('uz-UZ'),
    items: historyItems.map(item => ({
      prompt: item.prompt,
      text: item.text,
      audio: item.audio || null,
      time: item.time
    }))
  };

  sessions.unshift(session);
  sessions = sessions.slice(0, 20);

  try {
    localStorage.setItem(
      SESSIONS_KEY,
      JSON.stringify(sessions)
    );
  } catch {
    showToast('Doska tarixini saqlab bo‘lmadi.');
  }
}

function loadSessions() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(SESSIONS_KEY) || '[]'
    );

    sessions = Array.isArray(saved) ? saved : [];
  } catch {
    sessions = [];
  }
}

/* =========================
   SVG YORDAMCHILARI
========================= */

function makeSVG(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);

  Object.entries(attrs).forEach(([key, value]) => {
    node.setAttribute(key, String(value));
  });

  return node;
}

function addText(text, x, y, options = {}) {
  const node = makeSVG('text', {
    x,
    y,
    fill: options.color || '#f1f5f9',
    'font-size': options.size || 22,
    'font-family': options.font || 'Comic Sans MS, Segoe Print, cursive',
    'font-weight': options.weight || 'normal'
  });

  node.textContent = text;
  svg.appendChild(node);

  return node;
}

function wrapText(text, maxChars = 31) {
  const lines = [];

  String(text || '').split('\n').forEach(paragraph => {
    let line = '';

    paragraph.split(/\s+/).forEach(word => {
      if (!word) return;

      const next = line ? `${line} ${word}` : word;

      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });

    lines.push(line);
  });

  return lines;
}

/* =========================
   YOZISH ANIMATSIYASI
========================= */

function drawTyping(text, x, y, done) {
  const lines = wrapText(text);
  const lineHeight = 34;

  const nodes = lines.map((line, index) => {
    const node = makeSVG('text', {
      x,
      y: y + index * lineHeight,
      fill: '#f1f5f9',
      'font-size': 22,
      'font-family': 'Comic Sans MS, Segoe Print, cursive'
    });

    svg.appendChild(node);

    return { node, line };
  });

  const dot = makeSVG('circle', {
    r: 4,
    fill: '#93c5fd',
    stroke: '#fff',
    'stroke-width': 1
  });

  svg.appendChild(dot);

  let row = 0;
  let col = 0;

  function step() {
    while (
      row < nodes.length &&
      col >= nodes[row].line.length
    ) {
      row++;
      col = 0;
    }

    if (row >= nodes.length) {
      dot.remove();
      if (done) done();
      return;
    }

    const item = nodes[row];

    col++;
    item.node.textContent = item.line.slice(0, col);

    let width = col * 12;

    try {
      width = item.node.getComputedTextLength();
    } catch {}

    dot.setAttribute('cx', x + width + 3);
    dot.setAttribute('cy', y + row * lineHeight - 7);

    setTimeout(
      step,
      item.line[col - 1] === ' ' ? 15 : 35
    );
  }

  step();
}

/* =========================
   SHAKLLAR
========================= */

function drawPath(pathData, done) {
  const path = makeSVG('path', {
    d: pathData,
    fill: 'none',
    stroke: '#f1f5f9',
    'stroke-width': 4,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  });

  svg.appendChild(path);

  let total;

  try {
    total = path.getTotalLength();
  } catch {
    if (done) done();
    return;
  }

  path.style.strokeDasharray = total;
  path.style.strokeDashoffset = total;

  const dot = makeSVG('circle', {
    r: 4,
    fill: '#93c5fd',
    stroke: '#fff',
    'stroke-width': 1
  });

  svg.appendChild(dot);

  let distance = 0;

  function step() {
    distance = Math.min(total, distance + 4);

    path.style.strokeDashoffset = total - distance;

    const point = path.getPointAtLength(distance);

    dot.setAttribute('cx', point.x);
    dot.setAttribute('cy', point.y);

    if (distance < total) {
      requestAnimationFrame(step);
    } else {
      dot.remove();
      if (done) done();
    }
  }

  step();
}

function drawShape(shape, x, y, done) {
  const paths = {
    square: `M ${x} ${y} h 120 v 120 h -120 Z`,
    rectangle: `M ${x} ${y} h 160 v 95 h -160 Z`,
    triangle: `M ${x} ${y + 120} L ${x + 65} ${y} L ${x + 130} ${y + 120} Z`,
    diamond: `M ${x + 65} ${y} L ${x + 130} ${y + 65} L ${x + 65} ${y + 130} L ${x} ${y + 65} Z`,
    star: `M ${x + 65} ${y} L ${x + 82} ${y + 45} L ${x + 130} ${y + 48} L ${x + 94} ${y + 79} L ${x + 105} ${y + 126} L ${x + 65} ${y + 100} L ${x + 25} ${y + 126} L ${x + 36} ${y + 79} L ${x} ${y + 48} L ${x + 48} ${y + 45} Z`,
    heart: `M ${x + 65} ${y + 120} C ${x + 45} ${y + 100}, ${x} ${y + 70}, ${x + 10} ${y + 35} C ${x + 20} ${y}, ${x + 55} ${y + 5}, ${x + 65} ${y + 30} C ${x + 80} ${y + 5}, ${x + 115} ${y}, ${x + 120} ${y + 35} C ${x + 130} ${y + 70}, ${x + 85} ${y + 100}, ${x + 65} ${y + 120} Z`
  };

  if (shape === 'circle') {
    const circle = makeSVG('circle', {
      cx: x + 65,
      cy: y + 65,
      r: 60,
      fill: 'none',
      stroke: '#f1f5f9',
      'stroke-width': 4
    });

    svg.appendChild(circle);

    const length = circle.getTotalLength();

    circle.style.strokeDasharray = length;
    circle.style.strokeDashoffset = length;

    let distance = 0;

    const dot = makeSVG('circle', {
      r: 4,
      fill: '#93c5fd'
    });

    svg.appendChild(dot);

    function step() {
      distance = Math.min(length, distance + 4);

      circle.style.strokeDashoffset = length - distance;

      const point = circle.getPointAtLength(distance);

      dot.setAttribute('cx', point.x);
      dot.setAttribute('cy', point.y);

      if (distance < length) {
        requestAnimationFrame(step);
      } else {
        dot.remove();
        if (done) done();
      }
    }

    step();
    return;
  }

  if (paths[shape]) {
    drawPath(paths[shape], done);
  } else if (done) {
    done();
  }
}

function findShape(prompt) {
  const p = String(prompt || '').toLowerCase();

  if (/kvadrat|square/.test(p)) return ['square', 'Kvadrat'];
  if (/to‘g‘ri to‘rtburchak|to'g'ri to'rtburchak|rectangle/.test(p)) return ['rectangle', 'To‘g‘ri to‘rtburchak'];
  if (/uchburchak|triangle/.test(p)) return ['triangle', 'Uchburchak'];
  if (/doira|aylana|circle/.test(p)) return ['circle', 'Doira'];
  if (/romb|diamond/.test(p)) return ['diamond', 'Romb'];
  if (/yulduz|star/.test(p)) return ['star', 'Yulduz'];
  if (/yurak|heart/.test(p)) return ['heart', 'Yurak'];

  return null;
}

/* =========================
   DOSKAGA JAVOB YOZISH
========================= */

function writeOnBoard(text, prompt = '') {
  const content = String(text || '').trim();

  if (!content) return;

  const x = 150;
  const y = writeY;
  const lines = wrapText(content);
  const shapeInfo = findShape(prompt);

  const shapeHeight = shapeInfo ? 180 : 0;
  const cardHeight = Math.max(
    150,
    shapeHeight + lines.length * 34 + 90
  );

  const frame = makeSVG('rect', {
    x: x - 24,
    y: y - 48,
    width: 510,
    height: cardHeight,
    rx: 18,
    fill: '#171a26',
    'fill-opacity': 0.96,
    stroke: '#394257',
    'stroke-width': 2
  });

  svg.appendChild(frame);

  addText(`Javob ${++answerNumber}`, x, y - 12, {
    color: '#93c5fd',
    size: 18,
    font: 'Segoe UI, sans-serif',
    weight: 'bold'
  });

  function writeBody(startY) {
    bubbleWatchAnswer(y);

    drawTyping(content, x, startY, () => {
      if (!activeRequestCount) {
        happy();
      }
    });
  }

  if (shapeInfo) {
    drawShape(shapeInfo[0], x, y + 5, () => {
      addText(shapeInfo[1], x, y + 155, {
        color: '#93c5fd',
        size: 20
      });

      writeBody(y + 190);
    });
  } else {
    writeBody(y + 35);
  }

  writeY += cardHeight + 35;

  if (writeY > WORLD_HEIGHT - 300) {
    writeY = 180;
    camera.x -= 520 * camera.scale;
    applyCamera();
  }
}

/* =========================
   OVOZ TIZIMI
========================= */

function stopSpeech() {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  speaking = false;
  paused = false;

  bubble.classList.remove('speaking');

  if (mouth) mouth.style.transform = '';

  $('bPlay').textContent = '▶ Davom';
}

function browserSpeak(text) {
  if (!('speechSynthesis' in window)) {
    showToast('Bu brauzer ovozli o‘qishni qo‘llamaydi.');
    nextAudio();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);

  utterance.lang = 'uz-UZ';
  utterance.rate = 0.9;
  utterance.pitch = 1;

  utterance.onstart = () => {
    speaking = true;
    paused = false;

    bubble.classList.add('speaking');
    $('bPlay').textContent = '⏸ Pauza';
  };

  utterance.onend = () => {
    speaking = false;
    bubble.classList.remove('speaking');
    nextAudio();
  };

  utterance.onerror = () => {
    speaking = false;
    bubble.classList.remove('speaking');
    nextAudio();
  };

  const voices = speechSynthesis.getVoices();
  const uzVoice = voices.find(v =>
    v.lang.toLowerCase().startsWith('uz')
  );

  if (uzVoice) utterance.voice = uzVoice;

  speechSynthesis.speak(utterance);
}

function playCurrent() {
  if (
    queueIndex < 0 ||
    queueIndex >= audioQueue.length
  ) return;

  const item = audioQueue[queueIndex];

  if (!item) return;

  if (item.audio) {
    audio.src = item.audio;

    audio.play().then(() => {
      speaking = true;
      paused = false;

      bubble.classList.add('speaking');
      $('bPlay').textContent = '⏸ Pauza';
    }).catch(() => {
      showToast('Asosiy audio ishlamadi. Boshqa ovoz sinab ko‘riladi.');
      browserSpeak(item.text);
    });
  } else {
    browserSpeak(item.text);
  }
}

function startQueue(items, startIndex = 0) {
  stopSpeech();

  audioQueue = items.filter(item => item && item.text);
  queueIndex = startIndex;

  if (!audioQueue.length) return;

  playCurrent();
}

function nextAudio() {
  if (queueIndex + 1 < audioQueue.length) {
    queueIndex++;
    playCurrent();
  } else {
    speaking = false;
    paused = false;

    bubble.classList.remove('speaking');
    $('bPlay').textContent = '▶ Davom';
  }
}

function previousAudio() {
  if (queueIndex > 0) {
    stopSpeech();
    queueIndex--;
    playCurrent();
  } else {
    showToast('Bu birinchi javob.');
  }
}

function toggleSpeech() {
  if (audio.src) {
    if (audio.paused && audio.currentTime > 0) {
      audio.play();
      paused = false;
      $('bPlay').textContent = '⏸ Pauza';
    } else if (!audio.paused) {
      audio.pause();
      paused = true;
      $('bPlay').textContent = '▶ Davom';
    }

    return;
  }

  if ('speechSynthesis' in window) {
    if (
      speechSynthesis.speaking &&
      !speechSynthesis.paused
    ) {
      speechSynthesis.pause();
      paused = true;
      $('bPlay').textContent = '▶ Davom';
    } else if (speechSynthesis.paused) {
      speechSynthesis.resume();
      paused = false;
      $('bPlay').textContent = '⏸ Pauza';
    } else if (audioQueue[queueIndex]) {
      playCurrent();
    }
  }
}

audio.addEventListener('ended', () => {
  speaking = false;
  bubble.classList.remove('speaking');
  nextAudio();
});

audio.addEventListener('error', () => {
  const item = audioQueue[queueIndex];

  if (item && item.text) {
    browserSpeak(item.text);
  }
});

$('bPlay').addEventListener('click', toggleSpeech);
$('bPrevious').addEventListener('click', previousAudio);

$('bNext').addEventListener('click', () => {
  stopSpeech();
  nextAudio();
});

$('bReplay').addEventListener('click', () => {
  if (!audioQueue.length) {
    showToast('Hali eshitiladigan javob yo‘q.');
    return;
  }

  stopSpeech();
  playCurrent();
});

/* =========================
   DOSKA KAMERASI
========================= */

function applyCamera() {
  world.style.transform =
    `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
}

function zoomAt(x, y, factor) {
  const oldScale = camera.scale;

  const nextScale = Math.max(
    0.4,
    Math.min(2.5, oldScale * factor)
  );

  if (nextScale === oldScale) return;

  const worldX = (x - camera.x) / oldScale;
  const worldY = (y - camera.y) / oldScale;

  camera.scale = nextScale;

  camera.x = x - worldX * nextScale;
  camera.y = y - worldY * nextScale;

  applyCamera();
}

viewport.addEventListener('pointerdown', event => {
  if (event.target.closest('button, input, article')) return;

  viewport.setPointerCapture(event.pointerId);

  pointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY
  });

  if (pointers.size === 1) {
    lastPan = {
      x: event.clientX,
      y: event.clientY
    };

    viewport.classList.add('drag');
  } else if (pointers.size === 2) {
    const points = [...pointers.values()];

    lastPinchDistance = Math.hypot(
      points[0].x - points[1].x,
      points[0].y - points[1].y
    );

    lastPan = null;
  }
});

viewport.addEventListener('pointermove', event => {
  if (!pointers.has(event.pointerId)) return;

  pointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY
  });

  if (pointers.size === 1 && lastPan) {
    camera.x += event.clientX - lastPan.x;
    camera.y += event.clientY - lastPan.y;

    lastPan = {
      x: event.clientX,
      y: event.clientY
    };

    applyCamera();
  } else if (pointers.size === 2) {
    const points = [...pointers.values()];

    const distance = Math.hypot(
      points[0].x - points[1].x,
      points[0].y - points[1].y
    );

    if (lastPinchDistance) {
      const centerX =
        (points[0].x + points[1].x) / 2;

      const centerY =
        (points[0].y + points[1].y) / 2;

      const rect = viewport.getBoundingClientRect();

      zoomAt(
        centerX - rect.left,
        centerY - rect.top,
        distance / lastPinchDistance
      );
    }

    lastPinchDistance = distance;
  }
});

function endPointer(event) {
  pointers.delete(event.pointerId);

  if (pointers.size < 2) {
    lastPinchDistance = 0;
  }

  if (pointers.size === 1) {
    lastPan = [...pointers.values()][0];
  } else {
    lastPan = null;
    viewport.classList.remove('drag');
  }
}

viewport.addEventListener('pointerup', endPointer);
viewport.addEventListener('pointercancel', endPointer);

viewport.addEventListener('wheel', event => {
  event.preventDefault();

  const rect = viewport.getBoundingClientRect();

  zoomAt(
    event.clientX - rect.left,
    event.clientY - rect.top,
    event.deltaY > 0 ? 0.92 : 1.08
  );
}, { passive: false });

/* =========================
   YANGI DOSKA
========================= */

function resetBoard() {
  saveSession();
  stopSpeech();

  svg.replaceChildren();
  answers.replaceChildren();

  historyItems = [];
  writeY = 180;
  answerNumber = 0;

  audioQueue = [];
  queueIndex = 0;

  menu.hidden = true;

  camera = {
    x: 0,
    y: 0,
    scale: 1
  };

  applyCamera();
  bubbleCenter();
  setEmotion('');

  showToast('Yangi bo‘sh doska ochildi. Eski doska tarixda saqlandi.');
}

$('bNew').addEventListener('click', resetBoard);

/* =========================
   TARIX MENYUSI
========================= */

function renderHistoryMenu() {
  menu.replaceChildren();

  const heading = document.createElement('p');
  heading.textContent = 'Saqlangan doskalar';

  menu.append(heading);

  if (!sessions.length) {
    const empty = document.createElement('p');
    empty.textContent = 'Hozircha saqlangan doska yo‘q.';
    menu.append(empty);
  }

  sessions.forEach(session => {
    const button = document.createElement('button');

    button.type = 'button';

    button.textContent =
      `${session.time} — ${session.items.length} ta javob`;

    button.onclick = () => {
      stopSpeech();

      svg.replaceChildren();
      answers.replaceChildren();

      historyItems = session.items || [];

      writeY = 180;
      answerNumber = 0;

      historyItems.forEach(item => {
        writeOnBoard(item.text, item.prompt);
      });

      audioQueue = historyItems.map(item => ({
        text: item.text,
        audio: item.audio
      }));

      queueIndex = 0;
      menu.hidden = true;

      bubbleCenter();

      showToast('Oldingi doska qayta ochildi.');
    };

    menu.append(button);
  });

  const clear = document.createElement('button');

  clear.type = 'button';
  clear.textContent = 'Tarixni tozalash';

  clear.onclick = () => {
    if (!confirm('Barcha saqlangan doskalar o‘chirilsinmi?')) {
      return;
    }

    sessions = [];
    historyItems = [];

    localStorage.removeItem(SESSIONS_KEY);
    localStorage.removeItem(STORAGE_KEY);

    menu.hidden = true;

    showToast('Tarix tozalandi.');
  };

  menu.append(clear);

  const close = document.createElement('button');

  close.type = 'button';
  close.textContent = 'Yopish';

  close.onclick = () => {
    menu.hidden = true;
  };

  menu.append(close);
}

$('bMenu').addEventListener('click', () => {
  renderHistoryMenu();
  menu.hidden = !menu.hidden;
});

/* =========================
   AI SAVOL-JAVOB
========================= */

async function ask(prompt, image = null) {
  if (!prompt && !image) {
    showToast('Savolingizni yozing yoki rasm tanlang.');
    return;
  }

  activeRequestCount++;

  sendBtn.disabled = true;
  sendBtn.textContent = '…';

  bubbleAboveChat();
  setEmotion('thinking');

  try {
    const response = await fetch('/api/lesson', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        image,
        quick: false
      })
    });

    let result;

    try {
      result = await response.json();
    } catch {
      throw new Error('Serverdan noto‘g‘ri javob keldi.');
    }

    if (!response.ok) {
      throw new Error(result.error || 'Server xatosi');
    }

    const item = {
      prompt,
      text: result.text || 'Javob bo‘sh qaytdi.',
      audio: result.audio || null,
      time: Date.now()
    };

    historyItems.push(item);
    historyItems = historyItems.slice(-30);

    saveHistory();

    const answerStartY = writeY;

    bubbleNearAnswer(answerStartY);

    writeOnBoard(item.text, item.prompt);

    audioQueue.push({
      text: item.text,
      audio: item.audio
    });

    if (!speaking && !paused) {
      if (audioQueue.length === 1) {
        queueIndex = 0;
        playCurrent();
      }
    }

    setEmotion('');
    showToast('Bubble doskaga javob yozmoqda.');
  } catch (error) {
    setEmotion('sad');

    showToast(
      error.message || 'Xatolik yuz berdi.'
    );
  } finally {
    activeRequestCount = Math.max(
      0,
      activeRequestCount - 1
    );

    sendBtn.disabled = false;
    sendBtn.textContent = '➤';

    input.value = '';

    if (!activeRequestCount && !speaking) {
      setEmotion('');
    }
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();

  const prompt = input.value.trim();

  ask(prompt);
});

/* =========================
   RASM YUKLASH
========================= */

$('bPlus').addEventListener('click', () => {
  $('imageInput').click();
});

$('imageInput').addEventListener('change', event => {
  const file = event.target.files?.[0];

  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Rasm faylini tanlang.');
    event.target.value = '';
    return;
  }

  if (file.size > 7 * 1024 * 1024) {
    showToast('Rasm 7 MB dan kichik bo‘lsin.');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();

  reader.onload = async () => {
    try {
      await ask(input.value.trim(), {
        mimeType: file.type,
        data: reader.result
      });
    } finally {
      event.target.value = '';
    }
  };

  reader.onerror = () => {
    showToast('Rasmni o‘qib bo‘lmadi.');
    event.target.value = '';
  };

  reader.readAsDataURL(file);
});

/* =========================
   MIKROFON
========================= */

$('bMic').addEventListener('click', () => {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    showToast('Ovoz kiritish uchun Chrome brauzeridan foydalaning.');
    return;
  }

  if (recognition) {
    recognition.stop();
    recognition = null;
    return;
  }

  recognition = new SpeechRecognition();

  recognition.lang = 'uz-UZ';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = event => {
    input.value = event.results[0][0].transcript;

    bubbleAboveChat();
    setEmotion('surprised');

    setTimeout(() => setEmotion(''), 1200);
  };

  recognition.onerror = () => {
    showToast('Mikrofon ishlamadi. Ruxsatni tekshiring.');
  };

  recognition.onend = () => {
    recognition = null;
  };

  try {
    recognition.start();
    showToast('Gapiring, savolingizni tinglayapman.');
  } catch {
    recognition = null;
    showToast('Mikrofonni qayta ishga tushiring.');
  }
});

/* =========================
   BOSHLANG‘ICH HOLAT
========================= */

loadHistory();
loadSessions();

svg.replaceChildren();
answers.replaceChildren();

writeY = 180;
answerNumber = 0;

camera = {
  x: 0,
  y: 0,
  scale: 1
};

applyCamera();
setEmotion('');

requestAnimationFrame(() => {
  bubbleCenter();
});
