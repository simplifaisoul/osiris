// Isolated production-browser smoke test. No runtime dependency or user profile.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.env.PREVIEW_URL || 'http://127.0.0.1:3001';
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
  throw new Error('This smoke test only accepts localhost previews.');
}
const profile = await mkdtemp(join(tmpdir(), 'osiris-smoke-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--window-size=1440,1000', 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
const pending = new Map();
const errors = [];
const requests = [];
const requestUrls = new Map();
const network = new Map();
const warnings = [];
const checks = [];
const measurements = {};
const scenario = process.env.SMOKE_SCENARIO || 'startup';
let sequence = 0;
let buffer = '';
let session;
chrome.stdio[4].on('data', chunk => {
  buffer += chunk.toString();
  let end;
  while ((end = buffer.indexOf('\0')) !== -1) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (message.id) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) task?.reject(new Error(JSON.stringify(message.error)));
      else task?.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails);
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map(value => value.description || value.value));
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'warning') {
      warnings.push(message.params.args.map(value => value.description || value.value));
    } else if (message.method === 'Network.requestWillBeSent') {
      requestUrls.set(message.params.requestId, message.params.request.url);
      network.set(message.params.requestId, { url: message.params.request.url, state: 'pending' });
    } else if (message.method === 'Network.responseReceived') {
      const record = network.get(message.params.requestId);
      if (record) record.status = message.params.response.status;
    } else if (message.method === 'Network.loadingFinished') {
      const record = network.get(message.params.requestId);
      if (record) record.state = 'complete';
    } else if (message.method === 'Network.loadingFailed') {
      const record = network.get(message.params.requestId);
      if (record) record.state = 'failed';
      requests.push({ ...message.params, url: requestUrls.get(message.params.requestId) });
    } else if (message.method === 'Fetch.requestPaused') {
      // Deterministic visual-test locations, confined to the localhost geo API.
      const location = scenario === 'buildings' ? { lat: 40.7128, lon: -74.006 } : { lat: 46.02, lon: 7.75 };
      const satelliteFixture = {
        satellites: Array.from({ length: 200 }, (_, i) => ({ name: `RENDER TEST ${i}`, noradId: String(90000 + i),
          lat: -60 + (i % 20) * 6, lng: -170 + Math.floor(i / 20) * 34, alt: 550, color: '#38bdf8', category: 'comms', mission: 'Render test' })),
        timestamp: new Date().toISOString(), total: 200, category_counts: { comms: 200 },
      };
      const payload = new URL(message.params.request.url).pathname === '/api/satellites'
        ? satelliteFixture : { status: 'success', city: 'Visual test location', ...location };
      void command('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      }).catch(error => errors.push(String(error)));
    }
  }
});
function command(method, params = {}, sessionId = session) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    chrome.stdio[3].write(`${JSON.stringify({ id, method, params, sessionId: sessionId ?? undefined })}\0`);
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function check(name, expression) {
  checks.push({ name, passed: Boolean(await evaluate(expression)) });
}
async function click(label) {
  await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(b => [b.getAttribute('aria-label'), b.getAttribute('title'), b.textContent.trim()].some(text => text?.toLowerCase() === ${JSON.stringify(label.toLowerCase())})); if (!button) throw new Error('Missing button: ' + ${JSON.stringify(label)}); button.scrollIntoView({block: 'nearest'}); button.click(); })()`);
}
async function openDisplay() {
  if (scenario === 'mobile') { await click('LAYERS'); await pause(400); }
  else if (!await evaluate(`document.querySelector('button[title="DISPLAY"]')?.getAttribute('aria-expanded') === 'true'`)) { await click('DISPLAY'); await pause(250); }
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = setTimeout(() => {
  console.error('Browser test timed out');
  chrome.kill();
  process.exitCode = 1;
}, 100_000);
try {
  const { targetId } = await command('Target.createTarget', { url: 'about:blank' });
  ({ sessionId: session } = await command('Target.attachToTarget', { targetId, flatten: true }));
  await command('Page.bringToFront');
  await command('Emulation.setFocusEmulationEnabled', { enabled: true });
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Network.enable');
  const system = await command('SystemInfo.getInfo', {}, null);
  measurements.graphics = { devices: system.gpu.devices, renderer: system.gpu.auxAttributes?.glRenderer, features: system.gpu.featureStatus };
  if (['imagery', 'buildings', 'terrain-camera'].includes(scenario)) await command('Fetch.enable', { patterns: [{ urlPattern: `${new URL(url).origin}/api/geo*` }] });
  if (scenario === 'satellites') await command('Fetch.enable', { patterns: [{ urlPattern: `${new URL(url).origin}/api/satellites` }] });
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `window.__previewLongTasks = []; new PerformanceObserver(list => { for (const e of list.getEntries()) window.__previewLongTasks.push({start: Math.round(e.startTime), ms: Math.round(e.duration)}); }).observe({type: 'longtask', buffered: true});` });
  if (scenario === 'recovery') await command('Network.setBlockedURLs', { urls: [`${new URL(url).origin}/dark-matter-style.json*`] });
  await command('Emulation.setDeviceMetricsOverride', scenario === 'mobile'
    ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
    : { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url });
  if (process.env.PROBE_MAP_NETWORK) {
    const probe = await command('Runtime.evaluate', {
      expression: `Promise.all(['https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json','https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json','https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/2/2/1.mvt','https://s3.amazonaws.com/elevation-tiles-prod/terrarium/10/531/363.png'].map(async url => { try { const r = await fetch(url, {signal: AbortSignal.timeout(12000)}); return {url, status:r.status, bytes:(await r.arrayBuffer()).byteLength}; } catch(e) { return {url, error:String(e)}; } }))`,
      awaitPromise: true, returnByValue: true,
    });
    console.log('Network probe:', JSON.stringify(probe.result));
  }
  // Wait for asynchronous module workers, style loading and initial data layers.
  await new Promise(resolve => setTimeout(resolve, 25_000));
  if (process.env.PROFILE_TERRAIN) { await command('Profiler.enable'); await command('Profiler.start'); }
  if (scenario === 'recovery') {
    await check('Failed style shows recovery state', `document.querySelector('[data-map-status]')?.dataset.mapStatus === 'error' && document.body.innerText.includes('Retry map')`);
    await command('Network.setBlockedURLs', { urls: [] });
    measurements.retryVisibility = await evaluate(`({hidden: document.hidden, state: document.visibilityState})`);
    await command('Page.bringToFront');
    await click('Retry map');
    const retryStarted = Date.now();
    while (Date.now() - retryStarted < 25_000 && !await evaluate(`document.querySelector('[data-map-status]')?.dataset.mapStatus === 'ready'`)) await pause(250);
    measurements.recoveryMs = Date.now() - retryStarted;
    await check('Retry restores one working map', `document.querySelector('[data-map-status]')?.dataset.mapStatus === 'ready' && document.querySelectorAll('.maplibregl-canvas').length === 1`);
  } else {
    await check('Fresh map finishes loading', `document.querySelector('[data-map-status]')?.dataset.mapStatus === 'ready'`);
    await check('Globe projection is actually initialized', `document.querySelector('[data-map-status]')?.dataset.mapProjection === 'globe'`);
    await check('Terrain is not fetched during startup', `!performance.getEntriesByType('resource').some(r => r.name.includes('elevation-tiles-prod'))`);
    if (scenario === 'zoom') {
      await openDisplay();
      const zoom = () => evaluate(`Number(document.body.innerText.match(/ZOOM\\s+([\\d.]+)/)?.[1])`);
      measurements.beforeZoom = await zoom();
      for (let i = 0; i < 3; i++) { await click('Zoom in'); await pause(60); }
      await pause(1000);
      measurements.afterRapidZoom = await zoom();
      checks.push({ name: 'Three rapid zoom taps preserve all three steps', passed: Math.abs(measurements.afterRapidZoom - measurements.beforeZoom - 3) < 0.15 });
      await click('3D Terrain');
      await pause(2000);
      for (let i = 0; i < 12; i++) { await click(i % 2 ? '2D Map' : '3D Terrain'); await pause(80); }
      await pause(2000);
      await check('Rapid projection switching keeps one usable map', `document.querySelector('[data-map-status]')?.dataset.mapStatus === 'ready' && document.querySelectorAll('.maplibregl-canvas').length === 1`);
      await check('Final flat projection is applied', `document.querySelector('[data-map-status]')?.dataset.mapProjection === 'mercator'`);
      measurements.longTasks = await evaluate('window.__previewLongTasks');
      measurements.heap = await command('Runtime.getHeapUsage');
    }
    if (scenario === 'terrain-camera') {
      await openDisplay();
      const camera = () => evaluate(`JSON.parse(document.querySelector('[data-map-status]').dataset.mapCamera)`);
      const unchanged = (name, before, after) => checks.push({ name, passed: ['zoom', 'pitch', 'bearing', 'lat', 'lng'].every(key => Math.abs(before[key] - after[key]) < 0.00001) });
      measurements.overviewBefore = await camera();
      await click('3D Terrain'); await pause(1500);
      measurements.overviewAfter = await camera();
      unchanged('Enabling terrain at overview zoom leaves the camera alone', measurements.overviewBefore, measurements.overviewAfter);
      await click('3D Terrain'); await pause(500);
      for (let i = 0; i < 5; i++) { await click('Zoom in'); await pause(60); }
      await pause(2000);
      measurements.closeupBefore = await camera();
      await click('3D Terrain'); await pause(8000);
      measurements.closeupAfter = await camera();
      await check('Terrain is rendered for the close-up camera check', `document.body.innerText.includes('Terrain on')`);
      unchanged('Loading mountain elevation does not auto-zoom or tilt', measurements.closeupBefore, measurements.closeupAfter);
      await click('3D Terrain'); await pause(1500);
      measurements.disabled = await camera();
      unchanged('Disabling terrain preserves the chosen camera', measurements.closeupBefore, measurements.disabled);
      await click('2D Map'); await pause(750);
      measurements.flatBefore = await camera();
      await click('3D Terrain'); await pause(4000);
      measurements.flatAfter = await camera();
      unchanged('Enabling terrain from flat mode does not zoom or tilt', measurements.flatBefore, measurements.flatAfter);
    }
    if (scenario === 'mobile') {
      await openDisplay();
      await click('3D Terrain');
      await pause(1_500);
      await check('Mobile terrain selection remains zoom gated', `document.body.innerText.includes('Terrain at zoom 10+') && !performance.getEntriesByType('resource').some(r => r.name.includes('elevation-tiles-prod'))`);
      await check('Mobile viewport has no horizontal overflow', `document.documentElement.scrollWidth === window.innerWidth`);
      await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Zoom to terrain')?.scrollIntoView({block: 'nearest'})`);
      await pause(250);
    }
    if (scenario === 'terrain') {
      await openDisplay();
      await check('Terrain sits beside Buildings, not in the view strip', `!!document.querySelector('button[aria-label="3D Buildings"]') && !!document.querySelector('button[aria-label="3D Terrain"]') && !document.querySelector('button[title="3D Terrain Globe"]')`);
      await click('3D Terrain');
      await pause(1_500);
      await check('Globe terrain selection is zoom gated', `document.body.innerText.includes('Terrain at zoom 10+') && !performance.getEntriesByType('resource').some(r => r.name.includes('elevation-tiles-prod'))`);
      await click('Zoom to terrain');
      await pause(8_000);
      await check('Zoomed terrain finishes loading', `document.body.innerText.includes('Terrain on')`);
      const terrainScreenshot = await command('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(profile, 'terrain.png'), Buffer.from(terrainScreenshot.data, 'base64'));
      await click('3D Terrain');
      await pause(1_500);
      await check('Terrain toggles off without replacing the canvas', `document.querySelector('[data-map-status]')?.dataset.mapStatus === 'ready' && document.querySelectorAll('.maplibregl-canvas').length === 1 && !document.body.innerText.includes('Terrain on')`);
      const before = await evaluate(`performance.getEntriesByType('resource').filter(r => r.name.includes('elevation-tiles-prod')).length`);
      const reenableStarted = Date.now();
      await click('3D Terrain');
      while (Date.now() - reenableStarted < 12000 && !await evaluate(`document.body.innerText.includes('Terrain on')`)) await pause(200);
      measurements.terrainReenableMs = Date.now() - reenableStarted;
      const after = await evaluate(`performance.getEntriesByType('resource').filter(r => r.name.includes('elevation-tiles-prod')).length`);
      measurements.terrainRequestsBeforeReenable = before; measurements.terrainRequestsAfterReenable = after;
      checks.push({ name: 'Same-area re-enable reuses elevation cache', passed: after === before });
      await check('Cached re-enable finishes loading', `document.body.innerText.includes('Terrain on')`);
      await click('Ghost Protocol'); await pause(8000);
      await openDisplay();
      await check('Theme remount does not replay an earlier terrain zoom request', `document.querySelector('[data-map-status]')?.dataset.mapStatus === 'ready' && JSON.parse(document.querySelector('[data-map-status]').dataset.mapCamera).zoom < 10 && document.querySelector('button[aria-label="3D Terrain"]')?.getAttribute('aria-pressed') === 'true'`);
      await click('2D Map'); await pause(1000);
      await check('2D mode disables terrain and buildings', `document.querySelector('button[aria-label="3D Terrain"]')?.getAttribute('aria-pressed') === 'false' && document.querySelector('button[aria-label="3D Buildings"]')?.getAttribute('aria-pressed') === 'false'`);
    }
    if (scenario === 'imagery') {
      await openDisplay();
      await click('Day / Night Cycle');
      await click('3D Terrain'); await pause(500);
      await click('Zoom to terrain'); await pause(8000);
      for (let i = 0; i < 2; i++) { await click('Zoom in'); await pause(60); }
      await click('Satellite View'); await pause(8000);
      await check('Mountain terrain works with satellite imagery', `document.body.innerText.includes('Terrain on') && performance.getEntriesByType('resource').some(r => r.name.includes('World_Imagery'))`);
      measurements.longTasks = await evaluate('window.__previewLongTasks');
    }
    if (scenario === 'buildings') {
      await openDisplay();
      await click('Day / Night Cycle'); await click('3D Buildings');
      for (let i = 0; i < 8; i++) { await click('Zoom in'); await pause(60); }
      await pause(8000);
      await check('Building close-up keeps the map usable', `document.querySelector('[data-map-status]')?.dataset.mapStatus === 'ready' && document.querySelector('button[aria-label="3D Buildings"]')?.getAttribute('aria-pressed') === 'true'`);
      await check('Buildings reuse the existing vector tiles without elevation', `!performance.getEntriesByType('resource').some(r => /openfreemap|elevation-tiles-prod/.test(r.name))`);
      if (process.env.COMBINED_TERRAIN) {
        await click('3D Terrain'); await pause(7000);
        await check('Buildings and terrain work together on one canvas', `document.body.innerText.includes('Terrain on') && document.querySelector('button[aria-label="3D Buildings"]')?.getAttribute('aria-pressed') === 'true' && document.querySelectorAll('.maplibregl-canvas').length === 1`);
      }
    }
    if (scenario === 'satellites') {
      await click('SPACE TRACKING'); await pause(250); await click('All Satellites'); await pause(2000);
      await check('Satellite renderer receives the 200-object fixture', `document.querySelector('button[aria-label="All Satellites"]')?.textContent.includes('200')`);
      for (let i = 0; i < 8; i++) { await click('Zoom out'); await pause(60); }
      await pause(2000);
      for (let i = 0; i < 4; i++) { await click('2D Map'); await pause(750); await click('3D Globe'); await pause(750); }
      await check('Active satellite layer survives projection changes', `document.querySelector('[data-map-status]')?.dataset.mapStatus === 'ready' && document.querySelectorAll('.maplibregl-canvas').length === 1`);
    }
  }
  const result = await command('Runtime.evaluate', {
    expression: `JSON.stringify({title: document.title, text: document.body.innerText.slice(0, 6000), canvases: [...document.querySelectorAll('canvas')].map(c => ({width: c.width, height: c.height})), resources: performance.getEntriesByType('resource').filter(r => /maplibre|\\.js|\\.mjs|proxy-tiles/.test(r.name)).map(r => ({url: r.name, bytes: r.transferSize, duration: Math.round(r.duration)}))})`,
    returnByValue: true,
  });
  if (process.env.PROFILE_TERRAIN) {
    const { profile: cpu } = await command('Profiler.stop');
    await writeFile(join(profile, 'terrain.cpuprofile'), JSON.stringify(cpu));
    const totals = new Map();
    cpu.samples?.forEach((id, i) => totals.set(id, (totals.get(id) ?? 0) + cpu.timeDeltas[i]));
    measurements.cpuTop = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([id, us]) => ({ ms: Math.round(us / 1000), frame: cpu.nodes.find(n => n.id === id)?.callFrame }));
  }
  const visual = await command('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
  await writeFile(join(profile, 'visual.jpg'), Buffer.from(visual.data, 'base64'));
  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(profile, 'preview.png'), Buffer.from(screenshot.data, 'base64'));
  checks.push({ name: 'No camera or renderer failures', passed: !warnings.some(w => /Projection switch failed|TypeError|Satellite picking unavailable|Map initialization failed/.test(JSON.stringify(w))) });
  measurements.mapNetwork = [...network.values()].filter(r => /cartocdn|maplibre|dark-matter-style/.test(r.url));
  measurements.visibility = await evaluate(`({hidden: document.hidden, state: document.visibilityState})`);
  const report = { scenario, checks, measurements, page: JSON.parse(result.result.value), errors, warnings, failedRequests: requests, screenshot: join(profile, 'preview.png') };
  await writeFile(join(profile, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ scenario, checks, measurements, errors, warnings, failedRequests: requests, report: join(profile, 'report.json'), screenshot: report.screenshot }, null, 2));
  process.exitCode = errors.length || checks.some(c => !c.passed) ? 1 : 0;
} finally {
  clearTimeout(deadline);
  await command('Browser.close', {}, undefined).catch(() => {});
  chrome.kill();
}
