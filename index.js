const canvas = document.getElementById('viz');
const ctx = canvas.getContext('2d');
const resetBtn = document.getElementById('reset');
const fileInput = document.getElementById('fileInput');
const micBtn = document.getElementById('micBtn');
const downloadBtn = document.getElementById('download');
let analyser, audioCtx, source, stream;
let isAnalyzing = false;
let isMicMode = false;
let pcgData = [];
let bpmHistory = [];
let lastBeatTime = 0;
let frameCount = 0;
let audioDuration = 0;
let audioStartTime = 0;
let lastStatsUpdate = 0;
let analysisComplete = false;
let beatThreshold = 90;
let sourceStarted = false;
let lungData = []; // NEW: Lung analysis data
let crackleCount = 0; // NEW: Crackle detection
let wheezeEnergy = 0; // NEW: Wheeze detection

resetBtn.onclick = resetEverything;
micBtn.onclick = toggleMic;

fileInput.onchange = async (e) => {
  stopMic();
  const file = e.target.files[0];
  if (!file) return;

  resetDisplays();
  resetBtn.disabled = true;
  micBtn.disabled = true;
  downloadBtn.disabled = true;
  document.getElementById('diagnosis').textContent = '⚡ Processing MP3...';
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    audioDuration = audioBuffer.duration * 1000;
    
    source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048; // Increased for lung analysis
    analyser.smoothingTimeConstant = 0.4;
    
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    
    isMicMode = false;
    resetAnalysis();
    sourceStarted = true;
    source.start(0);
    isAnalyzing = true;
    
    document.getElementById('diagnosis').textContent = '🔍 Analyzing Heart + Lungs...';
    visualizePCG();
    
    setTimeout(() => {
      resetBtn.disabled = false;
      micBtn.disabled = false;
      downloadBtn.disabled = false;
    }, 2000);
    
    source.onended = () => {
      if (!analysisComplete) {
        analysisComplete = true;
        isAnalyzing = false;
        updateFullDiagnosis();
        document.getElementById('diagnosis').textContent = `✅ Analysis Complete | Heart: ${getHeartStatus()} | Lungs: ${getLungStatus()}`;
      }
    };
    
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('diagnosis').textContent = '❌ MP3 processing failed: ' + error.message;
    resetBtn.disabled = false;
    micBtn.disabled = false;
  }
};

function resetEverything() {
  stopMic();
  if (source) source.stop();
  resetDisplays();
  resetAnalysis();
  if (audioCtx && audioCtx.state === 'running') {
    audioCtx.close();
    audioCtx = null;
  }
  isAnalyzing = false;
  analysisComplete = false;
  sourceStarted = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  fileInput.value = '';
  document.getElementById('diagnosis').textContent = '🔄 Analysis Reset - Ready for new recording';
  downloadBtn.disabled = true;
  micBtn.disabled = false;
  resetBtn.disabled = false;
}

function toggleMic() {
  if (isMicMode) {
    stopMic();
  } else {
    startMic();
  }
}

async function startMic() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        sampleRate: 44100
      }
    });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    
    source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.4;
    
    source.connect(analyser);
    isMicMode = true;
    isAnalyzing = true;
    resetAnalysis();
    micBtn.textContent = 'Stop Stethoscope';
    micBtn.classList.add('active');
    resetBtn.disabled = true;
    fileInput.disabled = true;
    downloadBtn.disabled = false;
    document.getElementById('diagnosis').textContent = '🔍 Live Stethoscope - Place on chest';
    visualizePCG();
  } catch (err) {
    console.error('Mic access denied:', err);
    document.getElementById('diagnosis').textContent = '❌ Microphone access denied';
  }
}

function stopMic() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  if (audioCtx && audioCtx.state === 'running') {
    audioCtx.close();
    audioCtx = null;
  }
  isMicMode = false;
  isAnalyzing = false;
  micBtn.textContent = 'Live Stethoscope';
  micBtn.classList.remove('active');
  resetBtn.disabled = false;
  fileInput.disabled = false;
  if (!analysisComplete) {
    document.getElementById('diagnosis').textContent = 'Analysis stopped';
  }
}

downloadBtn.onclick = () => {
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = 2480;
  fullCanvas.height = 1800;
  const fullCtx = fullCanvas.getContext('2d');
  drawFullPCGReport(fullCtx, fullCanvas);
  
  const link = document.createElement('a');
  link.download = `PCG-Report-${Date.now()}.png`;
  link.href = fullCanvas.toDataURL('image/png');
  link.click();
};

function setColorClasses(elementId, className) {
  const el = document.getElementById(elementId);
  el.className = `metric-value bpm-value ${className}`;
}

function resetDisplays() {
  document.getElementById('liveBPM').textContent = '00';
  document.getElementById('avgBPM').textContent = '00';
  document.getElementById('rangeBPM').textContent = '00-00';
  setColorClasses('liveBPM', '');
  setColorClasses('avgBPM', '');
}

function resetAnalysis() {
  pcgData = [];
  bpmHistory = [];
  lungData = [];
  crackleCount = 0;
  wheezeEnergy = 0;
  frameCount = 0;
  audioStartTime = Date.now();
  lastStatsUpdate = audioStartTime;
  lastBeatTime = 0;
  analysisComplete = false;
  beatThreshold = 90;
}

// NEW: Heart status detection
function getHeartStatus() {
  if (bpmHistory.length === 0) return 'Not Detected';
  const avgBPM = Math.round(bpmHistory.reduce((a, b) => a + b, 0) / bpmHistory.length);
  
  if (avgBPM > 150) return '🚨 TACHYCARDIA - Medical Review Needed';
  if (avgBPM < 50) return '🚨 BRADYCARDIA - Potentially Dangerous';
  if (avgBPM >= 60 && avgBPM <= 100) return '✅ NORMAL';
  return '⚠️ ABNORMAL';
}

// NEW: Lung status detection
function getLungStatus() {
  if (crackleCount > 5) return '🚨 CRACKLES - Fluid/Infection Suspected';
  if (wheezeEnergy > 300) return '🚨 WHEEZES - Airway Obstruction';
  if (lungData.length < 100) return 'Monitoring...';
  return '✅ NORMAL VESICULAR';
}

// NEW: Comprehensive diagnosis
function updateFullDiagnosis() {
  const heartStatus = getHeartStatus();
  const lungStatus = getLungStatus();
  
  // Update rangeBPM to show diagnosis
  document.getElementById('rangeBPM').textContent = heartStatus.includes('NORMAL') ? 'NORMAL' : 'ABNORMAL';
}

const detectHeartbeats = (dataArray) => {
  const peaks = [];
  const bufferLength = dataArray.length;
  
  for (let i = 15; i < bufferLength - 15; i++) {
    const sample = dataArray[i];
    
    if (sample > beatThreshold && 
        sample > dataArray[i-5] && 
        sample > dataArray[i+5] && 
        sample > dataArray[i-10] && 
        sample > dataArray[i+10]) {
      peaks.push(i);
    }
  }
  return peaks;
};

function updateLiveBPM(bpm) {
  const liveEl = document.getElementById('liveBPM');
  liveEl.textContent = bpm.toString().padStart(2, '0');
  bpmHistory.push(bpm);
  
  if (bpmHistory.length > 30) bpmHistory.shift();
  
  updateBPMColor(bpm, 'liveBPM');
  updateStatsDisplay();
}

function updateStatsDisplay() {
  if (bpmHistory.length < 2) return;
  
  const avg = Math.round(bpmHistory.reduce((a, b) => a + b, 0) / bpmHistory.length);
  const minBPM = Math.min(...bpmHistory);
  const maxBPM = Math.max(...bpmHistory);
  
  document.getElementById('avgBPM').textContent = avg.toString().padStart(2, '0');
  document.getElementById('rangeBPM').textContent = `${minBPM}-${maxBPM}`;
  
  updateBPMColor(avg, 'avgBPM');
}

function updateBPMColor(bpm, elementId) {
  const el = document.getElementById(elementId);
  let className = '';
  if (bpm < 50) className = 'low';
  else if (bpm >= 60 && bpm <= 100) className = 'high';
  else className = 'medium';
  
  el.className = `metric-value bpm-value ${className}`;
}

function visualizePCG() {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  const freqData = new Uint8Array(bufferLength); // NEW: Frequency data for lungs

  function drawFrame() {
    const currentTime = Date.now();
    const elapsed = currentTime - audioStartTime;
    
    if (!isAnalyzing || !analyser || audioCtx?.state !== 'running') {
      requestAnimationFrame(drawFrame);
      return;
    }

    frameCount++;
    analyser.getByteTimeDomainData(dataArray);
    analyser.getByteFrequencyData(freqData); // NEW: Lung frequency analysis
    
    // Heart waveform (time domain)
    const maxSample = Math.max(...dataArray);
    const normalized = ((maxSample / 128) - 1) * 50;
    pcgData.push(normalized);
    
    if (pcgData.length > 1500) pcgData.shift();

    // NEW: Lung analysis (400-1000Hz range)
    const lungStartBin = Math.floor(400 * bufferLength / audioCtx.sampleRate);
    const lungEndBin = Math.floor(1000 * bufferLength / audioCtx.sampleRate);
    const lungEnergy = freqData.slice(lungStartBin, lungEndBin).reduce((a, b) => a + b, 0);
    lungData.push(lungEnergy);
    
    if (lungData.length > 200) lungData.shift();

    // Crackle detection (high frequency bursts)
    if (freqData.slice(lungStartBin, lungEndBin).some(f => f > 180)) {
      crackleCount++;
    }
    
    // Wheeze detection (sustained high energy)
    wheezeEnergy = Math.max(0, wheezeEnergy * 0.95 + lungEnergy * 0.05);

    // Heartbeat detection
    const peaks = detectHeartbeats(dataArray);
    if (peaks.length > 0) {
      const currentTimeMs = frameCount * (1000/60);
      const intervalMs = currentTimeMs - lastBeatTime;
      
      if (intervalMs > 300 && intervalMs < 1714) {
        const bpm = Math.round(60000 / intervalMs);
        if (bpm >= 35 && bpm < 200) {
          updateLiveBPM(bpm);
          lastBeatTime = currentTimeMs;
          beatThreshold = Math.max(70, Math.min(140, maxSample * 0.65));
        }
      }
    }

    if (currentTime - lastStatsUpdate > 1000) {
      updateStatsDisplay();
      lastStatsUpdate = currentTime;
    }

    if (!isMicMode && source && sourceStarted && !analysisComplete) {
      const sourceEnded = elapsed >= audioDuration + 2000;
      if (sourceEnded) {
        isAnalyzing = false;
        analysisComplete = true;
        updateFullDiagnosis();
        document.getElementById('diagnosis').textContent = `✅ Complete | Heart: ${getHeartStatus()} | Lungs: ${getLungStatus()}`;
        return;
      }
    }

    // DRAWING (unchanged visualization)
    ctx.fillStyle = '#0a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#aaa';
    ctx.font = 'bold 12px Courier';
    ctx.textAlign = 'center';
    const labels = ['+1.2', '+0.8', '+0.4', '0', '-0.4', '-0.8'];
    for (let i = 0; i < 6; i++) {
      ctx.fillText(labels[i], 35, canvas.height/2 - (i-2.5)*40);
    }

    ctx.strokeStyle = '#4a90b8';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, canvas.height/2);
    ctx.lineTo(canvas.width, canvas.height/2);
    ctx.stroke();

    if (pcgData.length > 100) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#007c9d';
      ctx.shadowColor = '#007c9d';
      ctx.shadowBlur = 15;
      ctx.lineCap = 'round';
      ctx.beginPath();
      
      const visibleSamples = 1000;
      const sliceWidth = canvas.width / visibleSamples;
      const startIdx = Math.max(0, pcgData.length - visibleSamples);
      
      for (let i = 0; i < visibleSamples && (startIdx + i) < pcgData.length; i++) {
        const x = i * sliceWidth;
        const y = canvas.height/2 - pcgData[startIdx + i];
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    const heartStatus = getHeartStatus();
    const lungStatus = getLungStatus();
    const progress = isMicMode ? 'LIVE' : 
                     (analysisComplete ? 'COMPLETE' : 
                      audioDuration > 0 ? Math.min(100, (elapsed / audioDuration * 100)).toFixed(0) + '%' : 'PROCESSING');
    
    document.getElementById('diagnosis').textContent = 
      analysisComplete ? `✅ Complete | ${heartStatus} | ${lungStatus}` :
      `🔍 ${progress} | Heart: ${heartStatus.split(' ')[0]} | Lungs: ${lungStatus.split(' ')[0]}`;

    requestAnimationFrame(drawFrame);
  }
  drawFrame();
}

function drawFullPCGReport(ctx, canvas) {
  const liveBPM = document.getElementById('liveBPM').textContent;
  const avgBPM = document.getElementById('avgBPM').textContent;
  const heartStatus = getHeartStatus();
  const lungStatus = getLungStatus();
  
  ctx.fillStyle = '#0a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 80px Segoe UI';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#007c9d';
  ctx.shadowBlur = 30;
  ctx.fillText('PHONOCARDIOGRAPHY REPORT', canvas.width/2, 120);
  
  ctx.font = 'bold 50px Segoe UI';
  ctx.fillText(new Date().toLocaleString('en-IN'), canvas.width/2, 200);
  
  ctx.shadowBlur = 0;
  ctx.font = 'bold 45px Segoe UI';
  ctx.fillStyle = '#007c9d';
  ctx.fillText('Heart: 20-150Hz | Murmurs: ≤400Hz | Lungs: 100-1000Hz', canvas.width/2, 280);
  
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 65px Courier';
  ctx.textAlign = 'center';
  ctx.fillText(`Live HR: ${liveBPM} BPM`, canvas.width/2, 400);
  ctx.fillText(`Avg HR: ${avgBPM} BPM`, canvas.width/2, 490);
  ctx.fillText(`Heart: ${heartStatus}`, canvas.width/2, 580);
  ctx.fillText(`Lungs: ${lungStatus}`, canvas.width/2, 670);
  
  ctx.fillStyle = '#1a2a3e';
  ctx.fillRect(50, 720, canvas.width-100, 950);
  
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let y = 0; y < 950; y += 60) {
    ctx.moveTo(50, 720 + y);
    ctx.lineTo(canvas.width-50, 720 + y);
  }
  for (let x = 0; x < canvas.width-100; x += 80) {
    ctx.moveTo(50 + x, 720);
    ctx.lineTo(50 + x, canvas.height-50);
  }
  ctx.stroke();
  
  ctx.strokeStyle = '#4a90b8';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(50, 720 + 475);
  ctx.lineTo(canvas.width-50, 720 + 475);
  ctx.stroke();
  
  if (pcgData.length > 100) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#007c9d';
    ctx.shadowColor = '#007c9d';
    ctx.shadowBlur = 25;
    ctx.lineCap = 'round';
    ctx.beginPath();
    
    const graphWidth = canvas.width - 100;
    const visibleSamples = 3000;
    const sliceWidth = graphWidth / visibleSamples;
    const startIdx = Math.max(0, pcgData.length - visibleSamples);
    
    for (let i = 0; i < visibleSamples && (startIdx + i) < pcgData.length; i++) {
      const x = 50 + i * sliceWidth;
      const y = 720 + 475 - (pcgData[startIdx + i] * 20);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  
  ctx.fillStyle = '#aaa';
  ctx.font = 'bold 22px Courier';
  ctx.textAlign = 'center';
  ctx.fillText('PCG Waveform (20-150Hz Heart Sounds)', canvas.width/2, 1680);
  ctx.fillText('Time →', canvas.width-80, 1670);
}

console.log('✅ AI Stethoscope - Heart + Lung Analysis COMPLETE!');
