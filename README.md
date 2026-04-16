# Luko App

Workout app with React frontend, Express API, PostgreSQL, and Cloudflare R2 video hosting.

## Project structure

- `client` - React + Vite frontend
- `server` - Node.js + Express API

## Local run

### 1) Server

```bash
cd server
npm install
npm run migrate
npm run dev
```

### 2) Client

```bash
cd client
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` and API on `http://localhost:4000`.

## Deploy (recommended)

### Frontend - Vercel

1. Import this GitHub repo in Vercel.
2. Set **Root Directory** to `client`.
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add env var:
   - `VITE_API_URL=https://<your-backend-domain>/api`
6. Deploy.

### Backend - Render

1. Create Web Service from this repo.
2. Set **Root Directory** to `server`.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add env vars:
   - `PORT=4000`
   - `DATABASE_URL=<render-postgres-or-external-postgres-url>`
   - `JWT_SECRET=<long-random-secret>`
   - `JWT_EXPIRES_IN=7d`
   - `UPLOAD_DIR=./uploads`
   - `MAX_FILE_SIZE_MB=500`
   - `R2_ACCOUNT_ID=<...>`
   - `R2_BUCKET=<...>`
   - `R2_ENDPOINT=<...>`
   - `R2_PUBLIC_BASE_URL=<...>`
   - `R2_ACCESS_KEY_ID=<...>`
   - `R2_SECRET_ACCESS_KEY=<...>`
   - `R2_KEEP_LOCAL_UPLOADS=false`
6. After first deploy, open Render Shell and run:

```bash
npm run migrate
```

## Notes

- Video URLs are expected to be public R2 URLs in `exercises.video_path`.
- Do not commit `.env` or secret JSON files.
