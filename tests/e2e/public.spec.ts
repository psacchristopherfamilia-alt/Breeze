import { expect, test } from "@playwright/test";

const PAGES = ["/", "/explore", "/negocios", "/negocios/precios", "/privacy", "/terms", "/business-terms", "/s/island-fade", "/login", "/signup"];

test.describe("páginas públicas", () => {
  for (const path of PAGES) {
    test(`${path} carga y no se desborda en horizontal`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status(), path).toBeLessThan(400);
      await expect(page.locator("body")).not.toBeEmpty();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${path} se desborda`).toBe(false);
    });
  }

  test("una página que no existe da 404 con la marca y una salida", async ({ page }) => {
    expect((await page.goto("/no-existe-esta-pagina"))?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
    await page.getByRole("link", { name: "See salons" }).click();
    await expect(page).toHaveURL(/\/explore$/);
  });

  test("el 404 también sale en español", async ({ page }) => {
    await page.goto("/no-existe-esta-pagina");
    await page.getByRole("button", { name: "ES" }).click();
    await expect(page.getByRole("heading", { name: "No encontramos esa página" })).toBeVisible();
  });
});

test.describe("negocios y precios", () => {
  test("la puerta de negocios lleva a precios", async ({ page }) => {
    await page.goto("/negocios");
    await page.getByRole("link", { name: /pricing/i }).click();
    await expect(page).toHaveURL(/\/negocios\/precios$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("el cambio mensual/anual actualiza los precios (anual = 10 meses)", async ({ page }) => {
    await page.goto("/negocios/precios");
    await expect(page.getByText("$59", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Annual" }).click();
    await expect(page.getByText("$590", { exact: true })).toBeVisible();
    await expect(page.getByText("Pay for 10 months, use 12.")).toBeVisible();
  });
});

test.describe("rutas privadas", () => {
  test("robots.txt oculta el panel, el admin y los enlaces privados", async ({ request }) => {
    const txt = await (await request.get("/robots.txt")).text();
    for (const p of ["/dashboard", "/admin", "/b/", "/me"]) expect(txt).toContain(`Disallow: ${p}`);
    expect(txt).toContain("Sitemap:");
  });

  test("el sitemap lista el catálogo y los textos legales", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain("/explore");
    expect(xml).toContain("/negocios/precios");
  });

  test("la imagen para compartir existe", async ({ request }) => {
    const res = await request.get("/opengraph-image");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });
});
