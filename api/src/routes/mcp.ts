import { Router } from 'express';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createSessionPlan } from '../services/planService.js';
import { addLocation, updateLocation, deleteLocation, type CreateLocationInput } from '../services/locationService.js';
import { getDb } from '../db/connection.js';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(data: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
function err(msg: string) {
    return { content: [{ type: 'text' as const, text: msg }], isError: true as const };
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
        name: 'create_plan',
        description: 'Tạo travel plan mới. Trả về shareUrl để chia sẻ.',
        inputSchema: {
            type: 'object', required: ['slug', 'name'],
            properties: {
                slug: { type: 'string', description: 'URL slug duy nhất, vd: ha-noi-sapa-2026' },
                name: { type: 'string', description: 'Tên hiển thị, vd: Hà Nội → Sapa 2026' },
                dateRange: { type: 'string', description: 'Tuỳ chọn, vd: 01/06/2026 - 05/06/2026' },
            },
        },
    },
    {
        name: 'get_plan',
        description: 'Lấy chi tiết plan gồm tất cả locations và sub-locations (chỉ plan tạo bởi MCP)',
        inputSchema: {
            type: 'object', required: ['slug'],
            properties: { slug: { type: 'string' } },
        },
    },
    {
        name: 'update_plan',
        description: 'Cập nhật tên hoặc slug của plan',
        inputSchema: {
            type: 'object', required: ['slug'],
            properties: {
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
            type: 'object', required: ['slug'],
            properties: { slug: { type: 'string' } },
        },
    },
    {
        name: 'add_location',
        description: 'Thêm điểm dừng (tỉnh/thành phố) vào plan',
        inputSchema: {
            type: 'object', required: ['planSlug', 'name'],
            properties: {
                planSlug: { type: 'string' },
                name: { type: 'string', description: 'Tên điểm dừng, vd: Hà Nội' },
                province: { type: 'string', description: 'Tên tỉnh/thành để map Vexere' },
                lat: { type: 'number' }, lng: { type: 'number' },
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
        description: 'Cập nhật thông tin điểm dừng (partial update)',
        inputSchema: {
            type: 'object', required: ['planSlug', 'locationId'],
            properties: {
                planSlug: { type: 'string' }, locationId: { type: 'number' },
                name: { type: 'string' }, province: { type: 'string' },
                lat: { type: 'number' }, lng: { type: 'number' },
                arriveAt: { type: 'number' }, departAt: { type: 'number' },
                durationDays: { type: 'number' }, transportLabel: { type: 'string' },
                transportFare: { type: 'number' }, accommodationName: { type: 'string' },
                accommodationUrl: { type: 'string' }, adultPrice: { type: 'number' },
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
            type: 'object', required: ['planSlug', 'locationId'],
            properties: { planSlug: { type: 'string' }, locationId: { type: 'number' } },
        },
    },
    {
        name: 'add_sub_location',
        description: 'Thêm điểm tham quan con vào điểm dừng (vd: Vịnh Hạ Long bên trong Hạ Long)',
        inputSchema: {
            type: 'object', required: ['planSlug', 'locationId', 'name'],
            properties: {
                planSlug: { type: 'string' }, locationId: { type: 'number' },
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
            type: 'object', required: ['planSlug', 'locationId', 'subLocationId'],
            properties: {
                planSlug: { type: 'string' }, locationId: { type: 'number' }, subLocationId: { type: 'number' },
                name: { type: 'string' }, lat: { type: 'number' }, lng: { type: 'number' },
                durationMinutes: { type: 'number' }, description: { type: 'string' },
                adultPrice: { type: 'number' }, childPrice: { type: 'number' },
            },
        },
    },
    {
        name: 'delete_sub_location',
        description: 'Xóa điểm tham quan con',
        inputSchema: {
            type: 'object', required: ['planSlug', 'locationId', 'subLocationId'],
            properties: {
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
                case 'create_plan': {
                    const sessionId = randomUUID().replace(/-/g, '').slice(0, 16);
                    const plan = createSessionPlan({
                        slug: a.slug as string,
                        name: a.name as string,
                        dateRange: a.dateRange as string | undefined,
                        sessionId,
                    });
                    return ok({ ...plan, sessionId, shareUrl: `${APP_URL}/?session=${sessionId}` });
                }

                case 'get_plan': {
                    const db = getDb();
                    const plan = db.prepare('SELECT * FROM plans WHERE slug = ? AND session_id IS NOT NULL').get(a.slug as string) as { id: number; slug: string; name: string; session_id: string } | undefined;
                    if (!plan) return err(`Plan "${a.slug}" not found`);
                    const { getPlanBySessionId } = await import('../services/planService.js');
                    return ok({ ...getPlanBySessionId(plan.session_id), shareUrl: `${APP_URL}/?session=${plan.session_id}` });
                }

                case 'update_plan': {
                    const planId = getSessionPlanId(a.slug as string);
                    if (!planId) return err(`Plan "${a.slug}" not found`);
                    const db = getDb();
                    if (a.name !== undefined) db.prepare('UPDATE plans SET name = ?, updated_at = ? WHERE id = ?').run(a.name, Date.now(), planId);
                    if (a.newSlug !== undefined) db.prepare('UPDATE plans SET slug = ?, updated_at = ? WHERE id = ?').run(a.newSlug, Date.now(), planId);
                    return ok({ ok: true });
                }

                case 'delete_plan': {
                    const db = getDb();
                    const result = db.prepare('DELETE FROM plans WHERE slug = ? AND session_id IS NOT NULL').run(a.slug as string);
                    if (result.changes === 0) return err(`Plan "${a.slug}" not found`);
                    return ok({ ok: true });
                }

                case 'add_location': {
                    const planId = getSessionPlanId(a.planSlug as string);
                    if (!planId) return err(`Plan "${a.planSlug}" not found`);
                    const id = addLocation(planId, a as unknown as CreateLocationInput);
                    return ok({ id, planSlug: a.planSlug });
                }

                case 'update_location': {
                    const planId = getSessionPlanId(a.planSlug as string);
                    if (!planId) return err(`Plan "${a.planSlug}" not found`);
                    if (!updateLocation(planId, a.locationId as number, a)) return err('Location not found');
                    return ok({ ok: true });
                }

                case 'delete_location': {
                    const planId = getSessionPlanId(a.planSlug as string);
                    if (!planId) return err(`Plan "${a.planSlug}" not found`);
                    if (!deleteLocation(planId, a.locationId as number)) return err('Location not found');
                    return ok({ ok: true });
                }

                case 'add_sub_location': {
                    const planId = getSessionPlanId(a.planSlug as string);
                    if (!planId) return err(`Plan "${a.planSlug}" not found`);
                    if (!locationBelongsToPlan(planId, a.locationId as number)) return err('Location not found');
                    const db = getDb();
                    const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM sub_locations WHERE location_id = ?').get(a.locationId) as { m: number | null }).m ?? 0;
                    const result = db.prepare(
                        'INSERT INTO sub_locations (location_id, sort_order, name, lat, lng, duration_minutes, description, adult_price, child_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    ).run(a.locationId, maxOrder + 1, a.name, a.lat ?? 0, a.lng ?? 0, a.durationMinutes ?? 60, a.description ?? '', a.adultPrice ?? 0, a.childPrice ?? 0);
                    return ok({ id: result.lastInsertRowid });
                }

                case 'update_sub_location': {
                    const planId = getSessionPlanId(a.planSlug as string);
                    if (!planId) return err(`Plan "${a.planSlug}" not found`);
                    if (!locationBelongsToPlan(planId, a.locationId as number)) return err('Location not found');
                    const db = getDb();
                    if (!db.prepare('SELECT id FROM sub_locations WHERE id = ? AND location_id = ?').get(a.subLocationId, a.locationId)) return err('Sub-location not found');
                    const fields: string[] = [];
                    const values: unknown[] = [];
                    const map: Record<string, unknown> = { name: a.name, lat: a.lat, lng: a.lng, duration_minutes: a.durationMinutes, description: a.description, adult_price: a.adultPrice, child_price: a.childPrice };
                    for (const [k, v] of Object.entries(map)) {
                        if (v !== undefined) { fields.push(`${k} = ?`); values.push(v); }
                    }
                    if (fields.length) { values.push(a.subLocationId); db.prepare(`UPDATE sub_locations SET ${fields.join(', ')} WHERE id = ?`).run(...values); }
                    return ok({ ok: true });
                }

                case 'delete_sub_location': {
                    const planId = getSessionPlanId(a.planSlug as string);
                    if (!planId) return err(`Plan "${a.planSlug}" not found`);
                    if (!locationBelongsToPlan(planId, a.locationId as number)) return err('Location not found');
                    const result = getDb().prepare('DELETE FROM sub_locations WHERE id = ? AND location_id = ?').run(a.subLocationId, a.locationId);
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
