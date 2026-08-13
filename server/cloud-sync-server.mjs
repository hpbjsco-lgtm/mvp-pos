/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MÁY CHỦ ĐỒNG BỘ CLOUD MẪU CHO SMARTPOS
 * --------------------------------------
 * Đây là bản hiện thực tối giản của giao thức mà app đang dùng (src/cloud/cloudSync.ts).
 * Mỗi cửa hàng được lưu thành 1 tệp JSON trong thư mục ./cloud-data.
 *
 * Chạy:
 *    SYNC_TOKEN=chuoi-bao-mat-cua-ban node server/cloud-sync-server.mjs
 *    (mặc định cổng 8787 - đổi bằng biến môi trường PORT)
 *
 * Trong app: mở "Đồng bộ Cloud" -> nhập endpoint http://<ip-may-chu>:8787 và token.
 *
 * Triển khai thật nên đặt sau HTTPS (Nginx/Caddy) và thay tệp JSON bằng Postgres
 * hoặc object storage (S3/GCS). Cấu trúc dữ liệu snapshot giữ nguyên.
 */

import express from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.SYNC_TOKEN || '';
const DATA_DIR = process.env.SYNC_DATA_DIR || path.resolve('cloud-data');

const app = express();
app.use(express.json({ limit: '128mb' }));

/* CORS: cho phép app (web / WebView native) gọi trực tiếp. */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Id');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function authorize(req, res) {
  if (!TOKEN) return true; // Không đặt SYNC_TOKEN = chế độ mở (chỉ dùng khi thử nghiệm LAN)
  const header = req.get('Authorization') || '';
  if (header === `Bearer ${TOKEN}`) return true;
  res.status(401).json({ error: 'Token không hợp lệ' });
  return false;
}

const safeId = (id) => String(id).replace(/[^a-zA-Z0-9._-]/g, '_');
const snapshotPath = (storeId) => path.join(DATA_DIR, `${safeId(storeId)}.snapshot.json`);
const changesPath = (storeId) => path.join(DATA_DIR, `${safeId(storeId)}.changes.jsonl`);

await fs.mkdir(DATA_DIR, { recursive: true });

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'smartpos-cloud-sync', time: new Date().toISOString() });
});

/** Nhận snapshot đầy đủ từ một thiết bị. */
app.put('/stores/:storeId/snapshot', async (req, res) => {
  if (!authorize(req, res)) return;
  const { storeId } = req.params;
  const incoming = req.body;

  if (!incoming || incoming.format !== 'smartpos-snapshot') {
    return res.status(400).json({ error: 'Body không phải snapshot SmartPOS' });
  }

  try {
    let version = 1;
    let merged = incoming;

    /* Nếu Cloud đã có dữ liệu: hợp nhất theo nguyên tắc bản mới thắng (rev, rồi updated_at). */
    const existing = await readJson(snapshotPath(storeId));
    if (existing) {
      version = Number(existing.cloudVersion || 0) + 1;
      merged = mergeSnapshots(existing, incoming);
    }

    merged.cloudVersion = version;
    merged.cloudUpdatedAt = new Date().toISOString();
    merged.storeId = storeId;

    await fs.writeFile(snapshotPath(storeId), JSON.stringify(merged), 'utf8');
    console.log(`[CLOUD] Lưu snapshot cửa hàng ${storeId} (v${version}) từ thiết bị ${incoming.deviceId}`);
    res.json({ ok: true, version, updatedAt: merged.cloudUpdatedAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/** Trả snapshot hiện tại của cửa hàng cho thiết bị. */
app.get('/stores/:storeId/snapshot', async (req, res) => {
  if (!authorize(req, res)) return;
  const data = await readJson(snapshotPath(req.params.storeId));
  if (!data) return res.status(404).json({ error: 'Chưa có dữ liệu cho cửa hàng này' });
  res.json(data);
});

/** Nhận danh sách thay đổi tăng dần (nhẹ hơn snapshot). */
app.post('/stores/:storeId/changes', async (req, res) => {
  if (!authorize(req, res)) return;
  const { storeId } = req.params;
  const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
  if (changes.length === 0) return res.json({ ok: true, accepted: 0 });

  try {
    const lines = changes.map((c) => JSON.stringify({ ...c, receivedAt: new Date().toISOString() })).join('\n');
    await fs.appendFile(changesPath(storeId), lines + '\n', 'utf8');

    /* Áp các thay đổi vào snapshot đang lưu để lần pull sau có dữ liệu mới nhất. */
    const snapshot = (await readJson(snapshotPath(storeId))) || {
      format: 'smartpos-snapshot',
      version: 1,
      schemaVersion: 1,
      storeId,
      tables: {},
      counts: {},
      cloudVersion: 0,
    };
    for (const change of changes) {
      if (!change?.table || !change?.row) continue;
      const list = (snapshot.tables[change.table] ||= []);
      const pk = change.table === 'users' ? 'uid' : 'id';
      const idx = list.findIndex((r) => String(r[pk]) === String(change.rowId));
      if (idx >= 0) list[idx] = { ...list[idx], ...change.row };
      else list.push(change.row);
    }
    for (const [table, rows] of Object.entries(snapshot.tables)) snapshot.counts[table] = rows.length;
    snapshot.cloudVersion = Number(snapshot.cloudVersion || 0) + 1;
    snapshot.cloudUpdatedAt = new Date().toISOString();
    await fs.writeFile(snapshotPath(storeId), JSON.stringify(snapshot), 'utf8');

    res.json({ ok: true, accepted: changes.length, version: snapshot.cloudVersion });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/** Danh sách cửa hàng đang có trên Cloud (tiện cho quản trị). */
app.get('/stores', async (req, res) => {
  if (!authorize(req, res)) return;
  const files = await fs.readdir(DATA_DIR).catch(() => []);
  const stores = [];
  for (const f of files.filter((f) => f.endsWith('.snapshot.json'))) {
    const data = await readJson(path.join(DATA_DIR, f));
    if (!data) continue;
    stores.push({
      storeId: data.storeId,
      cloudVersion: data.cloudVersion,
      cloudUpdatedAt: data.cloudUpdatedAt,
      counts: data.counts,
    });
  }
  res.json({ stores });
});

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Hợp nhất 2 snapshot: với mỗi dòng, bản có rev/updated_at mới hơn sẽ thắng. */
function mergeSnapshots(base, incoming) {
  const out = { ...incoming, tables: {}, counts: {} };
  const tableNames = new Set([...Object.keys(base.tables || {}), ...Object.keys(incoming.tables || {})]);

  for (const table of tableNames) {
    const pk = table === 'users' ? 'uid' : 'id';
    const map = new Map();
    for (const row of base.tables?.[table] || []) map.set(String(row[pk]), row);
    for (const row of incoming.tables?.[table] || []) {
      const key = String(row[pk]);
      const current = map.get(key);
      if (!current) {
        map.set(key, row);
        continue;
      }
      const a = Number(row.rev || 0);
      const b = Number(current.rev || 0);
      const at = String(row.updated_at || row.created_at || '');
      const bt = String(current.updated_at || current.created_at || '');
      map.set(key, a > b || (a === b && at >= bt) ? row : current);
    }
    out.tables[table] = [...map.values()];
    out.counts[table] = out.tables[table].length;
  }
  return out;
}

app.listen(PORT, () => {
  console.log(`SmartPOS Cloud Sync đang chạy tại http://0.0.0.0:${PORT}`);
  console.log(`Thư mục dữ liệu: ${DATA_DIR}`);
  console.log(TOKEN ? 'Xác thực: BẬT (Bearer token)' : 'Xác thực: TẮT (đặt SYNC_TOKEN để bật)');
});
