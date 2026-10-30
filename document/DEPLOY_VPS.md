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
- Backup: admin page, button "Tải file .db về". It is a consistent copy even while the app is in use.
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
