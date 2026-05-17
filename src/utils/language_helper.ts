export const COMMON_PREPOSITIONS = [
    'in', 'on', 'at', 'to', 'for', 'with', 'of', 'from', 'by', 'about', 
    'into', 'through', 'over', 'under', 'between', 'among', 'against', 'forward',
    'during', 'without', 'before', 'after', 'toward', 'upon', 'within', 'along'
].sort();


export function maskPrepositions(text: string, mask = '___'): string {
    if (!text) return text;

    let result = text;

    COMMON_PREPOSITIONS.forEach((prep) => {
        const escaped = prep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi');

        result = result.replace(regex, mask);
    });

    return result;
}

