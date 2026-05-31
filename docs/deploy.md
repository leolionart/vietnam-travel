# Quy trình Triển khai (Deploy Runbook)

## Nguyên tắc

Deploy chỉ cập nhật **code + schema**. Không dùng deploy để reset DB, seed lại
plan, hoặc chuyển dữ liệu từ dev/local lên prod.

Mỗi môi trường có SQLite DB riêng:

- Prod: `/data/travel.db` trên VPS.
- Dev/local: DB local theo `DB_PATH`.

Muốn sửa dữ liệu môi trường nào thì dùng Admin/CLI/MCP trỏ trực tiếp vào môi
trường đó. Không đưa dữ liệu plan vào migration hoặc deploy script.

---

## Luồng deploy code

```
Local thay đổi code
    → git push origin main
    → GitHub Actions build Docker image
    → Push image lên GHCR
    → VPS chạy ./scripts/redeploy.sh
```

Trên VPS:

```bash
cd ~/vietnam-travel
./scripts/redeploy.sh
```

`redeploy.sh` luôn giữ nguyên DB hiện tại.

---

## Cài đặt lần đầu

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

Sau khi container chạy, tạo/import plan bằng Admin/CLI/MCP trên chính môi
trường đó.

---

## Thay đổi dữ liệu plan

Không sửa dữ liệu bằng deploy. Dùng một trong các cách sau:

- Admin UI của đúng môi trường.
- CLI với `--api-url` trỏ đúng môi trường.
- MCP với `adminPassword` cho đúng môi trường.
- Backup/restore SQLite thủ công khi thật sự cần thay toàn bộ DB.

Ví dụ đọc prod:

```bash
npm --prefix api run cli -- show-plan <slug> --api-url https://trips.naai.studio
```

Ví dụ sửa prod:

```bash
export TRAVEL_ADMIN_PASSWORD='...'
npm --prefix api run cli -- update-activity <slug> <locationId> <activityId> \
  --api-url https://trips.naai.studio \
  --json '{"scheduledDate":"2026-07-03","scheduledTime":"09:30"}'
```

---

## Schema migration

`api/src/db/migrate.ts` chỉ nâng schema idempotent. Nó không seed plan, không
reset DB, không patch dữ liệu cũ.

Nếu cần thay đổi dữ liệu hàng loạt, tạo tool/CLI riêng và chạy có chủ đích trên
môi trường cần sửa, sau khi backup DB.

---

## Kiểm tra sau deploy

```bash
curl https://yourdomain.com/api/health
docker compose logs -f --tail=50
sqlite3 ~/vietnam-travel/data/travel.db "SELECT COUNT(*) FROM plans;"
```

---

## Rollback code

```bash
docker compose down
# Sửa docker-compose.yml: image: ghcr.io/<owner>/vietnam-travel:sha-<hash>
docker compose up -d
```

Rollback code không rollback DB. Nếu cần rollback dữ liệu, restore từ backup DB.

---

## Cấu hình Caddy

```caddyfile
yourdomain.com {
    reverse_proxy localhost:7321
}
```

---

## Tóm tắt nhanh

| Thay đổi | Cần làm gì trên VPS? |
|----------|----------------------|
| Chỉ code/schema | `./scripts/redeploy.sh` |
| Sửa dữ liệu plan | Admin/CLI/MCP trỏ đúng môi trường |
| Thay toàn bộ DB | Backup/restore SQLite thủ công, ngoài deploy |
| Rollback code | Sửa image tag + `docker compose up -d` |
