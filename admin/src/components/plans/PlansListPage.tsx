import { useState, useEffect } from 'react';
import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import type { Plan } from '../../types/index.js';
import { PlanCreateModal } from './PlanCreateModal.js';
import { PopConfirm } from '../ui/PopConfirm.js';

export function PlansListPage() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);

    useEffect(() => {
        api.listPlans().then(setPlans).finally(() => setLoading(false));
    }, []);

    async function handleDelete(slug: string) {
        await api.deletePlan(slug);
        setPlans(prev => prev.filter(p => p.slug !== slug));
    }

    if (loading) {
        return <div className="p-8 text-slate-400">Đang tải...</div>;
    }

    return (
        <div className="p-6 md:p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Kế hoạch du lịch</h1>
                        <p className="text-slate-400 text-sm mt-1">{plans.length} kế hoạch</p>
                    </div>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition-colors"
                    >
                        + Tạo kế hoạch
                    </button>
                </div>

                <div className="space-y-3">
                    {plans.map(plan => (
                        <div key={plan.slug} className="bg-slate-900 border border-white/10 rounded-2xl p-6 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-white">{plan.name}</h2>
                                <p className="text-slate-400 text-sm mt-1">{plan.dateRange || 'Chưa có ngày'}</p>
                                <p className="text-slate-500 text-xs mt-1 font-mono">{plan.slug}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Link
                                    to={`/plans/${plan.slug}`}
                                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors"
                                >
                                    Chỉnh sửa
                                </Link>
                                <PopConfirm onConfirm={() => void handleDelete(plan.slug)} />
                            </div>
                        </div>
                    ))}

                    {plans.length === 0 && (
                        <div className="text-center py-16 text-slate-500">
                            <Compass className="w-10 h-10 mx-auto mb-4 text-slate-500" />
                            <p>Chưa có kế hoạch nào. Hãy tạo kế hoạch đầu tiên!</p>
                        </div>
                    )}
                </div>

                {showCreate && (
                    <PlanCreateModal
                        onClose={() => setShowCreate(false)}
                        onCreate={plan => {
                            setPlans(prev => [...prev, plan]);
                            setShowCreate(false);
                        }}
                    />
                )}
            </div>
        </div>
    );
}
