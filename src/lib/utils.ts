import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function encodeData<T extends Record<string, unknown> | string | number | boolean>(data: T): string {
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
        voterId = `voter_${generateSecureId()}`;
        localStorage.setItem("votify_voter_id", voterId);
    }
    return voterId;
}

function generateSecureId(): string {
    if (typeof window === "undefined") {
        return "server";
    }

    const cryptoApi = window.crypto;
    if (cryptoApi?.randomUUID) {
        return cryptoApi.randomUUID();
    }

    if (cryptoApi?.getRandomValues) {
        const randomBytes = new Uint8Array(16);
        cryptoApi.getRandomValues(randomBytes);
        return Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    // Legacy fallback when Web Crypto is unavailable.
    return `${Date.now().toString(36)}_${performance.now().toString(36).replace(".", "")}`;
}
