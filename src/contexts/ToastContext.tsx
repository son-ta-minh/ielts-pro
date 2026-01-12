
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Use a ref to track timeouts to avoid clearing the wrong one if IDs are recycled (though using random IDs prevents this)
  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 3000) => {
    const id = Date.now().toString() + Math.random();
    const newToast: Toast = { id, type, message };
    
    setToasts(prev => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            className={`
              pointer-events-auto flex items-center justify-between p-4 rounded-2xl shadow-xl border backdrop-blur-md animate-in slide-in-from-top-2 fade-in duration-300
              ${toast.type === 'success' ? 'bg-neutral-900/90 text-white border-neutral-800' : ''}
              ${toast.type === 'error' ? 'bg-red-500/90 text-white border-red-600' : ''}
              ${toast.type === 'info' ? 'bg-white/90 text-neutral-900 border-neutral-200' : ''}
            `}
          >
            <div className="flex items-center gap-3">
              {toast.type === 'success' && <CheckCircle2 size={20} className="text-green-400" />}
              {toast.type === 'error' && <AlertCircle size={20} className="text-white" />}
              {toast.type === 'info' && <Info size={20} className="text-blue-500" />}
              <span className="text-sm font-bold leading-tight">{toast.message}</span>
            </div>
            <button onClick={() => removeToast(toast.id)} className="p-1 hover:opacity-70 transition-opacity ml-4">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
