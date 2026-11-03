import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Renders pages through the built Worker (dist/server/index.js) without
// Cloudflare bindings, so D1 is unavailable and the storefront falls back to
// its built-in menu/hours. That is exactly the "database down" path, which
// must still produce a complete, orderable page.

let workerPromise;
async function worker() {
  if (!workerPromise) {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
    workerPromise = import(workerUrl.href).then((mod) => mod.default);
  }
  return workerPromise;
}

async function render(path) {
  const w = await worker();
  return w.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" }, redirect: "manual" }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function html(path) {
  const response = await render(path);
  assert.equal(response.status, 200, `${path} should render (got ${response.status})`);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  return response.text();
}

test("homepage: brand, local SEO facts, real menu, ordering entry points", async () => {
  const page = await html("/");

  assert.match(page, /Philly on the Block \| Best Philly Cheesesteaks in Burbank, CA/);
  assert.match(page, /2600 W Victory Blvd/);
  assert.match(page, /\(818\) 406-6053/);
  assert.match(page, /https:\/\/www\.yelp\.com\/biz\/philly-on-the-block-burbank/);
  assert.match(page, /OTB Ranch/);
  assert.match(page, /OTB Tang/);
  assert.match(page, /Built on<\/span>\s*<span[^>]*>the block\./);
  assert.match(page, /\/images\/Philly_On_The_Block_Logo\.png/);
  assert.match(page, /\/manifest\.webmanifest/);
  // The hero poster is a real product photo and is the LCP element.
  assert.match(page, /<img[^>]+class="hero-poster"[^>]+src="\/images\/menu\/philly-otb\.jpg"/);
  // Real catalog items and prices are server-rendered (crawlable, works without JS).
  for (const name of ["Philly OTB", "Classic Philly", "Philly Melt", "OTB Fries"]) {
    assert.match(page, new RegExp(name));
  }
  assert.match(page, /\$21\.99/);
  // Structured data for local search.
  assert.match(page, /"@type":\["Restaurant"/);
  assert.match(page, /"@type":"Menu"/);
  // Pay-in-person is the only payment model.
  assert.match(page, /Pay in person/i);
  assert.doesNotMatch(page, /The Blockbuster|Broad Street Heat|Philly Water Ice/);
});

const PAGES = [
  ["/menu", /Philly OTB/],
  ["/our-story", /No shortcuts/i],
  ["/events", /Bring the block/i],
  ["/visit", /2600 W Victory Blvd/],
  ["/track", /Track/i],
  ["/rewards", /points/i],
  ["/login", /sign in|log in/i],
  ["/account", /account/i],
  ["/faq", /FAQ|questions/i],
  ["/contact", /\(818\) 406-6053/],
  ["/privacy", /Privacy/],
  ["/terms", /Terms/],
];

for (const [path, marker] of PAGES) {
  test(`${path} renders with header, footer and its content`, async () => {
    const page = await html(path);
    assert.match(page, marker);
    assert.match(page, /<header/);
    assert.match(page, /<footer/);
    assert.match(page, /<title>[^<]+<\/title>/);
  });
}

test("old and alternate URLs redirect permanently to the new pages", async () => {
  const cases = [
    ["/portal", "/rewards"],
    ["/reserve", "/events"],
    ["/signup", "/login"],
    ["/track-order", "/track"],
    ["/our_story", "/our-story"],
  ];
  for (const [from, to] of cases) {
    const response = await render(from);
    assert.ok([301, 308].includes(response.status), `${from} -> ${response.status}`);
    assert.equal(new URL(response.headers.get("location"), "http://localhost").pathname, to);
  }
});

test("menu source, brand palette, photos and hosting identity stay in place", async () => {
  const [storefront, css, layout, hosting, menuPhotos] = await Promise.all([
    readFile(new URL("../lib/storefront.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    Promise.all(
      ["philly-otb.jpg", "classic-philly.jpg", "philly-melt.jpg", "otb-fries.jpg"].map((name) =>
        readFile(new URL(`../public/images/menu/${name}`, import.meta.url)),
      ),
    ),
  ]);

  assert.match(storefront, /type MenuCategory = "Cheesesteaks" \| "Sides" \| "Drinks"/);
  // Client-safe module: the D1 loader must stay in storefront-server.ts.
  assert.doesNotMatch(storefront, /import\("\.\.\/db"\)|from "drizzle-orm"/);
  assert.match(css, /#badaff/i);
  assert.match(css, /#007404/i);
  assert.ok(menuPhotos.every((photo) => photo.length > 80_000));
  assert.match(layout, /Philly on the Block \| Best Philly Cheesesteaks in Burbank, CA/);
  assert.equal(JSON.parse(hosting).project_id, "appgprj_6a7a4fd863588191a577827e10323f47");
});
