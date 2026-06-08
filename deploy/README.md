# CryptoX — VPS Production Deployment Guide

Deploy the full CryptoX platform (API + User Portal + Admin + Go Engine) on your own Ubuntu 22.04 VPS.

---

## Architecture on VPS

```
Internet
   │
   ▼
Nginx (port 80/443 + SSL)
   ├── /user/       → Static files (Vite SPA)
   ├── /admin/      → Static files (Vite SPA)
   ├── /api/        → Node.js API Server (PM2, port 8080)
   └── /go-service/ → Go Order Engine (PM2, port 23004)
             │
             ▼
        PostgreSQL (port 5432, local)
        Redis (embedded in API server — no external Redis needed)
```

---

## Requirements

| Requirement | Minimum | Recommended |
|------------|---------|-------------|
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 80 GB SSD |
| Domain | Required (for SSL) | zebvix.com |

---

## Step 1 — Clone the repo on your VPS

```bash
git clone https://github.com/YOUR_ORG/cryptox.git /opt/cryptox
cd /opt/cryptox
```

---

## Step 2 — Run the VPS installer (as root)

This installs Node.js 24, pnpm, Go, PM2, PostgreSQL, nginx, and configures the firewall.

```bash
sudo bash deploy/install.sh
```

What it does:
- Installs all system dependencies
- Creates `cryptox` system user at `/opt/cryptox`
- Sets up PostgreSQL database + user (auto-generates password)
- Configures UFW firewall (ports 22, 80, 443 only)
- Sets up nginx config and log rotation
- Configures PM2 for auto-start on reboot

---

## Step 3 — Configure environment variables

```bash
cp deploy/.env.example .env
nano .env
```

**Required variables:**

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection (auto-set by install.sh) |
| `SESSION_SECRET` | 64-char random hex — generate with `openssl rand -hex 64` |
| `NODE_ENV` | `production` |
| `PORT` | `8080` (API server port) |

Optional (configure via Admin panel instead):
- Email: configure SMTP/SendGrid/Mailgun in Admin → API Integrations → Email
- Crypto hot wallet: configure in Admin → Networks
- Payment gateway: configure in Admin → API Integrations

---

## Step 4 — Build all services

```bash
sudo -u cryptox bash deploy/build.sh
```

This runs in order:
1. `pnpm install --frozen-lockfile`
2. TypeScript lib build (`tsc --build`)
3. API server esbuild bundle → `artifacts/api-server/dist/`
4. User portal Vite build → `/opt/cryptox/dist/user/`
5. Admin panel Vite build → `/opt/cryptox/dist/admin/`
6. Go service binary → `artifacts/go-service/server`
7. Database schema push (drizzle)
8. PM2 restart (if already running)

---

## Step 5 — Start with PM2

```bash
# Start all services
pm2 start deploy/pm2.config.cjs

# Save PM2 process list (survives reboot)
pm2 save

# View status
pm2 status

# View logs
pm2 logs cryptox-api
pm2 logs cryptox-go
```

---

## Step 6 — SSL with Let's Encrypt

```bash
# Replace zebvix.com with your actual domain
sudo certbot --nginx -d zebvix.com -d www.zebvix.com
```

Certbot auto-renews via cron. Nginx config already has SSL stubs ready.

---

## Step 7 — Verify deployment

```bash
# API health check
curl https://zebvix.com/api/healthz

# Go service health check
curl https://zebvix.com/go-service/healthz

# Check PM2 status
pm2 status

# Check nginx
sudo nginx -t && sudo systemctl status nginx
```

---

## Updating (zero-downtime)

```bash
cd /opt/cryptox

# Pull latest code
git pull origin main

# Rebuild and restart
sudo -u cryptox bash deploy/build.sh
```

PM2 will automatically reload after `build.sh` runs `pm2 restart all`.

---

## PM2 Commands Reference

```bash
pm2 status                    # List all processes
pm2 logs                      # Tail all logs
pm2 logs cryptox-api          # API server logs only
pm2 restart cryptox-api       # Restart API server
pm2 restart cryptox-go        # Restart Go engine
pm2 reload cryptox-api        # Zero-downtime reload (cluster mode)
pm2 stop all                  # Stop all
pm2 delete all                # Remove all from PM2
pm2 monit                     # Live monitoring dashboard
```

---

## Database Management

```bash
# Connect to PostgreSQL
sudo -u postgres psql -d cryptox

# Manual schema push (if needed)
cd /opt/cryptox && pnpm --filter @workspace/db run push

# Backup database
pg_dump -U cryptox cryptox > backup_$(date +%Y%m%d).sql

# Restore from backup
psql -U cryptox cryptox < backup_YYYYMMDD.sql
```

---

## Logs

| Service | Log file |
|---------|----------|
| API Server | `/var/log/cryptox/api.log` |
| API Server (errors) | `/var/log/cryptox/api-error.log` |
| Go Engine | `/var/log/cryptox/go.log` |
| Nginx access | `/var/log/nginx/access.log` |
| Nginx errors | `/var/log/nginx/error.log` |

Logs are rotated daily, kept 14 days, compressed after 1 day.

---

## Admin Panel Setup (first run)

1. Open `https://zebvix.com/admin/`
2. Login with admin credentials
3. Go to **API Integrations → Email** — configure SMTP/SendGrid
4. Go to **Networks** — set hot wallet address + private key for BSC USDT
5. Go to **Exchange Settings** — configure TDS %, trading fees, etc.

---

## Security Hardening (recommended)

```bash
# Disable root SSH login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl reload sshd

# Install fail2ban (done by install.sh)
sudo systemctl enable fail2ban --now

# Restrict admin panel to office IPs (edit nginx.conf)
# Uncomment allow/deny lines in the /admin/ location block
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| API not starting | `pm2 logs cryptox-api` — check for missing env vars |
| DB connection failed | Verify `DATABASE_URL` in `.env`, check PostgreSQL: `sudo systemctl status postgresql` |
| Nginx 502 Bad Gateway | API not running — `pm2 restart cryptox-api` |
| Build fails | Run `pnpm install` first, check Node version: `node --version` (must be v24) |
| Port 8080 in use | `lsof -i :8080` — kill conflicting process |
| SSL not working | `certbot renew --dry-run`, check domain DNS points to VPS IP |
