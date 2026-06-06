# Release Notes

## Manual Release - 2026-06-06 16:55 +07

- Switched calendar event detail from a dedicated `/event` page to an overlay drawer on the current calendar/map view.
- Kept deep links shareable through the `event=<id>` query parameter while preserving the active view path.
- Added drawer content for event thumbnail, schedule, duration, cost, participants, notes, location, and Google Maps.
- Removed the GitHub Actions workflow that auto-published GitHub Releases from `RELEASE_NOTES.md`; releases are now created manually with GitHub CLI.

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
