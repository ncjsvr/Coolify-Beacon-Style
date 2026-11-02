import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { stripDocument, sidebarFixture } from './preview.mjs';

// Check the real compiled Coolify CSS without accessing a signed-in session.
const args = process.argv.slice(2);
const get = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const tooling = get('--tooling', process.env.BEACON_TOOLING);
const nativePath = get('--native-css');
if (!tooling || !nativePath) throw new Error('Pass --native-css and --tooling (external Playwright folder)');
const require = createRequire(path.join(path.resolve(tooling), 'package.json'));
const { chromium } = require('playwright');
const native = await fs.readFile(nativePath, 'utf8');
const theme = stripDocument(await fs.readFile(get('--css', 'beacon.user.css'), 'utf8'));
const browser = await chromium.launch({ headless: true, executablePath: get('--browser', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'), args: ['--no-first-run', '--disable-extensions'] });
const checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const mode of ['dark', 'custom', 'light']) {
    await page.setContent('<!doctype html><html class="' + (mode === 'light' ? '' : 'dark') + '" data-theme="' + mode + '"><head><style>' + native + '</style><style>' + theme + '</style></head><body><div class="app-shell"><header class="app-topbar"><div class="app-topbar-brand"><a title="Coolify">Coolify</a></div></header><aside class="app-sidebar"><nav class="sidebar-nav"><a class="menu-item menu-item-active"><span class="menu-item-icon">D</span>Dashboard</a></nav></aside><main class="app-main"><div class="w-full"><div class="application-settings-form"><div class="dashboard-activity"><div><section><div class="mb-3 min-w-0 py-1.5"><div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><div class="flex min-w-0 items-baseline gap-2"><div class="flex min-w-0 items-center gap-1"><h2 id="heading" class="min-w-0 truncate text-[14px]! leading-5! font-semibold! text-black dark:text-fg">Recent deployments</h2></div></div></div></div><div class="flex min-w-0 flex-col gap-4"><div id="deployment-card" class="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-white/[0.05]"><a class="dashboard-deployment-table-grid"><div><p>api-gateway</p></div></a></div></div></section></div></div></div><h1 id="page-title" class="text-[24px]! leading-7! font-semibold!">Application</h1><button class="button button-highlighted rounded-md!" id="primary">Deploy</button></div></main></div></body></html>');
    const result = await page.evaluate(() => {
      const style = s => getComputedStyle(document.querySelector(s));
      return {
        heading: { size: style('#heading').fontSize, weight: style('#heading').fontWeight, line: style('#heading').lineHeight },
        groupBackground: style('#heading').backgroundColor,
        headingGroup: getComputedStyle(document.querySelector('#heading').parentElement.parentElement.parentElement).backgroundColor,
        sidebarImage: style('.sidebar-nav').backgroundImage,
        brandImage: style('.app-topbar-brand').backgroundImage,
        primary: { fill: style('#primary').backgroundColor, text: style('#primary').color },
        pageTitle: style('#page-title').fontSize,
        cardBackground: style('#deployment-card').backgroundColor
      };
    });
    const record = (name, pass) => checks.push({ name: mode + '/' + name, pass, details: result });
    record('real-heading-typography', result.heading.size === '20px' && result.heading.weight === '500' && result.heading.line === '28px');
    record('heading-not-a-card', result.headingGroup === 'rgba(0, 0, 0, 0)');
    record('no-sidebar-gradient', result.sidebarImage === 'none' && result.brandImage === 'none');
    record('page-title-size', result.pageTitle === '28px');
    record('primary-palette', result.primary.fill === 'rgb(237, 237, 240)' && result.primary.text === 'rgb(21, 22, 23)');
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent('<!doctype html><html class="dark" data-theme="dark"><head><style>' + native + '</style><style>' + theme + '</style></head><body><div class="app-shell"><header class="app-topbar"><div class="app-topbar-brand"><a title="Coolify">Coolify</a></div><div id="resource-action-hud-slot"><button>Desktop action</button></div></header><aside class="app-sidebar"><nav class="sidebar-nav"></nav></aside><main class="app-main"><div class="w-full"><nav class="w-full max-w-none"><div><div id="resource-header" class="mb-3 flex w-full min-w-0 items-start gap-3 xl:hidden"><div class="min-w-0 flex-1 lg:hidden" id="resource-identity"><h1>api-gateway</h1><span>Running</span></div><div id="application-mobile-actions" class="split-action"><button class="split-action-main">Redeploy</button><div role="menu" style="display:none" id="closed-menu"><button>Restart</button></div><div class="hidden" id="confirmation-triggers"><button>Stop</button></div></div></div></div></nav><section class="application-settings-workspace"><div class="grid gap-8 xl:grid-cols-[210px_minmax(0,1fr)]"><aside id="configuration-menu" class="application-settings-navigation in-main-nav min-w-0"><nav><a class="menu-item">General</a></nav></aside><div id="configuration-content" class="application-settings-form min-w-0"><section class="application-settings-section"><header><h3>General</h3></header><div class="application-settings-section-body"><input class="input" value="api-gateway"></div></section></div></div></section></div></main></div></body></html>');
    const state = await page.evaluate(() => {
      const el = id => document.getElementById(id), css = id => getComputedStyle(el(id));
      return { menu: css('configuration-menu').display, menuPosition: css('configuration-menu').position, contentColumn: css('configuration-content').gridColumnStart, header: css('resource-header').display, identity: css('resource-identity').display, hud: css('resource-action-hud-slot').display, confirmation: css('confirmation-triggers').display, closedMenu: css('closed-menu').display };
    });
    const desktop = width >= 1280;
    const record = (name, pass) => checks.push({ name: width + '/classic/' + name, pass, details: state });
    record('local-menu', state.menu === (desktop ? 'block' : 'none'));
    record('resource-header', state.header === 'flex');
    record('resource-identity', state.identity !== 'none');
    record('desktop-actions-deduplicated', !desktop || state.hud === 'none');
    record('local-content-column', state.contentColumn === (desktop ? '2' : '1'));
    record('confirmation-triggers-stay-hidden', state.confirmation === 'none');
    record('action-menu-stays-closed', state.closedMenu === 'none');
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.setContent('<!doctype html><html class="dark" data-theme="dark"><head><style>' + native + '</style><style>' + theme + '</style></head><body><div class="app-shell"><header class="app-topbar"><div class="app-topbar-brand"><a title="Coolify">Coolify</a></div></header><aside class="app-sidebar" style="position:fixed;top:48px;bottom:0;width:224px;display:flex;flex-direction:column">' + sidebarFixture(true) + '</aside><main class="app-main" style="margin-left:224px"><div class="w-full"><h1>api-gateway</h1><section class="application-settings-workspace"><div class="grid"><aside class="application-settings-navigation in-main-nav"><nav><a href="#general" class="menu-item">General</a></nav></aside><div class="application-settings-form"><input class="input" aria-label="Name" value="api-gateway"></div></div></section></div></main></div></body></html>');
  const navRecord = (name, pass, details) => checks.push({ name: 'global-menu/' + name, pass, details });
  const mainMenu = '.app-sidebar .sidebar-menu > li[x-show="navLevel === -1 && !submenu"]';
  const contextMenu = '.app-sidebar .sidebar-menu > li[data-nav-level]';
  const groupMenu = label => '.app-sidebar .sidebar-menu > li[x-show*="submenu ==="][x-show*="' + label + '"]';
  const railOrder = () => page.evaluate(() => [...document.querySelectorAll('.app-sidebar .sidebar-menu :is(a, button)')]
    .filter(el => el.checkVisibility())
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    .map(el => getComputedStyle(el, '::after').content.replace(/^"|"$/g, '').replace(/^none$/, '') || el.title || el.textContent.trim()));
  const groups = ['Monitoring', 'Integrations', 'Shared Variables', 'Team', 'Notifications', 'Keys & Tokens', 'Settings'];
  const expected = ['Dashboard', 'Projects', 'Terminal', 'Servers', 'Tags', ...groups];
  navRecord('resource-context-removed', !await page.locator(contextMenu).isVisible());
  navRecord('local-rail-retained', await page.locator('.in-main-nav').isVisible());
  const visualOrder = await railOrder();
  navRecord('flat-rail-order', JSON.stringify(visualOrder) === JSON.stringify(expected), { visualOrder });
  for (const label of groups) {
    navRecord(label + '/group-button-hidden', !await page.locator(mainMenu + ' button[title="' + label + '"]').isVisible());
    navRecord(label + '/single-native-link', await page.locator(groupMenu(label.split(' ')[0]) + ' a:visible').count() === 1);
  }
  await page.locator(mainMenu + ' a[title="Dashboard"]').focus();
  const tabOrder = ['Dashboard'];
  for (let i = 1; i < expected.length; i++) {
    await page.keyboard.press('Tab');
    tabOrder.push(await page.evaluate(() => getComputedStyle(document.activeElement, '::after').content.replace(/^"|"$/g, '').replace(/^none$/, '') || document.activeElement.title));
  }
  navRecord('tab-follows-visual-order', JSON.stringify(tabOrder) === JSON.stringify(expected), { tabOrder });
  await page.locator('input').focus();
  const nativeRetained = async () => await page.locator(contextMenu).isVisible() && !await page.locator(mainMenu).first().isVisible();
  await page.setViewportSize({ width: 1200, height: 1000 });
  navRecord('compact-native-context-retained', await nativeRetained());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('main').evaluate(el => el.classList.add('app-main-full'));
  navRecord('canvas-native-context-retained', await nativeRetained());
  await page.locator('main').evaluate(el => el.classList.remove('app-main-full'));
  await page.locator('main > div').evaluate(el => el.classList.add('runtime-logs-page'));
  navRecord('logs-native-context-retained', await nativeRetained());
  await page.locator('main > div').evaluate(el => el.classList.remove('runtime-logs-page'));
  await page.locator('.in-main-nav').evaluate(el => el.remove());
  navRecord('no-local-rail-no-menu-override', await nativeRetained());
} finally { await browser.close(); }
console.log(JSON.stringify({ checks: checks.length, passed: checks.filter(c => c.pass).length, failed: checks.filter(c => !c.pass) }, null, 2));
if (checks.some(c => !c.pass) && !args.includes('--baseline')) process.exitCode = 1;
