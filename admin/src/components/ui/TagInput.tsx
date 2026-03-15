import { useState, type KeyboardEvent } from 'react';

interface Props {
    tags: string[];
    onChange: (tags: string[]) => void;
    placeholder?: string;
}

export function TagInput({ tags, onChange, placeholder }: Props) {
    const [input, setInput] = useState('');

    function addTag() {
        const trimmed = input.trim();
        if (trimmed && !tags.includes(trimmed)) {
            onChange([...tags, trimmed]);
        }
        setInput('');
    }

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addTag();
        } else if (e.key === 'Backspace' && !input && tags.length) {
            onChange(tags.slice(0, -1));
        }
    }

    function removeTag(index: number) {
        onChange(tags.filter((_, i) => i !== index));
    }

    return (
        <div className="min-h-[42px] flex flex-wrap gap-1.5 p-2 bg-slate-800 border border-white/10 rounded-xl focus-within:border-blue-500 cursor-text"
            onClick={() => document.getElementById('tag-input')?.focus()}>
            {tags.map((tag, i) => (
                <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-blue-600/30 text-blue-300 rounded-lg text-xs font-medium">
                    {tag}
                    <button type="button" onClick={() => removeTag(i)} className="text-blue-400 hover:text-white leading-none">×</button>
                </span>
            ))}
            <input
                id="tag-input"
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={addTag}
                className="flex-1 min-w-[80px] bg-transparent text-white text-xs placeholder-slate-500 outline-none"
                placeholder={tags.length === 0 ? placeholder : ''}
            />
        </div>
    );
}
