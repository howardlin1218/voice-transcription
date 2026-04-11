require('dotenv').config();
const express = require('express');
const multer = require('multer');
const Groq = require('groq-sdk');

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
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

app.listen(PORT, HOST, () => console.log(`Backend live on port ${PORT}`));