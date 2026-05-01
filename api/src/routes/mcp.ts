import { Router } from 'express';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createPublicSessionPlan, getPlanBySessionId, getPlanBySlug, listPlans } from '../services/planService.js';
import { addLocation, updateLocation, deleteLocation, reorderLocations, type CreateLocationInput } from '../services/locationService.js';
import { getDb } from '../db/connection.js';

const router = Router();

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
    sessionId: string;
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
        const plan = db.prepare('SELECT id, slug, session_id as sessionId FROM plans WHERE slug = ? AND session_id IS NOT NULL').get(slug) as SessionPlanRef | undefined;
        return plan ?? null;
    }

    return null;
}

/** Lấy planId — chỉ cho phép session plans (không thể modify admin plans qua HTTP MCP) */
function getSessionPlanId(slug: string): number | null {
    const db = getDb();
    const plan = db.prepare('SELECT id FROM plans WHERE slug = ? AND session_id IS NOT NULL').get(slug) as { id: number } | undefined;
    return plan?.id ?? null;
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
            },
        },
    },
    {
        name: 'get_plan',
        description: 'Lấy chi tiết plan. Có thể truyền shareUrl/sessionId từ link đã tạo để chỉnh sửa tiếp, hoặc slug để đọc plan mẫu.',
        inputSchema: {
            type: 'object',
            properties: {
                shareUrl: { type: 'string', description: 'Link share dạng https://trips.naai.studio/?session=...' },
                sessionId: { type: 'string' },
                slug: { type: 'string' },
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
                newSlug: { type: 'string', description: 'Slug mới nếu cần đổi' },
            },
        },
    },
    {
        name: 'delete_plan',
        description: 'Xóa plan (chỉ plan tạo bởi MCP)',
        inputSchema: {
            type: 'object',
            properties: { shareUrl: { type: 'string' }, sessionId: { type: 'string' }, slug: { type: 'string' } },
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
                name: { type: 'string', description: 'Tên điểm dừng, vd: Hà Nội' },
                province: { type: 'string', description: 'Tên tỉnh/thành để map Vexere' },
                lat: { type: 'number' }, lng: { type: 'number' },
                arriveAt: { type: 'number', description: 'Unix timestamp ms' },
                departAt: { type: 'number', description: 'Unix timestamp ms' },
                durationDays: { type: 'number' },
                transportType: { type: 'string', description: 'car, bus, train, flight, motorbike, ferry, walking, other' },
                transportLabel: { type: 'string', description: 'vd: Xe khách Hà Nội → Vinh (~5h)' },
                transportFare: { type: 'number', description: 'Giá vé phương tiện (VND)' },
                transportFareAdult: { type: 'number', description: 'Giá vé phương tiện/người lớn (VND)' },
                transportFareChild: { type: 'number', description: 'Giá vé phương tiện/trẻ em (VND)' },
                accommodationName: { type: 'string' },
                accommodationUrl: { type: 'string' },
                accommodationAddress: { type: 'string' },
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
        description: 'Cập nhật thông tin điểm dừng (partial update)',
        inputSchema: {
            type: 'object', required: ['locationId'],
            properties: {
                shareUrl: { type: 'string' },
                sessionId: { type: 'string' },
                planSlug: { type: 'string' }, locationId: { type: 'number' },
                name: { type: 'string' }, province: { type: 'string' },
                lat: { type: 'number' }, lng: { type: 'number' },
                arriveAt: { type: 'number' }, departAt: { type: 'number' },
                durationDays: { type: 'number' }, transportType: { type: 'string' },
                transportLabel: { type: 'string' }, transportFare: { type: 'number' },
                transportFareAdult: { type: 'number' }, transportFareChild: { type: 'number' },
                accommodationName: { type: 'string' }, accommodationUrl: { type: 'string' },
                accommodationAddress: { type: 'string' }, adultPrice: { type: 'number' },
                childPrice: { type: 'number' }, stayCostPerNight: { type: 'number' },
                foodBudgetPerDay: { type: 'number' }, adults: { type: 'number' },
                children: { type: 'number' }, highlight: { type: 'string' },
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
            type: 'object', required: ['locationId'],
            properties: { shareUrl: { type: 'string' }, sessionId: { type: 'string' }, planSlug: { type: 'string' }, locationId: { type: 'number' } },
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
                name: { type: 'string' }, lat: { type: 'number' }, lng: { type: 'number' },
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
            type: 'object', required: ['locationId', 'subLocationId'],
            properties: {
                shareUrl: { type: 'string' }, sessionId: { type: 'string' },
                planSlug: { type: 'string' }, locationId: { type: 'number' }, subLocationId: { type: 'number' },
                sortOrder: { type: 'number' },
                name: { type: 'string' }, lat: { type: 'number' }, lng: { type: 'number' },
                durationMinutes: { type: 'number' }, description: { type: 'string' },
                adultPrice: { type: 'number' }, childPrice: { type: 'number' },
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
                locationId: { type: 'number' },
                orderedIds: { type: 'array', items: { type: 'number' }, description: 'Danh sách sub-location id theo thứ tự mong muốn' },
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
                planSlug: { type: 'string' }, locationId: { type: 'number' }, subLocationId: { type: 'number' },
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
                    const sessionId = randomUUID().replace(/-/g, '').slice(0, 16);
                    const plan = createPublicSessionPlan({
                        slug: a.slug as string | undefined,
                        name: a.name as string,
                        dateRange: a.dateRange as string | undefined,
                        sessionId,
                    });
                    return ok({ ...plan, sessionId, shareUrl: `${APP_URL}/?session=${sessionId}` });
                }

                case 'get_plan': {
                    const sessionPlan = getSessionPlanRef(a);
                    if (sessionPlan) {
                        return ok({ ...getPlanBySessionId(sessionPlan.sessionId), sessionId: sessionPlan.sessionId, shareUrl: `${APP_URL}/?session=${sessionPlan.sessionId}` });
                    }

                    if (typeof a.slug !== 'string') return err('Provide shareUrl, sessionId, or slug');
                    const adminPlan = getPlanBySlug(a.slug as string);
                    if (!adminPlan) return err(`Plan "${a.slug}" not found`);
                    return ok({ ...adminPlan, shareUrl: `${APP_URL}/?slug=${adminPlan.slug}` });
                }

                case 'update_plan': {
                    const ref = getSessionPlanRef(a);
                    if (!ref) return err('Session plan not found. Provide the shareUrl/sessionId returned by create_plan.');
                    const db = getDb();
                    if (a.name !== undefined) db.prepare('UPDATE plans SET name = ?, updated_at = ? WHERE id = ?').run(a.name, Date.now(), ref.id);
                    if (a.newSlug !== undefined) db.prepare('UPDATE plans SET slug = ?, updated_at = ? WHERE id = ?').run(a.newSlug, Date.now(), ref.id);
                    const sessionId = ref.sessionId;
                    return ok({ ...getPlanBySessionId(sessionId), sessionId, shareUrl: `${APP_URL}/?session=${sessionId}` });
                }

                case 'delete_plan': {
                    const ref = getSessionPlanRef(a);
                    if (!ref) return err('Session plan not found. Provide the shareUrl/sessionId returned by create_plan.');
                    const db = getDb();
                    const result = db.prepare('DELETE FROM plans WHERE id = ? AND session_id IS NOT NULL').run(ref.id);
                    if (result.changes === 0) return err(`Plan "${ref.slug}" not found`);
                    return ok({ ok: true });
                }

                case 'add_location': {
                    const ref = getSessionPlanRef(a);
                    if (!ref) return err('Session plan not found. Provide the shareUrl/sessionId returned by create_plan.');
                    const id = addLocation(ref.id, a as unknown as CreateLocationInput);
                    return ok({ id, planSlug: ref.slug, sessionId: ref.sessionId, shareUrl: `${APP_URL}/?session=${ref.sessionId}` });
                }

                case 'update_location': {
                    const ref = getSessionPlanRef(a);
                    if (!ref) return err('Session plan not found. Provide the shareUrl/sessionId returned by create_plan.');
                    if (!updateLocation(ref.id, a.locationId as number, a)) return err('Location not found');
                    return ok({ ...getPlanBySessionId(ref.sessionId), sessionId: ref.sessionId, shareUrl: `${APP_URL}/?session=${ref.sessionId}` });
                }

                case 'delete_location': {
                    const ref = getSessionPlanRef(a);
                    if (!ref) return err('Session plan not found. Provide the shareUrl/sessionId returned by create_plan.');
                    if (!deleteLocation(ref.id, a.locationId as number)) return err('Location not found');
                    return ok({ ...getPlanBySessionId(ref.sessionId), sessionId: ref.sessionId, shareUrl: `${APP_URL}/?session=${ref.sessionId}` });
                }

                case 'reorder_locations': {
                    const ref = getSessionPlanRef(a);
                    if (!ref) return err('Session plan not found. Provide the shareUrl/sessionId returned by create_plan.');
                    if (!Array.isArray(a.orderedIds)) return err('orderedIds must be an array');
                    reorderLocations(ref.id, a.orderedIds as number[]);
                    return ok({ ...getPlanBySessionId(ref.sessionId), sessionId: ref.sessionId, shareUrl: `${APP_URL}/?session=${ref.sessionId}` });
                }

                case 'add_sub_location': {
                    const ref = getSessionPlanRef(a);
                    if (!ref) return err('Session plan not found. Provide the shareUrl/sessionId returned by create_plan.');
                    if (!locationBelongsToPlan(ref.id, a.locationId as number)) return err('Location not found');
                    const db = getDb();
                    const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM sub_locations WHERE location_id = ?').get(a.locationId) as { m: number | null }).m ?? 0;
                    const result = db.prepare(
                        'INSERT INTO sub_locations (location_id, sort_order, name, lat, lng, duration_minutes, description, adult_price, child_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    ).run(a.locationId, a.sortOrder ?? maxOrder + 1, a.name, a.lat ?? 0, a.lng ?? 0, a.durationMinutes ?? 60, a.description ?? '', a.adultPrice ?? 0, a.childPrice ?? 0);
                    return ok({ id: result.lastInsertRowid, planSlug: ref.slug, sessionId: ref.sessionId, shareUrl: `${APP_URL}/?session=${ref.sessionId}` });
                }

                case 'update_sub_location': {
                    const ref = getSessionPlanRef(a);
                    if (!ref) return err('Session plan not found. Provide the shareUrl/sessionId returned by create_plan.');
                    if (!locationBelongsToPlan(ref.id, a.locationId as number)) return err('Location not found');
                    const db = getDb();
                    if (!db.prepare('SELECT id FROM sub_locations WHERE id = ? AND location_id = ?').get(a.subLocationId, a.locationId)) return err('Sub-location not found');
                    const fields: string[] = [];
                    const values: unknown[] = [];
                    const map: Record<string, unknown> = { name: a.name, lat: a.lat, lng: a.lng, sort_order: a.sortOrder, duration_minutes: a.durationMinutes, description: a.description, adult_price: a.adultPrice, child_price: a.childPrice };
                    for (const [k, v] of Object.entries(map)) {
                        if (v !== undefined) { fields.push(`${k} = ?`); values.push(v); }
                    }
                    if (fields.length) { values.push(a.subLocationId); db.prepare(`UPDATE sub_locations SET ${fields.join(', ')} WHERE id = ?`).run(...values); }
                    return ok({ ...getPlanBySessionId(ref.sessionId), sessionId: ref.sessionId, shareUrl: `${APP_URL}/?session=${ref.sessionId}` });
                }

                case 'reorder_sub_locations': {
                    const ref = getSessionPlanRef(a);
                    if (!ref) return err('Session plan not found. Provide the shareUrl/sessionId returned by create_plan.');
                    if (!locationBelongsToPlan(ref.id, a.locationId as number)) return err('Location not found');
                    if (!Array.isArray(a.orderedIds)) return err('orderedIds must be an array');
                    const update = getDb().prepare('UPDATE sub_locations SET sort_order = ? WHERE id = ? AND location_id = ?');
                    const tx = getDb().transaction(() => {
                        (a.orderedIds as number[]).forEach((id, idx) => update.run(idx, id, a.locationId));
                    });
                    tx();
                    return ok({ ...getPlanBySessionId(ref.sessionId), sessionId: ref.sessionId, shareUrl: `${APP_URL}/?session=${ref.sessionId}` });
                }

                case 'delete_sub_location': {
                    const ref = getSessionPlanRef(a);
                    if (!ref) return err('Session plan not found. Provide the shareUrl/sessionId returned by create_plan.');
                    if (!locationBelongsToPlan(ref.id, a.locationId as number)) return err('Location not found');
                    const result = getDb().prepare('DELETE FROM sub_locations WHERE id = ? AND location_id = ?').run(a.subLocationId, a.locationId);
                    if (result.changes === 0) return err('Sub-location not found');
                    return ok({ ...getPlanBySessionId(ref.sessionId), sessionId: ref.sessionId, shareUrl: `${APP_URL}/?session=${ref.sessionId}` });
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');
    next();
});

router.options('/', (_req, res) => { res.sendStatus(204); });

async function handleMcp(req: import('express').Request, res: import('express').Response) {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = buildServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('finish', () => { transport.close().catch(() => {}); });
}

// POST: tool calls từ MCP clients
router.post('/', handleMcp);

// GET: SSE stream (dành cho clients dùng SSE protocol)
router.get('/', handleMcp);

// DELETE: session termination (stateless — không cần làm gì)
router.delete('/', (_req, res) => { res.sendStatus(200); });

export default router;
