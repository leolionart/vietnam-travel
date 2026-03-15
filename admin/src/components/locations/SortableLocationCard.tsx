import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Location } from '../../types/index.js';
import { PopConfirm } from '../ui/PopConfirm.js';

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
            onClick={onEdit}
            className={`bg-slate-900 border rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-colors ${
                isActive ? 'border-blue-500' : 'border-white/10 hover:border-white/30 hover:bg-slate-800/60'
            }`}
        >
            {/* Drag handle */}
            <div
                {...attributes}
                {...listeners}
                onClick={e => e.stopPropagation()}
                className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 transition-colors px-1 flex-none"
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
                    <h3 className="font-semibold text-white text-sm truncate">{loc.name}</h3>
                    <span className="text-[10px] px-2 py-0.5 bg-white/5 rounded-full text-slate-400 whitespace-nowrap flex-none">{loc.province}</span>
                    {loc.duration > 0 && (
                        <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 rounded-full text-blue-400 whitespace-nowrap flex-none">{loc.duration} ngày</span>
                    )}
                </div>
                <p className="text-slate-500 text-xs mt-1 truncate">{loc.dateRange || 'Chưa có ngày'}</p>
                {loc.highlight && (
                    <p className="text-blue-400/80 text-xs mt-0.5 truncate">{loc.highlight}</p>
                )}
            </div>

            {/* Delete */}
            <div className="flex-none">
                <PopConfirm onConfirm={onDelete} />
            </div>
        </div>
    );
}
