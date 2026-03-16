# Quy trình Triển khai (Deploy Runbook)

## Tổng quan luồng

```
Local thay đổi code/data
    → git push origin main
    → GitHub Actions build Docker image
    → Push image lên GHCR (ghcr.io/<owner>/vietnam-travel)
    → SSH vào VPS
    → docker compose pull && docker compose up -d
```

Nguồn dữ liệu duy nhất là **SQLite DB** (`/data/travel.db` trên VPS).
`plans.json` ở root chỉ dùng để **seed DB khi fresh deploy** — không phục vụ frontend.

---

## 1. Cài đặt lần đầu trên VPS

```bash
git clone https://github.com/<owner>/vietnam-travel.git
cd vietnam-travel

cp .env.example .env
nano .env
# JWT_SECRET=<openssl rand -hex 32>
# ADMIN_PASSWORD=<mật khẩu admin>

mkdir -p data
docker compose pull
docker compose up -d
```

Khi DB còn trống, container tự động seed từ `plans.json` + `SUB_LOCATION_SEEDS` trong `migrate.ts`.

---

## 2. Deploy khi chỉ thay đổi code

```bash
git add .
git commit -m "feat: ..."
git push origin main
# GitHub Actions build image → push lên GHCR

# Sau khi CI xanh, trên VPS:
cd ~/vietnam-travel
docker compose pull && docker compose up -d
```

---

## 3. Deploy khi có thay đổi dữ liệu

### 3a. Thêm sub-location mới

**Bước 1 — Thêm vào seed (để future fresh deploy có sẵn):**

Mở `api/src/db/migrate.ts`, thêm vào `SUB_LOCATION_SEEDS`:

```typescript
{
  planSlug: 'ten-slug-cua-plan',
  locationName: 'Tên tỉnh',
  sortOrder: 5,
  name: 'Tên địa điểm',
  lat: 15.880, lng: 108.338,
  durationMinutes: 120,
  description: 'Mô tả...',
  adultPrice: 50000,
  childPrice: 30000
},
```

**Bước 2 — Cập nhật DB trực tiếp trên VPS (không cần reset):**

```bash
sqlite3 ~/vietnam-travel/data/travel.db << 'SQL'
INSERT INTO sub_locations (location_id, sort_order, name, lat, lng, duration_minutes, description, adult_price, child_price)
SELECT l.id, 5, 'Tên địa điểm', 15.880, 108.338, 120, 'Mô tả...', 50000, 30000
FROM locations l JOIN plans p ON l.plan_id = p.id
WHERE p.slug = 'ten-slug-cua-plan' AND l.name = 'Tên tỉnh'
ORDER BY l.id ASC LIMIT 1;
SQL
```

**Bước 3 — Push code + pull image mới:**

```bash
git add api/src/db/migrate.ts
git commit -m "data: add <tên địa điểm> sub-location seed"
git push origin main
# Sau CI: docker compose pull && docker compose up -d
```

---

### 3b. Thêm plan/location mới hoặc đổi cấu trúc lớn

**Cách 1 — Reset DB (đơn giản, seed lại từ đầu):**

```bash
# Trên VPS
docker compose down
rm ~/vietnam-travel/data/travel.db
docker compose pull
docker compose up -d   # migration chạy lại, seed đầy đủ từ plans.json
```

**Cách 2 — Migration thủ công (giữ data hiện có):**

```bash
sqlite3 ~/vietnam-travel/data/travel.db "ALTER TABLE locations ADD COLUMN new_field TEXT DEFAULT '';"
docker compose pull && docker compose up -d
```

---

### 3c. Thay đổi plans.json (seed data)

`plans.json` là nguồn seed cho DB khi fresh deploy. Sau khi sửa, chỉ cần push — image mới sẽ chứa file mới nhất để dùng khi reset DB.

```bash
git add plans.json api/src/db/migrate.ts
git commit -m "data: ..."
git push origin main
# Trên VPS: ./scripts/redeploy.sh   (reset DB + seed lại)
```

---

## 4. Script redeploy.sh

```bash
# Reset DB + seed lại từ plans.json mới nhất
./scripts/redeploy.sh

# Chỉ deploy code mới, KHÔNG reset DB
./scripts/redeploy.sh --keep-db
```

`FORCE_MIGRATE=true` khiến `migrate.ts` xóa data cũ trước khi seed lại.

---

## 5. Kiểm tra sau deploy

```bash
curl https://yourdomain.com/api/health
docker compose logs -f --tail=50
sqlite3 ~/vietnam-travel/data/travel.db "SELECT COUNT(*) FROM sub_locations;"
```

---

## 6. Rollback

```bash
docker compose down
# Sửa docker-compose.yml: image: ghcr.io/<owner>/vietnam-travel:sha-<hash>
docker compose up -d
```

---

## 7. Cấu hình Caddy

```caddyfile
yourdomain.com {
    reverse_proxy localhost:7321
}
```

---

## Tóm tắt nhanh

| Thay đổi | Cần làm gì trên VPS? |
|----------|----------------------|
| Chỉ code | `./scripts/redeploy.sh --keep-db` |
| Sửa plans.json / data | `./scripts/redeploy.sh` (reset DB + seed lại) |
| Thêm sub-location | Insert SQL trực tiếp + `./scripts/redeploy.sh --keep-db` |
| Rollback | Sửa image tag + `docker compose up -d` |
