import { useEffect, useMemo, useState } from 'react';
import {
    DndContext,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import type { Location, SubLocation } from '../../types/index.js';
import { api } from '../../api/client.js';

interface Props {
    planSlug: string;
    location: Location;
    subLocations: SubLocation[];
    onSaved: (subLocations: SubLocation[]) => void;
}

interface VisitSlot {
    id: string;
    date: Date;
    label: 'Sáng' | 'Chiều';
}

type Assignments = Record<string, number[]>;

function parseDateRange(dateRange: string): { start: Date | null; end: Date | null } {
    const [startPart, endPart] = String(dateRange || '').split(' - ');
    const fallbackYear = Number(startPart?.match(/\b(\d{4})\b/)?.[1] || endPart?.match(/\b(\d{4})\b/)?.[1] || new Date().getFullYear());
    const parsePart = (part?: string): Date | null => {
        if (!part) return null;
        const [datePart, timePart = '00:00'] = part.trim().split(' ');
        const [day, month, year = fallbackYear] = datePart.split('/').map(Number);
        const [hour, minute] = timePart.split(':').map(Number);
        if (![day, month, year, hour, minute].every(Number.isFinite)) return null;
        return new Date(year, month - 1, day, hour, minute);
    };
    const start = parsePart(startPart);
    let end = parsePart(endPart);
    if (start && end && end < start) end = new Date(end.getFullYear() + 1, end.getMonth(), end.getDate(), end.getHours(), end.getMinutes());
    return { start, end };
}

function normalizeDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDateKey(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDay(date: Date): string {
    const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${weekdays[date.getDay()]} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

function normalizedName(name: string): string {
    return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
}

function calendarVisitStartDate(location: Location, start: Date | null): Date | null {
    if (!start) return null;
    if (normalizedName(location.name) === 'nghe an') return new Date(start.getFullYear(), 5, 27);
    return null;
}

function buildVisitSlots(location: Location): VisitSlot[] {
    const { start, end } = parseDateRange(location.dateRange);
    if (!start && !end) return [];

    const first = normalizeDay(start || end!);
    const last = normalizeDay(end || start!);
    const startKey = start ? localDateKey(start) : '';
    const endKey = end ? localDateKey(end) : '';
    const visitStart = calendarVisitStartDate(location, start);
    const slots: VisitSlot[] = [];
    const cursor = new Date(first);

    while (cursor <= last) {
        const day = new Date(cursor);
        const key = localDateKey(day);
        if (key !== startKey && (!visitStart || day >= visitStart) && !(key === endKey && end && end.getHours() < 12)) {
            slots.push({ id: `${key}-morning`, date: day, label: 'Sáng' });
            if (!(key === endKey && end && end.getHours() >= 12)) {
                slots.push({ id: `${key}-afternoon`, date: day, label: 'Chiều' });
            }
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return slots;
}

function buildInitialAssignments(slots: VisitSlot[], subLocations: SubLocation[]): Assignments {
    const assignments: Assignments = Object.fromEntries(slots.map(slot => [slot.id, []]));
    if (!slots.length) return assignments;
    subLocations.forEach((sub, index) => {
        const slot = slots[index % slots.length];
        assignments[slot.id].push(sub.id);
    });
    return assignments;
}

function findContainer(assignments: Assignments, subId: number): string | null {
    return Object.entries(assignments).find(([, ids]) => ids.includes(subId))?.[0] ?? null;
}

export function SubLocationCalendarPlanner({ planSlug, location, subLocations, onSaved }: Props) {
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
    const slots = useMemo(() => buildVisitSlots(location), [location]);
    const subById = useMemo(() => new Map(subLocations.map(sub => [sub.id, sub])), [subLocations]);
    const [assignments, setAssignments] = useState<Assignments>(() => buildInitialAssignments(slots, subLocations));
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        setAssignments(buildInitialAssignments(slots, subLocations));
        setDirty(false);
    }, [slots, subLocations]);

    function handleDragEnd(event: DragEndEvent) {
        const activeId = parseDndSubId(event.active.id);
        const overId = event.over?.id;
        if (!overId || activeId == null) return;
        if (String(overId) === String(event.active.id)) return;

        const fromSlot = findContainer(assignments, activeId);
        const overSubId = parseDndSubId(overId);
        const toSlot = String(overId).startsWith('slot:') ? String(overId).slice(5) : (overSubId == null ? null : findContainer(assignments, overSubId));
        if (!fromSlot || !toSlot || !assignments[toSlot]) return;

        setAssignments(prev => {
            const next = Object.fromEntries(Object.entries(prev).map(([slotId, ids]) => [slotId, ids.filter(id => id !== activeId)])) as Assignments;
            const target = [...next[toSlot]];
            const insertAt = overSubId != null && target.includes(overSubId) ? target.indexOf(overSubId) : target.length;
            target.splice(insertAt, 0, activeId);
            next[toSlot] = target;
            return next;
        });
        setDirty(true);
    }

    async function handleSave() {
        const orderedIds = slots.flatMap(slot => assignments[slot.id] || []);
        const missingIds = subLocations.map(sub => sub.id).filter(id => !orderedIds.includes(id));
        const finalIds = [...orderedIds, ...missingIds];
        setSaving(true);
        try {
            await api.reorderSubLocations(planSlug, location.id, finalIds);
            const order = new Map(finalIds.map((id, index) => [id, index]));
            onSaved([...subLocations].sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999)));
            setDirty(false);
        } catch (err) {
            alert('Lỗi khi lưu calendar: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setSaving(false);
        }
    }

    if (!subLocations.length) return null;

    if (!slots.length) {
        return <p className="text-xs text-slate-500">Cần ngày đến/rời hợp lệ để sắp xếp bằng calendar.</p>;
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">Kéo điểm tham quan vào ô sáng/chiều. Lưu sẽ cập nhật thứ tự hiển thị trên lịch public.</p>
                <button
                    onClick={() => void handleSave()}
                    disabled={!dirty || saving}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg"
                >
                    {saving ? 'Đang lưu...' : 'Lưu calendar'}
                </button>
            </div>
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
                    {slots.map(slot => (
                        <CalendarSlot
                            key={slot.id}
                            slot={slot}
                            items={(assignments[slot.id] || []).map(id => subById.get(id)).filter(Boolean) as SubLocation[]}
                        />
                    ))}
                </div>
            </DndContext>
        </div>
    );
}

function CalendarSlot({ slot, items }: { slot: VisitSlot; items: SubLocation[] }) {
    const { setNodeRef, isOver } = useDroppable({ id: `slot:${slot.id}` });
    const isMorning = slot.label === 'Sáng';

    return (
        <div
            ref={setNodeRef}
            className={`min-h-[120px] rounded-xl border p-2 transition-colors ${
                isMorning ? 'bg-sky-500/10 border-sky-400/25' : 'bg-orange-500/10 border-orange-400/25'
            } ${isOver ? 'ring-2 ring-white/40' : ''}`}
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-white">{formatDay(slot.date)}</span>
                <span className={`text-[10px] font-bold ${isMorning ? 'text-sky-200' : 'text-orange-200'}`}>{slot.label}</span>
            </div>
            <div className="space-y-1.5">
                {items.map(item => <DraggableSub key={item.id} sub={item} />)}
            </div>
        </div>
    );
}

function DraggableSub({ sub }: { sub: SubLocation }) {
    const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: `sub:${sub.id}` });
    const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `sub:${sub.id}` });
    const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
    const setNodeRef = (node: HTMLButtonElement | null) => {
        setDragRef(node);
        setDropRef(node);
    };

    return (
        <button
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className={`w-full text-left px-2 py-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/10 text-emerald-100 text-[11px] font-semibold truncate cursor-grab active:cursor-grabbing ${
                isDragging ? 'opacity-60 z-50' : ''
            } ${isOver ? 'ring-1 ring-white/50' : ''
            }`}
            type="button"
        >
            {sub.name}
        </button>
    );
}

function parseDndSubId(id: unknown): number | null {
    const value = String(id);
    if (!value.startsWith('sub:')) return null;
    const numeric = Number(value.slice(4));
    return Number.isFinite(numeric) ? numeric : null;
}
