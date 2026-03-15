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

## 🤖 MCP Server — Lập kế hoạch bằng AI

Kết nối Claude Code, Cursor, hay bất kỳ AI client hỗ trợ MCP để lập kế hoạch du lịch và nhận link chia sẻ ngay, **không cần đăng nhập**.

### Cách hoạt động

1. AI dùng MCP tools để tạo plan với slug tuỳ chỉnh
2. Thêm các điểm dừng, lịch trình, chi phí, ẩm thực địa phương
3. Nhận link dạng `https://vietroadtrips.com/?session=<token>` để chia sẻ

> Plans tạo qua public MCP là **session plans** — không xuất hiện trong danh sách chính của website, chỉ truy cập được qua link session. Điều này ngăn DB bị "ô nhiễm" bởi nội dung người dùng.

### Cấu hình cho Claude Code / Cursor

Thêm vào `~/.claude/claude_desktop_config.json` (Claude) hoặc `~/.cursor/mcp.json` (Cursor):

```json
{
  "mcpServers": {
    "viet-roadtrips": {
      "command": "npx",
      "args": ["-y", "tsx", "/đường-dẫn-tuyệt-đối/vietnam-travel/api/src/mcp.ts"],
      "env": {
        "REMOTE_API_URL": "https://vietroadtrips.com"
      }
    }
  }
}
```

> **Không cần `ADMIN_PASSWORD`** — plans tạo qua MCP dùng public API mở, không yêu cầu xác thực.

### Cấu hình khi tự host (local)

Nếu chạy server tại máy, bỏ `REMOTE_API_URL` để MCP truy cập SQLite trực tiếp:

```json
{
  "mcpServers": {
    "viet-roadtrips": {
      "command": "npx",
      "args": ["-y", "tsx", "/đường-dẫn/vietnam-travel/api/src/mcp.ts"],
      "env": {
        "DOTENV_CONFIG_PATH": "/đường-dẫn/vietnam-travel/.env"
      }
    }
  }
}
```

### Ví dụ prompt

Sau khi cấu hình xong, thử nhắn với AI:

```
Lập kế hoạch 5 ngày Hà Nội → Ninh Bình → Sầm Sơn cho 2 người lớn, 1 trẻ em, tháng 7/2026.
Tạo plan slug "ha-noi-ninh-binh-sam-son-t7", thêm điểm tham quan nổi bật mỗi điểm dừng,
gợi ý đặc sản địa phương và ước tính chi phí. Trả về link chia sẻ.
```

AI sẽ tạo plan hoàn chỉnh và trả về link như:

```
https://vietroadtrips.com/?slug=ha-noi-ninh-binh-sam-son-t7
```

### Danh sách MCP tools

| Tool | Mô tả |
|------|-------|
| `list_plans` | Liệt kê tất cả plans |
| `get_plan` | Xem chi tiết plan (locations + sub-locations) |
| `create_plan` | Tạo plan mới → trả về `shareUrl` |
| `update_plan` | Đổi tên hoặc slug |
| `delete_plan` | Xóa plan |
| `add_location` | Thêm điểm dừng (tỉnh/thành) với đầy đủ thông tin |
| `update_location` | Cập nhật thông tin điểm dừng |
| `delete_location` | Xóa điểm dừng |
| `add_sub_location` | Thêm điểm tham quan con (vd: Vịnh Hạ Long trong Quảng Ninh) |
| `update_sub_location` | Cập nhật điểm tham quan con |
| `delete_sub_location` | Xóa điểm tham quan con |

### Biến môi trường MCP

| Biến | Mô tả |
|------|-------|
| `REMOTE_API_URL` | URL server (vd: `https://vietroadtrips.com`). Nếu không set → dùng local DB. |
| `ADMIN_PASSWORD` | Mật khẩu admin (tuỳ chọn). Nếu không set → dùng public API. |
| `DOTENV_CONFIG_PATH` | Đường dẫn file `.env` khi dùng local mode. |

---
*Phát triển bởi [leolionart](https://github.com/leolionart)*
