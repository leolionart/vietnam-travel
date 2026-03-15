interface Props {
    value: number;
    onChange: (value: number) => void;
}

export function CurrencyInput({ value, onChange }: Props) {
    const formatted = new Intl.NumberFormat('vi-VN').format(value);

    function handleChange(raw: string) {
        const digits = raw.replace(/[^\d]/g, '');
        onChange(digits ? Number(digits) : 0);
    }

    return (
        <div className="relative">
            <input
                type="text"
                inputMode="numeric"
                value={formatted}
                onChange={e => handleChange(e.target.value)}
                className="input-field pr-10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">₫</span>
        </div>
    );
}
