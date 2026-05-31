import { useState, useEffect } from 'react';
import type { Location, LocationInput, SubLocation } from '../../types/index.js';
import { api } from '../../api/client.js';
import { CurrencyInput } from '../ui/CurrencyInput.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { PopConfirm } from '../ui/PopConfirm.js';
import { SubLocationCalendarPlanner, type SubLocationSchedule } from './SubLocationCalendarPlanner.js';

interface Props {
    location: Location | null;
    planSlug: string;
    onSave: (data: LocationInput) => Promise<boolean>;
    onClose: () => void;
    previousProvince?: string;
}

// Parse "DD/MM/YYYY HH:MM" → datetime-local string "YYYY-MM-DDTHH:MM"
function viDateToInput(str: string): string {
    if (!str) return '';
    const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
    if (!match) return '';
    const [, d, m, y, h, min] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${min}`;
}

// Parse datetime-local → unix ms
function inputToMs(str: string): number | null {
    if (!str) return null;
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
}

const MS_PER_DAY = 86400000;

function inputToDate(str: string): Date | null {
    if (!str) return null;
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : d;
}

function dateToInput(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + Math.max(0, days) * MS_PER_DAY);
}

function durationBetweenInputs(arrive: string, depart: string): number | null {
    const arriveDate = inputToDate(arrive);
    const departDate = inputToDate(depart);
    if (!arriveDate || !departDate || departDate < arriveDate) return null;
    return Math.max(0, Math.round((departDate.getTime() - arriveDate.getTime()) / MS_PER_DAY));
}

function activityCost(sub: SubLocation): number {
    const mode = sub.pricingMode || 'per_person';
    const quantity = Number(sub.quantity ?? 1) || 0;
    const surcharge = Number(sub.surcharge || 0);
    if (mode === 'per_room') {
        return (Number(sub.unitPrice || 0) * Math.max(quantity, 1)) + surcharge;
    }
    if (mode === 'per_group') {
        return (Number(sub.unitPrice || 0) * Math.max(quantity, 1)) + surcharge;
    }
    const participantAdults = Number(sub.participantAdults ?? 0);
    const participantChildren = Number(sub.participantChildren ?? 0);
    return (Number(sub.adultPrice || 0) * participantAdults) + (Number(sub.childPrice || 0) * participantChildren) + surcharge;
}

function activityDurationLabel(sub: Pick<SubLocation, 'durationDays' | 'durationMinutes'>): string {
    if (sub.durationDays && sub.durationDays > 0) return `${sub.durationDays} ngày`;
    return `${sub.durationMinutes} phút`;
}

function periodFromTime(time: string): string {
    const match = String(time || '').match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (!match) return '';
    const hour = Math.min(Math.max(Number(match[1]) || 0, 0), 23);
    if (hour >= 18) return 'evening';
    if (hour >= 12) return 'afternoon';
    return 'morning';
}

function costSummary(subLocations: SubLocation[]) {
    return subLocations.reduce((sum, sub) => {
        const type = sub.activityType || 'sightseeing';
        const cost = activityCost(sub);
        if (type === 'sightseeing') sum.sightseeing += cost;
        else if (type === 'accommodation') sum.accommodation += cost;
        else if (type === 'food') sum.food += cost;
        else sum.other += cost;
        sum.total += cost;
        return sum;
    }, { sightseeing: 0, accommodation: 0, food: 0, other: 0, total: 0 });
}

export function LocationEditor({ location, planSlug, onSave, onClose }: Props) {
    const [form, setForm] = useState<LocationInput>({});
    const [arriveInput, setArriveInput] = useState('');
    const [departInput, setDepartInput] = useState('');
    const [dirty, setDirty] = useState(false);
    const [subLocations, setSubLocations] = useState<SubLocation[]>([]);
    const [pendingCalendarOrder, setPendingCalendarOrder] = useState<number[] | null>(null);
    const [pendingCalendarSchedules, setPendingCalendarSchedules] = useState<SubLocationSchedule[] | null>(null);
    const [expandedSubId, setExpandedSubId] = useState<number | 'new' | null>(null);
    const [subForm, setSubForm] = useState<SubFormState>(emptySubFormState());
    const [confirmClose, setConfirmClose] = useState(false);

    useEffect(() => {
        if (location) {
            // Parse arrive/depart from dateRange "DD/MM/YYYY HH:MM - DD/MM/YYYY HH:MM"
            const parts = (location.dateRange || '').split(' - ');
            setArriveInput(viDateToInput(parts[0] || ''));
            setDepartInput(viDateToInput(parts[1] || ''));

            setForm({
                name: location.name,
                province: location.province,
                lat: location.lat,
                lng: location.lng,
                durationDays: location.duration,
                transportType: location.transportType,
                transportLabel: location.transport,
                highlight: location.highlight,
                description: location.description,
                activities: [...(location.activities || [])],
                food: [...(location.food || [])],
            });
        } else {
            setForm({ durationDays: 0, transportType: 'car' });
            setArriveInput('');
            setDepartInput('');
        }
        setDirty(false);
        setPendingCalendarOrder(null);
        setPendingCalendarSchedules(null);
        setSubLocations(location?.subLocations ?? []);
        setExpandedSubId(null);
    }, [location]);

    function set<K extends keyof LocationInput>(key: K, value: LocationInput[K]) {
        setForm(prev => ({ ...prev, [key]: value }));
        setDirty(true);
    }

    function emptySubForm() {
        setSubForm(emptySubFormState());
    }

    function openNewSub() {
        emptySubForm();
        setExpandedSubId('new');
    }

    function openEditSub(sub: SubLocation) {
        setSubForm({
            name: sub.name,
            lat: String(sub.lat),
            lng: String(sub.lng),
            durationMinutes: String(sub.durationMinutes),
            durationDays: String(sub.durationDays ?? 0),
            scheduledDate: sub.scheduledDate ?? '',
            scheduledTime: sub.scheduledTime ?? '',
            description: sub.description,
            activityType: sub.activityType ?? 'sightseeing',
            transportType: sub.transportType ?? '',
            pricingMode: sub.pricingMode ?? 'per_person',
            unitPrice: String(sub.unitPrice ?? 0),
            quantity: String(sub.quantity ?? 1),
            surcharge: String(sub.surcharge ?? 0),
            adultPrice: String(sub.adultPrice ?? 0),
            childPrice: String(sub.childPrice ?? 0),
            participantAdults: sub.participantAdults == null ? '' : String(sub.participantAdults),
            participantChildren: sub.participantChildren == null ? '' : String(sub.participantChildren),
        });
        setExpandedSubId(sub.id);
    }

    function handleArriveChange(value: string) {
        setArriveInput(value);
        setDirty(true);

        const arriveDate = inputToDate(value);
        const duration = Number(form.durationDays ?? 0);
        if (arriveDate && Number.isFinite(duration) && duration >= 0) {
            setDepartInput(dateToInput(addDays(arriveDate, duration)));
            return;
        }

        const nextDuration = durationBetweenInputs(value, departInput);
        if (nextDuration != null) set('durationDays', nextDuration);
    }

    function handleDepartChange(value: string) {
        setDepartInput(value);
        setDirty(true);
        const nextDuration = durationBetweenInputs(arriveInput, value);
        if (nextDuration != null) {
            setForm(prev => ({ ...prev, durationDays: nextDuration }));
        }
    }

    function handleDurationChange(value: string) {
        const nextDuration = Math.max(0, Number(value) || 0);
        set('durationDays', nextDuration);
        const arriveDate = inputToDate(arriveInput);
        if (arriveDate) {
            setDepartInput(dateToInput(addDays(arriveDate, nextDuration)));
        }
    }

    async function handleSaveSub() {
        if (!location || !subForm.name.trim()) return;
        const payload = {
            name: subForm.name,
            lat: Number(subForm.lat) || 0,
            lng: Number(subForm.lng) || 0,
            durationMinutes: Number(subForm.durationMinutes) || 60,
            durationDays: Number(subForm.durationDays) || 0,
            scheduledDate: subForm.scheduledDate,
            scheduledTime: subForm.scheduledTime,
            scheduledPeriod: periodFromTime(subForm.scheduledTime),
            description: subForm.description,
            activityType: subForm.activityType,
            transportType: subForm.activityType === 'transport' ? subForm.transportType : '',
            pricingMode: subForm.pricingMode,
            unitPrice: Number(subForm.unitPrice) || 0,
            quantity: Number(subForm.quantity) || 1,
            surcharge: Number(subForm.surcharge) || 0,
            adultPrice: Number(subForm.adultPrice) || 0,
            childPrice: Number(subForm.childPrice) || 0,
            participantAdults: Math.max(0, Number(subForm.participantAdults) || 0),
            participantChildren: Math.max(0, Number(subForm.participantChildren) || 0),
        };
        try {
            if (expandedSubId === 'new') {
                const { id } = await api.addSubLocation(planSlug, location.id, payload);
                setSubLocations(prev => [...prev, { id, ...payload }]);
            } else if (typeof expandedSubId === 'number') {
                await api.updateSubLocation(planSlug, location.id, expandedSubId, payload);
                setSubLocations(prev => prev.map(s => s.id === expandedSubId ? { ...s, ...payload } : s));
            }
            setExpandedSubId(null);
        } catch (err) {
            alert('Lỗi: ' + (err instanceof Error ? err.message : String(err)));
        }
    }

    async function handleDeleteSub(subId: number) {
        if (!location) return;
        try {
            await api.deleteSubLocation(planSlug, location.id, subId);
            setSubLocations(prev => prev.filter(s => s.id !== subId));
            if (expandedSubId === subId) setExpandedSubId(null);
        } catch (err) {
            alert('Lỗi: ' + (err instanceof Error ? err.message : String(err)));
        }
    }

    function handleClose() {
        if (dirty) { setConfirmClose(true); return; }
        onClose();
    }

    async function handleSave() {
        const payload: LocationInput = {
            ...form,
            arriveAt: inputToMs(arriveInput),
            departAt: inputToMs(departInput),
        };

        if (location && pendingCalendarOrder) {
            try {
                await api.reorderSubLocations(planSlug, location.id, pendingCalendarOrder, pendingCalendarSchedules ?? undefined);
                const order = new Map(pendingCalendarOrder.map((id, index) => [id, index]));
                const scheduleById = new Map((pendingCalendarSchedules ?? []).map(item => [item.id, item]));
                setSubLocations(prev => [...prev].map(sub => {
                    const schedule = scheduleById.get(sub.id);
                    return schedule ? { ...sub, scheduledDate: schedule.scheduledDate, scheduledPeriod: schedule.scheduledPeriod, scheduledTime: schedule.scheduledTime ?? sub.scheduledTime } : sub;
                }).sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999)));
                setPendingCalendarOrder(null);
                setPendingCalendarSchedules(null);
            } catch (err) {
                alert('Lỗi khi lưu calendar: ' + (err instanceof Error ? err.message : String(err)));
                return;
            }
        }

        const saved = await onSave(payload);
        if (!saved) return;

        setDirty(false);
    }

    return (
        <div className="flex-1 min-w-[560px] border-l border-white/10 bg-slate-900 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="font-bold text-white text-sm">
                    {location ? `Sửa: ${location.name}` : 'Thêm địa điểm mới'}
                </h2>
                <div className="flex items-center gap-2">
                    {dirty && <span className="text-[10px] text-amber-400 font-bold">Chưa lưu</span>}
                    <button onClick={handleClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
                <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                    {/* ── Cột trái: hồ sơ địa điểm ── */}
                    <div className="space-y-5">
                        <Section title="Hồ sơ địa điểm">
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Tên địa điểm *">
                                    <input type="text" value={form.name ?? ''} onChange={e => set('name', e.target.value)} className="input-field" placeholder="Hà Nội" />
                                </Field>
                                <Field label="Tỉnh / Thành phố">
                                    <input type="text" value={form.province ?? ''} onChange={e => set('province', e.target.value)} className="input-field" placeholder="Hà Nội" />
                                </Field>
                            </div>
                            <GeoSearch onResult={r => { set('lat', r.lat); set('lng', r.lng); }} />
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Vĩ độ (lat)">
                                    <input type="number" step="0.000001" value={form.lat ?? ''} onChange={e => set('lat', Number(e.target.value))} className="input-field" placeholder="21.0285" />
                                </Field>
                                <Field label="Kinh độ (lng)">
                                    <input type="number" step="0.000001" value={form.lng ?? ''} onChange={e => set('lng', Number(e.target.value))} className="input-field" placeholder="105.8542" />
                                </Field>
                            </div>
                            <Field label="Điểm nổi bật">
                                <input type="text" value={form.highlight ?? ''} onChange={e => set('highlight', e.target.value)} className="input-field" placeholder="Tràng An - Tam Cốc" />
                            </Field>
                            <Field label="Mô tả">
                                <textarea rows={3} value={form.description ?? ''} onChange={e => set('description', e.target.value)} className="input-field resize-none" placeholder="Chi tiết về địa điểm..." />
                            </Field>
                        </Section>
                    </div>

                    {/* ── Cột phải: thời gian và summary ── */}
                    <div className="space-y-5">
                        <Section title="Thời gian ở địa điểm">
                            <div className="grid grid-cols-3 gap-3">
                                <Field label="Đến lúc">
                                    <input type="datetime-local" value={arriveInput} onChange={e => handleArriveChange(e.target.value)} className="input-field" />
                                </Field>
                                <Field label="Rời lúc">
                                    <input type="datetime-local" value={departInput} onChange={e => handleDepartChange(e.target.value)} className="input-field" />
                                </Field>
                                <Field label="Kéo dài (ngày)">
                                    <input type="number" min="0" value={form.durationDays ?? 0} onChange={e => handleDurationChange(e.target.value)} className="input-field" />
                                </Field>
                            </div>
                            <p className="text-[10px] text-slate-500">
                                Chỉ dùng để xác định điểm dừng kéo dài bao lâu. Lưu trú, ăn uống, vui chơi và di chuyển nhập ở activity bên dưới.
                            </p>
                        </Section>

                        <Section title="Summary chi phí">
                            <p className="text-[10px] text-slate-500">
                                Số người được nhập trên từng activity để tính đúng chi phí theo hoạt động. Địa điểm chỉ giữ vai trò mốc ngày và khu vực.
                            </p>
                            <CostSummaryPanel
                                summary={costSummary(subLocations)}
                            />
                        </Section>
                    </div>
                </div>

                {/* Sub-locations — full width, only for existing locations */}
                {location && (
                    <div className="mt-5">
                        <Section title="Sắp xếp trên calendar">
                            <SubLocationCalendarPlanner
                                location={location}
                                subLocations={subLocations}
                                onScheduleChange={(orderedIds, schedules) => {
                                    setPendingCalendarOrder(orderedIds);
                                    setPendingCalendarSchedules(schedules);
                                    setDirty(true);
                                }}
                            />
                        </Section>
                    </div>
                )}

                {location && (
                    <div className="mt-5">
                        <Section title="Lịch trình chi tiết">
                            <div className="space-y-2">
                                {subLocations.map((sub, idx) => (
                                    <div key={sub.id} className="bg-white/5 rounded-xl border border-white/10">
                                        <div
                                            className="flex items-center justify-between px-3 py-2 cursor-pointer"
                                            onClick={() => expandedSubId === sub.id ? setExpandedSubId(null) : openEditSub(sub)}
                                        >
                                            <span className="text-xs text-slate-300 font-medium">
                                                <span className="text-slate-500 mr-2">{idx + 1}.</span>{sub.name}
                                                <span className="text-slate-500 ml-2 text-[10px]">· {activityDurationLabel(sub)}</span>
                                            </span>
                                            <div onClick={e => e.stopPropagation()}>
                                                <PopConfirm
                                                    label="×"
                                                    confirmLabel="Xóa"
                                                    onConfirm={() => void handleDeleteSub(sub.id)}
                                                />
                                            </div>
                                        </div>
                                        {expandedSubId === sub.id && (
                                            <div className="px-3 pb-3 space-y-2 border-t border-white/10 pt-2">
                                                <SubForm form={subForm} setForm={setSubForm} />
                                                <button onClick={() => void handleSaveSub()} className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg">Lưu</button>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {expandedSubId === 'new' && (
                                    <div className="bg-white/5 rounded-xl border border-white/10 px-3 py-3 space-y-2">
                                        <p className="text-[10px] text-slate-500 font-bold uppercase">Thêm điểm mới</p>
                                        <SubForm form={subForm} setForm={setSubForm} />
                                        <div className="flex gap-2">
                                            <button onClick={() => void handleSaveSub()} className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg">Lưu</button>
                                            <button onClick={() => setExpandedSubId(null)} className="py-1.5 px-3 bg-white/5 hover:bg-white/10 text-slate-400 text-xs rounded-lg">Hủy</button>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={openNewSub}
                                    className="w-full py-2 border border-dashed border-white/20 rounded-xl text-xs text-slate-500 hover:text-slate-300 hover:border-white/30 transition-colors"
                                >+ Thêm điểm</button>
                            </div>
                        </Section>
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-white/10">
                <button
                    onClick={() => void handleSave()}
                    disabled={!form.name?.trim()}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl transition-colors"
                >
                    {location ? 'Lưu thay đổi' : 'Thêm địa điểm'}
                </button>
            </div>

            {confirmClose && (
                <ConfirmDialog
                    message="Có thay đổi chưa lưu. Thoát mà không lưu?"
                    confirmLabel="Thoát"
                    onConfirm={() => { setConfirmClose(false); onClose(); }}
                    onCancel={() => setConfirmClose(false)}
                />
            )}
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">{title}</h3>
            <div className="space-y-3">{children}</div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-xs text-slate-400 mb-1">{label}</label>
            {children}
        </div>
    );
}

function CostSummaryPanel({ summary }: { summary: ReturnType<typeof costSummary> }) {
    const total = summary.total;
    const format = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Tổng dự toán location</span>
                <span className="font-bold text-white">{format(total)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
                <SummaryPill label="Vé tham quan" value={summary.sightseeing} />
                <SummaryPill label="Lưu trú" value={summary.accommodation} />
                <SummaryPill label="Ăn uống" value={summary.food} />
                <SummaryPill label="Di chuyển/khác" value={summary.other} />
            </div>
            <p className="text-[10px] text-slate-500">Các khoản vé, lưu trú, ăn uống và di chuyển đều lấy từ activity.</p>
        </div>
    );
}

function SummaryPill({ label, value }: { label: string; value: number }) {
    const format = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    return (
        <div className="rounded-lg bg-white/5 px-2 py-1.5">
            <p className="text-slate-500">{label}</p>
            <p className="font-bold text-slate-200">{format(value)}</p>
        </div>
    );
}

// --- Geo utilities ---

function parseGoogleMapsUrl(input: string): { lat: number; lng: number } | null {
    // @lat,lng,zoom pattern (share URLs, /place/ URLs)
    const atMatch = input.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };

    try {
        const u = new URL(input);
        // ?q=lat,lng or ?q=name (skip name-only)
        const q = u.searchParams.get('q') ?? u.searchParams.get('query') ?? '';
        const qMatch = q.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/);
        if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
        // ?ll=lat,lng
        const ll = u.searchParams.get('ll') ?? '';
        const llMatch = ll.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/);
        if (llMatch) return { lat: parseFloat(llMatch[1]), lng: parseFloat(llMatch[2]) };
    } catch { /* not a URL */ }

    return null;
}

async function geocodePlace(query: string): Promise<{ lat: number; lng: number; displayName: string } | null> {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=0`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'vi,en' } });
    if (!res.ok) return null;
    const data = await res.json() as Array<{ lat: string; lon: string; display_name: string }>;
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), displayName: data[0].display_name };
}

function extractPlaceNameFromMapsUrl(input: string): string | null {
    try {
        const u = new URL(input);
        if (!u.hostname.includes('google.com') && !u.hostname.includes('goo.gl')) return null;

        // /maps/place/PLACE_NAME/... or /maps/search/PLACE_NAME/...
        const match = u.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/);
        if (match) {
            return decodeURIComponent(match[1].replace(/\+/g, ' '));
        }

        // ?q=PLACE_NAME (non-coordinate)
        const q = u.searchParams.get('q') ?? '';
        if (q && !/^-?\d+\.\d+,-?\d+\.\d+$/.test(q)) return q;
    } catch { /* ignore */ }
    return null;
}



interface GeoResult { lat: number; lng: number; name?: string }

function GeoSearch({ onResult }: { onResult: (r: GeoResult) => void }) {
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
    const [message, setMessage] = useState('');

    async function handle() {
        const val = query.trim();
        if (!val) return;
        setStatus('loading');
        setMessage('');

        // 1. Try parse coords from Google Maps URL
        const coords = parseGoogleMapsUrl(val);
        if (coords) {
            onResult(coords);
            setStatus('ok');
            setMessage(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
            return;
        }

        // 2. If it's a Google Maps URL without coords, extract place name and geocode
        const placeName = val.startsWith('http') ? extractPlaceNameFromMapsUrl(val) : null;
        const geocodeQuery = placeName ?? val;

        try {
            const result = await geocodePlace(geocodeQuery);
            if (!result) { setStatus('err'); setMessage('Không tìm thấy địa điểm'); return; }
            onResult({ lat: result.lat, lng: result.lng, name: placeName ?? result.displayName });
            setStatus('ok');
            setMessage(`${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}`);
        } catch {
            setStatus('err');
            setMessage('Lỗi kết nối');
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter') { e.preventDefault(); void handle(); }
    }

    function handlePaste(e: React.ClipboardEvent) {
        const pasted = e.clipboardData.getData('text');
        // Only auto-trigger if it looks like a URL
        if (pasted.startsWith('http')) {
            e.preventDefault();
            setQuery(pasted);
            setStatus('loading');
            setMessage('');
            const coords = parseGoogleMapsUrl(pasted);
            if (coords) {
                onResult(coords);
                setStatus('ok');
                setMessage(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
            } else {
                const placeName = extractPlaceNameFromMapsUrl(pasted);
                const geocodeQuery = placeName ?? pasted;
                geocodePlace(geocodeQuery)
                    .then(result => {
                        if (!result) { setStatus('err'); setMessage('Không tìm thấy'); return; }
                        onResult({ lat: result.lat, lng: result.lng, name: placeName ?? result.displayName });
                        setStatus('ok');
                        setMessage(`${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}`);
                    })
                    .catch(() => { setStatus('err'); setMessage('Lỗi kết nối'); });
            }
        }
    }

    return (
        <div>
            <label className="block text-xs text-slate-400 mb-1">Tìm tọa độ</label>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setStatus('idle'); }}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    className="input-field flex-1"
                    placeholder="Tên địa điểm hoặc dán link Google Maps"
                />
                <button
                    type="button"
                    onClick={() => void handle()}
                    disabled={status === 'loading' || !query.trim()}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white text-xs rounded-lg transition-colors whitespace-nowrap"
                >
                    {status === 'loading' ? '…' : 'Tìm'}
                </button>
            </div>
            {status === 'ok' && <p className="text-[10px] text-emerald-400 mt-1">{message}</p>}
            {status === 'err' && <p className="text-[10px] text-red-400 mt-1">{message}</p>}
        </div>
    );
}

// --- SubForm ---

interface SubFormState {
    name: string;
    lat: string;
    lng: string;
    durationMinutes: string;
    durationDays: string;
    scheduledDate: string;
    scheduledTime: string;
    description: string;
    activityType: 'sightseeing' | 'accommodation' | 'food' | 'transport' | 'other';
    transportType: 'car' | 'bus' | 'train' | 'flight' | 'motorbike' | 'ferry' | 'walking' | 'other' | '';
    pricingMode: 'per_person' | 'per_room' | 'per_group';
    unitPrice: string;
    quantity: string;
    surcharge: string;
    adultPrice: string;
    childPrice: string;
    participantAdults: string;
    participantChildren: string;
}

function emptySubFormState(): SubFormState {
    return {
        name: '',
        lat: '',
        lng: '',
        durationMinutes: '60',
        durationDays: '0',
        scheduledDate: '',
        scheduledTime: '',
        description: '',
        activityType: 'sightseeing',
        transportType: '',
        pricingMode: 'per_person',
        unitPrice: '0',
        quantity: '1',
        surcharge: '0',
        adultPrice: '0',
        childPrice: '0',
        participantAdults: '',
        participantChildren: '',
    };
}

function SubForm({ form, setForm }: { form: SubFormState; setForm: React.Dispatch<React.SetStateAction<SubFormState>> }) {
    return (
        <div className="space-y-2">
            <GeoSearch onResult={r => setForm(f => ({
                ...f,
                lat: String(r.lat),
                lng: String(r.lng),
                ...(r.name ? { name: r.name.split(',')[0].trim() } : {}),
            }))} />
            <div>
                <label className="block text-[10px] text-slate-500 mb-1">Tên điểm *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Hồ Hoàn Kiếm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Vĩ độ</label>
                    <input type="number" step="0.000001" value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} className="input-field" placeholder="21.028" />
                </div>
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Kinh độ</label>
                    <input type="number" step="0.000001" value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} className="input-field" placeholder="105.852" />
                </div>
            </div>
            <div>
                <label className="block text-[10px] text-slate-500 mb-1">Thời lượng (phút)</label>
                <input type="number" min="1" value={form.durationMinutes} onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value }))} className="input-field" />
            </div>
            <div>
                <label className="block text-[10px] text-slate-500 mb-1">Kéo dài nhiều ngày</label>
                <input type="number" min="0" step="0.5" value={form.durationDays} onChange={e => setForm(f => ({ ...f, durationDays: e.target.value }))} className="input-field" placeholder="0 nếu chỉ trong ngày" />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Ngày diễn ra</label>
                    <input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} className="input-field" />
                </div>
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Giờ bắt đầu</label>
                    <input type="time" value={form.scheduledTime} onChange={e => setForm(f => ({ ...f, scheduledTime: e.target.value }))} className="input-field" />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Loại activity</label>
                    <select value={form.activityType} onChange={e => setForm(f => ({ ...f, activityType: e.target.value as SubFormState['activityType'] }))} className="input-field">
                        <option value="sightseeing">Tham quan</option>
                        <option value="accommodation">Lưu trú</option>
                        <option value="food">Ăn uống</option>
                        <option value="transport">Di chuyển</option>
                        <option value="other">Khác</option>
                    </select>
                </div>
                {form.activityType === 'transport' && (
                    <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Loại di chuyển</label>
                        <select value={form.transportType} onChange={e => setForm(f => ({ ...f, transportType: e.target.value as SubFormState['transportType'] }))} className="input-field">
                            <option value="">Tự nhận diện</option>
                            <option value="car">Ô tô</option>
                            <option value="bus">Xe khách/bus</option>
                            <option value="train">Tàu hỏa</option>
                            <option value="flight">Máy bay</option>
                            <option value="motorbike">Xe máy</option>
                            <option value="ferry">Tàu/phà</option>
                            <option value="walking">Đi bộ</option>
                            <option value="other">Khác</option>
                        </select>
                    </div>
                )}
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Cách tính</label>
                    <select value={form.pricingMode} onChange={e => setForm(f => ({ ...f, pricingMode: e.target.value as SubFormState['pricingMode'] }))} className="input-field">
                        <option value="per_person">Theo người</option>
                        <option value="per_room">Theo phòng/đơn vị</option>
                        <option value="per_group">Theo nhóm</option>
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Giá người lớn</label>
                    <CurrencyInput value={Number(form.adultPrice) || 0} onChange={v => setForm(f => ({ ...f, adultPrice: String(v) }))} />
                </div>
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Giá trẻ em</label>
                    <CurrencyInput value={Number(form.childPrice) || 0} onChange={v => setForm(f => ({ ...f, childPrice: String(v) }))} />
                </div>
            </div>
            {form.pricingMode === 'per_person' && (
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Người lớn tham gia</label>
                        <input type="number" min="0" value={form.participantAdults} onChange={e => setForm(f => ({ ...f, participantAdults: e.target.value }))} className="input-field" placeholder="0" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Trẻ em tham gia</label>
                        <input type="number" min="0" value={form.participantChildren} onChange={e => setForm(f => ({ ...f, participantChildren: e.target.value }))} className="input-field" placeholder="0" />
                    </div>
                </div>
            )}
            <div className="grid grid-cols-3 gap-2">
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Giá đơn vị</label>
                    <CurrencyInput value={Number(form.unitPrice) || 0} onChange={v => setForm(f => ({ ...f, unitPrice: String(v) }))} />
                </div>
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">{form.pricingMode === 'per_room' ? 'Số phòng/đơn vị' : 'Số lượng'}</label>
                    <input type="number" min="0" step="0.5" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="input-field" />
                </div>
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Phụ thu</label>
                    <CurrencyInput value={Number(form.surcharge) || 0} onChange={v => setForm(f => ({ ...f, surcharge: String(v) }))} />
                </div>
            </div>
            <div>
                <label className="block text-[10px] text-slate-500 mb-1">Mô tả</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-field resize-none" placeholder="Chi tiết..." />
            </div>
        </div>
    );
}
