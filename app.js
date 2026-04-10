// ============================================
// DOM Elements
// ============================================
const micBtn = document.getElementById('mic-btn');
const micWrapper = document.getElementById('mic-wrapper');
const micIcon = document.getElementById('mic-icon');
const stopIcon = document.getElementById('stop-icon');
const recorderCard = document.getElementById('recorder-card');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const timerEl = document.getElementById('timer');
const waveformEl = document.getElementById('waveform');
const waveformCanvas = document.getElementById('waveform-canvas');
const transcriptCard = document.getElementById('transcript-card');
const transcriptText = document.getElementById('transcript-text');
const wordCount = document.getElementById('word-count');
const charCount = document.getElementById('char-count');
const copyBtn = document.getElementById('copy-btn');
const exportBtn = document.getElementById('export-btn');
const clearBtn = document.getElementById('clear-btn');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toast-text');

// ============================================
// State
// ============================================
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let timerInterval = null;
let audioContext = null;
let analyser = null;
let animationFrameId = null;

// ============================================
// Recording Controls
// ============================================
micBtn.addEventListener('click', async () => {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
});

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Set up MediaRecorder
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: getSupportedMimeType()
        });
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
            handleRecordingComplete(audioBlob);

            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
        };

        // Set up audio visualization
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        mediaRecorder.start();
        isRecording = true;

        // Update UI
        setRecordingState(true);
        startTimer();
        drawWaveform();

    } catch (err) {
        console.error('Microphone access denied:', err);
        setStatus('error', 'Microphone access denied');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }

    isRecording = false;
    setRecordingState(false);
    stopTimer();
    cancelAnimationFrame(animationFrameId);

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
}

function getSupportedMimeType() {
    const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return 'audio/webm';
}

// ============================================
// Handle Recording Complete
// ============================================
async function handleRecordingComplete(audioBlob) {
    setStatus('processing', 'Transcribing audio...');

    try {
        // Determine a suitable file extension from the mime type
        const mimeType = audioBlob.type || 'audio/webm';
        const ext = mimeType.includes('ogg') ? 'ogg'
                  : mimeType.includes('mp4') ? 'mp4'
                  : 'webm';

        const formData = new FormData();
        formData.append('file', audioBlob, `recording.${ext}`);

        const response = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server error (${response.status})`);
        }

        const data = await response.json();
        showTranscript(data.text);
        setStatus('done', 'Transcription complete');

    } catch (error) {
        console.error('Transcription failed:', error);
        setStatus('error', error.message || 'Transcription failed');
        showToast('Transcription failed — check console for details.');
    }
}

// ============================================
// Transcript Display
// ============================================
function showTranscript(text) {
    transcriptText.value = text;
    transcriptCard.classList.remove('hidden');
    updateCounts();

    // Smooth scroll to transcript
    transcriptCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateCounts() {
    const text = transcriptText.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = transcriptText.value.length;

    wordCount.textContent = `${words} word${words !== 1 ? 's' : ''}`;
    charCount.textContent = `${chars} character${chars !== 1 ? 's' : ''}`;
}

transcriptText.addEventListener('input', updateCounts);

// ============================================
// Action Buttons
// ============================================
copyBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(transcriptText.value);
        showToast('Copied to clipboard!');
    } catch {
        // Fallback
        transcriptText.select();
        document.execCommand('copy');
        showToast('Copied to clipboard!');
    }
});

exportBtn.addEventListener('click', () => {
    const text = transcriptText.value;
    if (!text.trim()) return;

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Transcript exported!');
});

clearBtn.addEventListener('click', () => {
    transcriptText.value = '';
    updateCounts();
    // transcriptCard.classList.add('hidden');
    setStatus('ready', 'Ready to record');
});

// ============================================
// UI State Helpers
// ============================================
function setRecordingState(recording) {
    micBtn.classList.toggle('recording', recording);
    micWrapper.classList.toggle('recording', recording);
    recorderCard.classList.toggle('recording', recording);
    micIcon.classList.toggle('hidden', recording);
    stopIcon.classList.toggle('hidden', !recording);
    timerEl.classList.toggle('hidden', !recording);
    waveformEl.classList.toggle('hidden', !recording);

    if (recording) {
        setStatus('recording', 'Recording...');
    } else {
        setStatus('ready', 'Ready to record');
    }
}

function setStatus(state, text) {
    statusDot.className = 'status-dot ' + state;
    statusText.textContent = text;
}

// ============================================
// Timer
// ============================================
function startTimer() {
    recordingStartTime = Date.now();
    timerEl.textContent = '0:00';

    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }, 200);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

// ============================================
// Waveform Visualizer
// ============================================
function drawWaveform() {
    if (!analyser) return;

    const ctx = waveformCanvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const width = waveformCanvas.width;
    const height = waveformCanvas.height;
    const barCount = 40;
    const barWidth = width / barCount - 2;
    const step = Math.floor(bufferLength / barCount);

    function draw() {
        animationFrameId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, width, height);

        for (let i = 0; i < barCount; i++) {
            const value = dataArray[i * step];
            const barHeight = Math.max(2, (value / 255) * height * 0.85);
            const x = i * (barWidth + 2);
            const y = (height - barHeight) / 2;

            // Gradient color per bar
            const hue = 240 + (i / barCount) * 60; // indigo → purple
            const alpha = 0.5 + (value / 255) * 0.5;
            ctx.fillStyle = `hsla(${hue}, 70%, 65%, ${alpha})`;
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 2);
            ctx.fill();
        }
    }

    draw();
}

// ============================================
// Toast
// ============================================
function showToast(message, duration = 2500) {
    toastText.textContent = message;
    toast.classList.remove('hidden');

    // Force reflow for animation
    void toast.offsetWidth;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, duration);
}

// ============================================
// Utility
// ============================================
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// ============================================
// Init
// ============================================
setStatus('ready', 'Ready to record');
