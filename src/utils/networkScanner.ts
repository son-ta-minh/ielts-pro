
import { KNOWN_HOSTS, SERVER_PORT_START, SERVER_PORT_END } from '../app/settingsManager';

export interface ScanResult {
    url: string;
    host: string;
    port: number;
}

/**
 * Scans a range of ports on a set of hosts to find an active Vocab Pro server.
 * Uses a short timeout for rapid failover.
 */
export const scanForServer = async (): Promise<ScanResult | null> => {
    const ports = Array.from({ length: SERVER_PORT_END - SERVER_PORT_START + 1 }, (_, i) => SERVER_PORT_START + i);
    const protocol = 'https'; // App primarily uses HTTPS for local server

    console.log(`[NetworkScanner] Starting scan... Hosts: ${KNOWN_HOSTS.length}, Ports: ${ports.length} (${SERVER_PORT_START}-${SERVER_PORT_END})`);

    // Create a list of all candidate URLs
    const candidates: { url: string, host: string, port: number }[] = [];
    
    // Prioritize scanning all hosts on the default port first, then move up.
    // This optimization helps if the server just moved hosts but kept the port.
    for (const port of ports) {
        for (const host of KNOWN_HOSTS) {
            candidates.push({ url: `${protocol}://${host}:${port}`, host, port });
        }
    }

    // Process in batches to avoid browser connection limits but stay fast
    const BATCH_SIZE = 6; 
    
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE);
        
        try {
            // Manual implementation of Promise.any to support older TS libs
            const result = await new Promise<ScanResult>((resolve, reject) => {
                let rejectedCount = 0;
                if (batch.length === 0) {
                    reject(new Error("Empty batch"));
                    return;
                }
                
                batch.forEach(c => {
                    checkCandidate(c)
                        .then(resolve)
                        .catch(() => {
                            rejectedCount++;
                            if (rejectedCount === batch.length) {
                                reject(new Error("All candidates failed"));
                            }
                        });
                });
            });

            console.log(`[NetworkScanner] Found server at: ${result.url}`);
            return result;
        } catch (e) {
            // Batch failed (all promises rejected), continue to next batch
        }
    }

    console.warn("[NetworkScanner] Scan complete. No server found.");
    return null;
};

const checkCandidate = async (candidate: { url: string, host: string, port: number }): Promise<ScanResult> => {
    const controller = new AbortController();
    // Increased timeout to 1000ms (1s) to allow for slower HTTPS handshakes on self-signed certs
    const timeoutId = setTimeout(() => controller.abort(), 1000); 

    try {
        const res = await fetch(`${candidate.url}/api/health`, { 
            method: 'GET',
            signal: controller.signal,
            mode: 'cors'
        });
        
        clearTimeout(timeoutId);
        
        if (res.ok) {
            // Double check it's actually our server JSON
            const data = await res.json();
            if (data && data.status === 'ok') {
                return candidate;
            }
        }
        throw new Error("Invalid response");
    } catch (e) {
        throw e;
    }
};
