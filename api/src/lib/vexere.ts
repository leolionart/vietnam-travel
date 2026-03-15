// Vexere province ID map for 63 provinces/cities of Vietnam
// IDs verified against vroute.vexere.com API (2026-03)
export const VEXERE_PROVINCE_MAP: Record<string, number> = {
    'An Giang': 1,
    'Bà Rịa - Vũng Tàu': 2,
    'Bắc Giang': 3,
    'Bắc Kạn': 4,
    'Bạc Liêu': 5,
    'Bắc Ninh': 6,
    'Bến Tre': 7,
    'Bình Định': 8,
    'Bình Dương': 9,
    'Bình Phước': 10,
    'Bình Thuận': 11,
    'Cà Mau': 12,
    'Cần Thơ': 13,
    'Cao Bằng': 14,
    'Đà Nẵng': 15,
    'Đắk Lắk': 16,
    'Đắk Nông': 17,
    'Điện Biên': 18,
    'Đồng Nai': 19,
    'Đồng Tháp': 20,
    'Gia Lai': 21,
    'Hà Giang': 22,
    'Hà Nam': 23,
    'Hà Nội': 24,
    'Hà Tĩnh': 25,
    'Hải Dương': 26,
    'Hải Phòng': 27,
    'Hậu Giang': 28,
    'Hồ Chí Minh': 29,
    'TP. Hồ Chí Minh': 29,
    'Hòa Bình': 30,
    'Hưng Yên': 31,
    'Khánh Hòa': 32,
    'Kiên Giang': 33,
    'Kon Tum': 34,
    'Lai Châu': 35,
    'Lâm Đồng': 36,
    'Lạng Sơn': 37,
    'Lào Cai': 38,
    'Long An': 39,
    'Nam Định': 40,
    'Nghệ An': 41,
    'Ninh Bình': 42,
    'Ninh Thuận': 43,
    'Phú Thọ': 44,
    'Phú Yên': 45,
    'Quảng Bình': 46,
    'Quảng Nam': 47,
    'Quảng Ngãi': 48,
    'Quảng Ninh': 49,
    'Quảng Trị': 50,
    'Sóc Trăng': 51,
    'Sơn La': 52,
    'Tây Ninh': 53,
    'Thái Bình': 54,
    'Thái Nguyên': 55,
    'Thanh Hóa': 56,
    'Thừa Thiên Huế': 57,
    'Tiền Giang': 58,
    'Trà Vinh': 59,
    'Tuyên Quang': 60,
    'Vĩnh Long': 61,
    'Vĩnh Phúc': 62,
    'Yên Bái': 63,
};

export function getProvinceId(province: string): number | null {
    if (!province) return null;
    const id = VEXERE_PROVINCE_MAP[province.trim()];
    return id ?? null;
}

function toVexereSlug(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function toVexereDate(travelDate: string): string | null {
    const match = travelDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
}

export function buildVexereUrl(params: {
    fromProvince: string;
    toProvince: string;
    travelDate: string; // "DD/MM/YYYY"
    type?: string;
}): string | null {
    const fromId = getProvinceId(params.fromProvince);
    const toId = getProvinceId(params.toProvince);
    if (!fromId || !toId) return null;

    const fromSlug = toVexereSlug(params.fromProvince) || 'a';
    const toSlug = toVexereSlug(params.toProvince) || 'b';
    // Vexere website deeplink uses different IDs from the Route Search API (1-63).
    // Canonical website format: FROM = 100 + province_id, TO = (100 + province_id) * 10 + 1
    // e.g. Nghệ An(41): FROM=141, Ninh Bình(42): TO=1421
    const fromWebId = 100 + fromId;
    const toWebId = (100 + toId) * 10 + 1;
    const url = new URL(`https://vexere.com/vi-VN/ve-xe-khach-tu-${fromSlug}-di-${toSlug}-${fromWebId}t${toWebId}.html`);

    const date = toVexereDate(params.travelDate);
    if (date) url.searchParams.set('date', date);
    if (params.type) url.searchParams.set('type', params.type);
    url.searchParams.set('v', '10');
    url.searchParams.set('nation', '84');
    return url.toString();
}

// Infer transport type from Vietnamese text
export function inferTransportType(label: string): string {
    const text = (label || '').toLowerCase();
    if (text.includes('máy bay') || text.includes('flight') || text.includes('bay')) return 'flight';
    if (text.includes('tàu') || text.includes('train') || text.includes('hỏa xa')) return 'train';
    if (text.includes('xe khách') || text.includes('bus') || text.includes('coach')) return 'bus';
    if (text.includes('xe máy') || text.includes('motorbike') || text.includes('moto')) return 'motorbike';
    if (text.includes('ô tô') || text.includes('car') || text.includes('taxi')) return 'car';
    return 'other';
}

// ────────────────────────────────────────────────────────
// Vgate password-grant client with automatic token management
// Credentials: VEXERE_USERNAME / VEXERE_PASSWORD
// ────────────────────────────────────────────────────────

interface TokenResponse {
    access_token: string;
    token_type: string;
}

interface CachedToken {
    token: string;
    expiresAt: number;     // Unix ms
}

const VEXERE_USE_UAT = process.env.VEXERE_USE_UAT === 'true';
const ACCOUNT_SERVICE_URL = VEXERE_USE_UAT
    ? 'https://uat-account-service.vexere.net'
    : 'https://account-service.vexere.com';
const ROUTE_API_URL = VEXERE_USE_UAT
    ? 'https://uat-vroute.vexere.net'
    : 'https://vroute.vexere.com';

// Password-grant tokens from Vexere don't include expires_in — cache for 20 min
const TOKEN_TTL_MS = 20 * 60 * 1000;

let _cachedToken: CachedToken | null = null;

async function fetchToken(): Promise<string> {
    const username = process.env.VEXERE_USERNAME;
    const password = process.env.VEXERE_PASSWORD;

    if (!username || !password) {
        throw new Error('VEXERE_USERNAME and VEXERE_PASSWORD are required');
    }

    const body = new URLSearchParams({
        grant_type: 'password',
        username,
        password,
    });

    const res = await fetch(`${ACCOUNT_SERVICE_URL}/v3/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Vexere OAuth failed (${res.status}): ${text}`);
    }

    const data = await res.json() as TokenResponse;
    _cachedToken = { token: data.access_token, expiresAt: Date.now() + TOKEN_TTL_MS };
    return data.access_token;
}

async function getToken(): Promise<string> {
    if (_cachedToken && Date.now() < _cachedToken.expiresAt) {
        return _cachedToken.token;
    }
    return fetchToken();
}

// ────────────────────────────────────────────────────────
// Trip search
// ────────────────────────────────────────────────────────

export interface TripResult {
    tripCode: string;
    companyName: string;
    companyRating: number;
    departureTime: string;   // ISO datetime string
    priceOriginal: number;
    priceDiscount: number;
    availableSeats: number;
    seatType: number;        // 1=Ghế ngồi, 2=Giường nằm, 7=Giường đôi
    seatTypeName: string;
}

interface VgateRoute {
    id: number;
    name: string;
    departure_date: string;  // ISO date "2026-03-20T00:00:00+07:00"
    departure_time: string;  // "HH:mm"
}

interface VgateSeatInfo {
    total_available_seat: number;
    fare: number[];
}

interface VgateItem {
    idIndex: string;
    route: VgateRoute;
    company: { name: string; ratings?: { overall?: number } };
    type: number;
    available_seat_info: {
        seat_type: Record<string, VgateSeatInfo>;
    };
}

interface VgateResponse {
    data: VgateItem[];
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
}

const SEAT_TYPE_NAMES: Record<number, string> = {
    1: 'Ghế ngồi',
    2: 'Giường nằm',
    7: 'Giường đôi',
};

export async function searchTrips(params: {
    fromProvince: string;
    toProvince: string;
    date: string;          // "YYYY-MM-DD"
    page?: number;
    pageSize?: number;
    sortBy?: string;       // "fare:asc" | "time:asc" | "rating:desc"
}): Promise<{ trips: TripResult[]; total: number; totalPages: number }> {
    const fromId = getProvinceId(params.fromProvince);
    const toId = getProvinceId(params.toProvince);

    if (!fromId || !toId) {
        throw new Error(`Unknown province: "${params.fromProvince}" or "${params.toProvince}"`);
    }

    const token = await getToken();
    const query = new URLSearchParams({
        'filter[from]': String(fromId),
        'filter[to]': String(toId),
        'filter[date]': params.date,
        'filter[online_ticket]': '1',
        'page': String(params.page ?? 1),
        'pagesize': String(Math.min(params.pageSize ?? 20, 20)),
    });

    if (params.sortBy) query.set('sort', params.sortBy);

    const res = await fetch(`${ROUTE_API_URL}/v2/route?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
        // Token might be expired — invalidate and retry once
        if (res.status === 401) {
            _cachedToken = null;
            const newToken = await getToken();
            const retryRes = await fetch(`${ROUTE_API_URL}/v2/route?${query}`, {
                headers: { Authorization: `Bearer ${newToken}` },
            });
            if (!retryRes.ok) {
                throw new Error(`Vexere API error (${retryRes.status})`);
            }
            return parseVgateResponse(await retryRes.json() as VgateResponse);
        }
        throw new Error(`Vexere API error (${res.status})`);
    }

    return parseVgateResponse(await res.json() as VgateResponse);
}

function parseVgateResponse(data: VgateResponse): { trips: TripResult[]; total: number; totalPages: number } {
    const trips: TripResult[] = [];

    for (const item of data.data ?? []) {
        const seatInfo = item.available_seat_info?.seat_type ?? {};

        // Build departure ISO string from date + time parts
        const dateStr = item.route?.departure_date?.substring(0, 10) ?? '';
        const timeStr = item.route?.departure_time ?? '00:00';
        const departureTime = dateStr ? `${dateStr}T${timeStr}:00+07:00` : '';

        // Expand each seat type as its own TripResult
        for (const [seatTypeStr, info] of Object.entries(seatInfo)) {
            const seatType = Number(seatTypeStr);
            const fares = info.fare ?? [];
            const minFare = fares.length ? Math.min(...fares) : 0;
            const maxFare = fares.length ? Math.max(...fares) : 0;

            trips.push({
                tripCode: item.idIndex,
                companyName: item.company?.name ?? '',
                companyRating: item.company?.ratings?.overall ?? 0,
                departureTime,
                priceOriginal: maxFare,
                priceDiscount: minFare,
                availableSeats: info.total_available_seat ?? 0,
                seatType,
                seatTypeName: SEAT_TYPE_NAMES[seatType] ?? 'Không rõ',
            });
        }
    }

    return {
        trips,
        total: data.total ?? 0,
        totalPages: data.total_pages ?? 0,
    };
}

export function isVexereConfigured(): boolean {
    return Boolean(process.env.VEXERE_USERNAME && process.env.VEXERE_PASSWORD);
}
