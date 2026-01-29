
import React, { useMemo } from 'react';
import { Lesson } from '../../app/types';
import { ArrowLeft, Edit3 } from 'lucide-react';
import { parseMarkdown } from '../../utils/markdownParser';

interface Props {
  lesson: Lesson;
  onComplete: () => void;
  onEdit: () => void;
}

export const LessonPracticeViewUI: React.FC<Props> = ({ lesson, onComplete, onEdit }) => {
    const contentHtml = useMemo(() => {
        return parseMarkdown(lesson.content);
    }, [lesson.content]);

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
            {/* Header */}
            <header className="flex items-start justify-between">
                <div className="flex flex-col gap-4">
                    <button onClick={onComplete} className="w-fit flex items-center space-x-2 text-xs font-bold text-neutral-400 hover:text-neutral-900 transition-colors uppercase tracking-wider">
                        <ArrowLeft size={14} /><span>Back to Library</span>
                    </button>
                    <div className="space-y-1">
                        <h2 className="text-3xl font-black text-neutral-900 tracking-tight">{lesson.title}</h2>
                        {lesson.description && <p className="text-neutral-500 font-medium">{lesson.description}</p>}
                    </div>
                </div>
                <button onClick={onEdit} className="p-2.5 bg-white border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 hover:text-neutral-900 transition-all shadow-sm active:scale-95" title="Edit Lesson">
                    <Edit3 size={18} />
                </button>
            </header>

            {/* Content Area */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm min-h-[400px]">
                 <div 
                    className="prose prose-sm max-w-none prose-headings:font-black prose-headings:text-neutral-900 prose-p:text-neutral-600 prose-p:leading-relaxed prose-img:rounded-xl prose-img:shadow-md prose-strong:text-neutral-900 prose-a:text-indigo-600"
                    dangerouslySetInnerHTML={{ __html: contentHtml }}
                />
            </div>
        </div>
    );
};
    