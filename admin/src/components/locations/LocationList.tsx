import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    arrayMove,
} from '@dnd-kit/sortable';
import type { Location } from '../../types/index.js';
import { SortableLocationCard } from './SortableLocationCard.js';

interface Props {
    locations: Location[];
    onReorder: (orderedIds: number[]) => void;
    onEdit: (loc: Location) => void;
    onDelete: (id: number) => void;
    activeId?: number;
}

export function LocationList({ locations, onReorder, onEdit, onDelete, activeId }: Props) {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIdx = locations.findIndex(l => l.id === active.id);
            const newIdx = locations.findIndex(l => l.id === over.id);
            const reordered = arrayMove(locations, oldIdx, newIdx);
            onReorder(reordered.map(l => l.id));
        }
    }

    if (locations.length === 0) {
        return (
            <div className="text-center py-12 text-slate-500">
                <p className="text-3xl mb-3">📍</p>
                <p>Chưa có địa điểm. Nhấn "+ Thêm địa điểm" để bắt đầu.</p>
            </div>
        );
    }

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={locations.map(l => l.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                    {locations.map((loc, idx) => (
                        <SortableLocationCard
                            key={loc.id}
                            location={loc}
                            index={idx}
                            isActive={loc.id === activeId}
                            onEdit={() => onEdit(loc)}
                            onDelete={() => onDelete(loc.id)}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}
