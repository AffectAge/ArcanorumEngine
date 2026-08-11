import { expect, test, type BrowserContext } from '@playwright/test';

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

test('registers, restores protected access, and handles both session durations', async ({
  page,
  context,
}, testInfo) => {
  const copy = testInfo.project.name === 'chromium-ru' ? RU_COPY : EN_COPY;
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
