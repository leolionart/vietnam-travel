# Release Notes

## v1.0.10 - Schedule Ordered Map Itinerary

- Sorted the map timeline and active location fallback by planned dates instead
  of raw location order.
- Sorted activity lists, detail markers, and detail route legs by scheduled
  date plus scheduled time/period.
- Added compact schedule labels to activity rows in the location detail panel.
- Skipped map route points without real coordinates so detail routes no longer
  draw through `(0,0)` placeholder data while the full itinerary list remains
  visible.
- Removed the separate per-event "remove from itinerary" action so event
  management uses the single delete flow.
- Removed legacy per-event exclusion state from cost, calendar, map, and
  session reads.
- Replaced remote per-leg route fetching on map render with immediate local
  route estimates so the full route appears without waiting on third-party
  routing services.
- Tightened calendar event cards with duration-first labels such as `1h30p`,
  a right-aligned theme-aware cost chip, and compact `K` cost formatting.
- Merged legacy cafe activities into the eating/drinking group across calendar
  legends, cost summaries, location details, and print export.
- Updated calendar budget summaries to compare current spend against the plan
  budget and show both usage percent and remaining amount below the amount.
- Removed the inline `/ 150.000.000 ₫` label from calendar total cost cards so
  the real spend stays visually primary.
- Added API and MCP support for setting `budgetLimit` when AI tools create or
  update a plan.
- Added a calendar `Move view only` mode that disables event drag/drop and
  resize interactions so touch-screen scrolling stays stable.
- Aligned calendar event card content to the top so title and metadata no
  longer sit vertically centered inside taller cards.
- Restored OSRM road-route drawing for overview and detail map paths, with
  cached per-leg routes and straight-line fallback only when road routing fails.

## v1.0.9 - Activity External CTA Links

![v1.0.9 event drawer CTA preview](https://github.com/leolionart/vietnam-travel/releases/download/v1.0.9/vietnam-travel-v1.0.9-event-drawer.png)

- Added separate activity CTA fields for the event detail drawer:
  `externalUrl` and `externalLabel`.
- Kept the drawer's top-right Maps button dedicated to Google Maps while the
  lower CTA can point to Booking.com, a website, Facebook, or a Maps fallback.
- Added admin/public/API/MCP support for storing and updating the new CTA fields
  without overloading the visible location/address field.
- Added activity form controls for the CTA link and optional button label.
- Preserved the recent event delete confirmation change in this release range.

## v1.0.8 - Conditional Other Activity Category

- Restored the "Khác" activity type in the public activity form and MCP
  add/update activity contracts.
- Added the "Khác" cost overview card back as a conditional card that only
  appears when the plan has declared `other` activity cost.
- Included `other` activity costs in location, plan, summary, and print totals.
- Added a distinct glass event style for `other` activity cards.

## v1.0.7 - Softer Calendar Backgrounds

- Lightened the week and month calendar shell backgrounds so the schedule reads
  softer against the app chrome.
- Reduced location/day background tints and replaced colored day borders with
  neutral borders.
- Kept activity event card colors unchanged so event types remain scannable.

## v1.0.6 - Remove Unclassified Cost Category

- Removed the "Khác" cost category from week and month cost overview cards.
- Removed "Khác" from the activity type picker so new activities must use a
  classified category.
- Normalized unknown or legacy activity types into the sightseeing category so
  all declared activity costs continue to be counted.

## v1.0.5 - Simplify Cost Overview Cards

- Removed the 60% lodging target note from week and month cost overview cards.
- Kept the main cost amount, percentage label, and progress bar.

## v1.0.4 - CDN Event Preview Images and Screenshot Release Notes

![v1.0.4 preview](https://github.com/leolionart/vietnam-travel/releases/download/v1.0.4/v1.0.4-preview.png)

- Switched event detail preview images from local `/assets/...` paths to stable
  jsDelivr CDN URLs backed by the generated preview assets in repo tag
  `v1.0.3`.
- Verified all generated event preview CDN URLs return `200 image/webp`.
- Documented the release-note convention: visible UI updates should include an
  embedded screenshot link uploaded as a GitHub Release asset.

## v1.0.3 - Compact Week Event Metadata

- Tightened spacing between week event time, dot divider, and duration so the
  metadata stays on one compact line.
- Aligned week event card content to the top and reduced text line-height inside
  compact timed cards.

## v1.0.2 - Glass Event Cards and Generated Event Previews

### Calendar event cards

- Reworked calendar event cards from solid/pastel fills to translucent glass
  tints that better match the app's overall visual system.
- Kept activity-type color semantics while reducing saturation and opacity:
  food red, transport gray, cafe orange, sightseeing blue, accommodation slate.
- Added backdrop blur, soft inset highlight, and lighter shadows to event cards.
- Added light-mode variants so event cards stay readable without looking heavy.

### Event detail previews

- Added generated internal preview images for sightseeing, accommodation, food,
  cafe, transport, and fallback events.
- Replaced activity/location image lookup for event detail thumbnails with the
  generated internal WebP assets, avoiding unrelated external images.
- Optimized generated previews to 1200x675 WebP assets for faster drawer load.

## v1.0.1 - Calendar Planning, Activity Costs, and MCP Plan Editing

This release summarizes the user-facing and integration changes since the
previous GitHub Release.

### Calendar planning

- Added public week and month calendar views for trip plans.
- Added Google Calendar-style time rows in week view.
- Added exact activity scheduling with `scheduledTime` and activity
  `durationMinutes`, instead of anchoring items only to morning/afternoon.
- Added drag/drop and resize interactions for activities on calendar views.
- Snapped calendar edits to 30-minute intervals.
- Added explicit calendar save/discard controls so drag edits do not save
  immediately.
- Kept overlapping calendar events independent when moving one event.
- Improved overlapping event layout so short overlaps render side-by-side/on top
  instead of dragging attached events together.
- Stacked month-view time blocks vertically and hid empty blocks to avoid layout
  overflow.
- Added event cost display on calendar cards.
- Simplified week event cards to show event name, time/duration, cost chip, and
  location when present.
- Updated event colors by activity type: food red, transport gray, cafe orange,
  sightseeing blue.
- Changed accommodation icon from hotel to bed.
- Tuned calendar backgrounds and light-mode event cards for clearer contrast.
- Changed event detail from a dedicated `/event` page to a right-side drawer
  overlay on the current calendar/map view.
- Kept event deep links through `event=<id>` while preserving the active view
  path.
- Added drawer details for thumbnail, schedule, duration, cost, participants,
  notes, location, and Google Maps link.

### Activity data and cost model

- Moved participant counts and pricing logic to individual activities instead
  of fixed location-level values.
- Added activity-based pricing controls for tickets, accommodation, food, cafe,
  transport, and other costs.
- Split cost summaries into transport, accommodation, food, cafe, sightseeing,
  and other categories.
- Derived location overview text from the detailed activities in the itinerary
  so summaries stay current.
- Added a separate cafe activity type so coffee/snack stops no longer appear
  under food.
- Added map links and address display for activity/accommodation summaries.
- Added illustrative event thumbnails through the existing image service.

### Admin, public editing, and sharing

- Replaced the old admin dashboard flow with calendar-based plan editing.
- Added admin login gating before entering admin mode.
- Added calendar/sidebar CRUD controls for locations and detailed activities.
- Added explicit save controls for schedule edits.
- Allowed public users to customize/share session plans without admin writes.
- Improved stable share URLs by returning pretty `?slug=...` links for session
  plans.
- Allowed reading and updating session plans by slug so agents can revise the
  same shared link.

### MCP, API, and CLI

- Added public MCP plan editing by share link.
- Added prod MCP admin editing support and repo CLI commands for plan,
  location, and activity operations.
- Added admin password header support for API writes.
- Fixed MCP SSE behavior and added activity API aliases for legacy
  sub-location commands.
- Added activity proximity analysis for planning nearby stops.
- Added Vexere/search-oriented planning integration documentation.
- Updated the project travel-plan skill and AI integration docs for the new
  activity scheduling and cost model.

### Map and itinerary polish

- Added compact itinerary calendar view and check-in/check-out badges.
- Added route drawing by road distance and separate colors for route legs.
- Added full-stay calendar rendering with proximity hints.
- Fixed weekday alignment and calendar boundary labels.
- Improved public trip viewer controls and readability.
- Added manual travel date editing.

### Release process

- Removed the GitHub Actions workflow that auto-published GitHub Releases from
  `RELEASE_NOTES.md`.
- GitHub Releases are now created manually with GitHub CLI so each release note
  can be written for the actual update.

## Unreleased - 2026-06-06 16:49 +07

Generated before push from commits:

- `50f51da` Use drawer for calendar event details

## Unreleased - 2026-06-06 16:40 +07

Generated before push from commits:

- `d7132f3` Publish GitHub releases from release notes

## Unreleased - 2026-06-06 16:32 +07

Generated before push from commits:

- `912b328` Use illustrative event thumbnails

## Unreleased - 2026-06-06 16:29 +07

Generated before push from commits:

- `303f091` Update calendar event type colors

## Unreleased - 2026-06-06 16:25 +07

Generated before push from commits:

- `490376a` Add calendar event detail page

## Unreleased - 2026-06-06 16:16 +07

Generated before push from commits:

- `726d572` Add cafe activity type
- `4f349ea` Document release notes push policy

## Unreleased - 2026-06-06 16:16 +07

Generated before push from commits:

- `726d572` Add cafe activity type
- `4f349ea` Document release notes push policy

## Unreleased - 2026-06-06 16:15 +07

Generated before push from commits:

- `d18f462` Keep overlapping calendar drags independent

## 2026-06-06

- Added a separate `cafe` activity type so coffee/snack stops no longer appear under `Ăn uống`.
- Added cafe cost cards, labels, icons, calendar styling, and export columns.
- Preserved side-by-side rendering for overlapping calendar events.
