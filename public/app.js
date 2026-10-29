
const $ = (id) => document.getElementById(id);

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

let historyItems = [];
let currentAnswer = '';
let currentAudioUrl = null;
let speaking = false;
let recognition = null;
let isPaused = false;

let camera = { x: 0, y: 0, scale: 1 };
let speechRequestId = 0;
let emotionTimer = null;
let writingTimer = null;
let writingRun = 0;
let writeY = 180;
let answerNumber = 0;

const STORAGE_KEY = 'bubble-ai-history-v1';
const SVG_NS = 'http://www.w3.org/2000/svg';
const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 3600;

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('on');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('on'), 2600);
}

function setEmotion(emotion = '') {
  if (!bubble) return;
  clearTimeout(emotionTimer);
  bubble.classList.remove('thinking', 'happy', 'surprised', 'sad');
  if (emotion) bubble.classList.add(emotion);
}

function showThinking() {
  setEmotion('thinking');
}

function showHappy() {
  setEmotion('happy');
  emotionTimer = setTimeout(() => setEmotion(''), 2200);
}

function showSad() {
  setEmotion('sad');
  emotionTimer = setTimeout(() => setEmotion(''), 2200);
}

// TARIX SAQLANADI, LEKIN DOSKADA AVTOMATIK CHIQMAYDI
function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historyItems.slice(-30)));
  } catch {
    showToast('Tarixni saqlab bo‘lmadi.');
  }
}

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    historyItems = Array.isArray(saved) ? saved : [];
  } catch {
    historyItems = [];
  }
}

function createCard(item, index) {
  const card = document.createElement('article');
  card.className = 'answer-card';

  const header = document.createElement('div');
  header.className = 'answer-title';

  const title = document.createElement('span');
  title.textContent = `Javob ${index + 1}`;

  const controls = document.createElement('div');
  controls.className = 'row';

  const replay = document.createElement('button');
  replay.type = 'button';
  replay.className = 'k';
  replay.textContent = '↻';
  replay.setAttribute('aria-label', 'Qayta eshitish');
  replay.onclick = () => speakText(item.text, item.audio);

  const pause = document.createElement('button');
  pause.type = 'button';
  pause.className = 'k';
  pause.textContent = '⏯';
  pause.onclick = toggleSpeech;

  controls.append(replay, pause);
  header.append(title, controls);

  const question = document.createElement('p');
  question.className = 'answer-text';
  question.textContent = item.prompt ? `Savol: ${item.prompt}` : '';

  const body = document.createElement('div');
  body.className = 'answer-text';
  body.textContent = item.text || '';

  card.append(header);
  if (item.prompt) card.append(question);
  card.append(body);
  return card;
}

function renderHistory() {
  answers.replaceChildren();
  historyItems.forEach((item, index) => answers.append(createCard(item, index)));
}

function stopWriting() {
  writingRun++;
  if (writingTimer) clearTimeout(writingTimer);
  writingTimer = null;
  const dot = document.getElementById('writing-dot');
  if (dot) dot.remove();
}

function makeSVG(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function addPenDot() {
  const dot = makeSVG('circle', {
    id: 'writing-dot',
    r: 4,
    fill: '#050505',
    stroke: '#ffffff',
    'stroke-width': 0.8
  });
  svg.appendChild(dot);
  return dot;
}

// MATNNI HARFMA-HARF YOZISH
function writeTextOnBoard(text, x, y, run, done) {
  if (run !== writingRun) return;

  const content = String(text || '').trim();
  if (!content) {
    if (done) done();
    return;
  }

  const maxChars = 28;
  const lines = [];
  for (const paragraph of content.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }

  const lineHeight = 35;
  const fontSize = 23;
  const nodes = lines.map((line, i) => {
    const node = makeSVG('text', {
      x,
      y: y + i * lineHeight,
      'font-size': fontSize,
      'font-family': 'Comic Sans MS, Segoe Print, cursive',
      fill: '#f1f5f9',
      'xml:space': 'preserve'
    });
    svg.appendChild(node);
    return { node, line };
  });

  const dot = addPenDot();
  let row = 0;
  let col = 0;

  function step() {
    if (run !== writingRun) return;

    while (row < nodes.length && col >= nodes[row].line.length) {
      row++;
      col = 0;
    }

    if (row >= nodes.length) {
      dot.remove();
      writingTimer = null;
      if (done) done();
      return;
    }

    const item = nodes[row];
    col++;
    item.node.textContent = item.line.slice(0, col);

    let width = 0;
    try {
      width = item.node.getComputedTextLength();
    } catch {}

    dot.setAttribute('cx', x + width + 2);
    dot.setAttribute('cy', y + row * lineHeight - 7);

    writingTimer = setTimeout(step, item.line[col - 1] === ' ' ? 22 : 48);
  }

  step();
}

// CHIZILADIGAN SHAKLLAR
function drawPath(pathData, x, y, run, done) {
  if (run !== writingRun) return;

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

  path.style.strokeDasharray = `${total}`;
  path.style.strokeDashoffset = `${total}`;

  const dot = addPenDot();
  let distance = 0;

  function step() {
    if (run !== writingRun) return;

    distance = Math.min(total, distance + 3);
    path.style.strokeDashoffset = `${total - distance}`;

    const point = path.getPointAtLength(distance);
    dot.setAttribute('cx', point.x);
    dot.setAttribute('cy', point.y);

    if (distance < total) {
      writingTimer = setTimeout(step, 16);
    } else {
      dot.remove();
      writingTimer = null;
      if (done) done();
    }
  }

  step();
}

function drawShape(shape, x, y, run, done) {
  const paths = {
    square: `M ${x} ${y} h 120 v 120 h -120 Z`,
    rectangle: `M ${x} ${y} h 160 v 95 h -160 Z`,
    triangle: `M ${x} ${y + 120} L ${x + 65} ${y} L ${x + 130} ${y + 120} Z`,
    diamond: `M ${x + 65} ${y} L ${x + 130} ${y + 65} L ${x + 65} ${y + 130} L ${x} ${y + 65} Z`,
    star: `M ${x + 65} ${y} L ${x + 82} ${y + 45} L ${x + 130} ${y + 48} L ${x + 94} ${y + 79} L ${x + 105} ${y + 126} L ${x + 65} ${y + 100} L ${x + 25} ${y + 126} L ${x + 36} ${y + 79} L ${x} ${y + 48} L ${x + 48} ${y + 45} Z`,
    pentagon: `M ${x + 65} ${y} L ${x + 125} ${y + 45} L ${x + 102} ${y + 120} L ${x + 28} ${y + 120} L ${x + 5} ${y + 45} Z`,
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

    const total = circle.getTotalLength();
    circle.style.strokeDasharray = `${total}`;
    circle.style.strokeDashoffset = `${total}`;
    const dot = addPenDot();
    let distance = 0;

    function step() {
      if (run !== writingRun) return;
      distance = Math.min(total, distance + 3);
      circle.style.strokeDashoffset = `${total - distance}`;
      const point = circle.getPointAtLength(distance);
      dot.setAttribute('cx', point.x);
      dot.setAttribute('cy', point.y);

      if (distance < total) {
        writingTimer = setTimeout(step, 16);
      } else {
        dot.remove();
        writingTimer = null;
        if (done) done();
      }
    }
    step();
    return;
  }

  if (paths[shape]) {
    drawPath(paths[shape], x, y, run, done);
  } else if (done) {
    done();
  }
}

function findShape(prompt) {
  const p = String(prompt || '').toLowerCase();
  if (!/(chiz|chizing|chizib|draw|tasvirla)/i.test(p)) return null;

  if (/kvadrat|square/.test(p)) return ['square', 'Kvadrat'];
  if (/to‘g‘ri to‘rtburchak|to'g'ri to'rtburchak|rectangle/.test(p)) return ['rectangle', 'To‘g‘ri to‘rtburchak'];
  if (/uchburchak|triangle/.test(p)) return ['triangle', 'Uchburchak'];
  if (/doira|aylana|circle/.test(p)) return ['circle', 'Doira'];
  if (/romb|diamond/.test(p)) return ['diamond', 'Romb'];
  if (/yulduz|star/.test(p)) return ['star', 'Yulduz'];
  if (/beshburchak|pentagon/.test(p)) return ['pentagon', 'Beshburchak'];
  if (/yurak|heart/.test(p)) return ['heart', 'Yurak'];
  return null;
}

function writeOnBoard(text, prompt = '') {
  stopWriting();
  const run = writingRun;
  const content = String(text || '').trim();

  if (!content) {
    showToast('Doskaga yoziladigan javob yo‘q.');
    return;
  }

  const shapeInfo = findShape(prompt);
  const x = 150;
  const y = writeY;
  const padding = 22;
  const estimatedLines = Math.max(1, Math.ceil(content.length / 28));
  const textHeight = estimatedLines * 35;
  const shapeHeight = shapeInfo ? 190 : 0;
  const cardHeight = Math.max(150, shapeHeight + textHeight + 100);

  // Har bir javob alohida ramka bilan belgilanadi.
  const frame = makeSVG('rect', {
    x: x - padding,
    y: y - 45,
    width: 470,
    height: cardHeight,
    rx: 18,
    fill: '#171a26',
    'fill-opacity': 0.94,
    stroke: '#394257',
    'stroke-width': 2
  });
  svg.appendChild(frame);

  const heading = makeSVG('text', {
    x,
    y: y - 12,
    'font-size': 18,
    'font-family': 'Segoe UI, sans-serif',
    'font-weight': 700,
    fill: '#93c5fd'
  });
  heading.textContent = `Javob ${++answerNumber}`;
  svg.appendChild(heading);

  function writeContent(startY) {
    writeTextOnBoard(content, x, startY, run, () => {
      if (run !== writingRun) return;
      writeY += cardHeight + 35;

      if (writeY > WORLD_HEIGHT - 300) {
        writeY = 180;
        camera.x -= 480 * camera.scale;
        applyCamera();
      }
      showHappy();
    });
  }

  if (shapeInfo) {
    const [shape, name] = shapeInfo;
    drawShape(shape, x, y + 5, run, () => {
      if (run !== writingRun) return;

      const label = makeSVG('text', {
        x,
        y: y + 155,
        'font-size': 21,
        'font-family': 'Comic Sans MS, Segoe Print, cursive',
        fill: '#93c5fd'
      });
      label.textContent = name;
      svg.appendChild(label);

      writeContent(y + 190);
    });
  } else {
    writeContent(y + 35);
  }
}

// OVOZ
function stopSpeech() {
  speechRequestId++;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();

  audio.pause();
  try { audio.currentTime = 0; } catch {}

  speaking = false;
  isPaused = false;

  const playButton = $('bPlay');
  if (playButton) playButton.textContent = '▶ Davom';

  bubble.classList.remove('speaking');
  if (mouth) mouth.style.transform = '';
}

function speakText(text, audioData = null) {
  if (!text) {
    showToast('O‘qiladigan javob yo‘q.');
    return;
  }

  stopSpeech();
  currentAnswer = text;
  currentAudioUrl = audioData;

  if (audioData) {
    audio.src = audioData;
    audio.play().then(() => {
      speaking = true;
      isPaused = false;
      setEmotion('');
      bubble.classList.add('speaking');
      const button = $('bPlay');
      if (button) button.textContent = '⏸ Pauza';
    }).catch(() => browserSpeak(text));
  } else {
    browserSpeak(text);
  }
}

function browserSpeak(text) {
  if (!('speechSynthesis' in window)) {
    showToast('Brauzer ovozli o‘qishni qo‘llamaydi.');
    setEmotion('');
    return;
  }

  const synth = window.speechSynthesis;
  const requestId = speechRequestId;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.9;
  utterance.pitch = 1;
  utterance.volume = 1;

  let started = false;

  function startSpeaking() {
    if (started || requestId !== speechRequestId) return;
    started = true;

    const voices = synth.getVoices();
    const voice =
      voices.find(v => v.lang.toLowerCase() === 'uz-uz') ||
      voices.find(v => v.lang.toLowerCase().startsWith('uz')) ||
      voices.find(v => v.lang.toLowerCase().startsWith('ru')) ||
      voices.find(v => v.lang.toLowerCase().startsWith('en'));

    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'uz-UZ';
    }

    utterance.onstart = () => {
      if (requestId !== speechRequestId) return;
      speaking = true;
      isPaused = false;
      setEmotion('');
      bubble.classList.add('speaking');
      const button = $('bPlay');
      if (button) button.textContent = '⏸ Pauza';
    };

    utterance.onend = () => {
      if (requestId !== speechRequestId) return;
      speaking = false;
      isPaused = false;
      bubble.classList.remove('speaking');
      setEmotion('');
      const button = $('bPlay');
      if (button) button.textContent = '▶ Davom';
    };

    utterance.onerror = (event) => {
      if (requestId !== speechRequestId) return;
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      speaking = false;
      bubble.classList.remove('speaking');
      setEmotion('');
      showToast('Ovoz ishlamadi. Telefonning TTS sozlamasini tekshiring.');
    };

    synth.speak(utterance);
  }

  if (synth.getVoices().length) {
    startSpeaking();
  } else {
    synth.addEventListener('voiceschanged', startSpeaking, { once: true });
    setTimeout(startSpeaking, 1000);
  }
}

function toggleSpeech() {
  if (audio.src && !audio.paused) {
    audio.pause();
    isPaused = true;
    if ($('bPlay')) $('bPlay').textContent = '▶ Davom';
    return;
  }

  if (audio.src && audio.paused && audio.currentTime > 0) {
    audio.play().then(() => {
      isPaused = false;
      if ($('bPlay')) $('bPlay').textContent = '⏸ Pauza';
    }).catch(() => {
      currentAudioUrl = null;
      browserSpeak(currentAnswer);
    });
    return;
  }

  if (!('speechSynthesis' in window)) {
    showToast('Brauzer ovozli o‘qishni qo‘llamaydi.');
    return;
  }

  const synth = window.speechSynthesis;
  if (synth.speaking && !synth.paused) {
    synth.pause();
    isPaused = true;
    if ($('bPlay')) $('bPlay').textContent = '▶ Davom';
  } else if (synth.paused) {
    synth.resume();
    isPaused = false;
    if ($('bPlay')) $('bPlay').textContent = '⏸ Pauza';
  } else if (currentAnswer) {
    speakText(currentAnswer, currentAudioUrl);
  }
}

audio.addEventListener('ended', () => {
  speaking = false;
  isPaused = false;
  bubble.classList.remove('speaking');
  setEmotion('');
  if ($('bPlay')) $('bPlay').textContent = '▶ Davom';
});

audio.addEventListener('error', () => {
  if (currentAnswer && currentAudioUrl) {
    currentAudioUrl = null;
    browserSpeak(currentAnswer);
  }
});

// DOSKANI SURISH VA MASSHTAB
function applyCamera() {
  world.style.transform =
    `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
}

function zoomBy(factor) {
  const oldScale = camera.scale;
  const nextScale = Math.max(0.4, Math.min(2, oldScale * factor));
  if (nextScale === oldScale) return;

  const rect = viewport.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  const worldX = (centerX - camera.x) / oldScale;
  const worldY = (centerY - camera.y) / oldScale;

  camera.scale = nextScale;
  camera.x = centerX - worldX * nextScale;
  camera.y = centerY - worldY * nextScale;
  applyCamera();
}

$('bZoomIn').addEventListener('click', () => zoomBy(1.2));
$('bZoomOut').addEventListener('click', () => zoomBy(1 / 1.2));
$('bZoomReset').addEventListener('click', () => {
  camera = { x: 0, y: 0, scale: 1 };
  applyCamera();
});

let pointer = null;
let lastPoint = null;

viewport.addEventListener('pointerdown', (event) => {
  if (event.target.closest('button, input, article')) return;
  pointer = event.pointerId;
  lastPoint = { x: event.clientX, y: event.clientY };
  viewport.setPointerCapture(pointer);
  viewport.classList.add('drag');
});

viewport.addEventListener('pointermove', (event) => {
  if (pointer !== event.pointerId || !lastPoint) return;

  camera.x += event.clientX - lastPoint.x;
  camera.y += event.clientY - lastPoint.y;
  lastPoint = { x: event.clientX, y: event.clientY };
  applyCamera();
});

function endDrag(event) {
  if (pointer !== event.pointerId) return;
  pointer = null;
  lastPoint = null;
  viewport.classList.remove('drag');
}

viewport.addEventListener('pointerup', endDrag);
viewport.addEventListener('pointercancel', endDrag);

viewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomBy(event.deltaY > 0 ? 0.92 : 1.08);
}, { passive: false });

// YANGI DOSKA — TARIXNI O‘CHIRMAYDI
function resetBoard() {
  stopSpeech();
  stopWriting();
  setEmotion('');
  svg.replaceChildren();
  answers.replaceChildren();
  writeY = 180;
  answerNumber = 0;
  menu.hidden = true;
  camera = { x: 0, y: 0, scale: 1 };
  applyCamera();
  showToast('Yangi bo‘sh doska ochildi. Tarix saqlanib qoldi.');
}

$('bNew').addEventListener('click', resetBoard);

$('bReplay').addEventListener('click', () => {
  if (currentAnswer) speakText(currentAnswer, currentAudioUrl);
  else showToast('Hali qayta eshitiladigan javob yo‘q.');
});

$('bPlay').addEventListener('click', toggleSpeech);

// RASM
$('bPlus').addEventListener('click', () => $('imageInput').click());

$('imageInput').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Iltimos, rasm faylini tanlang.');
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

// MIKROFON
$('bMic').addEventListener('click', () => {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    showToast('Ovoz kiritish uchun Chrome’da sinang.');
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

  recognition.onresult = (event) => {
    input.value = event.results[0][0].transcript;
    setEmotion('surprised');
    emotionTimer = setTimeout(() => setEmotion(''), 1200);
  };

  recognition.onerror = () => {
    showToast('Mikrofon ishlamadi. Ruxsatlarni tekshiring.');
  };

  recognition.onend = () => { recognition = null; };

  try {
    recognition.start();
    showToast('Gapiring, savolingizni tinglayapman.');
  } catch {
    recognition = null;
    showToast('Mikrofonni qayta ishga tushirib ko‘ring.');
  }
});

// TARIX MENYUSI
$('bMenu').addEventListener('click', () => {
  menu.replaceChildren();

  const heading = document.createElement('p');
  heading.textContent = 'Tarix — oldingi javoblar';
  menu.append(heading);

  if (!historyItems.length) {
    const empty = document.createElement('p');
    empty.textContent = 'Hozircha tarix bo‘sh.';
    menu.append(empty);
  } else {
    [...historyItems].reverse().forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = (item.prompt || 'Rasm tahlili').slice(0, 70);

      button.onclick = () => {
        stopSpeech();
        stopWriting();
        setEmotion('');
        currentAnswer = item.text || '';
        currentAudioUrl = item.audio || null;
        writeOnBoard(currentAnswer, item.prompt || '');
        menu.hidden = true;
      };

      menu.append(button);
    });
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Yopish';
  close.onclick = () => { menu.hidden = true; };
  menu.append(close);
  menu.hidden = !menu.hidden;
});

// AI SAVOL-JAVOB
async function ask(prompt, image = null) {
  if (!prompt && !image) {
    showToast('Savolingizni yozing yoki rasm tanlang.');
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = '…';
  stopSpeech();
  stopWriting();
  showThinking();

  try {
    const response = await fetch('/api/lesson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image, quick: false })
    });

    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error('Serverdan noto‘g‘ri javob keldi.');
    }

    if (!response.ok) throw new Error(result.error || 'Server xatosi');

    const item = {
      prompt,
      text: result.text || 'Javob bo‘sh qaytdi.',
      audio: result.audio || null,
      time: Date.now()
    };

    historyItems.push(item);
    historyItems = historyItems.slice(-30);
    saveHistory();

    currentAnswer = item.text;
    currentAudioUrl = item.audio;

    writeOnBoard(item.text, item.prompt);
    speakText(item.text, item.audio);
    showToast('Bubble doskaga yozmoqda.');
  } catch (error) {
    showSad();
    showToast(error.message || 'Xatolik yuz berdi.');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = '➤';
    input.value = '';
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  ask(input.value.trim());
});

// HAR SAFAR YANGI BO‘SH DOSKA
loadHistory();
svg.replaceChildren();
answers.replaceChildren();
writeY = 180;
answerNumber = 0;
currentAnswer = '';
currentAudioUrl = null;

bubble.classList.remove('speaking', 'thinking', 'happy', 'surprised', 'sad');
applyCamera();
