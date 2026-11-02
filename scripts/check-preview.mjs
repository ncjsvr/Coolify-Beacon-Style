import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { buildPreview, stripDocument } from './preview.mjs';

const args = process.argv.slice(2);
const get = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const cssPath = path.resolve(get('--css', 'beacon.user.css'));
const out = path.resolve(get('--out', path.join(process.env.TEMP || '.', 'beacon-preview-review')));
const tooling = get('--tooling', process.env.BEACON_TOOLING);
if (!tooling) throw new Error('Pass --tooling to a folder containing node_modules/playwright; dependencies stay outside the repository');
const require = createRequire(path.join(path.resolve(tooling), 'package.json'));
const { chromium } = require('playwright');
await fs.mkdir(out, { recursive: true });
const html = await buildPreview({ cssPath, outPath: path.join(out, 'index.html') });
const browser = await chromium.launch({ headless: true, executablePath: get('--browser', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'), args: ['--no-first-run', '--disable-extensions'] });
const checks = [];
const record = (name, pass, details) => checks.push({ name, pass, details });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(html).href);
  const screens = ['dashboard', 'resources', 'deployments', 'settings', 'environment', 'metrics', 'logs', 'canvas'];
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'wide', width: 1920, height: 1080 }, { name: 'mobile', width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const screen of screens) {
      await page.evaluate(s => window.showScreen(s), screen);
      await page.waitForTimeout(30);
      const audit = await page.evaluate(() => {
        const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }; };
        const header = rect(document.querySelector('.app-topbar'));
        const content = document.querySelector('#sample-content');
        const first = content.querySelector('h1,h2') || content.firstElementChild;
        const compact = Array.from(document.querySelectorAll('[data-compact-input]')).map(e => rect(e).height);
        const embedded = document.querySelector('.deployment-table-embedded .data-table-header');
        const hiddenNav = document.querySelector('.in-main-nav');
        const canvas = document.querySelector('[data-canvas-root]');
        return { header, first: rect(first), gap: rect(first).y - header.bottom, compact, documentWidth: document.documentElement.scrollWidth, viewport: innerWidth, embeddedTracks: embedded ? getComputedStyle(embedded).gridTemplateColumns.split(' ').filter(Boolean) : null, hiddenNav: hiddenNav ? getComputedStyle(hiddenNav).display : null, canvas: canvas ? { rect: rect(canvas), transform: getComputedStyle(canvas.firstElementChild).transform, node: rect(canvas.querySelector('.canvas-node')) } : null };
      });
      record(viewport.name + '/' + screen + '/document-overflow', audit.documentWidth <= audit.viewport + 1, { width: audit.documentWidth, viewport: audit.viewport });
      if (screen !== 'canvas') record(viewport.name + '/' + screen + '/header-clear', audit.gap >= 16 && audit.gap <= 56, { gap: audit.gap, headerBottom: audit.header.bottom, headingTop: audit.first.y });
      for (const [i, height] of audit.compact.entries()) record(viewport.name + '/' + screen + '/compact-field-' + i, Math.abs(height - 28) < 0.6, { height });
      if (audit.hiddenNav !== null) {
        const expected = viewport.width >= 1280 && screen !== 'logs' && screen !== 'canvas' ? 'block' : 'none';
        record(viewport.name + '/' + screen + '/responsive-configuration-navigation', audit.hiddenNav === expected, { display: audit.hiddenNav, expected });
      }
      if (audit.embeddedTracks) record(viewport.name + '/' + screen + '/embedded-grid', audit.embeddedTracks.length === (viewport.width >= 1536 ? 2 : 5), { tracks: audit.embeddedTracks });
      if (audit.canvas) {
        record(viewport.name + '/canvas/transform-preserved', audit.canvas.transform === 'matrix(1, 0, 0, 1, 0, 0)', audit.canvas);
        record(viewport.name + '/canvas/native-position', Math.abs(audit.canvas.rect.y - 48) < 1 && Math.abs(audit.canvas.rect.x - (viewport.width >= 1024 ? 224 : 0)) < 1, audit.canvas);
      }
      if (viewport.name !== 'wide' || screen === 'deployments') await page.screenshot({ path: path.join(out, viewport.name + '-' + screen + '.png'), fullPage: false });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const mode of ['light', 'custom-light', 'custom-dark']) {
    for (const screen of ['dashboard', 'settings']) {
      await page.evaluate(({ mode, screen }) => {
        const root = document.documentElement;
        root.classList.toggle('dark', mode === 'custom-dark');
        root.dataset.theme = mode.startsWith('custom') ? 'custom' : 'light';
        root.dataset.sidebarScheme = mode === 'custom-dark' ? 'dark' : 'light';
        root.style.setProperty('--theme-bg', '#fff7e9');
        root.style.setProperty('--theme-text', '#171717');
        root.style.setProperty('--theme-light', '1');
        root.style.setProperty('--theme-sidebar', '#ffffff');
        root.style.setProperty('--theme-sidebar-light', '1');
        window.showScreen(screen);
        const probe = document.createElement('div');
        probe.style.display = 'none';
        probe.innerHTML = '<button class="button button-highlighted" data-primary-probe>Primary</button><span class="text-warning" data-warning-probe>Warning</span>';
        document.querySelector('.app-main').append(probe);
      }, { mode, screen });
      const colors = await page.evaluate(() => {
        const panel = document.querySelector('.application-settings-section-body') || document.querySelector('.dashboard-activity .bg-white');
        const primary = document.querySelector('[data-primary-probe]');
        const warning = document.querySelector('[data-warning-probe]');
        return { panel: getComputedStyle(panel).backgroundColor, primaryFill: getComputedStyle(primary).backgroundColor, primaryText: getComputedStyle(primary).color, warningText: getComputedStyle(warning).color };
      });
      const rgb = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const avg = value => rgb(value).reduce((a, b) => a + b, 0) / 3;
      const warning = rgb(colors.warningText);
      record(mode + '/' + screen + '/dark-panel', avg(colors.panel) < 80, colors);
      record(mode + '/' + screen + '/primary-contrast', avg(colors.primaryFill) > 200 && avg(colors.primaryText) < 80, colors);
      record(mode + '/' + screen + '/warning-semantics', warning[0] > warning[2] + 40 && warning[1] > warning[2] + 20, colors);
    }
  }
  const source = stripDocument(await fs.readFile(cssPath, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  const preludes = Array.from(source.matchAll(/([^{}]+)\{/g), m => m[1].trim()).filter(s => !s.startsWith('@') && !/^(from|to|[\d.]+%)$/.test(s));
  const splitSelectors = text => {
    const result = []; let depth = 0, quote = '', start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) { if (c === quote && text[i - 1] !== '\\') quote = ''; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '(' || c === '[') depth++;
      if (c === ')' || c === ']') depth--;
      if (c === ',' && !depth) { result.push(text.slice(start, i).trim()); start = i + 1; }
    }
    result.push(text.slice(start).trim()); return result;
  };
  const selectors = preludes.flatMap(splitSelectors);
  const invalidSelectors = await page.evaluate(selectors => selectors.filter(s => !CSS.supports('selector(' + s + ')')), selectors);
  record('stylesheet/supported-selectors', invalidSelectors.length === 0, { count: selectors.length, invalidSelectors });
  const control = await browser.newPage();
  await control.setContent('<!doctype html><html><head><style>.app-main{padding:17px;background:rgb(17,34,51)}.application-settings-navigation{position:relative;color:rgb(51,68,85)}</style></head><body><main class="app-main">Unrelated application<aside class="application-settings-navigation"><a class="menu-item-active">Menu</a></aside></main></body></html>');
  await control.addStyleTag({ content: stripDocument(await fs.readFile(cssPath, 'utf8')) });
  const unrelated = await control.evaluate(() => ({ padding: getComputedStyle(document.querySelector('.app-main')).paddingTop, background: getComputedStyle(document.querySelector('.app-main')).backgroundColor, navigation: getComputedStyle(document.querySelector('.application-settings-navigation')).position }));
  record('unrelated-page/no-style-leak', unrelated.padding === '17px' && unrelated.background === 'rgb(17, 34, 51)' && unrelated.navigation === 'relative', unrelated);
} finally {
  await browser.close();
}
await fs.writeFile(path.join(out, 'checks.json'), JSON.stringify(checks, null, 2));
const failed = checks.filter(c => !c.pass);
console.log(JSON.stringify({ output: out, checks: checks.length, passed: checks.length - failed.length, failed }, null, 2));
if (failed.length && !args.includes('--baseline')) process.exitCode = 1;
