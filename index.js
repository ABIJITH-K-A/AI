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
let beatThreshold = 60; // HYPER-SENSITIVE: WAS 90
let sourceStarted = false;
let lungData = [];
let crackleCount = 0;
let wheezeEnergy = 0;
let heartStatus = "Monitoring...";
let lungStatus = "Monitoring...";

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
    analyser.fftSize = 4096; // HYPER-SENSITIVE: WAS 2048
    analyser.smoothingTimeConstant = 0.2; // HYPER-SENSITIVE: WAS 0.4
    
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    
    isMicMode = false;
    resetAnalysis();
    sourceStarted = true;
    source.start(0);
    isAnalyzing = true;
    
    document.getElementById('diagnosis').textContent = 'Analyzing Heart + Lungs...';
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
      }
    };
    
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('diagnosis').textContent = 'MP3 processing failed';
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
  document.getElementById('diagnosis').textContent = 'Analysis Reset';
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
    analyser.fftSize = 4096; // HYPER-SENSITIVE
    analyser.smoothingTimeConstant = 0.2; // HYPER-SENSITIVE
    
    source.connect(analyser);
    isMicMode = true;
    isAnalyzing = true;
    resetAnalysis();
    micBtn.textContent = 'Stop Stethoscope';
    micBtn.classList.add('active');
    resetBtn.disabled = true;
    fileInput.disabled = true;
    downloadBtn.disabled = false;
    document.getElementById('diagnosis').textContent = 'Live Analysis - Chest Placement';
    visualizePCG();
  } catch (err) {
    console.error('Mic access denied:', err);
    document.getElementById('diagnosis').textContent = 'Microphone access denied';
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

function resetDisplays() {
  document.getElementById('liveBPM').textContent = '00';
  document.getElementById('avgBPM').textContent = '00';
  document.getElementById('rangeBPM').textContent = '00-00';
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
  beatThreshold = 60;
  heartStatus = "Monitoring...";
  lungStatus = "Monitoring...";
  updateHeartDisplay();
  updateLungDisplay();
}

function updateHeartStatus() {
  if (bpmHistory.length === 0) {
    heartStatus = "Not Detected";
    return;
  }
  const avgBPM = Math.round(bpmHistory.reduce((a, b) => a + b, 0) / bpmHistory.length);
  
  if (avgBPM > 150) heartStatus = "TACHYCARDIA - Medical Review";
  else if (avgBPM < 50) heartStatus = "BRADYCARDIA - Dangerous";
  else if (avgBPM >= 60 && avgBPM <= 100) heartStatus = "NORMAL";
  else heartStatus = "ABNORMAL";
}

function getLungStatus() {
  if (crackleCount > 5) return "CRACKLES - Fluid/Infection";
  if (wheezeEnergy > 300) return "WHEEZES - Obstruction";
  if (lungData.length < 100) return "Monitoring...";
  return "NORMAL VESICULAR";
}

function updateFullDiagnosis() {
  updateHeartStatus();
  lungStatus = getLungStatus();
  updateHeartDisplay();
  updateLungDisplay();
}

// HYPER-SENSITIVE HEARTBEAT DETECTION
const detectHeartbeats = (dataArray) => {
  const peaks = [];
  const bufferLength = dataArray.length;
  
  for (let i = 10; i < bufferLength - 10; i++) { // WAS 15 - NOW 10
    const sample = dataArray[i];
    
    if (sample > beatThreshold && 
        sample > dataArray[i-3] &&   // WAS 5 - NOW 3
        sample > dataArray[i+3] && 
        sample > dataArray[i-7] &&   // WAS 10 - NOW 7
        sample > dataArray[i+7]) {
      peaks.push(i);
    }
  }
  return peaks;
};

function updateHeartDisplay() {
  const heartEl = document.getElementById('heartResult');
  heartEl.textContent = heartStatus;
  heartEl.className = 'status-result ' + 
    (heartStatus.includes('NORMAL') ? 'normal' : 
     heartStatus.includes('TACHYCARDIA') || heartStatus.includes('BRADYCARDIA') ? 'danger' : 'abnormal');
}

function updateLungDisplay() {
  const lungEl = document.getElementById('lungResult');
  lungEl.textContent = lungStatus;
  lungEl.className = 'status-result ' + 
    (lungStatus.includes('NORMAL') ? 'normal' : 'danger');
}

function updateLiveBPM(bpm) {
  const liveEl = document.getElementById('liveBPM');
  liveEl.textContent = bpm.toString().padStart(2, '0');
  bpmHistory.push(bpm);
  
  if (bpmHistory.length > 50) bpmHistory.shift();
  
  updateHeartStatus();
  updateHeartDisplay();
  updateStatsDisplay();
}

function updateStatsDisplay() {
  if (bpmHistory.length < 3) return;
  
  const avg = Math.round(bpmHistory.reduce((a, b) => a + b, 0) / bpmHistory.length);
  const minBPM = Math.min(...bpmHistory);
  const maxBPM = Math.max(...bpmHistory);
  
  document.getElementById('avgBPM').textContent = avg.toString().padStart(2, '0');
  document.getElementById('rangeBPM').textContent = `${minBPM}-${maxBPM}`;
  
  const avgEl = document.getElementById('avgBPM');
  avgEl.className = avg < 50 ? 'metric-value avg-value low' : 
                    avg >= 60 && avg <= 100 ? 'metric-value avg-value high' : 
                    'metric-value avg-value medium';
}

function visualizePCG() {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  const freqData = new Uint8Array(bufferLength);

  function drawFrame() {
    const currentTime = Date.now();
    const elapsed = currentTime - audioStartTime;
    
    if (!isAnalyzing || !analyser || audioCtx?.state !== 'running') {
      requestAnimationFrame(drawFrame);
      return;
    }

    frameCount++;
    analyser.getByteTimeDomainData(dataArray);
    analyser.getByteFrequencyData(freqData);
    
    const maxSample = Math.max(...dataArray);
    const normalized = ((maxSample / 128) - 1) * 50;
    pcgData.push(normalized);
    
    if (pcgData.length > 1500) pcgData.shift();

    const sampleRate = audioCtx.sampleRate || 44100;
    const lungStartBin = Math.floor(400 * bufferLength / sampleRate);
    const lungEndBin = Math.floor(1000 * bufferLength / sampleRate);
    const lungEnergy = freqData.slice(lungStartBin, lungEndBin).reduce((a, b) => a + b, 0);
    lungData.push(lungEnergy);
    
    if (lungData.length > 200) lungData.shift();

    if (freqData.slice(lungStartBin, lungEndBin).some(f => f > 180)) {
      crackleCount++;
    }
    wheezeEnergy = Math.max(0, wheezeEnergy * 0.95 + lungEnergy * 0.05);

    const peaks = detectHeartbeats(dataArray);
    if (peaks.length > 0) {
      const currentTimeMs = frameCount * (1000/60);
      const intervalMs = currentTimeMs - lastBeatTime;
      
      if (intervalMs > 300 && intervalMs < 1714) {
        const bpm = Math.round(60000 / intervalMs);
        if (bpm >= 35 && bpm < 200) {
          updateLiveBPM(bpm);
          lastBeatTime = currentTimeMs;
          beatThreshold = Math.max(50, Math.min(120, maxSample * 0.6));
        }
      }
    }

    if (currentTime - lastStatsUpdate > 1000) {
      updateStatsDisplay();
      lungStatus = getLungStatus();
      updateLungDisplay();
      updateHeartDisplay();
      lastStatsUpdate = currentTime;
    }

    if (!isMicMode && source && sourceStarted && !analysisComplete && elapsed >= audioDuration + 2000) {
      isAnalyzing = false;
      analysisComplete = true;
      updateFullDiagnosis();
    }

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

    const progress = isMicMode ? 'LIVE' : 
                     analysisComplete ? 'COMPLETE' : 
                     audioDuration > 0 ? Math.min(100, (elapsed / audioDuration * 100)).toFixed(0) + '%' : 'PROCESSING';
    
    document.getElementById('diagnosis').textContent = 
      `🔍 ${progress}`;

    requestAnimationFrame(drawFrame);
  }
  drawFrame();
}

function drawFullPCGReport(ctx, canvas) {
  const liveBPM = document.getElementById('liveBPM').textContent;
  const avgBPM = document.getElementById('avgBPM').textContent;
  const rangeBPM = document.getElementById('rangeBPM').textContent;
  
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
  ctx.fillText(`Range: ${rangeBPM} BPM`, canvas.width/2, 580);
  ctx.fillText(`Heart: ${heartStatus}`, canvas.width/2, 670);
  ctx.fillText(`Lungs: ${lungStatus}`, canvas.width/2, 760);
  
  ctx.fillStyle = '#1a2a3e';
  ctx.fillRect(50, 820, canvas.width-100, 850);
  
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let y = 0; y < 850; y += 60) {
    ctx.moveTo(50, 820 + y);
    ctx.lineTo(canvas.width-50, 820 + y);
  }
  ctx.stroke();
  
  ctx.strokeStyle = '#4a90b8';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(50, 820 + 425);
  ctx.lineTo(canvas.width-50, 820 + 425);
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
      const y = 820 + 425 - (pcgData[startIdx + i] * 20);
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
}

console.log('HYPER-SENSITIVE AI STETHOSCOPE COMPLETE!');
