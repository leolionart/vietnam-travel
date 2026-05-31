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
| `quantity` | Số phòng/đơn vị/nhóm do user nhập |
| `surcharge` | Phụ thu cố định do user nhập |
| `durationDays` | Số ngày activity kéo dài, dùng để hiển thị khách sạn/tour nhiều ngày |

Activity loại `sightseeing` dùng cho vé tham quan. Activity loại `accommodation` hoặc `food` là nguồn chi phí lưu trú/ăn uống; parent location chỉ giữ summary và thông tin lịch trình.

Với `pricingMode = per_room`, chi phí được tính:

```
chi phí = unitPrice × quantity + surcharge
```

Không tự suy luận số phòng từ số người. Nếu cần thêm phòng hoặc phụ thu trẻ em,
user cập nhật trực tiếp `quantity` hoặc `surcharge`.

### 2. Vé tham quan

**Nguồn dữ liệu:** chỉ lấy từ activity/sub-location loại `sightseeing`.

Người lớn dùng `Σ sub.adultPrice`; trẻ em dùng `Σ sub.childPrice`. Các sub bị bỏ qua không được tính.

**Helper functions:**
- `ticketAdultTotal(loc)` — tổng vé/người lớn từ activity
- `ticketChildTotal(loc)` — tổng vé/trẻ em từ activity

**Công thức:**
```
Vé tham quan = ticketAdultTotal(loc) × adults + ticketChildTotal(loc) × children
```

> ⚠️ **Chú ý excluded subs:** Khi user bỏ qua một điểm tham quan con (`excludedSubs[sub.id] = true`), giá của nó **không được tính** vào tổng. UI hiển thị dòng "Tiết kiệm X đ" tương ứng.

---

### 3. Lưu trú

Lưu trú = tổng `subActivityCost()` của các activity `activityType = accommodation`.

Không còn fallback về `location.stayCostPerNight`. Khách sạn/du thuyền phải nhập như activity, thường là `pricingMode = per_room`, `quantity = số phòng/đơn vị`, `surcharge = phụ thu cố định nếu có`.

### 4. Ăn uống

Ăn uống = tổng `subActivityCost()` của các activity `activityType = food`.

Không còn fallback về `location.foodBudgetPerDay`.

### 5. Di chuyển đến điểm này

Di chuyển = tổng `subActivityCost()` của các activity `activityType = transport`.

- `transportLabel` ở parent location chỉ là mô tả tuyến đi để hiển thị.
- Chi phí xe/tàu/bay phải nhập bằng activity `transport`, thường là `pricingMode = per_person`.
- Nếu có vé trẻ em riêng, nhập `childPrice`; nếu trẻ em không tính phí thì để 0.

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

> Parent location không còn là nguồn nhập vé. Nếu thiếu activity giá, hệ thống coi khoản đó là 0.

---

## Sơ đồ luồng tính vé

```
activity sightseeing chưa bị bỏ qua?
    ├─ Có → tính Σ sub.adultPrice / Σ sub.childPrice
    └─ Không → 0
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
