import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import AuthView from '../components/setting/AuthView';
import { useAppController } from './useAppController';
import { AppLayout } from './AppLayout';
import { ToastProvider } from '../contexts/ToastContext';

const AppContent: React.FC = () => {
  const controller = useAppController();
  const { isLoaded, isResetting, resetStep, view, currentUser, handleLogin } = controller;

  if (!isLoaded) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-white space-y-4">
        <Sparkles size={40} className="text-neutral-900" />
        <p className="text-sm font-bold text-neutral-500">Vocab Pro</p>
      </div>
    );
  }

  if (isResetting) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-white space-y-4">
        <Loader2 size={40} className="text-neutral-900 animate-spin" />
        <p className="text-sm font-bold text-neutral-500">{resetStep}</p>
      </div>
    );
  }

  if (view === 'AUTH' || !currentUser) {
    return <AuthView onLogin={handleLogin} />;
  }

  return <AppLayout controller={controller} />;
};

const App: React.FC = () => {
  const [appKey, setAppKey] = useState(1);

  const forceReload = useCallback(() => {
    setAppKey(k => k + 1);
  }, []);

  useEffect(() => {
    window.addEventListener('force-reload', forceReload);
    return () => {
      window.removeEventListener('force-reload', forceReload);
    };
  }, [forceReload]);

  return (
    <React.StrictMode>
      <ToastProvider>
        <AppContent key={appKey} />
      </ToastProvider>
    </React.StrictMode>
  );
};

export default App;