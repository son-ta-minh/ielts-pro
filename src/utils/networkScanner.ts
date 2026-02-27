/**
 * Scans a range of ports on localhost and common macOS hostnames
 * to find the Vocab Pro Server.
 */
import { getCurrentHost } from './firebase'; // adjust path if different

export const scanForServer = async (onProgress?: (url: string) => void, signal?: AbortSignal): Promise<{ host: string; port: number } | null> => {
    // 1️⃣ Try to get current host from Firebase first
    try {
        const firebaseHost = await getCurrentHost();
        if (firebaseHost) {
            const url = new URL(firebaseHost);
            const port = url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80);

            if (onProgress) onProgress(firebaseHost);

            const res = await fetch(`${firebaseHost}/api/health`, {
                mode: 'cors',
                cache: 'no-cache'
            });

            if (res.ok) {
                return { host: url.hostname, port };
            }
        }
    } catch {
        // Ignore Firebase errors and fallback to local scanning
    }
    // Hosts to scan
    const hosts = ['localhost', '127.0.0.1', 'macm2.local', 'macm4.local'];
    // Port range: 3000 to 3020
    const startPort = 3000;
    const endPort = 3020;
    
    // Generate all candidate URLs trying both http and https
    const candidates: { host: string; port: number; url: string }[] = [];
    for (let port = startPort; port <= endPort; port++) {
        hosts.forEach(host => {
            // Try both http and https because the page might be https but server is http, 
            // or vice versa, and some browsers behave differently with localhost mixed content.
            candidates.push({ host, port, url: `http://${host}:${port}` });
            candidates.push({ host, port, url: `https://${host}:${port}` });
        });
    }

    // Helper to check a single URL with a reasonable timeout
    const checkUrl = async (candidate: { host: string; port: number; url: string }) => {
        if (signal?.aborted) return null;
        if (onProgress) onProgress(candidate.url);
        
        const controller = new AbortController();
        // 1.5s timeout for better reliability across different network resolution speeds (.local can be slow)
        const timeoutId = setTimeout(() => controller.abort(), 1500); 
        
        // If master signal is aborted, abort the local fetch too
        const onAbort = () => controller.abort();
        signal?.addEventListener('abort', onAbort);

        try {
            const res = await fetch(`${candidate.url}/api/health`, { 
                signal: controller.signal,
                mode: 'cors',
                cache: 'no-cache'
            });
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', onAbort);
            if (res.ok) return candidate;
            return null;
        } catch {
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', onAbort);
            return null;
        }
    };

    // Process candidates in batches for speed without overwhelming the browser's fetch queue
    const BATCH_SIZE = 8;
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        // Check if we were cancelled before starting next batch
        if (signal?.aborted) return null;
        
        const batch = candidates.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(checkUrl));
        const found = results.find(r => r !== null);
        if (found) {
            return { host: found.host, port: found.port };
        }
    }

    return null;
};