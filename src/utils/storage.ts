
/**
 * Centralized and safe utilities for interacting with localStorage.
 */

/**
 * Safely retrieves and parses a JSON value from localStorage.
 * @param key The localStorage key.
 * @param defaultValue A default value to return if the key doesn't exist or parsing fails.
 * @returns The parsed object or the default value.
 */
export function getStoredJSON<T>(key: string, defaultValue: T): T {
    try {
        const storedValue = localStorage.getItem(key);
        if (storedValue) {
            return JSON.parse(storedValue) as T;
        }
    } catch (error) {
        console.error(`Error parsing JSON from localStorage for key "${key}":`, error);
    }
    return defaultValue;
}

/**
 * Safely stringifies and saves a value to localStorage.
 * @param key The localStorage key.
 * @param value The value to save.
 */
export function setStoredJSON(key: string, value: any): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error(`Error saving JSON to localStorage for key "${key}":`, error);
    }
}
