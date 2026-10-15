import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const siteOrigin = (process.env.VISUAL_BASE_URL ?? "http://localhost:4173").replace(/\/$/, "");
const update = process.env.UPDATE_BASELINES === "1";
const captureTarget = process.env.BASELINE_CAPTURE_TARGET === "1";
const portableComparison = process.platform === "linux";
const baselineRoot = portableComparison ? "tests/visual/baselines-linux" : "tests/visual/baselines";
const pixelThreshold = portableComparison ? 0.12 : 0;
const maxDiffPixelRatio = portableComparison ? 0.025 : 0;
const maxBlockMeanError = portableComparison ? 0.008 : 0;

function blockMeanAbsoluteError(expected: PNG, received: PNG, blockSize = 4) {
  let totalError = 0;
  let blockCount = 0;
  for (let y = 0; y < expected.height; y += blockSize) {
    for (let x = 0; x < expected.width; x += blockSize) {
      const expectedChannels = [0,0,0];
      const receivedChannels = [0,0,0];
      let pixels = 0;
      for (let offsetY = y; offsetY < Math.min(y + blockSize,expected.height); offsetY += 1) {
        for (let offsetX = x; offsetX < Math.min(x + blockSize,expected.width); offsetX += 1) {
          const index = (offsetY * expected.width + offsetX) * 4;
          for (let channel = 0; channel < 3; channel += 1) {
            expectedChannels[channel] += expected.data[index + channel];
            receivedChannels[channel] += received.data[index + channel];
          }
          pixels += 1;
        }
      }
      totalError += expectedChannels.reduce(
        (error,value,channel) => error + Math.abs(value - receivedChannels[channel]) / (pixels * 3 * 255),
        0,
      );
      blockCount += 1;
    }
  }
  return totalError / blockCount;
}
const cases = [
  ["institucional-home","http://127.0.0.1:5174/","/"],
  ["institucional-404","http://127.0.0.1:5174/rota-inexistente","/rota-inexistente"],
  ["famtour-home","http://127.0.0.1:5173/","/famtour"],
  ["famtour-edicao","http://127.0.0.1:5173/edicoes/fernando-de-noronha-2026","/famtour/edicoes/fernando-de-noronha-2026"],
  ["famtour-inscricao","http://127.0.0.1:5173/inscricao/famtour-rn-abril-2027","/famtour/inscricao/famtour-rn-abril-2027"],
] as const;
const viewports = [
  ["mobile",390,844],
  ["tablet",768,1024],
  ["desktop",1440,900],
] as const;

async function settle(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(250);
  await page.evaluate(async () => {
    for (const image of Array.from(document.images)) image.loading = "eager";
    await Promise.race([document.fonts.ready,new Promise((resolve) => setTimeout(resolve,3000))]);
    await Promise.race([
      Promise.all(Array.from(document.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => { image.addEventListener("load",()=>resolve(),{once:true}); image.addEventListener("error",()=>resolve(),{once:true}); }))),
      new Promise((resolve) => setTimeout(resolve,3000)),
    ]);
    window.scrollTo(0,0);
  });
  await page.waitForTimeout(250);
}

for (const [viewportName,width,height] of viewports) {
  test(`${viewportName} · institucional-home estrutura`,async ({ page }) => {
    await page.setViewportSize({ width,height });
    await page.goto(`${siteOrigin}/`,{ waitUntil:"load" });
    await settle(page);
    await expect(page.getByRole("heading",{ name:/conectamos pessoas, destinos e experiências/i })).toBeVisible();
    await expect(page.locator(".nw-project-card")).toHaveCount(4);
    await expect(page.getByRole("heading",{ name:"Nosso ecossistema" })).toBeVisible();
    await expect(page.locator(".nw-logo img")).toBeVisible();
    await expect(page.locator(".nw-project-card > img")).toHaveCount(4);
    const layout = await page.evaluate(() => ({
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth,
      pageBackground:getComputedStyle(document.querySelector(".nw-home")!).backgroundColor,
      cardWidth:document.querySelector(".nw-project-card")!.getBoundingClientRect().width,
    }));
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.pageBackground).toBe("rgb(255, 255, 255)");
    expect(layout.cardWidth).toBeGreaterThan(100);
    if (viewportName === "mobile") {
      await page.locator(".nw-mobile-menu summary").click();
      await expect(page.getByRole("navigation",{ name:"Navegação principal mobile" }).getByRole("link",{ name:"Contato" })).toBeVisible();
    }
  });
  test(`${viewportName} · projetos abrem páginas próprias pelos cards e menus`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const [id, route] of [["feira", "/feira"], ["destinos", "/famtour"], ["guia", "/guia"], ["workshop", "/workshop"]]) {
      await page.goto(`${siteOrigin}/`);
      await page.locator(`#${id}`).getByRole("link").click();
      await expect(page).toHaveURL(`${siteOrigin}${route}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.goto(`${siteOrigin}/`);
      if (viewportName === "mobile") await page.locator(".nw-mobile-menu summary").click();
      const menu = page.getByRole("navigation", { name: viewportName === "mobile" ? "Navegação principal mobile" : "Navegação principal", exact: true });
      await menu.locator(`a[href="${route}"]`).click();
      await expect(page).toHaveURL(`${siteOrigin}${route}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    for (const section of ["sobre", "contato"]) {
      await page.goto(`${siteOrigin}/`);
      if (viewportName === "mobile") await page.locator(".nw-mobile-menu summary").click();
      const menu = page.getByRole("navigation", { name: viewportName === "mobile" ? "Navegação principal mobile" : "Navegação principal", exact: true });
      await menu.locator(`a[href="/#${section}"]`).click();
      await expect(page.locator(`.nw-home #${section}`)).toBeInViewport();
      if (viewportName === "mobile") await expect(page.locator(".nw-mobile-menu")).not.toHaveAttribute("open");
    }
  });

  test(`${viewportName} · páginas institucionais têm conteúdo, contato e retorno`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const [id, title] of [
      ["feira", "A feira que move o mercado de casamentos do Nordeste."],
      ["guia", "A publicação que posiciona destinos e histórias de amor."],
      ["workshop", "Conexão e posicionamento para marcas do mercado premium."],
    ]) {
      const response = await page.goto(`${siteOrigin}/${id}`);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(`${siteOrigin}/${id}`);
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(page.locator(".nw-detail-grid article").first()).toBeVisible();
      await settle(page);
      await mkdir(resolve("test-results/visual/projects"), { recursive: true });
      await page.screenshot({ path: resolve(`test-results/visual/projects/${id}-${viewportName}.png`), fullPage: true, animations: "disabled" });
      const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth, background: getComputedStyle(document.querySelector(".nw-home")!).backgroundColor }));
      expect(layout.width).toBeLessThanOrEqual(layout.viewport + 1);
      expect(layout.background).toBe("rgb(255, 255, 255)");
      if (id !== "feira") {
        await page.locator('.nw-detail-actions a[href="#formatos"]').click();
        await expect(page.locator("#formatos")).toBeInViewport();
      }
      await page.locator('.nw-detail-actions a[href="#contato"]').first().click();
      await expect(page.locator("#contato")).toBeInViewport();
      const contactUrl = new URL((await page.locator('#contato a').getAttribute("href"))!);
      expect(contactUrl.hostname).toBe("wa.me");
      expect(contactUrl.searchParams.get("text")).toContain(`New Wed ${id === "feira" ? "Feira" : id === "guia" ? "Guia" : "Workshop"}`);
      await page.getByRole("link", { name: "← Todos os projetos", exact: true }).click();
      await expect(page).toHaveURL(`${siteOrigin}/#projetos`);
      await expect(page.locator("#projetos")).toBeInViewport();
    }
    for (const section of ["sobre", "contato", "destinos"]) {
      await page.goto(`${siteOrigin}/${section}`);
      await expect(page).toHaveURL(`${siteOrigin}/#${section}`);
    }
  });

  test(`${viewportName} · navegação pelas seções da FAMTOUR`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${siteOrigin}/famtour?edicao=famtour-rn-abril-2027`);
    await page.waitForLoadState("networkidle");
    for (const section of ["experiencia", "edicoes-anteriores", "famtours", "parceiros", "form"]) {
      if (width < 1024) await page.getByRole("button", { name: "Abrir menu" }).click();
      await page.getByRole("navigation", { name: "Navegação FAMTOUR" }).locator(`a[href="#${section}"]:visible`).click();
      await expect(page).toHaveURL(`${siteOrigin}/famtour?edicao=famtour-rn-abril-2027#${section}`);
      await expect(page.locator(`.famtour-landing #${section}`)).toBeInViewport();
      if (width < 1024) await expect(page.getByRole("button", { name: "Abrir menu" })).toHaveAttribute("aria-expanded", "false");
      await expect.poll(() => page.locator(`#${section}`).evaluate(element => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(64);
    }
    for (const section of ["experiencia", "edicoes-anteriores", "famtours", "parceiros", "inicio", "form"]) {
      await page.getByRole("contentinfo").locator(`a[href="#${section}"]`).first().click();
      await expect(page).toHaveURL(`${siteOrigin}/famtour?edicao=famtour-rn-abril-2027#${section}`);
      await expect(page.locator(`.famtour-landing #${section}`)).toBeInViewport();
    }
    await expect(page.locator('#parceiros img')).toHaveCount(4);
    const partners = await page.locator('#parceiros ul').evaluate(element => {
      const boxes = Array.from(element.children).map(child => child.getBoundingClientRect());
      return { columns:getComputedStyle(element).gridTemplateColumns.split(' ').length, sameRow:boxes[0].top === boxes[3].top };
    });
    expect(partners.columns).toBe(width < 768 ? 2 : 4);
    expect(partners.sameRow).toBe(width >= 768);
    await page.getByRole('link', { name:'New Wed, página inicial', exact:true }).click();
    await expect(page).toHaveURL(`${siteOrigin}/`);
  });

  test(`${viewportName} · páginas FAMTOUR retornam à landing`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const route of ["edicoes/fernando-de-noronha-2026", "inscricao/famtour-rn-abril-2027"]) {
      await page.goto(`${siteOrigin}/famtour/${route}`);
      await page.waitForLoadState("networkidle");
      if (route.startsWith("edicoes/")) {
        if (width < 1024) await page.getByRole("button", { name: "Abrir menu" }).click();
        await page.getByRole("navigation", { name: "Navegação FAMTOUR" }).getByRole("link", { name: "Edições abertas" }).click();
      } else {
        await page.getByRole("banner").getByRole("link", { name: "Voltar para edições abertas" }).click();
      }
      await expect(page).toHaveURL(`${siteOrigin}/famtour#famtours`);
      await expect(page.locator(".famtour-landing #famtours")).toBeInViewport();
    }
  });

  test(`${viewportName} · fontes oficiais locais`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const remoteFonts: string[] = [];
    page.on("request", request => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) remoteFonts.push(request.url());
    });
    for (const route of ["/", "/famtour"]) {
      await page.goto(`${siteOrigin}${route}`);
      const typography = await page.evaluate(async () => {
        for (const weight of [300, 350, 700]) await document.fonts.load(`${weight} 16px "Fedra Sans Std"`);
        await document.fonts.load('500 16px "BlockGothicRR"');
        return {
          loaded: Array.from(document.fonts).filter(face => face.status === "loaded").map(face => `${face.family.replaceAll('"', '')}:${face.weight}`),
          heading: getComputedStyle(document.querySelector("h1")!).fontFamily,
          synthesis: getComputedStyle(document.body).fontSynthesis,
        };
      });
      expect(typography.loaded).toEqual(expect.arrayContaining(["Fedra Sans Std:300", "Fedra Sans Std:350", "Fedra Sans Std:700", "BlockGothicRR:500"]));
      expect(typography.heading).toContain(route === "/" ? "Fedra Sans Std" : "BlockGothicRR");
      expect(typography.synthesis).toBe("none");
    }
    expect(remoteFonts).toEqual([]);
  });

  test(`${viewportName} · CTAs correspondem ao destino e à edição`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const slugs = ["famtour-alagoas-fevereiro-2027", "famtour-rn-abril-2027", "famtour-noronha-maio-2027", "famtour-ceara-agosto-2027"];
    for (const [index, slug] of slugs.entries()) {
      await page.goto(`${siteOrigin}/famtour#famtours`);
      await page.waitForLoadState("networkidle");
      await page.locator("#famtours").getByRole("button", { name: "Solicitar informações", exact: true }).nth(index).click();
      await expect(page).toHaveURL(`${siteOrigin}/famtour?edicao=${slug}#form`);
      await expect(page.locator("#form")).toBeInViewport();
      await page.locator("#famtours").getByRole("button", { name: "Ver informações da edição", exact: true }).nth(index).click();
      await expect(page).toHaveURL(`${siteOrigin}/famtour/inscricao/${slug}`);
      await expect(page.getByText("Nenhuma cobrança será realizada nesta etapa. O ambiente de inscrição online será disponibilizado posteriormente.", { exact: true })).toBeVisible();
      await expect(page.getByText("Ainda não. Esta página apresenta a estrutura da inscrição", { exact: false })).toBeVisible();
    }
  });

  test(`${viewportName} · retorno explícito ao grupo e aos projetos`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const route of ["/famtour", "/famtour/edicoes/fernando-de-noronha-2026", "/famtour/inscricao/famtour-rn-abril-2027"]) {
      await page.goto(`${siteOrigin}${route}`);
      await page.waitForLoadState("networkidle");
      const header = page.getByRole("navigation", { name: route.includes("inscricao") ? "Retorno ao institucional" : "Navegação FAMTOUR" });
      await header.getByRole("link", { name: "Grupo New Wed", exact: true }).click();
      await expect(page).toHaveURL(`${siteOrigin}/`);
      await expect(page.locator(".nw-home")).toBeVisible();
      await page.goto(`${siteOrigin}${route}`);
      await page.waitForLoadState("networkidle");
      if (!route.includes("inscricao") && width < 1024) await page.getByRole("button", { name: "Abrir menu" }).click();
      await header.getByRole("link", { name: /^Projetos/ }).click();
      await expect(page).toHaveURL(`${siteOrigin}/#projetos`);
      await expect(page.locator("#projetos")).toBeInViewport();
      if (!route.includes("inscricao")) {
        await page.goto(`${siteOrigin}${route}`);
        await page.getByRole("contentinfo").getByRole("link", { name: "Projetos do grupo" }).click();
        await expect(page).toHaveURL(`${siteOrigin}/#projetos`);
      }
    }
  });

  for (const [name,source,target] of cases) {
    test(`${viewportName} · ${name}`,async ({ page }) => {
      await page.setViewportSize({ width,height });
      await page.emulateMedia({ reducedMotion:"reduce" });
      const url = update && !captureTarget ? source : `${siteOrigin}${target}`;
      await page.goto(url,{ waitUntil:"load" });
      await settle(page);
      const actual = await page.screenshot({ fullPage:true,animations:"disabled" });
      const baselinePath = resolve(baselineRoot,viewportName,`${name}.png`);
      if (update) {
        await mkdir(dirname(baselinePath),{ recursive:true });
        await writeFile(baselinePath,actual);
        return;
      }
      const expected = PNG.sync.read(await readFile(baselinePath));
      const received = PNG.sync.read(actual);
      if (received.width !== expected.width || received.height !== expected.height) {
        const evidenceDir = resolve("test-results/visual", viewportName);
        await mkdir(evidenceDir, { recursive: true });
        await writeFile(resolve(evidenceDir, `${name}-actual.png`), actual);
        await writeFile(resolve(evidenceDir, `${name}-expected.png`), PNG.sync.write(expected));
      }
      expect(received.width,`largura divergente em ${name}`).toBe(expected.width);
      expect(received.height,`altura divergente em ${name}`).toBe(expected.height);
      const diff = new PNG({ width:expected.width,height:expected.height });
      const pixels = pixelmatch(expected.data,received.data,diff.data,expected.width,expected.height,{
        threshold:pixelThreshold,
        includeAA:!portableComparison,
      });
      const diffRatio = pixels / (expected.width * expected.height);
      const blockMeanError = portableComparison ? blockMeanAbsoluteError(expected,received) : 0;
      if (diffRatio > maxDiffPixelRatio || blockMeanError > maxBlockMeanError) {
        const diffPath = resolve("test-results/visual",viewportName,`${name}-diff.png`);
        await mkdir(dirname(diffPath),{ recursive:true });
        await writeFile(diffPath,PNG.sync.write(diff));
        await writeFile(resolve("test-results/visual",viewportName,`${name}-actual.png`),actual);
        await writeFile(resolve("test-results/visual",viewportName,`${name}-expected.png`),PNG.sync.write(expected));
      }
      expect(
        diffRatio <= maxDiffPixelRatio && blockMeanError <= maxBlockMeanError,
        `${name}: ${pixels} pixels (${(diffRatio * 100).toFixed(4)}%), erro perceptual ${(blockMeanError * 100).toFixed(4)}%`,
      ).toBe(true);
    });
  }
}
