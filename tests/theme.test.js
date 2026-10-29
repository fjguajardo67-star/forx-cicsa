/* @vitest-environment jsdom */
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { initializeTheme, currentTheme, toggleTheme, syncThemeControl } from '../src/ui/theme.js';
import { mountMiDespensa } from '../src/ui/midespensa-app.js';
import { MemoryEntityRepository } from '../src/data/entity-repository.js';
import { PantryService } from '../src/domain/pantry-service.js';
import { PantryStoreAdapter } from '../src/data/pantry-store-adapter.js';
import { file, purchaseXml } from './fixtures/monthly.js';

const key = 'forx-v2-theme';
beforeEach(() => {
  // Node 26 exposes its own localStorage getter; use actual DOM storage here.
  const storageWindow = new JSDOM('', { url: 'http://localhost' }).window;
  vi.stubGlobal('localStorage', storageWindow.localStorage);
  vi.stubGlobal('sessionStorage', storageWindow.sessionStorage);
  window.localStorage.clear(); window.sessionStorage.clear();
  delete document.documentElement.dataset.theme;
  document.head.innerHTML = '<meta name="theme-color" content="#071a3d">';
  document.body.innerHTML = '<div id="app"></div><div id="live-region"></div>';
  history.replaceState(null, '', '#/despensa');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('tema compartido, sin cambios a los datos', () => {
  test('oscuro inicial, preferencia persistente y migración de la elección anterior', () => {
    expect(initializeTheme()).toBe('dark');
    window.sessionStorage.setItem(key, 'light');
    expect(initializeTheme()).toBe('light');
    expect(window.localStorage.getItem(key)).toBe('light');
    window.sessionStorage.setItem(key, 'dark');
    expect(initializeTheme()).toBe('light');
    toggleTheme();
    expect(initializeTheme()).toBe('dark');
    window.localStorage.setItem(key, 'unexpected'); window.sessionStorage.removeItem(key);
    expect(initializeTheme()).toBe('dark');
  });

  test('actualiza FORX aislado, las etiquetas y el color del navegador sin redibujar formularios', () => {
    initializeTheme();
    const host = document.createElement('div'); host.id = 'forx-module'; document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<button data-theme-toggle><span data-theme-label></span></button><input value="Sin guardar">';
    const button = root.querySelector('button'), input = root.querySelector('input');
    syncThemeControl(button);
    expect(button.getAttribute('aria-label')).toBe('Cambiar a tema claro');
    toggleTheme();
    expect(host.dataset.theme).toBe('light');
    expect(button.textContent).toBe('Cambiar a tema oscuro');
    expect(root.querySelector('input')).toBe(input);
    expect(input.value).toBe('Sin guardar');
    expect(document.querySelector('meta').content).toBe('#f3f6fc');
  });

  test('permite cambiar aunque el navegador bloquee el almacenamiento', () => {
    vi.spyOn(Object.getPrototypeOf(window.localStorage), 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Object.getPrototypeOf(window.localStorage), 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(initializeTheme()).toBe('dark');
    expect(() => toggleTheme()).not.toThrow();
    expect(currentTheme()).toBe('light');
  });

  test('MiDespensa conserva la edición, selección, scroll y todos los registros al alternar', async () => {
    const repository = new MemoryEntityRepository(), service = new PantryService(repository);
    await service.initialize();
    const store = await new PantryStoreAdapter(service).initialize();
    await store.importFiles([file('sintetico.xml', purchaseXml())], { period: '2026-09' });
    const before = await repository.exportSnapshot();
    initializeTheme();
    const dispose = await mountMiDespensa(document.querySelector('#app'), service);
    try {
      document.querySelector('[data-edit-review-product]').click();
      const input = document.querySelector('#review-product-form input[name="presentation"]');
      input.value = 'Caja sin guardar';
      const queue = document.querySelector('.queue'); queue.scrollTop = 130; queue.scrollLeft = 94;
      const selected = document.querySelector('[data-review-row].selected');
      document.querySelector('[data-theme-toggle]').click();
      expect(currentTheme()).toBe('light');
      expect(document.querySelector('#review-product-form input[name="presentation"]')).toBe(input);
      expect(input.value).toBe('Caja sin guardar');
      expect(document.querySelector('[data-review-row].selected')).toBe(selected);
      expect(queue.scrollTop).toBe(130); expect(queue.scrollLeft).toBe(94);
      expect(document.querySelector('[data-theme-toggle]').title).toBe('Cambiar a tema oscuro');
      document.querySelector('[data-theme-toggle]').click();
      expect(currentTheme()).toBe('dark');
      expect(await repository.exportSnapshot()).toEqual(before);
    } finally { dispose(); }
  });

  test('paleta clara: texto, estados, placeholders y foco con contraste suficiente', () => {
    const css = readFileSync('src/ui/midespensa-light.css', 'utf8');
    const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)].map(([,name,value]) => [name,value]));
    const luminance = hex => {
      const rgb = hex.slice(1).match(/../g).map(c => parseInt(c,16)/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4);
      return rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722;
    };
    const contrast = (a,b) => { const x=luminance(a), y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
    for (const foreground of ['ink','ink-soft','focus']) for (const background of ['paper','paper-strong','paper-muted','sage']) {
      expect(contrast(tokens[foreground],tokens[background]), `${foreground}/${background}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const [ink,surface] of [['success-ink','success-soft'],['warning-ink','warning-soft'],['error-ink','rust-soft']]) {
      expect(contrast(tokens[ink],tokens[surface]), `${ink}/${surface}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(tokens['line-dark'],tokens.field)).toBeGreaterThanOrEqual(3);
  });
});
