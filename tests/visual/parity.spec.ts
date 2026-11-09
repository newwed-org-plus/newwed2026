import { expect, test, type Page } from "@playwright/test";
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

// A paridade confere a landing após dispensar o popup pela UI.
// ebook.spec.ts confere a abertura automática e o formulário.
async function dismissPopup(page: Page) {
  const popup = page.getByRole('dialog',{name:'Noronha além do cenário'});
  await expect(popup).toBeVisible();
  await popup.getByRole('button',{name:'Fechar popup',exact:true}).click();
  await expect(popup).not.toBeVisible();
}

async function visit(page: Page, url: string, options?: Parameters<Page['goto']>[1]) {
  const response = await page.goto(url, options);
  if (new URL(page.url()).pathname === '/destinos') await dismissPopup(page);
  return response;
}

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
  ["famtour-home","http://127.0.0.1:5173/","/destinos"],
  ["famtour-edicao","http://127.0.0.1:5173/edicoes/fernando-de-noronha-2026","/destinos/edicoes/fernando-de-noronha-2026"],
  ["famtour-inscricao","http://127.0.0.1:5173/inscricao/famtour-rn-abril-2027","/destinos/inscricao/famtour-rn-abril-2027"],
] as const;
const viewports = [
  ["mobile",390,844],
  ["tablet",768,1024],
  ["desktop",1440,900],
] as const;

async function settle(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle");
  // O fechamento devolve o foco ao acionador. A referência da landing representa
  // o visitante lendo a página, sem o contorno de foco do botão de reabertura.
  if (await page.getByRole('button',{name:'E-book gratuito',exact:true}).count()) {
    await page.getByRole('heading',{level:1}).click();
  }
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

test("o vídeo da Home respeita movimento reduzido e permite reproduzir e pausar", async ({ page }) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.emulateMedia({reducedMotion: "reduce"});
  await page.goto(siteOrigin);

  const video = page.locator(".nw-hero video");
  const play = page.getByRole("button", {name: "Reproduzir vídeo institucional"});
  await expect(play).toBeEnabled();
  await expect(video).toHaveJSProperty("paused", true);
  await play.click();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
  await page.getByRole("button", {name: "Pausar vídeo institucional"}).click();
  await expect(video).toHaveJSProperty("paused", true);
});

test("URLs antigas da FAMTOUR preservam edição, campanha e seção", async ({ page, request }) => {
  const query = "edicao=famtour-rn-abril-2027&utm_source=validacao&utm_source=link";
  for (const suffix of ["", "/edicoes/fernando-de-noronha-2026", "/inscricao/famtour-rn-abril-2027"]) {
    const response = await request.get(`${siteOrigin}/famtour${suffix}?${query}`, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(new URL(response.headers().location, siteOrigin).href).toBe(`${siteOrigin}/destinos${suffix}?${query}`);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await visit(page,`${siteOrigin}/famtour?${query}#famtours`);
  await expect(page).toHaveURL(`${siteOrigin}/destinos?${query}#famtours`);
  await expect(page.locator("#famtours")).toBeInViewport();
});

test("Destinos usa o cabeçalho do grupo e mantém o CTA turquesa na primeira tela", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [[320, 568], [390, 844], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await visit(page,`${siteOrigin}/destinos`);
    await settle(page);
    const logo = page.getByRole("link", { name: "Grupo New Wed, página inicial", exact: true });
    await expect(logo).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(logo.locator("img")).toHaveCSS("filter", "none");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Famtour Nordeste Edição 2027");
    await expect(page.locator(".nw-destinos-hero")).toHaveCSS("background-color", "rgb(234, 244, 242)");
    const cta = page.getByRole("link", { name: "Ver edições abertas", exact: true });
    await expect(cta).toHaveCSS("background-color", "rgb(91, 153, 152)");
    await expect(cta).toHaveCSS("color", "rgb(67, 16, 33)");
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(height);
    const ebookButton = await page.getByRole("button", { name: "E-book gratuito", exact: true }).boundingBox();
    expect(ebookButton).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(ebookButton!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await mkdir(resolve("test-results/visual/destinos"), { recursive: true });
    await page.screenshot({ path: resolve(`test-results/visual/destinos/hero-${width}.png`), animations: "disabled" });
    await cta.click();
    await expect(page.locator("#famtours")).toBeInViewport();
  }
});

for (const [viewportName,width,height] of viewports) {
  test(`${viewportName} · institucional-home estrutura`,async ({ page }) => {
    await page.setViewportSize({ width,height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await visit(page,`${siteOrigin}/`,{ waitUntil:"load" });
    await settle(page);
    await expect(page.getByRole("heading",{ name:/O maior ecossistema de conexões para o mercado de casamentos do Nordeste/i })).toBeVisible();
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
    for (const [id, route] of [["feira", "/feira"], ["destinos", "/destinos"], ["guia", "/guia"], ["workshop", "/workshop"]]) {
      await visit(page,`${siteOrigin}/`);
      await page.locator(`#${id}`).getByRole("link").click();
      await expect(page).toHaveURL(`${siteOrigin}${route}`);
      if (route === '/destinos') await dismissPopup(page);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await visit(page,`${siteOrigin}/`);
      if (viewportName === "mobile") await page.locator(".nw-mobile-menu summary").click();
      const menu = page.getByRole("navigation", { name: viewportName === "mobile" ? "Navegação principal mobile" : "Navegação principal", exact: true });
      await menu.locator(`a[href="${route}"]`).click();
      await expect(page).toHaveURL(`${siteOrigin}${route}`);
      if (route === '/destinos') await dismissPopup(page);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    for (const section of ["sobre", "contato"]) {
      await visit(page,`${siteOrigin}/`);
      await page.waitForLoadState("networkidle");
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
      ["feira", "Muito mais que uma feira. Uma vitrine de tendências e inovação no mercado de casamentos."],
      ["guia", "Muito mais que uma revista. Um guia para descobrir o mercado de casamentos do Nordeste."],
      ["workshop", "Muito além das palestras. Uma nova forma de conectar o mercado."],
    ]) {
      const response = await visit(page,`${siteOrigin}/${id}`);
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
      if (id === "guia") {
        await page.locator('.nw-detail-actions a[href="#contato"]').click();
        await expect(page.locator("#contato")).toBeInViewport();
      } else {
        const visitUrl = new URL((await page.locator('.nw-detail-actions a').first().getAttribute("href"))!);
        expect(visitUrl.hostname).toBe("wa.me");
        expect(visitUrl.searchParams.get("text")).toContain(id === "feira" ? "visitar" : "participar");
      }
      const contactUrl = new URL((await page.locator('#contato a').getAttribute("href"))!);
      expect(contactUrl.hostname).toBe("wa.me");
      expect(contactUrl.searchParams.get("text")).toContain(`New Wed ${id === "feira" ? "Feira" : id === "guia" ? "Guia" : "Workshop"}`);
      await page.getByRole("link", { name: "← Todos os projetos", exact: true }).click();
      await expect(page).toHaveURL(`${siteOrigin}/#projetos`);
      await expect(page.locator("#projetos")).toBeInViewport();
    }
    for (const section of ["sobre", "contato"]) {
      await visit(page,`${siteOrigin}/${section}`);
      await expect(page).toHaveURL(`${siteOrigin}/#${section}`);
    }
  });

  test(`${viewportName} · navegação pelas seções da FAMTOUR`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await visit(page,`${siteOrigin}/destinos?edicao=famtour-rn-abril-2027`);
    await page.waitForLoadState("networkidle");
    for (const section of ["experiencia", "edicoes-anteriores", "famtours", "parceiros", "form"]) {
      if (width < 1024) await page.getByRole("button", { name: "Abrir seções de Destinos" }).click();
      await page.getByRole("navigation", { name: "Navegação FAMTOUR" }).locator(`a[href="#${section}"]:visible`).click();
      await expect(page).toHaveURL(`${siteOrigin}/destinos?edicao=famtour-rn-abril-2027#${section}`);
      await expect(page.locator(`.famtour-landing #${section}`)).toBeInViewport();
      if (width < 1024) await expect(page.getByRole("button", { name: "Abrir seções de Destinos" })).toHaveAttribute("aria-expanded", "false");
      await expect.poll(() => page.locator(`#${section}`).evaluate(element => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(64);
    }
    for (const section of ["experiencia", "edicoes-anteriores", "famtours", "parceiros", "inicio", "form"]) {
      await page.getByRole("contentinfo").locator(`a[href="#${section}"]`).first().click();
      await expect(page).toHaveURL(`${siteOrigin}/destinos?edicao=famtour-rn-abril-2027#${section}`);
      await expect(page.locator(`.famtour-landing #${section}`)).toBeInViewport();
    }
    await expect(page.locator('#parceiros img')).toHaveCount(2);
    expect(await page.locator('#parceiros img').evaluateAll(images => images.map(image => image.getAttribute('alt')))).toEqual(['Azul', 'Empetur']);
    for (const partner of await page.locator('#parceiros li').all()) await expect(partner).toHaveCSS('background-color', 'rgb(91, 153, 152)');
    const partners = await page.locator('#parceiros ul').evaluate(element => {
      const boxes = Array.from(element.children).map(child => child.getBoundingClientRect());
      return { columns:getComputedStyle(element).gridTemplateColumns.split(' ').length, sameRow:boxes[0].top === boxes[1].top };
    });
    expect(partners.columns).toBe(2);
    expect(partners.sameRow).toBe(true);
    await mkdir(resolve("test-results/visual/destinos"), { recursive: true });
    await page.locator('#parceiros').screenshot({ path: resolve(`test-results/visual/destinos/partners-${viewportName}.png`), animations: 'disabled' });
    await page.getByRole('link', { name:'Grupo New Wed, página inicial', exact:true }).click();
    await expect(page).toHaveURL(`${siteOrigin}/`);
  });

  test(`${viewportName} · páginas FAMTOUR retornam à landing`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const route of ["edicoes/fernando-de-noronha-2026", "inscricao/famtour-rn-abril-2027"]) {
      await visit(page,`${siteOrigin}/destinos/${route}`);
      await page.waitForLoadState("networkidle");
      if (route.startsWith("edicoes/")) {
        if (width < 1024) await page.getByRole("button", { name: "Abrir seções de Destinos" }).click();
        await page.getByRole("navigation", { name: "Navegação FAMTOUR" }).getByRole("link", { name: "Edições abertas" }).click();
      } else {
        await page.getByRole("banner").getByRole("link", { name: "Voltar para edições abertas" }).click();
      }
      await expect(page).toHaveURL(`${siteOrigin}/destinos#famtours`);
      await dismissPopup(page);
      await expect(page.locator(".famtour-landing #famtours")).toBeInViewport();
    }
  });

  test(`${viewportName} · fontes oficiais locais`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const remoteFonts: string[] = [];
    page.on("request", request => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) remoteFonts.push(request.url());
    });
    for (const route of ["/", "/destinos"]) {
      await visit(page,`${siteOrigin}${route}`);
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
      expect(typography.heading).toContain("Fedra Sans Std");
      expect(typography.synthesis).toBe("none");
    }
    expect(remoteFonts).toEqual([]);
  });

  test(`${viewportName} · CTAs correspondem ao destino e à edição`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const slugs = ["famtour-alagoas-fevereiro-2027", "famtour-rn-abril-2027", "famtour-noronha-maio-2027", "famtour-ceara-agosto-2027"];
    for (const [index, slug] of slugs.entries()) {
      await visit(page,`${siteOrigin}/destinos#famtours`);
      await page.waitForLoadState("networkidle");
      const photo = index === 0 ? "alagoas-2027" : index === 3 ? "ceara-2027" : null;
      if (photo) await expect(page.locator("#famtours article").nth(index).locator("img")).toHaveAttribute("src", `/assets/destinos/${photo}.webp`);
      await page.locator("#famtours").getByRole("button", { name: "Solicitar informações", exact: true }).nth(index).click();
      await expect(page).toHaveURL(`${siteOrigin}/destinos?edicao=${slug}#form`);
      await expect(page.locator("#form")).toBeInViewport();
      await page.locator("#famtours").getByRole("link", { name: "Ver mais informações", exact: true }).nth(index).click();
      await expect(page).toHaveURL(`${siteOrigin}/destinos/inscricao/${slug}`);
      await expect(page.getByRole("button", { name: /Comprar agora/ }).first()).toBeVisible();
      const flights = page.getByRole("region", { name: "Voos previstos com a Azul" });
      await expect(flights.getByText(/Ida ·/)).toBeVisible();
      await expect(flights.getByText(/Volta ·/)).toBeVisible();
      if (index === 0) {
        await expect(flights.getByText("Congonhas (CGH) → Maceió (MCZ)")).toBeVisible();
        await expect(flights.getByText("Recife (REC) → Congonhas (CGH)")).toBeVisible();
      }
      await page.getByRole("link", { name: "Ver condições de pagamento" }).click();
      await expect(page).toHaveURL(`${siteOrigin}/destinos/inscricao/${slug}#condicoes`);
      const conditions = page.getByRole("region", { name: "Condições de pagamento" });
      await expect(conditions).toBeInViewport();
      await expect(conditions.getByText(/^12x de aprox\. R\$/)).toBeVisible();
      await expect(conditions.getByText(/^Pix à vista/i)).toBeVisible();
      await expect(conditions.getByRole("link", { name: "Pedir contato da equipe" })).toHaveAttribute("href", `/destinos?edicao=${slug}&origem=inscricao#form`);
      await conditions.getByRole("link", { name: "Pedir contato da equipe" }).click();
      await expect(page).toHaveURL(`${siteOrigin}/destinos?edicao=${slug}&origem=inscricao#form`);
      await expect(page.locator("#form")).toBeInViewport();
      await expect(page.getByRole("dialog")).not.toBeVisible();
    }
  });

  test(`${viewportName} · retorno explícito ao grupo e aos projetos`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const route of ["/destinos", "/destinos/edicoes/fernando-de-noronha-2026", "/destinos/inscricao/famtour-rn-abril-2027"]) {
      await visit(page,`${siteOrigin}${route}`);
      await page.waitForLoadState("networkidle");
      const header = page.getByRole("navigation", { name: route.includes("inscricao") ? "Retorno ao institucional" : "Navegação FAMTOUR" });
      const homeLink = route.includes("inscricao")
        ? header.getByRole("link", { name: "Grupo New Wed", exact: true })
        : page.getByRole("link", { name: "Grupo New Wed, página inicial", exact: true });
      await homeLink.click();
      await expect(page).toHaveURL(`${siteOrigin}/`);
      await expect(page.locator(".nw-home")).toBeVisible();
      await visit(page,`${siteOrigin}${route}`);
      await page.waitForLoadState("networkidle");
      if (!route.includes("inscricao") && width < 1024) await page.getByRole("button", { name: "Abrir seções de Destinos" }).click();
      await header.getByRole("link", { name: /^Projetos/ }).click();
      await expect(page).toHaveURL(`${siteOrigin}/#projetos`);
      await expect(page.locator("#projetos")).toBeInViewport();
      if (!route.includes("inscricao")) {
        await visit(page,`${siteOrigin}${route}`);
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
      await visit(page,url,{ waitUntil:"load" });
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
