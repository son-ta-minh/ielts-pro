
import React from 'react';
import { AlertTriangle, Trash2, Loader2, Unlink } from 'lucide-react';

interface Props {
  isOpen: boolean;
  wordText: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
  title?: string;
  message?: React.ReactNode;
  confirmText?: string;
  confirmButtonClass?: string;
  icon?: React.ElementType;
  buttonIcon?: React.ElementType;
}

const DeleteConfirmationModal: React.FC<Props> = ({ 
  isOpen, 
  wordText, 
  isDeleting, 
  onConfirm, 
  onClose,
  title = "Delete Word?",
  message,
  confirmText = "CONFIRM DELETE",
  confirmButtonClass = "bg-red-600 text-white hover:bg-red-700 shadow-red-200",
  icon: Icon = AlertTriangle,
  buttonIcon: ButtonIcon = Trash2
}) => {
  if (!isOpen) return null;

  const defaultMessage = (
    <span>
      Are you sure you want to permanently delete <span className="font-bold text-neutral-900">"{wordText}"</span>? 
      This action cannot be undone.
    </span>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border border-neutral-200 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 text-center space-y-6">
          <div className={`mx-auto w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center border-4 border-white shadow-sm ${confirmButtonClass.includes('red') ? 'text-red-500' : 'text-orange-500'}`}>
            <Icon size={40} />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-neutral-900 leading-tight">{title}</h3>
            <p className="text-neutral-500 text-sm leading-relaxed">
              {message || defaultMessage}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              disabled={isDeleting}
              onClick={onConfirm}
              className={`w-full py-4 rounded-2xl font-black text-sm transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-2 disabled:opacity-50 ${confirmButtonClass}`}
            >
              {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <ButtonIcon size={18} />}
              <span>{isDeleting ? "PROCESSING..." : confirmText}</span>
            </button>
            <button 
              disabled={isDeleting}
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

export default DeleteConfirmationModal;
