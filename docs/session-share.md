# Logic Session & Chia sẻ lịch trình

> Áp dụng cho: `public/index.html` (frontend) + `api/src/routes/sessions.ts` + `api/src/db/schema.sql`

---

## Tổng quan

Có **2 loại session** hoàn toàn khác nhau, đều dùng `?session=` trên URL:

| Loại | Ai tạo | Mục đích | API endpoint |
|------|--------|----------|-------------|
| **User session** | Visitor tự tạo khi chỉnh sửa | Lưu customization (headcount, bỏ điểm) | `POST /api/sessions` |
| **Session plan** | Public MCP (AI tool) | Plan hoàn toàn mới, không liên kết slug | `GET /api/sessions/plan/:id` |

---

## Phần 1: User Session (chia sẻ customization)

### Luồng tạo session

```
User thay đổi gì đó (headcount, bỏ sub-location, bỏ location)
    → scheduleSessionSave() — debounce 900ms
    → flushSession()
        ├─ Chưa có mySessionId?
        │       POST /api/sessions { planSlug, custom }
        │       ← { id: "abc123def456" }
        │       → lưu mySessionId = "abc123def456"
        │       → URL đổi thành ?slug=ha-noi-hue&session=abc123def456
        │       → hiện toast "Link sẵn sàng chia sẻ"
        └─ Đã có mySessionId?
                PATCH /api/sessions/:id { custom }  ← silent update
```

### `custom` payload chứa gì

```json
{
  "headcounts": {
    "101": { "adults": 3, "children": 1 },
    "102": { "adults": 3, "children": 1 }
  },
  "excludedSubs": {
    "201": true,
    "205": true
  },
  "excludedLocations": {
    "103": true
  }
}
```

`headcounts` key = `location.id` (số), value = số người lớn/trẻ em tại điểm đó.

### Luồng load session (khi mở link chia sẻ)

```
URL có ?session=abc123def456
    → fetch GET /api/sessions/abc123def456
    ← { planSlug, custom: { headcounts, excludedSubs, excludedLocations } }
    → apply vào plan đang xem:
        - ghi đè adults/children từng location
        - set excludedSubs, excludedLocations
    → sessionSourceId = "abc123def456"   ← ghi nhớ "đây là của người khác"
    → mySessionId = null                 ← chưa phải của mình
```

### Fork khi chỉnh sửa link người khác

```
Đang xem ?session=abc123def456 của bạn
    → User thay đổi số người
    → scheduleSessionSave() → flushSession()
    → mySessionId = null → tạo session MỚI
    → mySessionId = "xyz789..."
    → URL đổi thành ?session=xyz789...
    → Session "abc123def456" nguyên vẹn, không bị sửa
```

> **Quy tắc bất biến:** `sessionSourceId` chỉ là "bản đọc tham chiếu". User không bao giờ PATCH session của người khác — chỉ tạo session mới riêng của mình.

---

## Phần 2: Session Plan (tạo bởi AI/MCP)

Loại session này **chứa cả data plan** (không chỉ customization), dùng khi AI tool muốn tạo một plan riêng không can thiệp vào DB chính.

```
URL: ?session=mcp-abc123
    → fetch GET /api/sessions/plan/mcp-abc123
    → nếu ok: load plan từ session (không từ slug DB)
    → isSessionPlan = true
    → ẩn thanh chọn plan trên header
```

Khi `isSessionPlan = true`: header không hiển thị danh sách plan picker, chỉ hiện plan hiện tại.

---

## Phần 3: Trạng thái icon Share

Icon chia sẻ ở footer bar đổi trạng thái:

| Trạng thái | Màu dot | Title tooltip |
|------------|---------|--------------|
| Chưa có session | Không dot | "Lưu & chia sẻ lịch trình" |
| Đang xem session người khác (`sessionSourceId`) | 🟡 Amber | "Lưu bản của bạn & chia sẻ" |
| Đã có session riêng (`mySessionId`) | 🔵 Blue | "Lịch trình của bạn đã lưu — Chia sẻ" |

---

## Phần 4: Database

```sql
CREATE TABLE user_sessions (
    id         TEXT    PRIMARY KEY,      -- 12-char hex: randomUUID().replace(/-/g,'').slice(0,12)
    plan_slug  TEXT    NOT NULL,
    custom     TEXT    NOT NULL DEFAULT '{}',  -- JSON string của custom payload
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

Không có expiry — sessions tồn tại mãi. Không có auth — ai có ID đều đọc được.

---

## Phần 5: URL params đầy đủ

| Param | Ví dụ | Ý nghĩa |
|-------|-------|---------|
| `?slug=` | `?slug=ha-noi-hue-da-nang` | Load plan theo slug |
| `?plan=` | `?plan=ha-noi-hue-da-nang` | Alias cũ của `?slug=` |
| `?session=` | `?session=abc123def456` | Load user customization hoặc session plan |

Khi cả `?slug=` và `?session=` có mặt: load plan từ slug, rồi apply customization từ session.

---

## Sơ đồ luồng khởi động

```
init()
  ├─ GET /api/plans → planList
  ├─ Có ?session= trong URL?
  │   ├─ Thử GET /api/sessions/plan/:id
  │   │   ├─ OK → isSessionPlan=true, dùng plan từ session, DONE
  │   │   └─ 404 → tiếp tục xuống
  │   └─ Load plan theo ?slug= (hoặc plan đầu trong list)
  │       └─ GET /api/sessions/:id → apply customization
  └─ Load plan theo ?slug= (hoặc plan đầu trong list)
```

---

## Nơi dùng trong code

| File | Vị trí | Chức năng |
|------|--------|-----------|
| `public/index.html` | `flushSession()` ~1263 | Tạo/update session |
| `public/index.html` | `loadSession()` ~1236 | Load và apply customization |
| `public/index.html` | `scheduleSessionSave()` ~1258 | Debounce 900ms trước khi flush |
| `public/index.html` | `saveAndShare()` ~1302 | Flush + mở share modal |
| `public/index.html` | `buildCustom()` ~1228 | Build custom payload từ state |
| `api/src/routes/sessions.ts` | Toàn bộ | CRUD sessions API |
| `api/src/db/schema.sql` | line 61 | `user_sessions` table |
