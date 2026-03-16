# Logic Bản đồ (Map Behavior)

> Áp dụng cho: `public/index.html` — hàm `updateMap()` và `initMap()`

---

## 2 chế độ bản đồ

Bản đồ hoạt động theo 2 chế độ hoàn toàn khác nhau, tùy thuộc vào `detailMode` và `activeLocation`:

| Chế độ | Điều kiện | Hiển thị |
|--------|-----------|---------|
| **Overview** | Không có activeId, hoặc detailMode='overview' | Tất cả locations của plan |
| **Detail** | activeId có sub-locations + detailMode='detail' | Chỉ sub-locations của location đang chọn |

---

## Chế độ Overview

Hiển thị **toàn bộ lộ trình** của plan:

- **Markers:** Số tròn (1, 2, 3...) cho mỗi location. Marker active = xanh + to hơn (`scale-125`)
- **Route line:** Màu xanh dương (`#3b82f6`), vẽ theo đường thực tế từ **OSRM API** (`router.project-osrm.org`)
- **Transport badges:** Label nổi giữa mỗi đoạn đường (ví dụ: "🚌 Xe khách ~5h")
- **Direction arrows:** Mũi tên nhỏ dọc theo route để chỉ hướng đi
- **Fallback:** Nếu OSRM fail → vẽ đường thẳng (`polyline`) giữa các điểm
- **fitBounds:** Tự động zoom để toàn bộ locations vừa màn hình (padding 50px)
- **Excluded locations:** Markers bị loại hiển thị mờ (opacity 0.4), không tham gia tính route

## Chế độ Detail (sub-locations)

Hiển thị **lịch trình trong một điểm dừng** (ví dụ: các địa điểm tham quan ở Ninh Bình):

- **Markers:** Số tròn màu emerald cho mỗi sub-location
- **Route line:** Màu xanh lá (`#10b981`), cũng dùng OSRM nếu có thể
- **fitBounds:** Zoom vào khu vực sub-locations
- **Excluded subs:** Hiển thị mờ + dashed border, không tham gia route

---

## Marker click → Popup

Click vào bất kỳ marker nào → `_showMarkerPopup()` → hiện context menu nhỏ:

```
_showMarkerPopup(e, type, id, name, isExcluded, lat?, lng?)
    → tính toạ độ pixel từ map container
    → set markerPopup state
    → Alpine render popup tại toạ độ đó
```

**Popup options theo loại:**

| type | isExcluded | Actions |
|------|-----------|---------|
| `'location'` | false | "Xem chi tiết" (setActive), "Bỏ qua điểm này" |
| `'location'` | true | "Thêm vào lịch trình" |
| `'sub'` | false | "Xem trên Google Maps", "Bỏ qua điểm này" |
| `'sub'` | true | "Thêm lại vào lịch trình" |

> **Mobile fix:** CSS rule `aside.fixed, main.fixed, footer.fixed` (không phải `.fixed` chung) — popup dùng `div.fixed` nên không bị ảnh hưởng bởi rule chuyển đổi layout mobile.

---

## Khi nào `updateMap()` được gọi?

| Trigger | Tham số |
|---------|---------|
| `$watch('activeId')` | `updateMap()` |
| `$watch('detailMode')` | `updateMap()` |
| `$watch('currentPlanId')` | `updateMap()` |
| `toggleLocation()` / `toggleSub()` | `updateMap(false, true)` — forceOverview=true |
| `setActive()` | `updateMap(false)` |
| `changePlan()` | `updateMap(true)` — fitBounds=true |

---

## Mobile: Fullscreen map

Khi không có location nào được chọn (`activeId = null`) trên mobile:

- `#map` có class `map-full` → `height: 100dvh` (fullscreen)
- Mobile timeline ẩn (`x-show="activeId"`)
- Khi user chọn location: map thu về `250px`, trang scroll xuống detail panel
- `map.invalidateSize()` được gọi sau 420ms (sau khi CSS transition kết thúc) để Leaflet re-render đúng

---

## Leaflet setup

```javascript
L.map('map', { zoomControl: false, attributionControl: false })
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png')
```

- Dark tile từ CartoDB (phù hợp với dark UI)
- Không có zoom control UI (user pinch/scroll để zoom)
- Map element: `<div id="map">` ở ngoài cùng body (z-index thấp nhất, làm background)
