import { expect, test } from "@playwright/test";

const origin = process.env.VISUAL_BASE_URL ?? "http://localhost:4173";
const profiles = [
  ["/", "new_wed"],
  ["/feira", "new_wed_feira"],
  ["/guia", "new_wed_guianordeste"],
  ["/workshop", "new_wed_workshop"],
  ["/destinos", "new_wed_destinos"],
] as const;

for (const width of [320, 390, 768, 1440]) {
  test(`Instagram contextual e navegação preservados em ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    for (const [path, profile] of profiles) {
      await page.goto(origin + path, { waitUntil: "networkidle" });
      if (path === "/destinos") {
        await page.getByRole("button", { name: "Fechar popup", exact: true }).click();
      }
      const header = path === "/destinos" ? page.getByRole("navigation", { name: "Navegação FAMTOUR", exact: true }) : page.locator(".nw-header");
      const social = header.getByRole("link", { name: /Instagram New Wed/ });
      await expect(social).toBeVisible();
      await expect(social).toHaveAttribute("href", `https://www.instagram.com/${profile}/`);
      await expect(social).toHaveAttribute("target", "_blank");
      await expect(social).toHaveAttribute("rel", "noopener noreferrer");
      const box = await social.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if (width === 320) {
        const menu = header.getByLabel("Abrir menu");
        await menu.click();
        const mobileNav = path === "/destinos" ? page.locator("#famtour-mobile-menu") : page.getByRole("navigation", { name: "Navegação principal mobile" });
        await expect(mobileNav).toBeVisible();
        await menu.click();
        await expect(mobileNav).not.toBeVisible();
        await expect(social).toBeVisible();
      }
    }
  });
}

test("Home tem filtro vermelho somente na foto da Feira e marcas brancas", async ({ page }) => {
  await page.goto(origin, { waitUntil: "networkidle" });
  const feira = page.locator("#feira .nw-project-copy");
  await expect(feira).toHaveCSS("background-image", /112, 17, 43/);
  await expect(page.locator("#destinos .nw-project-copy")).toHaveCSS("background-image", "none");
  const logos = page.locator(".nw-home-partners img");
  await expect(logos).toHaveCount(3);
  for (const logo of await logos.all()) {
    await expect(logo).toHaveCSS("filter", "brightness(0) invert(1)");
  }
  await expect(page.getByRole("img", { name: "Governo de Pernambuco", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Conheça New Wed Feira Tendência", exact: true })).toHaveAttribute("href", "/feira");
});
