import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// ─── Remote HTTP client ───────────────────────────────────────────────────────

class RemoteClient {
    private token: string | null = null;

    constructor(
        private readonly baseUrl: string,
        private readonly password: string,
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

    async request(method: string, path: string, body?: unknown): Promise<unknown> {
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
    updatePlan: (slug: string, d: { name?: string; slug?: string }) => unknown;
    deletePlan: (slug: string) => boolean;
    addLocation: (planId: number, input: Record<string, unknown>) => number;
    updateLocation: (planId: number, id: number, input: Record<string, unknown>) => boolean;
    deleteLocation: (planId: number, id: number) => boolean;
    getPlanId: (slug: string) => number | null;
    locationBelongsToPlan: (planId: number, locationId: number) => boolean;
    getDb: () => import('better-sqlite3').Database;
} | null = null;

const REMOTE_API_URL = process.env.REMOTE_API_URL?.replace(/\/$/, '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

let remote: RemoteClient | null = null;

if (REMOTE_API_URL) {
    remote = new RemoteClient(REMOTE_API_URL, ADMIN_PASSWORD);
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
        addLocation: locSvc.addLocation as (planId: number, input: Record<string, unknown>) => number,
        updateLocation: locSvc.updateLocation as (planId: number, id: number, input: Record<string, unknown>) => boolean,
        deleteLocation: locSvc.deleteLocation,
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
        description: 'Tạo travel plan mới',
        inputSchema: {
            type: 'object',
            required: ['slug', 'name'],
            properties: {
                slug: { type: 'string', description: 'URL slug duy nhất, vd: ha-noi-sapa-2026' },
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
                transportLabel: { type: 'string', description: 'vd: Xe khách Hà Nội → Vinh (~5h)' },
                transportFare: { type: 'number', description: 'Giá vé phương tiện (VND)' },
                accommodationName: { type: 'string' },
                accommodationUrl: { type: 'string' },
                adultPrice: { type: 'number', description: 'Tổng chi phí tham quan người lớn (VND)' },
                childPrice: { type: 'number' },
                stayCostPerNight: { type: 'number', description: 'Giá lưu trú mỗi đêm (VND)' },
                foodBudgetPerDay: { type: 'number', description: 'Ngân sách ăn uống mỗi ngày (VND)' },
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
                transportLabel: { type: 'string' },
                transportFare: { type: 'number' },
                accommodationName: { type: 'string' },
                accommodationUrl: { type: 'string' },
                adultPrice: { type: 'number' },
                childPrice: { type: 'number' },
                stayCostPerNight: { type: 'number' },
                foodBudgetPerDay: { type: 'number' },
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
        name: 'add_sub_location',
        description: 'Thêm điểm tham quan con vào một điểm dừng (vd: Vịnh Hạ Long bên trong Hạ Long)',
        inputSchema: {
            type: 'object',
            required: ['planSlug', 'locationId', 'name'],
            properties: {
                planSlug: { type: 'string' },
                locationId: { type: 'number' },
                name: { type: 'string' },
                lat: { type: 'number' },
                lng: { type: 'number' },
                durationMinutes: { type: 'number', description: 'Thời gian tham quan (phút)' },
                description: { type: 'string' },
                adultPrice: { type: 'number', description: 'Giá vé người lớn (VND)' },
                childPrice: { type: 'number' },
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
                name: { type: 'string' },
                lat: { type: 'number' },
                lng: { type: 'number' },
                durationMinutes: { type: 'number' },
                description: { type: 'string' },
                adultPrice: { type: 'number' },
                childPrice: { type: 'number' },
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

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
        // ── Remote HTTP mode ──────────────────────────────────────────────────
        if (remote) {
            const { planSlug, locationId, subLocationId } = args as Record<string, unknown>;
            const slug = (args.slug ?? planSlug) as string | undefined;

            switch (name) {
                case 'list_plans':
                    return ok(await remote.get('/api/plans'));

                case 'get_plan':
                    return ok(await remote.get(`/api/plans/${slug}`));

                case 'create_plan':
                    return ok(await remote.post('/api/plans', { slug: args.slug, name: args.name, dateRange: args.dateRange }));

                case 'update_plan':
                    return ok(await remote.put(`/api/plans/${slug}`, { name: args.name, slug: args.newSlug }));

                case 'delete_plan':
                    return ok(await remote.del(`/api/plans/${slug}`));

                case 'add_location': {
                    const { planSlug: ps, ...rest } = args as Record<string, unknown>;
                    return ok(await remote.post(`/api/plans/${ps}/locations`, rest));
                }

                case 'update_location':
                    return ok(await remote.put(`/api/plans/${planSlug}/locations/${locationId}`, args));

                case 'delete_location':
                    return ok(await remote.del(`/api/plans/${planSlug}/locations/${locationId}`));

                case 'add_sub_location': {
                    const { planSlug: ps, locationId: lid, ...rest } = args as Record<string, unknown>;
                    return ok(await remote.post(`/api/plans/${ps}/locations/${lid}/sub-locations`, rest));
                }

                case 'update_sub_location':
                    return ok(await remote.put(`/api/plans/${planSlug}/locations/${locationId}/sub-locations/${subLocationId}`, args));

                case 'delete_sub_location':
                    return ok(await remote.del(`/api/plans/${planSlug}/locations/${locationId}/sub-locations/${subLocationId}`));

                default:
                    return err(`Unknown tool: ${name}`);
            }
        }

        // ── Local DB mode ─────────────────────────────────────────────────────
        const L = localMode!;

        switch (name) {
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
                const plan = L.updatePlan(args.slug as string, { name: args.name as string | undefined, slug: args.newSlug as string | undefined });
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

            case 'add_sub_location': {
                const planId = L.getPlanId(args.planSlug as string);
                if (!planId) return err(`Plan "${args.planSlug}" not found`);
                if (!L.locationBelongsToPlan(planId, args.locationId as number)) return err('Location not found');
                const db = L.getDb();
                const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM sub_locations WHERE location_id = ?').get(args.locationId) as { m: number | null }).m ?? 0;
                const result = db.prepare(
                    'INSERT INTO sub_locations (location_id, sort_order, name, lat, lng, duration_minutes, description, adult_price, child_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                ).run(args.locationId, maxOrder + 1, args.name, args.lat ?? 0, args.lng ?? 0, args.durationMinutes ?? 60, args.description ?? '', args.adultPrice ?? 0, args.childPrice ?? 0);
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
                const map: Record<string, unknown> = { name: args.name, lat: args.lat, lng: args.lng, duration_minutes: args.durationMinutes, description: args.description, adult_price: args.adultPrice, child_price: args.childPrice };
                for (const [k, v] of Object.entries(map)) {
                    if (v !== undefined) { fields.push(`${k} = ?`); values.push(v); }
                }
                if (fields.length) { values.push(args.subLocationId); db.prepare(`UPDATE sub_locations SET ${fields.join(', ')} WHERE id = ?`).run(...values); }
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
