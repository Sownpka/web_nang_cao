import { expect, test } from '@playwright/test';
import { CORRECT_SUM, expectLive, expectNoReload, login, markNoReload, recorded, recordTexts, setEditorCode, STUDENTS, SUM_PROBLEM } from './helpers.js';

test('student submits a correct Python solution and sees live progress then Accepted', async ({ page }) => {
  await login(page, STUDENTS.an.code);

  await page.goto('/problems');
  await page.getByRole('link', { name: SUM_PROBLEM.title }).click();
  await expect(page.getByRole('heading', { level: 1, name: SUM_PROBLEM.title })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Ngôn ngữ' })).toHaveValue('python');
  await expectLive(page);

  await setEditorCode(page, CORRECT_SUM);
  await markNoReload(page);
  await recordTexts(page, 'progress', '[role="tabpanel"]', 'Đang chạy test \\d+/\\d+');

  await page.getByRole('button', { name: 'Nộp bài' }).click();

  const result = page.getByRole('tabpanel');
  await expect(result.getByText('Chấp nhận', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(result.getByText('Chính xác! Bài của bạn đã qua toàn bộ test.')).toBeVisible();
  await expect(result.getByText(/^Qua (\d+)\/\1 test$/)).toBeVisible();

  // Progress arrived over Socket.IO while judging, without reloading the page.
  const progress = await recorded(page, 'progress');
  expect(progress.length, `live progress seen: ${progress.join(', ')}`).toBeGreaterThan(0);
  await expectNoReload(page);
});
