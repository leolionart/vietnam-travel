# Date Range Handling

> Applies to: `api/src/services/dateService.ts` + `api/src/services/locationService.ts`

The app now treats travel dates as editable data, not a fully automatic cascade.
This keeps real-world plans flexible: changing one stop must not unexpectedly move
every later stop.

## Current Rules

- `locations.arrive_at`, `locations.depart_at`, and `locations.duration_days` are edited directly.
- Updating a location does **not** rewrite later locations.
- Reordering locations does **not** rewrite dates.
- Deleting a location does **not** pull the next location forward.
- The plan-level `date_range` is refreshed from the first location arrival and
  last location departure only when location dates are explicitly changed, added,
  or removed.
- If the whole plan label needs manual control, use `PATCH /api/plans/:slug`
  with `dateRange`.

## Supported PATCH Endpoints

```http
PATCH /api/plans/:slug
PATCH /api/plans/:slug/locations/:id
PATCH /api/public/plans/:slug
PATCH /api/public/plans/:slug/locations/:id
```

These are aliases for partial updates. `PUT` remains supported.

## Date Helpers

`api/src/services/dateService.ts` still contains pure helpers:

- `formatDateRange(arriveAt, departAt)`
- `computePlanDateRange(locations)`
- `cascadeDates(locations, startIndex)` for future opt-in/manual cascade flows

Do not call `cascadeDates()` implicitly from normal location CRUD.
