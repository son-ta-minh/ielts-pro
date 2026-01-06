
import React from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText: string;
  isProcessing: boolean;
  onConfirm: () => void;
  onClose: () => void;
  confirmButtonClass?: string;
  icon?: React.ReactNode;
}

const ConfirmationModal: React.FC<Props> = ({
  isOpen,
  title,
  message,
  confirmText,
  isProcessing,
  onConfirm,
  onClose,
  confirmButtonClass = 'bg-red-600 text-white hover:bg-red-700 shadow-red-200',
  icon = <AlertTriangle size={40} />
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border border-neutral-200 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 text-center space-y-6">
          <div className={`mx-auto w-20 h-20 bg-neutral-50 text-neutral-500 rounded-full flex items-center justify-center border-4 border-white shadow-sm`}>
            {icon}
          </div>
          
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-neutral-900 leading-tight">{title}</h3>
            <p className="text-neutral-500 text-sm leading-relaxed">{message}</p>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              disabled={isProcessing}
              onClick={onConfirm}
              className={`w-full py-4 rounded-2xl font-black text-sm transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-2 disabled:opacity-50 ${confirmButtonClass}`}
            >
              {isProcessing ? <Loader2 size={18} className="animate-spin" /> : null}
              <span>{isProcessing ? "PROCESSING..." : confirmText}</span>
            </button>
            <button 
              disabled={isProcessing}
              onClick={onClose}
              className="w-full py-4 bg-neutral-100 text-neutral-500 rounded-2xl font-bold text-sm hover:bg-neutral-200 transition-all active:scale-95 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
