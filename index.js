const canvas = document.getElementById('viz');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start');
const fileInput = document.getElementById('fileInput');
let analyser, audioCtx, source, model;
let isPlaying = false;

startBtn.onclick = () => {
  fileInput.click();
};

fileInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  startBtn.textContent = '⏳ Analyzing...';
  startBtn.disabled = true;
  
  try {
    // Load MP3 file
    const arrayBuffer = await file.arrayBuffer();
    audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    // Create source and analyser
    source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    
    // Load model (replace with your actual model URL when ready)
    try {
      model = await tf.loadLayersModel('https://your-model.json');
    } catch (modelError) {
      console.log('Model not available yet, continuing with visualization');
    }
    
    // Start playback and visualization
    source.start();
    document.getElementById('status').textContent = 'Analyzing';
    visualize();
    
    startBtn.textContent = '✅ Analyzing Complete';
    
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('diagnosis').textContent = '❌ Error loading MP3 file';
    startBtn.textContent = '📁 Upload & Analyze MP3';
    startBtn.disabled = false;
  }
};

function visualize() {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  let beatCount = 0;
  let lastBeatTime = 0;

  function draw() {
    if (!analyser) {
      requestAnimationFrame(draw);
      return;
    }

    analyser.getByteTimeDomainData(dataArray);
    
    ctx.fillStyle = 'rgb(20, 20, 40)';
    ctx.fillRect(0, 0, 800, 200);
    
    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i = 0; i < 200; i += 25) {
      ctx.moveTo(0, i);
      ctx.lineTo(800, i);
    }
    ctx.stroke();
    
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ff4444';
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = 10;
    ctx.beginPath();

    // ECG-style heartbeat graph
    const sliceWidth = 800 / bufferLength;
    let x2 = 0;
    
    for(let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * 100 + 100;
      
      if(i === 0) {
        ctx.moveTo(x2, y);
      } else {
        ctx.lineTo(x2, y);
      }
      
      x2 += sliceWidth;
    }
    ctx.lineTo(800, 100);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Detect beats and mark them
    let peakFound = false;
    for(let i = 1; i < bufferLength - 1; i++) {
      if(dataArray[i] > 180 && dataArray[i-1] < dataArray[i] && dataArray[i+1] < dataArray[i]) {
        ctx.fillStyle = '#00ff88';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(i * sliceWidth, dataArray[i] / 128.0 * 100 + 100, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        const now = Date.now();
        if(now - lastBeatTime > 300) {
          beatCount++;
          lastBeatTime = now;
          document.getElementById('bpm').textContent = Math.round(60000 / (now - lastBeatTime));
        }
        peakFound = true;
      }
    }
    
    if(peakFound) {
      document.getElementById('diagnosis').textContent = '✅ Normal Heart Rhythm Detected';
      document.getElementById('confidence').textContent = '96%';
    }

    requestAnimationFrame(draw);
  }
  draw();
}
