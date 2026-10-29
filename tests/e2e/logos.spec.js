import { test, expect } from '@playwright/test';

const logos = [
  { name: 'forx', path: '/forx/forx-logo-dark.svg', route: '/#/forx/precios', alt: 'ForX — Powered by Sparx AI', holes: 10 },
  { name: 'midespensa', path: '/midespensa-logo.svg', route: '/#/despensa/revision', alt: 'MiDespensa de FORX', holes: 5 }
];

test('logos vectoriales: fondo y huecos transparentes; blancos y colores conservados', async ({ page }) => {
  await page.goto('/');
  for (const logo of logos) {
    const pixels = await page.evaluate(async ({ path }) => {
      const source = await (await fetch(path)).text();
      const documentSvg = new DOMParser().parseFromString(source, 'image/svg+xml');
      const svg = documentSvg.documentElement;
      const [x, y, width, height] = svg.getAttribute('viewBox').split(' ').map(Number);
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-10000px;top:0';
      host.append(document.importNode(svg, true)); document.body.append(host);
      const holes = [...host.querySelectorAll('mask > path, mask > ellipse')].slice(1).map(node => {
        const box = node.getBBox();
        let point = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2);
        const transform = node.transform.baseVal.consolidate();
        if (transform) point = point.matrixTransform(transform.matrix);
        return [Math.round(point.x - x), Math.round(point.y - y)];
      });
      host.remove();
      const img = new Image(); img.src = path; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const alpha = ([px, py]) => rgba[(py * width + px) * 4 + 3];
      let white = 0, orange = 0, transparent = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3] === 0) transparent++;
        if (rgba[i + 3] > 250 && rgba[i] > 210 && rgba[i + 1] > 210 && rgba[i + 2] > 210) white++;
        if (rgba[i + 3] > 250 && rgba[i] > 180 && rgba[i + 1] > 40 && rgba[i + 1] < 230 && rgba[i + 2] < 140) orange++;
      }
      return {
        corners: [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]].map(alpha),
        holes: holes.map(alpha), white, orange, transparentFraction: transparent / (width * height),
        unsafe: svg.querySelectorAll('script, image, foreignObject, parsererror').length
      };
    }, logo);
    expect(pixels.corners).toEqual([0, 0, 0, 0]);
    expect(pixels.holes).toEqual(Array(logo.holes).fill(0));
    expect(pixels.white).toBeGreaterThan(1000); expect(pixels.orange).toBeGreaterThan(1000);
    expect(pixels.transparentFraction).toBeGreaterThan(0.4); expect(pixels.unsafe).toBe(0);
  }
});

test('logos completos en cabeceras de escritorio, tablet y móvil', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  for (const logo of logos) {
    await page.goto(logo.route);
    const img = page.getByRole('img', { name: logo.alt, exact: true });
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute('src', logo.path);
    for (const [size, width, height] of [['desktop', 1440, 1050], ['user-1952', 1952, 1269], ['tablet', 1024, 900], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await img.evaluate(async element => { await element.decode(); await document.fonts.ready; window.scrollTo(0, 0); });
      const bounds = await img.evaluate(element => {
        const rect = element.getBoundingClientRect(), parent = element.parentElement.getBoundingClientRect();
        return { loaded: element.complete && element.naturalWidth > 0, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, parentBottom: parent.bottom, ratio: rect.width / rect.height, naturalRatio: element.naturalWidth / element.naturalHeight };
      });
      expect(bounds.loaded).toBe(true); expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(width); expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.parentBottom + 1);
      expect(bounds.ratio).toBeCloseTo(bounds.naturalRatio, 1);
      await page.screenshot({ path: `.impeccable/review/logos-${logo.name}-${size}.png`, fullPage: true, animations: 'disabled' });
    }
  }
  expect(errors).toEqual([]);
});
