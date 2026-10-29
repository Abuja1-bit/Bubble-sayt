
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
let writeX = 150;
let writeY = 220;

const STORAGE_KEY = 'bubble-ai-history-v1';
const SVG_NS = 'http://www.w3.org/2000/svg';

// ----------------------------------
// XABAR VA EMOTSIYALAR
// ----------------------------------

function showToast(message) {
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('on');

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove('on');
  }, 2600);
}

function setEmotion(emotion = '') {
  if (!bubble) return;

  clearTimeout(emotionTimer);

  bubble.classList.remove(
    'thinking', 'happy', 'surprised', 'sad'
  );

  if (emotion) bubble.classList.add(emotion);
}

function showThinking() {
  setEmotion('thinking');
}

function showHappy() {
  setEmotion('happy');

  emotionTimer = setTimeout(() => {
    setEmotion('');
  }, 2200);
}

function showSad() {
  setEmotion('sad');

  emotionTimer = setTimeout(() => {
    setEmotion('');
  }, 2200);
}

// ----------------------------------
// TARIX
// ----------------------------------

function saveHistory() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(historyItems.slice(-30))
    );
  } catch {
    showToast('Tarixni saqlab bo‘lmadi.');
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

// ----------------------------------
// JAVOB KARTALARI
// ----------------------------------

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

  replay.onclick = () => {
    speakText(item.text, item.audio);
  };

  const pause = document.createElement('button');
  pause.type = 'button';
  pause.className = 'k';
  pause.textContent = '⏯';
  pause.setAttribute('aria-label', 'Pauza yoki davom ettirish');
  pause.onclick = toggleSpeech;

  controls.append(replay, pause);
  header.append(title, controls);

  const question = document.createElement('p');
  question.className = 'answer-text';
  question.textContent = item.prompt
    ? `Savol: ${item.prompt}`
    : '';

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

  historyItems.forEach((item, index) => {
    answers.append(createCard(item, index));
  });
}

// ----------------------------------
// DOSKADA CHIZISHNI TO‘XTATISH
// ----------------------------------

function stopWriting() {
  writingRun++;

  if (writingTimer) {
    clearTimeout(writingTimer);
    writingTimer = null;
  }

  const dot = document.getElementById('writing-dot');
  if (dot) dot.remove();
}

// ----------------------------------
// DOSKAGA MATN YOZISH
// ----------------------------------

function writeTextOnBoard(text, startX, startY, run, onDone) {
  if (run !== writingRun) return;

  const content = String(text || '').trim();

  if (!content) {
    if (onDone) onDone();
    return;
  }

  const maxChars = 34;
  const lines = [];
  let line = '';

  for (const originalLine of content.split('\n')) {
    for (const word of originalLine.split(/\s+/)) {
      if (!word) continue;

      if (word.length > maxChars) {
        if (line) {
          lines.push(line);
          line = '';
        }

        for (let i = 0; i < word.length; i += maxChars) {
          lines.push(word.slice(i, i + maxChars));
        }

        continue;
      }

      const candidate = line ? `${line} ${word}` : word;

      if (candidate.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }

    if (line) {
      lines.push(line);
      line = '';
    }
  }

  if (!lines.length) {
    if (onDone) onDone();
    return;
  }

  const lineHeight = 42;
  const nodes = lines.map((value, index) => {
    const node = document.createElementNS(SVG_NS, 'text');

    node.setAttribute('x', startX);
    node.setAttribute('y', startY + index * lineHeight);
    node.setAttribute('font-size', '27');
    node.setAttribute('font-family', 'Segoe UI, sans-serif');
    node.setAttribute('fill', '#f1f5f9');
    node.setAttribute('xml:space', 'preserve');

    svg.appendChild(node);

    return { node, value };
  });

  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.id = 'writing-dot';
  dot.setAttribute('r', '4');
  dot.setAttribute('fill', '#050505');
  dot.setAttribute('stroke', '#ffffff');
  dot.setAttribute('stroke-width', '0.8');

  svg.appendChild(dot);

  let row = 0;
  let charIndex = 0;

  function step() {
    if (run !== writingRun) return;

    while (
      row < nodes.length &&
      charIndex >= nodes[row].value.length
    ) {
      row++;
      charIndex = 0;
    }

    if (row >= nodes.length) {
      dot.remove();
      writingTimer = null;

      if (onDone) onDone();
      return;
    }

    const item = nodes[row];
    const char = item.value[charIndex];

    charIndex++;
    item.node.textContent = item.value.slice(0, charIndex);

    // Nuqta haqiqiy SVG matn kengligiga qarab harakatlanadi.
    const width = item.node.getComputedTextLength();

    dot.setAttribute('cx', startX + width + 3);
    dot.setAttribute('cy', startY + row * lineHeight - 8);

    writingTimer = setTimeout(step, char === ' ' ? 35 : 65);
  }

  step();
}

// ----------------------------------
// SHAKL CHIZISH
// ----------------------------------

function drawShape(shape, startX, startY, run, onDone) {
  if (run !== writingRun) return;

  let path;

  if (shape === 'circle') {
    path = document.createElementNS(SVG_NS, 'circle');
    path.setAttribute('cx', startX + 75);
    path.setAttribute('cy', startY + 75);
    path.setAttribute('r', '70');
  } else {
    path = document.createElementNS(SVG_NS, 'path');

    const paths = {
      square:
        `M ${startX} ${startY} h 140 v 140 h -140 Z`,

      rectangle:
        `M ${startX} ${startY} h 190 v 110 h -190 Z`,

      triangle:
        `M ${startX} ${startY + 130} ` +
        `L ${startX + 75} ${startY} ` +
        `L ${startX + 150} ${startY + 130} Z`
    };

    path.setAttribute('d', paths[shape]);
  }

  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#f1f5f9');
  path.setAttribute('stroke-width', '4');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');

  svg.appendChild(path);

  // Chiziq boshida ko‘rinmaydi, nuqta yurgan sari ochiladi.
  const total = path.getTotalLength();

  path.style.strokeDasharray = `${total}`;
  path.style.strokeDashoffset = `${total}`;

  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.id = 'writing-dot';
  dot.setAttribute('r', '4');
  dot.setAttribute('fill', '#050505');
  dot.setAttribute('stroke', '#ffffff');
  dot.setAttribute('stroke-width', '0.8');

  svg.appendChild(dot);

  let distance = 0;
  const speed = 3;

  function step() {
    if (run !== writingRun) return;

    distance = Math.min(total, distance + speed);

    path.style.strokeDashoffset = `${total - distance}`;

    const point = path.getPointAtLength(distance);

    dot.setAttribute('cx', point.x);
    dot.setAttribute('cy', point.y);

    if (distance < total) {
      writingTimer = setTimeout(step, 16);
      return;
    }

    dot.remove();
    writingTimer = null;

    if (onDone) onDone();
  }

  step();
}

// ----------------------------------
// JAVOBNI DOSKAGA YOZISH VA CHIZISH
// ----------------------------------

function writeOnBoard(text, prompt = '') {
  stopWriting();

  const run = writingRun;

  answers.replaceChildren();

  const content = String(text || '').trim();

  if (!content) {
    showToast('Doskaga yoziladigan javob yo‘q.');
    return;
  }

  // Bubble yozish jarayonida doska bo‘ylab ko‘chmaydi.
  bubble.style.left = '30px';
  bubble.style.top = '30px';

  const request = String(prompt || '').toLowerCase();

  // Faqat chizish so‘rovi bo‘lsa shakl chiziladi.
  const asksToDraw =
    /\b(chiz|chizing|chizib ber|draw|tasvirla)\b/i.test(request);

  let shape = null;

  if (asksToDraw) {
    if (/kvadrat|square/.test(request)) {
      shape = 'square';
    } else if (/uchburchak|triangle/.test(request)) {
      shape = 'triangle';
    } else if (/to‘g‘ri to‘rtburchak|to'g'ri to'rtburchak|rectangle/.test(request)) {
      shape = 'rectangle';
    } else if (/doira|aylana|circle/.test(request)) {
      shape = 'circle';
    }
  }

  const startX = writeX;
  const startY = writeY;

  function finish() {
    if (run !== writingRun) return;

    writeY += 250;

    if (writeY > 3200) {
      writeX += 650;
      writeY = 220;
    }

    showHappy();
  }

  function writeAnswer(y) {
    writeTextOnBoard(content, startX, y, run, finish);
  }

  if (!shape) {
    writeAnswer(startY);
    return;
  }

  drawShape(shape, startX, startY, run, () => {
    if (run !== writingRun) return;

    const names = {
      square: 'Kvadrat',
      rectangle: 'To‘g‘ri to‘rtburchak',
      triangle: 'Uchburchak',
      circle: 'Doira'
    };

    const label = document.createElementNS(SVG_NS, 'text');

    label.setAttribute('x', startX);
    label.setAttribute('y', startY + 190);
    label.setAttribute('font-size', '27');
    label.setAttribute('font-family', 'Segoe UI, sans-serif');
    label.setAttribute('fill', '#f1f5f9');
    label.textContent = names[shape];

    svg.appendChild(label);

    // Shakl va uning nomidan keyin javob yoziladi.
    writeAnswer(startY + 240);
  });
}

// ----------------------------------
// OVOZNI TO‘XTATISH
// ----------------------------------

function stopSpeech() {
  speechRequestId++;

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  audio.pause();

  try {
    audio.currentTime = 0;
  } catch {}

  speaking = false;
  isPaused = false;

  const playButton = $('bPlay');

  if (playButton) {
    playButton.textContent = '▶ Davom';
  }

  bubble.classList.remove('speaking');

  if (mouth) mouth.style.transform = '';
}

// ----------------------------------
// JAVOBNI OVOZDA O‘QISH
// ----------------------------------

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

    audio.play()
      .then(() => {
        speaking = true;
        isPaused = false;

        setEmotion('');
        bubble.classList.add('speaking');

        const playButton = $('bPlay');

        if (playButton) {
          playButton.textContent = '⏸ Pauza';
        }
      })
      .catch(() => {
        browserSpeak(text);
      });
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

      const playButton = $('bPlay');

      if (playButton) {
        playButton.textContent = '⏸ Pauza';
      }
    };

    utterance.onend = () => {
      if (requestId !== speechRequestId) return;

      speaking = false;
      isPaused = false;

      bubble.classList.remove('speaking');
      setEmotion('');

      const playButton = $('bPlay');

      if (playButton) {
        playButton.textContent = '▶ Davom';
      }
    };

    utterance.onerror = (event) => {
      if (requestId !== speechRequestId) return;

      if (
        event.error === 'canceled' ||
        event.error === 'interrupted'
      ) {
        return;
      }

      speaking = false;
      isPaused = false;

      bubble.classList.remove('speaking');
      setEmotion('');

      console.error('Ovoz xatosi:', event.error);

      showToast(
        'Ovoz ishlamadi. Telefonning TTS sozlamasini tekshiring.'
      );
    };

    synth.speak(utterance);
  }

  if (synth.getVoices().length > 0) {
    startSpeaking();
  } else {
    synth.addEventListener(
      'voiceschanged',
      startSpeaking,
      { once: true }
    );

    setTimeout(() => {
      if (requestId === speechRequestId) {
        startSpeaking();
      }
    }, 1000);
  }
}

// ----------------------------------
// OVOZ PAUZASI VA DAVOMI
// ----------------------------------

function toggleSpeech() {
  if (audio.src && !audio.paused) {
    audio.pause();
    isPaused = true;

    const playButton = $('bPlay');
    if (playButton) playButton.textContent = '▶ Davom';

    return;
  }

  if (audio.src && audio.paused && audio.currentTime > 0) {
    audio.play()
      .then(() => {
        isPaused = false;

        const playButton = $('bPlay');
        if (playButton) playButton.textContent = '⏸ Pauza';
      })
      .catch(() => {
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

    const playButton = $('bPlay');
    if (playButton) playButton.textContent = '▶ Davom';
  } else if (synth.paused) {
    synth.resume();
    isPaused = false;

    const playButton = $('bPlay');
    if (playButton) playButton.textContent = '⏸ Pauza';
  } else if (currentAnswer) {
    speakText(currentAnswer, currentAudioUrl);
  }
}

audio.addEventListener('ended', () => {
  speaking = false;
  isPaused = false;

  bubble.classList.remove('speaking');
  setEmotion('');

  const playButton = $('bPlay');
  if (playButton) playButton.textContent = '▶ Davom';
});

audio.addEventListener('error', () => {
  if (currentAnswer && currentAudioUrl) {
    currentAudioUrl = null;
    browserSpeak(currentAnswer);
  }
});

// ----------------------------------
// DOSKANI SURISH VA KATTALASHTIRISH
// ----------------------------------

function applyCamera() {
  world.style.transform =
    `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
}

let pointer = null;
let lastPoint = null;

viewport.addEventListener('pointerdown', (event) => {
  if (event.target.closest('button, input, article')) return;

  pointer = event.pointerId;

  lastPoint = {
    x: event.clientX,
    y: event.clientY
  };

  viewport.setPointerCapture(pointer);
  viewport.classList.add('drag');
});

viewport.addEventListener('pointermove', (event) => {
  if (pointer !== event.pointerId || !lastPoint) return;

  camera.x += event.clientX - lastPoint.x;
  camera.y += event.clientY - lastPoint.y;

  lastPoint = {
    x: event.clientX,
    y: event.clientY
  };

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

  const next = camera.scale *
    (event.deltaY > 0 ? 0.92 : 1.08);

  camera.scale = Math.max(0.55, Math.min(1.6, next));

  applyCamera();
}, { passive: false });

// ----------------------------------
// YANGI DOSKA
// ----------------------------------

function resetBoard() {
  stopSpeech();
  stopWriting();
  setEmotion('');

  historyItems = [];

  saveHistory();
  renderHistory();

  svg.replaceChildren();

  writeX = 150;
  writeY = 220;

  bubble.style.left = '30px';
  bubble.style.top = '30px';

  menu.hidden = true;

  camera = { x: 0, y: 0, scale: 1 };
  applyCamera();

  showToast('Yangi doska ochildi.');
}

$('bNew').addEventListener('click', resetBoard);

$('bReplay').addEventListener('click', () => {
  if (currentAnswer) {
    speakText(currentAnswer, currentAudioUrl);
  } else {
    showToast('Hali qayta eshitiladigan javob yo‘q.');
  }
});

$('bPlay').addEventListener('click', toggleSpeech);

// ----------------------------------
// RASM TANLASH
// ----------------------------------

$('bPlus').addEventListener('click', () => {
  $('imageInput').click();
});

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

// ----------------------------------
// MIKROFON
// ----------------------------------

$('bMic').addEventListener('click', () => {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

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

    emotionTimer = setTimeout(() => {
      setEmotion('');
    }, 1200);
  };

  recognition.onerror = () => {
    showToast('Mikrofon ishlamadi. Ruxsatlarni tekshiring.');
  };

  recognition.onend = () => {
    recognition = null;
  };

  try {
    recognition.start();
    showToast('Gapiring, savolingizni tinglayapman.');
  } catch {
    recognition = null;
    showToast('Mikrofonni qayta ishga tushirib ko‘ring.');
  }
});

// ----------------------------------
// TARIX MENYUSI
// ----------------------------------

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
      button.textContent =
        (item.prompt || 'Rasm tahlili').slice(0, 70);

      button.onclick = () => {
        stopWriting();
        stopSpeech();
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

  close.onclick = () => {
    menu.hidden = true;
  };

  menu.append(close);
  menu.hidden = !menu.hidden;
});

// ----------------------------------
// AI SAVOL-JAVOB
// ----------------------------------

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

    currentAnswer = item.text;
    currentAudioUrl = item.audio;

    // So‘rovni ham beramiz: chizish kerakligini shu orqali aniqlaydi.
    writeOnBoard(item.text, item.prompt);

    // Ovoz yozish bilan bir paytda boshlanadi.
    speakText(item.text, item.audio);

    showToast('Bubble doskaga yozmoqda.');
  } catch (error) {
    showSad();
    showToast(error.message || 'Xatolik yuz berdi.');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = '➤';
    input.value = '';
    input.focus();
  }
}

// ----------------------------------
// SAVOL YUBORISH
// ----------------------------------

form.addEventListener('submit', (event) => {
  event.preventDefault();
  ask(input.value.trim());
});

// ----------------------------------
// DASTLABKI HOLAT
// ----------------------------------

loadHistory();
renderHistory();

if (historyItems.length) {
  const last = historyItems[historyItems.length - 1];

  currentAnswer = last.text || '';
  currentAudioUrl = last.audio || null;
} else {
  currentAnswer =
    'Salom! Men Bubble AI. Savolingizni yozing yoki rasm yuboring.';
}

bubble.style.left = '30px';
bubble.style.top = '30px';

answers.style.pointerEvents = 'auto';

applyCamera();
