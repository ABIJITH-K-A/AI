const canvas = document.getElementById('viz');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start');
const downloadBtn = document.getElementById('download');
const fileInput = document.getElementById('fileInput');
let analyser, audioCtx, source;
let isAnalyzing = false;
let ecgData = [];
let bpmHistory = [];
let lastBeatTime = 0; // 🆕 Fixed variable scope
let frameCount = 0;
let audioDuration = 0;
let audioStartTime = 0;
let lastStatsUpdate = 0;
let analysisComplete = false;

startBtn.onclick = () => { fileInput.click(); };

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
  const file = e.target.files[0];
  if (!file) return;

  // Reset all displays to 00
  document.getElementById('liveBPM').textContent = '00';
  document.getElementById('avgBPM').textContent = '00';
  document.getElementById('rangeBPM').textContent = '00';
  document.getElementById('confidence').textContent = '00';

  startBtn.textContent = '⚡ Processing...';
  startBtn.disabled = true;
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
    analyser.fftSize = 512; // 🆕 Reduced for faster processing
    analyser.smoothingTimeConstant = 0.3;
    
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    
    // 🆕 Reset everything
    ecgData = [];
    bpmHistory = [];
    frameCount = 0;
    audioStartTime = Date.now();
    lastStatsUpdate = audioStartTime;
    lastBeatTime = 0;
    analysisComplete = false;
    
    source.start();
    isAnalyzing = true;
    visualizeECG();
    
    startBtn.textContent = '⚡ Live Analysis';
    downloadBtn.disabled = false;
    
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('diagnosis').textContent = '❌ Audio processing failed';
    startBtn.textContent = '📁 Upload & Analyze MP3';
    startBtn.disabled = false;
  }
};

// 🆕 IMPROVED HEARTBEAT DETECTION
const detectHeartbeats = (dataArray) => {
  const peaks = [];
  const threshold = 180; // 🆕 Lower threshold for heart sounds
  
  for (let i = 10; i < dataArray.length - 10; i += 2) {
    if (dataArray[i] > threshold &&
        dataArray[i] > dataArray[i-5] && 
        dataArray[i] > dataArray[i+5] &&
        dataArray[i-2] < threshold - 20 && // Valley before peak
        dataArray[i+2] < threshold - 20) {  // Valley after peak
      peaks.push(i);
    }
  }
  return peaks;
};

// ✅ 1️⃣ LIVE BPM (FIXED)
function updateLiveBPM(bpm) {
  document.getElementById('liveBPM').textContent = bpm;
  bpmHistory.push(bpm);
  if (bpmHistory.length > 30) bpmHistory.shift();
}

// ✅ 2️⃣ AVG/MIN/MAX EVERY 2 SECONDS (REDUCED)
function updateStats() {
  if (bpmHistory.length < 3) return;
  
  const avg = Math.round(bpmHistory.reduce((a,b)=>a+b,0) / bpmHistory.length);
  const minBPM = Math.min(...bpmHistory);
  const maxBPM = Math.max(...bpmHistory);
  
  document.getElementById('avgBPM').textContent = avg;
  document.getElementById('rangeBPM').textContent = `${minBPM}-${maxBPM}`;
}

// ✅ 3️⃣ FINAL CONFIDENCE
function calculateFinalConfidence() {
  if (bpmHistory.length < 5) {
    document.getElementById('confidence').textContent = 'Low';
    return;
  }
  
  const avgBPM = bpmHistory.reduce((a,b)=>a+b,0) / bpmHistory.length;
  const variance = bpmHistory.reduce((sum, bpm) => sum + Math.pow(bpm - avgBPM, 2), 0) / bpmHistory.length;
  const confidence = Math.max(50, Math.min(98, 95 - (variance * 3)));
  
  document.getElementById('confidence').textContent = `${Math.round(confidence)}%`;
}

function visualizeECG() {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function drawFrame() {
    const currentTime = Date.now();
    const elapsed = currentTime - audioStartTime;
    
    // ✅ 4️⃣ END ANALYSIS (REDUCED BUFFER)
    if (elapsed >= audioDuration + 500 && !analysisComplete) {
      isAnalyzing = false;
      analysisComplete = true;
      calculateFinalConfidence();
      document.getElementById('diagnosis').textContent = 
        `✅ Analysis Complete | ${bpmHistory.length} heartbeats | ${Math.round(bpmHistory.reduce((a,b)=>a+b,0)/bpmHistory.length || 0)} BPM avg`;
      startBtn.textContent = '🔄 New Analysis';
      return;
    }

    if (!isAnalyzing || !analyser) {
      requestAnimationFrame(drawFrame);
      return;
    }

    frameCount++;

    // 🆕 EVERY FRAME: FAST ANALYSIS (REDUCED MS)
    analyser.getByteTimeDomainData(dataArray);
    
    // 🆕 ECG WAVEFORM
    const normalized = (dataArray[Math.floor(bufferLength * 0.5)] / 128 - 1) * 40;
    ecgData.push(normalized);
    if (ecgData.length > 2000) ecgData.shift();

    // ✅ 1️⃣ LIVE BPM DETECTION (EVERY FRAME - FIXED)
    const peaks = detectHeartbeats(dataArray);
    if (peaks.length > 0) {
      const currentFrameTime = frameCount * 16.67;
      const interval = currentFrameTime - lastBeatTime;
      
      if (interval > 250 && interval < 1500) { // 40-240 BPM range
        const bpm = Math.round(60000 / interval);
        if (bpm > 40 && bpm < 200) {
          updateLiveBPM(bpm);
          lastBeatTime = currentFrameTime;
        }
      }
    }

    // ✅ 2️⃣ STATS EVERY 2 SECONDS (REDUCED FROM 5s)
    if (currentTime - lastStatsUpdate > 2000) {
      updateStats();
      lastStatsUpdate = currentTime;
    }

    // 🆕 FAST VISUALIZATION
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Grid
    ctx.strokeStyle = 'rgba(255,77,77,0.1)';
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

    // Labels
    ctx.fillStyle = '#ff6666';
    ctx.font = 'bold 12px Courier';
    ctx.textAlign = 'center';
    const labels = ['+2', '+1.5', '+1', '+0.5', '0', '-0.5'];
    for (let i = 0; i < 6; i++) {
      ctx.fillText(labels[i], 30, canvas.height/2 - (i-2.5)*50);
    }

    // Center line
    ctx.strokeStyle = '#ff4d4d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height/2);
    ctx.lineTo(canvas.width, canvas.height/2);
    ctx.stroke();

    // 🆕 ECG WAVEFORM (FAST RENDER)
    if (ecgData.length > 50) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ff4d4d';
      ctx.shadowColor = '#ff4d4d';
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

    // 🆕 PROGRESS DISPLAY
    const progress = Math.min(100, (elapsed / audioDuration * 100)).toFixed(0);
    document.getElementById('diagnosis').textContent = 
      analysisComplete ? '✅ Analysis Complete' :
      `🔍 Live Analysis ${progress}% | ${bpmHistory.length} beats`;

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
  
  ctx.fillStyle = '#ff4d4d';
  ctx.font = 'bold 60px Segoe UI';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ff4d4d';
  ctx.shadowBlur = 20;
  ctx.fillText('ECG ANALYSIS REPORT', canvas.width/2, 100);
  ctx.font = 'bold 40px Segoe UI';
  ctx.fillText(new Date().toLocaleString('en-IN'), canvas.width/2, 160);
  ctx.shadowBlur = 0;
  
  if (ecgData.length > 0) {
    ctx.strokeStyle = '#ff4d4d';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ff4d4d';
    ctx.shadowBlur = 25;
    ctx.beginPath();
    const scaleX = (canvas.width - 300) / ecgData.length;
    for (let i = 0; i < ecgData.length; i++) {
      const x = 150 + i * scaleX;
      const y = canvas.height/2 - ecgData[i] * 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  
  // Stats box
  ctx.fillStyle = 'rgba(13,0,0,0.95)';
  ctx.fillRect(80, 80, 500, 160);
  ctx.strokeStyle = '#ff4d4d';
  ctx.lineWidth = 4;
  ctx.strokeRect(80, 80, 500, 160);
  
  ctx.fillStyle = '#ff4d4d';
  ctx.font = 'bold 32px Segoe UI';
  ctx.textAlign = 'left';
  ctx.shadowBlur = 10;
  ctx.fillText(`Live BPM: ${liveBPM}`, 110, 120);
  ctx.fillText(`Average: ${avgBPM}`, 110, 160);
  ctx.fillText(`Confidence: ${conf}`, 110, 200);
}

console.log('AI Stethoscope Ready! 🚀');
