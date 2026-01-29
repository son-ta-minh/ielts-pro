const parseTable = (lines: string[]): { html: string; consumed: number } | null => {
    // A table must start with a pipe
    if (!lines[0].trim().startsWith('|')) return null;

    // Identify the contiguous block of lines starting with '|'
    const tableLines: string[] = [];
    for (const line of lines) {
        if (line.trim().startsWith('|')) {
            tableLines.push(line);
        } else {
            break;
        }
    }

    // We arbitrarily decide a table needs at least 1 line (just headers) to be rendered,
    // though typically 2 are expected.
    if (tableLines.length === 0) return null;

    // Helper to split a pipe-delimited line into cells
    const cleanSplit = (line: string) => {
        const parts = line.split('|');
        // If line starts with |, the first split part is empty string (before the first pipe)
        if (line.trim().startsWith('|')) parts.shift();
        // If line ends with |, the last split part is empty string
        if (line.trim().endsWith('|')) parts.pop();
        return parts.map(c => c.trim());
    };

    // Check for standard GFM separator row (e.g., |---| or |:---|: etc)
    // Regex allows for optional leading/trailing pipe, and repeating |-+| structure
    const separatorRegex = /^\|?(\s*:?-+:?\s*\|)+\s*$/;
    
    let hasSeparator = false;
    // Look at the second line to see if it's a separator
    if (tableLines.length > 1 && separatorRegex.test(tableLines[1].trim())) {
        hasSeparator = true;
    }

    // Generate HTML
    let html = '<div class="overflow-x-auto my-4 border border-neutral-200 rounded-xl shadow-sm"><table class="w-full text-sm text-left border-collapse">';
    
    // Process Headers
    const headers = cleanSplit(tableLines[0]);
    html += '<thead class="bg-neutral-50 text-neutral-900 uppercase font-bold text-xs"><tr>';
    headers.forEach(h => html += `<th class="px-6 py-3 border-b border-neutral-200 min-w-[100px]">${h}</th>`);
    html += '</tr></thead>';

    html += '<tbody class="divide-y divide-neutral-100 bg-white">';
    
    // Determine where body starts. 
    // If separator exists: Header is line 0, Separator is line 1 (skip), Body starts line 2.
    // If no separator: Header is line 0, Body starts line 1.
    const startBodyIndex = hasSeparator ? 2 : 1;

    for (let i = startBodyIndex; i < tableLines.length; i++) {
        const cells = cleanSplit(tableLines[i]);
        html += '<tr class="hover:bg-neutral-50/50 transition-colors">';
        
        // Render cells matching the header column count
        for (let j = 0; j < headers.length; j++) {
            const cellContent = cells[j] || ''; // Handle missing cells gracefully
            html += `<td class="px-6 py-4 font-medium text-neutral-600 align-top">${cellContent}</td>`;
        }
        html += '</tr>';
    }

    html += '</tbody></table></div>';

    return { html, consumed: tableLines.length };
};

const processSpoilers = (html: string): string => {
    // Regex to match [HIDDEN: content]
    // The content capture group (.*?) is non-greedy
    return html.replace(/\[HIDDEN:\s*(.*?)\]/g, (match, content) => {
        return `
            <details class="group my-3 inline-block align-top w-full">
                <summary class="list-none cursor-pointer [&::-webkit-details-marker]:hidden focus:outline-none">
                    <span class="inline-flex items-center gap-2 px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors select-none">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                        Tap to Reveal Answer
                    </span>
                </summary>
                <div class="mt-2 p-4 bg-green-50 border border-green-200 text-green-900 rounded-xl text-sm font-medium animate-in slide-in-from-top-2 fade-in duration-200">
                    ${content.trim()}
                </div>
            </details>
        `;
    });
};

export const parseMarkdown = (text: string): string => {
    if (!text) return '';

    // Heuristic: If it starts with a block-level HTML tag, assume it's legacy HTML and return as-is
    if (/^\s*<(div|p|h[1-6]|ul|ol|table)/i.test(text)) {
        return text;
    }
    
    const lines = text.split('\n');
    const output: string[] = [];
    
    // Stack to track nested lists (stores type and indent level)
    const listStack: { type: 'ul' | 'ol', indent: number }[] = [];

    const closeLists = (targetLevel: number = 0) => {
        while (listStack.length > targetLevel) {
            const list = listStack.pop();
            output.push(list!.type === 'ul' ? '</ul>' : '</ol>');
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 1. Try Parsing Table (Breaks lists)
        const tableResult = parseTable(lines.slice(i));
        if (tableResult) {
            closeLists(0);
            output.push(tableResult.html);
            i += tableResult.consumed - 1;
            continue;
        }

        // 2. Horizontal Rule (Breaks lists)
        // Checks for lines containing only 3 or more hyphens, asterisks, or underscores
        if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
            closeLists(0);
            output.push('<hr class="my-6 border-t-2 border-neutral-100" />');
            continue;
        }

        // 3. Headings (Breaks lists)
        if (line.startsWith('# ')) { 
            closeLists(0);
            output.push(`<h1 class="text-3xl font-black text-neutral-900 mb-4 mt-8 pb-2 border-b border-neutral-100 leading-tight">${line.substring(2)}</h1>`); 
            continue; 
        }
        if (line.startsWith('## ')) { 
            closeLists(0);
            output.push(`<h2 class="text-xl font-extrabold text-neutral-800 mb-3 mt-6 leading-tight">${line.substring(3)}</h2>`); 
            continue; 
        }
        if (line.startsWith('### ')) { 
            closeLists(0);
            output.push(`<h3 class="text-lg font-bold text-neutral-700 mb-2 mt-4 leading-tight">${line.substring(4)}</h3>`); 
            continue; 
        }

        // 4. Blockquotes (Breaks lists)
        if (line.startsWith('> ')) {
            closeLists(0);
            output.push(`<blockquote class="border-l-4 border-amber-400 bg-amber-50 pl-4 py-3 pr-2 my-4 rounded-r-lg text-sm text-neutral-700 font-medium italic shadow-sm">${line.substring(2)}</blockquote>`);
            continue;
        }

        // 5. Tip Blocks (Breaks lists) - Updated regex to avoid matching [HIDDEN:...]
        const tipMatch = line.match(/^\s*\[(?!HIDDEN:)(.*)\]\s*$/);
        if (tipMatch) {
            closeLists(0);
            const lightbulbSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 mt-0.5 text-sky-500"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`;
            const tipContent = tipMatch[1].trim();
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
        
        // 6. Lists (With Nested Support)
        const indentMatch = line.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[0].length : 0;
        
        const ulMatch = line.match(/^\s*[-*]\s+(.*)/);
        const olMatch = line.match(/^\s*\d+\.\s+(.*)/);

        if (ulMatch || olMatch) {
            const listType = ulMatch ? 'ul' : 'ol';
            const content = ulMatch ? ulMatch[1] : olMatch![1];
            
            if (listStack.length === 0) {
                // Start new list
                output.push(listType === 'ul' 
                    ? '<ul class="list-disc list-outside pl-5 my-3 space-y-1 text-neutral-700 marker:text-neutral-400">' 
                    : '<ol class="list-decimal list-outside pl-5 my-3 space-y-1 text-neutral-700 marker:font-bold marker:text-neutral-500">');
                listStack.push({ type: listType, indent });
            } else {
                const last = listStack[listStack.length - 1];

                if (indent > last.indent) {
                    // Nested list
                    output.push(listType === 'ul' 
                        ? '<ul class="list-disc list-outside pl-5 my-1 space-y-1 text-neutral-700 marker:text-neutral-400">' 
                        : '<ol class="list-decimal list-outside pl-5 my-1 space-y-1 text-neutral-700 marker:font-bold marker:text-neutral-500">');
                    listStack.push({ type: listType, indent });
                } else if (indent < last.indent) {
                    // Close nested lists
                    while (listStack.length > 0 && indent < listStack[listStack.length - 1].indent) {
                        const closed = listStack.pop();
                        output.push(closed!.type === 'ul' ? '</ul>' : '</ol>');
                    }
                    // Handle potential type switch or restarting at current level
                    if (listStack.length === 0 || (listStack.length > 0 && listStack[listStack.length - 1].type !== listType && listStack[listStack.length - 1].indent === indent)) {
                         if (listStack.length > 0 && listStack[listStack.length - 1].indent === indent) {
                             const closed = listStack.pop();
                             output.push(closed!.type === 'ul' ? '</ul>' : '</ol>');
                         }
                         output.push(listType === 'ul' 
                             ? '<ul class="list-disc list-outside pl-5 my-3 space-y-1 text-neutral-700 marker:text-neutral-400">' 
                             : '<ol class="list-decimal list-outside pl-5 my-3 space-y-1 text-neutral-700 marker:font-bold marker:text-neutral-500">');
                         listStack.push({ type: listType, indent });
                    }
                } else {
                    // Same indentation level
                    if (last.type !== listType) {
                        const closed = listStack.pop();
                        output.push(closed!.type === 'ul' ? '</ul>' : '</ol>');
                        output.push(listType === 'ul' 
                            ? '<ul class="list-disc list-outside pl-5 my-3 space-y-1 text-neutral-700 marker:text-neutral-400">' 
                            : '<ol class="list-decimal list-outside pl-5 my-3 space-y-1 text-neutral-700 marker:font-bold marker:text-neutral-500">');
                        listStack.push({ type: listType, indent });
                    }
                }
            }
            output.push(`<li class="pl-1">${content}</li>`);
            continue;
        }

        // 7. Paragraph or Empty Line (Breaks Lists)
        if (line.trim() !== '') {
            closeLists(0);
            output.push(`<p class="mb-2 leading-relaxed text-neutral-600">${line}</p>`);
        } else {
             closeLists(0);
             output.push('<br class="block my-2" />');
        }
    }

    closeLists(0);
    
    // Process inline markdown and then Custom Spoilers
    const rawHtml = output.join('')
        .replace(/!\[(.*?)\]\((.*?)\)/g, '<img alt="$1" src="$2" class="max-w-full h-auto rounded-lg my-4 shadow-md border border-neutral-200" />')
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-600 font-bold hover:underline">$1</a>')
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-black text-neutral-900">$1</strong>')
        .replace(/\*(.*?)\*/g, '<span class="italic font-normal text-inherit">$1</span>')
        .replace(/`([^`]+)`/g, '<code class="bg-neutral-100 text-pink-600 px-1.5 py-0.5 rounded text-xs font-mono font-bold border border-neutral-200">$1</code>');
    
    return processSpoilers(rawHtml);
};