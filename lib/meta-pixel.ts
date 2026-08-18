// Pixel IDs are interpolated into the inline base snippet in the page <head>,
// so anything other than unambiguous ID characters is rejected rather than
// emitted (a stray quote could otherwise break out of the script string).
const PIXEL_ID_RE = /^[A-Za-z0-9-]{1,32}$/;

export async function getMetaPixelId(): Promise<string | null> {
  try {
    const { env } = await import("cloudflare:workers");
    const id = (env as Record<string, string | undefined>).META_PIXEL_ID;
    return id && PIXEL_ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}
