const canvas = document.getElementById('viz');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start');
const micBtn = document.getElementById('micBtn');
const downloadBtn = document.getElementById('download');
const fileInput = document.getElementById('fileInput');
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
let beatThreshold = 90;  // 🔧 LOWERED from 130 → 90 (more sensitive)

startBtn.onclick = () => { fileInput.click(); };
micBtn.onclick = toggleMic;

function toggleMic() {
  if (isMicMode) {
    stopMic();
  } else {
    startMic();
  }
}

async function startMic() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.4;  // 🔧 LOWERED from 0.6 → 0.4 (faster response)
    
    source.connect(analyser);
    isMicMode = true;
    isAnalyzing = true;
    resetAnalysis();
    micBtn.textContent = 'Stop Stethoscope';
    micBtn.classList.add('active');
    startBtn.disabled = true;
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
  }
  isMicMode = false;
  isAnalyzing = false;
  micBtn.textContent = 'Live Stethoscope';
  micBtn.classList.remove('active');
  startBtn.disabled = false;
  document.getElementById('diagnosis').textContent = 'Analysis stopped';
}

downloadBtn.onclick = () => {
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = 2400;
  fullCanvas.height = 1000;
  const fullCtx = fullCanvas.getContext('2d');
  drawFullPCGReport(fullCtx, fullCanvas);
  
  const link = document.createElement('a');
  link.download = `PCG-Report-${Date.now()}.png`;
  link.href = fullCanvas.toDataURL('image/png');
  link.click();
};

fileInput.onchange = async (e) => {
  stopMic();
  const file = e.target.files[0];
  if (!file) return;

  resetDisplays();
  startBtn.textContent = '⚡ Processing...';
  startBtn.disabled = true;
  micBtn.disabled = true;
  downloadBtn.disabled = true;
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    audioDuration = audioBuffer.duration * 1000;
    
    source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.4;  // 🔧 LOWERED from 0.6 → 0.4
    
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    
    isMicMode = false;
    resetAnalysis();
    source.start();
    isAnalyzing = true;
    
    startBtn.textContent = '⚡ Live Analysis';
    micBtn.disabled = false;
    downloadBtn.disabled = false;
    visualizePCG();
    
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('diagnosis').textContent = '❌ Audio processing failed';
    startBtn.textContent = 'Upload MP3';
    startBtn.disabled = false;
    micBtn.disabled = false;
  }
};

function setColorClasses(elementId, className) {
  const el = document.getElementById(elementId);
  if (elementId === 'liveBPM' || elementId === 'avgBPM') {
    el.className = `metric-value bpm-value ${className}`;
  } else {
    el.className = `metric-value conf-value ${className}`;
  }
}

function resetDisplays() {
  document.getElementById('liveBPM').textContent = '00';
  document.getElementById('avgBPM').textContent = '00';
  document.getElementById('rangeBPM').textContent = '00-00';
  document.getElementById('confidence').textContent = '00%';
  setColorClasses('liveBPM', '');
  setColorClasses('avgBPM', '');
  setColorClasses('confidence', 'low');
}

function resetAnalysis() {
  pcgData = [];
  bpmHistory = [];
  frameCount = 0;
  audioStartTime = Date.now();
  lastStatsUpdate = audioStartTime;
  lastBeatTime = 0;
  analysisComplete = false;
  beatThreshold = 90;  // 🔧 LOWERED from 130 → 90
}

// 🔧 ULTRA-SENSITIVE HEARTBEAT DETECTION
const detectHeartbeats = (dataArray) => {
  const peaks = [];
  const bufferLength = dataArray.length;
  
  // Scan entire buffer for peaks (more sensitive windows)
  for (let i = 15; i < bufferLength - 15; i++) {  // 🔧 REDUCED from 30 → 15
    const sample = dataArray[i];
    
    // More sensitive peak detection criteria
    if (sample > beatThreshold && 
        sample > dataArray[i-5] &&   // 🔧 TIGHTER from 10 → 5
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
  if (bpm < 60) className = 'low';
  else if (bpm >= 60 && bpm <= 100) className = 'high';
  else if (bpm > 100) className = 'medium';
  
  el.className = `metric-value ${elementId.includes('BPM') ? 'bpm-value' : 'conf-value'} ${className}`;
}

function updateConfidenceColor(conf) {
  const el = document.getElementById('confidence');
  el.textContent = `${Math.round(conf)}%`;
  
  let className = 'low';
  if (conf >= 70) className = 'medium';
  if (conf >= 85) className = 'high';
  
  el.className = `metric-value conf-value ${className}`;
}

function getBPMClass(bpm) {
  if (bpm < 60) return 'low';
  if (bpm >= 60 && bpm <= 100) return 'high';
  if (bpm > 100) return 'medium';
  return 'low';
}

function getConfClass(conf) {
  if (conf < 70) return 'low';
  if (conf >= 70 && conf <= 90) return 'medium';
  return 'high';
}

function calculateLiveConfidence() {
  if (bpmHistory.length < 3) {
    updateConfidenceColor(30);
    return;
  }
  
  const avgBPM = bpmHistory.reduce((a,b)=>a+b,0) / bpmHistory.length;
  const variance = bpmHistory.reduce((sum, bpm) => sum + Math.pow(bpm - avgBPM, 2), 0) / bpmHistory.length;
  const confidence = Math.max(20, Math.min(95, 85 - (variance * 3)));
  
  updateConfidenceColor(confidence);
}

function visualizePCG() {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function drawFrame() {
    const currentTime = Date.now();
    const elapsed = currentTime - audioStartTime;
    
    if (!isAnalyzing || !analyser) {
      requestAnimationFrame(drawFrame);
      return;
    }

    frameCount++;
    analyser.getByteTimeDomainData(dataArray);
    
    // PCG waveform from center frequencies (stethoscope optimized)
    const centerIdx = Math.floor(bufferLength * 0.35);
    const sample = dataArray[centerIdx];
    const normalized = ((sample / 128) - 1) * 50;
    pcgData.push(normalized);
    
    if (pcgData.length > 1500) pcgData.shift();

    // ULTRA-SENSITIVE BPM DETECTION
    const peaks = detectHeartbeats(dataArray);
    if (peaks.length > 0) {
      const currentTimeMs = frameCount * (1000/60);
      const intervalMs = currentTimeMs - lastBeatTime;
      
      // Wider heart rate range: 35-200 BPM (300-1714ms intervals)
      if (intervalMs > 300 && intervalMs < 1714) {  // 🔧 WIDENED from 333-1500
        const bpm = Math.round(60000 / intervalMs);
        if (bpm >= 35 && bpm < 200) {  // 🔧 WIDENED from 40-180
          updateLiveBPM(bpm);
          lastBeatTime = currentTimeMs;
          
          // More aggressive dynamic threshold (lower minimum)
          beatThreshold = Math.max(70, Math.min(140, sample * 0.65));  // 🔧 70-140, *0.65
        }
      }
    }

    if (currentTime - lastStatsUpdate > 1000) {
      updateStatsDisplay();
      calculateLiveConfidence();
      lastStatsUpdate = currentTime;
    }

    if (!isMicMode && elapsed >= audioDuration + 1000 && !analysisComplete) {
      isAnalyzing = false;
      analysisComplete = true;
      updateStatsDisplay();
      calculateLiveConfidence();
      document.getElementById('diagnosis').textContent = `✅ PCG Complete | ${bpmHistory.length} beats`;
      return;
    }

    // Draw PCG waveform (unchanged)
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

    const progress = isMicMode ? 'LIVE STETHOSCOPE' : 
                     (analysisComplete ? 'COMPLETE' : 
                      Math.min(100, (elapsed / audioDuration * 100)).toFixed(0) + '%');
    
    document.getElementById('diagnosis').textContent = 
      analysisComplete ? `✅ Analysis Complete | ${bpmHistory.length} heartbeats` :
      `🔍 ${progress} | Live: ${bpmHistory.length} beats`;

    requestAnimationFrame(drawFrame);
  }
  drawFrame();
}

function drawFullPCGReport(ctx, canvas) {
  const liveBPM = document.getElementById('liveBPM').textContent;
  const avgBPM = document.getElementById('avgBPM').textContent;
  const rangeBPM = document.getElementById('rangeBPM').textContent;
  const conf = document.getElementById('confidence').textContent;
  
  ctx.fillStyle = '#0a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 65px Segoe UI';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#007c9d';
  ctx.shadowBlur = 25;
  ctx.fillText('PHONOCARDIOGRAPHY REPORT', canvas.width/2, 130);
  
  ctx.font = 'bold 42px Segoe UI';
  ctx.fillText(new Date().toLocaleString('en-IN'), canvas.width/2, 200);
  
  ctx.shadowBlur = 0;
  ctx.font = 'bold 38px Segoe UI';
  ctx.fillStyle = '#007c9d';
  ctx.fillText('Heart: 20-150Hz | Murmurs: ≤400Hz | Lungs: 100-1000Hz', canvas.width/2, 270);
  
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 55px Courier';
  ctx.fillText(`Live HR: ${liveBPM} BPM`, canvas.width/2, 380);
  ctx.fillText(`Avg HR: ${avgBPM} BPM`, canvas.width/2, 450);
  ctx.fillText(`Range: ${rangeBPM} BPM`, canvas.width/2, 520);
  ctx.fillText(`Quality: ${conf}`, canvas.width/2, 590);
}

console.log('✅ ULTRA-SENSITIVE AI Stethoscope - Enhanced Detection!');
