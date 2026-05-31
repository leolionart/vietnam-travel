import 'dotenv/config';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type Body = Record<string, JsonValue>;
type Format = 'json' | 'summary' | 'markdown';

interface Options {
    apiUrl: string;
    passwordEnv: string;
    json?: Body;
    format: Format;
    publicMode: boolean;
}

const WRITE_COMMANDS = new Set([
    'create-plan',
    'update-plan',
    'delete-plan',
    'add-location',
    'update-location',
    'delete-location',
    'reorder-locations',
    'add-activity',
    'add-sub-location',
    'update-activity',
    'update-sub-location',
    'delete-activity',
    'delete-sub-location',
    'reorder-activities',
    'reorder-sub-locations',
]);

function usage(exitCode = 0): never {
    const text = `
Vietnam Travel CLI

Usage:
  npm --prefix api run cli -- <command> [args] [--json '{...}'] [--format json|summary|markdown]

Read commands:
  list-plans
  get-plan <slug>
  get-session-plan <sessionId>
  show-plan <slug>                 Same as get-plan --format markdown
  analyze-activities <slug>         Nearby activity pairs and transport duration blocks
  search-vexere-trips <from> <to> <YYYY-MM-DD>

Write commands use TRAVEL_ADMIN_PASSWORD/ADMIN_PASSWORD when present.
Without a password, or with --public, they write to a public session plan instead of admin plans:
  create-plan --json '{"slug":"trip","name":"Trip"}'
  update-plan <slug> --json '{"name":"New name","slug":"new-slug"}'
  delete-plan <slug>
  add-location <slug> --json '{"name":"Ninh Binh","durationDays":2}'
  update-location <slug> <locationId> --json '{"durationDays":3}'
  delete-location <slug> <locationId>
  reorder-locations <slug> --json '{"orderedIds":[3,1,2]}'
  add-activity <slug> <locationId> --json '{"name":"Hotel","activityType":"accommodation","pricingMode":"per_room","unitPrice":800000,"quantity":1,"surcharge":0,"durationDays":2}'
  update-activity <slug> <locationId> <activityId> --json '{"childPrice":0}'
  delete-activity <slug> <locationId> <activityId>
  reorder-activities <slug> <locationId> --json '{"orderedIds":[2,1]}'

Options:
  --api-url <url>                  Default: TRAVEL_API_URL, REMOTE_API_URL, or http://localhost:7321
  --password-env <name>            Default: TRAVEL_ADMIN_PASSWORD, fallback ADMIN_PASSWORD
  --public                         Force public session-plan writes even if an admin password is present locally
  --json <object>                  JSON request body for create/update/reorder commands
  --format json|summary|markdown   Default: json
`;
    console.log(text.trim());
    process.exit(exitCode);
}

function parseArgs(argv: string[]): { command: string; args: string[]; options: Options } {
    const positional: string[] = [];
    const options: Options = {
        apiUrl: (process.env.TRAVEL_API_URL || process.env.REMOTE_API_URL || 'http://localhost:7321').replace(/\/$/, ''),
        passwordEnv: process.env.TRAVEL_ADMIN_PASSWORD ? 'TRAVEL_ADMIN_PASSWORD' : 'ADMIN_PASSWORD',
        format: 'json',
        publicMode: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') usage(0);
        if (arg === '--api-url') {
            options.apiUrl = requireValue(argv, ++i, '--api-url').replace(/\/$/, '');
        } else if (arg === '--password-env') {
            options.passwordEnv = requireValue(argv, ++i, '--password-env');
        } else if (arg === '--public') {
            options.publicMode = true;
        } else if (arg === '--json') {
            options.json = parseJson(requireValue(argv, ++i, '--json'));
        } else if (arg === '--format') {
            const format = requireValue(argv, ++i, '--format') as Format;
            if (!['json', 'summary', 'markdown'].includes(format)) throw new Error('--format must be json, summary, or markdown');
            options.format = format;
        } else {
            positional.push(arg);
        }
    }

    const [command, ...args] = positional;
    if (!command) usage(1);
    if (command === 'show-plan') options.format = 'markdown';
    return { command, args, options };
}

function requireValue(argv: string[], index: number, flag: string): string {
    const value = argv[index];
    if (!value) throw new Error(`${flag} requires a value`);
    return value;
}

function parseJson(value: string): Body {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('--json must be a JSON object');
    return parsed as Body;
}

async function request(options: Options, method: string, path: string, body?: Body): Promise<unknown> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (WRITE_COMMANDS.has(activeCommand) && hasPassword(options)) headers.Authorization = `Bearer ${await token(options)}`;
    const res = await fetch(`${options.apiUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
    if (res.status === 204) return null;
    return res.json();
}

let cachedToken: string | null = null;
let activeCommand = '';

function hasPassword(options: Options): boolean {
    if (options.publicMode) return false;
    return Boolean(process.env[options.passwordEnv] || process.env.ADMIN_PASSWORD);
}

async function token(options: Options): Promise<string> {
    if (cachedToken) return cachedToken;
    const password = process.env[options.passwordEnv] || process.env.ADMIN_PASSWORD;
    if (!password) throw new Error(`Write command requires ${options.passwordEnv} or ADMIN_PASSWORD in the environment`);
    const res = await fetch(`${options.apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error(`Admin login failed: ${res.status}`);
    cachedToken = ((await res.json()) as { token: string }).token;
    return cachedToken;
}

function plansBase(options: Options): string {
    return WRITE_COMMANDS.has(activeCommand) && !hasPassword(options) ? '/api/public/plans' : '/api/plans';
}

function planWriteMethod(options: Options, adminMethod: string): string {
    return !hasPassword(options) && activeCommand === 'update-plan' ? 'PATCH' : adminMethod;
}

function required(args: string[], index: number, label: string): string {
    const value = args[index];
    if (!value) throw new Error(`Missing ${label}`);
    return value;
}

function requiredNumber(args: string[], index: number, label: string): number {
    const value = Number(required(args, index, label));
    if (!Number.isFinite(value)) throw new Error(`${label} must be a number`);
    return value;
}

async function run(command: string, args: string[], options: Options): Promise<unknown> {
    activeCommand = command;
    switch (command) {
        case 'list-plans':
            return request(options, 'GET', '/api/plans');
        case 'get-plan':
        case 'show-plan':
            return request(options, 'GET', `/api/plans/${encodeURIComponent(required(args, 0, 'slug'))}`);
        case 'get-session-plan':
            return request(options, 'GET', `/api/sessions/plan/${encodeURIComponent(required(args, 0, 'sessionId'))}`);
        case 'analyze-activities':
            return request(options, 'GET', `/api/plans/${encodeURIComponent(required(args, 0, 'slug'))}/activity-analysis`);
        case 'search-vexere-trips':
            return request(options, 'GET', vexereTripsPath(args, options.json));
        case 'create-plan':
            return request(options, 'POST', plansBase(options), options.json ?? {});
        case 'update-plan':
            return request(options, planWriteMethod(options, 'PUT'), `${plansBase(options)}/${encodeURIComponent(required(args, 0, 'slug'))}`, options.json ?? {});
        case 'delete-plan':
            return request(options, 'DELETE', `${plansBase(options)}/${encodeURIComponent(required(args, 0, 'slug'))}`);
        case 'add-location':
            return request(options, 'POST', `${plansBase(options)}/${encodeURIComponent(required(args, 0, 'slug'))}/locations`, options.json ?? {});
        case 'update-location':
            return request(options, 'PUT', `${plansBase(options)}/${encodeURIComponent(required(args, 0, 'slug'))}/locations/${requiredNumber(args, 1, 'locationId')}`, options.json ?? {});
        case 'delete-location':
            return request(options, 'DELETE', `${plansBase(options)}/${encodeURIComponent(required(args, 0, 'slug'))}/locations/${requiredNumber(args, 1, 'locationId')}`);
        case 'reorder-locations':
            return request(options, 'PATCH', `${plansBase(options)}/${encodeURIComponent(required(args, 0, 'slug'))}/locations/reorder`, options.json ?? {});
        case 'add-activity':
        case 'add-sub-location':
            return request(options, 'POST', `${plansBase(options)}/${encodeURIComponent(required(args, 0, 'slug'))}/locations/${requiredNumber(args, 1, 'locationId')}/sub-locations`, options.json ?? {});
        case 'update-activity':
        case 'update-sub-location':
            return request(options, 'PUT', `${plansBase(options)}/${encodeURIComponent(required(args, 0, 'slug'))}/locations/${requiredNumber(args, 1, 'locationId')}/sub-locations/${requiredNumber(args, 2, 'activityId')}`, options.json ?? {});
        case 'delete-activity':
        case 'delete-sub-location':
            return request(options, 'DELETE', `${plansBase(options)}/${encodeURIComponent(required(args, 0, 'slug'))}/locations/${requiredNumber(args, 1, 'locationId')}/sub-locations/${requiredNumber(args, 2, 'activityId')}`);
        case 'reorder-activities':
        case 'reorder-sub-locations':
            return request(options, 'PATCH', `${plansBase(options)}/${encodeURIComponent(required(args, 0, 'slug'))}/locations/${requiredNumber(args, 1, 'locationId')}/sub-locations/reorder`, options.json ?? {});
        default:
            throw new Error(`Unknown command: ${command}`);
    }
}

function vexereTripsPath(args: string[], body?: Body): string {
    const from = String(body?.from || required(args, 0, 'from'));
    const to = String(body?.to || required(args, 1, 'to'));
    const date = String(body?.date || required(args, 2, 'date'));
    const params = new URLSearchParams({ from, to, date });
    const page = body?.page ?? args[3];
    const pagesize = body?.pagesize ?? body?.pageSize ?? args[4];
    const sort = body?.sort ?? body?.sortBy ?? args[5];
    if (page !== undefined) params.set('page', String(page));
    if (pagesize !== undefined) params.set('pagesize', String(pagesize));
    if (sort !== undefined) params.set('sort', String(sort));
    return `/api/vexere-link/trips?${params}`;
}

function money(value: unknown): string {
    const amount = typeof value === 'number' ? value : Number(value || 0);
    return `${amount.toLocaleString('vi-VN')} VND`;
}

function formatPlan(plan: any, format: Format): string {
    if (format === 'json') return JSON.stringify(plan, null, 2);
    if (plan && Array.isArray(plan.nearbyPairs) && Array.isArray(plan.transportBlocks)) {
        return formatActivityAnalysis(plan);
    }
    if (plan && Array.isArray(plan.trips)) {
        return formatVexereTrips(plan);
    }
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.locations)) return JSON.stringify(plan, null, 2);

    const lines = [
        `# ${plan.name}`,
        '',
        `Slug: ${plan.slug}`,
        plan.dateRange ? `Dates: ${plan.dateRange}` : '',
        '',
    ].filter(Boolean);

    for (const loc of plan.locations) {
        lines.push(`## ${loc.name}${loc.dateRange ? ` (${loc.dateRange})` : ''}`);
        if (loc.highlight) lines.push(loc.highlight);
        const activities = Array.isArray(loc.subLocations) ? loc.subLocations : [];
        for (const activity of activities) {
            const parts = [
                activity.activityType,
                activity.durationDays ? `${activity.durationDays} day(s)` : null,
                activity.pricingMode,
                activity.unitPrice ? `unit ${money(activity.unitPrice)}` : null,
                activity.adultPrice ? `adult ${money(activity.adultPrice)}` : null,
                activity.childPrice ? `child ${money(activity.childPrice)}` : null,
                activity.participantAdults != null ? `${activity.participantAdults} adult(s)` : null,
                activity.participantChildren != null ? `${activity.participantChildren} child(ren)` : null,
                activity.surcharge ? `surcharge ${money(activity.surcharge)}` : null,
            ].filter(Boolean);
            lines.push(`- ${activity.name}${parts.length ? `: ${parts.join(', ')}` : ''}`);
        }
        lines.push('');
    }

    return lines.join('\n').trim();
}

function formatVexereTrips(result: any): string {
    const trips = Array.isArray(result.trips) ? result.trips : [];
    const lines = [
        '# Vexere trips',
        '',
        `Total: ${result.total ?? trips.length}`,
        '',
    ];
    if (!trips.length) {
        lines.push('- No trips found.');
    } else {
        for (const trip of trips.slice(0, 20)) {
            const price = money(trip.priceDiscount || trip.priceOriginal || 0);
            const seats = trip.availableSeats !== undefined ? `${trip.availableSeats} seats` : 'unknown seats';
            lines.push(`- ${trip.companyName || 'Unknown'} · ${trip.departureTime || 'unknown time'} · ${trip.seatTypeName || 'seat'} · ${price} · ${seats}`);
        }
    }
    return lines.join('\n').trim();
}

function formatActivityAnalysis(analysis: any): string {
    const lines = [
        `# Activity analysis: ${analysis.planName || analysis.planSlug}`,
        '',
        `Points checked: ${analysis.pointCount ?? 0}`,
        `Nearby threshold: ${analysis.maxDistanceKm ?? 5} km`,
        '',
        '## Nearby pairs',
    ];
    const pairs = Array.isArray(analysis.nearbyPairs) ? analysis.nearbyPairs : [];
    if (!pairs.length) {
        lines.push('- No nearby pairs found.');
    } else {
        for (const pair of pairs.slice(0, 20)) {
            lines.push(`- ${pair.from?.name} ↔ ${pair.to?.name}: ${pair.distanceLabel}, ~${pair.estimatedTravelLabel}. ${pair.suggestion}`);
        }
    }

    lines.push('', '## Transport blocks');
    const transports = Array.isArray(analysis.transportBlocks) ? analysis.transportBlocks : [];
    if (!transports.length) {
        lines.push('- No transport activities found.');
    } else {
        for (const block of transports) {
            const when = [block.scheduledDate, block.scheduledTime || block.scheduledPeriod].filter(Boolean).join(' ');
            lines.push(`- ${block.name}${when ? ` (${when})` : ''}: ${block.durationLabel}. ${block.calendarNote}`);
        }
    }

    return lines.join('\n').trim();
}

try {
    const { command, args, options } = parseArgs(process.argv.slice(2));
    const result = await run(command, args, options);
    console.log(formatPlan(result, options.format));
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
