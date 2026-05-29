# LUMIN

LUMIN is an educational chatbot web app with a React + Vite frontend and a Python backend. It helps caregivers and children interact through guided stories, emotion tracking, and audio features.

**Key tech:** Vite, React, Tailwind CSS, Python, Flask/FastAPI (backend), Supabase (data schema included)

## Quick Start

Prerequisites:
- Node.js (16+)
- Python 3.10+
- Optional: a virtual environment tool (venv)

Frontend

```bash
# install dependencies
npm install

# run development server
npm run dev

# build for production
npm run build

# preview production build
npm run preview
```

Backend

```bash
# create & activate venv (example for Windows PowerShell)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# install Python dependencies
pip install -r backend/requirements.txt

# run backend
python backend/main.py
```

Tests

```bash
# run Python tests (if pytest is installed)
pytest backend/test_chat.py
```

Project layout

- [src/](src/) — React source (components, hooks, pages)
- [index.html](index.html) — app entry
- [package.json](package.json) — frontend scripts & deps
- [backend/main.py](backend/main.py) — Python backend entry
- [backend/requirements.txt](backend/requirements.txt) — backend deps
- [data/](data/) — app data files (memories, story states)

Database / Schema

A Supabase schema for caregiver/patient is available at [backend/supabase_caregiver_patient_schema.sql](backend/supabase_caregiver_patient_schema.sql).

Environment & Secrets

- Keep API keys and secrets out of the repo. Use environment variables or a secrets manager.

Contributing

Contributions are welcome. Open an issue to discuss features or fixes, then submit a pull request with focused changes.

License

This project is licensed under the MIT License — adjust as needed.

