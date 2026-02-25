# Spend Analyzer — Dead-Simple Install Guide (Windows + macOS)

This guide is for semi-technical users. You do **not** need to install Python or Node.

## 0) Install Docker first (one-time)

Spend Analyzer runs using Docker containers.

- Download Docker Desktop: https://www.docker.com/products/docker-desktop/
- Install it and open Docker Desktop.
- Wait until Docker shows as running.

---

## 1) Get the project files

Use either option:

- **Option A (Git):** clone/download this repo.
- **Option B (ZIP):** download ZIP and extract it.

Open a terminal in the project root (the folder with `docker-compose.yml`).

---

## 2) Configure your Gemini API key

1. Get an API key: https://aistudio.google.com/app/apikey
2. In project root, create `.env` from `.env.example` (or let `start.ps1` / `start.sh` create it for you automatically on first run).
3. Open `.env` and set:

```env
GEMINI_API_KEY=your_real_key_here
```

Without this key, PDF parsing and Ask-Data features will not work.

---

## 3) Start the app (one command)

### Windows (PowerShell)

From the project root:

```powershell
./start.ps1
```

Notes:
- First run builds containers and can take a few minutes.
- If `.env` is missing, the script creates it and asks you to set `GEMINI_API_KEY`, then rerun.

If scripts are blocked once, run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
./start.ps1
```

### macOS (Terminal)

From the project root:

```bash
chmod +x start.sh stop.sh
./start.sh
```

Notes:
- First run builds containers and can take a few minutes.
- If `.env` is missing, the script creates it and asks you to set `GEMINI_API_KEY`, then rerun.

---

## 4) Open the app

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

## 5) Stop the app

### Windows

```powershell
./stop.ps1
```

### macOS

```bash
./stop.sh
```

---

## 6) Update to a newer version

After pulling new code or replacing files, run start again:

### Windows

```powershell
./start.ps1
```

### macOS

```bash
./start.sh
```

This rebuilds containers and keeps your local data in `backend/data`.

---

## 7) Troubleshooting

### Docker command not found
- Install Docker Desktop and restart terminal.

### Docker is installed but not running
- Open Docker Desktop and wait for it to fully start.

### Port already in use (`5173` or `8000`)
- Stop other apps using those ports, then rerun start script.

### API key errors
- Re-check `.env` and ensure `GEMINI_API_KEY` is valid.

### Full reset (advanced)

If you need to rebuild from scratch:

```bash
docker compose down -v
docker compose up -d --build
```

This can delete container-managed volumes (local DB/files may be removed if volumes are cleared).
