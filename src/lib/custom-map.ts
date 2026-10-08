/* ═══════════════════════════════════════════════════════════════
   Загрузка пользовательских тайловых карт (Яндекс, ESRI и т.п.)
   в OSIRIS через прокси /api/proxy-tiles.
   ═══════════════════════════════════════════════════════════════ */

export interface CustomMap {
  tiles: string[];        // шаблон тайлов с {z}/{x}/{y} (через прокси)
  center: [number, number]; // [lng, lat]
  zoom: number;
  maxZoom?: number;
  attribution?: string;
  label?: string;
  _ts?: number;           // маркер обновления (для useEffect)
}

const TILE_RE = /\{z\}\//;

/** Автокоррекция порядка координат в URL тайлов (некоторые сервисы используют {z}/{y}/{x}) */
function fixTileOrder(url: string): string {
  // Если в шаблоне порядок {z}/{y}/{x} — MapLibre ожидает {z}/{x}/{y}, меняем местами плейсхолдеры
  const m = url.match(/\{z\}\/\{(x|y)\}\/\{(x|y)\}/);
  if (m && m[1] === 'y' && m[2] === 'x') {
    return url.replace('{z}/{y}/{x}', '{z}/{x}/{y}');
  }
  return url;
}

/** Оборачиваем тайловый URL в серверный прокси (обход CORS/CSP) */
function proxied(tileUrl: string): string {
  const fixed = fixTileOrder(tileUrl);
  if (typeof window === 'undefined') return fixed;
  return `${window.location.origin}/api/proxy-tiles?url=${encodeURIComponent(fixed)}`;
}

/** Пробует разные варианты порядка x/y для Яндекс-подобных тайлов, возвращает рабочий */
async function probeTiles(candidates: string[]): Promise<string | null> {
  for (const c of candidates) {
    try {
      const res = await fetch(proxied(c), { method: 'GET' });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (blob.size > 500 && /image/.test(blob.type)) return c;
    } catch { /* пробуем следующий вариант */ }
  }
  return null;
}

/**
 * Парсит ссылку на карту Яндекса и строит набор тайлов.
 * Поддерживает:
 *  - https://yandex.ru/maps/?l=sat...&ll=LNG,LAT&z=Z...  (спутник)
 *  - произвольные прямые тайловые URL вида https://host/{z}/{x}/{y}.jpg
 */
export async function parseYandexLink(link: string): Promise<CustomMap> {
  let u: URL;
  try { u = new URL(link.trim()); }
  catch { throw new Error('Некорректная ссылка'); }

  // Центр и зум из параметров ссылки
  let center: [number, number] = [37.48, 48.57];
  let zoom = 8;
  const ll = u.searchParams.get('ll');
  if (ll) {
    const [lngS, latS] = ll.split(',').map(parseFloat);
    if (!isNaN(lngS) && !isNaN(latS)) center = [lngS, latS];
  }
  const z = parseFloat(u.searchParams.get('z') || '');
  if (!isNaN(z)) zoom = Math.min(Math.max(Math.round(z), 4), 19);

  const isSat = (u.searchParams.get('l') || '').includes('sat');

  // Кандидаты шаблонов Яндекс-спутника (разные зеркальные кластеры + порядок y/x)
  const variants: string[] = [];
  for (const host of ['01', '02', '03', '04']) {
    variants.push(`https://core-sat-s0${host}.yandex.net/sat/3mt/${isSat ? 'best' : 'best'}/{z}/{x}/{y}`);
    variants.push(`https://core-sat-s0${host}.yandex.net/sat/3mt/best/{z}/{y}/{x}`);
    variants.push(`https://kn0${host}-saturn.yandex-page01.nayawp.ru/hybrida/satellite-semi-hybrid/1j/pg/{z}/{x}/{y}`);
    variants.push(`https://kn0${host}-saturn.yandex-page01.nayawp.ru/hybrida/satellite/1j/pg/{z}/{x}/{y}`);
  }

  let working: string | null = null;
  for (const v of variants) {
    // Проверяем тайл рядом с центром карты пользователя
    const testUrl = v
      .replace('{z}', String(Math.min(zoom + 2, 18)))
      .replace('{x}', String(Math.round(((center[0] + 180) / 360) * Math.pow(2, Math.min(zoom + 2, 18)))))
      .replace('{y}', String(Math.round((1 - Math.log(Math.tan(center[1] * Math.PI / 180) + 1 / Math.cos(center[1] * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, Math.min(zoom + 2, 18)))));
    const ok = await probeTiles([testUrl]);
    if (ok) { working = v; break; }
  }

  if (!working) {
    throw new Error('NEED_PROXY');
  }

  return {
    tiles: [proxied(working)],
    center,
    zoom,
    maxZoom: 21,
    attribution: 'Яндекс',
    label: isSat ? 'Яндекс · Спутник' : 'Яндекс · Гибрид',
    _ts: Date.now(),
  };
}

/** Прямой тайловый URL (любой источник): https://.../{z}/{x}/{y}.png?ключ */
export async function parseTileUrl(link: string): Promise<CustomMap> {
  const trimmed = link.trim();
  if (!TILE_RE.test(trimmed) && !/\{z\}/.test(trimmed)) {
    throw new Error('В URL должны быть placeholders {z}/{x}/{y}');
  }
  const working = await probeTiles([trimmed, fixTileOrder(trimmed)]);
  const tpl = working || trimmed;
  return {
    tiles: [proxied(tpl.includes('{z}') ? tpl : tpl)],
    center: [37.48, 48.57],
    zoom: 8,
    maxZoom: 19,
    attribution: '',
    label: trimmed.split('/')[2] || 'Custom',
    _ts: Date.now(),
  };
}

/** Сохранение/загрузка выбранной карты в localStorage */
const LS_KEY = 'osiris_custom_map_v1';

export function saveCustomMap(m: CustomMap | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!m) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, JSON.stringify({ ...m, _ts: undefined }));
  } catch { /* ignore */ }
}

export function loadCustomMap(): CustomMap | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as CustomMap;
    if (!m.tiles?.length) return null;
    return { ...m, _ts: Date.now() };
  } catch { return null; }
}
