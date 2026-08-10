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

test("server-renders the current Philly on the Block menu", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const menu = [
    ["Philly OTB", "$21.99"],
    ["Classic Philly", "$21.99"],
    ["Philly Melt", "$15.99"],
    ["Fries", "$5.50"],
    ["OTB Fries", "$20.99"],
    ["Coke Can", "$2.75"],
    ["Diet Coke Can", "$2.75"],
    ["Bottled Coke", "$5.00"],
  ];

  for (const [name, price] of menu) {
    assert.ok(html.includes(name), `expected rendered menu to include ${name}`);
    assert.ok(html.includes(price), `expected rendered menu to include ${price}`);
  }

  assert.match(html, /2600 W Victory Blvd/);
  assert.match(html, /\(818\) 406-6053/);
  assert.match(html, /https:\/\/www\.yelp\.com\/menu\/philly-on-the-block-burbank/);
  assert.doesNotMatch(html, /The Blockbuster|Broad Street Heat|Philly Water Ice/);
});

test("keeps the menu source, baby-blue palette, and hosting identity in place", async () => {
  const [page, css, layout, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /type Category = "Cheesesteaks" \| "Sides" \| "Drinks"/);
  assert.match(page, /OTB Ranch/);
  assert.match(page, /OTB Tang/);
  assert.match(css, /#badaff/i);
  assert.match(layout, /Philly on the Block \| Cheesesteaks with attitude/);
  assert.equal(
    JSON.parse(hosting).project_id,
    "appgprj_6a7a4fd863588191a577827e10323f47",
  );
});
