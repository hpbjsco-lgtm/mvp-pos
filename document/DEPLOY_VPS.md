# Deploying MVP POS on the VPS (Docker + Apache)

One container runs the database server (`server/pos-db-server`) and also serves the built web app.
The SQLite file lives in a folder on the host, outside the image, so rebuilding or recreating the container never touches it.

```
Browser -> Apache (HTTPS, pos.hp-backup.com) -> 127.0.0.1:8790 (container)
                                                   |- /        web app (built inside the image)
                                                   |- /api     SQL API   (Bearer API_TOKEN)
                                                   |- /admin   admin page (Bearer ADMIN_TOKEN)
                                                   `- /data    pos.db, backups/  (host folder)
```

## 1. Requirements
- Docker Engine with **Linux containers** and the `docker compose` plugin.
  On Windows Server this normally means WSL2 or a Linux VM; Docker Desktop is not supported on Windows Server.
  Check with `docker version` (the server line must say `OS/Arch: linux/...`).
- Apache with `mod_proxy` and `mod_proxy_http` enabled.
- The source code on the server (git clone or copy).

## 2. First deployment
1. Create the data folder, for example `D:\mvp-pos-data`.
2. Copy `deploy/docker.env.example` to `.env` in the project root and set:
   - `API_TOKEN` and `ADMIN_TOKEN`: two different random strings, at least 16 characters.
   - `POS_DATA_DIR`: the data folder, with forward slashes (`D:/mvp-pos-data`).
3. Build and start: `docker compose up -d --build`
4. Check: `curl http://127.0.0.1:8790/api/health` returns `{"ok":true,...}`.
5. Apache: apply `deploy/apache-pos.conf` to the HTTPS virtual host, then restart Apache.
6. Open `https://pos.hp-backup.com/`. On the login screen open "Cài đặt máy chủ dữ liệu", keep the address,
   enter `API_TOKEN`, press "Kiểm tra kết nối", then "Lưu và kết nối".
7. Admin page: `https://pos.hp-backup.com/admin/db`, sign in with `ADMIN_TOKEN`.

### Local address (shop network)
Devices in the shop reach the same container directly through the LAN address of the machine, with no Apache in between,
so they keep working when the internet is down. There is one database.
1. In `.env` (see `deploy/docker.env.example`) open the port to the shop network and set the two routes:
   ```
   POS_BIND_ADDRESS=0.0.0.0
   VITE_SERVER_DOMAIN_URL=https://pos.hp-backup.com
   VITE_SERVER_LOCAL_URL=http://192.168.1.12:8790
   ```
   `192.168.1.12` is the LAN address of this machine (give it a fixed address in the router, or it can change). `8790` is `POS_PORT`.
   Write the domain explicitly: the same web build is also opened at the LAN address, where "the address I was served from" would be the local one.
   Then run `docker compose up -d --build`.
2. Windows Firewall: allow inbound TCP port 8790 for the private (LAN) profile. Apache does not need any change.
3. Check from a device in the shop: `http://192.168.1.12:8790/api/health`.
4. Opening the port also exposes `/admin` and the API (protected by their tokens, over plain http) to everything on the shop network.
   Keep the router from forwarding port 8790 to the internet.
5. Docker running inside WSL2 may not be reachable from the LAN even with `0.0.0.0` (WSL2 has its own network); then a Windows
   port forward (`netsh interface portproxy`) or WSL mirrored networking is needed. This depends on the setup and is not tested here.
6. Browsers block a page opened over `https://` from calling `http://192.168...` (mixed content). Staff who need the local route
   in a browser open the web app at `http://192.168.1.12:8790` (the container serves it). That page calls the domain first and
   switches to the local address itself.
7. A page served from one address that calls another needs CORS: set `CORS_ORIGIN` to the page origins, for example
   `http://192.168.1.12:8790,https://pos.hp-backup.com`. Phone apps add `https://localhost` (Android) and `capacitor://localhost` (iOS).

How the app chooses: it checks `/api/health` of the domain (2.5 s); if the domain does not answer it uses the local address, and while on the
local address it checks the domain again every 15 s and goes back to it. A request that cannot connect is repeated once on the other address.
A write that timed out is not repeated (it may have been stored); the app says so and asks to check the data.

## 3. Moving the data that is already in a browser
On the browser that holds the data, open "Cài đặt máy chủ dữ liệu", enter the admin token and press
"Chuyển dữ liệu lên máy chủ". This **replaces** the data on the server; the server first saves a copy in
`<POS_DATA_DIR>/backups/`.

## 4. Updating the application
```
git pull
docker compose up -d --build
```
Only the image is rebuilt. The data folder is not changed. The app applies new schema migrations to the database by itself on start.

## 5. Backup and restore
- Backup by hand: admin page, button "Tải file .db về". It is a consistent copy even while the app is in use.
- Scheduled backup: the server writes `backups/pos-auto-<time>.db` every `BACKUP_INTERVAL_HOURS` (default 24; `0` turns it off) and keeps the newest `BACKUP_KEEP` (default 14). It checks at start-up, so a restart after a long stop makes a backup at once. Copies stay on the same disk as the database: copy the `backups/` folder to another machine or storage now and then.
  Do not copy `pos.db` alone from the folder while the container runs: recent data may still be in `pos.db-wal`.
- Restore: admin page, button "Nạp file .db lên". The previous data is saved in `backups/` first.
- Schedule the download (or a copy of the folder while the container is stopped) outside the server as well.

## 6. Security notes
- `API_TOKEN` is saved in the browser of every device that connects. Anyone with it can read and write all data. Use HTTPS only.
- Keep `ADMIN_TOKEN` to yourself: it opens `/admin/db`, which can edit or replace the whole database.
- The container port is bound to `127.0.0.1`, so it is reachable only through Apache.

## 7. Troubleshooting
- `docker compose` stops with "API_TOKEN is required": `.env` is missing or not in the project root.
- The app shows "Không mở được cơ sở dữ liệu": the address or `API_TOKEN` is wrong, or the container is not running
  (`docker compose ps`, `docker compose logs pos`).
- The login screen cannot reach `/api`: Apache modules or the `ProxyPass` lines are missing.
- Permission error on the data folder (Linux hosts): the container runs as user `node` (uid 1000); `chown 1000:1000 <folder>`.
