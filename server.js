require('dotenv').config();
const express = require('express');
const multer = require('multer');
const Groq = require('groq-sdk');
const cors = require('cors');

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// 1. Middleware
app.use(cors()); // Essential if frontend/backend are on different ports
app.use(express.json());

// Serve frontend static files (index.html, app.js, styles.css, etc.)
app.use(express.static(__dirname));

// 2. Multer Configuration (In-Memory)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB Groq limit
});

// 3. Transcription Endpoint
app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded.' });
    }

    // Convert buffer to a File object for the Groq SDK
    const file = await Groq.toFile(req.file.buffer, req.file.originalname);

    const transcription = await groq.audio.transcriptions.create({
      file: file,
      model: 'whisper-large-v3-turbo', // The high-performance choice
      response_format: 'json',         // Use 'verbose_json' for timestamps
      language: 'en',                  // Optional: improves accuracy
    });

    res.json({ text: transcription.text });
  } catch (error) {
    console.error('Groq API Error:', error);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Backend live on port ${PORT}`));