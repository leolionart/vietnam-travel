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

---

## 1. Cài đặt lần đầu trên VPS

```bash
# Clone repo (chỉ cần Dockerfile + docker-compose.yml + .env)
git clone https://github.com/<owner>/vietnam-travel.git
cd vietnam-travel

# Tạo file .env từ mẫu, điền giá trị thật
cp .env.example .env
nano .env
# JWT_SECRET=<chuỗi ngẫu nhiên dài, ví dụ: openssl rand -hex 32>
# ADMIN_PASSWORD=<mật khẩu admin>

# Tạo thư mục data để mount DB
mkdir -p data

# Pull image mới nhất và khởi chạy
docker compose pull
docker compose up -d
```

Container sẽ tự động chạy migration và seed dữ liệu từ `plans.json` + `SUB_LOCATION_SEEDS` khi DB còn trống.

---

## 2. Deploy khi chỉ thay đổi code (không có dữ liệu mới)

```bash
# Trên máy local
git add .
git commit -m "feat: ..."
git push origin main

# GitHub Actions tự build image → push lên GHCR
# Theo dõi tại: https://github.com/<owner>/vietnam-travel/actions

# Sau khi CI xanh, trên VPS
cd ~/vietnam-travel
docker compose pull
docker compose up -d
```

---

## 3. Deploy khi có thay đổi dữ liệu backend

Có **2 kịch bản** tùy theo mức độ thay đổi.

### 3a. Thêm sub-location (địa điểm du lịch) mới

**Bước 1 — Thêm vào code (để future fresh deploy cũng có):**

Mở `api/src/db/migrate.ts`, thêm vào mảng `SUB_LOCATION_SEEDS`:

```typescript
{
  planSlug: 'da-nang-nghe-an-ninh-binh-ha-noi',
  locationName: 'Hội An',
  sortOrder: 5,
  name: 'Tên địa điểm',
  lat: 15.880, lng: 108.338,
  durationMinutes: 120,
  description: 'Mô tả...',
  adultPrice: 50000,
  childPrice: 30000
},
```

**Bước 2 — Push lên main để CI build image mới:**

```bash
git add api/src/db/migrate.ts
git commit -m "data: add <tên địa điểm> sub-location seed"
git push origin main
```

**Bước 3 — Cập nhật DB trực tiếp trên VPS (không cần reset):**

```bash
# SSH vào VPS
sqlite3 ~/vietnam-travel/data/travel.db << 'SQL'
INSERT INTO sub_locations (location_id, sort_order, name, lat, lng, duration_minutes, description, adult_price, child_price)
SELECT l.id, 5, 'Tên địa điểm', 15.880, 108.338, 120, 'Mô tả...', 50000, 30000
FROM locations l JOIN plans p ON l.plan_id = p.id
WHERE p.slug = 'da-nang-nghe-an-ninh-binh-ha-noi' AND l.name = 'Hội An'
ORDER BY l.id ASC LIMIT 1;
SQL
```

**Bước 4 — Pull image mới và restart:**

```bash
docker compose pull && docker compose up -d
```

---

### 3b. Thêm plan/location mới hoặc đổi cấu trúc lớn

**Cách 1 — Reset DB (đơn giản, mất data đã thêm qua admin UI):**

```bash
# VPS
docker compose down
rm ~/vietnam-travel/data/travel.db
docker compose pull
docker compose up -d   # migration chạy lại từ đầu, seed đầy đủ
```

**Cách 2 — Migration thủ công (giữ nguyên data):**

```bash
# Thêm cột mới
sqlite3 ~/vietnam-travel/data/travel.db "ALTER TABLE locations ADD COLUMN new_field TEXT DEFAULT '';"

# Thêm plan mới từ plans.json
# (Viết script node hoặc insert thủ công)

docker compose pull && docker compose up -d
```

---

### 3c. Thay đổi plans.json (dữ liệu static)

`plans.json` được dùng cho:
- Seed DB khi fresh deploy
- GitHub Pages static build (không có API)
- Dockerfile copy vào image tại `/app/plans.json`

Sau khi sửa `plans.json`, chỉ cần push lên main như bình thường. Image mới sẽ chứa file `plans.json` mới nhất.

```bash
git add plans.json
git commit -m "data: update plans.json ..."
git push origin main
# Sau CI: docker compose pull && docker compose up -d trên VPS
```

---

## 4. Kiểm tra sau deploy

```bash
# Health check
curl https://yourdomain.com/api/health

# Xem logs
docker compose logs -f --tail=50

# Kiểm tra DB
sqlite3 ~/vietnam-travel/data/travel.db "SELECT COUNT(*) FROM sub_locations;"
```

---

## 5. Rollback

```bash
# Xem các tag image có sẵn
docker images ghcr.io/<owner>/vietnam-travel

# Rollback về SHA cụ thể
docker compose down
# Sửa docker-compose.yml: image: ghcr.io/<owner>/vietnam-travel:sha-<hash>
docker compose up -d

# Hoặc rollback về tag main trước đó qua GHCR UI
```

---

## 6. Cấu hình Caddy (reverse proxy)

```caddyfile
yourdomain.com {
    reverse_proxy localhost:7321
}
```

---

## 7. Deploy từ local lên (luôn sync dữ liệu)

Workflow được khuyến nghị khi bạn muốn VPS luôn phản ánh đúng `plans.json` trên local:

```bash
# 1. Commit & push lên GitHub
git add plans.json api/src/db/migrate.ts
git commit -m "data: ..."
git push origin main

# 2. GitHub Actions tự build image mới → push lên GHCR
# Theo dõi tại: https://github.com/<owner>/vietnam-travel/actions

# 3. Sau khi CI xanh, SSH vào VPS và chạy:
./scripts/redeploy.sh
# Script sẽ: pull image mới → down → FORCE_MIGRATE=true up -d
# → container xóa sạch DB cũ, seed lại từ plans.json mới nhất
```

**Cơ chế hoạt động:**
- `FORCE_MIGRATE=true` env var khiến `migrate.ts` xóa toàn bộ data cũ trước khi seed lại
- Script `redeploy.sh` đặt biến này tự động → không cần xóa file `travel.db` thủ công

```bash
# Nếu chỉ deploy code mới, KHÔNG reset DB:
./scripts/redeploy.sh --keep-db
```

---

## Tóm tắt nhanh

| Thay đổi | Cần làm gì trên VPS? |
|----------|----------------------|
| Chỉ code (không đổi data) | `./scripts/redeploy.sh --keep-db` |
| Sửa `plans.json` / data | `./scripts/redeploy.sh` (reset DB + seed lại) |
| Thêm sub-location | `./scripts/redeploy.sh` |
| Rollback | `docker compose down` + sửa image tag + `./scripts/redeploy.sh` |
