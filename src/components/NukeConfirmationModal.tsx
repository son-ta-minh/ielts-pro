import React from 'react';
import { ShieldAlert, Trash2, X, AlertTriangle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const NukeConfirmationModal: React.FC<Props> = ({ isOpen, onConfirm, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-[3rem] shadow-[0_0_50px_rgba(220,38,38,0.3)] border-2 border-red-100 overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="bg-red-600 p-8 text-white text-center space-y-4">
          <div className="mx-auto w-20 h-20 bg-white/20 rounded-full flex items-center justify-center border-4 border-white/30 mb-2">
            <ShieldAlert size={48} />
          </div>
          <h3 className="text-3xl font-black tracking-tighter uppercase">Danger Zone</h3>
        </div>
        
        <div className="p-10 text-center space-y-8">
          <div className="space-y-3">
            <p className="text-xl font-black text-neutral-900 leading-tight">Delete all data?</p>
            <p className="text-neutral-500 text-sm leading-relaxed font-medium">
              This action will permanently delete <span className="text-red-600 font-bold underline">ALL</span> vocabulary, learning history, and user profiles on this device. 
              <br/><br/>
              You will not be able to recover this data after proceeding.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={onConfirm}
              className="w-full py-5 bg-red-600 text-white rounded-2xl font-black text-sm hover:bg-red-700 transition-all shadow-xl shadow-red-200 active:scale-95 flex items-center justify-center space-x-3"
            >
              <Trash2 size={20} />
              <span>YES, DELETE EVERYTHING</span>
            </button>
            <button 
              onClick={onClose}
              className="w-full py-5 bg-neutral-100 text-neutral-500 rounded-2xl font-bold text-sm hover:bg-neutral-200 transition-all active:scale-95"
            >
              Cancel, I want to keep my data
            </button>
          </div>
        </div>
        
        <div className="bg-neutral-50 px-8 py-4 flex items-center justify-center space-x-2 border-t border-neutral-100">
          <AlertTriangle size={14} className="text-red-500" />
          <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">This action cannot be undone</span>
        </div>
      </div>
    </div>
  );
};

export default NukeConfirmationModal;