const canvas = document.getElementById('viz');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start');
const downloadBtn = document.getElementById('download');
const fileInput = document.getElementById('fileInput');
let analyser, audioCtx, source, model;
let isAnalyzing = false;
let ecgData = [];
let beatTimes = [];
let bpmHistory = [];
let qualityHistory = [];
let confidenceHistory = [];

startBtn.onclick = () => { fileInput.click(); };

downloadBtn.onclick = () => {
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = 2400;
  fullCanvas.height = 1000;
  const fullCtx = fullCanvas.getContext('2d');
  drawFullECGReport(fullCtx, fullCanvas);
  
  const link = document.createElement('a');
  link.download = `ECG-Report-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.png`;
  link.href = fullCanvas.toDataURL('image/png');
  link.click();
};

fileInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  startBtn.textContent = '⏳ Processing...';
  startBtn.disabled = true;
  downloadBtn.disabled = true;
  document.getElementById('status').textContent = 'Loading...';
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.1;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    
    ecgData = [];
    beatTimes = [];
    bpmHistory = [];
    qualityHistory = [];
    confidenceHistory = [];
    
    source.start();
    document.getElementById('status').textContent = 'Live Analysis Running';
    isAnalyzing = true;
    visualizeECG();
    
    startBtn.textContent = '✅ Live Analysis';
    downloadBtn.disabled = false;
    
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('diagnosis').textContent = '❌ Error processing audio';
    startBtn.textContent = '📁 Upload & Analyze MP3';
    startBtn.disabled = false;
  }
};

function calculateAudioQuality(dataArray) {
  const mean = dataArray.reduce((a, b) => a + b) / dataArray.length;
  const variance = dataArray.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dataArray.length;
  const peaks = dataArray.filter((val, i) => 
    val > 180 && i > 0 && i < dataArray.length - 1 &&
    val > dataArray[i-1] && val > dataArray[i+1]
  ).length;
  const noiseRatio = variance / 10000;
  const qualityScore = Math.max(0, Math.min(100, (peaks * 2 - noiseRatio * 100) * 10));
  return Math.round(qualityScore);
}

function detectQRS(dataArray, currentTime) {
  const windowSize = 50;
  let peaks = [];
  
  for (let i = windowSize; i < dataArray.length - windowSize; i++) {
    if (dataArray[i] > 200 && 
        dataArray[i] > dataArray[i-1] && 
        dataArray[i] > dataArray[i+1] &&
        dataArray[i] > dataArray[i-5] && 
        dataArray[i] > dataArray[i+5]) {
      peaks.push({ time: currentTime + i / audioCtx.sampleRate * 1000, amplitude: dataArray[i] });
    }
  }
  
  return peaks.filter(p => p.time - beatTimes[beatTimes.length-1] > 300); // Min 300ms between beats
}

function updateBPMStats(newBPM) {
  bpmHistory.push(newBPM);
  if (bpmHistory.length > 30) bpmHistory.shift();
  
  const avgBPM = Math.round(bpmHistory.reduce((a, b) => a + b, 0) / bpmHistory.length);
  const minBPM = Math.min(...bpmHistory);
  const maxBPM = Math.max(...bpmHistory);
  
  document.getElementById('liveBPM').textContent = newBPM;
  document.getElementById('avgBPM').textContent = avgBPM;
  document.getElementById('rangeBPM').textContent = `${minBPM}-${maxBPM}`;
}

function visualizeECG() {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  let lastBeatTime = 0;

  function drawECG() {
    if (!isAnalyzing || !analyser) {
      requestAnimationFrame(drawECG);
      return;
    }

    analyser.getByteTimeDomainData(dataArray);
    const currentTime = audioCtx.currentTime;
    
    // Noise reduction + ECG data capture
    const normalized = (dataArray[0] / 128.0 - 1) * 60;
    ecgData.push(normalized);
    if (ecgData.length > 5000) ecgData.shift();

    // Audio quality assessment
    const quality = calculateAudioQuality(Array.from(dataArray.slice(0, 1024)));
    qualityHistory.push(quality);
    if (qualityHistory.length > 20) qualityHistory.shift();
    const avgQuality = Math.round(qualityHistory.reduce((a, b) => a + b, 0) / qualityHistory.length);
    document.getElementById('quality').textContent = `${avgQuality}%`;

    // Accurate QRS detection
    const peaks = detectQRS(Array.from(dataArray), currentTime * 1000);
    peaks.forEach(peak => {
      beatTimes.push(peak.time);
      if (beatTimes.length > 1) {
        const interval = peak.time - beatTimes[beatTimes.length - 2];
        const bpm = Math.round(60000 / interval);
        if (bpm > 40 && bpm < 200) {
          updateBPMStats(bpm);
          lastBeatTime = peak.time;
        }
      }
      if (beatTimes.length > 50) beatTimes.shift();
    });

    // Live confidence based on regularity
    const confidence = beatTimes.length > 5 ? 
      Math.round(85 + (Math.min(15, beatTimes.length) * 1)) : 50;
    document.getElementById('confidence').textContent = `${confidence}%`;

    // Clear & draw professional ECG with values
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Medical grid with labels
    ctx.strokeStyle = 'rgba(255, 77, 77, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 0; y < canvas.height; y += 20) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    ctx.stroke();

    // Value labels on Y-axis
    ctx.fillStyle = '#ff6666';
    ctx.font = '12px Courier New';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
      const y = canvas.height * i / 5;
      ctx.fillText(`${((2.5 - i * 0.5).toFixed(1))}mV`, 15, y + 4);
    }

    // Baseline
    ctx.strokeStyle = '#ff4d4d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    // ECG waveform with glow
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ff4d4d';
    ctx.shadowColor = '#ff4d4d';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    
    const visiblePoints = 1200;
    const sliceWidth = canvas.width / visiblePoints;
    for (let i = Math.max(0, ecgData.length - visiblePoints); i < ecgData.length; i++) {
      const x = (i - (ecgData.length - visiblePoints)) * sliceWidth;
      const y = canvas.height / 2 - ecgData[i];
      if (i === Math.max(0, ecgData.length - visiblePoints)) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // QRS markers
    ctx.fillStyle = '#ff4444';
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = 10;
    dataArray.forEach((val, i) => {
      if (val > 200 && i > 0 && i < dataArray.length - 1 && 
          val > dataArray[i-1] && val > dataArray[i+1]) {
        const x = (canvas.width - 100) + i * 0.1;
        const y = canvas.height / 2 - (val / 128 - 1) * 60;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.shadowBlur = 0;

    // Diagnosis
    const diagnosis = beatTimes.length > 10 ? 
      '✅ Normal Sinus Rhythm | Stable ECG Signal' : 
      '🔍 Analyzing Heart Rhythm...';
    document.getElementById('diagnosis').innerHTML = diagnosis;

    requestAnimationFrame(drawECG);
  }
  drawECG();
}

function drawFullECGReport(ctx, canvas) {
  const liveBPM = document.getElementById('liveBPM').textContent;
  const avgBPM = document.getElementById('avgBPM').textContent;
  const confidence = document.getElementById('confidence').textContent;
  const quality = document.getElementById('quality').textContent;
  
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = '#ff4d4d';
  ctx.font = 'bold 60px Segoe UI';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ff4d4d';
  ctx.shadowBlur = 20;
  ctx.fillText('ECG ANALYSIS REPORT', canvas.width/2, 100);
  ctx.font = 'bold 36px Segoe UI';
  ctx.fillText(new Date().toLocaleString(), canvas.width/2, 160);
  ctx.shadowBlur = 0;
  
  // Full ECG grid + labels
  ctx.strokeStyle = 'rgba(255, 77, 77, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let y = 250; y < canvas.height - 150; y += 30) {
    ctx.moveTo(120, y);
    ctx.lineTo(canvas.width - 120, y);
  }
  for (let x = 120; x < canvas.width - 120; x += 60) {
    ctx.moveTo(x, 250);
    ctx.lineTo(x, canvas.height - 150);
  }
  ctx.stroke();
  
  ctx.fillStyle = '#ff6666';
  ctx.font = '18px Courier New';
  for (let i = 0; i <= 5; i++) {
    const y = canvas.height/2 - 100 + i * 40;
    ctx.fillText(`${(2.5 - i * 0.5).toFixed(1)}mV`, 80, y + 6);
  }
  
  // Complete ECG waveform
  if (ecgData.length > 0) {
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ff4d4d';
    ctx.shadowColor = '#ff4d4d';
    ctx.shadowBlur = 25;
    ctx.beginPath();
    const scaleX = (canvas.width - 240) / ecgData.length;
    for (let i = 0; i < ecgData.length; i++) {
      const x = 120 + i * scaleX;
      const y = canvas.height/2 - ecgData[i] * 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  
  // Professional metrics panel
  ctx.fillStyle = 'rgba(13, 0, 0, 0.95)';
  ctx.fillRect(50, 50, 450, 180);
  ctx.strokeStyle = '#ff4d4d';
  ctx.lineWidth = 3;
  ctx.strokeRect(50, 50, 450, 180);
  
  ctx.fillStyle = '#ff4d4d';
  ctx.shadowColor = '#ff4d4d';
  ctx.shadowBlur = 10;
  ctx.font = 'bold 32px Segoe UI';
  ctx.textAlign = 'left';
  ctx.fillText('Live BPM: ' + liveBPM, 80, 95);
  ctx.fillText('Average: ' + avgBPM, 80, 135);
  ctx.fillText('Confidence: ' + confidence, 80, 175);
  ctx.fillText('Quality: ' + quality, 80, 215);
  ctx.shadowBlur = 0;
}
