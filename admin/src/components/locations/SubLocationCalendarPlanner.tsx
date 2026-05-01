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

interface Props {
    location: Location;
    subLocations: SubLocation[];
    onOrderChange: (orderedIds: number[]) => void;
}

interface VisitSlot {
    id: string;
    date: Date;
    label: 'Sáng' | 'Chiều';
    disabled?: boolean;
    reason?: string;
    hint?: string;
}

interface CalendarDay {
    key: string;
    date: Date;
    slots: VisitSlot[];
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

function buildCalendarDays(location: Location): CalendarDay[] {
    const { start, end } = parseDateRange(location.dateRange);
    if (!start && !end) return [];

    const first = normalizeDay(start || end!);
    const last = normalizeDay(end || start!);
    const startKey = start ? localDateKey(start) : '';
    const endKey = end ? localDateKey(end) : '';
    const visitStart = calendarVisitStartDate(location, start);
    const days: CalendarDay[] = [];
    const cursor = new Date(first);

    while (cursor <= last) {
        const day = new Date(cursor);
        const key = localDateKey(day);
        days.push({
            key,
            date: day,
            slots: [
                buildSlot(day, 'Sáng', startKey, endKey, visitStart, end),
                buildSlot(day, 'Chiều', startKey, endKey, visitStart, end),
            ],
        });
        cursor.setDate(cursor.getDate() + 1);
    }
    return days;
}

function buildSlot(day: Date, label: 'Sáng' | 'Chiều', startKey: string, endKey: string, visitStart: Date | null, end: Date | null): VisitSlot {
    const key = localDateKey(day);
    let reason = '';

    if (key === startKey) reason = 'Check-in / nghỉ';
    else if (visitStart && day < visitStart) reason = 'Chưa xếp tham quan';
    else if (key === endKey && end && end.getHours() < 12) reason = 'Checkout sáng';
    else if (key === endKey && end && end.getHours() >= 12 && label === 'Chiều') reason = 'Di chuyển / checkout';

    const isTravelBoundary = key === startKey || reason === 'Checkout sáng' || reason === 'Di chuyển / checkout';
    return {
        id: `${key}-${label === 'Sáng' ? 'morning' : 'afternoon'}`,
        date: day,
        label,
        disabled: isTravelBoundary,
        reason: isTravelBoundary ? reason : '',
        hint: !isTravelBoundary ? reason : '',
    };
}

function buildVisitSlots(days: CalendarDay[]): VisitSlot[] {
    return days.flatMap(day => day.slots).filter(slot => !slot.disabled);
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

function buildOrderedIds(assignments: Assignments, slots: VisitSlot[], subLocations: SubLocation[]): number[] {
    const orderedIds = slots.flatMap(slot => assignments[slot.id] || []);
    const missingIds = subLocations.map(sub => sub.id).filter(id => !orderedIds.includes(id));
    return [...orderedIds, ...missingIds];
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const toRad = (n: number) => n * Math.PI / 180;
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function formatKm(km: number): string {
    return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

function buildProximity(subLocations: SubLocation[]): Map<number, string> {
    return new Map(subLocations.map(sub => {
        const nearest = subLocations
            .filter(other => other.id !== sub.id)
            .map(other => ({ name: other.name, km: haversineKm(sub, other) }))
            .sort((a, b) => a.km - b.km)
            .slice(0, 2);
        return [sub.id, nearest.length ? `Gần: ${nearest.map(item => `${item.name} ${formatKm(item.km)}`).join(', ')}` : ''];
    }));
}

export function SubLocationCalendarPlanner({ location, subLocations, onOrderChange }: Props) {
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
    const calendarDays = useMemo(() => buildCalendarDays(location), [location]);
    const slots = useMemo(() => buildVisitSlots(calendarDays), [calendarDays]);
    const subById = useMemo(() => new Map(subLocations.map(sub => [sub.id, sub])), [subLocations]);
    const proximity = useMemo(() => buildProximity(subLocations), [subLocations]);
    const [assignments, setAssignments] = useState<Assignments>(() => buildInitialAssignments(slots, subLocations));

    useEffect(() => {
        setAssignments(buildInitialAssignments(slots, subLocations));
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

        const next = Object.fromEntries(Object.entries(assignments).map(([slotId, ids]) => [slotId, ids.filter(id => id !== activeId)])) as Assignments;
        const target = [...next[toSlot]];
        const insertAt = overSubId != null && target.includes(overSubId) ? target.indexOf(overSubId) : target.length;
        target.splice(insertAt, 0, activeId);
        next[toSlot] = target;

        setAssignments(next);
        onOrderChange(buildOrderedIds(next, slots, subLocations));
    }

    if (!subLocations.length) return null;

    if (!slots.length) {
        return <p className="text-xs text-slate-500">Cần ngày đến/rời hợp lệ để sắp xếp bằng calendar.</p>;
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">Hiển thị toàn bộ ngày lưu trú. Kéo điểm tham quan vào ô sáng/chiều; thay đổi sẽ lưu bằng nút Lưu thay đổi bên dưới.</p>
            </div>
            <ProximityPanel subLocations={subLocations} proximity={proximity} />
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                    {calendarDays.map(day => (
                        <div key={day.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                            <div className="mb-2 flex items-center justify-between">
                                <span className="text-xs font-bold text-white">{formatDay(day.date)}</span>
                                <span className="text-[10px] text-slate-500">{day.slots.some(slot => !slot.disabled) ? 'Có thể xếp' : 'Không xếp tham quan'}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {day.slots.map(slot => (
                                    <CalendarSlot
                                        key={slot.id}
                                        slot={slot}
                                        items={(assignments[slot.id] || []).map(id => subById.get(id)).filter(Boolean) as SubLocation[]}
                                        proximity={proximity}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </DndContext>
        </div>
    );
}

function ProximityPanel({ subLocations, proximity }: { subLocations: SubLocation[]; proximity: Map<number, string> }) {
    if (subLocations.length < 2) return null;

    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Gợi ý khoảng cách gần</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
                {subLocations.map(sub => (
                    <div key={sub.id} className="truncate text-[11px] text-slate-400">
                        <span className="font-semibold text-slate-200">{sub.name}</span>
                        <span className="ml-1">{proximity.get(sub.id)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function CalendarSlot({ slot, items, proximity }: { slot: VisitSlot; items: SubLocation[]; proximity: Map<number, string> }) {
    const { setNodeRef, isOver } = useDroppable({ id: `slot:${slot.id}`, disabled: slot.disabled });
    const isMorning = slot.label === 'Sáng';

    return (
        <div
            ref={setNodeRef}
            className={`min-h-[120px] rounded-xl border p-2 transition-colors ${
                slot.disabled
                    ? 'bg-slate-800/50 border-white/5 opacity-70'
                    : (isMorning ? 'bg-sky-500/10 border-sky-400/25' : 'bg-orange-500/10 border-orange-400/25')
            } ${isOver ? 'ring-2 ring-white/40' : ''}`}
        >
            <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-bold ${isMorning ? 'text-sky-200' : 'text-orange-200'}`}>{slot.label}</span>
                {slot.disabled && <span className="text-[9px] font-semibold text-slate-500">{slot.reason}</span>}
                {!slot.disabled && slot.hint && <span className="text-[9px] font-semibold text-slate-500">{slot.hint}</span>}
            </div>
            <div className="space-y-1.5">
                {items.map(item => <DraggableSub key={item.id} sub={item} proximity={proximity.get(item.id) || ''} />)}
            </div>
        </div>
    );
}

function DraggableSub({ sub, proximity }: { sub: SubLocation; proximity: string }) {
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
            <span className="block truncate">{sub.name}</span>
            {proximity && <span className="mt-0.5 block truncate text-[9px] font-medium text-emerald-100/65">{proximity}</span>}
        </button>
    );
}

function parseDndSubId(id: unknown): number | null {
    const value = String(id);
    if (!value.startsWith('sub:')) return null;
    const numeric = Number(value.slice(4));
    return Number.isFinite(numeric) ? numeric : null;
}
