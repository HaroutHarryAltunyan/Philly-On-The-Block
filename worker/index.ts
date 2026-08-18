/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  META_PIXEL_ID?: string;
  MENU_IMAGES: {
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
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },

  // Cron-triggered reconciliation (see `triggers.crons` in wrangler.json).
  // Stripe can fail to deliver the completed/expired webhooks; this sweeps old
  // unpaid card orders and reconciles them against Stripe so reserved stock is
  // not held forever and orders paid on Stripe are not left unpaid here.
  //
  // The DB/reaper modules are imported dynamically (not at the top of this
  // entry) so their `cloudflare:workers` imports never land at the top level
  // of the built worker — which keeps the module loadable in non-Workers
  // contexts (e.g. the Node-based render test) where that scheme is unsupported.
  async scheduled(): Promise<void> {
    try {
      const [{ getDb }, { ensureBootstrap }, { reapLingeringStripeOrders }] = await Promise.all([
        import("../db"),
        import("../db/bootstrap"),
        import("../lib/checkout"),
      ]);
      const db = getDb();
      await ensureBootstrap(db);
      const result = await reapLingeringStripeOrders(db);
      if (result.checked > 0 || result.markedPaid > 0 || result.cancelled > 0) {
        console.log(
          `[reaper] checked=${result.checked} markedPaid=${result.markedPaid} cancelled=${result.cancelled}`,
        );
      }
    } catch (error) {
      console.error("[reaper] sweep failed:", error);
    }
  },
};

export default worker;
