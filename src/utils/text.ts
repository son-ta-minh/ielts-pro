
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
