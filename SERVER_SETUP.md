# SFL Server Setup

Instructions for Claude (or a human) to set up the SFL API on a fresh Ubuntu server.

---

## Prerequisites

```bash
# Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm
npm install -g pnpm

# Build tools (required for better-sqlite3 native addon)
sudo apt-get install -y build-essential python3

# git
sudo apt-get install -y git
```

Verify:
```bash
node --version   # should be v20+
pnpm --version
```

---

## 1. Clone and install

```bash
git clone https://github.com/phareim/sfl.git /opt/sfl
cd /opt/sfl
pnpm install
```

---

## 2. Create data directory

```bash
sudo mkdir -p /data/sfl
sudo chown $USER:$USER /data/sfl
```

---

## 3. Get R2 credentials

In the Cloudflare dashboard:

1. **Account ID** — visible on the right side of the Workers & Pages overview page
2. **R2 API token** — R2 → Manage R2 API Tokens → Create API Token → give it **Object Read & Write** on your bucket
3. Copy the **Access Key ID** and **Secret Access Key** shown after creation (only shown once)
4. **Bucket name** — the name of the R2 bucket you created (e.g. `sfl-data`)

If the bucket doesn't exist yet:
```bash
npx wrangler r2 bucket create sfl-data
```

---

## 4. Create the environment file

```bash
cat > /opt/sfl/api/.env <<EOF
API_KEY=$(openssl rand -hex 32)
SQLITE_PATH=/data/sfl/sfl.db
R2_ACCOUNT_ID=REPLACE_ME
R2_ACCESS_KEY_ID=REPLACE_ME
R2_SECRET_ACCESS_KEY=REPLACE_ME
R2_BUCKET=sfl-data
ANTHROPIC_API_KEY=REPLACE_ME
PORT=8080
# Optional: set both to forward chat messages to an external webhook instead of AI
# WEBHOOK_URL=https://...
# WEBHOOK_SECRET=some-secret
EOF
```

Fill in the `REPLACE_ME` values. Print the generated API key and save it:
```bash
grep API_KEY /opt/sfl/api/.env
```

---

## 5. Test run

```bash
cd /opt/sfl/api
node --env-file=.env src/server.js
```

Expected output:
```
Database initialized at /data/sfl/sfl.db
SFL API listening on port 8080
```

Test in another terminal:
```bash
curl http://localhost:8080/health
# → {"ok":true}
```

Stop with Ctrl-C.

---

## 6. systemd service

```bash
sudo tee /etc/systemd/system/sfl-api.service > /dev/null <<EOF
[Unit]
Description=SFL API
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/sfl/api
EnvironmentFile=/opt/sfl/api/.env
ExecStart=$(which node) src/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable sfl-api
sudo systemctl start sfl-api
sudo systemctl status sfl-api
```

View logs:
```bash
journalctl -u sfl-api -f
```

---

## 7. Reverse proxy (nginx)

```bash
sudo apt-get install -y nginx

sudo tee /etc/nginx/sites-available/sfl > /dev/null <<'EOF'
server {
    listen 80;
    server_name your-domain.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/sfl /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### TLS (Let's Encrypt)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example.com
```

---

## 8. Verification

```bash
# Health check
curl https://your-domain.example.com/health

# Authenticated request (replace KEY with value from step 4)
curl -H "Authorization: Bearer KEY" https://your-domain.example.com/api/ideas
# → {"ideas":[],"nextCursor":null}

# Create an idea
curl -X POST https://your-domain.example.com/api/ideas \
  -H "Authorization: Bearer KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"note","title":"Hello from the server","data":{"text":"It works!"}}'
```

---

## Updating

```bash
cd /opt/sfl
git pull
pnpm install
sudo systemctl restart sfl-api
```

---

## Configure clients

Once the API is running, update the URL in each client:

| Client | Where |
|--------|-------|
| Web app | Settings page → API URL |
| Chrome extension | Extension options → API URL |
| iOS app | Settings tab → API URL |
| macOS app | Menu bar → ⚙ Settings → API URL |
| CLI | `~/.config/sfl/config.json` → `SFL_API_URL` |
| Claude Code MCP | `claude mcp add --transport http --scope user sfl https://your-domain.example.com/mcp --header "Authorization: Bearer KEY"` |
