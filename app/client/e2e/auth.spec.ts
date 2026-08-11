import { expect, test, type BrowserContext, type Page } from '@playwright/test';

type Copy = {
  readonly locale: 'en' | 'ru';
  readonly loginLabel: string;
  readonly countryLabel: string;
  readonly passwordLabel: string;
  readonly passwordConfirmationLabel: string;
  readonly registerLink: string;
  readonly registerSubmit: string;
  readonly loginSubmit: string;
  readonly rememberLabel: string;
  readonly logout: string;
  readonly logoutAll: string;
  readonly countryName: string;
  readonly login: string;
};

const EN_COPY: Copy = {
  locale: 'en',
  loginLabel: 'Login',
  countryLabel: 'Country name',
  passwordLabel: 'Password',
  passwordConfirmationLabel: 'Repeat password',
  registerLink: 'Create a new country',
  registerSubmit: 'Create country',
  loginSubmit: 'Enter game',
  rememberLabel: 'Remember me for 30 days',
  logout: 'Log out',
  logoutAll: 'Log out on all devices',
  countryName: 'Northern Arcadia',
  login: 'browser_en_player',
};

const RU_COPY: Copy = {
  locale: 'ru',
  loginLabel: 'Логин',
  countryLabel: 'Название страны',
  passwordLabel: 'Пароль',
  passwordConfirmationLabel: 'Повторите пароль',
  registerLink: 'Создать новую страну',
  registerSubmit: 'Создать страну',
  loginSubmit: 'Войти в игру',
  rememberLabel: 'Запомнить меня на 30 дней',
  logout: 'Выйти',
  logoutAll: 'Выйти на всех устройствах',
  countryName: 'Северная Аркадия',
  login: 'browser_ru_player',
};

const TOUCH_COPY: Copy = {
  ...EN_COPY,
  countryName: 'Touch Arcadia',
  login: 'browser_touch_player',
};

test('registers, restores protected access, and handles both session durations', async ({
  page,
  context,
}, testInfo) => {
  const copy =
    testInfo.project.name === 'chromium-ru'
      ? RU_COPY
      : testInfo.project.name === 'chromium-touch'
        ? TOUCH_COPY
        : EN_COPY;
  const password = 'A password with fifteen characters';

  await page.goto('/game');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('html')).toHaveAttribute('lang', copy.locale);

  await page.keyboard.press('Tab');
  await expect(page.getByLabel(copy.loginLabel)).toBeFocused();

  await page.getByRole('link', { name: copy.registerLink }).click();
  await page.getByLabel(copy.loginLabel).fill(copy.login);
  await page.getByLabel(copy.countryLabel).fill(copy.countryName);
  await page.getByLabel(copy.passwordLabel, { exact: true }).fill(password);
  await page.getByLabel(copy.passwordConfirmationLabel).fill(password);
  await page.getByRole('button', { name: copy.registerSubmit }).press('Enter');

  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByText(copy.countryName)).toBeVisible();
  await expect(page.getByText(copy.login)).toBeVisible();
  const worldCanvas = page.locator('.world-renderer canvas');
  await expect(worldCanvas).toBeVisible();
  const mapBounds = await page.locator('.game-shell__map-region').evaluate((element) => {
    const bounds = element.getBoundingClientRect();

    return {
      height: bounds.height,
      left: bounds.left,
      top: bounds.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      width: bounds.width,
    };
  });
  expect(mapBounds).toEqual({
    height: mapBounds.viewportHeight,
    left: 0,
    top: 0,
    viewportHeight: mapBounds.viewportHeight,
    viewportWidth: mapBounds.viewportWidth,
    width: mapBounds.viewportWidth,
  });
  await worldCanvas.hover({ position: { x: 640, y: 360 } });
  const initialMap = await worldCanvas.screenshot();
  await page.mouse.wheel(0, -300);
  await waitForRenderedFrames(page);
  const wheelZoomedMap = await worldCanvas.screenshot();
  expect(wheelZoomedMap.equals(initialMap)).toBe(false);
  await page.keyboard.press('0');
  await waitForRenderedFrames(page);
  const resetMap = await worldCanvas.screenshot();
  await page.keyboard.press('Shift+=');
  await waitForRenderedFrames(page);
  const keyboardZoomedMap = await worldCanvas.screenshot();
  expect(keyboardZoomedMap.equals(resetMap)).toBe(false);
  if (testInfo.project.name === 'chromium-touch') {
    await page.keyboard.press('0');
    await waitForRenderedFrames(page);
    const beforePinchMap = await worldCanvas.screenshot();
    await zoomWithPinchGesture(page);
    await waitForRenderedFrames(page);
    const pinchZoomedMap = await worldCanvas.screenshot();
    expect(pinchZoomedMap.equals(beforePinchMap)).toBe(false);
  }
  await page.screenshot({ path: testInfo.outputPath('world-map.png'), fullPage: false });
  expect(
    await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) })),
  ).toEqual({
    local: [],
    session: [],
  });
  await expectSessionCookie(context, -1);

  await page.getByRole('button', { name: copy.logout, exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel(copy.loginLabel).fill(copy.login);
  await page.getByLabel(copy.passwordLabel, { exact: true }).fill(password);
  await page.getByRole('button', { name: copy.loginSubmit }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expectSessionCookie(context, -1);

  await page.getByRole('button', { name: copy.logout, exact: true }).click();
  await page.getByLabel(copy.loginLabel).fill(copy.login);
  await page.getByLabel(copy.passwordLabel, { exact: true }).fill(password);
  await page.getByLabel(copy.rememberLabel).check();
  await page.getByRole('button', { name: copy.loginSubmit }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expectSessionCookie(context, Math.floor(Date.now() / 1000) + 29 * 24 * 60 * 60);

  await page.getByRole('button', { name: copy.logoutAll, exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/game');
  await expect(page).toHaveURL(/\/login$/);
});

async function expectSessionCookie(context: BrowserContext, minimumExpiry: number): Promise<void> {
  const cookie = (await context.cookies()).find((candidate) => candidate.name === 'arcanorum_session');

  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Strict');
  expect(cookie?.expires ?? -1).toBeGreaterThanOrEqual(minimumExpiry);
}

async function waitForRenderedFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
  );
}

async function zoomWithPinchGesture(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);

  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 1, x: 520, y: 360 },
        { id: 2, x: 760, y: 360 },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { id: 1, x: 420, y: 360 },
        { id: 2, x: 860, y: 360 },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}
