export async function getMetaPixelId(): Promise<string | null> {
  try {
    const { env } = await import("cloudflare:workers");
    return (env as Record<string, string | undefined>).META_PIXEL_ID || null;
  } catch {
    return null;
  }
}
