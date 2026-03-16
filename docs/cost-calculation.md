# Logic tính chi phí dự toán

> Áp dụng cho: `public/index.html` — Alpine.js component `travelApp()`

---

## Tổng quan

Mỗi **location** (điểm dừng trong lịch trình) có một bộ chi phí riêng. Toàn bộ plan là **tổng cộng của tất cả location chưa bị loại**.

```
Tổng plan = Σ calculateLocationCost(loc)   // với mỗi loc chưa bị excludedLocations
```

---

## Chi phí một location

`calculateLocationCost(loc)` trả về tổng của 4 khoản:

```
Chi phí location = Vé tham quan + Lưu trú + Ăn uống + Di chuyển
```

### 1. Vé tham quan

**Nguồn dữ liệu:** Có 2 nguồn, ưu tiên theo thứ tự:

| Ưu tiên | Điều kiện | Giá trị dùng |
|---------|-----------|-------------|
| 1 (cao) | Location có sub-locations, và tổng giá sub > 0 | `Σ sub.adultPrice` (chỉ các sub chưa bị bỏ qua) |
| 2 (thấp) | Không có sub-locations hoặc sub chưa có giá | `location.adultPrice` |

Tương tự cho trẻ em với `sub.childPrice` / `location.childPrice`.

**Helper functions:**
- `ticketAdultTotal(loc)` — giá vé/người lớn theo logic ưu tiên trên
- `ticketChildTotal(loc)` — giá vé/trẻ em theo logic ưu tiên trên

**Tại sao có 2 nguồn?**
- `location.adultPrice` là ước tính thủ công nhập trong admin panel, thường được nhập trước khi có sub-locations
- `subLocation.adultPrice` là giá chính xác từng điểm tham quan (cụ thể hơn)
- Khi đã có sub-locations với giá → sub-locations là nguồn chân thực, **không cộng thêm** parent price

**Công thức:**
```
Vé tham quan = ticketAdultTotal(loc) × adults + ticketChildTotal(loc) × children
```

> ⚠️ **Chú ý excluded subs:** Khi user bỏ qua một điểm tham quan con (`excludedSubs[sub.id] = true`), giá của nó **không được tính** vào tổng. UI hiển thị dòng "Tiết kiệm X đ" tương ứng.

---

### 2. Lưu trú

```
Lưu trú = stayCostPerNight × (duration - 1)
```

- `duration` = số ngày ở tại điểm này
- Số đêm = số ngày trừ 1 (ngày cuối rời đi, không cần ngủ)
- Nếu `duration = 1` → 0 đêm → 0đ
- Nếu `duration < 1` → dùng `rawDays - 1` nhưng floor về 0 (`Math.max(..., 0)`)

---

### 3. Ăn uống

```
Ăn uống = foodBudgetPerDay × duration
```

- Tính theo **ngày** (không trừ 1 như lưu trú)
- `duration` tối thiểu là 1

---

### 4. Di chuyển đến điểm này

```
Di chuyển = transportFareAdult × adults + transportFareChild × children
```

- `transportFareAdult` = vé người lớn (fallback về `transportFare` nếu không có)
- `transportFareChild` = vé trẻ em (0 nếu không có)
- Đây là chi phí **đến** location này (xe khách, tàu, bay từ điểm trước)

---

## Quy tắc excluded (loại bỏ)

| Loại | Field | Ảnh hưởng |
|------|-------|-----------|
| Loại cả location | `excludedLocations[loc.id]` | Không tính vào tổng plan, markers mờ trên map |
| Loại sub-location | `excludedSubs[sub.id]` | Không tính vé của sub đó, map bỏ khỏi lộ trình |

---

## Ví dụ: Ninh Bình (7 người lớn, 2 trẻ em)

| Sub-location | NL | TE |
|---|---|---|
| Tràng An | 250.000đ | 150.000đ |
| Tam Cốc | 120.000đ | 60.000đ |
| Hang Múa | 100.000đ | 100.000đ |
| Chùa Bái Đính | 50.000đ | 50.000đ |
| Cố đô Hoa Lư | 20.000đ | 10.000đ |
| **Tổng/người** | **540.000đ** | **370.000đ** |

```
Vé NL = 540.000 × 7 = 3.780.000đ
Vé TE = 370.000 × 2 =   740.000đ
Vé tham quan tổng   = 4.520.000đ
```

> `location.adultPrice = 107.000đ` bị bỏ qua vì sub-locations đã có giá.

---

## Sơ đồ luồng tính vé

```
location có subLocations?
    ├─ Có → tính Σ sub.adultPrice (bỏ qua excluded subs)
    │        ├─ Tổng > 0 → dùng tổng này ✓
    │        └─ Tổng = 0 → fallback về location.adultPrice
    └─ Không → dùng location.adultPrice
```

---

## Nơi dùng trong code

| Nơi | Mục đích |
|-----|----------|
| `ticketAdultTotal(loc)` / `ticketChildTotal(loc)` | Helper dùng chung cho display và calculation |
| `calculateLocationCost(loc)` | Tính tổng 1 location, dùng trong detail panel |
| `calculateTotalPlanCost(plan)` | Tính tổng plan, hiển thị ở status bar footer |
| Template dòng "Vé tham quan NL/TE" | Display breakdown trong "Dự toán chi phí" |
| Template hint "X đ/ng" dưới headcount | Hiển thị giá/người dưới ô đếm người lớn/trẻ em |
