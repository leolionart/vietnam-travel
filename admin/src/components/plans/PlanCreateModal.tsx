import { useState } from 'react';
import { api } from '../../api/client.js';
import type { Plan } from '../../types/index.js';
import { Modal } from '../ui/Modal.js';

interface Props {
    onClose: () => void;
    onCreate: (plan: Plan) => void;
}

export function PlanCreateModal({ onClose, onCreate }: Props) {
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    function handleNameChange(value: string) {
        setName(value);
        if (!slug || slug === toSlug(name)) {
            setSlug(toSlug(value));
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim() || !slug.trim()) return;
        setLoading(true);
        setError('');
        try {
            const plan = await api.createPlan({ name: name.trim(), slug: slug.trim() });
            onCreate(plan);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Modal title="Tạo kế hoạch mới" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tên kế hoạch</label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => handleNameChange(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500"
                        placeholder="Hà Nội - Đà Nẵng - Hội An"
                        autoFocus
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Slug (URL)</label>
                    <input
                        type="text"
                        value={slug}
                        onChange={e => setSlug(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                        placeholder="ha-noi-da-nang-hoi-an"
                    />
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <div className="flex gap-3 pt-2">
                    <button type="button" onClick={onClose} className="flex-1 py-2 border border-white/10 hover:bg-white/5 text-white rounded-xl text-sm font-medium transition-colors">
                        Hủy
                    </button>
                    <button type="submit" disabled={loading || !name.trim() || !slug.trim()} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors">
                        {loading ? 'Đang tạo...' : 'Tạo kế hoạch'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function toSlug(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
}
