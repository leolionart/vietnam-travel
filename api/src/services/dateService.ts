// Convert Unix ms → "DD/MM/YYYY HH:MM" (Vietnam local display)
export function msToViDate(ms: number | null | undefined): string {
    if (ms == null) return '';
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Format date range string from two timestamps
export function formatDateRange(arriveAt: number | null, departAt: number | null): string {
    const start = msToViDate(arriveAt);
    const end = msToViDate(departAt);
    if (!start && !end) return '';
    if (!end) return start;
    return `${start} - ${end}`;
}

// Cascade dates starting from index within a locations array
export interface CascadableLocation {
    id: number;
    arrive_at: number | null;
    depart_at: number | null;
    duration_days: number;
}

export function cascadeDates(locations: CascadableLocation[], startIndex: number): CascadableLocation[] {
    const result = [...locations];
    for (let i = startIndex; i < result.length; i++) {
        const loc = result[i];
        if (loc.arrive_at != null) {
            loc.depart_at = loc.arrive_at + loc.duration_days * 86400000;
        }
        if (i + 1 < result.length && loc.depart_at != null) {
            result[i + 1] = { ...result[i + 1], arrive_at: loc.depart_at };
        }
    }
    return result;
}

// Compute plan date range from first arrive_at and last depart_at
export function computePlanDateRange(locations: CascadableLocation[]): string {
    if (!locations.length) return '';
    const first = locations[0];
    const last = locations[locations.length - 1];
    return formatDateRange(first.arrive_at, last.depart_at);
}
