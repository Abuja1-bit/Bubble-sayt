
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
  ? new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY
    })
  : null;

const app = express();

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/lesson', async (req, res) => {
  const prompt = String(req.body?.prompt || '')
    .trim()
    .slice(0, 2000);

  const quick = Boolean(req.body?.quick);
  const image = req.body?.image;

  if (!prompt && !image) {
    return res.status(400).json({
      error: 'Savol yoki rasm yuboring.'
    });
  }

  try {
    let text = '';

    // RASM TAHLILI: GEMINI
    if (image) {
      if (!ai) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY Render sozlamalarida yo‘q.'
        });
      }

      const mimeType = String(image.mimeType || '');
      const data = String(image.data || '');

      if (
        ![
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif'
        ].includes(mimeType) ||
        !data ||
        data.length > 10_000_000
      ) {
        return res.status(400).json({
          error: 'Rasm formati yoki hajmi mos emas.'
        });
      }

      const parts = [
        {
          text:
            'Sen Bubble nomli aqlli o‘zbekcha yordamchisan. ' +
            'Rasmni diqqat bilan tahlil qil va foydalanuvchiga ' +
            'sodda, tushunarli, foydali o‘zbekcha javob ber.\n\n' +
            'Savol: ' + (prompt || 'Ushbu rasmni tahlil qil.')
        },
        {
          inlineData: {
            mimeType,
            data: data.replace(
              /^data:image\/[^;]+;base64,/,
              ''
            )
          }
        }
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [{ role: 'user', parts }]
      });

      text = String(response.text || '').trim();
    } else {
      // MATNLI SAVOLLAR: GROQ
      const groqKey = process.env.GROQ_API_KEY;

      if (!groqKey) {
        return res.status(500).json({
          error: 'GROQ_API_KEY Render Environment sozlamalarida yo‘q.'
        });
      }

      const groqResponse = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            messages: [
              {
                role: 'system',
                content:
                  'Sen Bubble nomli aqlli o‘zbekcha yordamchisan. ' +
                  'O‘zbek tilida sodda, aniq va foydali javob ber. ' +
                  'Javoblarni tushunarli paragraflarga ajrat.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 1200
          })
        }
      );

      if (!groqResponse.ok) {
        const detail = await groqResponse.text();

        console.error(
          'Groq xatosi:',
          groqResponse.status,
          detail
        );

        return res.status(502).json({
          error:
            'Groq AI javob bera olmadi. Render Logs bo‘limini tekshiring.'
        });
      }

      const result = await groqResponse.json();

      text =
        result.choices?.[0]?.message?.content?.trim() || '';
    }

    if (!text) {
      return res.status(502).json({
        error: 'AI javob qaytarmadi. Qayta urinib ko‘ring.'
      });
    }

    // OVOZ: ELEVENLABS
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
        console.error(
          'Ovoz yaratish xatosi:',
          error.message
        );
      }
    }

    return res.json({ text, audio });
  } catch (error) {
    console.error('AI xatosi:', error);

    return res.status(500).json({
      error:
        'AI bilan bog‘lanishda xato. Render Logs bo‘limini tekshiring.'
    });
  }
});

app.listen(PORT, () => {
  console.log(
    'Bubble AI server ishga tushdi. Port:',
    PORT
  );
});
