import { useState } from 'react';

interface Props {
    onConfirm: () => void;
    label?: string;
    confirmLabel?: string;
}

/** Inline pop-confirm — shows a small confirmation row right next to the delete button */
export function PopConfirm({ onConfirm, label = 'Xóa', confirmLabel = 'Xóa' }: Props) {
    const [open, setOpen] = useState(false);

    if (!open) {
        return (
            <button
                onClick={e => { e.stopPropagation(); setOpen(true); }}
                className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/30 text-red-400/50 hover:text-red-400 text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
            >
                {label}
            </button>
        );
    }

    return (
        <div
            className="flex items-center gap-1.5"
            onClick={e => e.stopPropagation()}
        >
            <button
                onClick={() => setOpen(false)}
                className="px-2.5 py-1.5 bg-white/8 hover:bg-white/12 text-slate-400 text-xs rounded-lg transition-colors whitespace-nowrap"
            >
                Huỷ
            </button>
            <button
                onClick={() => { setOpen(false); onConfirm(); }}
                className="px-2.5 py-1.5 bg-red-500/80 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
                {confirmLabel}
            </button>
        </div>
    );
}
