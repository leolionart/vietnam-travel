import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// ─── Remote HTTP client ───────────────────────────────────────────────────────

class RemoteClient {
    private token: string | null = null;

    constructor(
        private readonly baseUrl: string,
        private readonly password: string | null,
    ) {}

    private async login(): Promise<void> {
        const res = await fetch(`${this.baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: this.password }),
        });
        if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
        const data = await res.json() as { token: string };
        this.token = data.token;
    }

    async get(path: string): Promise<unknown> {
        const res = await fetch(`${this.baseUrl}${path}`);
        if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
        return res.json();
    }

    // Public request — no auth, uses /api/public namespace
    async publicRequest(method: string, path: string, body?: unknown): Promise<unknown> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
        return res.json();
    }

    async request(method: string, path: string, body?: unknown): Promise<unknown> {
        if (!this.password) return this.publicRequest(method, path.replace('/api/plans', '/api/public/plans'), body);
        if (!this.token) await this.login();

        const res = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.token}`,
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        // Token expired → re-login once
        if (res.status === 401) {
            await this.login();
            return this.request(method, path, body);
        }

        if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
        return res.json();
    }

    post(path: string, body: unknown) { return this.request('POST', path, body); }
    put(path: string, body: unknown) { return this.request('PUT', path, body); }
    del(path: string) { return this.request('DELETE', path); }
    patch(path: string, body: unknown) { return this.request('PATCH', path, body); }
}

// ─── Local DB mode ────────────────────────────────────────────────────────────

let localMode: {
    listPlans: () => unknown;
    getPlanBySlug: (slug: string) => unknown;
    createPlan: (d: { slug: string; name: string; dateRange?: string }) => unknown;
    updatePlan: (slug: string, d: { name?: string; slug?: string; dateRange?: string }) => unknown;
    deletePlan: (slug: string) => boolean;
    addLocation: (planId: number, input: Record<string, unknown>) => number;
    updateLocation: (planId: number, id: number, input: Record<string, unknown>) => boolean;
    deleteLocation: (planId: number, id: number) => boolean;
    reorderLocations: (planId: number, orderedIds: number[]) => void;
    getPlanId: (slug: string) => number | null;
    locationBelongsToPlan: (planId: number, locationId: number) => boolean;
    getDb: () => import('better-sqlite3').Database;
} | null = null;

const REMOTE_API_URL = process.env.REMOTE_API_URL?.replace(/\/$/, '');
let adminPassword = process.env.ADMIN_PASSWORD ?? null;

let remote: RemoteClient | null = null;

if (REMOTE_API_URL) {
    remote = new RemoteClient(REMOTE_API_URL, adminPassword);
} else {
    // Lazy-import local modules only when not using remote
    const [migrate, planSvc, locSvc, conn] = await Promise.all([
        import('./db/migrate.js'),
        import('./services/planService.js'),
        import('./services/locationService.js'),
        import('./db/connection.js'),
    ]);

    migrate.runMigration();

    localMode = {
        listPlans: planSvc.listPlans,
        getPlanBySlug: planSvc.getPlanBySlug,
        createPlan: planSvc.createPlan,
        updatePlan: planSvc.updatePlan,
        deletePlan: planSvc.deletePlan,
        addLocation: locSvc.addLocation as unknown as (planId: number, input: Record<string, unknown>) => number,
        updateLocation: locSvc.updateLocation as unknown as (planId: number, id: number, input: Record<string, unknown>) => boolean,
        deleteLocation: locSvc.deleteLocation,
        reorderLocations: locSvc.reorderLocations,
        getPlanId(slug) {
            const row = conn.getDb().prepare('SELECT id FROM plans WHERE slug = ?').get(slug) as { id: number } | undefined;
            return row?.id ?? null;
        },
        locationBelongsToPlan(planId, locationId) {
            return !!conn.getDb().prepare('SELECT id FROM locations WHERE id = ? AND plan_id = ?').get(locationId, planId);
        },
        getDb: conn.getDb,
    };
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new Server(
    { name: 'vietnam-travel', version: '1.0.0' },
    { capabilities: { tools: {} } },
);

const TOOL_DEFINITIONS = [
    {
        name: 'set_admin_password',
        description: 'Set admin password for this MCP stdio session so following tools can configure admin/prod plans through REMOTE_API_URL. The password is kept in memory only.',
        inputSchema: {
            type: 'object',
            required: ['adminPassword'],
            properties: {
                adminPassword: { type: 'string', description: 'Admin password. Do not store it in prompts or files.' },
            },
        },
    },
    {
        name: 'list_plans',
        description: 'Liệt kê tất cả travel plans',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'get_plan',
        description: 'Lấy chi tiết 1 plan gồm tất cả locations và sub-locations',
        inputSchema: {
            type: 'object',
            required: ['slug'],
            properties: {
                slug: { type: 'string', description: 'Plan slug, vd: ha-noi-hue-da-nang' },
            },
        },
    },
    {
        name: 'create_plan',
        description: 'Tạo travel plan mới. Slug có thể bỏ trống hoặc trùng khi dùng public remote; hệ thống sẽ tự tạo slug an toàn.',
        inputSchema: {
            type: 'object',
            required: ['name'],
            properties: {
                slug: { type: 'string', description: 'URL slug mong muốn, vd: ha-noi-sapa-2026' },
                name: { type: 'string', description: 'Tên hiển thị, vd: Hà Nội → Sapa 2026' },
                dateRange: { type: 'string', description: 'Tuỳ chọn, vd: 01/06/2026 - 05/06/2026' },
            },
        },
    },
    {
        name: 'update_plan',
        description: 'Cập nhật tên hoặc slug của một plan',
        inputSchema: {
            type: 'object',
            required: ['slug'],
            properties: {
                slug: { type: 'string', description: 'Slug hiện tại' },
                name: { type: 'string' },
                dateRange: { type: 'string' },
                newSlug: { type: 'string', description: 'Đổi slug mới nếu cần' },
            },
        },
    },
    {
        name: 'delete_plan',
        description: 'Xóa toàn bộ plan (kèm tất cả locations)',
        inputSchema: {
            type: 'object',
            required: ['slug'],
            properties: { slug: { type: 'string' } },
        },
    },
    {
        name: 'add_location',
        description: 'Thêm điểm dừng (tỉnh/thành phố) vào một plan',
        inputSchema: {
            type: 'object',
            required: ['planSlug', 'name'],
            properties: {
                planSlug: { type: 'string' },
                name: { type: 'string', description: 'Tên điểm dừng, vd: Hà Nội' },
                province: { type: 'string', description: 'Tên tỉnh/thành để map Vexere, vd: Hà Nội' },
                lat: { type: 'number' },
                lng: { type: 'number' },
                arriveAt: { type: 'number', description: 'Unix timestamp ms' },
                departAt: { type: 'number', description: 'Unix timestamp ms' },
                durationDays: { type: 'number' },
                transportType: { type: 'string', description: 'car, bus, train, flight, motorbike, ferry, walking, other' },
                transportLabel: { type: 'string', description: 'Mô tả tuyến, không dùng để tính chi phí' },
                adults: { type: 'number', description: 'Số người lớn, mặc định 2' },
                children: { type: 'number', description: 'Số trẻ em, mặc định 0' },
                highlight: { type: 'string', description: 'Mô tả ngắn gọn điểm nổi bật' },
                description: { type: 'string', description: 'Mô tả chi tiết' },
                activities: { type: 'array', items: { type: 'string' }, description: 'Danh sách hoạt động' },
                food: { type: 'array', items: { type: 'string' }, description: 'Đặc sản/ẩm thực địa phương' },
            },
        },
    },
    {
        name: 'update_location',
        description: 'Cập nhật thông tin điểm dừng (partial update — chỉ gửi fields cần thay đổi)',
        inputSchema: {
            type: 'object',
            required: ['planSlug', 'locationId'],
            properties: {
                planSlug: { type: 'string' },
                locationId: { type: 'number' },
                name: { type: 'string' },
                province: { type: 'string' },
                lat: { type: 'number' },
                lng: { type: 'number' },
                arriveAt: { type: 'number' },
                departAt: { type: 'number' },
                durationDays: { type: 'number' },
                transportType: { type: 'string' },
                transportLabel: { type: 'string' },
                adults: { type: 'number' },
                children: { type: 'number' },
                highlight: { type: 'string' },
                description: { type: 'string' },
                activities: { type: 'array', items: { type: 'string' } },
                food: { type: 'array', items: { type: 'string' } },
            },
        },
    },
    {
        name: 'delete_location',
        description: 'Xóa điểm dừng khỏi plan',
        inputSchema: {
            type: 'object',
            required: ['planSlug', 'locationId'],
            properties: {
                planSlug: { type: 'string' },
                locationId: { type: 'number' },
            },
        },
    },
    {
        name: 'reorder_locations',
        description: 'Sắp xếp lại thứ tự các điểm dừng trong plan',
        inputSchema: {
            type: 'object',
            required: ['planSlug', 'orderedIds'],
            properties: {
                planSlug: { type: 'string' },
                orderedIds: { type: 'array', items: { type: 'number' } },
            },
        },
    },
    {
        name: 'add_sub_location',
        description: 'Thêm điểm tham quan con vào một điểm dừng (vd: Vịnh Hạ Long bên trong Hạ Long)',
        inputSchema: {
            type: 'object',
            required: ['planSlug', 'locationId', 'name'],
            properties: {
                planSlug: { type: 'string' },
                locationId: { type: 'number' },
                sortOrder: { type: 'number' },
                name: { type: 'string' },
                lat: { type: 'number' },
                lng: { type: 'number' },
                durationMinutes: { type: 'number', description: 'Thời gian tham quan (phút)' },
                scheduledDate: { type: 'string', description: 'Ngày tham quan dạng YYYY-MM-DD' },
                scheduledPeriod: { type: 'string', enum: ['morning', 'afternoon'], description: 'Buổi tham quan' },
                description: { type: 'string' },
                activityType: { type: 'string', enum: ['sightseeing', 'accommodation', 'food', 'transport', 'other'] },
                transportType: { type: 'string', enum: ['car', 'bus', 'train', 'flight', 'motorbike', 'ferry', 'walking', 'other', ''] },
                pricingMode: { type: 'string', enum: ['per_person', 'per_room', 'per_group'] },
                unitPrice: { type: 'number' },
                quantity: { type: 'number' },
                surcharge: { type: 'number' },
                adultPrice: { type: 'number', description: 'Giá vé người lớn (VND)' },
                childPrice: { type: 'number' },
                durationDays: { type: 'number', description: 'Số ngày activity kéo dài, dùng cho lưu trú/tour nhiều ngày' },
            },
        },
    },
    {
        name: 'update_sub_location',
        description: 'Cập nhật điểm tham quan con (partial update)',
        inputSchema: {
            type: 'object',
            required: ['planSlug', 'locationId', 'subLocationId'],
            properties: {
                planSlug: { type: 'string' },
                locationId: { type: 'number' },
                subLocationId: { type: 'number' },
                sortOrder: { type: 'number' },
                name: { type: 'string' },
                lat: { type: 'number' },
                lng: { type: 'number' },
                durationMinutes: { type: 'number' },
                durationDays: { type: 'number' },
                scheduledDate: { type: 'string' },
                scheduledPeriod: { type: 'string', enum: ['morning', 'afternoon', ''] },
                description: { type: 'string' },
                activityType: { type: 'string', enum: ['sightseeing', 'accommodation', 'food', 'transport', 'other'] },
                transportType: { type: 'string', enum: ['car', 'bus', 'train', 'flight', 'motorbike', 'ferry', 'walking', 'other', ''] },
                pricingMode: { type: 'string', enum: ['per_person', 'per_room', 'per_group'] },
                unitPrice: { type: 'number' },
                quantity: { type: 'number' },
                surcharge: { type: 'number' },
                adultPrice: { type: 'number' },
                childPrice: { type: 'number' },
            },
        },
    },
    {
        name: 'reorder_sub_locations',
        description: 'Sắp xếp lại thứ tự các điểm tham quan con trong một điểm dừng',
        inputSchema: {
            type: 'object',
            required: ['planSlug', 'locationId', 'orderedIds'],
            properties: {
                planSlug: { type: 'string' },
                locationId: { type: 'number' },
                orderedIds: { type: 'array', items: { type: 'number' } },
                schedules: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['id', 'scheduledDate', 'scheduledPeriod'],
                        properties: {
                            id: { type: 'number' },
                            scheduledDate: { type: 'string', description: 'YYYY-MM-DD' },
                            scheduledPeriod: { type: 'string', enum: ['morning', 'afternoon'] },
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
            type: 'object',
            required: ['planSlug', 'locationId', 'subLocationId'],
            properties: {
                planSlug: { type: 'string' },
                locationId: { type: 'number' },
                subLocationId: { type: 'number' },
            },
        },
    },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));

// ─── Tool handlers ────────────────────────────────────────────────────────────

function ok(data: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
function err(msg: string) {
    return { content: [{ type: 'text' as const, text: msg }], isError: true as const };
}

function toolPassword(args: Record<string, unknown>): string | null {
    return typeof args.adminPassword === 'string' && args.adminPassword ? args.adminPassword : adminPassword;
}

function remoteFor(args: Record<string, unknown>): RemoteClient {
    if (!REMOTE_API_URL) throw new Error('REMOTE_API_URL is not configured');
    return new RemoteClient(REMOTE_API_URL, toolPassword(args));
}

function stripMcpMeta(args: Record<string, unknown>): Record<string, unknown> {
    const { adminPassword: _adminPassword, ...rest } = args;
    return rest;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
        // ── Remote HTTP mode ──────────────────────────────────────────────────
        if (remote) {
            const { planSlug, locationId, subLocationId } = args as Record<string, unknown>;
            const slug = (args.slug ?? planSlug) as string | undefined;
            const client = remoteFor(args as Record<string, unknown>);

            switch (name) {
                case 'set_admin_password':
                    adminPassword = (args as Record<string, unknown>).adminPassword as string;
                    remote = remoteFor(args as Record<string, unknown>);
                    return ok({ ok: true, mode: 'admin-password-set' });

                case 'list_plans':
                    return ok(await client.get('/api/plans'));

                case 'get_plan':
                    return ok(await client.get(`/api/plans/${slug}`));

                case 'create_plan': {
                    const result = await client.post('/api/plans', stripMcpMeta({ slug: args.slug, name: args.name, dateRange: args.dateRange })) as { slug: string; sessionId?: string };
                    const shareUrl = result.sessionId
                        ? `${REMOTE_API_URL}/?session=${result.sessionId}`
                        : `${REMOTE_API_URL}/?slug=${result.slug}`;
                    return ok({ ...result, shareUrl });
                }

                case 'update_plan':
                    return ok(await client.put(`/api/plans/${slug}`, stripMcpMeta({ name: args.name, slug: args.newSlug, dateRange: args.dateRange })));

                case 'delete_plan':
                    return ok(await client.del(`/api/plans/${slug}`));

                case 'add_location': {
                    const { planSlug: ps, ...rest } = args as Record<string, unknown>;
                    return ok(await client.post(`/api/plans/${ps}/locations`, stripMcpMeta(rest)));
                }

                case 'update_location':
                    return ok(await client.put(`/api/plans/${planSlug}/locations/${locationId}`, stripMcpMeta(args as Record<string, unknown>)));

                case 'delete_location':
                    return ok(await client.del(`/api/plans/${planSlug}/locations/${locationId}`));

                case 'reorder_locations':
                    return ok(await client.patch(`/api/plans/${planSlug}/locations/reorder`, { orderedIds: args.orderedIds }));

                case 'add_sub_location': {
                    const { planSlug: ps, locationId: lid, ...rest } = args as Record<string, unknown>;
                    return ok(await client.post(`/api/plans/${ps}/locations/${lid}/sub-locations`, stripMcpMeta(rest)));
                }

                case 'update_sub_location':
                    return ok(await client.put(`/api/plans/${planSlug}/locations/${locationId}/sub-locations/${subLocationId}`, stripMcpMeta(args as Record<string, unknown>)));

                case 'delete_sub_location':
                    return ok(await client.del(`/api/plans/${planSlug}/locations/${locationId}/sub-locations/${subLocationId}`));

                case 'reorder_sub_locations':
                    return ok(await client.patch(`/api/plans/${planSlug}/locations/${locationId}/sub-locations/reorder`, { orderedIds: args.orderedIds, schedules: args.schedules }));

                default:
                    return err(`Unknown tool: ${name}`);
            }
        }

        // ── Local DB mode ─────────────────────────────────────────────────────
        const L = localMode!;

        switch (name) {
            case 'set_admin_password':
                adminPassword = (args as Record<string, unknown>).adminPassword as string;
                return ok({ ok: true, mode: 'admin-password-set' });

            case 'list_plans':
                return ok(L.listPlans());

            case 'get_plan': {
                const plan = L.getPlanBySlug(args.slug as string);
                if (!plan) return err(`Plan "${args.slug}" not found`);
                return ok(plan);
            }

            case 'create_plan':
                return ok(L.createPlan({ slug: args.slug as string, name: args.name as string, dateRange: args.dateRange as string | undefined }));

            case 'update_plan': {
                const plan = L.updatePlan(args.slug as string, { name: args.name as string | undefined, slug: args.newSlug as string | undefined, dateRange: args.dateRange as string | undefined });
                if (!plan) return err(`Plan "${args.slug}" not found`);
                return ok(plan);
            }

            case 'delete_plan': {
                if (!L.deletePlan(args.slug as string)) return err(`Plan "${args.slug}" not found`);
                return ok({ ok: true });
            }

            case 'add_location': {
                const planId = L.getPlanId(args.planSlug as string);
                if (!planId) return err(`Plan "${args.planSlug}" not found`);
                const id = L.addLocation(planId, args as Record<string, unknown>);
                return ok({ id, planSlug: args.planSlug });
            }

            case 'update_location': {
                const planId = L.getPlanId(args.planSlug as string);
                if (!planId) return err(`Plan "${args.planSlug}" not found`);
                if (!L.updateLocation(planId, args.locationId as number, args as Record<string, unknown>)) return err('Location not found');
                return ok({ ok: true });
            }

            case 'delete_location': {
                const planId = L.getPlanId(args.planSlug as string);
                if (!planId) return err(`Plan "${args.planSlug}" not found`);
                if (!L.deleteLocation(planId, args.locationId as number)) return err('Location not found');
                return ok({ ok: true });
            }

            case 'reorder_locations': {
                const planId = L.getPlanId(args.planSlug as string);
                if (!planId) return err(`Plan "${args.planSlug}" not found`);
                if (!Array.isArray(args.orderedIds)) return err('orderedIds must be an array');
                L.reorderLocations(planId, args.orderedIds as number[]);
                return ok({ ok: true });
            }

            case 'add_sub_location': {
                const planId = L.getPlanId(args.planSlug as string);
                if (!planId) return err(`Plan "${args.planSlug}" not found`);
                if (!L.locationBelongsToPlan(planId, args.locationId as number)) return err('Location not found');
                const db = L.getDb();
                const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM sub_locations WHERE location_id = ?').get(args.locationId) as { m: number | null }).m ?? 0;
                const result = db.prepare(
                    'INSERT INTO sub_locations (location_id, sort_order, name, lat, lng, duration_minutes, duration_days, scheduled_date, scheduled_period, description, activity_type, transport_type, pricing_mode, unit_price, quantity, surcharge, adult_price, child_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                ).run(args.locationId, args.sortOrder ?? maxOrder + 1, args.name, args.lat ?? 0, args.lng ?? 0, args.durationMinutes ?? 60, args.durationDays ?? 0, args.scheduledDate ?? '', args.scheduledPeriod ?? '', args.description ?? '', args.activityType ?? 'sightseeing', args.transportType ?? '', args.pricingMode ?? 'per_person', args.unitPrice ?? 0, args.quantity ?? 1, args.surcharge ?? 0, args.adultPrice ?? 0, args.childPrice ?? 0);
                return ok({ id: result.lastInsertRowid });
            }

            case 'update_sub_location': {
                const planId = L.getPlanId(args.planSlug as string);
                if (!planId) return err(`Plan "${args.planSlug}" not found`);
                if (!L.locationBelongsToPlan(planId, args.locationId as number)) return err('Location not found');
                const db = L.getDb();
                if (!db.prepare('SELECT id FROM sub_locations WHERE id = ? AND location_id = ?').get(args.subLocationId, args.locationId)) return err('Sub-location not found');
                const fields: string[] = [];
                const values: unknown[] = [];
                const map: Record<string, unknown> = { name: args.name, lat: args.lat, lng: args.lng, sort_order: args.sortOrder, duration_minutes: args.durationMinutes, duration_days: args.durationDays, scheduled_date: args.scheduledDate, scheduled_period: args.scheduledPeriod, description: args.description, activity_type: args.activityType, transport_type: args.transportType, pricing_mode: args.pricingMode, unit_price: args.unitPrice, quantity: args.quantity, surcharge: args.surcharge, adult_price: args.adultPrice, child_price: args.childPrice };
                for (const [k, v] of Object.entries(map)) {
                    if (v !== undefined) { fields.push(`${k} = ?`); values.push(v); }
                }
                if (fields.length) { values.push(args.subLocationId); db.prepare(`UPDATE sub_locations SET ${fields.join(', ')} WHERE id = ?`).run(...values); }
                return ok({ ok: true });
            }

            case 'reorder_sub_locations': {
                const planId = L.getPlanId(args.planSlug as string);
                if (!planId) return err(`Plan "${args.planSlug}" not found`);
                if (!L.locationBelongsToPlan(planId, args.locationId as number)) return err('Location not found');
                if (!Array.isArray(args.orderedIds)) return err('orderedIds must be an array');
                const db = L.getDb();
                const update = db.prepare('UPDATE sub_locations SET sort_order = ? WHERE id = ? AND location_id = ?');
                const updateSchedule = db.prepare('UPDATE sub_locations SET scheduled_date = ?, scheduled_period = ? WHERE id = ? AND location_id = ?');
                const tx = db.transaction(() => {
                    (args.orderedIds as number[]).forEach((id, idx) => update.run(idx, id, args.locationId));
                    if (Array.isArray(args.schedules)) {
                        (args.schedules as Array<{ id: number; scheduledDate: string; scheduledPeriod: string }>).forEach(item => updateSchedule.run(item.scheduledDate || '', item.scheduledPeriod || '', item.id, args.locationId));
                    }
                });
                tx();
                return ok({ ok: true });
            }

            case 'delete_sub_location': {
                const planId = L.getPlanId(args.planSlug as string);
                if (!planId) return err(`Plan "${args.planSlug}" not found`);
                if (!L.locationBelongsToPlan(planId, args.locationId as number)) return err('Location not found');
                const result = L.getDb().prepare('DELETE FROM sub_locations WHERE id = ? AND location_id = ?').run(args.subLocationId, args.locationId);
                if (result.changes === 0) return err('Sub-location not found');
                return ok({ ok: true });
            }

            default:
                return err(`Unknown tool: ${name}`);
        }
    } catch (e) {
        return err(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
});

const transport = new StdioServerTransport();
await server.connect(transport);
