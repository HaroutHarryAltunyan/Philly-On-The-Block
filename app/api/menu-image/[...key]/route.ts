import { getMenuImagesBucket } from "../../../../lib/menu-images";
import { toErrorResponse } from "../../../../lib/admin-routes";

const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
};

function isSafeKey(segments: string[]) {
  if (segments.length === 0) return false;
  if (segments[0] !== "menu") return false;
  return segments.every((segment) => /^[a-zA-Z0-9._-]+$/.test(segment));
}

type Stored = {
  value: ArrayBuffer | null;
  contentType?: string;
};

function asStored(result: unknown): Stored {
  if (result instanceof ArrayBuffer) {
    return { value: result };
  }
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    const value = record.value;
    if (value instanceof ArrayBuffer) {
      const metadata = record.metadata as Record<string, unknown> | undefined;
      return {
        value,
        contentType: typeof metadata?.contentType === "string" ? metadata.contentType : undefined,
      };
    }
  }
  return { value: null };
}

export async function GET(request: Request, context: { params: Promise<{ key: string[] }> }) {
  try {
    const { key: segments } = await context.params;
    if (!isSafeKey(segments)) {
      return new Response("Not found", { status: 404 });
    }

    const stored = asStored(await getMenuImagesBucket().get(segments.join("/"), { type: "arrayBuffer" }));
    if (stored.value === null) {
      return new Response("Not found", { status: 404 });
    }

    const fileName = segments[segments.length - 1] ?? "";
    const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
    const contentType =
      stored.contentType ?? EXTENSION_TYPES[extension] ?? "application/octet-stream";

    return new Response(stored.value, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stored.value.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}