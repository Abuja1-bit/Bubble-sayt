import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { ElevenLabsClient } from 'elevenlabs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const eleven = process.env.ELEVENLABS_API_KEY
  ? new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })
  : null;

const app = express();
app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// POST /api/lesson  { prompt } -> { text, audio }
// text: 2-4 steps separated by a blank line. audio: data:audio/mpeg;base64,... (or null)
app.post('/api/lesson', async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim().slice(0, 500);
  const quick = Boolean(req.body?.quick); // quick mode: skip voice generation
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents:
        "Sen Bubble nomli aqlli repetitor-robotchasan. O'quvchining savoliga mantiqiy, " +
        "qadam-baqadam va tushunarli qilib o'zbek tilida javob ber. " +
        "Javob 2 dan 4 gacha qisqa qadamdan iborat bo'lsin, har bir qadam 1-2 gap (150 belgigacha). " +
        "Qadamlarni bo'sh qator bilan ajrat. Markdown, raqam, yulduzcha va ro'yxat belgilarini ishlatma. " +
        "Savol: " + prompt,
    });

    const text = (response.text || '')
      .replace(/[*#`_>]/g, '')
      .replace(/^\s*\d+[.)]\s*/gm, '')
      .trim();

    let audio = null;
    if (eleven && !quick && text) {
      try {
        const stream = await eleven.generate({
          voice: VOICE_ID,
          text,
          model_id: 'eleven_multilingual_v2',
        });
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        audio = 'data:audio/mpeg;base64,' + Buffer.concat(chunks).toString('base64');
      } catch (e) {
        console.error('ElevenLabs error (frontend falls back to browser voice):', e.message);
      }
    }

    res.json({ text, audio });
  } catch (error) {
    console.error('Lesson error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => console.log('Bubble running on http://localhost:' + PORT));
