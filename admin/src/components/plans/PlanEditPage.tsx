import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import type { Plan, Location, LocationInput } from '../../types/index.js';
import { LocationList } from '../locations/LocationList.js';
import { LocationEditor } from '../locations/LocationEditor.js';
import { Toast } from '../ui/Toast.js';

export function PlanEditPage() {
    const { slug } = useParams<{ slug: string }>();
    const [plan, setPlan] = useState<Plan | null>(null);
    const [loading, setLoading] = useState(true);
    const [editingLocation, setEditingLocation] = useState<Location | null>(null);
    const [addingNew, setAddingNew] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        if (!slug) return;
        api.getPlan(slug).then(setPlan).finally(() => setLoading(false));
    }, [slug]);

    function showToast(message: string, type: 'success' | 'error' = 'success') {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }

    async function handleReorder(orderedIds: number[]) {
        if (!slug) return;
        try {
            const updated = await api.reorderLocations(slug, orderedIds);
            setPlan(updated);
        } catch {
            showToast('Lỗi khi sắp xếp', 'error');
        }
    }

    async function handleSaveLocation(data: LocationInput) {
        if (!slug) return;
        try {
            if (addingNew) {
                await api.addLocation(slug, data);
                const updated = await api.getPlan(slug);
                setPlan(updated);
                setAddingNew(false);
            } else if (editingLocation) {
                const updated = await api.updateLocation(slug, editingLocation.id, data);
                setPlan(updated);
                setEditingLocation(null);
            }
            showToast('Đã lưu thành công');
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Có lỗi xảy ra', 'error');
        }
    }

    async function handleDeleteLocation(id: number) {
        if (!slug || !confirm('Xóa địa điểm này?')) return;
        try {
            await api.deleteLocation(slug, id);
            const updated = await api.getPlan(slug);
            setPlan(updated);
            if (editingLocation?.id === id) setEditingLocation(null);
            showToast('Đã xóa địa điểm');
        } catch {
            showToast('Lỗi khi xóa', 'error');
        }
    }

    if (loading) return <div className="p-8 text-slate-400">Đang tải...</div>;
    if (!plan) return <div className="p-8 text-red-400">Không tìm thấy kế hoạch</div>;

    const locations = plan.locations ?? [];

    return (
        <div className="flex h-full min-h-0 overflow-hidden">
            {/* Left panel */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-6 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link to="/" className="text-slate-400 hover:text-white text-sm">← Tất cả kế hoạch</Link>
                        <div>
                            <h1 className="text-xl font-bold text-white">{plan.name}</h1>
                            <p className="text-slate-400 text-xs">{plan.dateRange || 'Chưa có ngày'}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => { setAddingNew(true); setEditingLocation(null); }}
                        className="px-4 py-2 bg-white/10 hover:bg-white/15 text-slate-300 text-sm rounded-xl transition-colors"
                    >
                        + Thêm địa điểm
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <LocationList
                        locations={locations}
                        onReorder={handleReorder}
                        onEdit={loc => { setEditingLocation(loc); setAddingNew(false); }}
                        onDelete={handleDeleteLocation}
                        activeId={editingLocation?.id}
                    />
                </div>
            </div>

            {/* Right editor panel */}
            {(editingLocation || addingNew) && (
                <LocationEditor
                    location={editingLocation}
                    planSlug={slug!}
                    onSave={handleSaveLocation}
                    onClose={() => { setEditingLocation(null); setAddingNew(false); }}
                    previousProvince={
                        editingLocation
                            ? getPreviousProvince(locations, editingLocation.id)
                            : locations[locations.length - 1]?.province
                    }
                />
            )}

            {toast && <Toast message={toast.message} type={toast.type} />}
        </div>
    );
}

function getPreviousProvince(locations: Location[], currentId: number): string | undefined {
    const idx = locations.findIndex(l => l.id === currentId);
    return idx > 0 ? locations[idx - 1].province : undefined;
}
