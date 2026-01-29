import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Loader2, Database, RefreshCw, AlertCircle } from 'lucide-react';
import AuthView from '../components/setting/AuthView';
import { useAppController } from './useAppController';
import { AppLayout } from './AppLayout';
import { ToastProvider } from '../contexts/ToastContext';

const DbConnectionLostModal: React.FC = () => (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-neutral-950/90 backdrop-blur-md animate-in fade-in duration-500">
        <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl border-2 border-neutral-100 overflow-hidden animate-in zoom-in-95 duration-500">
            <div className="bg-neutral-900 p-8 text-white text-center space-y-4">
                <div className="mx-auto w-20 h-20 bg-white/10 rounded-full flex items-center justify-center border-4 border-white/20 mb-2 relative">
                    <Database size={40} className="animate-pulse" />
                    <div className="absolute -top-1 -right-1 bg-red-500 rounded-full p-1 border-2 border-neutral-900">
                        <AlertCircle size={14} />
                    </div>
                </div>
                <h3 className="text-2xl font-black tracking-tighter uppercase">Connection Lost</h3>
            </div>
            
            <div className="p-10 text-center space-y-6">
                <div className="space-y-3">
                    <p className="text-lg font-black text-neutral-900 leading-tight">Database link interrupted</p>
                    <p className="text-neutral-500 text-sm leading-relaxed font-medium">
                        The connection to your local storage was closed unexpectedly by the browser. 
                        <br/><br/>
                        Don't worry, <strong>your data is safe</strong>. Refreshing the application will restore the connection immediately.
                    </p>
                </div>

                <button 
                    onClick={() => window.location.reload()}
                    className="w-full py-5 bg-neutral-900 text-white rounded-2xl font-black text-sm hover:bg-neutral-800 transition-all shadow-xl shadow-neutral-900/20 active:scale-95 flex items-center justify-center space-x-3"
                >
                    <RefreshCw size={20} />
                    <span>REFRESH APPLICATION</span>
                </button>
            </div>
            
            <div className="bg-neutral-50 px-8 py-4 flex items-center justify-center space-x-2 border-t border-neutral-100">
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Safe Persistent Storage</span>
            </div>
        </div>
    </div>
);

const AppContent: React.FC = () => {
  const controller = useAppController();
  const { isLoaded, isResetting, resetStep, view, currentUser, handleLogin } = controller;
  const [isDbLost, setIsDbLost] = useState(false);

  useEffect(() => {
    const handleDbLost = () => setIsDbLost(true);
    window.addEventListener('db-connection-lost', handleDbLost);
    return () => window.removeEventListener('db-connection-lost', handleDbLost);
  }, []);

  if (isDbLost) {
      return <DbConnectionLostModal />;
  }

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
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
};

export default App;