


/**
 * Lightweight Markdown Parser supporting custom tags:
 * [Audio-VN]text[/] -> Speaker button + text (inline)
 * [HIDDEN: text] -> Reveal button (inline replacement)
 * [Quiz: answer] -> Input field checking against 'answer'
 * [Multi: Correct | Option 2 | Option 3] -> Multiple Choice Buttons (Inline buttons)
 * [Select: Correct | Option 2 | Option 3] -> Dropdown Selection (Locked after check)
 * [Formula: Part | Part] -> Amber box with badges
 * [Tip content] -> Blue info box with lightbulb icon
 */

if (typeof window !== 'undefined') {
    (window as any).checkMarkdownQuiz = (input: HTMLInputElement) => {
        const answer = input.getAttribute('data-answer');
        if (!answer) return;
        
        const userValue = input.value.trim();
        const isCorrect = userValue.toLowerCase() === answer.trim().toLowerCase();
        
        // Remove status classes
        input.classList.remove('border-neutral-300', 'text-neutral-900', 'focus:border-indigo-600');
        input.classList.remove('border-green-500', 'text-green-700', 'bg-green-50');
        input.classList.remove('border-red-500', 'text-red-700', 'bg-red-50');
        
        if (isCorrect) {
             input.classList.add('border-green-500', 'text-green-700', 'bg-green-50');
        } else {
             input.classList.add('border-red-500', 'text-red-700', 'bg-red-50');
        }
    };

    (window as any).checkDropdownQuiz = (btn: HTMLButtonElement) => {
        const container = btn.parentElement;
        if (!container) return;
        
        const select = container.querySelector('select');
        if (!select) return;

        const answer = select.getAttribute('data-answer');
        const userValue = select.value;
        
        // Prevent checking if nothing selected (default value is usually empty or placeholder)
        if (!userValue) return;

        const isCorrect = userValue === answer;

        // Lock the input
        select.disabled = true;
        btn.disabled = true;
        btn.classList.add('opacity-0', 'pointer-events-none'); // Hide check button after checking

        // Remove default styles
        select.classList.remove('border-neutral-300', 'text-neutral-900', 'focus:border-indigo-600');
        select.classList.remove('bg-white');

        if (isCorrect) {
            select.classList.add('border-green-500', 'text-green-700', 'bg-green-50', 'font-bold');
        } else {
            select.classList.add('border-red-500', 'text-red-700', 'bg-red-50', 'line-through');
            
            // Show correct answer tooltip or indicator if needed, 
            // for now, we just mark it red to indicate failure. 
            // Optionally, we could append the correct answer next to it.
            const correction = document.createElement('span');
            correction.className = 'ml-2 text-xs font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-200 animate-in fade-in';
            correction.innerText = answer || '';
            container.appendChild(correction);
        }
    };

    (window as any).checkMultiChoice = (btn: HTMLButtonElement) => {
        const container = btn.parentElement;
        if (!container) return;
        
        const correctAnswer = container.getAttribute('data-answer');
        const userSelection = btn.textContent?.trim();
        
        // Disable all buttons in this group
        const allBtns = container.querySelectorAll('button');
        allBtns.forEach(b => {
            b.disabled = true;
            b.classList.add('opacity-50', 'cursor-not-allowed');
            // Highlight the correct one regardless of selection
            if (b.textContent?.trim() === correctAnswer) {
                b.classList.remove('bg-white', 'text-neutral-700', 'opacity-50');
                b.classList.add('bg-green-500', 'text-white', 'border-green-600');
            }
        });

        if (userSelection === correctAnswer) {
            // User clicked correct
            btn.classList.remove('opacity-50');
            btn.classList.add('ring-2', 'ring-green-300');
        } else {
            // User clicked wrong
            btn.classList.remove('bg-white', 'text-neutral-700', 'opacity-50');
            btn.classList.add('bg-red-500', 'text-white', 'border-red-600');
        }
    };
}

const parseTable = (lines: string[]): { html: string; consumed: number } | null => {
    if (!lines[0].trim().startsWith('|')) return null;

    const tableLines: string[] = [];
    for (const line of lines) {
        if (line.trim().startsWith('|')) {
            tableLines.push(line);
        } else {
            break;
        }
    }

    if (tableLines.length === 0) return null;

    const cleanSplit = (line: string) => {
        const parts = line.split('|');
        if (line.trim().startsWith('|')) parts.shift();
        if (line.trim().endsWith('|')) parts.pop();
        return parts.map(c => c.trim());
    };

    const separatorRegex = /^\|?(\s*:?-+:?\s*\|)+\s*$/;
    
    let hasSeparator = false;
    if (tableLines.length > 1 && separatorRegex.test(tableLines[1].trim())) {
        hasSeparator = true;
    }

    let html = '<div class="overflow-x-auto my-4 border border-neutral-200 rounded-xl shadow-sm"><table class="w-full text-sm text-left border-collapse">';
    
    const headers = cleanSplit(tableLines[0]);
    html += '<thead class="bg-neutral-50 text-neutral-900 uppercase font-bold text-xs"><tr>';
    headers.forEach(h => html += `<th class="px-6 py-3 border-b border-neutral-200 min-w-[100px]">${h}</th>`);
    html += '</tr></thead>';

    html += '<tbody class="divide-y divide-neutral-100 bg-white">';
    
    const startBodyIndex = hasSeparator ? 2 : 1;

    for (let i = startBodyIndex; i < tableLines.length; i++) {
        const cells = cleanSplit(tableLines[i]);
        html += '<tr class="hover:bg-neutral-50/50 transition-colors">';
        for (let j = 0; j < headers.length; j++) {
            const cellContent = cells[j] || '';
            html += `<td class="px-6 py-4 font-medium text-neutral-600 align-top">${cellContent}</td>`;
        }
        html += '</tr>';
    }

    html += '</tbody></table></div>';
    return { html, consumed: tableLines.length };
};

/**
 * Process [HIDDEN: content] into inline reveal buttons
 */
const processSpoilers = (text: string): string => {
    return text.replace(/\[HIDDEN:\s*(.*?)\]/gi, (_, content) => {
        const safeContent = content.trim()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "\\'");

        // Added whitespace-nowrap and flex-nowrap to prevent button breaking layout
        return `<button type="button" onclick="this.outerHTML='<span class=\\'px-1.5 py-0.5 bg-green-50 border border-green-200 text-green-800 rounded-md text-sm font-bold animate-in fade-in zoom-in-95 inline-block align-baseline mx-1\\'>${safeContent}</span>'" class="inline-flex flex-nowrap whitespace-nowrap items-center gap-1.5 px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-md text-[10px] font-black uppercase tracking-wider transition-colors select-none border border-indigo-100 shadow-sm align-middle my-0.5 mx-1"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>Reveal</button>`;
    });
};

/**
 * Process [Quiz: answer]
 */
const processQuiz = (text: string): string => {
    // Regex updated with 'i' flag for case-insensitivity (matches Quiz and QUIZ)
    return text.replace(/\[Quiz:\s*(.*?)\]/gi, (_, answer) => {
        const cleanAnswer = answer.trim();
        const width = Math.max(3, cleanAnswer.length);
        // Using onclick/onkeydown to trigger global function. IMPORTANT: Returns single line string to avoid markdown paragraph splitting.
        return `<span class="inline-flex items-center gap-1 align-middle mx-1 whitespace-nowrap"><input type="text" data-answer="${cleanAnswer.replace(/"/g, '&quot;')}" placeholder="?" class="border-b-2 border-neutral-300 bg-transparent text-center font-bold text-neutral-900 outline-none focus:border-indigo-600 transition-all rounded-t-md px-1 py-0.5 text-sm" style="width: ${width}ch; min-width: 40px;" onkeydown="if(event.key==='Enter') window.checkMarkdownQuiz(this)" /><button onclick="window.checkMarkdownQuiz(this.previousElementSibling)" class="p-1 text-neutral-400 hover:text-indigo-600 transition-colors bg-neutral-100 hover:bg-indigo-50 rounded-full shadow-sm" title="Check Answer"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></button></span>`;
    });
};

/**
 * Process [Select: Correct | Option | Option]
 */
const processDropdown = (text: string): string => {
    return text.replace(/\[Select:\s*(.*?)\]/gi, (_, content) => {
        const parts = content.split('|').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
        if (parts.length < 2) return `[Invalid Select: ${content}]`;

        const correctAnswer = parts[0];
        // Fisher-Yates Shuffle
        const shuffled = [...parts];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        let html = `<span class="inline-flex items-center gap-1 align-middle mx-1 whitespace-nowrap">`;
        html += `<select data-answer="${correctAnswer.replace(/"/g, '&quot;')}" class="border-b-2 border-neutral-300 bg-transparent font-bold text-neutral-900 outline-none focus:border-indigo-600 transition-all rounded-t-md px-2 py-0.5 text-sm cursor-pointer hover:bg-neutral-50 appearance-none pr-6 relative" style="min-width: 80px;">`;
        html += `<option value="" disabled selected>Select...</option>`;
        
        shuffled.forEach(opt => {
             html += `<option value="${opt.replace(/"/g, '&quot;')}">${opt}</option>`;
        });

        html += `</select>`;
        // Check Button
        html += `<button onclick="window.checkDropdownQuiz(this)" class="p-1 text-neutral-400 hover:text-indigo-600 transition-colors bg-neutral-100 hover:bg-indigo-50 rounded-full shadow-sm" title="Check Answer"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></button>`;
        html += `</span>`;
        return html;
    });
};

/**
 * Process [Multi: Correct | Option | Option]
 */
const processMultiChoice = (text: string): string => {
    return text.replace(/\[Multi:\s*(.*?)\]/gi, (_, content) => {
        const parts = content.split('|').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
        if (parts.length < 2) return `[Invalid Multi: ${content}]`;

        const correctAnswer = parts[0];
        const shuffled = [...parts];

        // Fisher-Yates Shuffle ensures true randomness so the first option isn't always the correct one in the UI
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        let html = `<span class="inline-flex flex-wrap items-center gap-1.5 align-middle mx-1" data-answer="${correctAnswer.replace(/"/g, '&quot;')}">`;
        
        shuffled.forEach(opt => {
             html += `<button onclick="window.checkMultiChoice(this)" class="px-2 py-1 bg-white border border-neutral-200 text-neutral-700 rounded-md text-xs font-bold hover:bg-neutral-50 hover:border-neutral-300 transition-all shadow-sm select-none">${opt}</button>`;
        });

        html += `</span>`;
        return html;
    });
};

/**
 * Process [Formula: part1 | part2 | part3]
 */
const processFormula = (text: string): string => {
    return text.replace(/\[Formula:?\s*(.*?)\]/gi, (_, content) => {
        const parts = content.split('|').map((s: string) => s.trim());
        
        let html = `<div class="flex flex-wrap items-center gap-2 p-3 my-3 bg-amber-50 border-l-4 border-amber-400 rounded-r-xl shadow-sm">`;
        html += `<span class="text-[10px] font-black text-amber-500 uppercase tracking-widest mr-1 select-none">Formula</span>`;
        
        parts.forEach(part => {
             if (/^[+,.]+$/.test(part)) {
                 html += `<span class="font-bold text-amber-700">${part}</span>`;
             } else {
                 html += `<span class="px-2 py-1 bg-white border border-amber-200 rounded-lg text-amber-900 font-mono text-sm font-bold shadow-sm">${part}</span>`;
             }
        });

        html += `</div>`;
        return html;
    });
};

/**
 * Process [Audio-XX]...[/] tags
 */
const processAudioBlocks = (text: string): string => {
    // Regex updated to support standard closing tag [/] AND verbose closing tag [/Audio-VN]
    const audioRegex = /\[Audio-(VN|EN)\]([\s\S]*?)\[\/(?:Audio-(?:VN|EN))?\]/gi;
    
    return text.replace(audioRegex, (_, lang, content) => {
        // Clean text for TTS reading (remove markdown, spoiler, emoji)
        const speechText = content
            .replace(/\[HIDDEN:.*?\]/gi, '') 
            .replace(/\[Quiz:.*?\]/gi, '') // remove quiz answer from speech
            .replace(/\[Select:.*?\]/gi, '') // remove dropdown
            .replace(/\[Multi:.*?\]/gi, '') // remove multi quiz
            .replace(/\[Formula:.*?\]/gi, '') // remove formulas
            .replace(/[#*`_~[\]()]/g, '') 
            .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') 
            .replace(/\n/g, ' ') // FIX: Replace newline with space to prevent breaking onclick HTML attribute
            .trim()
            .replace(/'/g, "\\'"); 

        const speakerBtn = `<button onclick="window.handleLessonSpeak('${speechText}')" class="inline-flex items-center justify-center w-6 h-6 mr-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-md transition-all active:scale-90 align-middle shadow-sm" title="Listen"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg></button>`;
        
        return speakerBtn + content.trim();
    });
};

export const parseMarkdown = (text: string): string => {
    if (!text) return '';

    // Normalize literal "\n" strings to actual newlines to support both formats
    // This handles cases where the AI outputs a string literal '\n' instead of a newline char
    const normalized = text.replace(/\\n/g, '\n');

    // 1. Process Audio and Spoilers first (as they can be inline)
    let processed = processAudioBlocks(normalized);
    processed = processQuiz(processed);
    processed = processDropdown(processed); // New: Select
    processed = processMultiChoice(processed); // Process Multi before table to safely replace pipes
    processed = processFormula(processed); // Process Formula
    processed = processSpoilers(processed);
    
    const lines = processed.split('\n');
    const output: string[] = [];
    const listStack: { type: 'ul' | 'ol', indent: number }[] = [];

    const closeLists = (targetLevel: number = 0) => {
        while (listStack.length > targetLevel) {
            const list = listStack.pop();
            output.push(list!.type === 'ul' ? '</ul>' : '</ol>');
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const lineRaw = lines[i];
        const lineTrim = lineRaw.trim();
        
        if (!lineTrim && listStack.length === 0) {
             output.push('<br class="block my-2" />');
             continue;
        }

        const tableResult = parseTable(lines.slice(i));
        if (tableResult) {
            closeLists(0);
            output.push(tableResult.html);
            i += tableResult.consumed - 1;
            continue;
        }

        if (/^([-*_])\s*(\1\s*){2,}$/.test(lineTrim)) {
            closeLists(0);
            output.push('<hr class="my-6 border-t-2 border-neutral-100" />');
            continue;
        }

        if (lineTrim.startsWith('# ')) { 
            closeLists(0);
            output.push(`<h1 class="text-3xl font-black text-neutral-900 mb-4 mt-8 pb-2 border-b border-neutral-100 leading-tight">${lineTrim.substring(2)}</h1>`); 
            continue; 
        }
        if (lineTrim.startsWith('## ')) { 
            closeLists(0);
            output.push(`<h2 class="text-xl font-extrabold text-neutral-800 mb-3 mt-6 leading-tight">${lineTrim.substring(3)}</h2>`); 
            continue; 
        }
        if (lineTrim.startsWith('### ')) { 
            closeLists(0);
            output.push(`<h3 class="text-lg font-bold text-neutral-700 mb-2 mt-4 leading-tight">${lineTrim.substring(4)}</h3>`); 
            continue; 
        }

        if (lineTrim.startsWith('> ')) {
            closeLists(0);
            output.push(`<blockquote class="border-l-4 border-amber-400 bg-amber-50 pl-4 py-3 pr-2 my-4 rounded-r-lg text-sm text-neutral-700 font-medium italic shadow-sm">${lineTrim.substring(2)}</blockquote>`);
            continue;
        }

        // Process [Tip Block] - Exclude Audio, HIDDEN, Quiz, Select, Multi tags (inline forms)
        const tipMatch = lineTrim.match(/^\[(?!(HIDDEN:|Quiz:|Select:|QUIZ:|Multi:|Formula:|Audio-|(\/\])))(.*)\]$/);
        if (tipMatch) {
            closeLists(0);
            const lightbulbSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 mt-0.5 text-sky-500"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`;
            const tipContent = tipMatch[3].trim();
            output.push(`
                <div class="flex items-start gap-3 my-4 p-4 bg-sky-50 border-l-4 border-sky-400 rounded-r-lg shadow-sm">
                    ${lightbulbSvg}
                    <div class="text-sm text-sky-900 font-medium leading-relaxed">
                        ${tipContent}
                    </div>
                </div>
            `);
            continue;
        }
        
        const indentMatch = lineRaw.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[0].length : 0;
        
        // Regex for Unordered list
        const ulMatch = lineRaw.match(/^\s*[-*]\s+(.*)/);
        
        // Regex for Ordered list: Captures the NUMBER specifically
        const olMatch = lineRaw.match(/^\s*(\d+)\.\s+(.*)/);

        if (ulMatch || olMatch) {
            const listType = ulMatch ? 'ul' : 'ol';
            const content = ulMatch ? ulMatch[1] : olMatch![2];
            
            // Only relevant for OL
            const olNumber = olMatch ? olMatch[1] : undefined;
            
            if (listStack.length === 0 || indent > listStack[listStack.length - 1].indent) {
                output.push(listType === 'ul' 
                    ? '<ul class="list-disc list-outside pl-5 my-3 space-y-1 text-neutral-700 marker:text-neutral-400">' 
                    : '<ol class="list-decimal list-outside pl-5 my-3 space-y-1 text-neutral-700 marker:font-bold marker:text-neutral-500">');
                listStack.push({ type: listType, indent });
            } else if (indent < listStack[listStack.length - 1].indent) {
                while (listStack.length > 0 && indent < listStack[listStack.length - 1].indent) {
                    closeLists(listStack.length - 1);
                }
            }
            
            // Explicitly set the 'value' attribute if a number is present.
            // This ensures lists that are interrupted by tips/blocks resume or start at the correct number provided in Markdown.
            if (listType === 'ol' && olNumber) {
                 output.push(`<li value="${olNumber}" class="pl-1">${content}</li>`);
            } else {
                 output.push(`<li class="pl-1">${content}</li>`);
            }
            continue;
        }

        if (lineTrim !== '') {
            closeLists(0);
            output.push(`<p class="mb-2 leading-relaxed text-neutral-600">${lineRaw}</p>`);
        }
    }

    closeLists(0);
    
    return output.join('')
        .replace(/!\[(.*?)\]\((.*?)\)/g, '<img alt="$1" src="$2" class="max-w-full h-auto rounded-lg my-4 shadow-md border border-neutral-200" />')
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-600 font-bold hover:underline">$1</a>')
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-black text-neutral-900">$1</strong>')
        .replace(/\*(.*?)\*/g, '<span class="italic font-normal text-inherit">$1</span>')
        .replace(/`([^`]+)`/g, '<code class="bg-neutral-100 text-pink-600 px-1.5 py-0.5 rounded text-xs font-mono font-bold border border-neutral-200">$1</code>');
};
