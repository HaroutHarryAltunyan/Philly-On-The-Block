import { AuthError, requireAdmin, toErrorResponse } from "../../../../../lib/admin-routes";
import { getMenuImagesBucket } from "../../../../../lib/menu-images";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

export async function POST(request: Request) {
  try {
    await requireAdmin(request);

    const MENU_IMAGES = getMenuImagesBucket();

    const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const extension = TYPES[contentType];
    if (!extension) {
      return Response.json(
        { error: `Unsupported image type "${contentType || "unknown"}". Use JPEG, PNG, WebP, AVIF, or GIF.` },
        { status: 400 },
      );
    }

    const buffer = await request.arrayBuffer();
    if (buffer.byteLength === 0) {
      return Response.json({ error: "Empty upload" }, { status: 400 });
    }
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return Response.json(
        { error: `Image must be under ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB` },
        { status: 413 },
      );
    }

    const key = `menu/${crypto.randomUUID()}.${extension}`;
    await MENU_IMAGES.put(key, buffer, { metadata: { contentType } });

    return Response.json({ image: `/api/menu-image/${key}` });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}