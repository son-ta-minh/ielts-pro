import { getConfig, getServerUrl } from '../app/settingsManager';

export const normalizeImageUrl = (url: string, serverUrl = getServerUrl(getConfig())) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return '';
    if (/^https?:\/\//i.test(trimmedUrl) || trimmedUrl.startsWith('data:') || trimmedUrl.startsWith('blob:')) return trimmedUrl;
    if (trimmedUrl.startsWith('/')) return `${serverUrl}${trimmedUrl}`;
    return `${serverUrl}/${trimmedUrl}`;
};

export const fetchImageUrlsForQuery = async (query: string, serverUrl = getServerUrl(getConfig())): Promise<string[]> => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];

    const res = await fetch(`${serverUrl}/api/images/search?q=${encodeURIComponent(trimmedQuery)}`);

    if (!res.ok) {
        let errorMessage = 'Image generate failed';
        try {
            const errData = await res.json();
            if (errData?.error) errorMessage = errData.error;
        } catch {}
        throw new Error(errorMessage);
    }

    const data = await res.json();
    return (data?.images || [])
        .map((img: any) => img.url)
        .filter((url: string) => url && url.trim() !== '')
        .map((url: string) => normalizeImageUrl(url, serverUrl));
};
