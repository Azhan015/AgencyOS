# Redis Setup Guide — Local & Production

## Your Situation
- OS: Windows
- Docker Desktop: Installed but not currently running
- Project: Agency OS (needs Redis for token storage, caching, rate limiting)

---

## PART 1 — LOCAL DEVELOPMENT

You have 3 options. Pick ONE.

---

### Option A — Docker Desktop (Recommended, You Already Have It)

**Step 1: Start Docker Desktop**
- Open the Start Menu → search "Docker Desktop" → click it
- Wait for it to fully start (whale icon in system tray turns solid, not animated)
- This takes 30–60 seconds

**Step 2: Run Redis in a container**

Open a terminal (PowerShell or CMD) and run:

```powershell
docker run -d `
  --name agency-os-redis `
  -p 6379:6379 `
  --restart unless-stopped `
  redis:7.2-alpine `
  redis-server --appendonly yes --requirepass ""
```

What each flag does:
- `-d` — runs in background (detached)
- `--name agency-os-redis` — gives it a name so you can find it
- `-p 6379:6379` — maps container port 6379 to your machine port 6379
- `--restart unless-stopped` — auto-restarts when Docker Desktop starts
- `redis:7.2-alpine` — lightweight Redis 7.2 image (~30MB)
- `--appendonly yes` — enables persistence (data survives container restart)
- `--requirepass ""` — no password for local dev

**Step 3: Verify it's running**

```powershell
docker exec -it agency-os-redis redis-cli ping
```

Expected output: `PONG`

**Step 4: Your `.env` value**

```env
REDIS_URL=redis://localhost:6379
```

**Daily workflow:**
- Docker Desktop auto-starts Redis when you boot your PC (because of `--restart unless-stopped`)
- You don't need to do anything — just start Docker Desktop once

**Useful commands:**
```powershell
# Check if running
docker ps --filter "name=agency-os-redis"

# Stop Redis
docker stop agency-os-redis

# Start Redis again
docker start agency-os-redis

# View Redis logs
docker logs agency-os-redis

# Connect to Redis CLI
docker exec -it agency-os-redis redis-cli

# Delete container completely (data is lost)
docker rm -f agency-os-redis
```

---

### Option B — WSL2 (Windows Subsystem for Linux)

Use this if you don't want Docker Desktop running in the background.

**Step 1: Enable WSL2** (if not already done)

Open PowerShell as Administrator:
```powershell
wsl --install
```
Restart your computer when prompted.

**Step 2: Open Ubuntu from Start Menu**

After restart, open "Ubuntu" from the Start Menu. It will finish setup and ask you to create a username/password.

**Step 3: Install Redis inside Ubuntu**

```bash
sudo apt update
sudo apt install redis-server -y
```

**Step 4: Configure Redis**

```bash
sudo nano /etc/redis/redis.conf
```

Find and change these lines:
```
# Change: supervised no
# To:
supervised systemd

# Change: bind 127.0.0.1 -::1
# To:
bind 0.0.0.0
```

Save: `Ctrl+X` → `Y` → `Enter`

**Step 5: Start Redis**

```bash
sudo service redis-server start
```

**Step 6: Verify**

```bash
redis-cli ping
# Expected: PONG
```

**Step 7: Your `.env` value**

```env
REDIS_URL=redis://localhost:6379
```

**Note:** You need to run `sudo service redis-server start` every time you open a new WSL session. To auto-start, add it to `~/.bashrc`:
```bash
echo "sudo service redis-server start > /dev/null 2>&1" >> ~/.bashrc
```

---

### Option C — Memurai (Native Windows Redis, No Docker/WSL needed)

Memurai is a Redis-compatible server that runs natively on Windows.

**Step 1: Download**
- Go to: https://www.memurai.com/get-memurai
- Click "Download Free" — it's free for development
- Run the installer (`.msi` file)

**Step 2: Install**
- Follow the installer — it installs as a Windows Service
- Redis starts automatically on boot

**Step 3: Verify**
- Open Command Prompt
```cmd
memurai-cli ping
```
Expected: `PONG`

Or use the standard redis-cli if you have it:
```cmd
redis-cli -p 6379 ping
```

**Step 4: Your `.env` value**

```env
REDIS_URL=redis://localhost:6379
```

---

## PART 2 — CONNECTING TO THE PROJECT

Once Redis is running locally (any option above), your `backend/.env` should have:

```env
REDIS_URL=redis://localhost:6379
```

This is already set correctly in your `backend/.env`. No changes needed.

**Test the connection:**

Start the backend:
```powershell
cd backend
npm run dev
```

You should see in the logs:
```
✅ Redis connected
```

If Redis is NOT running, you'll see:
```
⚠️  Redis not available — running without cache/sessions.
```

The server still starts and works — Redis is optional for development.

---

## PART 3 — PRODUCTION SETUP

For production, you need a hosted Redis service. Here are the best free options:

---

### Production Option A — Upstash Redis (FREE, Recommended)

Upstash is serverless Redis — pay per request, generous free tier.

**Free tier:** 10,000 commands/day, 256MB storage — enough for most agencies.

**Step 1: Create account**
- Go to: https://upstash.com
- Sign up with GitHub or email (free, no credit card)

**Step 2: Create database**
- Click "Create Database"
- Name: `agency-os-prod`
- Type: **Regional** (not Global — cheaper)
- Region: Choose closest to your server (e.g., `us-east-1` for US, `eu-west-1` for Europe)
- Click "Create"

**Step 3: Get connection string**
- After creation, click on your database
- Go to the **"Details"** tab
- Find **"REDIS_URL"** — it looks like:
  ```
  rediss://default:AbCdEfGhIjKlMnOpQrStUvWxYz@your-host.upstash.io:6379
  ```
  Note: `rediss://` (double s) = TLS encrypted connection

**Step 4: Set in production `.env`**

```env
REDIS_URL=rediss://default:your-password@your-host.upstash.io:6379
```

**Step 5: Verify connection**

You can test from the Upstash dashboard — it has a built-in CLI. Type `PING` and it should return `PONG`.

---

### Production Option B — Redis Cloud (FREE tier available)

Redis Cloud is the official Redis hosting service.

**Free tier:** 30MB storage, 1 database — sufficient for small production.

**Step 1: Create account**
- Go to: https://redis.com/try-free/
- Sign up (free, no credit card for free tier)

**Step 2: Create subscription**
- Click "New Subscription"
- Choose "Free" plan
- Select cloud provider (AWS/GCP/Azure) and region
- Click "Create Subscription"

**Step 3: Create database**
- After subscription is created, click "New Database"
- Name: `agency-os`
- Leave defaults
- Click "Activate"

**Step 4: Get connection details**
- Click on your database
- Find "Public endpoint" — looks like: `redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com:12345`
- Find "Password" — click the eye icon to reveal

**Step 5: Set in production `.env`**

```env
REDIS_URL=redis://:your-password@redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com:12345
```

---

### Production Option C — Self-hosted on VPS (DigitalOcean/AWS/etc.)

If you're deploying on a VPS (Ubuntu server):

**Step 1: Install Redis on your server**

```bash
# SSH into your server
ssh user@your-server-ip

# Install Redis
sudo apt update
sudo apt install redis-server -y

# Configure Redis
sudo nano /etc/redis/redis.conf
```

**Step 2: Secure Redis for production**

In `/etc/redis/redis.conf`, make these changes:

```conf
# Bind to localhost only (backend is on same server)
bind 127.0.0.1

# Set a strong password
requirepass YourStrongPasswordHere123!

# Enable persistence
appendonly yes
appendfsync everysec

# Set max memory (adjust based on your server RAM)
maxmemory 256mb
maxmemory-policy allkeys-lru
```

**Step 3: Start and enable Redis**

```bash
sudo systemctl restart redis-server
sudo systemctl enable redis-server
```

**Step 4: Verify**

```bash
redis-cli -a YourStrongPasswordHere123! ping
# Expected: PONG
```

**Step 5: Set in production `.env`**

```env
REDIS_URL=redis://:YourStrongPasswordHere123!@127.0.0.1:6379
```

---

## PART 4 — QUICK REFERENCE

### Local `.env` (development)
```env
REDIS_URL=redis://localhost:6379
```

### Production `.env` (Upstash — recommended)
```env
REDIS_URL=rediss://default:your-upstash-password@your-host.upstash.io:6379
```

### Production `.env` (Redis Cloud)
```env
REDIS_URL=redis://:your-password@your-redis-host:your-port
```

### Production `.env` (Self-hosted VPS)
```env
REDIS_URL=redis://:YourStrongPassword@127.0.0.1:6379
```

---

## PART 5 — WHAT REDIS IS USED FOR IN THIS PROJECT

| Feature | Uses Redis | Without Redis |
|---------|-----------|---------------|
| Refresh token storage | ✅ | Tokens still work (JWT verified by signature) |
| Session revocation | ✅ | Can't revoke sessions immediately |
| Magic link tokens | ✅ | Magic links don't work |
| Password reset tokens | ✅ | Password reset doesn't work |
| Client invite tokens | ✅ | Invitations don't work |
| User data cache (5 min TTL) | ✅ | DB hit on every request |
| Analytics cache | ✅ | DB hit on every analytics request |
| Rate limiting | ✅ | In-memory fallback (resets on restart) |
| Real-time pub/sub | ✅ | Works on single server instance |

**For development:** Redis is optional. Register, login, projects, tasks, invoices, contracts, approvals all work without it.

**For production:** Redis is strongly recommended. Without it, magic links, password reset, and client invitations don't work.

---

## PART 6 — TROUBLESHOOTING

### "ECONNREFUSED" error
Redis is not running. Start it:
```powershell
# Docker option
docker start agency-os-redis

# WSL option
wsl -e sudo service redis-server start
```

### "WRONGPASS" error
Wrong password in `REDIS_URL`. Check your `.env` file.

### "NOAUTH Authentication required"
Redis has a password set but your URL doesn't include it. Format:
```
redis://:password@host:port
```
Note the colon before the password.

### "Connection timeout" on Upstash
Make sure you're using `rediss://` (double s) not `redis://` — Upstash requires TLS.

### Redis connects but data is lost on restart
Enable persistence. For Docker:
```powershell
docker run -d --name agency-os-redis -p 6379:6379 `
  --restart unless-stopped `
  -v redis_data:/data `
  redis:7.2-alpine `
  redis-server --appendonly yes
```
The `-v redis_data:/data` mounts a volume so data persists.
