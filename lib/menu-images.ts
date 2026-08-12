import { env } from "cloudflare:workers";

type KVNamespaceLike = {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | string,
    options?: { metadata?: Record<string, string> },
  ): Promise<void>;
  get(
    key: string,
    options?: { type: "arrayBuffer" },
  ): Promise<{ value: ArrayBuffer | null; metadata?: Record<string, string> | null } | null>;
};

export function getMenuImagesBucket(): KVNamespaceLike {
  const bucket = (env as unknown as { MENU_IMAGES?: KVNamespaceLike }).MENU_IMAGES;
  if (!bucket) {
    throw new Error(
      "KV binding `MENU_IMAGES` is unavailable. Add the `kv_namespaces` binding to the Worker config and redeploy before uploading images.",
    );
  }
  return bucket;
}