# Logic tính chi phí dự toán

> Áp dụng cho: `public/index.html` — Alpine.js component `travelApp()`

---

## Tổng quan

Mỗi **location** (điểm dừng trong lịch trình) có một bộ chi phí riêng. Chi phí chi tiết nên cấu hình ở từng **activity/sub-location** khi cần phân biệt tham quan, lưu trú, ăn uống, di chuyển hoặc phụ thu.

```
Tổng plan = Σ calculateLocationCost(loc)   // với mỗi loc chưa bị excludedLocations
```

---

## Chi phí một location

`calculateLocationCost(loc)` trả về tổng của 4 khoản:

```
Chi phí location = Vé tham quan + Lưu trú + Ăn uống + Di chuyển
```

### 1. Activity/sub-location

`sub_locations` là lớp activity chi tiết. Mỗi activity có:

| Field | Ý nghĩa |
|---|---|
| `activityType` | `sightseeing`, `accommodation`, `food`, `transport`, `other` |
| `pricingMode` | `per_person`, `per_room`, `per_group` |
| `adultPrice` / `childPrice` | Giá theo người khi `pricingMode = per_person` |
| `unitPrice` | Giá theo phòng/đơn vị/nhóm |
| `quantity` | Với `per_room`: sức chứa/phòng; với `per_group`: số lượng đơn vị |
| `surcharge` | Với `per_room`: phụ thu mỗi trẻ em; loại khác: phụ thu cố định |

Activity loại `sightseeing` vẫn dùng cho vé tham quan. Activity loại `accommodation` hoặc `food` sẽ thay thế chi phí lưu trú/ăn uống cố định ở parent location nếu có tổng > 0.

Với `pricingMode = per_room`, chi phí được tính:

```
số phòng = ceil((adults + children) / quantity)
chi phí = unitPrice × số phòng + surcharge × children
```

Nếu không có phụ thu trẻ em rõ ràng, để `surcharge = 0`.

### 2. Vé tham quan

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

### 3. Lưu trú

```
Lưu trú = stayCostPerNight × (duration - 1)
```

- `duration` = số ngày ở tại điểm này
- Số đêm = số ngày trừ 1 (ngày cuối rời đi, không cần ngủ)
- Nếu `duration = 1` → 0 đêm → 0đ
- Nếu `duration < 1` → dùng `rawDays - 1` nhưng floor về 0 (`Math.max(..., 0)`)

---

Nếu đã có activity `accommodation` có chi phí, hệ thống dùng tổng activity đó thay vì `stayCostPerNight`.

### 4. Ăn uống

```
Ăn uống = foodBudgetPerDay × duration
```

- Tính theo **ngày** (không trừ 1 như lưu trú)
- `duration` tối thiểu là 1

---

Nếu đã có activity `food` có chi phí, hệ thống dùng tổng activity đó thay vì `foodBudgetPerDay`.

### 5. Di chuyển đến điểm này

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
