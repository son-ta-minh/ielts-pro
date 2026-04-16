import React, { useEffect, useMemo, useState } from 'react';
import { Download, Eye, EyeOff, FileJson, Loader2, Pencil, Plus, Search, Tag, Trash2, Upload } from 'lucide-react';
import { QuestionBankItem, User } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { useToast } from '../../contexts/ToastContext';
import { parseMarkdown } from '../../utils/markdownParser';

interface Props {
  user: User;
}

interface EditorState {
  question: string;
  answer: string;
  tags: string;
  note: string;
  sourceFile: string;
}

type JsonPayload = {
  questionBankItems?: QuestionBankItem[];
  qb?: QuestionBankItem[];
};

const PAGE_SIZES = [10, 25, 50];

const createEmptyEditor = (): EditorState => ({
  question: '',
  answer: '',
  tags: '',
  note: '',
  sourceFile: ''
});

const normalizeTags = (raw: string): string[] =>
  Array.from(
    new Set(
      raw
        .split(/[,\n]/)
        .map(tag => tag.trim())
        .filter(Boolean)
    )
  );

const stripMarkdown = (value: string): string =>
  value
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
    .replace(/[`*_#>|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const formatTimestamp = (value: number): string => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '-';
  }
};

const EditorModal: React.FC<{
  isOpen: boolean;
  item: QuestionBankItem | null;
  form: EditorState;
  onChange: (patch: Partial<EditorState>) => void;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
}> = ({ isOpen, item, form, onChange, onClose, onSave, isSaving }) => {
  const previewHtml = useMemo(
    () => parseMarkdown(form.answer || '_No answer preview yet._'),
    [form.answer]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-[2rem] bg-white border border-neutral-200 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100">
          <div>
            <h2 className="text-xl font-black text-neutral-900">{item ? 'Edit Question' : 'Add Question'}</h2>
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Markdown answer + tags + notes</p>
          </div>
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-neutral-100 text-xs font-black text-neutral-600 hover:bg-neutral-200 transition-colors">
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 max-h-[calc(92vh-148px)] overflow-y-auto">
          <div className="p-6 space-y-5 border-r border-neutral-100">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Question</label>
              <textarea
                value={form.question}
                onChange={(e) => onChange({ question: e.target.value })}
                rows={5}
                className="w-full px-4 py-3 rounded-2xl border border-neutral-200 text-sm font-medium text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
                placeholder="Enter question..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Answer (Markdown)</label>
              <textarea
                value={form.answer}
                onChange={(e) => onChange({ answer: e.target.value })}
                rows={11}
                className="w-full px-4 py-3 rounded-2xl border border-neutral-200 text-sm font-medium text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
                placeholder="Write answer in markdown..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Tags</label>
                <textarea
                  value={form.tags}
                  onChange={(e) => onChange({ tags: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 rounded-2xl border border-neutral-200 text-sm font-medium text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="ielts, task 2, speaking"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Source file</label>
                <input
                  value={form.sourceFile}
                  onChange={(e) => onChange({ sourceFile: e.target.value })}
                  className="w-full px-4 py-3 rounded-2xl border border-neutral-200 text-sm font-medium text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="questions.json"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Note</label>
              <textarea
                value={form.note}
                onChange={(e) => onChange({ note: e.target.value })}
                rows={5}
                className="w-full px-4 py-3 rounded-2xl border border-neutral-200 text-sm font-medium text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
                placeholder="Optional note..."
              />
            </div>
          </div>

          <div className="p-6 bg-neutral-50/70 space-y-4">
            <div>
              <h3 className="text-sm font-black text-neutral-900 uppercase tracking-widest">Preview</h3>
              <p className="text-xs font-medium text-neutral-500">Rendered answer preview using the app markdown parser.</p>
            </div>
            <div className="min-h-[420px] rounded-[1.5rem] border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="prose prose-sm max-w-none prose-headings:font-black prose-p:text-neutral-700 prose-strong:text-neutral-900 [&_ul]:pl-5 [&_li]:mb-1" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-5 border-t border-neutral-100">
          <button onClick={onClose} className="px-5 py-3 rounded-2xl bg-neutral-100 text-sm font-black text-neutral-600 hover:bg-neutral-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="px-5 py-3 rounded-2xl bg-neutral-900 text-white text-sm font-black hover:bg-neutral-800 disabled:opacity-60 transition-colors inline-flex items-center gap-2"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            <span>{item ? 'Save changes' : 'Create record'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const QuestionBankPage: React.FC<Props> = ({ user }) => {
  const { showToast } = useToast();
  const [items, setItems] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('ALL');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<QuestionBankItem | null>(null);
  const [editorForm, setEditorForm] = useState<EditorState>(createEmptyEditor());
  const [isSaving, setIsSaving] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await db.getQuestionBankItemsByUserId(user.id);
      setItems(data.sort((a, b) => b.updatedAt - a.updatedAt));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user.id]);

  useEffect(() => {
    const handleRefresh = () => {
      loadData(true);
    };

    window.addEventListener('datastore-updated', handleRefresh);
    return () => window.removeEventListener('datastore-updated', handleRefresh);
  }, [user.id]);

  const tagOptions = useMemo(() => {
    const unique = new Set<string>();
    items.forEach(item => item.tags.forEach(tag => unique.add(tag)));
    return ['ALL', ...Array.from(unique).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter(item => {
      if (selectedTag !== 'ALL' && !item.tags.includes(selectedTag)) return false;
      if (!normalizedQuery) return true;

      const haystack = [
        item.question,
        item.answer,
        item.note,
        item.sourceFile || '',
        item.tags.join(' ')
      ].join(' ').toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [items, query, selectedTag]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pagedItems = useMemo(() => {
    const start = currentPage * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  useEffect(() => {
    setPage(0);
  }, [query, selectedTag, pageSize]);

  const openCreate = () => {
    setEditingItem(null);
    setEditorForm(createEmptyEditor());
    setIsEditorOpen(true);
  };

  const openEdit = (item: QuestionBankItem) => {
    setEditingItem(item);
    setEditorForm({
      question: item.question,
      answer: item.answer,
      tags: item.tags.join(', '),
      note: item.note,
      sourceFile: item.sourceFile || ''
    });
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingItem(null);
    setEditorForm(createEmptyEditor());
  };

  const handleSave = async () => {
    if (!editorForm.question.trim()) {
      showToast('Question is required.', 'error');
      return;
    }
    if (!editorForm.answer.trim()) {
      showToast('Answer is required.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const now = Date.now();
      const payload: QuestionBankItem = editingItem
        ? {
            ...editingItem,
            question: editorForm.question.trim(),
            answer: editorForm.answer.trim(),
            tags: normalizeTags(editorForm.tags),
            note: editorForm.note.trim(),
            sourceFile: editorForm.sourceFile.trim() || undefined,
            updatedAt: now
          }
        : {
            id: `qb-${now}-${Math.random().toString(36).slice(2, 8)}`,
            userId: user.id,
            question: editorForm.question.trim(),
            answer: editorForm.answer.trim(),
            tags: normalizeTags(editorForm.tags),
            note: editorForm.note.trim(),
            sourceFile: editorForm.sourceFile.trim() || undefined,
            createdAt: now,
            updatedAt: now
          };

      await dataStore.saveQuestionBankItem(payload);
      await loadData(true);
      closeEditor();
      showToast(editingItem ? 'Question updated.' : 'Question created.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Could not save question.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await dataStore.deleteQuestionBankItem(id);
      await loadData(true);
      showToast('Question deleted.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Could not delete question.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleExport = () => {
    const payload = {
      v: 1,
      ca: new Date().toISOString(),
      questionBankItems: items
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `question-bank-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as JsonPayload | QuestionBankItem[];
      const incoming = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.questionBankItems)
          ? parsed.questionBankItems
          : Array.isArray(parsed.qb)
            ? parsed.qb
            : [];

      if (incoming.length === 0) {
        showToast('No question bank records found in JSON.', 'error');
        return;
      }

      const now = Date.now();
      const normalized: QuestionBankItem[] = incoming
        .filter(item => item && item.question && item.answer)
        .map((item, index) => ({
          id: item.id || `qb-import-${now}-${index}`,
          userId: user.id,
          question: String(item.question).trim(),
          answer: String(item.answer).trim(),
          tags: Array.isArray(item.tags) ? item.tags.map(tag => String(tag).trim()).filter(Boolean) : [],
          note: String(item.note || '').trim(),
          sourceFile: String(item.sourceFile || file.name || '').trim() || undefined,
          createdAt: item.createdAt || now,
          updatedAt: now
        }));

      await db.bulkSaveQuestionBankItems(normalized);
      await loadData(true);
      window.dispatchEvent(new CustomEvent('vocab-pro-trigger-backup'));
      showToast(`Imported ${normalized.length} questions.`, 'success');
    } catch (error) {
      console.error(error);
      showToast('Could not import JSON file.', 'error');
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-50 text-orange-700 border border-orange-200 text-xs font-black uppercase tracking-widest">
            <FileJson size={14} />
            <span>Question Bank</span>
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-neutral-900">Question bank</h1>
            <p className="text-sm font-medium text-neutral-500">Questions and markdown answers in a searchable table with dynamic tags, pagination, and JSON sync.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="px-4 py-3 rounded-2xl bg-white border border-neutral-200 text-sm font-black text-neutral-700 hover:bg-neutral-50 inline-flex items-center gap-2 cursor-pointer shadow-sm">
            <Upload size={16} />
            <span>Import JSON</span>
            <input type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
          </label>
          <button onClick={handleExport} className="px-4 py-3 rounded-2xl bg-white border border-neutral-200 text-sm font-black text-neutral-700 hover:bg-neutral-50 inline-flex items-center gap-2 shadow-sm">
            <Download size={16} />
            <span>Export JSON</span>
          </button>
          <button onClick={openCreate} className="px-4 py-3 rounded-2xl bg-neutral-900 text-white text-sm font-black hover:bg-neutral-800 inline-flex items-center gap-2 shadow-sm">
            <Plus size={16} />
            <span>Add record</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-neutral-200 shadow-sm p-5 md:p-6 space-y-5">
        <div className="flex flex-col xl:flex-row gap-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search question, answer, tag, note..."
              className="w-full pl-10 pr-4 py-3 rounded-2xl border border-neutral-200 bg-neutral-50 text-sm font-bold text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-100 text-neutral-500 text-xs font-black uppercase tracking-widest">
              <Tag size={14} />
              <span>Tag filter</span>
            </div>
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="px-3 py-3 rounded-2xl border border-neutral-200 bg-white text-sm font-bold text-neutral-700 outline-none focus:ring-2 focus:ring-neutral-900"
            >
              {tagOptions.map(tag => (
                <option key={tag} value={tag}>
                  {tag === 'ALL' ? 'All tags' : tag}
                </option>
              ))}
            </select>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-3 py-3 rounded-2xl border border-neutral-200 bg-white text-sm font-bold text-neutral-700 outline-none focus:ring-2 focus:ring-neutral-900"
            >
              {PAGE_SIZES.map(size => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tagOptions.slice(0, 16).map(tag => {
            const isActive = selectedTag === tag;
            return (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-3 py-2 rounded-full border text-xs font-black transition-colors ${isActive ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'}`}
              >
                {tag === 'ALL' ? 'All tags' : tag}
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto rounded-[1.5rem] border border-neutral-200">
          <table className="w-full min-w-[1100px]">
            <thead className="bg-neutral-50">
              <tr className="text-left">
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">Question</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">Answer</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">Tags</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">Note</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">Updated</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <div className="inline-flex items-center gap-3 text-neutral-400 font-bold">
                      <Loader2 size={18} className="animate-spin" />
                      <span>Loading question bank...</span>
                    </div>
                  </td>
                </tr>
              ) : pagedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-sm font-medium text-neutral-400">
                    No records match the current filters.
                  </td>
                </tr>
              ) : (
                pagedItems.map(item => {
                  const isPreviewOpen = previewId === item.id;
                  const answerText = stripMarkdown(item.answer);
                  return (
                    <React.Fragment key={item.id}>
                      <tr className="align-top hover:bg-neutral-50/60 transition-colors">
                        <td className="px-4 py-4">
                          <div className="max-w-[320px]">
                            <div className="text-sm font-bold text-neutral-900 whitespace-pre-wrap">{item.question}</div>
                            {item.sourceFile && (
                              <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">{item.sourceFile}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="max-w-[360px] text-sm font-medium text-neutral-600 leading-relaxed">
                            {answerText ? `${answerText.slice(0, 180)}${answerText.length > 180 ? '...' : ''}` : '-'}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="max-w-[180px] flex flex-wrap gap-2">
                            {item.tags.length > 0 ? item.tags.map(tag => (
                              <span key={`${item.id}-${tag}`} className="px-2 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200 text-[10px] font-black uppercase tracking-widest">
                                {tag}
                              </span>
                            )) : (
                              <span className="text-xs font-bold text-neutral-300">No tags</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="max-w-[220px] text-sm font-medium text-neutral-600 whitespace-pre-wrap">{item.note || '-'}</div>
                        </td>
                        <td className="px-4 py-4 text-xs font-bold text-neutral-400 whitespace-nowrap">{formatTimestamp(item.updatedAt)}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setPreviewId(isPreviewOpen ? null : item.id)}
                              className="p-2 rounded-xl bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors"
                              title={isPreviewOpen ? 'Hide preview' : 'Show preview'}
                            >
                              {isPreviewOpen ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                            <button onClick={() => openEdit(item)} className="p-2 rounded-xl bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors" title="Edit">
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              disabled={deletingId === item.id}
                              className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-60 transition-colors"
                              title="Delete"
                            >
                              {deletingId === item.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isPreviewOpen && (
                        <tr className="bg-neutral-50/70">
                          <td colSpan={6} className="px-4 py-5">
                            <div className="rounded-[1.5rem] border border-neutral-200 bg-white p-5">
                              <div className="prose prose-sm max-w-none prose-headings:font-black prose-p:text-neutral-700 prose-strong:text-neutral-900 [&_ul]:pl-5 [&_li]:mb-1" dangerouslySetInnerHTML={{ __html: parseMarkdown(item.answer) }} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Total {filteredItems.length} records</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(prev => Math.max(0, prev - 1))}
              disabled={currentPage === 0}
              className="px-4 py-2 rounded-xl bg-white border border-neutral-200 text-xs font-black text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-colors"
            >
              Prev
            </button>
            <div className="px-4 py-2 rounded-xl bg-neutral-100 text-xs font-black text-neutral-600 uppercase tracking-widest">
              Page {currentPage + 1} / {totalPages}
            </div>
            <button
              onClick={() => setPage(prev => Math.min(totalPages - 1, prev + 1))}
              disabled={currentPage >= totalPages - 1}
              className="px-4 py-2 rounded-xl bg-white border border-neutral-200 text-xs font-black text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <EditorModal
        isOpen={isEditorOpen}
        item={editingItem}
        form={editorForm}
        onChange={(patch) => setEditorForm(prev => ({ ...prev, ...patch }))}
        onClose={closeEditor}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </div>
  );
};

export default QuestionBankPage;
