import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const terrainOutputPath = resolve('app/client/public/assets/world/terrain/terrain-atlas.webp');
const biomeOutputPath = resolve('app/client/public/assets/world/terrain/biome-atlas.webp');
const riverOutputPath = resolve('app/client/public/assets/world/terrain/river-atlas.webp');
const chromePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch(existsSync(chromePath) ? { executablePath: chromePath } : {});

try {
  const page = await browser.newPage({ viewport: { width: 480, height: 84 }, deviceScaleFactor: 1 });
  await page.setContent(terrainAtlasSvg());
  await mkdir(dirname(terrainOutputPath), { recursive: true });
  await page.screenshot({
    path: terrainOutputPath,
    type: 'webp',
    omitBackground: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 864, height: 84 });
  await page.setContent(biomeAtlasSvg());
  await page.screenshot({
    path: biomeOutputPath,
    type: 'webp',
    omitBackground: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 768, height: 672 });
  await page.setContent(riverAtlasSvg());
  await page.screenshot({
    path: riverOutputPath,
    type: 'webp',
    omitBackground: true,
    animations: 'disabled',
  });
} finally {
  await browser.close();
}

function terrainAtlasSvg() {
  const terrainFrames = [
    { fill: '#0b355d', highlight: '#317cac', pattern: 'waves-deep' },
    { fill: '#087886', highlight: '#7bd5bf', pattern: 'waves-shallow' },
    { fill: '#07556e', highlight: '#2d99a2', pattern: 'waves-sea' },
    { fill: '#176fa7', highlight: '#72c8dc', pattern: 'waves-lake' },
    { fill: '#4d6d33', highlight: '#9aaa57', pattern: 'land' },
  ];
  const frames = terrainFrames
    .map(
      (frame, index) => `
        <g transform="translate(${index * 96},0)">
          <polygon class="hex" points="24,0 72,0 96,42 72,84 24,84 0,42" fill="${frame.fill}" />
          <polygon points="24,2 72,2 93,42 72,82 24,82 3,42" fill="url(#${frame.pattern})" opacity="0.48" />
          <polygon points="24,1 72,1 95,42 72,83 24,83 1,42" fill="none" stroke="#08110b" stroke-width="2" />
          <path d="M24 2H72L93 42" fill="none" stroke="${frame.highlight}" stroke-width="1" opacity="0.55" />
        </g>`,
    )
    .join('');

  return `<!doctype html>
    <html><body style="margin:0;background:transparent;overflow:hidden">
      <svg xmlns="http://www.w3.org/2000/svg" width="480" height="84" viewBox="0 0 480 84">
        <defs>
          <pattern id="waves-deep" width="18" height="12" patternUnits="userSpaceOnUse">
            <path d="M0 7c4-5 8 5 12 0s5-2 6-3" fill="none" stroke="#317cac" stroke-width="1.25" opacity=".8"/>
          </pattern>
          <pattern id="waves-shallow" width="16" height="10" patternUnits="userSpaceOnUse">
            <path d="M0 6c3-4 7 4 11 0s4-2 5-3" fill="none" stroke="#c4f3ce" stroke-width="1.15" opacity=".9"/>
          </pattern>
          <pattern id="waves-sea" width="20" height="14" patternUnits="userSpaceOnUse">
            <path d="M0 8c5-6 10 6 15 0s4-3 5-4" fill="none" stroke="#2d99a2" stroke-width="1.2" opacity=".85"/>
          </pattern>
          <pattern id="waves-lake" width="14" height="11" patternUnits="userSpaceOnUse">
            <path d="M0 7c4-3 7 3 11 0s2-2 3-2" fill="none" stroke="#b4e6ea" stroke-width="1.1" opacity=".85"/>
          </pattern>
          <pattern id="land" width="16" height="14" patternUnits="userSpaceOnUse">
            <path d="M3 13l3-8 3 8M8 12l3-6 3 6" fill="none" stroke="#a9b96c" stroke-width="1.35" opacity=".85"/>
            <circle cx="2" cy="3" r="1" fill="#303f25" opacity=".7"/>
          </pattern>
        </defs>
        ${frames}
      </svg>
    </body></html>`;
}

function riverAtlasSvg() {
  const edgeCenters = [
    [48, 0],
    [84, 21],
    [84, 63],
    [48, 84],
    [12, 63],
    [12, 21],
  ];
  const frames = Array.from({ length: 64 }, (_, mask) => {
    const column = mask % 8;
    const row = Math.floor(mask / 8);
    const paths = edgeCenters
      .map(([x, y], direction) =>
        (mask & (1 << direction)) === 0
          ? ''
          : `<path d="M48 42 L${x} ${y}" fill="none" stroke="#062d45" stroke-width="8" stroke-linecap="round" />
             <path d="M48 42 L${x} ${y}" fill="none" stroke="#4db5d2" stroke-width="4" stroke-linecap="round" />
             <path d="M48 42 L${x} ${y}" fill="none" stroke="#d2f5ff" stroke-width="1" stroke-linecap="round" opacity=".8" />`,
      )
      .join('');
    const junction = mask === 0 ? '' : '<circle cx="48" cy="42" r="3" fill="#4db5d2" />';

    return `<g transform="translate(${column * 96},${row * 84})">${paths}${junction}</g>`;
  }).join('');

  return `<!doctype html>
    <html><body style="margin:0;background:transparent;overflow:hidden">
      <svg xmlns="http://www.w3.org/2000/svg" width="768" height="672" viewBox="0 0 768 672">
        ${frames}
      </svg>
    </body></html>`;
}

function biomeAtlasSvg() {
  const biomeFrames = [
    { fill: '#dbe8e9', detail: '#91abb2', pattern: 'snow-speckles' },
    { fill: '#829591', detail: '#c4d0b5', pattern: 'tundra-grass' },
    { fill: '#285b4f', detail: '#9bb86d', pattern: 'conifers' },
    { fill: '#a77b3d', detail: '#dbc276', pattern: 'dunes' },
    { fill: '#6f9d47', detail: '#c2d36e', pattern: 'grass' },
    { fill: '#356b39', detail: '#b1ca70', pattern: 'broadleaf' },
    { fill: '#bd7131', detail: '#f0c66d', pattern: 'dunes' },
    { fill: '#a3913c', detail: '#d8d273', pattern: 'savanna' },
    { fill: '#185c3b', detail: '#8ec86f', pattern: 'rainforest' },
  ];
  const frames = biomeFrames
    .map(
      (frame, index) => `
        <g transform="translate(${index * 96},0)">
          <polygon points="24,3 72,3 92,42 72,81 24,81 4,42" fill="${frame.fill}" opacity=".86" />
          <polygon points="24,4 72,4 91,42 72,80 24,80 5,42" fill="url(#${frame.pattern})" opacity=".72" />
          <path d="M24 4H72L91 42" fill="none" stroke="${frame.detail}" stroke-width="1" opacity=".48" />
        </g>`,
    )
    .join('');

  return `<!doctype html>
    <html><body style="margin:0;background:transparent;overflow:hidden">
      <svg xmlns="http://www.w3.org/2000/svg" width="864" height="84" viewBox="0 0 864 84">
        <defs>
          <pattern id="snow-speckles" width="15" height="13" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.2" fill="#ffffff"/><circle cx="11" cy="9" r=".9" fill="#ffffff"/></pattern>
          <pattern id="tundra-grass" width="13" height="13" patternUnits="userSpaceOnUse"><path d="M2 12l2-5 2 5M8 12l1-6 2 6" fill="none" stroke="#d7e0bd" stroke-width="1"/></pattern>
          <pattern id="conifers" width="16" height="15" patternUnits="userSpaceOnUse"><path d="M4 13V5l-3 5h6L4 2l-3 5h6M12 14V7l-3 5h6l-3-7-3 5h6" fill="#9cbd70" opacity=".85"/></pattern>
          <pattern id="dunes" width="19" height="13" patternUnits="userSpaceOnUse"><path d="M0 10c5-6 10 2 19-5" fill="none" stroke="#f0cf78" stroke-width="1.4"/></pattern>
          <pattern id="grass" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M3 13l2-7 1 7M9 13l2-5 1 5" fill="none" stroke="#d7dc7d" stroke-width="1.2"/></pattern>
          <pattern id="broadleaf" width="16" height="15" patternUnits="userSpaceOnUse"><circle cx="4" cy="5" r="3" fill="#a5c86e"/><circle cx="10" cy="9" r="3.5" fill="#a5c86e"/><path d="M4 8v5M10 12v2" stroke="#273c25" stroke-width="1"/></pattern>
          <pattern id="savanna" width="20" height="16" patternUnits="userSpaceOnUse"><path d="M5 14V8m0 0c-4 0-3-4 0-3 1-3 4-1 2 2m8 7V9m0 0c-3 0-3-3 0-3 1-2 3 0 2 2" fill="none" stroke="#d9d176" stroke-width="1.25"/></pattern>
          <pattern id="rainforest" width="17" height="16" patternUnits="userSpaceOnUse"><circle cx="4" cy="5" r="3.5" fill="#78bd69"/><circle cx="10" cy="8" r="4" fill="#73ae5e"/><circle cx="14" cy="3" r="2.5" fill="#91d47a"/></pattern>
        </defs>
        ${frames}
      </svg>
    </body></html>`;
}
