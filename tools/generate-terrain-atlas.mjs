import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const terrainOutputPath = resolve('app/client/public/assets/world/terrain/terrain-atlas.webp');
const riverOutputPath = resolve('app/client/public/assets/world/terrain/river-atlas.webp');
const chromePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch(existsSync(chromePath) ? { executablePath: chromePath } : {});

try {
  const page = await browser.newPage({ viewport: { width: 384, height: 672 }, deviceScaleFactor: 1 });
  await page.setContent(terrainSurfaceAtlasHtml());
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  await mkdir(dirname(terrainOutputPath), { recursive: true });
  await page.screenshot({
    path: terrainOutputPath,
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

function terrainSurfaceAtlasHtml() {
  const frameColors = [
    '#123b5d',
    '#2f8fa3',
    '#1d6685',
    '#3a89b8',
    '#294d63',
    '#7eaeb8',
    '#557f92',
    '#8eb8c5',
    '#07547a',
    '#28b5aa',
    '#11869a',
    '#50c5bc',
    '#6f8f4a',
    '#648343',
    '#e6eee9',
    '#d8e5e2',
    '#87927b',
    '#7b8772',
    '#3f6443',
    '#36583d',
    '#aa9958',
    '#9a8c50',
    '#558052',
    '#486f4a',
    '#d9b46a',
    '#c99a55',
    '#b6a353',
    '#a4964b',
    '#34754a',
    '#2c6842',
    '#777873',
    '#656966',
  ];

  return `<!doctype html>
    <html><body style="margin:0;background:transparent;overflow:hidden">
      <canvas width="384" height="672"></canvas>
      <script>
        const canvas = document.querySelector('canvas');
        const context = canvas.getContext('2d');
        const frameColors = ${JSON.stringify(frameColors)};
        for (let frame = 0; frame < frameColors.length; frame += 1) {
          const column = frame % 4;
          const row = Math.floor(frame / 4);
          context.save();
          context.translate(column * 96, row * 84);
          context.beginPath();
          context.moveTo(23, -1);
          context.lineTo(73, -1);
          context.lineTo(97, 42);
          context.lineTo(73, 85);
          context.lineTo(23, 85);
          context.lineTo(-1, 42);
          context.closePath();
          context.clip();
          context.fillStyle = frameColors[frame];
          context.fillRect(0, 0, 96, 84);
          context.restore();
        }
        document.body.dataset.ready = 'true';
      </script>
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
