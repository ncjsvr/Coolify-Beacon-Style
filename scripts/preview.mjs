import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Review fixture informed by Unslop by Damir Sokolovsky (@heydamir), CC BY 4.0.
// Sample structures only; no connection to a live Coolify installation.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Rendered shape of components/navbar.blade.php in Coolify v4.5.3.
// Only sample routes/data. Keep submenu slots before the main menu, as upstream
// does, so checks catch focus-order and native x-show regressions.
export function sidebarFixture(resource = false) {
  const groups = {
    Monitoring: ['Analytics', 'Metrics'],
    Integrations: ['Sources', 'Destinations', 'Registries', 'S3 Storage'],
    'Shared Variables': ['Overview', 'Team', 'Projects', 'Environments', 'Servers'],
    Team: ['General', 'Members', 'Audit log', 'Admin View', 'Danger Zone'],
    Notifications: ['Email', 'Discord', 'Telegram', 'Slack', 'Pushover', 'Webhook'],
    'Keys & Tokens': ['Private Keys', 'Cloud Tokens', 'Integration Tokens', 'Cloud-Init Scripts', 'API Tokens'],
    Settings: ['General', 'Advanced', 'Updates', 'Authentication', 'Email', 'Backup']
  };
  const esc = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  const slug = value => value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
  const icon = '<span class="menu-item-icon" aria-hidden="true">▦</span>';
  const link = (label, route, extra = '') => '<a title="' + esc(label) + '" href="#sample-' + route + '" class="menu-item ' + extra + '">' + icon + '<span class="menu-item-label">' + esc(label) + '</span></a>';
  const sections = [
    [null, ['Dashboard', 'Projects', 'Monitoring', 'Terminal']],
    ['Infrastructure', ['Servers', 'Integrations', 'Shared Variables']],
    ['Manage', ['Team', 'Notifications', 'Keys & Tokens', 'Tags', 'Settings']]
  ];
  const submenus = Object.entries(groups).map(([label, children]) =>
    '<li x-show="navLevel === -1 &amp;&amp; submenu === \'' + esc(label) + '\'" class="contents" style="display:none">' +
    '<ul role="list" class="flex flex-col gap-y-0.5"><li class="mb-1"><button type="button" class="menu-item menu-back" data-sample-back>' + esc(label) + '</button></li>' +
    children.map(child => '<li>' + link(child, slug(label + '-' + child)) + '</li>').join('') + '</ul></li>'
  ).join('');
  const main = sections.map(([label, items]) => (label ? '<li class="nav-section mt-3" aria-hidden="true">' + label + '</li>' : '') + items.map(item =>
    '<li>' + (groups[item] ? '<button type="button" title="' + esc(item) + '" class="menu-item w-full" data-sample-submenu="' + esc(item) + '">' + icon + '<span class="menu-item-label flex-1 text-left">' + esc(item) + '</span><span class="nav-chevron" aria-hidden="true">›</span></button>' : link(item, slug(item), item === (resource ? 'Projects' : 'Dashboard') ? 'menu-item-active' : '')) + '</li>'
  ).join('')).join('');
  return '<nav class="sidebar-nav flex min-h-0 flex-col flex-1">' +
    '<div class="menu-item menu-search"><span>Search</span><kbd>Ctrl K</kbd></div>' +
    '<ul role="list" class="sidebar-menu -mx-1 flex min-h-0 flex-1 flex-col gap-y-0.5 overflow-y-auto px-1 pb-2">' +
    '<li x-show="navLevel === 0" data-nav-level="0" class="contents"' + (resource ? '' : ' style="display:none"') + '><ul role="list" class="flex flex-col gap-y-0.5"><li class="mb-1"><button type="button" class="menu-item menu-back" data-sample-back>Dashboard</button></li><li id="main-nav-context-0" class="nav-context min-w-0"><a href="#sample-general" class="menu-item menu-item-active">General</a><a href="#sample-domains" class="menu-item">Domains</a></li></ul></li>' +
    submenus + '<li x-show="navLevel === -1 &amp;&amp; !submenu" class="contents"' + (resource ? ' style="display:none"' : '') + '><ul role="list" class="flex flex-col gap-y-0.5">' + main + '</ul></li><li class="flex-1" aria-hidden="true"></li></ul>' +
    '<div class="sidebar-footer">Sample workspace</div></nav>';
}

export function stripDocument(css) {
  const start = css.indexOf('@-moz-document');
  if (start < 0) return css;
  const open = css.indexOf('{', start);
  const close = css.lastIndexOf('}');
  if (open < 0 || close < open || css.slice(close + 1).trim()) throw new Error('Unexpected UserCSS document wrapper');
  return css.slice(0, start) + css.slice(open + 1, close);
}

export async function buildPreview(options = {}) {
  const cssPath = options.cssPath || path.join(root, 'beacon.user.css');
  const outPath = path.resolve(options.outPath || path.join(root, 'preview/index.html'));
  const css = stripDocument(await fs.readFile(cssPath, 'utf8'));
  const template = await fs.readFile(path.join(root, 'preview/fixture.html'), 'utf8');
  const html = template.replace('<!-- BEACON_SIDEBAR -->', sidebarFixture()).replace('<!-- BEACON_STYLE -->', '<style id="beacon-userstyle">' + css.replaceAll('</style', '<\\/style') + '</style>');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, html);
  return outPath;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const get = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
  console.log(await buildPreview({ cssPath: path.resolve(get('--css', path.join(root, 'beacon.user.css'))), outPath: path.resolve(get('--out', path.join(root, 'preview/index.html'))) }));
}
