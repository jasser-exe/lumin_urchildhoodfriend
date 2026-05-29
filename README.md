# LUMIN

LUMIN is an educational chatbot web app for caregivers and children. It combines a React + Vite frontend with a Python backend to deliver guided stories, emotion tracking, and audio interactions.

**Tech stack:** React, Vite, Tailwind CSS, Python (backend), Supabase (optional)

## Features
- Guided storytelling engine
- Emotion tracking and badges
- Voice/audio playback and recording
- Simple caregiver dashboard and kid-facing UI

## Quick start (development)

Prerequisites
- Node.js 16+ (for frontend)
- Python 3.10+ (for backend)
- Recommended: use a virtual environment for Python (`venv`)

1) Frontend

```bash
# from project root
cd ./
npm install
npm run dev      # starts Vite dev server (frontend)
```

Build for production

```bash
npm run build
npm run preview  # preview production build locally
```

2) Backend (Windows PowerShell example)

```powershell
# create & activate venv
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# install deps and run
pip install -r backend/requirements.txt
python backend/main.py
```

3) Tests

```bash
# run Python tests
pytest backend/test_chat.py
```

## Environment variables
Use `.env` locally (not committed). An example file is provided as `.env.example`.

Typical variables (add as needed):
- `GROQ_API_KEY` — Groq / external API key
- `SUPABASE_URL` — Supabase instance URL
- `SUPABASE_ANON_KEY` — Supabase anon key
- `OPENAI_API_KEY` — OpenAI key (if used)

Never commit real secrets — add them to your environment or use a secrets manager.

## Project layout
- `src/` — React source (components, hooks, pages)
- `backend/` — Python backend (entry: `backend/main.py`)
- `data/` — persisted app data (memories, story states)
- `index.html`, `package.json`, `vite.config.js`, `tailwind.config.js`

## Database / Schema
Supabase schema for caregivers/patients: [backend/supabase_caregiver_patient_schema.sql](backend/supabase_caregiver_patient_schema.sql)

## Security note
A sensitive key was previously committed and has been removed from the repository history. If you cloned the repo before this cleanup, please re-clone to avoid the old history. Also rotate any keys exposed previously — removal from history does not revoke the key.

## Deployment (brief)
- Build the frontend (`npm run build`) and serve the static files from a web server.
- Start the backend with your chosen Python host (or containerize with Docker if desired).

## Contributing
Open an issue to discuss changes, then submit a focused pull request. Please avoid committing secrets and run `npm ci`/`pip install` in fresh environments.

## License
MIT — change if you prefer a different license.

---

If you'd like I can: add a short development checklist for new contributors, add GitHub Actions to run tests on PRs, or create a `docs/` folder with API notes. Tell me which you'd prefer next.
