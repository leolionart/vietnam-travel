interface Props {
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({ message, confirmLabel = 'Xóa', onConfirm, onCancel }: Props) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6">
                <p className="text-white text-sm leading-relaxed mb-6">{message}</p>
                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm text-slate-300 bg-white/8 hover:bg-white/12 rounded-xl transition-colors"
                    >
                        Huỷ
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 text-sm text-white bg-red-500/80 hover:bg-red-500 rounded-xl transition-colors font-medium"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
