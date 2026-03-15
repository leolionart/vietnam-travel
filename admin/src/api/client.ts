import type { Plan, LocationInput } from '../types/index.js';

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

    listPlans: () => request<Plan[]>('/plans'),

    getPlan: (slug: string) => request<Plan>(`/plans/${slug}`),

    createPlan: (data: { slug: string; name: string }) =>
        request<Plan>('/plans', { method: 'POST', body: JSON.stringify(data) }),

    updatePlan: (slug: string, data: { name?: string; slug?: string }) =>
        request<Plan>(`/plans/${slug}`, { method: 'PUT', body: JSON.stringify(data) }),

    deletePlan: (slug: string) =>
        request<{ ok: boolean }>(`/plans/${slug}`, { method: 'DELETE' }),

    addLocation: (slug: string, data: LocationInput) =>
        request<{ id: number }>(`/plans/${slug}/locations`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    updateLocation: (slug: string, id: number, data: LocationInput) =>
        request<Plan>(`/plans/${slug}/locations/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    deleteLocation: (slug: string, id: number) =>
        request<{ ok: boolean }>(`/plans/${slug}/locations/${id}`, { method: 'DELETE' }),

    reorderLocations: (slug: string, orderedIds: number[]) =>
        request<Plan>(`/plans/${slug}/locations/reorder`, {
            method: 'PATCH',
            body: JSON.stringify({ orderedIds }),
        }),

    getVexereLink: (from: string, to: string, date: string, type?: string) => {
        const params = new URLSearchParams({ from, to, date });
        if (type) params.set('type', type);
        return request<{ url: string }>(`/vexere-link?${params}`);
    },

    addSubLocation: (slug: string, locationId: number, data: { name: string; lat: number; lng: number; durationMinutes: number; description: string; adultPrice: number; childPrice: number }) =>
        request<{ id: number }>(`/plans/${slug}/locations/${locationId}/sub-locations`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    updateSubLocation: (slug: string, locationId: number, subId: number, data: Partial<{ name: string; lat: number; lng: number; durationMinutes: number; description: string; sortOrder: number; adultPrice: number; childPrice: number }>) =>
        request<{ ok: boolean }>(`/plans/${slug}/locations/${locationId}/sub-locations/${subId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    deleteSubLocation: (slug: string, locationId: number, subId: number) =>
        request<{ ok: boolean }>(`/plans/${slug}/locations/${locationId}/sub-locations/${subId}`, { method: 'DELETE' }),

    reorderSubLocations: (slug: string, locationId: number, orderedIds: number[]) =>
        request<{ ok: boolean }>(`/plans/${slug}/locations/${locationId}/sub-locations/reorder`, {
            method: 'PATCH',
            body: JSON.stringify({ orderedIds }),
        }),
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
