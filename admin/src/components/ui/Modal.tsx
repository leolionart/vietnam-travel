import type { ReactNode } from 'react';

interface Props {
    title: string;
    onClose: () => void;
    children: ReactNode;
}

export function Modal({ title, onClose, children }: Props) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl">
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                    <h2 className="font-bold text-white">{title}</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
}
