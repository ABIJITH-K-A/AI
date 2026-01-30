const canvas = document.getElementById('viz');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start');
const micBtn = document.getElementById('micBtn');
const downloadBtn = document.getElementById('download');
const fileInput = document.getElementById('fileInput');
let analyser, audioCtx, source, stream;
let isAnalyzing = false;
let isMicMode = false;
let ecgData = [];
let bpmHistory = [];
let lastBeatTime = 0;
let frameCount = 0;
let audioDuration = 0;
let audioStartTime = 0;
let lastStatsUpdate = 0;
let analysisComplete = false;

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
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.3;
    
    source.connect(analyser);
    isMicMode = true;
    isAnalyzing = true;
    resetAnalysis();
    micBtn.textContent = '🔴 Stop Mic';
    micBtn.classList.add('active');
    startBtn.disabled = true;
    downloadBtn.disabled = false;
    document.getElementById('diagnosis').textContent = '🎤 Live Microphone Analysis';
    visualizeECG();
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
  isMicMode = false;
  isAnalyzing = false;
  micBtn.textContent = '🎤 Live Mic';
  micBtn.classList.remove('active');
  startBtn.disabled = false;
  document.getElementById('diagnosis').textContent = 'Analysis stopped';
}

downloadBtn.onclick = () => {
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = 2400;
  fullCanvas.height = 1000;
  const fullCtx = fullCanvas.getContext('2d');
  drawFullECGReport(fullCtx, fullCanvas);
  
  const link = document.createElement('a');
  link.download = `ECG-Report-${Date.now()}.png`;
  link.href = fullCanvas.toDataURL('image/png');
  link.click();
};

fileInput.onchange = async (e) => {
  stopMic(); // Stop mic if active
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
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.3;
    
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    
    isMicMode = false;
    resetAnalysis();
    source.start();
    isAnalyzing = true;
    
    startBtn.textContent = '⚡ Live Analysis';
    micBtn.disabled = false;
    downloadBtn.disabled = false;
    visualizeECG();
    
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('diagnosis').textContent = '❌ Audio processing failed';
    startBtn.textContent = '📁 Upload MP3';
    startBtn.disabled = false;
    micBtn.disabled = false;
  }
};

function resetDisplays() {
  document.getElementById('liveBPM').textContent = '00';
  document.getElementById('avgBPM').textContent = '00';
  document.getElementById('rangeBPM').textContent = '00';
  document.getElementById('confidence').textContent = '00';
  setColorClasses('liveBPM', 'low');
  setColorClasses('avgBPM', 'low');
  setColorClasses('confidence', 'low');
}

function resetAnalysis() {
  ecgData = [];
  bpmHistory = [];
  frameCount = 0;
  audioStartTime = Date.now();
  lastStatsUpdate = audioStartTime;
  lastBeatTime = 0;
  analysisComplete = false;
}

const detectHeartbeats = (dataArray) => {
  const peaks = [];
  const threshold = 160;
  for (let i = 10; i < dataArray.length - 10; i += 2) {
    if (dataArray[i] > threshold &&
        dataArray[i] > dataArray[i-5] && 
        dataArray[i] > dataArray[i+5]) {
      peaks.push(i);
    }
  }
  return peaks;
};

function updateLiveBPM(bpm) {
  document.getElementById('liveBPM').textContent = bpm;
  bpmHistory.push(bpm);
  if (bpmHistory.length > 50) bpmHistory.shift();
  updateBPMColor(bpm, 'liveBPM');
}

function updateAvgBPMColor() {
  if (bpmHistory.length < 3) return;
  const avg = bpmHistory.reduce((a,b)=>a+b,0) / bpmHistory.length;
  updateBPMColor(avg, 'avgBPM');
}

function updateBPMColor(bpm, elementId) {
  const el = document.getElementById(elementId);
  el.className = `metric-value bpm-value ${getBPMClass(bpm)}`;
}

function updateConfidenceColor(conf) {
  const el = document.getElementById('confidence');
  el.textContent = `${conf}%`;
  el.className = `metric-value conf-value ${getConfClass(conf)}`;
}

function getBPMClass(bpm) {
  if (bpm < 60) return 'low';      // Red
  if (bpm >= 60 && bpm <= 100) return 'high';  // Green (normal)
  if (bpm > 100) return 'medium';  // Yellow (tachycardia)
  return 'low';
}

function getConfClass(conf) {
  if (conf < 70) return 'low';     // Red
  if (conf >= 70 && conf <= 90) return 'medium'; // Yellow
  return 'high';                   // Green
}

function updateStats() {
  if (bpmHistory.length < 3) return;
  
  const avg = Math.round(bpmHistory.reduce((a,b)=>a+b,0) / bpmHistory.length);
  const minBPM = Math.min(...bpmHistory);
  const maxBPM = Math.max(...bpmHistory);
  
  document.getElementById('avgBPM').textContent = avg;
  document.getElementById('rangeBPM').textContent = `${minBPM}-${maxBPM}`;
  updateAvgBPMColor();
}

function calculateFinalConfidence() {
  if (bpmHistory.length < 5) {
    updateConfidenceColor(50);
    return;
  }
  
  const avgBPM = bpmHistory.reduce((a,b)=>a+b,0) / bpmHistory.length;
  const variance = bpmHistory.reduce((sum, bpm) => sum + Math.pow(bpm - avgBPM, 2), 0) / bpmHistory.length;
  const confidence = Math.max(50, Math.min(98, 95 - (variance * 3)));
  
  updateConfidenceColor(confidence);
}

function visualizeECG() {
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
    
    const normalized = (dataArray[Math.floor(bufferLength * 0.5)] / 128 - 1) * 50;
    ecgData.push(normalized);
    if (ecgData.length > 2000) ecgData.shift();

    const peaks = detectHeartbeats(dataArray);
    if (peaks.length > 0) {
      const currentFrameTime = frameCount * 16.67;
      const interval = currentFrameTime - lastBeatTime;
      
      if (interval > 250 && interval < 1500) {
        const bpm = Math.round(60000 / interval);
        if (bpm > 40 && bpm < 200) {
          updateLiveBPM(bpm);
          lastBeatTime = currentFrameTime;
        }
      }
    }

    if (currentTime - lastStatsUpdate > 2000) {
      updateStats();
      lastStatsUpdate = currentTime;
    }

    if (!isMicMode && elapsed >= audioDuration + 500 && !analysisComplete) {
      isAnalyzing = false;
      analysisComplete = true;
      calculateFinalConfidence();
      document.getElementById('diagnosis').textContent = 
        `✅ Analysis Complete | ${bpmHistory.length} heartbeats`;
      startBtn.textContent = '🔄 New Analysis';
      return;
    }

    // FAST BLACK/WHITE VISUALIZATION
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 0; y < canvas.height; y += 50) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    for (let x = 0; x < canvas.width; x += 100) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    ctx.stroke();

    ctx.fillStyle = '#ccc';
    ctx.font = 'bold 12px Courier';
    ctx.textAlign = 'center';
    const labels = ['+2', '+1.5', '+1', '+0.5', '0', '-0.5'];
    for (let i = 0; i < 6; i++) {
      ctx.fillText(labels[i], 30, canvas.height/2 - (i-2.5)*50);
    }

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height/2);
    ctx.lineTo(canvas.width, canvas.height/2);
    ctx.stroke();

    if (ecgData.length > 50) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#fff';
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      
      const visible = 900;
      const sliceW = canvas.width / visible;
      const startIdx = Math.max(0, ecgData.length - visible);
      
      for (let i = 0; i < visible && startIdx + i < ecgData.length; i++) {
        const x = i * sliceW;
        const y = canvas.height/2 - ecgData[startIdx + i];
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    const progress = isMicMode ? 'LIVE' : Math.min(100, (elapsed / audioDuration * 100)).toFixed(0);
    document.getElementById('diagnosis').textContent = 
      analysisComplete ? '✅ Analysis Complete' :
      `🔍 ${progress} | ${bpmHistory.length} beats`;

    requestAnimationFrame(drawFrame);
  }
  drawFrame();
}

function drawFullECGReport(ctx, canvas) {
  const liveBPM = document.getElementById('liveBPM').textContent;
  const avgBPM = document.getElementById('avgBPM').textContent;
  const conf = document.getElementById('confidence').textContent;
  
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 60px Segoe UI';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 20;
  ctx.fillText('ECG ANALYSIS REPORT', canvas.width/2, 100);
  ctx.font = 'bold 40px Segoe UI';
  ctx.fillText(new Date().toLocaleString('en-IN'), canvas.width/2, 160);
  ctx.shadowBlur = 0;
  
  // Rest of report drawing...
}

console.log('AI Stethoscope Ready! 🎤📁');
