import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function encodeData(data: any): string {
    try {
        return btoa(encodeURIComponent(JSON.stringify(data)));
    } catch (error) {
        console.error("Failed to encode data:", error);
        return "";
    }
}

export function decodeData<T>(encoded: string): T | null {
    try {
        return JSON.parse(decodeURIComponent(atob(encoded))) as T;
    } catch (error) {
        console.error("Failed to decode data:", error);
        return null;
    }
}

/**
 * Generates a collision-resistant random ID. Prefers crypto.randomUUID (secure
 * contexts), falls back to crypto.getRandomValues so it still works over plain
 * HTTP on a LAN, and finally to Math.random in non-browser/edge cases.
 */
export function randomId(): string {
    const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
    if (c?.randomUUID) return c.randomUUID();
    if (c?.getRandomValues) {
        const bytes = new Uint8Array(16);
        c.getRandomValues(bytes);
        return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Gets or creates a unique voter ID for the current browser session.
 */
export function getOrCreateVoterId(): string {
    if (typeof window === "undefined") return ""; // SSR fallback

    let voterId = localStorage.getItem("votify_voter_id");
    if (!voterId) {
        // Generate a random ID. Not cryptographically perfect, but good enough for this context
        voterId = `voter_${Math.random().toString(36).substring(2, 15)}_${Date.now().toString(36)}`;
        localStorage.setItem("votify_voter_id", voterId);
    }
    return voterId;
}
