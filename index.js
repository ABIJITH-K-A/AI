const canvas = document.getElementById('viz');
const ctx = canvas.getContext('2d');
const resetBtn = document.getElementById('reset');
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

resetBtn.onclick = resetEverything;
micBtn.onclick = toggleMic;

function resetEverything() {
  stopMic();
  resetDisplays();
  resetAnalysis();
  if (analyser) {
    if (audioCtx && audioCtx.state === 'running') audioCtx.close();
    isAnalyzing = false;
    analysisComplete = false;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.4;
    
    source.connect(analyser);
    isMicMode = true;
    isAnalyzing = true;
    resetAnalysis();
    micBtn.textContent = 'Stop Stethoscope';
    micBtn.classList.add('active');
    resetBtn.disabled = true;
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
  resetBtn.disabled = false;
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
  beatThreshold = 90;
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

function calculateLiveConfidence() {
  if (bpmHistory.length < 5) {
    updateConfidenceColor(20);
    return;
  }
  
  const avgBPM = bpmHistory.reduce((a,b)=>a+b,0) / bpmHistory.length;
  const variance = bpmHistory.reduce((sum, bpm) => sum + Math.pow(bpm - avgBPM, 2), 0) / bpmHistory.length;
  const confidence = Math.max(15, Math.min(90, 75 - (variance * 1.5)));
  
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
    
    const centerIdx = Math.floor(bufferLength * 0.35);
    const sample = dataArray[centerIdx];
    const normalized = ((sample / 128) - 1) * 50;
    pcgData.push(normalized);
    
    if (pcgData.length > 1500) pcgData.shift();

    const peaks = detectHeartbeats(dataArray);
    if (peaks.length > 0) {
      const currentTimeMs = frameCount * (1000/60);
      const intervalMs = currentTimeMs - lastBeatTime;
      
      if (intervalMs > 300 && intervalMs < 1714) {
        const bpm = Math.round(60000 / intervalMs);
        if (bpm >= 35 && bpm < 200) {
          updateLiveBPM(bpm);
          lastBeatTime = currentTimeMs;
          beatThreshold = Math.max(70, Math.min(140, sample * 0.65));
        }
      }
    }

    if (currentTime - lastStatsUpdate > 1000) {
      updateStatsDisplay();
      calculateLiveConfidence();
      lastStatsUpdate = currentTime;
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
  ctx.fillText(`Quality: ${conf}`, canvas.width/2, 670);
  
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
    const graphHeight = 950;
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

console.log('✅ ENHANCED AI Stethoscope - Report w/ Graph + Reset!');
