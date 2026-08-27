# Agency OS — Complete Setup Guide

> **Full-stack client management platform for agencies.**
> This guide covers everything from zero to a fully running application — local development, environment configuration, third-party service setup, and production deployment.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Prerequisites](#2-prerequisites)
3. [Getting the Code](#3-getting-the-code)
4. [Local Development Setup](#4-local-development-setup)
5. [Environment Variables — Complete Reference](#5-environment-variables--complete-reference)
6. [Third-Party Service Setup](#6-third-party-service-setup)
   - 6.1 [MongoDB Atlas (Free Cloud Database)](#61-mongodb-atlas-free-cloud-database)
   - 6.2 [Upstash Redis (Free Cloud Redis)](#62-upstash-redis-free-cloud-redis)
   - 6.3 [File Storage — Cloudflare R2 (Free Tier, Recommended)](#63-file-storage--cloudflare-r2-free-tier-recommended)
   - 6.4 [File Storage — AWS S3 (Alternative)](#64-file-storage--aws-s3-alternative)
   - 6.5 [Email — Gmail SMTP](#65-email--gmail-smtp)
   - 6.6 [Stripe Payments](#66-stripe-payments)
7. [Running with Docker (Recommended)](#7-running-with-docker-recommended)
8. [First-Time Application Setup](#8-first-time-application-setup)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Project Overview

Agency OS is a full-stack web application with two parts:

| Part | Technology | Port |
|------|-----------|------|
| **Backend API** | Node.js + Express + TypeScript + MongoDB + Redis | `5000` |
| **Frontend** | React + TypeScript + Vite + Tailwind CSS | `5173` (dev) / `80` (Docker) |

**What it does:**
- Landing page, registration, and login (email/password + magic links)
- Client & project management with Kanban boards and milestone tracking
- Real-time messaging with Socket.io
- Invoice generation with Stripe payment links and PDF export
- Digital contract signing with hash verification
- File management with versioning and annotations
- Approval workflows
- Team management with role-based access control (RBAC)
- Analytics dashboard with revenue charts
- Automation rules engine
- Email notifications via SMTP

---

## 2. Prerequisites

Install all of the following before proceeding.

### 2.1 Node.js 20+

**Download:** https://nodejs.org/en/download — choose the **LTS** version.

```bash
node --version   # Should print: v20.x.x or higher
npm --version    # Should print: 10.x.x or higher
```

### 2.2 MongoDB 7+

**Option A — MongoDB Atlas (Cloud, Free, Recommended):**
No local installation needed. See Section 6.1.

**Option B — Local MongoDB:**
- Download: https://www.mongodb.com/try/download/community (version 7.0)
- Run the installer with default options (installs as a service)

Verify:
```bash
mongosh --eval "db.runCommand({ connectionStatus: 1 })"
# Should show "ok": 1
```

### 2.3 Redis 7+

**Option A — Upstash Redis (Cloud, Free, Recommended):**
No local installation needed. See Section 6.2.

**Option B — Local Redis:**

*Windows:* Redis has no official Windows build. Use one of:
- **Docker Desktop** (easiest): `docker run -d -p 6379:6379 --name redis redis:7.2-alpine`
- **WSL2**: `sudo apt install redis-server && sudo service redis-server start`
- **Memurai**: https://www.memurai.com

*macOS:*
```bash
brew install redis && brew services start redis
```

*Linux (Ubuntu/Debian):*
```bash
sudo apt install redis-server && sudo systemctl start redis-server
```

Verify:
```bash
redis-cli ping   # Should print: PONG
```

### 2.4 Git

**Download:** https://git-scm.com/downloads

```bash
git --version   # Should print: git version 2.x.x
```

### 2.5 Docker Desktop (Optional — for one-command startup)

**Download:** https://www.docker.com/products/docker-desktop

```bash
docker --version          # Docker version 24.x.x or higher
docker compose version    # Docker Compose version v2.x.x
```

---

## 3. Getting the Code

### If you have the project folder already

The project is at the `agency-os/` folder. Skip to Section 4.

### If sharing with another developer

Push to a private GitHub/GitLab repository:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/agency-os.git
git push -u origin main
```

The other developer clones it:
```bash
git clone https://github.com/YOUR_USERNAME/agency-os.git
```

> **Never commit `.env` files to Git.** Share `.env` values separately via a password manager or encrypted message.

---

## 4. Local Development Setup

### What You Actually Need to Run the App

Here is the honest breakdown of what is required vs optional:

| Service | Required? | Without it |
|---------|-----------|-----------|
| **MongoDB** | ✅ YES — must be running | Server won't start |
| **Redis** | ❌ NO — optional | Server starts fine. Auth works. No token caching, no rate limiting persistence, no magic links, no real-time queues |
| **SMTP email** | ❌ NO — optional | Server starts fine. Registration/login work. Magic links and invite emails silently fail (logged to console) |
| **S3 / R2 storage** | ❌ NO — optional | Server starts fine. File uploads will fail with a storage error |
| **Stripe** | ❌ NO — optional | Server starts fine. Payment link generation fails. All other invoice features work |

**Minimum to get the app fully working:**
1. MongoDB running (local or Atlas free tier)
2. Valid JWT secrets in `.env`
3. That's it — register, login, projects, tasks, invoices, contracts, approvals all work

### 4.1 Backend Setup

```bash
cd agency-os/backend
npm install
cp .env.example .env
```

Open `backend/.env` and fill in the minimum required values:

```env
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173

MONGODB_URI=mongodb://localhost:27017/agency-os
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=<generate-below>
JWT_REFRESH_SECRET=<generate-below>

EMAIL_FROM=noreply@youragency.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-gmail-app-password

AGENCY_NAME=Your Agency Name
MAGIC_LINK_BASE_URL=http://localhost:5173/auth/magic
```

**Generate JWT secrets** (run twice, use different values for each):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Start the backend:
```bash
npm run dev
```

Expected output:
```
✅ MongoDB connected successfully
✅ Redis connected
🚀 Agency OS API running on port 5000 [development]
📡 API: http://localhost:5000/api/v1
❤️  Health: http://localhost:5000/health
```

Verify: open http://localhost:5000/health — should return `{"status":"ok"}`.

### 4.2 Frontend Setup

Open a **new terminal**:

```bash
cd agency-os/frontend
npm install
```

The `frontend/.env` already has correct defaults:
```env
VITE_API_URL=http://localhost:5000/api/v1
VITE_APP_NAME=Agency OS
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
```

Start the frontend:
```bash
npm run dev
```

Expected output:
```
  VITE v5.0.11  ready in 800ms
  ➜  Local:   http://localhost:5173/
```

Open **http://localhost:5173** — you will see the Agency OS landing page.

### 4.3 Running Services Summary

| Service | Command | URL |
|---------|---------|-----|
| MongoDB | Local service or Atlas | `mongodb://localhost:27017` |
| Redis | Local service or Upstash | `redis://localhost:6379` |
| Backend | `npm run dev` in `backend/` | http://localhost:5000 |
| Frontend | `npm run dev` in `frontend/` | http://localhost:5173 |

---

## 5. Environment Variables — Complete Reference

### 5.1 Backend `.env`

#### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development`, `production`, or `test` |
| `PORT` | `5000` | Backend API port |
| `API_VERSION` | `v1` | API prefix — routes served at `/api/v1/...` |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend URL for CORS and email links |

#### Database

| Variable | Example | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb://localhost:27017/agency-os` | MongoDB connection string |
| `MONGODB_URI_TEST` | `mongodb://localhost:27017/agency-os-test` | Used only during `npm test` |

#### Redis

| Variable | Example | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |

#### JWT

| Variable | Description |
|----------|-------------|
| `JWT_ACCESS_SECRET` | Min 32 chars. Signs 15-minute access tokens. **Never share.** |
| `JWT_REFRESH_SECRET` | Min 32 chars. Different from access secret. Signs 7-day refresh tokens. |
| `JWT_ACCESS_EXPIRY` | `15m` — access token lifetime |
| `JWT_REFRESH_EXPIRY` | `7d` — refresh token lifetime |

#### File Storage (configure ONE of these)

**Cloudflare R2 (recommended — free tier, no egress fees):**

| Variable | Description |
|----------|-------------|
| `R2_ENDPOINT` | `https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret key |
| `R2_BUCKET` | Your R2 bucket name |

**AWS S3 (alternative):**

| Variable | Description |
|----------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |
| `AWS_REGION` | e.g. `us-east-1` |
| `AWS_S3_BUCKET` | S3 bucket name |

#### Email (SMTP)

| Variable | Example | Description |
|----------|---------|-------------|
| `EMAIL_FROM` | `noreply@youragency.com` | Sender address |
| `EMAIL_FROM_NAME` | `Agency OS` | Sender display name |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port (587 for TLS, 465 for SSL) |
| `SMTP_USER` | `you@gmail.com` | SMTP username |
| `SMTP_PASS` | `abcdefghijklmnop` | SMTP password or app password |

#### Stripe (optional — for payment links)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | `sk_test_...` from Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from Stripe webhook settings |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_...` (also set in frontend `.env`) |

#### App Identity

| Variable | Example | Description |
|----------|---------|-------------|
| `AGENCY_NAME` | `Acme Agency` | Appears in emails and UI |
| `AGENCY_EMAIL` | `hello@acme.com` | Agency contact email |
| `MAGIC_LINK_BASE_URL` | `http://localhost:5173/auth/magic` | Base URL for magic link emails |
| `ENCRYPTION_KEY` | 32-char string | Used for encrypting sensitive data |
| `SESSION_SECRET` | Any random string | Session signing secret |
| `COOKIE_DOMAIN` | `localhost` | Cookie domain (`localhost` for dev) |

### 5.2 Frontend `.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:5000/api/v1` | Backend API URL (used in production builds) |
| `VITE_APP_NAME` | `Agency OS` | App name shown in browser tab |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_placeholder` | Stripe publishable key |

---

## 6. Third-Party Service Setup

### 6.1 MongoDB Atlas (Free Cloud Database)

MongoDB Atlas provides a free M0 cluster (512MB storage, shared) — sufficient for development and small production workloads.

1. Go to https://www.mongodb.com/atlas and create a free account
2. Click **Build a Database** → choose **Free** (M0 tier)
3. Choose any cloud provider and region
4. Set a **username** and **password** — save these
5. Under **Network Access** → **Add IP Address** → **Allow Access from Anywhere** (`0.0.0.0/0`) for development
6. Once the cluster is ready, click **Connect** → **Drivers**
7. Copy the connection string:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
8. Add the database name before the `?`:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/agency-os?retryWrites=true&w=majority
   ```
9. Set this as `MONGODB_URI` in `backend/.env`

### 6.2 Upstash Redis (Free Cloud Redis)

Upstash offers a free serverless Redis instance (10,000 commands/day free).

1. Go to https://upstash.com and create a free account
2. Click **Create Database**
3. Name it `agency-os`, choose a region, select **Free** tier
4. After creation, go to the database details page
5. Under **Redis Connect**, copy the **REDIS_URL** — it looks like:
   ```
   rediss://default:your-password@your-host.upstash.io:6379
   ```
6. Set this as `REDIS_URL` in `backend/.env`

### 6.3 File Storage — Cloudflare R2 (Free Tier, Recommended)

Cloudflare R2 is the **recommended** file storage option because:
- **10 GB free storage** per month
- **Zero egress fees** (no charge for downloads — unlike AWS S3)
- S3-compatible API (same code works for both)
- Global CDN included

**Step-by-step setup:**

1. Go to https://dash.cloudflare.com and create a free account (no credit card required for R2 free tier)

2. In the left sidebar, click **R2 Object Storage**

3. Click **Create bucket**
   - Name: `agency-os-files` (or any name you prefer)
   - Location: choose the region closest to your users
   - Click **Create bucket**

4. Go back to **R2 Object Storage** overview page

5. Click **Manage R2 API Tokens** (top right of the R2 page)

6. Click **Create API Token**
   - Token name: `agency-os`
   - Permissions: **Object Read & Write**
   - Specify bucket: select your `agency-os-files` bucket
   - Click **Create API Token**

7. **Copy these values immediately** (they are only shown once):
   - **Access Key ID** → this is `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → this is `R2_SECRET_ACCESS_KEY`

8. Find your **Account ID**:
   - Go to the Cloudflare dashboard home
   - Your Account ID is shown in the right sidebar under "Account ID"
   - The endpoint is: `https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com`

9. Add to `backend/.env`:
   ```env
   R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
   R2_ACCESS_KEY_ID=your-access-key-id
   R2_SECRET_ACCESS_KEY=your-secret-access-key
   R2_BUCKET=agency-os-files
   ```

**Optional — Enable public access for file previews:**

By default, all files are private and served via signed URLs (secure). If you want a public CDN URL for faster previews:

1. In your R2 bucket settings, click **Settings** tab
2. Under **Public access**, click **Allow Access**
3. You'll get a public URL like `https://pub-xxxx.r2.dev`
4. Add to `backend/.env`: `CDN_URL=https://pub-xxxx.r2.dev`

**Free tier limits:**
- 10 GB storage/month
- 1 million Class A operations (writes)/month
- 10 million Class B operations (reads)/month
- Zero egress fees

This is more than sufficient for most agencies. Paid tier starts at $0.015/GB beyond the free allowance.

### 6.4 File Storage — AWS S3 (Alternative)

Use this if you already have an AWS account or prefer AWS.

1. Sign in to https://aws.amazon.com
2. Go to **IAM** → **Users** → **Create user**
   - Name: `agency-os-s3`
   - Attach policy: **AmazonS3FullAccess**
3. After creating, go to the user → **Security credentials** → **Create access key**
   - Choose **Application running outside AWS**
   - Copy **Access key ID** → `AWS_ACCESS_KEY_ID`
   - Copy **Secret access key** → `AWS_SECRET_ACCESS_KEY`
4. Go to **S3** → **Create bucket**
   - Name: `agency-os-files-yourname` (must be globally unique)
   - Region: choose closest to your users
   - Keep "Block all public access" enabled (files are served via signed URLs)
5. Add to `backend/.env`:
   ```env
   AWS_ACCESS_KEY_ID=your-access-key-id
   AWS_SECRET_ACCESS_KEY=your-secret-access-key
   AWS_REGION=us-east-1
   AWS_S3_BUCKET=agency-os-files-yourname
   ```

**Note:** AWS S3 charges for egress (data transfer out). For a file-heavy agency app, Cloudflare R2 is significantly cheaper.

### 6.5 Email — Gmail SMTP

Gmail requires an **App Password** (not your regular password) for SMTP access.

1. Go to https://myaccount.google.com
2. Click **Security** → **2-Step Verification** → enable it (required for App Passwords)
3. Go back to **Security** → search for **App passwords**
4. Select app: **Mail**, device: **Other** → type `Agency OS`
5. Click **Generate** — Google shows a 16-character password like `abcd efgh ijkl mnop`
6. Copy it **without spaces** into `SMTP_PASS`

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourname@gmail.com
SMTP_PASS=abcdefghijklmnop
```

**For production**, use a transactional email service:
- **Resend** (https://resend.com) — 3,000 emails/month free
- **SendGrid** (https://sendgrid.com) — 100 emails/day free
- **Mailgun** (https://mailgun.com) — 1,000 emails/month free

### 6.6 Stripe Payments

Stripe is used for invoice payment links. All other invoice features (create, send, track) work without Stripe.

1. Go to https://stripe.com and create a free account
2. Make sure you are in **Test mode** (toggle in the top-left)
3. Go to **Developers** → **API keys**
4. Copy **Publishable key** (`pk_test_...`) → `STRIPE_PUBLISHABLE_KEY` and `VITE_STRIPE_PUBLISHABLE_KEY`
5. Click **Reveal test key** next to **Secret key** (`sk_test_...`) → `STRIPE_SECRET_KEY`
6. For webhooks: **Developers** → **Webhooks** → **Add endpoint**
   - URL: `https://your-backend-url/api/v1/invoices/webhooks/stripe`
   - Events: `checkout.session.completed`, `payment_intent.succeeded`
   - After creating, click the webhook → **Signing secret** → `STRIPE_WEBHOOK_SECRET`

For local webhook testing:
```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe listen --forward-to localhost:5000/api/v1/invoices/webhooks/stripe
```

---

## 7. Running with Docker (Recommended)

Docker runs the entire stack (backend, frontend, MongoDB, Redis) with one command.

### Prerequisites
- Docker Desktop installed and running

### Start everything

```bash
# From the agency-os/ root folder
docker compose up --build
```

This starts:
- MongoDB on port `27017`
- Redis on port `6379`
- Backend API on port `5000`
- Frontend on port `80`

Open http://localhost in your browser.

### Stop everything

```bash
docker compose down
```

### Stop and remove all data

```bash
docker compose down -v
```

### Environment variables with Docker

Create `backend/.env` before running Docker. The `docker-compose.yml` reads from it automatically.

---

## 8. First-Time Application Setup

### 8.1 Create the first admin user

The application has no default admin account. You need to create one via the registration page.

1. Open http://localhost:5173 (or http://localhost for Docker)
2. Click **Get started** on the landing page
3. Fill in your name, email, and password
4. You will be logged in as a `CLIENT` role by default

**Promote to ADMIN via MongoDB:**

Connect to MongoDB and run:
```javascript
// Using mongosh
use agency-os
db.users.updateOne(
  { email: "your-email@example.com" },
  { $set: { role: "SUPERADMIN" } }
)
```

Or using MongoDB Compass:
1. Open MongoDB Compass → connect to `mongodb://localhost:27017`
2. Open `agency-os` database → `users` collection
3. Find your user → edit → change `role` to `SUPERADMIN`

### 8.2 Application flow

Once you have an admin account:

1. **Create a client**: Admin panel → Clients → Add Client
2. **Send invitation**: The client receives an email with a magic link to set up their portal access
3. **Create a project**: Projects → New Project → assign to the client
4. **Add team members**: Admin panel → Team → Invite Member
5. **Create an invoice**: Invoices → New Invoice → assign to client/project
6. **Send for signing**: Contracts → New Contract → Send for Signing

### 8.3 Test accounts (development only)

For quick testing without email setup, you can create users directly in MongoDB:

```javascript
// In mongosh — creates a test admin with password "password123"
use agency-os
db.users.insertOne({
  email: "admin@test.com",
  name: "Test Admin",
  role: "SUPERADMIN",
  isActive: true,
  devices: [],
  notificationPrefs: { email: { immediate: true, digest: "none" }, inApp: true, push: false },
  createdAt: new Date(),
  updatedAt: new Date()
})
```

Then use the **Forgot Password** flow to set a password, or use the magic link flow.

---

## 9. Troubleshooting

### Backend won't start

**"MongoDB connection failed"**
- Verify MongoDB is running: `mongosh --eval "db.runCommand({ connectionStatus: 1 })"`
- Check `MONGODB_URI` in `backend/.env` — no typos, correct password
- For Atlas: check Network Access allows your IP

**"Redis connection failed"**
- Verify Redis is running: `redis-cli ping` (should return `PONG`)
- Check `REDIS_URL` in `backend/.env`
- For Upstash: use `rediss://` (with double s) for TLS connections

**"JWT access secret must be at least 32 chars"**
- Generate a proper secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Paste the output into `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (use different values for each)

**"Invalid environment variables"**
- The backend validates all env vars on startup using Zod
- Read the error output carefully — it lists exactly which variables are missing or invalid

### Frontend won't start

**"Cannot find module" errors**
- Run `npm install` in the `frontend/` folder
- Delete `node_modules/` and run `npm install` again

**Blank page or routing issues**
- Open browser DevTools (F12) → Console tab — check for errors
- Verify the backend is running at http://localhost:5000/health
- Check `VITE_API_URL` in `frontend/.env` matches the backend port

### Login/Register not working

**"Network Error" or CORS error**
- Verify backend is running: http://localhost:5000/health
- Check `FRONTEND_URL` in `backend/.env` is `http://localhost:5173`
- Check browser console for the exact error

**Magic link emails not arriving**
- Check `SMTP_*` variables in `backend/.env`
- For Gmail: ensure you're using an App Password, not your regular password
- Check backend logs for email errors
- In development, check the backend terminal — the email content is logged

### File uploads not working

**"Storage quota exceeded" or upload fails**
- Configure Cloudflare R2 or AWS S3 (see Section 6.3 or 6.4)
- Without storage configured, file uploads will fail
- All other features work without file storage

### Port conflicts

If port `5000` or `5173` is already in use:

**Backend port conflict:**
```env
# In backend/.env
PORT=5001
```
Then update `frontend/.env`:
```env
VITE_API_URL=http://localhost:5001/api/v1
```

**Frontend port conflict:**
```typescript
// In frontend/vite.config.ts, change:
server: { port: 5174 }
```

### Docker issues

**"Port already in use"**
```bash
docker compose down
# Then restart
docker compose up --build
```

**"Cannot connect to Docker daemon"**
- Make sure Docker Desktop is running (check system tray)

**Containers start but app doesn't work**
```bash
# View logs
docker compose logs backend
docker compose logs frontend
```
