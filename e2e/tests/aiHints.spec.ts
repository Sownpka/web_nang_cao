import { expect, test } from '@playwright/test';
import { FAKE_LLM_URL } from '../env.js';
import { fakeHint, type RecordedRequest } from '../fakeLlm.js';
import { expectLive, login, recorded, recordTexts, setEditorCode, STUDENTS, SUM_PROBLEM, WRONG_SUM } from './helpers.js';

test('wrong answer unlocks AI hints one level at a time, streamed from the LLM', async ({ page, request }) => {
  await request.delete(`${FAKE_LLM_URL}/__requests`);
  await login(page, STUDENTS.chau.code);

  await page.goto(`/problems/${SUM_PROBLEM.slug}`);
  await expectLive(page);
  await setEditorCode(page, WRONG_SUM);
  await page.getByRole('button', { name: 'Nộp bài' }).click();

  const result = page.getByRole('tabpanel');
  await expect(result.getByText('Sai kết quả', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(result.getByText('Sai ở test công khai số 1')).toBeVisible();

  const level1 = result.getByRole('button', { name: /^Mở gợi ý mức 1/ });
  const level2 = result.getByRole('button', { name: /^Mở gợi ý mức 2/ });
  await expect(level1).toBeEnabled();
  await expect(level2).toBeDisabled();
  await expect(result.getByText('Mở mức 1 trước').first()).toBeVisible();

  await recordTexts(page, 'hintText', 'li [aria-live="polite"]');
  const sse = page.waitForResponse((r) => r.url().includes('/api/hints/stream'));
  await level1.click();
  expect((await sse).headers()['content-type']).toContain('text/event-stream');

  // While level 1 streams, level 2 must stay locked.
  await expect(level2).toBeDisabled();

  const expected = fakeHint(1);
  const level1Item = result.getByRole('listitem').filter({ hasText: 'Mức 1 —' });
  await expect(level1Item).toContainText(expected);

  // Text arrived in several pieces rather than all at once.
  const partials = (await recorded(page, 'hintText')).filter((t) => t.startsWith('Gợi ý E2E mức 1'));
  expect(partials.length, `streamed snapshots: ${partials.length}`).toBeGreaterThan(1);

  // Level 2 unlocks only after level 1 finished; level 3 is still locked behind level 2.
  await expect(level2).toBeEnabled();
  await expect(result.getByRole('button', { name: /^Mở gợi ý mức 3/ })).toBeDisabled();
  await expect(result.getByText('Mở mức 2 trước')).toBeVisible();

  const calls = (await (await request.get(`${FAKE_LLM_URL}/__requests`)).json()) as RecordedRequest[];
  expect(calls).toEqual([{ model: 'e2e-fake-model', stream: true, level: 1 }]);
});
