import { Router } from 'express';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createPlan, createPublicSessionPlan, deletePlan, getPlanBySessionId, getPlanBySlug, listPlans, updatePlan } from '../services/planService.js';
import { addLocation, updateLocation, deleteLocation, reorderLocations, type CreateLocationInput } from '../services/locationService.js';
import { analyzePlanPayload } from '../services/activityAnalysisService.js';
import { searchTrips } from '../lib/vexere.js';
import { getDb } from '../db/connection.js';

const router = Router();
const sseTransports = new Map<string, SSEServerTransport>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(data: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
function err(msg: string) {
    return { content: [{ type: 'text' as const, text: msg }], isError: true as const };
}

interface SessionPlanRef {
    id: number;
    slug: string;
    sessionId: string | null;
    isAdmin?: boolean;
}

function extractSessionId(input: unknown): string | null {
    if (typeof input !== 'string' || !input.trim()) return null;
    const value = input.trim();
    try {
        const url = new URL(value);
        return url.searchParams.get('session') || null;
    } catch {
        return /^[a-f0-9]{12,32}$/i.test(value) ? value : null;
    }
}

function getSessionPlanRef(args: Record<string, unknown>): SessionPlanRef | null {
    const db = getDb();
    const sessionId = extractSessionId(args.shareUrl) || extractSessionId(args.sessionId);
    if (sessionId) {
        const plan = db.prepare('SELECT id, slug, session_id as sessionId FROM plans WHERE session_id = ?').get(sessionId) as SessionPlanRef | undefined;
        return plan ?? null;
    }

    if (typeof args.planSlug === 'string' || typeof args.slug === 'string') {
        const slug = (args.planSlug || args.slug) as string;
        const plan = db.prepare('SELECT id, slug, session_id as sessionId FROM plans WHERE slug = ?').get(slug) as SessionPlanRef | undefined;
        return plan ?? null;
    }

    return null;
}

function isAdminAuthorized(args: Record<string, unknown>): boolean {
    return Boolean(process.env.ADMIN_PASSWORD && typeof args.adminPassword === 'string' && args.adminPassword === process.env.ADMIN_PASSWORD);
}

function stripMcpMeta(args: Record<string, unknown>): Record<string, unknown> {
    const { shareUrl: _shareUrl, sessionId: _sessionId, planSlug: _planSlug, slug: _slug, newSlug: _newSlug, adminPassword: _adminPassword, ...rest } = args;
    return rest;
}

function slugify(input: string): string {
    return input
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'trip';
}

function uniqueAdminSlug(input: string): string {
    const db = getDb();
    const base = slugify(input);
    let slug = base;
    let i = 1;
    while (db.prepare('SELECT id FROM plans WHERE slug = ?').get(slug)) {
        i += 1;
        slug = `${base}-${i}`.slice(0, 96);
    }
    return slug;
}

function getEditablePlanRef(args: Record<string, unknown>): SessionPlanRef | null {
    const sessionRef = getSessionPlanRef(args);
    if (sessionRef?.sessionId) return sessionRef;
    if (sessionRef && isAdminAuthorized(args)) return { ...sessionRef, isAdmin: true };
    if (!isAdminAuthorized(args)) return null;

    const slug = (args.planSlug || args.slug) as string | undefined;
    if (!slug) return null;
    const plan = getDb().prepare('SELECT id, slug, session_id as sessionId FROM plans WHERE slug = ?').get(slug) as SessionPlanRef | undefined;
    return plan ? { ...plan, isAdmin: true } : null;
}

function planPayload(ref: SessionPlanRef) {
    if (ref.sessionId) {
        const plan = getPlanBySessionId(ref.sessionId);
        return { ...plan, sessionId: ref.sessionId, shareUrl: `${APP_URL}/?slug=${plan?.slug || ref.slug}` };
    }
    const plan = getPlanBySlug(ref.slug);
    return { ...plan, shareUrl: `${APP_URL}/?slug=${ref.slug}` };
}

function locationBelongsToPlan(planId: number, locationId: number): boolean {
    return !!getDb().prepare('SELECT id FROM locations WHERE id = ? AND plan_id = ?').get(locationId, planId);
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOL_DEFINITIONS = [
    {
        name: 'list_plans',
        description: 'Liệt kê các plan mẫu đang có sẵn và slug có thể dùng với get_plan',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'create_plan',
        description: 'Tạo travel plan mới. Trả về shareUrl để chia sẻ. Slug có thể bỏ trống hoặc trùng; hệ thống sẽ tự tạo slug an toàn.',
        inputSchema: {
            type: 'object', required: ['name'],
            properties: {
                slug: { type: 'string', description: 'URL slug mong muốn, vd: ha-noi-sapa-2026. Nếu trùng sẽ tự thêm suffix.' },
                name: { type: 'string', description: 'Tên hiển thị, vd: Hà Nội → Sapa 2026' },
                dateRange: { type: 'string', description: 'Tuỳ chọn, vd: 01/06/2026 - 05/06/2026' },
                adminPassword: { type: 'string', description: 'Admin password để tạo plan prod/admin thay vì session plan' },
            },
        },
    },
    {
        name: 'get_plan',
        description: 'Lấy chi tiết plan. Có thể truyền shareUrl/sessionId từ link đã tạo để chỉnh sửa tiếp, hoặc slug để đọc plan mẫu.',
        inputSchema: {
            type: 'object',
            properties: {
                shareUrl: { type: 'string', description: 'Link share dạng https://trips.naai.studio/?slug=...' },
                sessionId: { type: 'string' },
                slug: { type: 'string' },
            },
        },
    },
    {
        name: 'analyze_activity_proximity',
        description: 'Read-only: kiểm tra khoảng cách các activity gần nhau, gợi ý gom cùng ngày/buổi, và liệt kê block di chuyển để AI sắp xếp plan hợp lý.',
        inputSchema: {
            type: 'object',
            properties: {
                shareUrl: { type: 'string', description: 'Link share dạng https://trips.naai.studio/?slug=...' },
                sessionId: { type: 'string' },
                slug: { type: 'string', description: 'Slug plan mẫu/admin để đọc' },
                planSlug: { type: 'string' },
                locationId: { type: 'number', description: 'Chỉ phân tích một điểm dừng nếu cần' },
                maxDistanceKm: { type: 'number', description: 'Ngưỡng xem là gần nhau, mặc định 5 km' },
                transportType: { type: 'string', enum: ['car', 'bus', 'train', 'flight', 'motorbike', 'ferry', 'walking', 'other', ''] },
            },
        },
    },
    {
        name: 'search_vexere_trips',
        description: 'Read-only: tra cứu chuyến xe khách, giá vé, loại ghế, giờ chạy và số ghế trống qua Vexere. Credential Vexere nằm trong app server, không cần truyền vào tool.',
        inputSchema: {
            type: 'object',
            required: ['from', 'to', 'date'],
            properties: {
                from: { type: 'string', description: 'Tỉnh/thành đi, vd: Hà Nội' },
                to: { type: 'string', description: 'Tỉnh/thành đến, vd: Nghệ An' },
                date: { type: 'string', description: 'Ngày đi dạng YYYY-MM-DD' },
                page: { type: 'number' },
                pageSize: { type: 'number' },
                sort: { type: 'string', description: 'fare:asc, time:asc, rating:desc' },
            },
        },
    },
    {
        name: 'update_plan',
        description: 'Cập nhật tên hoặc slug của session plan. Dùng shareUrl/sessionId để chỉnh sửa tiếp plan cũ.',
        inputSchema: {
            type: 'object',
            properties: {
                shareUrl: { type: 'string' },
                sessionId: { type: 'string' },
                slug: { type: 'string', description: 'Slug hiện tại' },
                name: { type: 'string' },
                dateRange: { type: 'string' },
                newSlug: { type: 'string', description: 'Slug mới nếu cần đổi' },
                adminPassword: { type: 'string', description: 'Admin password để chỉnh plan prod/admin thay vì chỉ session plan' },
            },
        },
    },
    {
        name: 'delete_plan',
        description: 'Xóa plan (chỉ plan tạo bởi MCP)',
        inputSchema: {
            type: 'object',
            properties: { shareUrl: { type: 'string' }, sessionId: { type: 'string' }, slug: { type: 'string' }, adminPassword: { type: 'string' } },
        },
    },
    {
        name: 'add_location',
        description: 'Thêm điểm dừng (tỉnh/thành phố) vào plan',
        inputSchema: {
            type: 'object', required: ['name'],
            properties: {
                shareUrl: { type: 'string' },
                sessionId: { type: 'string' },
                planSlug: { type: 'string' },
                adminPassword: { type: 'string', description: 'Admin password để chỉnh plan prod/admin thay vì chỉ session plan' },
                name: { type: 'string', description: 'Tên điểm dừng, vd: Hà Nội' },
                province: { type: 'string', description: 'Tên tỉnh/thành để map Vexere' },
                lat: { type: 'number' }, lng: { type: 'number' },
                arriveAt: { type: 'number', description: 'Unix timestamp ms' },
                departAt: { type: 'number', description: 'Unix timestamp ms' },
                durationDays: { type: 'number' },
                transportType: { type: 'string', description: 'car, bus, train, flight, motorbike, ferry, walking, other' },
                transportLabel: { type: 'string', description: 'Mô tả tuyến, không dùng để tính chi phí' },
            },
        },
    },
    {
        name: 'update_location',
        description: 'Cập nhật thông tin điểm dừng (partial update)',
        inputSchema: {
            type: 'object', required: ['locationId'],
            properties: {
                shareUrl: { type: 'string' },
                sessionId: { type: 'string' },
                planSlug: { type: 'string' }, adminPassword: { type: 'string' }, locationId: { type: 'number' },
                name: { type: 'string' }, province: { type: 'string' },
                lat: { type: 'number' }, lng: { type: 'number' },
                arriveAt: { type: 'number' }, departAt: { type: 'number' },
                durationDays: { type: 'number' }, transportType: { type: 'string' },
                transportLabel: { type: 'string' },
            },
        },
    },
    {
        name: 'delete_location',
        description: 'Xóa điểm dừng khỏi plan',
        inputSchema: {
            type: 'object', required: ['locationId'],
            properties: { shareUrl: { type: 'string' }, sessionId: { type: 'string' }, planSlug: { type: 'string' }, adminPassword: { type: 'string' }, locationId: { type: 'number' } },
        },
    },
    {
        name: 'reorder_locations',
        description: 'Sắp xếp lại thứ tự các điểm dừng trong plan, đồng thời cascade lại ngày theo thứ tự mới',
        inputSchema: {
            type: 'object', required: ['orderedIds'],
            properties: {
                shareUrl: { type: 'string' },
                sessionId: { type: 'string' },
                planSlug: { type: 'string' },
                adminPassword: { type: 'string' },
                orderedIds: { type: 'array', items: { type: 'number' }, description: 'Danh sách location id theo thứ tự mong muốn' },
            },
        },
    },
    {
        name: 'add_sub_location',
        description: 'Thêm điểm tham quan con vào điểm dừng (vd: Vịnh Hạ Long bên trong Hạ Long)',
        inputSchema: {
            type: 'object', required: ['locationId', 'name'],
            properties: {
                shareUrl: { type: 'string' }, sessionId: { type: 'string' },
                planSlug: { type: 'string' }, locationId: { type: 'number' },
                sortOrder: { type: 'number' },
                name: { type: 'string' }, address: { type: 'string', description: 'Địa chỉ cụ thể để hiển thị trên calendar/Google Maps' }, lat: { type: 'number' }, lng: { type: 'number' },
                durationMinutes: { type: 'number', description: 'Thời gian tham quan (phút)' },
                scheduledDate: { type: 'string', description: 'Ngày tham quan dạng YYYY-MM-DD' },
                scheduledTime: { type: 'string', description: 'Giờ bắt đầu dạng HH:mm. UI sẽ tự nhóm thành sáng/chiều/tối.' },
                scheduledPeriod: { type: 'string', enum: ['morning', 'afternoon', 'evening', ''], description: 'Buổi phụ trợ cho UI cũ; ưu tiên scheduledTime nếu có.' },
                description: { type: 'string' },
                activityType: { type: 'string', enum: ['sightseeing', 'accommodation', 'food', 'cafe', 'transport', 'other'] },
                transportType: { type: 'string', enum: ['car', 'bus', 'train', 'flight', 'motorbike', 'ferry', 'walking', 'other', ''] },
                pricingMode: { type: 'string', enum: ['per_person', 'per_room', 'per_group'] },
                unitPrice: { type: 'number' },
                quantity: { type: 'number' },
                surcharge: { type: 'number' },
                adultPrice: { type: 'number', description: 'Giá vé người lớn (VND)' },
                childPrice: { type: 'number' },
                participantAdults: { type: 'number', description: 'Số người lớn tham gia activity này' },
                participantChildren: { type: 'number', description: 'Số trẻ em tham gia activity này' },
                durationDays: { type: 'number', description: 'Số ngày activity kéo dài, dùng cho lưu trú/tour nhiều ngày' },
                adminPassword: { type: 'string', description: 'Admin password để chỉnh plan prod/admin thay vì chỉ session plan' },
            },
        },
    },
    {
        name: 'update_sub_location',
        description: 'Cập nhật điểm tham quan con (partial update)',
        inputSchema: {
            type: 'object', required: ['locationId', 'subLocationId'],
            properties: {
                shareUrl: { type: 'string' }, sessionId: { type: 'string' },
                planSlug: { type: 'string' }, adminPassword: { type: 'string' }, locationId: { type: 'number' }, subLocationId: { type: 'number' },
                sortOrder: { type: 'number' },
                name: { type: 'string' }, address: { type: 'string' }, lat: { type: 'number' }, lng: { type: 'number' },
                durationMinutes: { type: 'number' },
                durationDays: { type: 'number' },
                scheduledDate: { type: 'string' },
                scheduledTime: { type: 'string', description: 'Giờ bắt đầu dạng HH:mm' },
                scheduledPeriod: { type: 'string', enum: ['morning', 'afternoon', 'evening', ''] },
                description: { type: 'string' },
                activityType: { type: 'string', enum: ['sightseeing', 'accommodation', 'food', 'cafe', 'transport', 'other'] },
                transportType: { type: 'string', enum: ['car', 'bus', 'train', 'flight', 'motorbike', 'ferry', 'walking', 'other', ''] },
                pricingMode: { type: 'string', enum: ['per_person', 'per_room', 'per_group'] },
                unitPrice: { type: 'number' }, surcharge: { type: 'number' }, quantity: { type: 'number' },
                adultPrice: { type: 'number' }, childPrice: { type: 'number' },
                participantAdults: { type: 'number' },
                participantChildren: { type: 'number' },
            },
        },
    },
    {
        name: 'reorder_sub_locations',
        description: 'Sắp xếp lại thứ tự các điểm tham quan con trong một điểm dừng',
        inputSchema: {
            type: 'object', required: ['locationId', 'orderedIds'],
            properties: {
                shareUrl: { type: 'string' },
                sessionId: { type: 'string' },
                planSlug: { type: 'string' },
                adminPassword: { type: 'string' },
                locationId: { type: 'number' },
                orderedIds: { type: 'array', items: { type: 'number' }, description: 'Danh sách sub-location id theo thứ tự mong muốn' },
                schedules: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['id', 'scheduledDate'],
                        properties: {
                            id: { type: 'number' },
                            scheduledDate: { type: 'string', description: 'YYYY-MM-DD' },
                            scheduledTime: { type: 'string', description: 'HH:mm' },
                            scheduledPeriod: { type: 'string', enum: ['morning', 'afternoon', 'evening', ''] },
                        },
                    },
                },
            },
        },
    },
    {
        name: 'delete_sub_location',
        description: 'Xóa điểm tham quan con',
        inputSchema: {
            type: 'object', required: ['locationId', 'subLocationId'],
            properties: {
                shareUrl: { type: 'string' }, sessionId: { type: 'string' },
                planSlug: { type: 'string' }, adminPassword: { type: 'string' }, locationId: { type: 'number' }, subLocationId: { type: 'number' },
            },
        },
    },
];

// ─── Build MCP server instance (stateless — new per request) ──────────────────

const APP_URL = (process.env.APP_URL || 'https://trips.naai.studio').replace(/\/$/, '');

function buildServer(): Server {
    const server = new Server(
        { name: 'vietnam-roadtrips', version: '1.0.0' },
        { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args = {} } = request.params;
        const a = args as Record<string, unknown>;

        try {
            switch (name) {
                case 'list_plans':
                    return ok(listPlans());

                case 'create_plan': {
                    if (isAdminAuthorized(a)) {
                        const slug = typeof a.slug === 'string' && a.slug.trim() ? uniqueAdminSlug(a.slug) : uniqueAdminSlug(a.name as string);
                        const plan = createPlan({ slug, name: a.name as string, dateRange: a.dateRange as string | undefined });
                        return ok({ ...plan, shareUrl: `${APP_URL}/?slug=${plan.slug}` });
                    } else {
                        const sessionId = randomUUID().replace(/-/g, '').slice(0, 16);
                        const plan = createPublicSessionPlan({
                            slug: a.slug as string | undefined,
                            name: a.name as string,
                            dateRange: a.dateRange as string | undefined,
                            sessionId,
                        });
                        return ok({ ...plan, sessionId, shareUrl: `${APP_URL}/?slug=${plan.slug}` });
                    }
                }

                case 'get_plan': {
                    const sessionPlan = getSessionPlanRef(a);
                    if (sessionPlan?.sessionId) {
                        const plan = getPlanBySessionId(sessionPlan.sessionId);
                        return ok({ ...plan, sessionId: sessionPlan.sessionId, shareUrl: `${APP_URL}/?slug=${plan?.slug || sessionPlan.slug}` });
                    }

                    if (typeof a.slug !== 'string') return err('Provide shareUrl, sessionId, or slug');
                    const adminPlan = getPlanBySlug(a.slug as string);
                    if (!adminPlan) return err(`Plan "${a.slug}" not found`);
                    return ok({ ...adminPlan, shareUrl: `${APP_URL}/?slug=${adminPlan.slug}` });
                }

                case 'analyze_activity_proximity': {
                    const sessionPlan = getSessionPlanRef(a);
                    const slug = (a.slug || a.planSlug) as string | undefined;
                    const plan = sessionPlan?.sessionId ? getPlanBySessionId(sessionPlan.sessionId) : slug ? getPlanBySlug(slug) : null;
                    if (!plan) return err('Plan not found. Provide shareUrl/sessionId, slug, or planSlug.');
                    return ok(analyzePlanPayload(plan as never, {
                        locationId: typeof a.locationId === 'number' ? a.locationId : undefined,
                        maxDistanceKm: typeof a.maxDistanceKm === 'number' ? a.maxDistanceKm : undefined,
                        transportType: typeof a.transportType === 'string' ? a.transportType as never : undefined,
                    }));
                }

                case 'search_vexere_trips':
                    return ok(await searchTrips({
                        fromProvince: a.from as string,
                        toProvince: a.to as string,
                        date: a.date as string,
                        page: typeof a.page === 'number' ? a.page : undefined,
                        pageSize: typeof a.pageSize === 'number' ? a.pageSize : undefined,
                        sortBy: typeof a.sort === 'string' ? a.sort : undefined,
                    }));

                case 'update_plan': {
                    const ref = getEditablePlanRef(a);
                    if (!ref) return err('Plan not found or admin password missing. Provide session shareUrl/sessionId, or adminPassword with slug/planSlug.');
                    if (!ref.sessionId && ref.isAdmin) {
                        const plan = updatePlan(ref.slug, { name: a.name as string | undefined, slug: a.newSlug as string | undefined, dateRange: a.dateRange as string | undefined });
                        if (!plan) return err(`Plan "${ref.slug}" not found`);
                        return ok({ ...plan, shareUrl: `${APP_URL}/?slug=${plan.slug}` });
                    }
                    const db = getDb();
                    if (a.name !== undefined) db.prepare('UPDATE plans SET name = ?, updated_at = ? WHERE id = ?').run(a.name, Date.now(), ref.id);
                    if (a.newSlug !== undefined) db.prepare('UPDATE plans SET slug = ?, updated_at = ? WHERE id = ?').run(a.newSlug, Date.now(), ref.id);
                    if (a.dateRange !== undefined) db.prepare('UPDATE plans SET date_range = ?, updated_at = ? WHERE id = ?').run(a.dateRange, Date.now(), ref.id);
                    return ok(planPayload({ ...ref, slug: (a.newSlug as string | undefined) ?? ref.slug }));
                }

                case 'delete_plan': {
                    const ref = getEditablePlanRef(a);
                    if (!ref) return err('Plan not found or admin password missing. Provide session shareUrl/sessionId, or adminPassword with slug/planSlug.');
                    if (ref.sessionId) {
                        const result = getDb().prepare('DELETE FROM plans WHERE id = ? AND session_id IS NOT NULL').run(ref.id);
                        if (result.changes === 0) return err(`Plan "${ref.slug}" not found`);
                    } else if (!deletePlan(ref.slug)) return err(`Plan "${ref.slug}" not found`);
                    return ok({ ok: true });
                }

                case 'add_location': {
                    const ref = getEditablePlanRef(a);
                    if (!ref) return err('Plan not found or admin password missing. Provide session shareUrl/sessionId, or adminPassword with slug/planSlug.');
                    const id = addLocation(ref.id, stripMcpMeta(a) as unknown as CreateLocationInput);
                    return ok({ id, planSlug: ref.slug, sessionId: ref.sessionId ?? undefined, shareUrl: `${APP_URL}/?slug=${ref.slug}` });
                }

                case 'update_location': {
                    const ref = getEditablePlanRef(a);
                    if (!ref) return err('Plan not found or admin password missing. Provide session shareUrl/sessionId, or adminPassword with slug/planSlug.');
                    if (!updateLocation(ref.id, a.locationId as number, stripMcpMeta(a))) return err('Location not found');
                    return ok(planPayload(ref));
                }

                case 'delete_location': {
                    const ref = getEditablePlanRef(a);
                    if (!ref) return err('Plan not found or admin password missing. Provide session shareUrl/sessionId, or adminPassword with slug/planSlug.');
                    if (!deleteLocation(ref.id, a.locationId as number)) return err('Location not found');
                    return ok(planPayload(ref));
                }

                case 'reorder_locations': {
                    const ref = getEditablePlanRef(a);
                    if (!ref) return err('Plan not found or admin password missing. Provide session shareUrl/sessionId, or adminPassword with slug/planSlug.');
                    if (!Array.isArray(a.orderedIds)) return err('orderedIds must be an array');
                    reorderLocations(ref.id, a.orderedIds as number[]);
                    return ok(planPayload(ref));
                }

                case 'add_sub_location': {
                    const ref = getEditablePlanRef(a);
                    if (!ref) return err('Plan not found or admin password missing. Provide session shareUrl/sessionId, or adminPassword with slug/planSlug.');
                    if (!locationBelongsToPlan(ref.id, a.locationId as number)) return err('Location not found');
                    const db = getDb();
                    const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM sub_locations WHERE location_id = ?').get(a.locationId) as { m: number | null }).m ?? 0;
                    const result = db.prepare(
                        'INSERT INTO sub_locations (location_id, sort_order, name, address, lat, lng, duration_minutes, duration_days, scheduled_date, scheduled_period, scheduled_time, description, activity_type, transport_type, pricing_mode, unit_price, quantity, surcharge, adult_price, child_price, participant_adults, participant_children) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    ).run(a.locationId, a.sortOrder ?? maxOrder + 1, a.name, a.address ?? '', a.lat ?? 0, a.lng ?? 0, a.durationMinutes ?? 60, a.durationDays ?? 0, a.scheduledDate ?? '', a.scheduledPeriod ?? '', a.scheduledTime ?? '', a.description ?? '', a.activityType ?? 'sightseeing', a.transportType ?? '', a.pricingMode ?? 'per_person', a.unitPrice ?? 0, a.quantity ?? 1, a.surcharge ?? 0, a.adultPrice ?? 0, a.childPrice ?? 0, a.participantAdults ?? null, a.participantChildren ?? null);
                    return ok({ id: result.lastInsertRowid, planSlug: ref.slug, sessionId: ref.sessionId ?? undefined, shareUrl: `${APP_URL}/?slug=${ref.slug}` });
                }

                case 'update_sub_location': {
                    const ref = getEditablePlanRef(a);
                    if (!ref) return err('Plan not found or admin password missing. Provide session shareUrl/sessionId, or adminPassword with slug/planSlug.');
                    if (!locationBelongsToPlan(ref.id, a.locationId as number)) return err('Location not found');
                    const db = getDb();
                    if (!db.prepare('SELECT id FROM sub_locations WHERE id = ? AND location_id = ?').get(a.subLocationId, a.locationId)) return err('Sub-location not found');
                    const fields: string[] = [];
                    const values: unknown[] = [];
                    const map: Record<string, unknown> = { name: a.name, address: a.address, lat: a.lat, lng: a.lng, sort_order: a.sortOrder, duration_minutes: a.durationMinutes, duration_days: a.durationDays, scheduled_date: a.scheduledDate, scheduled_period: a.scheduledPeriod, scheduled_time: a.scheduledTime, description: a.description, activity_type: a.activityType, transport_type: a.transportType, pricing_mode: a.pricingMode, unit_price: a.unitPrice, quantity: a.quantity, surcharge: a.surcharge, adult_price: a.adultPrice, child_price: a.childPrice, participant_adults: a.participantAdults, participant_children: a.participantChildren };
                    for (const [k, v] of Object.entries(map)) {
                        if (v !== undefined) { fields.push(`${k} = ?`); values.push(v); }
                    }
                    if (fields.length) { values.push(a.subLocationId); db.prepare(`UPDATE sub_locations SET ${fields.join(', ')} WHERE id = ?`).run(...values); }
                    return ok(planPayload(ref));
                }

                case 'reorder_sub_locations': {
                    const ref = getEditablePlanRef(a);
                    if (!ref) return err('Plan not found or admin password missing. Provide session shareUrl/sessionId, or adminPassword with slug/planSlug.');
                    if (!locationBelongsToPlan(ref.id, a.locationId as number)) return err('Location not found');
                    if (!Array.isArray(a.orderedIds)) return err('orderedIds must be an array');
                    const update = getDb().prepare('UPDATE sub_locations SET sort_order = ? WHERE id = ? AND location_id = ?');
                    const updateSchedule = getDb().prepare('UPDATE sub_locations SET scheduled_date = ?, scheduled_period = ?, scheduled_time = ? WHERE id = ? AND location_id = ?');
                    const tx = getDb().transaction(() => {
                        (a.orderedIds as number[]).forEach((id, idx) => update.run(idx, id, a.locationId));
                        if (Array.isArray(a.schedules)) {
                            (a.schedules as Array<{ id: number; scheduledDate: string; scheduledPeriod?: string; scheduledTime?: string }>).forEach(item => updateSchedule.run(item.scheduledDate || '', item.scheduledPeriod || '', item.scheduledTime || '', item.id, a.locationId));
                        }
                    });
                    tx();
                    return ok(planPayload(ref));
                }

                case 'delete_sub_location': {
                    const ref = getEditablePlanRef(a);
                    if (!ref) return err('Plan not found or admin password missing. Provide session shareUrl/sessionId, or adminPassword with slug/planSlug.');
                    if (!locationBelongsToPlan(ref.id, a.locationId as number)) return err('Location not found');
                    const result = getDb().prepare('DELETE FROM sub_locations WHERE id = ? AND location_id = ?').run(a.subLocationId, a.locationId);
                    if (result.changes === 0) return err('Sub-location not found');
                    return ok(planPayload(ref));
                }

                default:
                    return err(`Unknown tool: ${name}`);
            }
        } catch (e) {
            return err(`Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    });

    return server;
}

// ─── Express handler ──────────────────────────────────────────────────────────

// CORS cho MCP clients (browser-based hoặc remote)
router.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    next();
});

router.options('/', (_req, res) => { res.sendStatus(204); });
router.options('/messages', (_req, res) => { res.sendStatus(204); });

async function handleMcp(req: import('express').Request, res: import('express').Response) {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = buildServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('finish', () => { transport.close().catch(() => {}); });
}

// POST: tool calls từ MCP clients
router.post('/', handleMcp);

// GET: legacy SSE clients. Sends the endpoint event immediately so reverse
// proxies do not close an idle text/event-stream connection.
router.get('/', async (_req, res) => {
    try {
        const transport = new SSEServerTransport('/mcp/messages', res);
        sseTransports.set(transport.sessionId, transport);
        res.on('close', () => {
            sseTransports.delete(transport.sessionId);
        });
        const server = buildServer();
        await server.connect(transport);
    } catch (error) {
        if (!res.headersSent) {
            res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        } else {
            res.end();
        }
    }
});

// POST target advertised by the legacy SSE endpoint event.
router.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId;
    if (typeof sessionId !== 'string') {
        res.status(400).send('Missing sessionId');
        return;
    }
    const transport = sseTransports.get(sessionId);
    if (!transport) {
        res.status(400).send('No transport found for sessionId');
        return;
    }
    try {
        await transport.handlePostMessage(req, res, req.body);
    } catch (error) {
        if (!res.headersSent) {
            res.status(500).send(error instanceof Error ? error.message : String(error));
        }
    }
});

// DELETE: session termination (stateless — không cần làm gì)
router.delete('/', (_req, res) => { res.sendStatus(200); });

export default router;
