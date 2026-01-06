import React from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  wordText: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const DeleteConfirmationModal: React.FC<Props> = ({ isOpen, wordText, isDeleting, onConfirm, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border border-neutral-200 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 text-center space-y-6">
          <div className="mx-auto w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center border-4 border-white shadow-sm">
            <AlertTriangle size={40} />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-neutral-900 leading-tight">Delete Word?</h3>
            <p className="text-neutral-500 text-sm leading-relaxed">
              Are you sure you want to permanently delete <span className="font-bold text-neutral-900">"{wordText}"</span>? 
              This action cannot be undone.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              disabled={isDeleting}
              onClick={onConfirm}
              className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-200 active:scale-95 flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
              <span>{isDeleting ? "DELETING..." : "CONFIRM DELETE"}</span>
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