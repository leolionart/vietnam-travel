import { getPlanBySlug } from './planService.js';

type TransportType = 'walking' | 'motorbike' | 'car' | 'bus' | 'train' | 'flight' | 'ferry' | 'other' | '';

interface PublicActivity {
    id: number;
    name: string;
    lat?: number;
    lng?: number;
    durationMinutes?: number;
    scheduledDate?: string;
    scheduledPeriod?: string;
    activityType?: string;
    transportType?: TransportType;
    description?: string;
}

interface PublicLocation {
    id: number;
    name: string;
    province?: string;
    lat?: number;
    lng?: number;
    subLocations?: PublicActivity[];
}

interface PublicPlan {
    slug: string;
    name: string;
    locations?: PublicLocation[];
}

interface AnalysisOptions {
    locationId?: number;
    maxDistanceKm?: number;
    transportType?: TransportType;
}

interface ActivityPoint {
    id: number;
    name: string;
    locationId: number;
    locationName: string;
    lat: number;
    lng: number;
    scheduledDate: string;
    scheduledPeriod: string;
    activityType: string;
    transportType: TransportType;
    durationMinutes: number;
}

const TRANSPORT_SPEED_KMH: Record<string, number> = {
    walking: 5,
    motorbike: 35,
    car: 50,
    bus: 45,
    train: 65,
    flight: 500,
    ferry: 25,
    other: 40,
};

function hasCoords(item: { lat?: number; lng?: number }): item is { lat: number; lng: number } {
    return Number.isFinite(item.lat) && Number.isFinite(item.lng) && !(item.lat === 0 && item.lng === 0);
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthKm = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earthKm * Math.asin(Math.sqrt(h));
}

function estimateTravelMinutes(distanceKm: number, transportType: TransportType = 'car'): number {
    const speed = TRANSPORT_SPEED_KMH[transportType || 'car'] || TRANSPORT_SPEED_KMH.other;
    const buffer = transportType === 'flight' ? 120 : transportType === 'train' || transportType === 'bus' ? 30 : 15;
    return Math.max(15, Math.round((distanceKm / speed) * 60 + buffer));
}

function formatDistance(km: number): string {
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export function formatDurationMinutes(minutes: number): string {
    const safe = Math.max(0, Math.round(minutes));
    if (safe < 60) return `${safe} phút`;
    const hours = Math.floor(safe / 60);
    const mins = safe % 60;
    return mins ? `${hours} giờ ${mins} phút` : `${hours} giờ`;
}

function travelBlockReason(minutes: number): string {
    if (minutes >= 360) return 'Nên chặn gần như cả ngày vì thời gian di chuyển dài và cần buffer nhận/trả phòng.';
    if (minutes >= 180) return 'Nên chặn ít nhất một buổi để tránh xếp hoạt động sát giờ.';
    if (minutes >= 90) return 'Nên để buffer trong cùng buổi khi ghép thêm hoạt động.';
    return 'Có thể ghép với hoạt động gần đó nếu cùng khu vực.';
}

function toActivityPoints(plan: PublicPlan, locationId?: number): ActivityPoint[] {
    return (plan.locations || [])
        .filter(location => locationId === undefined || location.id === locationId)
        .flatMap(location => (location.subLocations || [])
            .filter(activity => hasCoords(activity))
            .map(activity => ({
                id: activity.id,
                name: activity.name,
                locationId: location.id,
                locationName: location.name,
                lat: activity.lat,
                lng: activity.lng,
                scheduledDate: activity.scheduledDate || '',
                scheduledPeriod: activity.scheduledPeriod || '',
                activityType: activity.activityType || 'sightseeing',
                transportType: activity.transportType || '',
                durationMinutes: Number(activity.durationMinutes || 60),
            })));
}

function toActivities(plan: PublicPlan, locationId?: number): ActivityPoint[] {
    return (plan.locations || [])
        .filter(location => locationId === undefined || location.id === locationId)
        .flatMap(location => (location.subLocations || [])
            .map(activity => ({
                id: activity.id,
                name: activity.name,
                locationId: location.id,
                locationName: location.name,
                lat: Number(activity.lat || 0),
                lng: Number(activity.lng || 0),
                scheduledDate: activity.scheduledDate || '',
                scheduledPeriod: activity.scheduledPeriod || '',
                activityType: activity.activityType || 'sightseeing',
                transportType: activity.transportType || '',
                durationMinutes: Number(activity.durationMinutes || 60),
            })));
}

function bestPeriodLabel(points: ActivityPoint[]): string {
    const periods = new Set(points.map(point => point.scheduledPeriod).filter(Boolean));
    if (periods.size === 1) return periods.has('morning') ? 'morning' : 'afternoon';
    return '';
}

export function analyzePlanPayload(plan: PublicPlan, options: AnalysisOptions = {}) {
    const maxDistanceKm = Number(options.maxDistanceKm ?? 5);
    const transportType = options.transportType || 'car';
    const allActivities = toActivities(plan, options.locationId);
    const points = toActivityPoints(plan, options.locationId)
        .filter(point => !['accommodation', 'transport'].includes(point.activityType));
    const pairs = [];

    for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
            const from = points[i];
            const to = points[j];
            const distanceKm = haversineKm(from, to);
            if (distanceKm > maxDistanceKm) continue;
            const travelMinutes = estimateTravelMinutes(distanceKm, transportType);
            pairs.push({
                from: { id: from.id, name: from.name, locationId: from.locationId, locationName: from.locationName },
                to: { id: to.id, name: to.name, locationId: to.locationId, locationName: to.locationName },
                distanceKm: Number(distanceKm.toFixed(2)),
                distanceLabel: formatDistance(distanceKm),
                estimatedTravelMinutes: travelMinutes,
                estimatedTravelLabel: formatDurationMinutes(travelMinutes),
                sameDate: Boolean(from.scheduledDate && from.scheduledDate === to.scheduledDate),
                samePeriod: Boolean(from.scheduledDate && from.scheduledDate === to.scheduledDate && from.scheduledPeriod && from.scheduledPeriod === to.scheduledPeriod),
                suggestion: travelMinutes <= 45 ? 'Nên gom cùng buổi nếu cùng lịch trình.' : 'Có thể gom cùng ngày, tránh xếp quá sát giờ.',
            });
        }
    }

    const groupsByLocation = new Map<string, ActivityPoint[]>();
    points.forEach((point) => {
        const key = `${point.locationId}:${point.scheduledDate || 'unscheduled'}`;
        groupsByLocation.set(key, [...(groupsByLocation.get(key) || []), point]);
    });

    const sameDayGroups = Array.from(groupsByLocation.values())
        .filter(group => group.length > 1)
        .map(group => ({
            locationId: group[0].locationId,
            locationName: group[0].locationName,
            scheduledDate: group[0].scheduledDate,
            scheduledPeriod: bestPeriodLabel(group),
            activityIds: group.map(point => point.id),
            activities: group.map(point => point.name),
            note: 'Các hoạt động cùng điểm dừng/ngày; dùng cặp khoảng cách gần để quyết định gom cùng buổi.',
        }));

    const transportBlocks = allActivities
        .filter(point => point.activityType === 'transport')
        .map(point => ({
            id: point.id,
            name: point.name,
            locationId: point.locationId,
            locationName: point.locationName,
            scheduledDate: point.scheduledDate,
            scheduledPeriod: point.scheduledPeriod,
            transportType: point.transportType || transportType,
            durationMinutes: point.durationMinutes,
            durationLabel: formatDurationMinutes(point.durationMinutes),
            calendarNote: travelBlockReason(point.durationMinutes),
        }));

    return {
        planSlug: plan.slug,
        planName: plan.name,
        maxDistanceKm,
        transportType,
        pointCount: points.length,
        nearbyPairs: pairs.sort((a, b) => a.distanceKm - b.distanceKm),
        sameDayGroups,
        transportBlocks,
        usage: {
            aiScheduling: 'Check nearbyPairs before adding or moving activities; prefer same-day or same-period for close pairs.',
            calendar: 'Show transportBlocks durationLabel and calendarNote on transport events so viewers understand why a full morning/afternoon is reserved.',
        },
    };
}

export function analyzePlanBySlug(slug: string, options: AnalysisOptions = {}) {
    const plan = getPlanBySlug(slug) as PublicPlan | null;
    if (!plan) return null;
    return analyzePlanPayload(plan, options);
}
