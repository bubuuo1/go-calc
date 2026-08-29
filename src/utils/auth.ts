export const safeAuthNextPath = (value: unknown) => {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  try {
    const parsed = new URL(value, "https://app.local");
    if (parsed.origin !== "https://app.local" || parsed.pathname !== "/invite") {
      return null;
    }
    return parsed.pathname + parsed.search;
  } catch {
    return null;
  }
};
