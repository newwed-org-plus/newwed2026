import { expect, test } from "@playwright/test";

const origin = process.env.VISUAL_BASE_URL ?? "http://localhost:4173";

test("Feira destaca o Instagram e permite navegar pelo acervo no celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${origin}/feira`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("banner").getByRole("link", { name: "Instagram New Wed Feira" })).toHaveAttribute("href", /instagram\.com\/new_wed_feira/);
  await expect(page.getByTitle("New Wed Feira Tendência 2026 — vídeo oficial")).toHaveAttribute("src", /juZ5xsOwPZs/);
  const list = page.getByRole("list", { name: "Edições da Feira" });
  await expect(list.getByRole("listitem")).toHaveCount(9);
  await expect(list).toHaveCSS("display", "grid");
  expect(await list.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(await list.evaluate(element => element.clientWidth));
  const card = page.getByRole("button", { name: "Ver galeria da Feira 2023" });
  await card.click();
  const gallery = page.getByRole("dialog", { name: "New Wed Feira 2023" });
  await expect(gallery).toBeVisible();
  await expect(gallery.getByRole("link", { name: "Assistir ao vídeo de 2023" })).toHaveAttribute("href", /OqfXxlvGmyE/);
  await expect.poll(() => gallery.locator("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: "New Wed Feira 2024" })).toBeVisible();
  await expect(page.getByRole("dialog").locator("img")).toHaveAttribute("src", "/assets/feira/edicao-2024.webp");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(card).toBeFocused();
});
