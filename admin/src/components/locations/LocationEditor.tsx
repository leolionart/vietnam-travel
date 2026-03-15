import { useState, useEffect } from 'react';
import type { Location, LocationInput, SubLocation } from '../../types/index.js';
import { api } from '../../api/client.js';
import { CurrencyInput } from '../ui/CurrencyInput.js';
import { TagInput } from '../ui/TagInput.js';

interface TripResult {
    tripCode: string;
    companyName: string;
    companyRating: number;
    departureTime: string;
    priceOriginal: number;
    priceDiscount: number;
    availableSeats: number;
    seatType: number;
    seatTypeName: string;
}

interface Props {
    location: Location | null;
    planSlug: string;
    onSave: (data: LocationInput) => void;
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

const TRANSPORT_TYPES = [
    { value: 'car', label: 'Ô tô / Taxi' },
    { value: 'bus', label: 'Xe khách' },
    { value: 'train', label: 'Tàu hỏa' },
    { value: 'flight', label: 'Máy bay' },
    { value: 'motorbike', label: 'Xe máy' },
    { value: 'other', label: 'Khác' },
];

export function LocationEditor({ location, planSlug, onSave, onClose, previousProvince }: Props) {
    const [form, setForm] = useState<LocationInput>({});
    const [arriveInput, setArriveInput] = useState('');
    const [departInput, setDepartInput] = useState('');
    const [dirty, setDirty] = useState(false);
    const [subLocations, setSubLocations] = useState<SubLocation[]>([]);
    const [expandedSubId, setExpandedSubId] = useState<number | 'new' | null>(null);
    const [subForm, setSubForm] = useState<{ name: string; lat: string; lng: string; durationMinutes: string; description: string; adultPrice: string; childPrice: string }>({ name: '', lat: '', lng: '', durationMinutes: '60', description: '', adultPrice: '0', childPrice: '0' });

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
                transportFare: location.transportFare,
                accommodationName: location.accommodationName,
                accommodationUrl: location.accommodationUrl,
                adultPrice: location.adultPrice,
                childPrice: location.childPrice,
                stayCostPerNight: location.stayCostPerNight,
                foodBudgetPerDay: location.foodBudgetPerDay,
                adults: location.adults,
                children: location.children,
                highlight: location.highlight,
                description: location.description,
                activities: [...(location.activities || [])],
                food: [...(location.food || [])],
            });
        } else {
            setForm({ adults: 2, children: 0, durationDays: 0, transportType: 'car' });
            setArriveInput('');
            setDepartInput('');
        }
        setDirty(false);
        setSubLocations(location?.subLocations ?? []);
        setExpandedSubId(null);
    }, [location]);

    function set<K extends keyof LocationInput>(key: K, value: LocationInput[K]) {
        setForm(prev => ({ ...prev, [key]: value }));
        setDirty(true);
    }

    function emptySubForm() {
        setSubForm({ name: '', lat: '', lng: '', durationMinutes: '60', description: '', adultPrice: '0', childPrice: '0' });
    }

    function openNewSub() {
        emptySubForm();
        setExpandedSubId('new');
    }

    function openEditSub(sub: SubLocation) {
        setSubForm({ name: sub.name, lat: String(sub.lat), lng: String(sub.lng), durationMinutes: String(sub.durationMinutes), description: sub.description, adultPrice: String(sub.adultPrice ?? 0), childPrice: String(sub.childPrice ?? 0) });
        setExpandedSubId(sub.id);
    }

    async function handleSaveSub() {
        if (!location || !subForm.name.trim()) return;
        const payload = {
            name: subForm.name,
            lat: Number(subForm.lat) || 0,
            lng: Number(subForm.lng) || 0,
            durationMinutes: Number(subForm.durationMinutes) || 60,
            description: subForm.description,
            adultPrice: Number(subForm.adultPrice) || 0,
            childPrice: Number(subForm.childPrice) || 0,
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
        if (!location || !confirm('Xóa điểm này?')) return;
        try {
            await api.deleteSubLocation(planSlug, location.id, subId);
            setSubLocations(prev => prev.filter(s => s.id !== subId));
            if (expandedSubId === subId) setExpandedSubId(null);
        } catch (err) {
            alert('Lỗi: ' + (err instanceof Error ? err.message : String(err)));
        }
    }

    function handleSave() {
        const payload: LocationInput = {
            ...form,
            arriveAt: inputToMs(arriveInput),
            departAt: inputToMs(departInput),
        };
        onSave(payload);
        setDirty(false);
    }

    function handleClose() {
        if (dirty && !confirm('Có thay đổi chưa lưu. Bạn có muốn thoát không?')) return;
        onClose();
    }

    return (
        <div className="w-[420px] border-l border-white/10 bg-slate-900 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="font-bold text-white text-sm">
                    {location ? `Sửa: ${location.name}` : 'Thêm địa điểm mới'}
                </h2>
                <div className="flex items-center gap-2">
                    {dirty && <span className="text-[10px] text-amber-400 font-bold">Chưa lưu</span>}
                    <button onClick={handleClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {/* Basic info */}
                <Section title="Thông tin cơ bản">
                    <Field label="Tên địa điểm *">
                        <input
                            type="text"
                            value={form.name ?? ''}
                            onChange={e => set('name', e.target.value)}
                            className="input-field"
                            placeholder="Hà Nội"
                        />
                    </Field>
                    <Field label="Tỉnh / Thành phố">
                        <input
                            type="text"
                            value={form.province ?? ''}
                            onChange={e => set('province', e.target.value)}
                            className="input-field"
                            placeholder="Hà Nội"
                        />
                    </Field>
                    <GeoSearch onResult={r => {
                        set('lat', r.lat);
                        set('lng', r.lng);
                    }} />
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

                {/* Dates */}
                <Section title="Thời gian">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Đến lúc">
                            <input type="datetime-local" value={arriveInput} onChange={e => { setArriveInput(e.target.value); setDirty(true); }} className="input-field" />
                        </Field>
                        <Field label="Rời lúc">
                            <input type="datetime-local" value={departInput} onChange={e => { setDepartInput(e.target.value); setDirty(true); }} className="input-field" />
                        </Field>
                    </div>
                    <Field label="Số ngày lưu trú">
                        <input type="number" min="0" value={form.durationDays ?? 0} onChange={e => set('durationDays', Number(e.target.value))} className="input-field" />
                    </Field>
                </Section>

                {/* Transport */}
                <Section title="Di chuyển">
                    <Field label="Loại phương tiện">
                        <select value={form.transportType ?? 'car'} onChange={e => set('transportType', e.target.value)} className="input-field">
                            {TRANSPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </Field>
                    <Field label="Mô tả di chuyển">
                        <input type="text" value={form.transportLabel ?? ''} onChange={e => set('transportLabel', e.target.value)} className="input-field" placeholder="Ô tô (Hà Nội → Nghệ An)" />
                    </Field>
                    <Field label="Vé xe / vé máy bay">
                        <CurrencyInput value={form.transportFare ?? 0} onChange={v => set('transportFare', v)} />
                    </Field>
                    {previousProvince && form.province && form.province !== previousProvince && (
                        <VexereButton from={previousProvince} to={form.province} arriveInput={arriveInput} />
                    )}
                </Section>

                {/* Accommodation */}
                <Section title="Lưu trú">
                    <Field label="Tên chỗ ở">
                        <input type="text" value={form.accommodationName ?? ''} onChange={e => set('accommodationName', e.target.value)} className="input-field" placeholder="Khách sạn ABC" />
                    </Field>
                    <Field label="Link đặt phòng">
                        <input type="url" value={form.accommodationUrl ?? ''} onChange={e => set('accommodationUrl', e.target.value)} className="input-field" placeholder="https://..." />
                    </Field>
                    <Field label="Giá lưu trú / đêm">
                        <CurrencyInput value={form.stayCostPerNight ?? 0} onChange={v => set('stayCostPerNight', v)} />
                    </Field>
                </Section>

                {/* Budget */}
                <Section title="Chi phí">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Giá người lớn">
                            <CurrencyInput value={form.adultPrice ?? 0} onChange={v => set('adultPrice', v)} />
                        </Field>
                        <Field label="Giá trẻ em">
                            <CurrencyInput value={form.childPrice ?? 0} onChange={v => set('childPrice', v)} />
                        </Field>
                        <Field label="Số người lớn">
                            <input type="number" min="1" value={form.adults ?? 2} onChange={e => set('adults', Number(e.target.value))} className="input-field" />
                        </Field>
                        <Field label="Số trẻ em">
                            <input type="number" min="0" value={form.children ?? 0} onChange={e => set('children', Number(e.target.value))} className="input-field" />
                        </Field>
                    </div>
                    <Field label="Ăn uống / ngày">
                        <CurrencyInput value={form.foodBudgetPerDay ?? 0} onChange={v => set('foodBudgetPerDay', v)} />
                    </Field>
                </Section>

                {/* Activities & Food */}
                <Section title="Hoạt động & Ẩm thực">
                    <Field label="Hoạt động nổi bật">
                        <TagInput tags={form.activities ?? []} onChange={tags => set('activities', tags)} placeholder="Tràng An..." />
                    </Field>
                    <Field label="Ẩm thực nên thử">
                        <TagInput tags={form.food ?? []} onChange={tags => set('food', tags)} placeholder="Cơm cháy..." />
                    </Field>
                </Section>

                {/* Sub-locations — only for existing locations */}
                {location && (
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
                                            <span className="text-slate-500 ml-2 text-[10px]">· {sub.durationMinutes} phút</span>
                                        </span>
                                        <button
                                            onClick={e => { e.stopPropagation(); void handleDeleteSub(sub.id); }}
                                            className="text-slate-600 hover:text-red-400 text-sm leading-none ml-2"
                                        >×</button>
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
                )}
            </div>

            <div className="p-4 border-t border-white/10">
                <button
                    onClick={handleSave}
                    disabled={!form.name?.trim()}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl transition-colors"
                >
                    {location ? 'Lưu thay đổi' : 'Thêm địa điểm'}
                </button>
            </div>
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

function VexereButton({ from, to, arriveInput }: { from: string; to: string; arriveInput: string }) {
    const [minPrice, setMinPrice] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setMinPrice(null);
        if (!from || !to || !arriveInput) return;
        const d = new Date(arriveInput);
        if (Number.isNaN(d.getTime())) return;

        const isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        setLoading(true);
        fetch(`/api/vexere-link/trips?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${isoDate}&sort=fare:asc&pagesize=1`)
            .then(r => r.ok ? r.json() as Promise<{ trips: TripResult[] }> : Promise.reject())
            .then(data => {
                const trip = data.trips?.[0];
                if (trip) setMinPrice(trip.priceDiscount || trip.priceOriginal);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [from, to, arriveInput]);

    if (!from || !to) return null;

    return (
        <p className="text-xs text-slate-500 mt-1">
            Vexere {from} → {to}:{' '}
            {loading ? 'đang tải...' : minPrice != null
                ? <span className="text-slate-400">từ {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(minPrice)}</span>
                : <span>—</span>
            }
        </p>
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
    name: string; lat: string; lng: string; durationMinutes: string; description: string; adultPrice: string; childPrice: string;
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
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Giá người lớn (VND)</label>
                    <input type="number" min="0" value={form.adultPrice} onChange={e => setForm(f => ({ ...f, adultPrice: e.target.value }))} className="input-field" placeholder="50000" />
                </div>
                <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Giá trẻ em (VND)</label>
                    <input type="number" min="0" value={form.childPrice} onChange={e => setForm(f => ({ ...f, childPrice: e.target.value }))} className="input-field" placeholder="30000" />
                </div>
            </div>
            <div>
                <label className="block text-[10px] text-slate-500 mb-1">Mô tả</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-field resize-none" placeholder="Chi tiết..." />
            </div>
        </div>
    );
}
