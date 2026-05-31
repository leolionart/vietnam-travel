import { useState, useCallback, useEffect } from 'react';
import { LoginPage } from './components/auth/LoginPage.js';
import { api, clearToken, isLoggedIn } from './api/client.js';

const DEFAULT_ADMIN_PLAN_SLUG = 'ha-noi-nghe-an-ninh-binh-ha-long-ha-noi';

function adminViewerUrl(): string {
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('return');
    if (returnTo?.startsWith('/')) return returnTo;

    const pathPlanMatch = window.location.pathname.match(/^\/admin\/plans\/([^/]+)/);
    const slug = params.get('slug') || params.get('plan') || (pathPlanMatch ? decodeURIComponent(pathPlanMatch[1]) : DEFAULT_ADMIN_PLAN_SLUG);
    return `/calendar?slug=${encodeURIComponent(slug)}&admin=1`;
}

export function App() {
    const [loggedIn, setLoggedIn] = useState(isLoggedIn());
    const [checkingAuth, setCheckingAuth] = useState(isLoggedIn());

    const redirectToViewer = useCallback(() => {
        window.location.replace(adminViewerUrl());
    }, []);

    const handleLogin = useCallback(() => {
        setLoggedIn(true);
        redirectToViewer();
    }, [redirectToViewer]);

    useEffect(() => {
        if (!isLoggedIn()) {
            setCheckingAuth(false);
            return;
        }
        api.me()
            .then(() => {
                setLoggedIn(true);
                redirectToViewer();
            })
            .catch(() => {
                clearToken();
                setLoggedIn(false);
            })
            .finally(() => setCheckingAuth(false));
    }, []);

    if (checkingAuth) {
        return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">Đang kiểm tra đăng nhập...</div>;
    }

    if (!loggedIn) {
        return <LoginPage onLogin={handleLogin} />;
    }

    return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">Đang mở calendar admin...</div>;
}
