# Logic Date Cascade

> Áp dụng cho: `api/src/services/dateService.ts` + `api/src/services/locationService.ts`

---

## Vấn đề cần giải quyết

Các location trong một plan được sắp xếp theo thứ tự. Khi user thay đổi ngày đến hoặc số ngày lưu trú của một điểm, **tất cả các điểm sau đó** phải được tính lại tự động — không cần nhập tay từng điểm.

---

## Công thức cascade

```
depart_at = arrive_at + duration_days × 86_400_000ms
arrive_at[i+1] = depart_at[i]
```

Ví dụ: 3 điểm, Hà Nội đến ngày 1/6:

```
Hà Nội:    arrive=01/06  duration=2  → depart=03/06
Huế:       arrive=03/06  duration=3  → depart=06/06   ← tự động
Đà Nẵng:   arrive=06/06  duration=2  → depart=08/06   ← tự động
```

Nếu sửa Hà Nội thành `duration=3`:
```
Hà Nội:    arrive=01/06  duration=3  → depart=04/06
Huế:       arrive=04/06  duration=3  → depart=07/06   ← tự động dịch 1 ngày
Đà Nẵng:   arrive=07/06  duration=2  → depart=09/06   ← tự động dịch 1 ngày
```

---

## Hàm `cascadeDates()`

File: `api/src/services/dateService.ts`

```typescript
cascadeDates(locations, startIndex)
```

- **Input:** Mảng locations (đã sort theo `sort_order`), index bắt đầu cascade
- **Output:** Mảng mới với `arrive_at`/`depart_at` đã được tính lại
- Chỉ cascade từ `startIndex` trở đi — không đụng vào các location trước đó
- Nếu `arrive_at = null` tại một điểm → dừng cascade tại đó (không có ngày gốc để tính)

---

## Khi nào cascade được kích hoạt?

`api/src/services/locationService.ts` gọi `applyCascade(planId, startIndex)` trong 3 trường hợp:

| Thao tác | startIndex | Lý do |
|----------|-----------|-------|
| **Tạo location mới** (có `arriveAt`) | index của location vừa tạo | Từ đây trở đi cần tính lại |
| **Sửa location** (đổi `arriveAt` hoặc `durationDays`) | index của location vừa sửa | Thay đổi ảnh hưởng các điểm sau |
| **Xóa location** | index của vị trí vừa xóa | Điểm kế tiếp cần "kéo lên" |

---

## Lưu ý quan trọng

- **Cascade một chiều:** chỉ đi xuống (từ startIndex → cuối). Không bao giờ sửa các điểm trước đó.
- **`arrive_at` null = điểm chưa có lịch:** cascade dừng lại, không gán ngày sai.
- **Đơn vị thời gian:** tất cả lưu dưới dạng Unix timestamp **milliseconds** (không phải seconds). `86_400_000 = 24h × 60m × 60s × 1000ms`.
- **`duration_days = 0`:** depart = arrive (đi trong ngày, không qua đêm).

---

## Ví dụ: Xóa điểm giữa

Trước khi xóa Huế:
```
[0] Hà Nội:  arrive=01/06  depart=03/06
[1] Huế:     arrive=03/06  depart=06/06   ← xóa điểm này
[2] Đà Nẵng: arrive=06/06  depart=08/06
```

Sau khi xóa, cascade từ index=1:
```
[0] Hà Nội:  arrive=01/06  depart=03/06
[1] Đà Nẵng: arrive=03/06  depart=05/06   ← arrive kế thừa từ Hà Nội depart
```

---

## Nơi dùng trong code

| File | Hàm | Vai trò |
|------|-----|---------|
| `api/src/services/dateService.ts` | `cascadeDates()` | Logic tính toán thuần |
| `api/src/services/dateService.ts` | `computePlanDateRange()` | Tính dateRange của cả plan (first arrive → last depart) |
| `api/src/services/locationService.ts` | `applyCascade()` | Đọc DB, gọi cascadeDates, ghi lại DB |
| `api/src/services/locationService.ts` | `createLocation()` | Gọi applyCascade nếu có arriveAt |
| `api/src/services/locationService.ts` | `updateLocation()` | Gọi applyCascade nếu đổi arriveAt/durationDays |
| `api/src/services/locationService.ts` | `deleteLocation()` | Gọi applyCascade từ vị trí vừa xóa |
