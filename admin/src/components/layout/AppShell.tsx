import { type ReactNode } from 'react';
import { Compass, Globe, LogOut } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { api, clearToken } from '../../api/client.js';

interface Props {
    children: ReactNode;
    onLogout: () => void;
}

export function AppShell({ children, onLogout }: Props) {
    const location = useLocation();

    async function handleLogout() {
        try { await api.logout(); } catch { /* ignore */ }
        clearToken();
        onLogout();
    }

    return (
        <div className="min-h-screen flex flex-col bg-slate-950 text-white">
            <header className="border-b border-white/10 bg-slate-900">
                <div className="h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 sm:gap-6 min-w-0">
                        <Link to="/admin" className="flex items-center gap-3 shrink-0">
                            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                                <span className="text-slate-900 font-bold text-sm">R</span>
                            </div>
                            <div>
                                <p className="font-bold text-sm text-white">Viet Roadtrips</p>
                                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Admin</p>
                            </div>
                        </Link>

                        <nav className="flex items-center">
                            <NavItem to="/admin" label="Kế hoạch" icon={<Compass className="w-4 h-4" />} active={location.pathname === '/admin'} />
                        </nav>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                        <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
                            <Globe className="w-4 h-4" /> Xem trang public
                        </a>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                        >
                            <LogOut className="w-4 h-4" /> Đăng xuất
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 min-h-0">
                {children}
            </main>
        </div>
    );
}

function NavItem({ to, label, icon, active }: { to: string; label: string; icon: ReactNode; active: boolean }) {
    return (
        <Link
            to={to}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
        >
            <span>{icon}</span>
            {label}
        </Link>
    );
}
