# Agency OS � Setup Guide

> **Agency OS** is a full-stack client management platform for agencies. It includes project management, real-time messaging, invoicing, contracts, approvals, file management, analytics, and team management � all in one unified system.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Prerequisites](#2-prerequisites)
3. [Project Structure](#3-project-structure)
4. [Local Development Setup (Step by Step)](#4-local-development-setup)
   - 4.1 [Clone / Copy the Project](#41-clone--copy-the-project)
   - 4.2 [Install MongoDB](#42-install-mongodb)
   - 4.3 [Install Redis](#43-install-redis)
   - 4.4 [Backend Setup](#44-backend-setup)
   - 4.5 [Frontend Setup](#45-frontend-setup)
   - 4.6 [Run the Application](#46-run-the-application)
5. [Environment Variables � Complete Reference](#5-environment-variables--complete-reference)
   - 5.1 [Backend .env](#51-backend-env)
   - 5.2 [Frontend .env](#52-frontend-env)
   - 5.3 [How to Get Each Value](#53-how-to-get-each-value)
6. [Docker Setup (Recommended for Teams)](#6-docker-setup)
7. [First-Time Application Usage](#7-first-time-application-usage)
8. [Deployment Guide](#8-deployment-guide)
   - 8.1 [Deploy Backend to Railway](#81-deploy-backend-to-railway)
   - 8.2 [Deploy Frontend to Vercel](#82-deploy-frontend-to-vercel)
   - 8.3 [Deploy Everything with Docker on a VPS](#83-deploy-everything-with-docker-on-a-vps)
9. [Sharing the Project with Others](#9-sharing-the-project-with-others)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Project Overview

Agency OS is split into two applications that work together:

| Part | Technology | Purpose |
|------|-----------|---------|
| **Backend** | Node.js + Express + TypeScript | REST API, WebSockets, background jobs |
| **Frontend** | React + TypeScript + Vite | Web application UI |

**Backend features:**
- JWT authentication with refresh token rotation, magic links, Argon2id password hashing
- 15 Mongoose models (User, Client, Project, Task, File, Message, Channel, Invoice, Contract, Approval, Notification, AutomationRule, AuditLog, Brief, ContractTemplate)
- 13 REST API modules with full CRUD
- Socket.io real-time server with Redis adapter
- Bull queue workers for email, PDF generation, and virus scanning
- Scheduled jobs for overdue invoices, reminders, and health scores
- Stripe payment integration and webhook handling
- PDF generation with pdf-lib
- File uploads to AWS S3 or Cloudflare R2

**Frontend features:**
- Full routing with protected and auth routes
- Dashboard with KPI cards and GSAP animations
- Projects with Kanban task board, milestone timeline, files, messages, approvals, invoices
- Real-time messaging with channel sidebar and Socket.io
- Invoices, contracts, approvals, files pages
- Admin: clients, team management, analytics (Recharts), automations
- Settings with theme toggle (dark/light), profile editing, password change
- Command palette (Ctrl+K / Cmd+K), notification panel
- Zustand state management, TanStack Query for data fetching

---

## 2. Prerequisites

Before you begin, you need the following software installed on your machine. Each item includes instructions on how to install it.

### Node.js (version 20 or higher)

Node.js is the JavaScript runtime that runs the backend server and builds the frontend.

**Check if already installed:**
```bash
node --version
```
If you see `v20.x.x` or higher, you are good. If not:

**Windows:** Go to https://nodejs.org, download the "LTS" installer, and run it. Follow the installer steps. After installation, open a new terminal and run `node --version` to confirm.

**macOS:** Install via Homebrew (recommended):
```bash
# Install Homebrew first if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Then install Node.js
brew install node@20
```

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### npm (comes with Node.js)

npm is the package manager for Node.js. It is installed automatically with Node.js.

```bash
npm --version
# Should show 9.x or higher
```

### MongoDB (version 7.0)

MongoDB is the database that stores all application data.

**Windows:**
1. Go to https://www.mongodb.com/try/download/community
2. Select Version 7.0, Platform Windows, Package MSI
3. Download and run the installer
4. During installation, check "Install MongoDB as a Service" � this makes it start automatically
5. Also install "MongoDB Compass" when prompted (it is a GUI tool to view your data)
6. After installation, MongoDB runs automatically as a Windows service

**macOS:**
```bash
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

**Linux (Ubuntu):**
```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

**Verify MongoDB is running:**
```bash
mongosh
# You should see a MongoDB shell prompt. Type exit to leave.
```

### Redis (version 7.2)

Redis is an in-memory data store used for session caching, refresh tokens, and the real-time message queue.

**Windows:** Redis does not have an official Windows build for version 7. Use one of these options:

Option A � Use Docker Desktop (easiest):
1. Install Docker Desktop from https://www.docker.com/products/docker-desktop
2. Run: `docker run -d -p 6379:6379 --name redis redis:7.2-alpine`

Option B � Use WSL2 (Windows Subsystem for Linux):
1. Open PowerShell as Administrator and run: `wsl --install`
2. Restart your computer
3. Open the Ubuntu app from the Start menu
4. Inside Ubuntu, run:
```bash
sudo apt-get update
sudo apt-get install redis-server
sudo service redis-server start
```

**macOS:**
```bash
brew install redis
brew services start redis
```

**Linux (Ubuntu):**
```bash
sudo apt-get install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

**Verify Redis is running:**
```bash
redis-cli ping
# Should respond: PONG
```

### Git (optional, for cloning)

```bash
git --version
```
If not installed: https://git-scm.com/downloads

---

## 3. Project Structure

```
agency-os/
+-- backend/                    # Node.js + Express API
�   +-- src/
�   �   +-- app.ts              # Express app setup, middleware, routes
�   �   +-- server.ts           # HTTP server entry point
�   �   +-- config/
�   �   �   +-- db.ts           # MongoDB connection
�   �   �   +-- env.ts          # Environment variable validation
�   �   �   +-- redis.ts        # Redis connection + cache helpers
�   �   �   +-- storage.ts      # AWS S3 / Cloudflare R2 setup
�   �   +-- lib/
�   �   �   +-- crypto.ts       # Token generation, SHA256 hashing
�   �   �   +-- email.ts        # Nodemailer email sending
�   �   �   +-- errors.ts       # Custom error classes
�   �   �   +-- jwt.ts          # JWT sign/verify helpers
�   �   �   +-- logger.ts       # Pino structured logger
�   �   �   +-- pdf.ts          # PDF generation with pdf-lib
�   �   �   +-- stripe.ts       # Stripe client
�   �   +-- middleware/
�   �   �   +-- authenticate.ts # JWT auth middleware
�   �   �   +-- authorize.ts    # Role-based access control
�   �   �   +-- auditLog.ts     # Audit trail middleware
�   �   �   +-- errorHandler.ts # Global error handler
�   �   �   +-- rateLimiter.ts  # Rate limiting
�   �   �   +-- requestId.ts    # Request ID injection
�   �   �   +-- validate.ts     # Zod request validation
�   �   +-- models/             # 15 Mongoose models
�   �   +-- modules/            # 13 feature modules (routes + services)
�   �   +-- sockets/
�   �   �   +-- socketServer.ts # Socket.io server
�   �   +-- types/
�   �   �   +-- express.d.ts    # Express type extensions
�   �   +-- workers/
�   �       +-- emailWorker.ts  # Bull email queue worker
�   �       +-- invoiceWorker.ts# Bull invoice PDF worker
�   �       +-- scanWorker.ts   # Bull virus scan worker
�   �       +-- scheduledJobs.ts# Cron jobs
�   +-- .env                    # Your environment variables (never commit)
�   +-- .env.example            # Template for environment variables
�   +-- Dockerfile              # Docker build for backend
�   +-- package.json
�   +-- tsconfig.json
�
+-- frontend/                   # React + Vite application
�   +-- src/
�   �   +-- App.tsx             # Root component with all routes
�   �   +-- main.tsx            # React entry point
�   �   +-- index.css           # Tailwind CSS + CSS variables
�   �   +-- components/
�   �   �   +-- layout/         # AppShell, Sidebar, TopBar
�   �   �   +-- modules/        # CommandPalette, Notifications, Projects
�   �   �   +-- ui/             # Button, Input, Card, Dialog, etc.
�   �   +-- hooks/
�   �   �   +-- useAuth.ts      # Auth mutations (login, logout, magic link)
�   �   �   +-- useSocket.ts    # Socket.io connection hook
�   �   �   +-- useNotifications.ts
�   �   +-- lib/
�   �   �   +-- utils.ts        # Utility functions
�   �   +-- pages/
�   �   �   +-- auth/           # LoginPage
�   �   �   +-- dashboard/      # DashboardPage
�   �   �   +-- projects/       # ProjectsPage, ProjectDetailPage
�   �   �   +-- files/          # FilesPage
�   �   �   +-- messages/       # MessagesPage
�   �   �   +-- invoices/       # InvoicesPage, InvoiceDetailPage
�   �   �   +-- contracts/      # ContractsPage, ContractDetailPage
�   �   �   +-- approvals/      # ApprovalsPage
�   �   �   +-- settings/       # SettingsPage
�   �   �   +-- admin/          # ClientsPage, ClientDetailPage,
�   �   �                       # TeamPage, AnalyticsPage, AutomationsPage
�   �   +-- services/
�   �   �   +-- api.ts          # Axios instance with auth interceptors
�   �   +-- stores/
�   �       +-- authStore.ts    # Zustand auth state
�   �       +-- uiStore.ts      # Zustand UI state (theme, sidebar)
�   �       +-- notificationStore.ts
�   +-- .env                    # Frontend environment variables
�   +-- Dockerfile              # Docker build for frontend (nginx)
�   +-- nginx.conf              # Nginx config with API proxy
�   +-- index.html
�   +-- package.json
�
+-- docker-compose.yml          # Runs everything together
```

---

## 4. Local Development Setup

Follow these steps in exact order. Each step is explained in detail.

### 4.1 Clone / Copy the Project

If you received this as a folder, place it anywhere on your computer. For example:
- Windows: `C:\Projects\agency-os`
- macOS/Linux: `~/projects/agency-os`

If you are cloning from a Git repository:
```bash
git clone https://github.com/your-org/agency-os.git
cd agency-os
```

All commands from this point forward assume you are inside the `agency-os/` folder unless stated otherwise.

### 4.2 Install MongoDB

Follow the MongoDB installation instructions in Section 2. Once installed, verify it is running:

```bash
# macOS / Linux
mongosh --eval "db.runCommand({ connectionStatus: 1 })"

# Windows � open Command Prompt and run:
mongosh --eval "db.runCommand({ connectionStatus: 1 })"
```

You should see `"ok" : 1` in the output. If MongoDB is not running:
```bash
# macOS
brew services start mongodb-community@7.0

# Linux
sudo systemctl start mongod

# Windows � open Services (Win+R, type services.msc), find "MongoDB Server", right-click ? Start
```

You do **not** need to create a database manually. MongoDB creates it automatically when the backend first connects.

### 4.3 Install Redis

Follow the Redis installation instructions in Section 2. Verify it is running:

```bash
redis-cli ping
# Expected output: PONG
```

If Redis is not running:
```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis-server

# Windows (Docker)
docker start redis
```

### 4.4 Backend Setup

Open a terminal and navigate to the backend folder:

```bash
# From the agency-os/ root folder:
cd backend
```

**Step 1 � Install dependencies:**
```bash
npm install
```
This downloads all packages listed in `package.json` into a `node_modules/` folder. It takes 1�3 minutes on first run.

**Step 2 � Create your environment file:**
```bash
# Windows (Command Prompt)
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

**Step 3 � Edit the .env file:**

Open `backend/.env` in any text editor (VS Code, Notepad, etc.) and fill in the values. See **Section 5** for a complete explanation of every variable and how to get each value.

At minimum, for local development you must set these:
```env
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173

MONGODB_URI=mongodb://localhost:27017/agency-os
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=any-random-string-at-least-32-characters-long
JWT_REFRESH_SECRET=another-random-string-at-least-32-characters

EMAIL_FROM=noreply@youragency.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-gmail-app-password

AGENCY_NAME=Your Agency Name
MAGIC_LINK_BASE_URL=http://localhost:5173/auth/magic
```

**How to generate secure JWT secrets:**
```bash
# Run this in your terminal to generate a random 64-character secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Run it twice � once for `JWT_ACCESS_SECRET` and once for `JWT_REFRESH_SECRET`. Copy each output into your `.env`.

**Step 4 � Verify the backend starts:**
```bash
npm run dev
```

You should see output like:
```
? MongoDB connected successfully
? Redis connected
?? Agency OS API running on port 5000 [development]
?? API: http://localhost:5000/api/v1
??  Health: http://localhost:5000/health
```

Open your browser and go to `http://localhost:5000/health`. You should see:
```json
{"status":"ok","version":"1.0.0","env":"development"}
```

If you see this, the backend is working correctly. Press `Ctrl+C` to stop it for now.

### 4.5 Frontend Setup

Open a **new terminal** (keep the backend terminal available) and navigate to the frontend folder:

```bash
# From the agency-os/ root folder:
cd frontend
```

**Step 1 � Install dependencies:**
```bash
npm install
```

**Step 2 � Verify the .env file:**

The frontend already has a `.env` file. Open `frontend/.env` and verify it looks like this:
```env
VITE_API_URL=http://localhost:5000/api/v1
VITE_APP_NAME=Agency OS
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
```

The `VITE_API_URL` must match the port your backend runs on (5000 by default). If you changed the backend port, update this value.

If you have a Stripe publishable key, replace `pk_test_placeholder` with your actual key. Otherwise leave it as-is � Stripe features simply won't work until configured.

**Step 3 � Verify the frontend builds:**
```bash
npm run build
```

You should see output ending with `? built in X.XXs`. This confirms there are no errors.

### 4.6 Run the Application

You need **two terminals running simultaneously** � one for the backend and one for the frontend.

**Terminal 1 � Start the backend:**
```bash
# From agency-os/backend/
npm run dev
```

**Terminal 2 � Start the frontend:**
```bash
# From agency-os/frontend/
npm run dev
```

The frontend dev server will print:
```
  VITE v5.0.11  ready in XXX ms

  ?  Local:   http://localhost:5173/
  ?  Network: http://192.168.x.x:5173/
```

Open your browser and go to **http://localhost:5173**

You will see the Agency OS login page. See **Section 7** for first-time usage instructions.

---

## 5. Environment Variables � Complete Reference

### 5.1 Backend .env

Below is every variable in `backend/.env.example` with a detailed explanation of what it does and how to get the value.

---

#### Server Configuration

```env
NODE_ENV=development
```
Controls the application mode. Use `development` locally, `production` on a live server. Never use `development` in production � it disables security features.

```env
PORT=5000
```
The port the backend API listens on. 5000 is the default. If port 5000 is already in use on your machine, change this to any unused port (e.g., 5001) and update `VITE_API_URL` in the frontend `.env` to match.

```env
API_VERSION=v1
```
The API version prefix. All routes are served at `/api/v1/...`. Do not change this unless you are intentionally versioning the API.

```env
FRONTEND_URL=http://localhost:5173
```
The URL of the frontend application. Used for CORS (to allow the frontend to call the API) and for generating links in emails. In development use `http://localhost:5173` (Vite's default port). In production use your actual domain, e.g., `https://app.youragency.com`.

> **Important:** In development, the frontend runs on port 5173 (Vite), not 3000. Set this to `http://localhost:5173` for local development.

---

#### Database

```env
MONGODB_URI=mongodb://localhost:27017/agency-os
```
The connection string for MongoDB. For local development, this is always `mongodb://localhost:27017/agency-os`. The database `agency-os` is created automatically on first connection.

For MongoDB Atlas (cloud), the format is:
```
mongodb+srv://username:password@cluster.mongodb.net/agency-os?retryWrites=true&w=majority
```
See Section 5.3 for how to get an Atlas URI.

```env
MONGODB_URI_TEST=mongodb://localhost:27017/agency-os-test
```
Used only when running tests (`npm test`). Leave as-is for local development.

---

#### Redis

```env
REDIS_URL=redis://localhost:6379
```
The connection string for Redis. For local development, this is always `redis://localhost:6379`. For Redis Cloud or Upstash, the format is:
```
redis://default:your-password@your-host.upstash.io:6379
```
or with TLS:
```
rediss://default:your-password@your-host.upstash.io:6379
```

---

#### JWT (JSON Web Tokens)

```env
JWT_ACCESS_SECRET=your-access-secret-min-32-chars-here
```
A secret key used to sign access tokens. Must be at least 32 characters. Generate with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
**Never share this value. Never commit it to Git.**

```env
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars-here
```
A different secret key for refresh tokens. Generate separately from the access secret using the same command above.

```env
JWT_ACCESS_EXPIRY=15m
```
How long access tokens are valid. `15m` means 15 minutes. After expiry, the frontend automatically uses the refresh token to get a new access token. Do not increase this significantly � shorter is more secure.

```env
JWT_REFRESH_EXPIRY=7d
```
How long refresh tokens are valid. `7d` means 7 days. After this, users must log in again.

---

#### File Storage (AWS S3 or Cloudflare R2)

The application supports two storage providers. You only need to configure one.

**Option A � AWS S3:**
```env
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=agency-os-files
```

**Option B � Cloudflare R2 (cheaper, recommended):**
```env
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET=agency-os-files
```

If neither is configured, file uploads will fail. For local development without S3/R2, you can skip file upload features � all other features work without it.

See Section 5.3 for how to get these values.

---

#### Stripe (Payments)

```env
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-publishable-key
```

Used for invoice payment links and processing payments. If not configured, the payment link feature on invoices will not work, but all other invoice features (create, send, track) work fine.

See Section 5.3 for how to get these values.

---

#### Email (SMTP)

```env
EMAIL_FROM=noreply@youragency.com
EMAIL_FROM_NAME=Agency OS
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

Used to send magic link emails, invoice emails, contract emails, and team invitations.

**For Gmail (easiest for development):**
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587`
- `SMTP_USER=your-gmail-address@gmail.com`
- `SMTP_PASS=` � this is NOT your Gmail password. You need an App Password. See Section 5.3.

**For production**, use a transactional email service like SendGrid, Mailgun, or AWS SES for better deliverability.

---

#### Google OAuth (Optional)

```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/v1/auth/google/callback
```

Enables "Sign in with Google". If not configured, only email/password and magic link login are available. See Section 5.3 for setup.

---

#### Sentry (Optional � Error Monitoring)

```env
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

Sends error reports to Sentry for monitoring. Leave blank for local development.

---

#### Encryption

```env
ENCRYPTION_KEY=your-32-char-encryption-key-here!
```

Used to encrypt sensitive data at rest. Must be exactly 32 characters. Generate with:
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

---

#### Magic Links

```env
MAGIC_LINK_EXPIRY=72h
MAGIC_LINK_BASE_URL=http://localhost:5173/auth/magic
```

`MAGIC_LINK_BASE_URL` is the URL that magic link emails point to. In development, set this to `http://localhost:5173/auth/magic`. In production, set it to `https://app.youragency.com/auth/magic`.

---

#### File Upload Limits

```env
MAX_FILE_SIZE_BYTES=2147483648
```
Maximum file size for uploads. `2147483648` = 2 GB. Reduce this if you want to limit uploads.

```env
VIRUS_SCAN_ENABLED=false
```
Set to `true` only if you have ClamAV installed and running. Leave as `false` for development.

---

#### Rate Limiting

```env
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=200
```
Limits each IP to 200 requests per 60 seconds. Increase for development if needed.

---

#### Session & Cookies

```env
SESSION_SECRET=your-session-secret-here
COOKIE_DOMAIN=localhost
```

`SESSION_SECRET` � any random string, used for session signing. Generate with the same method as JWT secrets.

`COOKIE_DOMAIN` � the domain for cookies. Use `localhost` for development. In production, use your domain (e.g., `youragency.com`).

---

#### App Identity

```env
AGENCY_NAME=Agency OS
AGENCY_EMAIL=hello@agencyos.com
AGENCY_LOGO_URL=https://agencyos.com/logo.png
```

These appear in emails sent to clients. Set `AGENCY_NAME` to your actual agency name.

---

### 5.2 Frontend .env

The frontend `.env` file is at `frontend/.env` and has only three variables:

```env
VITE_API_URL=http://localhost:5000/api/v1
```
The full URL to the backend API. Must match the backend's `PORT`. In production, change this to your backend's public URL, e.g., `https://api.youragency.com/api/v1`.

```env
VITE_APP_NAME=Agency OS
```
The application name shown in the browser tab and UI. Change to your agency name.

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
```
The Stripe publishable key for the frontend. This is safe to expose (it is public by design). Get it from your Stripe dashboard. Leave as placeholder if not using Stripe.

---

### 5.3 How to Get Each Value

#### Gmail App Password (for SMTP_PASS)

Gmail requires an "App Password" instead of your regular password when using SMTP. Here is how to get one:

1. Go to your Google Account: https://myaccount.google.com
2. Click **Security** in the left sidebar
3. Under "How you sign in to Google", click **2-Step Verification** and enable it (required for App Passwords)
4. Go back to Security, scroll down to find **App passwords** (or search for it)
5. Click **App passwords**
6. Under "Select app", choose **Mail**
7. Under "Select device", choose **Other (Custom name)** and type "Agency OS"
8. Click **Generate**
9. Google shows a 16-character password like `abcd efgh ijkl mnop`
10. Copy this password (without spaces) into `SMTP_PASS`

Your `.env` will look like:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourname@gmail.com
SMTP_PASS=abcdefghijklmnop
```

---

#### MongoDB Atlas URI (for cloud database)

MongoDB Atlas is a free cloud-hosted MongoDB service. Use this if you want the database accessible from anywhere.

1. Go to https://www.mongodb.com/atlas and create a free account
2. Click **Build a Database** ? choose **Free** tier (M0)
3. Choose a cloud provider and region (any is fine)
4. Set a username and password � remember these
5. Under **Network Access**, click **Add IP Address** ? **Allow Access from Anywhere** (for development)
6. Once the cluster is created, click **Connect** ? **Connect your application**
7. Copy the connection string. It looks like:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
8. Replace `<password>` with your actual password and add the database name:
   ```
   mongodb+srv://username:yourpassword@cluster0.xxxxx.mongodb.net/agency-os?retryWrites=true&w=majority
   ```
9. Paste this as `MONGODB_URI` in your `.env`

---

#### Upstash Redis URI (for cloud Redis)

Upstash offers a free serverless Redis instance.

1. Go to https://upstash.com and create a free account
2. Click **Create Database**
3. Choose a name (e.g., "agency-os"), select a region, choose **Free** tier
4. After creation, go to the database details page
5. Under **REST API**, find the **REDIS_URL** � it looks like:
   ```
   rediss://default:your-password@your-host.upstash.io:6379
   ```
6. Copy this as `REDIS_URL` in your `.env`

---

#### AWS S3 Credentials

1. Go to https://aws.amazon.com and sign in (or create a free account)
2. Go to **IAM** (Identity and Access Management) in the AWS Console
3. Click **Users** ? **Create user**
4. Give it a name (e.g., "agency-os-s3")
5. Click **Next** ? **Attach policies directly** ? search for and select **AmazonS3FullAccess**
6. Click **Create user**
7. Click on the user you just created ? **Security credentials** tab
8. Click **Create access key** ? choose **Application running outside AWS**
9. Copy the **Access key ID** ? this is `AWS_ACCESS_KEY_ID`
10. Copy the **Secret access key** ? this is `AWS_SECRET_ACCESS_KEY`
11. Now create a bucket: go to **S3** in the AWS Console ? **Create bucket**
12. Give it a unique name (e.g., `agency-os-files-yourname`) ? choose your region ? uncheck "Block all public access" if you want files to be publicly accessible
13. The bucket name goes in `AWS_S3_BUCKET` and the region in `AWS_REGION`

---

#### Cloudflare R2 Credentials (cheaper alternative to S3)

Cloudflare R2 has no egress fees and a generous free tier.

1. Go to https://dash.cloudflare.com and sign in (or create a free account)
2. In the left sidebar, click **R2 Object Storage**
3. Click **Create bucket** ? give it a name (e.g., `agency-os-files`)
4. After creation, go to **R2 Overview** ? **Manage R2 API Tokens**
5. Click **Create API Token**
6. Give it a name, set permissions to **Object Read & Write**, select your bucket
7. Click **Create API Token**
8. Copy the **Access Key ID** ? this is `R2_ACCESS_KEY_ID`
9. Copy the **Secret Access Key** ? this is `R2_SECRET_ACCESS_KEY`
10. The endpoint is shown on the R2 overview page: `https://your-account-id.r2.cloudflarestorage.com`
11. Set `R2_BUCKET` to your bucket name

---

#### Stripe Keys

1. Go to https://stripe.com and create a free account
2. In the Stripe Dashboard, make sure you are in **Test mode** (toggle in the top-left)
3. Go to **Developers** ? **API keys**
4. Copy the **Publishable key** (starts with `pk_test_`) ? this is `STRIPE_PUBLISHABLE_KEY` and `VITE_STRIPE_PUBLISHABLE_KEY`
5. Click **Reveal test key** next to the **Secret key** (starts with `sk_test_`) ? this is `STRIPE_SECRET_KEY`
6. For the webhook secret: go to **Developers** ? **Webhooks** ? **Add endpoint**
7. Set the endpoint URL to `https://your-backend-url/api/v1/invoices/webhooks/stripe`
8. Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `invoice.paid`
9. After creating, click on the webhook ? **Signing secret** ? **Reveal** ? this is `STRIPE_WEBHOOK_SECRET`

For local webhook testing, install the Stripe CLI: https://stripe.com/docs/stripe-cli and run:
```bash
stripe listen --forward-to localhost:5000/api/v1/invoices/webhooks/stripe
```

---

#### Google OAuth Credentials

1. Go to https://console.cloud.google.com
2. Create a new project (or select an existing one)
3. Go to **APIs & Services** ? **OAuth consent screen**
4. Choose **External** ? fill in the app name, support email, and developer email ? Save
5. Go to **APIs & Services** ? **Credentials** ? **Create Credentials** ? **OAuth client ID**
6. Choose **Web application**
7. Under **Authorized redirect URIs**, add: `http://localhost:5000/api/v1/auth/google/callback`
8. Click **Create**
9. Copy the **Client ID** ? this is `GOOGLE_CLIENT_ID`
10. Copy the **Client Secret** ? this is `GOOGLE_CLIENT_SECRET`

---

## 6. Docker Setup

Docker is the easiest way to run the entire stack (MongoDB, Redis, backend, frontend) with a single command. It is also the recommended approach when sharing the project with teammates.

### Prerequisites for Docker

Install Docker Desktop from https://www.docker.com/products/docker-desktop

After installation, verify it is running:
```bash
docker --version
docker compose version
```

### Step 1 � Create the backend .env file

Docker reads the backend `.env` file. You must create it before running Docker:

```bash
# From the agency-os/ root folder:
# Windows
copy backend\.env.example backend\.env

# macOS / Linux
cp backend/.env.example backend/.env
```

Open `backend/.env` and set at minimum:
```env
NODE_ENV=production
PORT=5000
FRONTEND_URL=http://localhost:5173

# These are set automatically by docker-compose, but keep them as fallback:
MONGODB_URI=mongodb://mongodb:27017/agency-os
REDIS_URL=redis://redis:6379

JWT_ACCESS_SECRET=generate-a-64-char-random-string-here
JWT_REFRESH_SECRET=generate-another-64-char-random-string

EMAIL_FROM=noreply@youragency.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

AGENCY_NAME=Your Agency Name
MAGIC_LINK_BASE_URL=http://localhost:5173/auth/magic
```

> **Note:** In Docker, `MONGODB_URI` and `REDIS_URL` are overridden by the `docker-compose.yml` environment section to use the container hostnames (`mongodb` and `redis`). You do not need to change them.

### Step 2 � Build and start all services

```bash
# From the agency-os/ root folder (where docker-compose.yml is):
docker compose up --build
```

The `--build` flag rebuilds the Docker images. On first run this takes 3�5 minutes as it downloads base images and installs dependencies.

You will see logs from all four services (mongodb, redis, backend, frontend) in the same terminal.

### Step 3 � Access the application

Once all services are running (you will see `?? Agency OS API running on port 5000`):

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:5000/api/v1
- **Health check:** http://localhost:5000/health

### Step 4 � Stop the application

```bash
# Press Ctrl+C in the terminal, then:
docker compose down
```

To stop and remove all data (database volumes):
```bash
docker compose down -v
```

### Running in background (detached mode)

```bash
docker compose up -d --build
```

View logs:
```bash
docker compose logs -f          # All services
docker compose logs -f backend  # Backend only
docker compose logs -f frontend # Frontend only
```

### Rebuilding after code changes

```bash
docker compose up --build
```

---

## 7. First-Time Application Usage

After starting the application (either locally or via Docker), follow these steps to set up your first account.

### Step 1 � Register the first admin account

The first user to register automatically gets the `CLIENT` role. To create an admin account, you need to register and then manually update the role in MongoDB.

1. Open the application in your browser
2. Go to the login page and click **"Don't have an account? Register"** (or navigate to `/auth/login`)
3. Enter your name, email, and a password (minimum 8 characters)
4. Click **Register**

### Step 2 � Promote yourself to Admin

After registering, you need to give yourself admin access. Open a new terminal:

```bash
# Connect to MongoDB
mongosh

# Switch to the agency-os database
use agency-os

# Find your user (replace with your email)
db.users.findOne({ email: "yourname@example.com" })

# Update your role to SUPERADMIN
db.users.updateOne(
  { email: "yourname@example.com" },
  { $set: { role: "SUPERADMIN" } }
)

# Verify the change
db.users.findOne({ email: "yourname@example.com" }, { role: 1, name: 1 })

# Exit
exit
```

If using Docker, connect to the MongoDB container:
```bash
docker exec -it agency-os-mongo mongosh
# Then run the same commands above
```

### Step 3 � Log out and log back in

After changing your role, log out of the application and log back in. Your new admin role takes effect on the next login (because the role is embedded in the JWT token).

### Step 4 � Explore the application

As a SUPERADMIN you now have access to all features:

- **Dashboard** � Overview of KPIs, recent activity
- **Projects** � Create and manage client projects
- **Files** � Browse all uploaded files
- **Messages** � Real-time messaging across project channels
- **Invoices** � Create, send, and track invoices
- **Contracts** � Create and send contracts for e-signing
- **Approvals** � Review and approve client deliverables
- **Settings** � Update your profile, change password, toggle dark/light theme
- **Admin ? Clients** � Add and manage clients
- **Admin ? Team** � Invite team members (Project Managers, Contributors)
- **Admin ? Analytics** � Revenue and project analytics
- **Admin ? Automations** � Configure automated workflows

### Step 5 � Add your first client

1. Go to **Admin ? Clients**
2. Click **Add Client**
3. Fill in the company name, contact name, and email
4. Click **Create & Invite** � this sends an invitation email to the client

The client receives an email with a magic link to set up their account. Once they log in, they can see their projects, invoices, contracts, and approvals.

### User Roles Explained

| Role | Access |
|------|--------|
| `SUPERADMIN` | Full access to everything including system settings |
| `ADMIN` | Full access to all features and team management |
| `PROJECT_MANAGER` | Manage projects, tasks, files, invoices, contracts |
| `CONTRIBUTOR` | View and work on assigned projects and tasks |
| `CLIENT` | View their own projects, invoices, contracts, and approvals |

---

## 8. Deployment Guide

### 8.1 Deploy Backend to Railway

Railway is a simple platform-as-a-service that deploys Node.js apps with minimal configuration.

**Step 1 � Create a Railway account**

Go to https://railway.app and sign up with GitHub.

**Step 2 � Create a new project**

1. Click **New Project** ? **Deploy from GitHub repo**
2. Connect your GitHub account and select your repository
3. Railway detects the Node.js app automatically

**Step 3 � Set the root directory**

Since the backend is in a subdirectory:
1. Go to your service settings
2. Under **Source**, set **Root Directory** to `backend`

**Step 4 � Add environment variables**

In Railway, go to your service ? **Variables** tab. Add all the variables from your `backend/.env` file. For production, change:
```
NODE_ENV=production
FRONTEND_URL=https://your-frontend-domain.vercel.app
MONGODB_URI=your-mongodb-atlas-uri
REDIS_URL=your-upstash-redis-uri
COOKIE_DOMAIN=your-backend-domain.railway.app
MAGIC_LINK_BASE_URL=https://your-frontend-domain.vercel.app/auth/magic
```

**Step 5 � Add MongoDB and Redis**

In Railway, click **New** ? **Database** ? **MongoDB** to add a managed MongoDB instance. Railway provides the `MONGODB_URI` automatically as an environment variable.

For Redis, click **New** ? **Database** ? **Redis**. Railway provides `REDIS_URL` automatically.

**Step 6 � Deploy**

Railway deploys automatically when you push to your GitHub repository. The build command is `npm run build` and the start command is `npm start` (which runs `node dist/server.js`).

Your backend will be available at a URL like `https://agency-os-backend.up.railway.app`.

---

### 8.2 Deploy Frontend to Vercel

Vercel is the easiest way to deploy a Vite/React application.

**Step 1 � Create a Vercel account**

Go to https://vercel.com and sign up with GitHub.

**Step 2 � Import your project**

1. Click **Add New** ? **Project**
2. Import your GitHub repository
3. Vercel detects it as a Vite project

**Step 3 � Configure the project**

In the project settings:
- **Framework Preset:** Vite
- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

**Step 4 � Add environment variables**

In Vercel, go to **Settings** ? **Environment Variables**. Add:
```
VITE_API_URL=https://your-backend.up.railway.app/api/v1
VITE_APP_NAME=Your Agency Name
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your-live-key
```

**Step 5 � Deploy**

Click **Deploy**. Vercel builds and deploys automatically. Your frontend will be at `https://your-project.vercel.app`.

**Step 6 � Update backend CORS**

After deploying the frontend, go back to Railway and update the backend environment variable:
```
FRONTEND_URL=https://your-project.vercel.app
```

---

### 8.3 Deploy Everything with Docker on a VPS

This approach runs the entire stack on a single server (DigitalOcean, Linode, Hetzner, etc.). Recommended for full control and cost efficiency.

**Step 1 � Get a VPS**

Create a server with at least 2 GB RAM and 2 vCPUs. Ubuntu 22.04 LTS is recommended.

Popular providers:
- DigitalOcean: https://digitalocean.com (starts at $12/month for 2GB RAM)
- Hetzner: https://hetzner.com (starts at �4/month for 2GB RAM � very affordable)
- Linode: https://linode.com

**Step 2 � Connect to your server**

```bash
ssh root@your-server-ip
```

**Step 3 � Install Docker on the server**

```bash
# Update packages
apt-get update && apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
apt-get install -y docker-compose-plugin

# Verify
docker --version
docker compose version
```

**Step 4 � Copy your project to the server**

Option A � Clone from Git:
```bash
git clone https://github.com/your-org/agency-os.git
cd agency-os
```

Option B � Copy with scp from your local machine:
```bash
# Run this on your LOCAL machine:
scp -r ./agency-os root@your-server-ip:/root/agency-os
```

**Step 5 � Create the production .env file**

On the server:
```bash
cd /root/agency-os
cp backend/.env.example backend/.env
nano backend/.env
```

Fill in all production values. Key changes from development:
```env
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com
MONGODB_URI=mongodb://mongodb:27017/agency-os
REDIS_URL=redis://redis:6379
COOKIE_DOMAIN=yourdomain.com
MAGIC_LINK_BASE_URL=https://yourdomain.com/auth/magic
```

**Step 6 � Update the frontend .env for production**

```bash
nano frontend/.env
```
```env
VITE_API_URL=https://yourdomain.com/api/v1
VITE_APP_NAME=Your Agency Name
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your-key
```

**Step 7 � Start the application**

```bash
docker compose up -d --build
```

**Step 8 � Set up a domain and SSL with Nginx + Certbot**

Install Nginx and Certbot on the host (outside Docker):
```bash
apt-get install -y nginx certbot python3-certbot-nginx
```

Create an Nginx config for your domain:
```bash
nano /etc/nginx/sites-available/agency-os
```

Paste this configuration (replace `yourdomain.com`):
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Enable the site and get SSL:
```bash
ln -s /etc/nginx/sites-available/agency-os /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# Get free SSL certificate
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Certbot automatically updates the Nginx config with SSL and sets up auto-renewal.

**Step 9 � Verify everything is running**

```bash
docker compose ps
# All four services should show "running"

curl https://yourdomain.com/health
# Should return {"status":"ok",...}
```

---

## 9. Sharing the Project with Others

### Sharing with a teammate for local development

1. Share the project folder (zip it or push to a private Git repository)
2. They follow Section 4 (Local Development Setup) exactly
3. They need their own `.env` file � share the `.env.example` as a template
4. For the database: they can either run their own local MongoDB, or you can share a MongoDB Atlas URI so everyone uses the same database
5. For JWT secrets: each developer can use their own secrets locally, but if sharing a database, use the same secrets so tokens are compatible

### Sharing via Git (recommended for teams)

1. Create a private repository on GitHub/GitLab
2. Add a `.gitignore` that excludes `.env` files (already included in the project)
3. Push the code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/your-org/agency-os.git
   git push -u origin main
   ```
4. Share the repository URL with teammates
5. Each teammate clones the repo and creates their own `.env` from `.env.example`
6. Share the actual `.env` values securely (use a password manager like 1Password or Bitwarden, never email or Slack)

### What NOT to commit to Git

The `.gitignore` files already exclude these, but double-check:
- `backend/.env` � contains secrets
- `frontend/.env` � contains API keys
- `node_modules/` � too large, regenerated with `npm install`
- `dist/` � build output, regenerated with `npm run build`

---

## 10. Troubleshooting

### Backend won't start � "MongoDB connection failed"

**Cause:** MongoDB is not running or the URI is wrong.

**Fix:**
```bash
# Check if MongoDB is running
mongosh --eval "db.runCommand({ connectionStatus: 1 })"

# Start MongoDB if not running
# macOS:
brew services start mongodb-community@7.0
# Linux:
sudo systemctl start mongod
# Windows: Open Services ? MongoDB Server ? Start
```

Also verify `MONGODB_URI` in your `.env` is exactly `mongodb://localhost:27017/agency-os`.

---

### Backend won't start � "Redis connection error"

**Cause:** Redis is not running.

**Fix:**
```bash
redis-cli ping
# If no response:

# macOS:
brew services start redis
# Linux:
sudo systemctl start redis-server
# Windows (Docker):
docker start redis
```

---

### Backend won't start � "Invalid environment variables"

**Cause:** A required `.env` variable is missing or invalid.

**Fix:** Read the error message carefully � it lists exactly which variables are wrong. Common issues:
- `JWT_ACCESS_SECRET` is less than 32 characters � generate a longer one
- `MONGODB_URI` is missing � copy from `.env.example`
- A variable has extra spaces or quotes around the value

---

### Frontend shows blank page or "Network Error"

**Cause:** The frontend cannot reach the backend API.

**Fix:**
1. Make sure the backend is running (`npm run dev` in `backend/`)
2. Check `frontend/.env` � `VITE_API_URL` must match the backend port
3. If you changed the backend port from 5000, update `VITE_API_URL` accordingly
4. After changing `.env`, restart the frontend dev server (`Ctrl+C` then `npm run dev` again)

---

### "CORS error" in browser console

**Cause:** The backend is rejecting requests from the frontend's origin.

**Fix:** In `backend/.env`, set `FRONTEND_URL` to exactly match the URL shown in your browser:
- If frontend is at `http://localhost:5173`, set `FRONTEND_URL=http://localhost:5173`
- If frontend is at `http://localhost:5173`, set `FRONTEND_URL=http://localhost:5173`

Restart the backend after changing `.env`.

---

### Magic link email not received

**Cause:** SMTP is not configured or Gmail is blocking the connection.

**Fix:**
1. Verify `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` are all set in `.env`
2. For Gmail, make sure you are using an **App Password** (not your regular Gmail password) � see Section 5.3
3. Make sure 2-Step Verification is enabled on your Google account (required for App Passwords)
4. Check your spam folder

---

### "Port already in use" error

**Cause:** Another process is using port 5000 or 5173.

**Fix:**
```bash
# Find what is using port 5000:
# Windows:
netstat -ano | findstr :5000
# macOS / Linux:
lsof -i :5000

# Kill the process (replace PID with the number shown):
# Windows:
taskkill /PID <PID> /F
# macOS / Linux:
kill -9 <PID>
```

Or change the port: set `PORT=5001` in `backend/.env` and update `VITE_API_URL=http://localhost:5001/api/v1` in `frontend/.env`.

---

### Docker: "permission denied" on Linux

**Fix:**
```bash
sudo usermod -aG docker $USER
# Log out and log back in, then retry
```

---

### Docker: containers start but frontend shows "502 Bad Gateway"

**Cause:** The backend container is still starting up when the frontend tries to connect.

**Fix:** Wait 30 seconds and refresh. The backend needs time to connect to MongoDB and Redis on first start. If it persists:
```bash
docker compose logs backend
# Look for error messages
```

---

### npm install fails with peer dependency errors

**Fix:** Use the legacy peer deps flag:
```bash
npm install --legacy-peer-deps
```

---

### TypeScript build errors after pulling new code

**Fix:**
```bash
# Delete build artifacts and reinstall
# Backend:
rm -rf backend/dist backend/node_modules
cd backend && npm install && npm run build

# Frontend:
rm -rf frontend/dist frontend/node_modules
cd frontend && npm install && npm run build
```

On Windows, use `rmdir /s /q` instead of `rm -rf`.

---

### Socket.io not connecting (real-time features not working)

**Cause:** The access token may be expired or the socket server is not reachable.

**Fix:**
1. Log out and log back in to get a fresh token
2. Check the browser console for socket connection errors
3. Make sure the backend is running and accessible
4. In production, verify the Nginx config has the Socket.io proxy block (see Section 8.3)

---

## Quick Reference � All Commands

### Local Development

```bash
# Start backend (from agency-os/backend/)
npm run dev

# Start frontend (from agency-os/frontend/)
npm run dev

# Build backend
npm run build

# Build frontend
npm run build
```

### Docker

```bash
# Start everything (from agency-os/)
docker compose up --build

# Start in background
docker compose up -d --build

# Stop everything
docker compose down

# Stop and remove all data
docker compose down -v

# View logs
docker compose logs -f

# Rebuild a single service
docker compose up --build backend
```

### MongoDB (direct access)

```bash
# Connect to local MongoDB
mongosh

# Connect to Docker MongoDB
docker exec -it agency-os-mongo mongosh

# Switch to app database
use agency-os

# List all users
db.users.find({}, { name: 1, email: 1, role: 1 })

# Promote user to SUPERADMIN
db.users.updateOne({ email: "your@email.com" }, { $set: { role: "SUPERADMIN" } })
```

### Generate Secrets

```bash
# Generate a secure random secret (run twice for JWT_ACCESS_SECRET and JWT_REFRESH_SECRET)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## API Endpoints Reference

All endpoints are prefixed with `/api/v1`. Authentication is required for all endpoints except auth routes.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login with email/password |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Logout |
| POST | `/auth/magic-link` | Send magic link email |
| POST | `/auth/magic-link/verify` | Verify magic link token |
| POST | `/auth/forgot-password` | Send password reset email |
| POST | `/auth/reset-password` | Reset password with token |
| GET | `/auth/me` | Get current user |
| PATCH | `/auth/me` | Update profile |
| PATCH | `/auth/me/password` | Change password |
| GET | `/clients` | List clients |
| POST | `/clients` | Create client |
| GET | `/clients/:id` | Get client |
| PATCH | `/clients/:id` | Update client |
| POST | `/clients/:id/invite` | Send client invitation |
| GET | `/projects` | List projects |
| POST | `/projects` | Create project |
| GET | `/projects/:id` | Get project |
| PATCH | `/projects/:id` | Update project |
| GET | `/tasks` | List tasks |
| POST | `/tasks` | Create task |
| PATCH | `/tasks/:id` | Update task |
| DELETE | `/tasks/:id` | Delete task |
| POST | `/files/upload` | Upload file |
| GET | `/files` | List files |
| DELETE | `/files/:id` | Delete file |
| GET | `/messages/channels` | List all channels |
| GET | `/messages/channels/:id/messages` | Get channel messages |
| POST | `/messages/channels/:id/messages` | Send message |
| GET | `/invoices` | List invoices |
| POST | `/invoices` | Create invoice |
| GET | `/invoices/:id` | Get invoice |
| POST | `/invoices/:id/send` | Send invoice to client |
| POST | `/invoices/:id/void` | Void invoice |
| POST | `/invoices/:id/payment-link` | Generate Stripe payment link |
| GET | `/contracts` | List contracts |
| POST | `/contracts` | Create contract |
| GET | `/contracts/:id` | Get contract |
| POST | `/contracts/:id/send` | Send contract for signing |
| POST | `/contracts/:id/sign` | Sign contract |
| GET | `/approvals` | List approvals |
| POST | `/approvals` | Create approval request |
| POST | `/approvals/:id/review` | Approve or reject |
| GET | `/notifications` | List notifications |
| GET | `/automations` | List automation rules |
| POST | `/automations` | Create automation rule |
| PATCH | `/automations/:id` | Update automation rule |
| DELETE | `/automations/:id` | Delete automation rule |
| GET | `/analytics/overview` | Analytics overview |
| GET | `/admin/team` | List team members |
| POST | `/admin/team/invite` | Invite team member |
| PATCH | `/admin/team/:id/role` | Update member role |
| GET | `/admin/audit-logs` | View audit logs |
| GET | `/health` | Health check (no auth) |

---

*Agency OS � Built with Node.js, Express, MongoDB, Redis, React, TypeScript, Tailwind CSS, Socket.io*


---

---

# Access Control, User Roles & Application Workflow

This section is a complete reference for how users register, log in, what each role can do, and how the full project workflow operates from onboarding to delivery.

---

## User Roles Overview

Agency OS has five distinct roles. Each role is designed around a real-world position in an agency:

| Role | Who it is | How they get access |
|------|-----------|---------------------|
| `SUPERADMIN` | Platform owner / technical admin | Manually set in MongoDB |
| `ADMIN` | Agency owner or operations manager | Manually set in MongoDB or promoted by SUPERADMIN |
| `PROJECT_MANAGER` | PM who runs client projects | Invited by ADMIN via Team page |
| `CONTRIBUTOR` | Designer, developer, copywriter | Invited by ADMIN via Team page |
| `CLIENT` | The agency's client | Invited by ADMIN via Clients page |

---

## How Each Role Registers and Logs In

### SUPERADMIN / ADMIN

These roles cannot self-register through the UI. The process is:

1. Register a normal account at `/auth/register` (this creates a `CLIENT` role by default)
2. Promote the account to `SUPERADMIN` or `ADMIN` directly in MongoDB:
   ```bash
   mongosh
   use agency-os
   db.users.updateOne({ email: "your@email.com" }, { $set: { role: "SUPERADMIN" } })
   ```
3. Log out and log back in — the new role takes effect on the next login

**Login methods available:**
- Email + password at `/auth/login`
- Magic link (passwordless) — enter email, receive a link by email, click to sign in
- Google OAuth (if configured)

---

### PROJECT_MANAGER / CONTRIBUTOR (Team Members)

These roles are invited by an ADMIN:

1. ADMIN goes to **Admin → Team** and clicks **Invite Member**
2. Fills in name, email, and selects role (`PROJECT_MANAGER` or `CONTRIBUTOR`)
3. The system creates the account and sends an invitation email with a temporary password
4. The team member logs in at `/auth/login` with the temporary password
5. They should immediately go to **Settings → Security** and change their password

**Login methods available:**
- Email + password
- Magic link (passwordless)
- Google OAuth (if configured)

---

### CLIENT

Clients are invited by an ADMIN through the Clients page:

1. ADMIN goes to **Admin → Clients** and clicks **Add Client**
2. Fills in company name, contact name, and email
3. Clicks **Create & Invite** — this creates the client record and sends an invitation email
4. The client receives an email with a magic link to their portal
5. They click the link and are automatically signed in
6. On first login they can set a password via **Settings → Security** if they want password-based login in future

**Login methods available:**
- Magic link (primary method — most user-friendly for clients)
- Email + password (after setting a password in Settings)
- Google OAuth (if configured)

---

## Complete Role Permission Matrix

### Navigation — What each role sees in the sidebar

| Page | SUPERADMIN | ADMIN | PROJECT_MANAGER | CONTRIBUTOR | CLIENT |
|------|:---:|:---:|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Projects | ✅ | ✅ | ✅ | ✅ | ✅ |
| Files | ✅ | ✅ | ✅ | ✅ | ✅ |
| Messages | ✅ | ✅ | ✅ | ✅ | ✅ |
| Invoices | ✅ | ✅ | ✅ | ❌ | ✅ |
| Contracts | ✅ | ✅ | ✅ | ❌ | ✅ |
| Approvals | ✅ | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin → Clients | ✅ | ✅ | ❌ | ❌ | ❌ |
| Admin → Team | ✅ | ✅ | ❌ | ❌ | ❌ |
| Admin → Analytics | ✅ | ✅ | ✅ | ❌ | ❌ |
| Admin → Automations | ✅ | ✅ | ❌ | ❌ | ❌ |

> Attempting to access a restricted URL directly redirects to `/dashboard`.

---

### Dashboard — What each role sees

| Dashboard Element | SUPERADMIN | ADMIN | PROJECT_MANAGER | CONTRIBUTOR | CLIENT |
|---|:---:|:---:|:---:|:---:|:---:|
| Active Projects KPI | ✅ | ✅ | ❌ | ❌ | ❌ |
| Outstanding Revenue KPI | ✅ | ✅ | ❌ | ❌ | ❌ |
| Active Clients KPI | ✅ | ✅ | ❌ | ❌ | ❌ |
| Overdue Invoices KPI | ✅ | ✅ | ❌ | ❌ | ❌ |
| My Projects KPI | ❌ | ❌ | ✅ | ✅ | ✅ |
| Pending Approvals KPI | ❌ | ❌ | ✅ | ✅ | ✅ |
| Messages KPI | ❌ | ❌ | ✅ | ✅ | ✅ |
| Recent Projects list | ✅ | ✅ | ✅ | ✅ | ✅ |
| Recent Activity feed | ✅ | ✅ | ✅ | ✅ | ✅ |

---

### Projects

| Action | SUPERADMIN | ADMIN | PROJECT_MANAGER | CONTRIBUTOR | CLIENT |
|--------|:---:|:---:|:---:|:---:|:---:|
| View all projects | ✅ | ✅ | Only assigned | Only assigned | Only own |
| Create project | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit project details | ✅ | ✅ | ✅ | ❌ | ❌ |
| Change project status | ✅ | ✅ | ✅ | ❌ | ❌ |
| Add milestones | ✅ | ✅ | ✅ | ❌ | ❌ |
| View project tasks | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create tasks | ✅ | ✅ | ✅ | ✅ | ❌ |
| Update task status | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delete tasks | ✅ | ✅ | ✅ | ✅ | ❌ |

---

### Files

| Action | SUPERADMIN | ADMIN | PROJECT_MANAGER | CONTRIBUTOR | CLIENT |
|--------|:---:|:---:|:---:|:---:|:---:|
| View files | ✅ All | ✅ All | ✅ All | ✅ All | ✅ Client-visible only |
| Upload files | ✅ | ✅ | ✅ | ✅ | ❌ |
| Download files | ✅ | ✅ | ✅ | ✅ | ✅ (client-visible only) |
| Delete files | ✅ | ✅ | ✅ | Own only | ❌ |
| Add annotations | ✅ | ✅ | ✅ | ✅ | ❌ |

---

### Messages

| Action | SUPERADMIN | ADMIN | PROJECT_MANAGER | CONTRIBUTOR | CLIENT |
|--------|:---:|:---:|:---:|:---:|:---:|
| View channels | ✅ All | ✅ All | ✅ All | ✅ All | ✅ Own projects |
| Send messages | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit own messages | ✅ | ✅ | ✅ | ✅ | ✅ |
| Delete any message | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete own message | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pin messages | ✅ | ✅ | ✅ | ✅ | ❌ |

---

### Invoices

| Action | SUPERADMIN | ADMIN | PROJECT_MANAGER | CONTRIBUTOR | CLIENT |
|--------|:---:|:---:|:---:|:---:|:---:|
| View invoices | ✅ All | ✅ All | ✅ All | ❌ | ✅ Own only |
| Create invoice | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit draft invoice | ✅ | ✅ | ❌ | ❌ | ❌ |
| Send invoice to client | ✅ | ✅ | ❌ | ❌ | ❌ |
| Void invoice | ✅ | ✅ | ❌ | ❌ | ❌ |
| Generate payment link | ✅ | ✅ | ✅ | ❌ | ✅ |
| Pay invoice (Stripe) | ✅ | ✅ | ✅ | ❌ | ✅ |

---

### Contracts

| Action | SUPERADMIN | ADMIN | PROJECT_MANAGER | CONTRIBUTOR | CLIENT |
|--------|:---:|:---:|:---:|:---:|:---:|
| View contracts | ✅ All | ✅ All | ✅ All | ❌ | ✅ Own only |
| Create contract | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit draft contract | ✅ | ✅ | ❌ | ❌ | ❌ |
| Send for signing | ✅ | ✅ | ❌ | ❌ | ❌ |
| Sign contract (client) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Sign contract (agency) | ✅ | ✅ | ❌ | ❌ | ❌ |

---

### Approvals

| Action | SUPERADMIN | ADMIN | PROJECT_MANAGER | CONTRIBUTOR | CLIENT |
|--------|:---:|:---:|:---:|:---:|:---:|
| View approvals | ✅ All | ✅ All | ✅ All | ✅ All | ✅ Own projects |
| Create approval request | ✅ | ✅ | ✅ | ❌ | ❌ |
| Approve deliverable | ✅ | ✅ | ✅ | ❌ | ✅ |
| Reject deliverable | ✅ | ✅ | ✅ | ❌ | ✅ |
| Request revision | ✅ | ✅ | ✅ | ❌ | ✅ |

> **Note:** Clients are the primary approvers — they review and approve deliverables submitted by the agency team.

---

### Admin Features

| Feature | SUPERADMIN | ADMIN | PROJECT_MANAGER | CONTRIBUTOR | CLIENT |
|---------|:---:|:---:|:---:|:---:|:---:|
| View all clients | ✅ | ✅ | ❌ | ❌ | ❌ |
| Add new client | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit client details | ✅ | ✅ | ❌ | ❌ | ❌ |
| Invite client to portal | ✅ | ✅ | ❌ | ❌ | ❌ |
| View team members | ✅ | ✅ | ❌ | ❌ | ❌ |
| Invite team member | ✅ | ✅ | ❌ | ❌ | ❌ |
| Change team member role | ✅ | ✅ | ❌ | ❌ | ❌ |
| Deactivate team member | ✅ | ✅ | ❌ | ❌ | ❌ |
| View analytics | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create automations | ✅ | ✅ | ❌ | ❌ | ❌ |
| View audit logs | ✅ | ✅ | ❌ | ❌ | ❌ |

---

### Settings (all roles)

Every logged-in user can:
- Update their display name
- Change their password (if they have one set)
- Toggle dark / light theme
- Configure notification preferences
- View and manage their logged-in devices

---

## Full Application Workflow

This section describes the end-to-end workflow of a typical agency engagement, from onboarding a client to delivering the project.

---

### Phase 1 — Agency Setup (ADMIN)

**Goal:** Get the agency account ready before any client work begins.

1. **Register** at `/auth/register` with your name, email, and password
2. **Promote yourself** to `SUPERADMIN` or `ADMIN` via MongoDB (see Section 7)
3. **Log back in** — your admin role is now active
4. **Invite your team:**
   - Go to **Admin → Team → Invite Member**
   - Add Project Managers and Contributors with their emails and roles
   - They receive an email with login credentials
5. **Configure your agency identity** in `backend/.env`:
   - Set `AGENCY_NAME` to your agency name
   - Set `AGENCY_EMAIL` to your contact email
   - These appear in all client-facing emails

---

### Phase 2 — Client Onboarding (ADMIN)

**Goal:** Add a new client and give them access to their portal.

1. Go to **Admin → Clients → Add Client**
2. Fill in:
   - Company name
   - Contact person's name
   - Contact email
   - Tier (STARTER / GROWTH / ENTERPRISE)
3. Click **Create & Invite**
4. The system:
   - Creates a `Client` record in the database
   - Creates a `User` account with `CLIENT` role linked to that client
   - Sends an invitation email with a magic link
5. The client clicks the link in their email and is automatically signed in
6. They land on their dashboard showing their projects, invoices, and approvals
7. They can set a password in **Settings → Security** for future password-based logins

---

### Phase 3 — Project Creation (ADMIN / PROJECT_MANAGER)

**Goal:** Set up a project for the client.

1. Go to **Projects → New Project**
2. Fill in:
   - Project name
   - Client (select from dropdown — only clients you've added)
   - Project type (Website, Branding, Campaign, Custom)
   - Assigned Project Manager
   - Budget and currency
   - Start and end dates
   - Milestones (optional — each milestone can trigger an invoice)
3. Click **Create Project**
4. The system automatically:
   - Creates a `general` messaging channel for the project
   - Notifies the assigned PM
5. Go to the project detail page and add Contributors under the team section

---

### Phase 4 — Active Project Work (PROJECT_MANAGER / CONTRIBUTOR)

**Goal:** Execute the project and keep the client informed.

#### Task Management
1. Go to the project → **Tasks** tab
2. The Kanban board has four columns: Backlog, In Progress, Review, Done
3. Click **Add Task** to create tasks
4. Assign tasks to Contributors — they receive a notification
5. Contributors update task status by dragging or using the status dropdown
6. The project's health score updates automatically based on overdue tasks and milestones

#### File Sharing
1. Go to the project → **Files** tab
2. Drag and drop files or click to browse
3. Toggle **Client Visible** to control whether the client can see a file
4. Files are stored in S3/R2 and scanned for viruses (if enabled)
5. Clients can download files marked as client-visible

#### Messaging
1. Go to the project → **Messages** tab (or the global **Messages** page)
2. Each project has a `general` channel by default
3. All team members and the client can message in real-time
4. Use `@mentions` to notify specific people
5. Messages appear instantly via Socket.io — no page refresh needed

---

### Phase 5 — Client Approval Workflow (PROJECT_MANAGER → CLIENT)

**Goal:** Get formal client sign-off on deliverables.

1. **PM submits for approval:**
   - Go to project → **Approvals** tab
   - Click **Request Approval**
   - Add a title (e.g., "Homepage Design v2")
   - Attach relevant files
   - Add a submission note
   - Set a due date (optional)
   - Click **Submit**
2. The client receives:
   - An in-app notification
   - An email notification with a link to review
3. **Client reviews and responds:**
   - Client logs in and goes to **Approvals**
   - They see the submitted deliverable with attached files
   - They can:
     - **Approve** — marks as approved, notifies the PM
     - **Request Revision** — adds revision notes, PM is notified
     - **Reject** — with a reason, PM is notified
4. If revision is requested, the PM makes changes and resubmits
5. The revision history is tracked on the approval record

---

### Phase 6 — Invoicing (ADMIN)

**Goal:** Bill the client for work completed.

#### Creating an Invoice
1. Go to **Invoices → New Invoice** (or from a project's Invoices tab)
2. Fill in:
   - Client
   - Project (optional)
   - Line items (description, quantity, unit price)
   - Tax rate and discount (optional)
   - Due date
   - Notes (optional)
3. Click **Create** — invoice is saved as `DRAFT`

#### Sending an Invoice
1. Open the invoice
2. Click **Send Invoice**
3. The system:
   - Generates a PDF of the invoice
   - Emails it to the client with a payment link
   - Changes status to `SENT`
4. When the client opens the email, status changes to `VIEWED`

#### Payment
1. Click **Payment Link** on a sent invoice
2. This creates a Stripe Checkout session
3. Share the link with the client or they receive it in the invoice email
4. Client pays via Stripe (card, bank transfer, etc.)
5. Stripe webhook fires → invoice status changes to `PAID`
6. PM receives a notification that the invoice was paid

#### Invoice Status Flow
```
DRAFT → SENT → VIEWED → PARTIAL → PAID
                              ↓
                           OVERDUE (automatic, if past due date)
                              ↓
                            VOID (manual, if cancelled)
```

---

### Phase 7 — Contracts (ADMIN)

**Goal:** Get a signed agreement from the client before or during the project.

1. Go to **Contracts → New Contract**
2. Fill in:
   - Client
   - Project (optional)
   - Contract type (NDA, SOW, Retainer, Change Order)
   - Title
   - Contract body (HTML content)
   - Expiry date (optional)
3. Click **Create** — saved as `DRAFT`
4. Click **Send for Signing** — client receives an email
5. Client logs in, reads the contract, and clicks **Sign Contract**
6. Client's signature (with timestamp, IP address, and user agent) is recorded
7. Agency can countersign from the contract detail page
8. Once both parties sign, status becomes `EXECUTED`
9. A signed PDF is generated and stored

#### Contract Status Flow
```
DRAFT → SENT → VIEWED → SIGNED (client signed) → EXECUTED (both signed)
                                                        ↓
                                                    EXPIRED (if past expiry date)
```

---

### Phase 8 — Analytics & Reporting (ADMIN / PROJECT_MANAGER)

**Goal:** Monitor agency performance.

Go to **Admin → Analytics** to see:

- **Active Clients** — total clients currently engaged
- **Active Projects** — projects currently in progress
- **Outstanding Revenue** — total unpaid invoice amounts
- **Overdue Invoices** — count of invoices past due date
- **Revenue Trend** — area chart of monthly revenue over the last 6 months
- **Projects by Status** — breakdown of Scoping / Active / Completed
- **Invoice Summary** — total, paid, and overdue counts

Analytics data is cached for 5 minutes in Redis for performance.

---

### Phase 9 — Automations (ADMIN)

**Goal:** Reduce manual work with automated triggers.

Go to **Admin → Automations → New Rule** to create a rule:

1. Choose a **Trigger Event:**
   - `task.assigned` — when a task is assigned
   - `invoice.overdue` — when an invoice becomes overdue
   - `invoice.paid` — when an invoice is paid
   - `project.status_changed` — when a project status changes
   - `milestone.completed` — when a milestone is marked complete
   - `approval.given` — when a deliverable is approved
   - `contract.signed` — when a contract is signed
   - `file.uploaded` — when a file is uploaded
   - `client.activated` — when a client account is activated

2. Choose an **Action:**
   - `SEND_NOTIFICATION` — send an in-app notification
   - `SEND_EMAIL` — send an email
   - `CREATE_TASK` — automatically create a task
   - `CHANGE_STATUS` — update a project or invoice status
   - `CALL_WEBHOOK` — POST to an external URL (for Zapier, Slack, etc.)

3. Toggle rules on/off without deleting them
4. View run count and last run time for each rule

---

## Authentication Flow (Technical Detail)

### Token Architecture

Agency OS uses a dual-token system:

```
Login → Access Token (15 min) + Refresh Token (7 days, httpOnly cookie)
         ↓
API calls use Access Token in Authorization header
         ↓
When Access Token expires → frontend automatically calls /auth/refresh
         ↓
New Access Token issued, Refresh Token rotated (old one invalidated)
         ↓
If Refresh Token expired or revoked → user redirected to login
```

### Security Features

- **Argon2id** password hashing (memory-hard, resistant to GPU attacks)
- **Refresh token rotation** — each refresh issues a new token and invalidates the old one
- **Token reuse detection** — if an old refresh token is used, the entire session family is revoked
- **Session revocation** — logout immediately invalidates the session in Redis
- **Device tracking** — up to 5 devices per user, with last-seen timestamps
- **Rate limiting** — auth endpoints limited to 10 requests/minute, strict endpoints to 5/minute
- **MongoDB sanitization** — prevents NoSQL injection attacks
- **Helmet** security headers on all responses

### Magic Link Flow

```
User enters email → POST /auth/magic-link
                         ↓
Token generated → stored in Redis (72h TTL) → email sent
                         ↓
User clicks link → GET /auth/magic?token=xxx
                         ↓
Frontend sends → POST /auth/magic-link/verify
                         ↓
Token validated → deleted from Redis (single-use) → user logged in
```

---

## User Profile Management

Every user (all roles) can manage their profile at `/settings`:

### Profile Tab
- **Display Name** — update how your name appears across the app
- **Email** — read-only (contact admin to change)
- **Role** — read-only (contact admin to change)
- **Avatar** — update profile picture URL

### Security Tab
- **Change Password** — requires current password + new password (min 8 chars)
- If the account was created via magic link (no password set), the change password form shows an appropriate message

### Notifications Tab
- Toggle email notifications for: task assignments, invoice due dates, approval requests, messages, file uploads
- Toggle in-app notifications

### Appearance Tab
- **Theme** — switch between Light and Dark mode
- Theme preference is saved to localStorage and persists across sessions

---

## Real-Time Features

The following features update in real-time without page refresh, powered by Socket.io:

| Feature | Trigger | Who sees it |
|---------|---------|-------------|
| New message | Someone sends a message in a channel | All channel members |
| Message edited | Someone edits a message | All channel members |
| Message deleted | Someone deletes a message | All channel members |
| New notification | Any notification event | The specific user |
| File uploaded | File upload completes | All project members |
| Approval updated | Approval status changes | All project members |
| Typing indicator | User is typing | Other channel members |
| Presence update | User connects/disconnects | All connected users |

The socket connection is established automatically on login and torn down on logout. If the connection drops, it automatically reconnects up to 5 times with a 1-second delay between attempts.

---

## Notification Types

The following events generate in-app and/or email notifications:

| Event | Recipient | Channel |
|-------|-----------|---------|
| New task assigned | Assignee | In-app + email |
| Invoice sent | Client | Email |
| Invoice due reminder (D-3) | Client | Email (scheduled job, 9am daily) |
| Invoice paid | Project PM | In-app |
| Contract sent for signing | Client | In-app + email |
| Approval request submitted | Client | In-app + email |
| Approval approved | Project PM | In-app |
| Approval rejected | Project PM | In-app |
| Revision requested | Project PM | In-app |
| New project created | Assigned PM | In-app |
| You were @mentioned | Mentioned user | In-app |
| Team invitation | New team member | Email |
| Client invitation | New client | Email |

---

*This section documents the complete access control system and workflow for Agency OS. For setup instructions, see Sections 1–10 above.*
