import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(() => ({ auth: {} }))
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock
}));

beforeEach(() => {
  vi.resetModules();
  createClientMock.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-anon-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSupabaseClient", () => {
  it("세션 저장과 자동 갱신 옵션을 명시하고 클라이언트를 재사용한다", async () => {
    const { getSupabaseBrowserClient, getSupabaseClient } = await import("./supabase");

    const first = getSupabaseClient();
    const second = getSupabaseBrowserClient();

    expect(first).toBe(second);
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "public-anon-key",
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );
  });

  it("공개 Supabase 환경 변수가 없으면 명확한 오류를 낸다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const { getSupabaseClient } = await import("./supabase");

    expect(() => getSupabaseClient()).toThrow("Missing Supabase environment variables");
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
