
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
const VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const eleven = process.env.ELEVENLABS_API_KEY
  ? new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })
  : null;

const app = express();

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/lesson', async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim().slice(0, 2000);
  const quick = Boolean(req.body?.quick);
  const image = req.body?.image;

  if (!prompt && !image) {
    return res.status(400).json({ error: 'Savol yoki rasm yuboring.' });
  }

  if (!ai) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY Render Environment sozlamalarida yo‘q.'
    });
  }

  try {
    const parts = [{
      text:
        'Sen Bubble nomli aqlli o‘zbekcha yordamchisan. ' +
        'Savolga sodda, tushunarli va foydali javob ber. ' +
        'Kerak bo‘lsa javobni qisqa, alohida paragraflarga ajrat. ' +
        'Rasm berilgan bo‘lsa, undagi ko‘rinadigan narsalarni tahlil qil. ' +
        'Ko‘rinmaydigan ma’lumotlarni taxmin qilib fakt sifatida aytma.\n\n' +
        'Foydalanuvchi savoli: ' + (prompt || 'Rasmni tahlil qil.')
    }];

    if (image) {
      const mimeType = String(image.mimeType || '');
      const data = String(image.data || '');

      if (
        !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType) ||
        !data ||
        data.length > 10_000_000
      ) {
        return res.status(400).json({
          error: 'Rasm formati yoki hajmi mos emas. JPG, PNG yoki WEBP yuboring.'
        });
      }

      parts.push({
        inlineData: {
          mimeType,
          data: data.replace(/^data:image\/[^;]+;base64,/, '')
        }
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ role: 'user', parts }]
    });

    const text = String(response.text || '').trim();

    if (!text) {
      return res.status(502).json({
        error: 'AI javob qaytarmadi. Qayta urinib ko‘ring.'
      });
    }

    let audio = null;

    if (eleven && !quick) {
      try {
        const stream = await eleven.generate({
          voice: VOICE_ID,
          text,
          model_id: 'eleven_multilingual_v2'
        });

        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk));
        }

        audio =
          'data:audio/mpeg;base64,' +
          Buffer.concat(chunks).toString('base64');
      } catch (error) {
        console.error('Ovoz yaratish xatosi:', error.message);
      }
    }

    return res.json({ text, audio });
  } catch (error) {
    console.error('AI xatosi:', error);
    return res.status(500).json({
      error: 'AI bilan bog‘lanishda xato. Render loglarini tekshiring.'
    });
  }
});

app.listen(PORT, () => {
  console.log('Bubble AI server ishga tushdi. Port:', PORT);
});
