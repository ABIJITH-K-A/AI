// CLINICAL AI STETHOSCOPE v2.2 - RUN BUTTON + BPM GRAPH
const canvas = document.getElementById('viz');
const bpmCanvas = document.getElementById('bpmGraph');
const bpmCtx = bpmCanvas.getContext('2d');
const resetBtn = document.getElementById('reset');
const fileInput = document.getElementById('fileInput');
const runBtn = document.getElementById('runBtn');
const micBtn = document.getElementById('micBtn');
const downloadBtn = document.getElementById('download');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const uploadProgress = document.getElementById('uploadProgress');

// STATE
let analyser, audioCtx, source, stream, sourceStarted = false, audioBuffer = null;
let isAnalyzing = false, isMicMode = false, isRunning = false;
let pcgData = [], bpmHistory = [], bpmGraphData = [];
let lastBeatTime = 0, frameCount = 0, s1s2Confidence = 0;
let lungFeatures = { crackleProb: 0, wheezeProb: 0 };

// EVENT LISTENERS
resetBtn.onclick = resetEverything;
runBtn.onclick = toggleAnalysis;
micBtn.onclick = toggleMic;

// RUN BUTTON LOGIC
function toggleAnalysis() {
  if (isRunning || !audioBuffer) {
    stopAnalysis();
  } else {
    startAnalysis();
  }
}

function startAnalysis() {
  if (!audioBuffer) {
    document.getElementById('diagnosis').textContent = 'Please upload MP3 first';
    return;
  }
  
  runBtn.textContent = 'Stop Analysis';
  runBtn.classList.add('active');
  isRunning = true;
  
  // START AUDIO PROCESSING
  source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 32768;
  analyser.smoothingTimeConstant = 0.8;
  
  const biquad = audioCtx.createBiquadFilter();
  biquad.type = 'highpass';
  biquad.frequency.value = 20;
  
  source.connect(biquad);
  biquad.connect(analyser);
  source.start(0);
  isAnalyzing = true;
  
  document.getElementById('diagnosis').textContent = 'Clinical PCG Analysis Running';
  visualizePCG();
}

function stopAnalysis() {
  isRunning = false;
  runBtn.textContent = 'Run Analysis';
  runBtn.classList.remove('active');
  isAnalyzing = false;
  if (source) source.stop();
}

// FIXED FILE UPLOAD
fileInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  stopMic();
  stopAnalysis();
  resetDisplays();
  showProgress(0);
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    updateProgress(50, 'Decoding audio...');
    
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer); // STORE BUFFER
    updateProgress(100, 'Ready - Click Run Analysis');
    hideProgress();
    
    document.getElementById('diagnosis').textContent = 'Upload complete. Click Run Analysis to start';
    runBtn.disabled = false;
    
  } catch (error) {
    document.getElementById('diagnosis').textContent = 'Audio failed: ' + error.message;
    hideProgress();
  }
};

// LIVE BPM GRAPH
function drawBPMGraph() {
  bpmCtx.fillStyle = '#0a1a2e';
  bpmCtx.fillRect(0, 0, bpmCanvas.width, bpmCanvas.height);
  
  if (bpmGraphData.length > 1) {
    bpmCtx.strokeStyle = '#29FB66';
    bpmCtx.lineWidth = 3;
    bpmCtx.shadowColor = '#29FB66';
    bpmCtx.shadowBlur = 10;
    bpmCtx.lineCap = 'round';
    bpmCtx.beginPath();
    
    const maxBPM = 220, minBPM = 30;
    const range = maxBPM - minBPM;
    const sliceWidth = bpmCanvas.width / bpmGraphData.length;
    
    for (let i = 0; i < bpmGraphData.length - 1; i++) {
      const x1 = i * sliceWidth;
      const x2 = (i + 1) * sliceWidth;
      const y1 = bpmCanvas.height - ((bpmGraphData[i] - minBPM) / range * bpmCanvas.height);
      const y2 = bpmCanvas.height - ((bpmGraphData[i + 1] - minBPM) / range * bpmCanvas.height);
      
      if (i === 0) bpmCtx.moveTo(x1, y1);
      else bpmCtx.lineTo(x1, y1);
      bpmCtx.lineTo(x2, y2);
    }
    bpmCtx.stroke();
    bpmCtx.shadowBlur = 0;
  }
  
  // GRID
  bpmCtx.strokeStyle = 'rgba(255,255,255,0.1)';
  bpmCtx.lineWidth = 1;
  for (let y = 0; y < bpmCanvas.height; y += 40) {
    bpmCtx.beginPath();
    bpmCtx.moveTo(0, y);
    bpmCtx.lineTo(bpmCanvas.width, y);
    bpmCtx.stroke();
  }
}

// ALL OTHER FUNCTIONS (visualizePCG, detectClinicalHeartbeats, etc.) REMAIN SAME
function visualizePCG() {
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  const freqData = new Uint8Array(analyser.frequencyBinCount);

  function draw() {
    if (!isAnalyzing || !analyser) {
      requestAnimationFrame(draw);
      return;
    }

    frameCount++;
    analyser.getByteTimeDomainData(dataArray);
    analyser.getByteFrequencyData(freqData);
    
    const normalized = ((Math.max(...dataArray) / 128) - 1) * 50;
    pcgData.push(normalized);
    if (pcgData.length > 1500) pcgData.shift();
    
    const peaks = detectClinicalHeartbeats(dataArray);
    analyzeClinicalLungs(freqData);
    
    if (peaks.length > 0) {
      const interval = frameCount * (1000/60) - lastBeatTime;
      if (interval > 300 && interval < 2000) {
        const bpm = Math.round(60000 / interval);
        if (bpm >= 30 && bpm <= 220) {
          updateLiveBPM(bpm);
          lastBeatTime = frameCount * (1000/60);
        }
      }
    }
    
    updateDisplays();
    drawWaveform();
    drawBPMGraph(); // NEW: Live BPM graph
    requestAnimationFrame(draw);
  }
  draw();
}

function updateLiveBPM(bpm) {
  document.getElementById('liveBPM').textContent = bpm.toString().padStart(2, '0');
  bpmHistory.push(bpm);
  bpmGraphData.push(bpm); // ADD TO GRAPH
  if (bpmHistory.length > 50) {
    bpmHistory.shift();
    bpmGraphData.shift();
  }
}

// KEEP ALL OTHER FUNCTIONS EXACTLY SAME (resetEverything, showProgress, etc.)
runBtn.disabled = true; // DISABLE UNTIL FILE UPLOADED
console.log('AI Stethoscope v2.2 - Run Button + BPM Graph Ready');
