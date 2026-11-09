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
      const header = page.locator(".nw-header");
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
        const mobileNav = page.getByRole("navigation", { name: "Navegação principal mobile" });
        await expect(mobileNav).toBeVisible();
        await menu.click();
        await expect(mobileNav).not.toBeVisible();
        await expect(social).toBeVisible();
      }
    }
  });
}

test("Home mostra a Feira de 2026 em marsala e marcas parceiras brancas", async ({ page }) => {
  await page.goto(origin, { waitUntil: "networkidle" });
  const cards = page.locator(".nw-project-card");
  await expect(cards).toHaveCount(4);
  for (const card of await cards.all()) {
    await card.scrollIntoViewIfNeeded();
    await expect.poll(() => card.locator("> img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(card.getByRole("link")).toBeVisible();
  }
  const feira = cards.filter({ has: page.getByRole("heading", { name: "New Wed Feira Tendência" }) });
  await expect(feira.locator("> img")).toHaveAttribute("src", "/assets/feira/edicao-2026.webp");
  await expect(feira.locator(".nw-project-brand")).toHaveAttribute("src", "/assets/brand/feira-tendencia-negativo.png");
  await expect(feira.locator(".nw-project-copy")).toHaveCSS("background-image", /67, 16, 33/);
  const logos = page.locator(".nw-home-partners img");
  await expect(logos).toHaveCount(3);
  for (const logo of await logos.all()) {
    await expect(logo).toHaveCSS("filter", "brightness(0) invert(1)");
  }
  await expect(page.getByRole("img", { name: "Governo de Pernambuco", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Conheça New Wed Feira Tendência", exact: true })).toHaveAttribute("href", "/feira");
});

test("Feira e Guia exibem a marca própria acima do título", async ({ page }) => {
  for (const [route, brand] of [
    ["/feira", "New Wed Feira Tendência"],
    ["/guia", "New Wed Guia Nordeste"],
  ]) {
    await page.goto(origin + route);
    const hero = page.locator(".nw-detail-hero");
    const logo = hero.getByRole("img", { name: brand, exact: true });
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const brandBox = await logo.boundingBox();
    const titleBox = await hero.getByRole("heading", { level: 1 }).boundingBox();
    expect(brandBox!.y + brandBox!.height).toBeLessThan(titleBox!.y);
  }
});

test("Carrossel de Destinos exibe as dez fotos e funciona a 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(origin + "/destinos");
  await page.getByRole("button", { name: "Fechar popup", exact: true }).click();
  const carousel = page.getByRole("region", { name: "Fotos do FAMTOUR" });
  const next = carousel.getByRole("button", { name: "Próxima foto" });
  const activePhoto = carousel.getByRole("img");
  await expect(activePhoto).toHaveAttribute("src", "/assets/destinos/abertura/encontro-noronha.webp");
  const sources = new Set<string>();
  for (let index = 1; index <= 10; index += 1) {
    await expect(carousel.getByText(`${index} / 10`, { exact: true })).toBeVisible();
    await expect.poll(() => activePhoto.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const source = await activePhoto.getAttribute("src");
    expect(source).toMatch(/^\/assets\/destinos\/abertura\/.+\.webp$/);
    sources.add(source!);
    await next.click();
  }
  expect(sources.size).toBe(10);
  await expect(carousel.getByText("1 / 10", { exact: true })).toBeVisible();
  await page.clock.install();
  const play = carousel.getByRole("button", { name: "Reproduzir carrossel" });
  await expect(play).toBeVisible();
  await page.clock.runFor(5000);
  await expect(carousel.getByText("1 / 10", { exact: true })).toBeVisible();
  await play.click();
  await expect(carousel.getByRole("button", { name: "Pausar carrossel" })).toBeVisible();
  await page.clock.runFor(5000);
  await expect(carousel.getByText("2 / 10", { exact: true })).toBeVisible();
  await carousel.getByRole("button", { name: "Pausar carrossel" }).click();
  await carousel.getByRole("button", { name: "Foto anterior" }).click();
  await carousel.getByRole("button", { name: "Foto anterior" }).click();
  await expect(carousel.getByText("10 / 10", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await page.getByRole("button", { name: "Fechar popup", exact: true }).click();
  await expect(carousel.getByRole("button", { name: "Pausar carrossel" })).toBeVisible();
  await page.clock.runFor(5000);
  await expect(carousel.getByText("2 / 10", { exact: true })).toBeVisible();
});
