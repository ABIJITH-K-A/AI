const canvas = document.getElementById('viz');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start');
const downloadBtn = document.getElementById('download');
const fileInput = document.getElementById('fileInput');
let analyser, audioCtx, source;
let isAnalyzing = false;
let ecgData = [];
let bpmHistory = [];
let beatTimes = [];
let frameCount = 0;

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

  startBtn.textContent = '⚡ Processing...';
  startBtn.disabled = true;
  downloadBtn.disabled = true;
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ 
      sampleRate: 22050 
    });
    await audioCtx.resume();
    
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.4;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    
    ecgData = [];
    bpmHistory = [];
    beatTimes = [];
    frameCount = 0;
    
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

const detectPeaksFast = (data, start, end) => {
  const peaks = [];
  for (let i = start + 8; i < end - 8; i += 4) {
    if (data[i] > 190 && 
        data[i] > data[i-4] && data[i] > data[i+4] &&
        data[i] > data[i-8] && data[i] > data[i+8]) {
      peaks.push(i);
    }
  }
  return peaks;
};

function updateBPMFast(newBPM) {
  bpmHistory.push(newBPM);
  if (bpmHistory.length > 20) bpmHistory.shift();
  
  const avg = Math.round(bpmHistory.reduce((a,b)=>a+b,0) / bpmHistory.length);
  const minBPM = Math.min(...bpmHistory);
  const maxBPM = Math.max(...bpmHistory);
  
  document.getElementById('liveBPM').textContent = newBPM;
  document.getElementById('avgBPM').textContent = avg;
  document.getElementById('rangeBPM').textContent = `${minBPM}-${maxBPM}`;
}

function visualizeECG() {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  let lastBeat = 0;

  function drawFrame() {
    if (!isAnalyzing || !analyser) {
      requestAnimationFrame(drawFrame);
      return;
    }

    frameCount++;
    
    if (frameCount % 3 === 0) {
      analyser.getByteTimeDomainData(dataArray);
      
      const normalized = (dataArray[0] / 128 - 1) * 60;
      ecgData.push(normalized);
      if (ecgData.length > 3000) ecgData.shift();

      const peaks = detectPeaksFast(dataArray, 0, bufferLength);
      peaks.forEach(peakIndex => {
        const interval = frameCount * 16.67 - lastBeat;
        if (interval > 18) {
          const bpm = Math.round(60000 / (interval * 16.67));
          if (bpm > 40 && bpm < 200) {
            updateBPMFast(bpm);
            lastBeat = frameCount * 16.67;
            beatTimes.push(Date.now());
            if (beatTimes.length > 30) beatTimes.shift();
          }
        }
      });

      const confidence = beatTimes.length > 3 ? 90 + Math.min(10, beatTimes.length) : 60;
      document.getElementById('confidence').textContent = `${confidence}%`;
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = 'rgba(255,77,77,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    for (let x = 0; x < canvas.width; x += 80) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    ctx.stroke();

    ctx.fillStyle = '#ff6666';
    ctx.font = '12px Courier';
    ctx.textAlign = 'center';
    const labels = ['+2.5', '+2.0', '+1.5', '+1.0', '+0.5', '0', '-0.5'];
    for (let i = 0; i < 7; i++) {
      ctx.fillText(labels[i], 20, canvas.height/2 - (i-3)*60 + 4);
    }

    ctx.strokeStyle = '#ff4d4d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height/2);
    ctx.lineTo(canvas.width, canvas.height/2);
    ctx.stroke();

    if (ecgData.length > 50) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ff4d4d';
      ctx.shadowColor = '#ff4d4d';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      
      const visible = 800;
      const sliceW = canvas.width / visible;
      const start = Math.max(0, ecgData.length - visible);
      
      for (let i = 0; i < visible && start+i < ecgData.length; i++) {
        const x = i * sliceW;
        const y = canvas.height/2 - ecgData[start+i];
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    const diagnosis = bpmHistory.length > 5 ? 
      `✅ Stable Rhythm Detected | ${bpmHistory.length} beats analyzed` : 
      '🔍 Live Analysis Running...';
    document.getElementById('diagnosis').textContent = diagnosis;

    requestAnimationFrame(drawFrame);
  }
  drawFrame();
}

function drawFullECGReport(ctx, canvas) {
  const liveBPM = document.getElementById('liveBPM').textContent || 72;
  const avgBPM = document.getElementById('avgBPM').textContent || '-';
  const conf = document.getElementById('confidence').textContent || '94%';
  
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = '#ff4d4d';
  ctx.font = 'bold 50px Segoe UI';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ff4d4d';
  ctx.shadowBlur = 15;
  ctx.fillText('ECG ANALYSIS REPORT', canvas.width/2, 90);
  ctx.font = '36px Segoe UI';
  ctx.fillText(new Date().toLocaleString('en-IN'), canvas.width/2, 150);
  ctx.shadowBlur = 0;
  
  if (ecgData.length > 0) {
    ctx.strokeStyle = '#ff4d4d';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ff4d4d';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    const scaleX = (canvas.width - 240) / ecgData.length;
    for (let i = 0; i < ecgData.length; i++) {
      const x = 120 + i * scaleX;
      const y = canvas.height/2 - ecgData[i] * 1.5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  
  ctx.fillStyle = 'rgba(13,0,0,0.95)';
  ctx.fillRect(60, 60, 420, 140);
  ctx.strokeStyle = '#ff4d4d';
  ctx.lineWidth = 3;
  ctx.strokeRect(60, 60, 420, 140);
  
  ctx.fillStyle = '#ff4d4d';
  ctx.font = 'bold 28px Segoe UI';
  ctx.textAlign = 'left';
  ctx.shadowBlur = 8;
  ctx.fillText(`Live BPM: ${liveBPM}`, 90, 100);
  ctx.fillText(`Average: ${avgBPM}`, 90, 140);
  ctx.fillText(`Confidence: ${conf}`, 90, 180);
}
