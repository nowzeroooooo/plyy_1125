import type { SupabaseClient } from "@supabase/supabase-js";

const exchangePromises = new Map<string, Promise<void>>();

export function getOAuthRedirectUrl(location: Location): string {
  return `${location.origin}${location.pathname}`;
}

export function formatOAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  if (normalized.includes("state has already been used")) {
    return "로그인 요청이 이미 처리되었어요. 페이지를 새로고침한 뒤 다시 로그인해 주세요.";
  }
  if (normalized.includes("invalid_grant") || normalized.includes("authorization code") || normalized.includes("code") && normalized.includes("expired")) {
    return "로그인 인증 코드가 만료되었어요. 다시 로그인해 주세요.";
  }
  if (normalized.includes("network") || normalized.includes("fetch")) {
    return "네트워크 연결을 확인한 뒤 다시 로그인해 주세요.";
  }
  if (normalized.includes("access_denied")) {
    return "Google 로그인 동의를 완료하지 않아 로그인이 취소되었습니다.";
  }
  if (normalized.includes("exchange")) {
    return "Google 로그인 세션을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return message ? `Google 로그인에 실패했습니다: ${message}` : "Google 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export function cleanOAuthCallbackUrl(location: Location): void {
  if (!location.search) return;
  window.history.replaceState({}, document.title, `${location.pathname}${location.hash}`);
}

export async function processOAuthCallback(
  client: SupabaseClient,
  location: Location = window.location
): Promise<void> {
  const params = new URLSearchParams(location.search);
  const providerError = params.get("error");
  if (providerError) {
    const description = params.get("error_description");
    cleanOAuthCallbackUrl(location);
    if (providerError === "access_denied") {
      throw new Error("Google 로그인 동의를 완료하지 않아 로그인이 취소되었습니다.");
    }
    throw new Error(description ? `Google 로그인에 실패했습니다: ${description}` : "Google 로그인이 취소되었습니다.");
  }

  const code = params.get("code");
  if (!code) return;

  const existing = exchangePromises.get(code);
  if (existing) {
    await existing;
    return;
  }

  const exchange = client.auth.exchangeCodeForSession(code).then(({ error }) => {
    if (error) throw error;
    cleanOAuthCallbackUrl(location);
  });
  exchangePromises.set(code, exchange);

  try {
    await exchange;
  } catch (error) {
    exchangePromises.delete(code);
    throw new Error(formatOAuthError(error));
  }
}
