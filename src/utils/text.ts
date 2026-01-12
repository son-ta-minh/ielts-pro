
import React from 'react';

export function highlightPreposition(example: string, word: string, preposition?: string): React.ReactNode {
  if (!preposition || !example) {
    return example;
  }

  // Escape special characters in the word for regex
  const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Create a regex to find the word followed by its preposition
  // \b ensures we match whole words only.
  // The 'i' flag makes it case-insensitive.
  const regex = new RegExp(`(\\b${escapedWord}\\s+${preposition}\\b)`, 'i');
  
  const parts = example.split(regex);

  return parts.map((part, index) => {
    if (index % 2 === 1) { // It's the matched part
      return React.createElement('strong', { key: index, className: 'text-neutral-900 font-black' }, part);
    }
    return part; // It's the text before or after the match
  });
}

export async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern API first (works on HTTPS / localhost)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn("Clipboard API failed, trying fallback strategy");
    }
  }
  
  // Fallback for HTTP / non-secure contexts
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Ensure it's not visible but part of the DOM
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error("Copy failed", err);
    return false;
  }
}

/**
 * A robust utility to split a string into an array of clean words.
 * Splits by semicolon, newline, tab, and comma.
 * Trims whitespace and removes empty entries.
 */
export const stringToWordArray = (inputString: string | undefined | null): string[] => {
  if (!inputString) {
    return [];
  }
  return inputString
    .split(/[;\n\r\t,]+/)
    .map(word => word.trim())
    .filter(Boolean); // Removes empty strings resulting from multiple delimiters
};


/**
 * Parses a custom vocab string (format: "essay_word:base_word; word2") into a Map.
 * Used for linking words in the Unit Essay view.
 */
export const parseVocabMapping = (vocabString?: string): Map<string, string> => {
    const map = new Map<string, string>();
    if (!vocabString) return map;
    
    // Use the robust splitter to get entries
    const entries = stringToWordArray(vocabString);
    entries.forEach(entry => {
        const parts = entry.split(':').map(s => s.trim());
        const essayWord = parts[0]; 
        const baseWord = parts.length > 1 ? parts[1] : parts[0];
        
        if (essayWord && baseWord) { 
            const essayLower = essayWord.toLowerCase(); 
            const baseLower = baseWord.toLowerCase(); 
            map.set(essayLower, baseLower); 
            // Also map the base word to itself to ensure simple matches work too
            if (!map.has(baseLower)) map.set(baseLower, baseLower); 
        }
    });
    return map;
};

/**
 * Generates a Regex to match any of the words in the mapping keys.
 * Sorts by length (longest first) to prevent partial matches (e.g. matching "run" inside "running").
 */
export const getEssayHighlightRegex = (mapping: Map<string, string>): RegExp | null => {
    const sortedKeys = Array.from(mapping.keys()).sort((a, b) => b.length - a.length);
    if (sortedKeys.length === 0) return null;
    
    const escapedWords = sortedKeys.map((word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`\\b(${escapedWords.join('|')})\\b`, 'gi');
};
