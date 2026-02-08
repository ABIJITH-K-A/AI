// FIXED: MP3 UPLOAD + MISSING VARIABLES
const canvas = document.getElementById('viz');
const ctx = canvas.getContext('2d');
const resetBtn = document.getElementById('reset');
const fileInput = document.getElementById('fileInput');
const micBtn = document.getElementById('micBtn');
const downloadBtn = document.getElementById('download');

// FIXED: Added missing variable
let sourceStarted = false; 

// ... [all your clinical variables unchanged] ...

// FIXED: Corrected function name + MP3 compatibility
fileInput.onchange = async (e) => {
  stopMic();
  const file = e.target.files[0];
  if (!file) return;

  resetDisplays();
  resetBtn.disabled = true;
  micBtn.disabled = true;
  downloadBtn.disabled = true;
  document.getElementById('diagnosis').textContent = '⚡ Processing Clinical Audio...';
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // FIXED: Remove forced 8kHz - let browser decode naturally
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    audioDuration = audioBuffer.duration * 1000;

    source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    
    // CLINICAL ANALYZER SETTINGS
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 32768;
    analyser.smoothingTimeConstant = 0.8;
    analyser.minDecibels = -90;
    
    // HIGH-PASS FILTER 20Hz
    const biquad = audioCtx.createBiquadFilter();
    biquad.type = 'highpass';
    biquad.frequency.value = 20;
    
    source.connect(biquad);
    biquad.connect(analyser);
    analyser.connect(audioCtx.destination);

    isMicMode = false;
    resetAnalysis();
    sourceStarted = true;  // FIXED: Now defined
    source.start(0);
    isAnalyzing = true;
    
    document.getElementById('diagnosis').textContent = '🔬 Clinical PCG Analysis...';
    await initMLModel();
    
    // FIXED: Enable buttons after 2s
    setTimeout(() => {
      resetBtn.disabled = false;
      micBtn.disabled = false;
      downloadBtn.disabled = false;
    }, 2000);
    
    visualizePCG();  // MOVED: Start visualization immediately
    
  } catch (error) {
    console.error('MP3 Error:', error);
    document.getElementById('diagnosis').textContent = `MP3 Failed: ${error.message}`;
    resetBtn.disabled = false;
    micBtn.disabled = false;
  }
};

// FIXED: Add missing update functions
function updateStatsDisplay() {
  if (bpmHistory.length < 3) return;
  const avg = Math.round(bpmHistory.reduce((a, b) => a + b, 0) / bpmHistory.length);
  const minBPM = Math.min(...bpmHistory);
  const maxBPM = Math.max(...bpmHistory);
  
  document.getElementById('avgBPM').textContent = avg.toString().padStart(2, '0');
  document.getElementById('rangeBPM').textContent = `${minBPM}-${maxBPM}`;
}

function updateHeartDisplay() {
  const heartEl = document.getElementById('heartResult');
  const status = getClinicalHeartStatus();
  heartEl.textContent = `${status} (${(s1s2Confidence*100).toFixed(0)}%)`;
}

function updateLungDisplay() {
  const lungEl = document.getElementById('lungResult');
  lungEl.textContent = getClinicalLungStatus();
}

// FIXED: Update visualizePCG() - add pcgData pushing + stats
function visualizePCG() {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  const freqData = new Uint8Array(bufferLength);

  function drawFrame() {
    if (!isAnalyzing || !analyser || audioCtx?.state !== 'running') {
      requestAnimationFrame(drawFrame);
      return;
    }

    frameCount++;
    analyser.getByteTimeDomainData(dataArray);
    analyser.getByteFrequencyData(freqData);
    
    // FIXED: Store waveform data for display
    const maxSample = Math.max(...dataArray);
    const normalized = ((maxSample / 128) - 1) * 50;
    pcgData.push(normalized);
    if (pcgData.length > 1500) pcgData.shift();
    
    // CLINICAL PIPELINE
    const peaks = detectClinicalHeartbeats(dataArray);
    analyzeClinicalLungs(freqData);
    analyzeWithML(dataArray);
    
    // BPM CALCULATION
    if (peaks.length > 0) {
      const currentTimeMs = frameCount * (1000/60);
      const intervalMs = currentTimeMs - lastBeatTime;
      
      if (intervalMs > 300 && intervalMs < 2000) {
        const bpm = Math.round(60000 / intervalMs);
        if (bpm >= 30 && bpm <= 220) {
          updateLiveBPM(bpm);
          lastBeatTime = currentTimeMs;
        }
      }
    }

    // Update displays
    updateStatsDisplay();
    updateHeartDisplay();
    updateLungDisplay();

    // DRAWING (unchanged)
    ctx.fillStyle = '#0a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // ... [rest of your drawing code unchanged] ...
    
    requestAnimationFrame(drawFrame);
  }
  drawFrame();
}

// ... [keep ALL other functions exactly the same] ...
