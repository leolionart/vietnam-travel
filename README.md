# 🇻🇳 Vietnam Journey Planner

Ứng dụng lập kế hoạch và chia sẻ hành trình du lịch Việt Nam, với admin dashboard để quản lý dữ liệu và public frontend cho người xem.

## 🛠 Công nghệ

- **Public frontend**: Alpine.js, Tailwind CSS, Leaflet.js, OSRM routing
- **Admin dashboard**: React + Vite, dnd-kit drag-and-drop
- **Backend**: Express + SQLite (better-sqlite3), JWT auth
- **Deploy**: Docker, Caddy reverse proxy

## 🚀 Cài đặt & Chạy

### Development

```bash
# 1. Cài dependencies
cd api && npm install
cd ../admin && npm install
cd ../public && npm install

# 2. Tạo file .env từ mẫu
cp .env.example .env
# Điền JWT_SECRET, ADMIN_PASSWORD theo ý muốn

# 3. Chạy 3 server song song
cd api   && npm run dev          # API :7321
cd admin && npx vite --port 3002 # Admin :3002
cd public && npx vite --port 3000 # Public :3000 (proxy /api và /admin)
```

Truy cập:
- Public: http://localhost:3000
- Admin: http://localhost:3000/admin

### Docker (Production)

```bash
cp .env.example .env
# Chỉnh sửa .env với giá trị production (bắt buộc đổi JWT_SECRET + ADMIN_PASSWORD)

docker compose up -d
```

Container production chỉ chạy trên Linux Docker host (image build bởi CI là linux/amd64).

Sau đó cấu hình Caddy/nginx trỏ domain về port 7321.

## ⚙️ Biến môi trường

Tạo file `.env` từ `.env.example`:

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `JWT_SECRET` | ✅ | Secret key để ký JWT (đặt chuỗi ngẫu nhiên dài) |
| `ADMIN_PASSWORD` | ✅ | Mật khẩu đăng nhập admin dashboard |
| `DB_PATH` | | Đường dẫn SQLite DB (mặc định `./travel.db`) |
| `PORT` | | Port API server (mặc định `7321`) |
| `VEXERE_USERNAME` | | Username tài khoản Vexere agent |
| `VEXERE_PASSWORD` | | Password tài khoản Vexere agent |
| `VEXERE_USE_UAT` | | `true` để dùng môi trường test của Vexere |

## 🎫 Tích hợp Vexere (tùy chọn)

Nếu cấu hình `VEXERE_USERNAME` và `VEXERE_PASSWORD`, API có thể gọi Vexere để lấy dữ liệu chuyến/giá.

**Cách cấu hình:**
1. Điền username và password tài khoản Vexere agent vào `.env`
2. API sử dụng `grant_type=password` để lấy token từ `account-service.vexere.com`

Nếu không cấu hình, phần tích hợp Vexere sẽ tự động tắt (mọi tính năng khác vẫn hoạt động bình thường).

---
*Phát triển bởi [leolionart](https://github.com/leolionart)*
