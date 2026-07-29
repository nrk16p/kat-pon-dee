# Deploy

**Frontend → Vercel. Backend → your laptop, exposed through a Cloudflare tunnel.**

One repo, not two. The frontend and backend share a contract — the calibration
sheet's geometry — and a change to it must land on both sides in the same commit.
Two repos would let them drift, and drift there does not crash anything: it just
makes every measurement quietly wrong.

```
AI Smart Fruit Grading/
├── frontend/          → Vercel   (Root Directory = frontend)
├── backend/           → laptop + cloudflared
├── tools/
│   └── check_contract.py   blocking CI check that the sheets agree
└── .github/workflows/ci.yml
```

---

## 1. GitHub

```bash
cd "AI Smart Fruit Grading"
git remote -v          # https://github.com/nrk16p/kat-pon-dee.git
git push origin main
```

Repo: **https://github.com/nrk16p/kat-pon-dee** — one repo, frontend and backend
together (see above for why).

> **On the Vercel author-email rule.** Kontrax-Mo runs on a Hobby account that only
> deploys commits authored by one specific address. **That restriction does not
> apply to this project** — deploys from this repo are building and shipping
> normally. Do not copy that workaround here unless a deploy actually stalls.

Work on `dev`, merge to `main` to release — same as Kontrax-Mo.

**Never commit `backend/data/`.** It holds real orchard photos, and it is the
training set for the segmentation model. Already in `.gitignore`.

---

## 2. Vercel (frontend)

Import the repo, then:

| Setting | Value |
|---|---|
| Root Directory | **`frontend`** |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |

**Environment variable — optional:**

```
VITE_API_URL = https://<your-tunnel>.trycloudflare.com
```

Leave it empty if you like. `VITE_*` is baked in **at build time**, so with a
quick tunnel — whose hostname changes every restart — it would mean a redeploy
per reboot. That is why the app reads the server URL from
**ตั้งค่า → เซิร์ฟเวอร์ประมวลผล** first and falls back to the build value.
Changing servers is a paste, not a deploy.

`vercel.json` already handles the two things a Vite PWA needs on Vercel:
SPA rewrites (so `/home` and `/capture` do not 404 on refresh) and a
`no-cache` header on `sw.js` (so a new build is actually picked up).

---

## 3. Backend on your laptop

```bash
cd backend
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

In a second terminal:

```bash
cloudflared tunnel --url http://localhost:8000
```

Copy the `https://….trycloudflare.com` line, paste it into the app under
**ตั้งค่า → เซิร์ฟเวอร์ประมวลผล**, press **ทดสอบการเชื่อมต่อ**. Green means the
service answered *and* its sheet geometry matches the app's.

`CORS_ORIGINS` defaults to `*`, which is fine while testing. Once the Vercel URL
is stable, pin it:

```bash
CORS_ORIGINS=https://your-app.vercel.app .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Render (paid) — the recommended target

`backend/render.yaml` is a ready blueprint. Dashboard → New → Blueprint → this repo.

Measured on a 12 MP capture of the 500 mm sheet:

| px/mm | peak memory | bias | time |
|---|---|---|---|
| **8.0** (default) | **482 MB** | −0.05 mm | 1.8 s |
| 5.0 | 339 MB | −0.17 mm | 0.76 s |

| Plan | RAM | Verdict |
|---|---|---|
| Free | 512 MB | ❌ 482 MB leaves no headroom, sleeps after 15 min (~50 s cold start), and the disk is wiped |
| Starter $7 | 512 MB | ⚠️ needs `RECT_PX_PER_MM=5`, and half a CPU makes it 2–3× slower than measured |
| **Standard $25** | **2 GB** | ✅ full 8 px/mm accuracy with room to spare |

**The 10 GB disk (~$2.50/mo) is not optional.** Render wipes the container
filesystem on every deploy. Without it, every orchard photo — the training set for
the segmentation model that has to replace the watershed baseline — is destroyed
each time you ship, silently.

Concurrency is capped at one CV job (`MAX_CONCURRENT_JOBS`): two 0.5 GB captures
at once would OOM any small instance, and a request that waits beats a container
that dies.

### Quick tunnel vs named tunnel

A quick tunnel is throwaway: new hostname each restart, and it is **public to
anyone with the link**. Fine for testing. For anything real, a named tunnel gives
a fixed hostname on your own domain and can sit behind Cloudflare Access:

```bash
cloudflared tunnel login
cloudflared tunnel create kpd-api
cloudflared tunnel route dns kpd-api api.yourdomain.com
cloudflared tunnel run --url http://localhost:8000 kpd-api
```

Then `VITE_API_URL` can be set once and left alone.

---

## 4. The contract check

`tools/check_contract.py` fails CI if `backend/app/vision/mats.py` and
`frontend/src/domain/mats.ts` disagree about any sheet — size, marker size,
measurement area or the marker baseline.

Those numbers describe **a piece of paper on a table**. If you change them,
change all three (including `gen_mat.py` in the AI Longan Measure project) and
**reprint the sheet**. An old print with new code measures against geometry that
is not there.

---

## Checklist

- [ ] Vercel Root Directory = `frontend`
- [ ] Backend running, tunnel up, URL pasted into ตั้งค่า, connection test green
- [ ] `backend/data/` not in git
- [ ] Sheet printed at 100%, 100 mm bar checked with a ruler
