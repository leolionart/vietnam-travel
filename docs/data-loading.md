# Logic Load Dữ liệu & State Management

> Áp dụng cho: `public/index.html` — Alpine.js component `travelApp()`

---

## Khởi động app

```
init()
  1. GET /api/plans → planList (lightweight: [{slug, name, dateRange}])
  2. Đọc URL params (?slug=, ?plan=, ?session=)
  3. Load plan đầu tiên (hoặc theo URL)
  4. Apply session customization (nếu có ?session=)
  5. initMap() → render bản đồ
```

---

## Lazy loading plans

Plans **không được tải hết một lần**. Chỉ load full data khi user chọn:

```javascript
plans: {}   // cache: { "ha-noi-hue": { slug, name, dateRange, locations[] } }
planList: [] // chỉ là list nhẹ để render plan picker
```

Khi `changePlan(slug)`:
1. Kiểm tra cache `plans[slug]` → nếu có, dùng luôn (không fetch lại)
2. Nếu chưa có → `GET /api/plans/:slug` → lưu vào cache
3. Reset state: `activeId`, `excludedSubs`, `excludedLocations`, session state
4. Restore từ localStorage (headcounts, excluded state)

---

## localStorage: Persist user preferences

Các thay đổi được lưu vào `localStorage` theo `planId` (không cần tạo session):

| Key | Value | Nội dung |
|-----|-------|---------|
| `vt_hc_{planId}` | JSON | Headcounts: `{ "101": { adults:2, children:0 } }` |
| `vt_ex_{planId}` | JSON | Excluded sub-locations: `{ "201": true }` |
| `vt_eloc_{planId}` | JSON | Excluded locations: `{ "103": true }` |

**Restore order khi changePlan:**
1. `restoreHeadcounts(planId)` — ghi đè adults/children từ localStorage
2. `restoreExcluded(planId)` — restore excludedSubs
3. `restoreExcludedLocations(planId)` — restore excludedLocations

> **Session override localStorage:** Nếu có `?session=` trong URL, `loadSession()` được gọi sau `changePlan()` và **ghi đè** data từ localStorage bằng data của session.

---

## `activeLocation` getter

```javascript
get activeLocation() {
    // Có explicit dependency vào adults/children, excludedSubs, excludedLocations
    void this.excludedSubs;
    void this.excludedLocations;
    return this.currentPlan?.locations?.find(l => l.id === this.activeId) ?? {};
}
```

`void dependency` là trick để Alpine re-compute getter khi excludedSubs/excludedLocations thay đổi, vì Alpine không tự detect dependency trong `find()`.

---

## `totalPlanCost` getter

```javascript
get totalPlanCost() {
    void this.excludedSubs;
    void this.excludedLocations;
    return this.calculateTotalPlanCost();
}
```

Tương tự — force re-compute khi excluded state thay đổi.

---

## Plan switching: reset gì, giữ gì?

Khi `changePlan(newSlug)`:

| State | Hành động |
|-------|-----------|
| `plans[slug]` (cache) | Giữ nguyên |
| `activeId` | Reset về location đầu tiên |
| `mySessionId` | Reset null |
| `sessionSourceId` | Reset null |
| `excludedSubs` | Reset {} → sau đó restore từ localStorage |
| `excludedLocations` | Reset {} → sau đó restore từ localStorage |
| `detailScrolled` | Reset false |
| `detailMode` | Tự động set theo activeLocation |

---

## URL sync

`syncPlanSlugToUrl()` được gọi sau mỗi lần `changePlan()`:

```
?slug=<currentPlanId>   ← luôn giữ slug trên URL
?session=<id>           ← giữ nếu mySessionId có, xóa nếu không
```

Không reload trang — dùng `window.history.replaceState()`.
