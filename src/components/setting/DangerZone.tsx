import React from 'react';
import { AlertTriangle, Terminal } from 'lucide-react';

interface DangerZoneProps {
    onOpenClearProgressModal: () => void;
    onOpenNukeModal: () => void;
    isAdmin: boolean;
    onToggleAdmin: () => void;
}

export const DangerZone: React.FC<DangerZoneProps> = ({ onOpenClearProgressModal, onOpenNukeModal, isAdmin, onToggleAdmin }) => {
    return (
        <section className="bg-red-50 p-8 rounded-[2.5rem] border-2 border-red-100 shadow-sm flex flex-col space-y-6">
            <div className="flex items-center space-x-4">
                <div className="p-3 bg-red-100 text-red-600 rounded-2xl"><AlertTriangle size={24} /></div>
                <div>
                    <h3 className="text-xl font-black text-red-900">Danger Zone</h3>
                    <p className="text-xs text-red-500">Actions in this zone are irreversible.</p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={onToggleAdmin} className={`p-4 border-2 rounded-2xl text-left transition-colors group ${isAdmin ? 'bg-neutral-900 border-neutral-900' : 'bg-white border-red-100 hover:border-red-500'}`}>
                    <div className={`font-black flex items-center gap-2 ${isAdmin ? 'text-white' : 'text-red-600'}`}>
                        <Terminal size={16} />
                        {isAdmin ? 'Disable Developer Mode' : 'Enable Developer Mode'}
                    </div>
                    <div className={`text-xs mt-1 ${isAdmin ? 'text-neutral-400' : 'text-neutral-500'}`}>
                        {isAdmin ? 'Admin tools enabled in Discover.' : 'Unlocks cheat tools for testing.'}
                    </div>
                </button>
                <div className="hidden md:block"></div> {/* Spacer */}
                
                <button onClick={onOpenClearProgressModal} className="p-4 bg-white border-2 border-red-100 rounded-2xl text-left hover:border-red-500 transition-colors group">
                    <div className="font-black text-red-600">Clear All Progress</div>
                    <div className="text-xs text-neutral-500 mt-1">Reset all SRS data, but keep your words.</div>
                </button>
                <button onClick={onOpenNukeModal} className="p-4 bg-white border-2 border-red-100 rounded-2xl text-left hover:border-red-500 transition-colors group">
                    <div className="font-black text-red-600">Reset Full Library</div>
                    <div className="text-xs text-neutral-500 mt-1">Delete ALL your data and restore the app to its initial state.</div>
                </button>
            </div>
        </section>
    );
};