import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './components/auth/LoginPage.js';
import { AppShell } from './components/layout/AppShell.js';
import { PlansListPage } from './components/plans/PlansListPage.js';
import { PlanEditPage } from './components/plans/PlanEditPage.js';
import { isLoggedIn } from './api/client.js';

export function App() {
    const [loggedIn, setLoggedIn] = useState(isLoggedIn());

    const handleLogin = useCallback(() => setLoggedIn(true), []);
    const handleLogout = useCallback(() => setLoggedIn(false), []);

    if (!loggedIn) {
        return <LoginPage onLogin={handleLogin} />;
    }

    return (
        <BrowserRouter basename="/admin">
            <AppShell onLogout={handleLogout}>
                <Routes>
                    <Route path="/" element={<PlansListPage />} />
                    <Route path="/plans/:slug" element={<PlanEditPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </AppShell>
        </BrowserRouter>
    );
}
