import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const outputPath = resolve('app/client/public/assets/world/terrain/terrain-atlas.webp');
const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch(existsSync(chromePath) ? { executablePath: chromePath } : {});

try {
  const page = await browser.newPage({ viewport: { width: 480, height: 84 }, deviceScaleFactor: 1 });
  await page.setContent(terrainAtlasSvg());
  await mkdir(dirname(outputPath), { recursive: true });
  await page.screenshot({ path: outputPath, type: 'webp', omitBackground: true, animations: 'disabled' });
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
