import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Philly on the Block homepage shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();

  assert.match(html, /Philly on the Block \| Cheesesteaks with attitude/);
  assert.match(html, /2600 W Victory Blvd/);
  assert.match(html, /\(818\) 406-6053/);
  assert.match(html, /https:\/\/www\.yelp\.com\/menu\/philly-on-the-block-burbank/);
  assert.match(html, /OTB Ranch/);
  assert.match(html, /OTB Tang/);
  assert.match(html, /Built on the block\./);
  assert.match(html, /\/images\/otb-logo-sign\.png/);
  assert.match(html, /\/manifest\.webmanifest/);
  assert.doesNotMatch(html, /The Blockbuster|Broad Street Heat|Philly Water Ice/);
});

test("keeps the menu source, baby-blue palette, and hosting identity in place", async () => {
  const [page, css, layout, hosting, menuPhotos] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    Promise.all([
      "philly-otb.jpg",
      "classic-philly.jpg",
      "philly-melt.jpg",
      "otb-fries.jpg",
    ].map((name) => readFile(new URL(`../public/images/menu/${name}`, import.meta.url)))),
  ]);

  assert.match(page, /type Category = "Cheesesteaks" \| "Sides" \| "Drinks"/);
  assert.match(page, /OTB Ranch/);
  assert.match(page, /OTB Tang/);
  assert.match(css, /#badaff/i);
  assert.ok(menuPhotos.every((photo) => photo.length > 80_000));
  assert.match(layout, /Philly on the Block \| Cheesesteaks with attitude/);
  assert.equal(
    JSON.parse(hosting).project_id,
    "appgprj_6a7a4fd863588191a577827e10323f47",
  );
});
