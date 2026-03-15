# 🇻🇳 Vietnam Journey Planner

Ứng dụng lập kế hoạch du lịch Việt Nam — admin dashboard quản lý dữ liệu, public frontend cho người xem.

## 🛠 Công nghệ

- **Public frontend**: `public/index.html` — Alpine.js, Tailwind CSS, Leaflet.js
- **Admin dashboard**: `admin/` — React + Vite
- **Backend**: `api/` — Express + SQLite (better-sqlite3), JWT auth
- **Deploy**: Docker multi-stage, Caddy reverse proxy

## 🚀 Chạy local (dev)

Cần **3 terminal song song**:

```bash
# Terminal 1 — API (BẮT BUỘC chạy trước)
cd api && npm install && npm run dev       # port 7321

# Terminal 2 — Admin
cd admin && npm install && npm run dev     # port 3002

# Terminal 3 — Public frontend
cd public && npm install && npm run dev    # port 3000, proxy /api → :7321
```

- **Public**: http://localhost:3000
- **Admin**: http://localhost:3000/admin

> Không dùng `npm run dev` ở root — đó là file cũ, deprecated.

## ⚙️ Biến môi trường

```bash
cp .env.example .env
# Điền JWT_SECRET và ADMIN_PASSWORD
```

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `JWT_SECRET` | ✅ | Secret key JWT |
| `ADMIN_PASSWORD` | ✅ | Mật khẩu admin |
| `DB_PATH` | | Đường dẫn SQLite (mặc định `./travel.db`) |
| `PORT` | | Port API (mặc định `7321`) |
| `VEXERE_USERNAME` | | Tích hợp Vexere (tùy chọn) |
| `VEXERE_PASSWORD` | | Tích hợp Vexere (tùy chọn) |

## 🐳 Docker (Production)

```bash
cp .env.example .env   # chỉnh JWT_SECRET + ADMIN_PASSWORD
mkdir -p data          # thư mục chứa DB
docker compose up -d
```

Caddy/nginx trỏ domain về port 7321. Xem `DEPLOY.md` để biết quy trình deploy đầy đủ.

---
*Phát triển bởi [leolionart](https://github.com/leolionart)*
