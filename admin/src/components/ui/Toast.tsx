interface Props {
    message: string;
    type?: 'success' | 'error';
}

export function Toast({ message, type = 'success' }: Props) {
    return (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl font-medium text-sm shadow-2xl border ${
            type === 'error'
                ? 'bg-red-950 border-red-500/30 text-red-300'
                : 'bg-emerald-950 border-emerald-500/30 text-emerald-300'
        }`}>
            {type === 'error' ? '✗ ' : '✓ '}{message}
        </div>
    );
}
