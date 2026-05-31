const BASE = '/api';

function getToken(): string | null {
    return localStorage.getItem('admin_token');
}

function authHeaders(): Record<string, string> {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
            ...options?.headers,
        },
    });

    if (res.status === 401) {
        localStorage.removeItem('admin_token');
        window.location.href = '/admin/login';
        throw new Error('Unauthorized');
    }

    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
    }

    return res.json() as Promise<T>;
}

export const api = {
    login: (password: string) =>
        request<{ token: string }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ password }),
        }),

    logout: () =>
        request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

    me: () => request<{ ok: boolean }>('/auth/me'),
};

export function isLoggedIn(): boolean {
    return Boolean(getToken());
}

export function saveToken(token: string): void {
    localStorage.setItem('admin_token', token);
}

export function clearToken(): void {
    localStorage.removeItem('admin_token');
}
