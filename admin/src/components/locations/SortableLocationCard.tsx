import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Location } from '../../types/index.js';

interface Props {
    location: Location;
    index: number;
    isActive: boolean;
    onEdit: () => void;
    onDelete: () => void;
}

export function SortableLocationCard({ location: loc, index, isActive, onEdit, onDelete }: Props) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: loc.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`bg-slate-900 border rounded-2xl p-4 flex items-center gap-4 transition-colors ${
                isActive ? 'border-blue-500' : 'border-white/10 hover:border-white/20'
            }`}
        >
            {/* Drag handle */}
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 transition-colors px-1"
            >
                ⠿
            </div>

            {/* Index badge */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-none ${
                isActive ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
                {index + 1}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-sm truncate">{loc.name}</h3>
                    <span className="text-[10px] px-2 py-0.5 bg-white/5 rounded-full text-slate-400 whitespace-nowrap">{loc.province}</span>
                </div>
                <p className="text-slate-500 text-xs mt-0.5 truncate">{loc.dateRange || 'Chưa có ngày'}</p>
                <p className="text-slate-500 text-xs truncate">{loc.transport} · {loc.duration} ngày</p>
                {loc.highlight && (
                    <p className="text-blue-400 text-xs mt-1 truncate">{loc.highlight}</p>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-none">
                <button
                    onClick={onEdit}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg transition-colors"
                >
                    Sửa
                </button>
                <button
                    onClick={onDelete}
                    className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium rounded-lg transition-colors"
                >
                    Xóa
                </button>
            </div>
        </div>
    );
}
