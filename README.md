# Bubble · AI Tutor

Express backend (Gemini 2.5 Flash + ElevenLabs) and an infinite-whiteboard frontend.

## Run locally
```bash
npm install
cp .env.example .env     # then add your API keys
npm start                # http://localhost:3000
```

## Deploy
Push to GitHub, then create a **Web Service** on Render / Railway / Fly.io:
- Build command: `npm install`
- Start command: `npm start`
- Environment variables: `GEMINI_API_KEY`, `ELEVENLABS_API_KEY` (optional `ELEVENLABS_VOICE_ID`)

Never commit `.env`. It is already in `.gitignore`.
