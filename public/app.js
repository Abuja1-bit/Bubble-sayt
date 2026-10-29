
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

const STORAGE_KEY = 'bubble-ai-history-v1';
const NS = 'http://www.w3.org/2000/svg';

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('on');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('on'), 2600);
}

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
    if (Array.isArray(saved)) historyItems = saved;
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
  replay.setAttribute('aria-label', 'Javobni qayta eshitish');
  replay.onclick = () => speakText(item.text, item.audio);

  const pause = document.createElement('button');
  pause.type = 'button';
  pause.className = 'k';
  pause.textContent = '⏸';
  pause.setAttribute('aria-label', 'Ovozni pauza qilish yoki davom ettirish');
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
  historyItems.forEach((item, index) => {
    answers.append(createCard(item, index));
  });
}

function stopSpeech() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  audio.pause();
  audio.currentTime = 0;
  speaking = false;
  isPaused = false;
  $('bPlay').textContent = '⏸ Pauza';
  bubble.classList.remove('speaking');
  mouth.style.transform = '';
}

function speakText(text, audioData = null) {
  stopSpeech();
  currentAnswer = text;
  currentAudioUrl = audioData;

  if (audioData) {
    audio.src = audioData;
    audio.play().then(() => {
      speaking = true;
      isPaused = false;
      $('bPlay').textContent = '⏸ Pauza';
      bubble.classList.add('speaking');
    }).catch(() => browserSpeak(text));
  } else {
    browserSpeak(text);
  }
}

function browserSpeak(text) {
  if (!('speechSynthesis' in window)) {
    showToast('Bu brauzer ovozli o‘qishni qo‘llamaydi.');
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'uz-UZ';
  utterance.rate = 0.92;

  utterance.onstart = () => {
    speaking = true;
    isPaused = false;
    bubble.classList.add('speaking');
    $('bPlay').textContent = '⏸ Pauza';
  };

  utterance.onend = () => {
    speaking = false;
    isPaused = false;
    bubble.classList.remove('speaking');
    $('bPlay').textContent = '▶ Davom';
  };

  utterance.onerror = () => {
    speaking = false;
    bubble.classList.remove('speaking');
  };

  window.speechSynthesis.speak(utterance);
}

function toggleSpeech() {
  if (audio.src && !audio.paused) {
    audio.pause();
    isPaused = true;
    $('bPlay').textContent = '▶ Davom';
    return;
  }

  if (audio.src && audio.paused && audio.currentTime > 0) {
    audio.play().then(() => {
      isPaused = false;
      $('bPlay').textContent = '⏸ Pauza';
    }).catch(() => {});
    return;
  }

  if ('speechSynthesis' in window) {
    const synth = window.speechSynthesis;
    if (synth.speaking && !synth.paused) {
      synth.pause();
      isPaused = true;
      $('bPlay').textContent = '▶ Davom';
    } else if (synth.paused) {
      synth.resume();
      isPaused = false;
      $('bPlay').textContent = '⏸ Pauza';
    } else if (currentAnswer) {
      speakText(currentAnswer, currentAudioUrl);
    }
  }
}

audio.addEventListener('ended', () => {
  speaking = false;
  bubble.classList.remove('speaking');
  $('bPlay').textContent = '▶ Davom';
});

function applyCamera() {
  world.style.transform =
    `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
}

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
  const next = camera.scale * (event.deltaY > 0 ? 0.92 : 1.08);
  camera.scale = Math.max(0.55, Math.min(1.6, next));
  applyCamera();
}, { passive: false });

function resetBoard() {
  stopSpeech();
  historyItems = [];
  saveHistory();
  renderHistory();
  menu.hidden = true;
  camera = { x: 0, y: 0, scale: 1 };
  applyCamera();
  showToast('Yangi doska ochildi.');
}

$('bNew').addEventListener('click', resetBoard);
$('bReplay').addEventListener('click', () => {
  if (currentAnswer) speakText(currentAnswer, currentAudioUrl);
  else showToast('Hali qayta eshitiladigan javob yo‘q.');
});
$('bPlay').addEventListener('click', toggleSpeech);

$('bPlus').addEventListener('click', () => {
  $('imageInput').click();
});

$('imageInput').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Iltimos, rasm faylini tanlang.');
    return;
  }

  if (file.size > 7 * 1024 * 1024) {
    showToast('Rasm 7 MB dan kichik bo‘lsin.');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async () => {
    await ask(input.value.trim(), {
      mimeType: file.type,
      data: reader.result
    });
    event.target.value = '';
  };
  reader.onerror = () => showToast('Rasmni o‘qib bo‘lmadi.');
  reader.readAsDataURL(file);
});

$('bMic').addEventListener('click', () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    showToast('Ovoz kiritish bu brauzerda ishlamaydi. Chrome’da sinang.');
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
  };

  recognition.onerror = () => showToast('Mikrofon ishlamadi. Ruxsatlarni tekshiring.');
  recognition.onend = () => { recognition = null; };
  recognition.start();
  showToast('Gapiring, savolingizni tinglayapman.');
});

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
        answers.replaceChildren(createCard(item, 0));
        currentAnswer = item.text;
        currentAudioUrl = item.audio;
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

async function ask(prompt, image = null) {
  if (!prompt && !image) {
    showToast('Savolingizni yozing yoki rasm tanlang.');
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = '…';
  stopSpeech();

  try {
    const response = await fetch('/api/lesson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        image,
        quick: false
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Server xatosi');
    }

    const item = {
      prompt,
      text: result.text,
      audio: result.audio || null,
      time: Date.now()
    };

    historyItems.push(item);
    historyItems = historyItems.slice(-30);
    saveHistory();
    renderHistory();

    currentAnswer = item.text;
    currentAudioUrl = item.audio;
    speakText(item.text, item.audio);
    showToast('Javob tayyor.');
  } catch (error) {
    showToast(error.message || 'Xatolik yuz berdi.');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = '➤';
    input.value = '';
    input.focus();
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  ask(input.value.trim());
});

loadHistory();
renderHistory();

if (historyItems.length) {
  const last = historyItems[historyItems.length - 1];
  currentAnswer = last.text || '';
  currentAudioUrl = last.audio || null;
} else {
  currentAnswer = 'Salom! Men Bubble AI. Savolingizni yozing yoki rasm yuboring.';
}

bubble.style.left = '30px';
bubble.style.top = '30px';
answers.style.pointerEvents = 'auto';
applyCamera();
