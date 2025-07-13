// === REFERINȚE ===
const cameraContainer = document.getElementById('camera-container');
const cameraVideo = document.getElementById('camera');
const cameraToggleBtn = document.getElementById('cameraToggleBtn');
const voiceBtn = document.getElementById('voiceBtn');
const startBtn = document.getElementById('startBtn');
const speedSlider = document.getElementById('speed');
const fontSizeSlider = document.getElementById('fontSize');
const prompter = document.getElementById('prompter');
const resumeScrollBtn = document.getElementById('resumeScrollBtn');
const toggleMirrorBtn = document.getElementById('toggleMirrorBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const uploadTxtBtn = document.getElementById('uploadTxtBtn');
const uploadInput = document.getElementById('uploadInput');
const downloadTxtBtn = document.getElementById('downloadTxtBtn');
const scrollTimer = document.getElementById('scrollTimer');
const recordBtn = document.getElementById('recordBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const filterSelect = document.getElementById('filterSelect');
const speedValue = document.getElementById('speedValue');
const fontSizeValue = document.getElementById('fontSizeValue');

let scrollInterval = null;
let isScrolling = false;
let recognition = null;
let isVoiceActive = false;
let isMirrored = false;
let isDarkTheme = true;
let mediaRecorder;
let recordedChunks = [];
let cameraStream = null;

// === TEXT SCROLL ===
function startScroll() {
  stopScroll();
  isScrolling = true;
  startBtn.classList.add('active');
  const delay = 210 - parseInt(speedSlider.value);
  scrollInterval = setInterval(() => {
    prompter.scrollTop += 1;
    localStorage.setItem('scrollPosition', prompter.scrollTop);
    updateTimer();
    if (prompter.scrollTop + prompter.clientHeight >= prompter.scrollHeight) {
      stopScroll();
    }
  }, delay);
}

function stopScroll() {
  clearInterval(scrollInterval);
  isScrolling = false;
  startBtn.classList.remove('active');
}

function updateTimer() {
  const remaining = prompter.scrollHeight - prompter.scrollTop - prompter.clientHeight;
  const delay = 210 - parseInt(speedSlider.value);
  const seconds = Math.max(0, Math.floor(remaining / (1000 / delay)));
  scrollTimer.textContent = `Time Left: ${seconds}s`;
}

startBtn.addEventListener('click', () => {
  isScrolling ? stopScroll() : startScroll();
});

// === CAMERA ===
cameraToggleBtn.addEventListener('click', () => {
  if (cameraContainer.style.display === 'block') {
    cameraContainer.style.display = 'none';
    cameraToggleBtn.classList.remove('active');
    if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
  } else {
    cameraContainer.style.display = 'block';
    cameraToggleBtn.classList.add('active');
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
      cameraStream = stream;
      cameraVideo.srcObject = stream;
    }).catch(err => console.error('Camera error:', err));
  }
});

// === FILMARE ===
recordBtn.addEventListener('click', () => {
  if (!cameraStream) return;
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(cameraStream);
  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recording.webm';
    a.click();
    URL.revokeObjectURL(url);
  };
  mediaRecorder.start();
  recordBtn.classList.add('active');
});

pauseBtn.addEventListener('click', () => {
  if (!mediaRecorder) return;
  if (mediaRecorder.state === 'recording') mediaRecorder.pause();
  else if (mediaRecorder.state === 'paused') mediaRecorder.resume();
});

stopBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    recordBtn.classList.remove('active');
  }
});

// === FILTRE VIDEO ===
filterSelect.addEventListener('change', () => {
  const filter = filterSelect.value;
  cameraVideo.className = '';
  if (filter !== 'none') cameraVideo.classList.add('filter-' + filter);
});

// === FONT SIZE ===
fontSizeSlider.addEventListener('input', () => {
  prompter.style.fontSize = fontSizeSlider.value + 'px';
  fontSizeValue.textContent = fontSizeSlider.value;
});

// === SPEED ===
speedSlider.addEventListener('input', () => {
  if (isScrolling) startScroll();
  speedValue.textContent = speedSlider.value;
});

// === COMENZI VOCALE ===
voiceBtn.addEventListener('click', () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return alert("Your browser does not support voice recognition.");
  if (isVoiceActive) {
    recognition.stop();
    voiceBtn.classList.remove('active');
    isVoiceActive = false;
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
    if (transcript.includes("again") || transcript.includes("reset")) {
      stopScroll(); prompter.scrollTop = 0; startScroll();
    }
    if (transcript.includes("fast")) {
      let speed = parseInt(speedSlider.value);
      speedSlider.value = Math.min(200, speed + 10);
      speedValue.textContent = speedSlider.value;
      if (isScrolling) startScroll();
    }
    if (transcript.includes("slow")) {
      let speed = parseInt(speedSlider.value);
      speedSlider.value = Math.max(10, speed - 10);
      speedValue.textContent = speedSlider.value;
      if (isScrolling) startScroll();
    }
    if (transcript.includes("zoom in")) {
      let size = parseInt(fontSizeSlider.value);
      fontSizeSlider.value = Math.min(200, size + 2);
      prompter.style.fontSize = fontSizeSlider.value + 'px';
      fontSizeValue.textContent = fontSizeSlider.value;
    }
    if (transcript.includes("zoom out")) {
      let size = parseInt(fontSizeSlider.value);
      fontSizeSlider.value = Math.max(10, size - 2);
      prompter.style.fontSize = fontSizeSlider.value + 'px';
      fontSizeValue.textContent = fontSizeSlider.value;
    }
  };

  recognition.onerror = recognition.onend = () => {
    voiceBtn.classList.remove('active');
    isVoiceActive = false;
  };

  recognition.start();
  voiceBtn.classList.add('active');
  isVoiceActive = true;
});

// === RESUME SCROLL ===
window.addEventListener('load', () => {
  const savedScroll = localStorage.getItem('scrollPosition');
  if (savedScroll) prompter.scrollTop = parseInt(savedScroll);
});
resumeScrollBtn.addEventListener('click', () => {
  const savedScroll = localStorage.getItem('scrollPosition');
  if (savedScroll) prompter.scrollTop = parseInt(savedScroll);
});

// === MIRROR TEXT ===
toggleMirrorBtn.addEventListener('click', () => {
  isMirrored = !isMirrored;
  prompter.style.transform = isMirrored ? 'scaleX(-1)' : 'none';
});

// === THEME TOGGLE ===
themeToggleBtn.addEventListener('click', () => {
  isDarkTheme = !isDarkTheme;
  document.body.classList.toggle('light-theme');
});

// === TXT UPLOAD ===
uploadTxtBtn.addEventListener('click', () => {
  uploadInput.click();
});
uploadInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file && file.type === 'text/plain') {
    const reader = new FileReader();
    reader.onload = () => {
      prompter.textContent = reader.result;
    };
    reader.readAsText(file);
  }
});

// === TXT DOWNLOAD ===
downloadTxtBtn.addEventListener('click', () => {
  const blob = new Blob([prompter.textContent], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'prompter.txt';
  a.click();
});

// === AUTOSAVE TEXT ===
prompter.addEventListener('input', () => {
  localStorage.setItem('prompterText', prompter.innerText);
});

// === RESTORE TEXT ===
window.addEventListener('load', () => {
  const savedText = localStorage.getItem('prompterText');
  if (savedText) {
    prompter.innerText = savedText;
  }
});

// === FOCUS MODE ===
document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'f') {
    document.body.classList.toggle('focus-mode');
  }
});

const toggleUIBtn = document.getElementById('toggleUIBtn');

toggleUIBtn.addEventListener('click', () => {
  document.body.classList.toggle('focus-mode');
  toggleUIBtn.classList.toggle('active');
  toggleUIBtn.innerHTML = document.body.classList.contains('focus-mode')
    ? '<i class="fas fa-eye"></i>'
    : '<i class="fas fa-eye-slash"></i>';
});

// Detectare automată pentru rotire (opțională)
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    if (window.matchMedia("(orientation: landscape)").matches) {
      document.body.classList.add('landscape');
    } else {
      document.body.classList.remove('landscape');
    }
  }, 300);
});

// === DOUBLE TAP TO TOGGLE UI ===
let lastTapTime = 0;

document.addEventListener('touchend', (e) => {
  const currentTime = new Date().getTime();
  const tapLength = currentTime - lastTapTime;

  if (tapLength < 300 && tapLength > 0) {
    document.body.classList.toggle('focus-mode');
  }

  lastTapTime = currentTime;
});

document.addEventListener('dblclick', () => {
  document.body.classList.toggle('focus-mode');
});

const switchCameraBtn = document.getElementById('switchCameraBtn');

let currentFacingMode = 'user'; // user = front, environment = back

async function startCamera(facingMode = 'user') {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: facingMode } },
      audio: false
    });
    cameraVideo.srcObject = cameraStream;
    currentFacingMode = facingMode;
  } catch (err) {
    console.error('Camera access error:', err);
  }
}

// Start with front camera
startCamera();

// Toggle camera button
switchCameraBtn.addEventListener('click', () => {
  const newMode = currentFacingMode === 'user' ? 'environment' : 'user';
  startCamera(newMode);
});
