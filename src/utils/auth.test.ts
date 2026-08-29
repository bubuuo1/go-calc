import { describe, expect, it } from "vitest";
import { safeAuthNextPath } from "@/utils/auth";

describe("safeAuthNextPath", () => {
  it("가족 초대 경로와 쿼리를 유지한다", () => {
    expect(safeAuthNextPath("/invite?token=GI-ABC")).toBe(
      "/invite?token=GI-ABC"
    );
  });

  it("외부 URL과 다른 내부 경로를 거부한다", () => {
    expect(safeAuthNextPath("https://evil.example/invite")).toBeNull();
    expect(safeAuthNextPath("//evil.example/invite")).toBeNull();
    expect(safeAuthNextPath("/settings")).toBeNull();
  });
});
