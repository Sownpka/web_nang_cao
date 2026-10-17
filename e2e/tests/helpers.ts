import { expect, type Page } from '@playwright/test';

// Seed accounts from seed/index.ts (development only). Each flow uses its own student so the
// 1 submission / 5 s rate limit never couples tests.
export const PASSWORD = 'judgehint123';
export const STUDENTS = {
  an: { code: '24100001', name: 'Nguyễn Văn An' },
  binh: { code: '24100002', name: 'Trần Thị Bình' },
  chau: { code: '24100003', name: 'Lê Minh Châu' },
} as const;

export const SUM_PROBLEM = { slug: 'tong-hai-so', title: 'Tổng hai số' };
export const CORRECT_SUM = 'a, b = map(int, input().split())\nprint(a + b)\n';
export const WRONG_SUM = 'a, b = map(int, input().split())\nprint(a - b)\n';

export async function login(page: Page, identifier: string) {
  await page.goto('/login');
  await page.getByLabel('Email hoặc mã sinh viên').fill(identifier);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Replaces the Monaco editor contents. Solutions avoid indentation so auto-indent cannot interfere. */
export async function setEditorCode(page: Page, code: string) {
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(code);
  // Monaco renders spaces as U+00A0; toContainText normalises whitespace on both sides.
  await expect(page.locator('.monaco-editor .view-lines')).toContainText(code.trim().split('\n').at(-1)!);
}

/** Waits until the page's Socket.IO connection is up (the "live" dot next to the result tabs). */
export async function expectLive(page: Page) {
  await expect(page.locator('[data-live="true"]')).toBeVisible();
}

/** A flag on window that disappears if the page reloads. */
export async function markNoReload(page: Page) {
  await page.evaluate(() => ((window as unknown as { __e2eNoReload: boolean }).__e2eNoReload = true));
}

export async function expectNoReload(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { __e2eNoReload?: boolean }).__e2eNoReload)).toBe(true);
}

/**
 * Records every distinct text matching `pattern` that ever appears in the page, so transient
 * states (live progress, partial streamed text) can be asserted after they are gone.
 */
export async function recordTexts(page: Page, key: string, selector: string, pattern?: string) {
  await page.evaluate(
    ({ key, selector, pattern }) => {
      const seen: string[] = [];
      (window as unknown as Record<string, string[]>)[key] = seen;
      const re = pattern ? new RegExp(pattern, 'g') : null;
      const capture = () => {
        for (const el of document.querySelectorAll<HTMLElement>(selector)) {
          const text = el.innerText.trim();
          const found = re ? (text.match(re) ?? []) : text ? [text] : [];
          for (const f of found) if (!seen.includes(f)) seen.push(f);
        }
      };
      new MutationObserver(capture).observe(document.body, { subtree: true, childList: true, characterData: true });
    },
    { key, selector, pattern },
  );
}

export async function recorded(page: Page, key: string): Promise<string[]> {
  return page.evaluate((key) => (window as unknown as Record<string, string[]>)[key] ?? [], key);
}
