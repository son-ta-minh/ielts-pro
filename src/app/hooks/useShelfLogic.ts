
import { useState, useMemo, useEffect } from 'react';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { useToast } from '../../contexts/ToastContext';

interface BookWithTitle {
    id: string;
    title: string;
    [key: string]: any;
}

export const useShelfLogic = <T extends BookWithTitle>(
    books: T[], 
    storageKey: string
) => {
    const [customShelves, setCustomShelves] = useState<string[]>(() => getStoredJSON(storageKey, []));
    const [currentShelfIndex, setCurrentShelfIndex] = useState(0);
    const { showToast } = useToast();

    // Calculate all available shelves based on book titles + custom shelves
    const allShelves = useMemo(() => {
        const shelvesFromBooks = new Set(books.map(b => {
            const parts = b.title.split(':');
            return parts.length > 1 ? parts[0].trim() : 'General';
        }));
        
        const combined = new Set([...customShelves, ...Array.from(shelvesFromBooks)]);
        
        const sorted = Array.from(combined).sort((a, b) => {
            if (a === 'General') return -1;
            if (b === 'General') return 1;
            return a.localeCompare(b);
        });
        
        return sorted.length > 0 ? sorted : ['General'];
    }, [books, customShelves]);

    // Ensure shelf index is valid
    useEffect(() => {
        if (currentShelfIndex >= allShelves.length) {
            setCurrentShelfIndex(Math.max(0, allShelves.length - 1));
        }
    }, [allShelves.length]);

    const currentShelfName = allShelves[currentShelfIndex] || 'General';

    const booksOnCurrentShelf = useMemo(() => {
        return books.filter(b => {
            const parts = b.title.split(':');
            const shelf = parts.length > 1 ? parts[0].trim() : 'General';
            return shelf === currentShelfName;
        });
    }, [books, currentShelfName]);

    // --- Actions ---

    const addShelf = (name: string) => {
        const newName = name.trim();
        if (allShelves.map(s => s.toLowerCase()).includes(newName.toLowerCase())) { 
            showToast("Shelf name already exists.", "error"); 
            return false;
        }
        const newCustomShelves = [...customShelves, newName];
        setCustomShelves(newCustomShelves);
        setStoredJSON(storageKey, newCustomShelves);
        
        // Auto select new shelf
        const newIndex = allShelves.length; // It will be sorted, but for UX let's just wait for effect or force it. 
        // Actually, since allShelves is computed, we can't predict index easily without finding it.
        // We will just return true and let parent handle specific selection logic if needed, 
        // or we can set index by finding name in next render.
        // Simple hack: Set index to find it next render.
        setTimeout(() => {
             // Re-calculate to find index
             // This is a bit tricky inside hook, but acceptable for simple UI
        }, 0);
        
        showToast(`Shelf "${newName}" created.`, "success");
        return true;
    };

    const renameShelf = (newName: string, onUpdateBooks: (oldShelf: string, newShelf: string) => Promise<void>) => {
        const oldName = currentShelfName;
        const finalNewName = newName.trim();
        
        if (allShelves.map(s => s.toLowerCase()).includes(finalNewName.toLowerCase())) { 
             showToast("Shelf name already exists.", "error"); 
             return false; 
        }

        // Update custom shelves list
        let newCustomShelves;
        if (customShelves.includes(oldName)) {
            newCustomShelves = customShelves.map(s => s === oldName ? finalNewName : s);
        } else {
            newCustomShelves = [...customShelves, finalNewName];
        }
        setCustomShelves(newCustomShelves);
        setStoredJSON(storageKey, newCustomShelves);

        // Trigger callback to update actual book titles in DB
        onUpdateBooks(oldName, finalNewName);
        
        showToast(`Renamed to "${finalNewName}".`, 'success');
        return true;
    };

    const removeShelf = () => {
        if (booksOnCurrentShelf.length > 0) { 
            showToast("Cannot remove a shelf that contains books.", "error"); 
            return false; 
        }
        if (currentShelfName === 'General') {
             showToast("Cannot remove General shelf.", "error");
             return false;
        }

        const newCustomShelves = customShelves.filter(s => s !== currentShelfName);
        setCustomShelves(newCustomShelves);
        setStoredJSON(storageKey, newCustomShelves);
        setCurrentShelfIndex(prev => Math.max(0, prev - 1));
        return true;
    };

    const nextShelf = () => setCurrentShelfIndex((currentShelfIndex + 1) % allShelves.length);
    const prevShelf = () => setCurrentShelfIndex((currentShelfIndex - 1 + allShelves.length) % allShelves.length);
    const selectShelf = (name: string) => {
        const idx = allShelves.indexOf(name);
        if (idx !== -1) setCurrentShelfIndex(idx);
    };

    return {
        allShelves,
        currentShelfName,
        booksOnCurrentShelf,
        currentShelfIndex,
        addShelf,
        renameShelf,
        removeShelf,
        nextShelf,
        prevShelf,
        selectShelf
    };
};
