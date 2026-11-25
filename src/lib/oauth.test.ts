import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanOAuthCallbackUrl, formatOAuthError, getOAuthRedirectUrl, processOAuthCallback } from "./oauth";

function mockLocation(search: string, hash = ""): Location {
  window.history.replaceState({}, "", `/plyy_1125/${search}${hash}`);
  return window.location;
}

function mockClient(exchange: () => Promise<{ error: Error | null }>) {
  return {
    auth: { exchangeCodeForSession: vi.fn(exchange) }
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("OAuth callback helpers", () => {
  it("returns the base pathname as the OAuth redirect target", () => {
    mockLocation("?ignored=1", "#/settings");
    expect(getOAuthRedirectUrl(window.location)).toBe("http://localhost:3000/plyy_1125/");
  });

  it("processes a callback code only once for concurrent callers", async () => {
    const location = mockLocation("?code=callback-code", "#/");
    let resolveExchange!: () => void;
    const exchange = vi.fn(() => new Promise<{ error: Error | null }>((resolve) => {
      resolveExchange = () => resolve({ error: null });
    }));
    const client = mockClient(exchange);

    const first = processOAuthCallback(client, location);
    const second = processOAuthCallback(client, location);
    resolveExchange();

    await Promise.all([first, second]);
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("");
  });

  it("allows a failed exchange to be retried", async () => {
    const location = mockLocation("?code=retry-code");
    const exchange = vi.fn()
      .mockResolvedValueOnce({ error: new Error("Authorization code expired") })
      .mockResolvedValueOnce({ error: null });
    const client = mockClient(exchange);

    await expect(processOAuthCallback(client, location)).rejects.toThrow("인증 코드가 만료");
    await expect(processOAuthCallback(client, location)).resolves.toBeUndefined();
    expect(exchange).toHaveBeenCalledTimes(2);
  });

  it("does not exchange the same successful code again", async () => {
    const location = mockLocation("?code=used-code");
    const exchange = vi.fn().mockResolvedValue({ error: null });
    const client = mockClient(exchange);

    await processOAuthCallback(client, location);
    window.history.replaceState({}, "", "/plyy_1125/?code=used-code#/");
    await processOAuthCallback(client, window.location);

    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it("cleans provider and callback query parameters", () => {
    const location = mockLocation("?error=access_denied", "#/settings");
    cleanOAuthCallbackUrl(location);
    expect(window.location.pathname).toBe("/plyy_1125/");
    expect(window.location.hash).toBe("#/settings");
  });

  it("formats reused and expired state errors in Korean", () => {
    expect(formatOAuthError(new Error("State has already been used"))).toContain("이미 처리");
    expect(formatOAuthError(new Error("Authorization code expired"))).toContain("만료");
  });
});
