
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, CalendarEvent } from '../../app/types';
import * as db from '../../app/db';
import { useToast } from '../../contexts/ToastContext';
import { ChevronLeft, ChevronRight, Plus, Edit3, Trash2, X, Save, Calendar, Loader2 } from 'lucide-react';
import ConfirmationModal from '../../components/common/ConfirmationModal';

// --- Helper Functions for Date Manipulation ---
const getMonthName = (monthIndex: number) => new Date(0, monthIndex).toLocaleString('en-US', { month: 'long' });
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay(); // 0=Sun, 1=Mon...

// --- Event Modal Component ---
interface EventModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (event: Partial<CalendarEvent>) => void;
    onDelete?: (id: string) => void;
    initialEvent?: CalendarEvent | null;
    initialDate?: Date;
}

const EventModal: React.FC<EventModalProps> = ({ isOpen, onClose, onSave, onDelete, initialEvent, initialDate }) => {
    const [title, setTitle] = useState('');
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState<'blue' | 'green' | 'purple' | 'orange' | 'red'>('blue');

    useEffect(() => {
        if (isOpen) {
            if (initialEvent) {
                setTitle(initialEvent.title);
                setStart(new Date(initialEvent.start).toISOString().slice(0, 16));
                setEnd(new Date(initialEvent.end).toISOString().slice(0, 16));
                setDescription(initialEvent.description || '');
                setColor(initialEvent.color);
            } else if (initialDate) {
                const startDate = new Date(initialDate);
                startDate.setHours(9, 0); // Default to 9 AM
                const endDate = new Date(startDate);
                endDate.setHours(10, 0); // Default 1 hour duration
                
                setTitle('');
                setStart(startDate.toISOString().slice(0, 16));
                setEnd(endDate.toISOString().slice(0, 16));
                setDescription('');
                setColor('blue');
            }
        }
    }, [isOpen, initialEvent, initialDate]);

    const handleSubmit = () => {
        if (!title.trim() || !start || !end) return;
        onSave({
            id: initialEvent?.id,
            title: title.trim(),
            start: new Date(start).getTime(),
            end: new Date(end).getTime(),
            description: description.trim(),
            color
        });
    };
    
    const colors: ('blue' | 'green' | 'purple' | 'orange' | 'red')[] = ['blue', 'green', 'purple', 'orange', 'red'];
    const colorClasses = {
        blue: 'bg-blue-500', green: 'bg-green-500', purple: 'bg-purple-500', orange: 'bg-orange-500', red: 'bg-red-500'
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start">
                    <div><h3 className="text-xl font-black text-neutral-900">{initialEvent ? 'Edit Event' : 'New Study Event'}</h3></div>
                    <button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                <main className="p-8 space-y-4">
                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event Title (e.g., IELTS Speaking Practice)" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-bold text-lg" required autoFocus />
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold text-neutral-500">Start Time</label><input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className="w-full mt-1 px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium" /></div>
                        <div><label className="text-xs font-bold text-neutral-500">End Time</label><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className="w-full mt-1 px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium" /></div>
                    </div>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)..." rows={3} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm resize-none" />
                    <div className="flex items-center gap-3">
                        {colors.map(c => (
                            <button key={c} onClick={() => setColor(c)} className={`w-8 h-8 rounded-full ${colorClasses[c]} transition-all ${color === c ? 'ring-2 ring-offset-2 ring-neutral-900 scale-110' : 'opacity-50 hover:opacity-100'}`} />
                        ))}
                    </div>
                </main>
                <footer className="px-8 py-6 border-t border-neutral-100 flex justify-between items-center bg-neutral-50/50 rounded-b-[2.5rem]">
                    {initialEvent && onDelete ? (
                        <button onClick={() => onDelete(initialEvent.id)} className="px-4 py-2 text-red-600 font-bold text-xs flex items-center gap-2 hover:bg-red-50 rounded-lg"><Trash2 size={14}/> Delete</button>
                    ) : <div />}
                    <button onClick={handleSubmit} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save</button>
                </footer>
            </div>
        </div>
    );
};

// --- Month View Component ---
interface MonthViewProps {
    currentDate: Date;
    events: CalendarEvent[];
    onDayClick: (date: Date) => void;
    onEventClick: (event: CalendarEvent) => void;
}

const MonthView: React.FC<MonthViewProps> = ({ currentDate, events, onDayClick, onEventClick }) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const paddingDays = Array.from({ length: firstDay }, (_, i) => i);
    
    const colorClasses = {
        blue: 'bg-blue-500 hover:bg-blue-600', green: 'bg-green-500 hover:bg-green-600', purple: 'bg-purple-500 hover:bg-purple-600', orange: 'bg-orange-500 hover:bg-orange-600', red: 'bg-red-500 hover:bg-red-600'
    };

    return (
        <div className="grid grid-cols-7 gap-px bg-neutral-200 border border-neutral-200 rounded-2xl overflow-hidden">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="py-2 text-center text-xs font-bold text-neutral-500 bg-neutral-50">{day}</div>
            ))}
            {paddingDays.map(i => <div key={`pad-${i}`} className="bg-neutral-50/50 min-h-[120px]"></div>)}
            {days.map(day => {
                const date = new Date(year, month, day);
                const isToday = isCurrentMonth && day === today.getDate();
                
                const dayEvents = events.filter(e => {
                    const start = new Date(e.start);
                    const end = new Date(e.end);
                    start.setHours(0, 0, 0, 0);
                    end.setHours(23, 59, 59, 999);
                    return date >= start && date <= end;
                }).sort((a,b) => a.start - b.start);

                return (
                    <div key={day} onClick={() => onDayClick(date)} className="bg-white p-2 min-h-[120px] flex flex-col cursor-pointer hover:bg-neutral-50/50 transition-colors">
                        <span className={`self-end font-bold text-sm ${isToday ? 'bg-neutral-900 text-white rounded-full w-7 h-7 flex items-center justify-center' : 'text-neutral-700'}`}>{day}</span>
                        <div className="flex-1 space-y-1 overflow-hidden">
                            {dayEvents.map(event => (
                                <div key={event.id} onClick={(e) => { e.stopPropagation(); onEventClick(event); }} className={`p-1.5 rounded-md text-white text-[10px] font-bold truncate transition-colors ${colorClasses[event.color]}`}>
                                    {event.title}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};


// --- Main Calendar Page ---
interface CalendarPageProps {
  user: User;
}

export const CalendarPage: React.FC<CalendarPageProps> = ({ user }) => {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState<'month' | 'week' | 'day'>('month');
    const [modalState, setModalState] = useState<{ isOpen: boolean; event?: CalendarEvent | null; date?: Date }>({ isOpen: false });
    const [eventToDelete, setEventToDelete] = useState<CalendarEvent | null>(null);
    const { showToast } = useToast();

    const loadEvents = useCallback(async () => {
        setLoading(true);
        const userEvents = await db.getCalendarEventsByUserId(user.id);
        setEvents(userEvents);
        setLoading(false);
    }, [user.id]);

    useEffect(() => { loadEvents(); }, [loadEvents]);

    const handleMonthChange = (offset: number) => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    const handleSaveEvent = async (eventData: Partial<CalendarEvent>) => {
        const now = Date.now();
        const eventToSave: CalendarEvent = {
            id: eventData.id || `cal-${now}-${Math.random()}`,
            userId: user.id,
            title: eventData.title!,
            start: eventData.start!,
            end: eventData.end!,
            description: eventData.description,
            color: eventData.color!,
            createdAt: eventData.id ? (events.find(e => e.id === eventData.id)?.createdAt || now) : now,
            updatedAt: now
        };
        await db.saveCalendarEvent(eventToSave);
        setModalState({ isOpen: false });
        loadEvents();
        showToast(eventData.id ? "Event updated!" : "Event created!", 'success');
    };

    const handleDeleteEvent = async () => {
        if (!eventToDelete) return;
        await db.deleteCalendarEvent(eventToDelete.id);
        setEventToDelete(null);
        setModalState({ isOpen: false });
        loadEvents();
        showToast("Event deleted.", 'success');
    };
    
    return (
        <div className="space-y-6">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Calendar.png" className="w-10 h-10 object-contain" alt="Calendar" />
                    <div>
                        <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Study Calendar</h2>
                        <p className="text-neutral-500 mt-1 font-medium">Plan your learning journey.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setCurrentDate(new Date())} className="px-4 py-2 bg-white border border-neutral-200 text-neutral-600 rounded-lg font-bold text-xs">Today</button>
                    <div className="flex items-center gap-1 bg-white border border-neutral-200 p-1 rounded-lg">
                        <button onClick={() => handleMonthChange(-1)} className="p-1 text-neutral-400 hover:bg-neutral-100 rounded-md"><ChevronLeft size={20}/></button>
                        <button onClick={() => handleMonthChange(1)} className="p-1 text-neutral-400 hover:bg-neutral-100 rounded-md"><ChevronRight size={20}/></button>
                    </div>
                    <h3 className="text-lg font-bold w-48 text-center">{getMonthName(currentDate.getMonth())} {currentDate.getFullYear()}</h3>
                    
                    <div className="flex bg-neutral-100 p-1 rounded-xl">
                        {(['month', 'week', 'day'] as const).map(v => (
                            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === v ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
                        ))}
                    </div>

                    <button onClick={() => setModalState({ isOpen: true, date: new Date() })} className="px-4 py-2 bg-neutral-900 text-white rounded-lg font-bold text-xs flex items-center gap-2"><Plus size={16}/> New Event</button>
                </div>
            </header>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-neutral-300" /></div>
            ) : (
                <>
                    {view === 'month' && <MonthView currentDate={currentDate} events={events} onDayClick={(date) => setModalState({ isOpen: true, date })} onEventClick={(event) => setModalState({ isOpen: true, event })} />}
                    {(view === 'week' || view === 'day') && <div className="text-center py-20 border-2 border-dashed border-neutral-200 rounded-2xl text-neutral-400 font-bold">Week and Day views are coming soon!</div>}
                </>
            )}

            <EventModal 
                isOpen={modalState.isOpen}
                onClose={() => setModalState({ isOpen: false })}
                onSave={handleSaveEvent}
                onDelete={(id) => setEventToDelete(events.find(e => e.id === id) || null)}
                initialEvent={modalState.event}
                initialDate={modalState.date}
            />

            <ConfirmationModal
                isOpen={!!eventToDelete}
                title="Delete Event?"
                message="Are you sure you want to delete this event?"
                confirmText="Delete"
                isProcessing={false}
                onConfirm={handleDeleteEvent}
                onClose={() => setEventToDelete(null)}
                icon={<Trash2 size={40} className="text-red-500"/>}
            />
        </div>
    );
};

export default CalendarPage;
