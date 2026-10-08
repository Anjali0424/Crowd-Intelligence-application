# Temple Civic Intelligence - Backend

## Requirements
- Python 3.9+
- pip

## Install dependencies
```bash
cd backend
pip install -r requirements.txt
```

## Configure
- Copy `.env.example` to `.env` and adjust values
- Place a test video at `backend/videos/crowd.mp4` (or set `CROWD_VIDEO_PATH`)
- To use webcam: set `CROWD_VIDEO_PATH=0` in `.env` (or export)

## Run FastAPI
```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Test endpoints
- `GET http://localhost:8000/api/health` → `{"status":"ok"}`
- `GET http://localhost:8000/api/crowd/live` → live crowd JSON

## Frontend
```bash
cd frontend
npm install
npm run dev
```

VITE_API_BASE defaults to `http://localhost:8000`.
