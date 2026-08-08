import { getConfig, getServerUrl } from '../app/settingsManager';

const isLocalHost = (hostname: string) => ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname);

export const getReachableServerUrl = () => {
    const configuredUrl = getServerUrl(getConfig());

    if (typeof window === 'undefined') return configuredUrl;

    try {
        const url = new URL(configuredUrl);
        const browserHost = window.location.hostname;

        if (isLocalHost(url.hostname) && browserHost && !isLocalHost(browserHost)) {
            url.hostname = browserHost;
            return url.toString().replace(/\/$/, '');
        }
    } catch {}

    return configuredUrl;
};

export const normalizeImageUrl = (url: string, serverUrl = getReachableServerUrl()) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return '';
    if (trimmedUrl.startsWith('data:') || trimmedUrl.startsWith('blob:')) return trimmedUrl;
    if (/^https?:\/\//i.test(trimmedUrl)) {
        if (typeof window === 'undefined') return trimmedUrl;

        try {
            const imageUrl = new URL(trimmedUrl);
            const browserHost = window.location.hostname;
            if (isLocalHost(imageUrl.hostname) && browserHost && !isLocalHost(browserHost)) {
                imageUrl.hostname = browserHost;
                return imageUrl.toString();
            }
        } catch {}

        return trimmedUrl;
    }
    if (trimmedUrl.startsWith('/')) return `${serverUrl}${trimmedUrl}`;
    return `${serverUrl}/${trimmedUrl}`;
};

export const fetchImageUrlsForQuery = async (query: string, serverUrl = getReachableServerUrl()): Promise<string[]> => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);

    let res: Response;
    try {
        res = await fetch(`${serverUrl}/api/images/search?q=${encodeURIComponent(trimmedQuery)}`, {
            signal: controller.signal
        });
    } finally {
        window.clearTimeout(timeoutId);
    }

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
