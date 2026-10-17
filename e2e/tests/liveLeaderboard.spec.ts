import { expect, test, type Page } from '@playwright/test';
import { CORRECT_SUM, expectLive, expectNoReload, login, markNoReload, setEditorCode, STUDENTS, SUM_PROBLEM } from './helpers.js';

const CLASSROOM = 'Thiết kế Web nâng cao - N01';
const ASSIGNMENT = 'Bài tập tuần 1';

async function openAssignment(page: Page) {
  await page.goto('/classrooms');
  await page.getByRole('link', { name: new RegExp(CLASSROOM) }).click();
  await page.getByRole('link', { name: ASSIGNMENT, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: ASSIGNMENT })).toBeVisible();
}

const boardRow = (page: Page, fullName: string) => page.getByRole('row').filter({ hasText: fullName });

test('leaderboard updates live in another browser when a classmate gets Accepted', async ({ browser }) => {
  const watcherCtx = await browser.newContext();
  const solverCtx = await browser.newContext();
  try {
    const watcher = await watcherCtx.newPage();
    const solver = await solverCtx.newPage();

    await login(watcher, STUDENTS.an.code);
    await openAssignment(watcher);
    await expect(watcher.getByText('Trực tiếp').first()).toBeVisible();
    const solverRow = boardRow(watcher, STUDENTS.binh.name);
    // Columns: rank, student, 4 assignment problems, total, time.
    const totalCell = solverRow.getByRole('cell').nth(6);
    await expect(totalCell).toHaveText('0');
    await markNoReload(watcher);

    await login(solver, STUDENTS.binh.code);
    await openAssignment(solver);
    await solver.getByRole('link', { name: SUM_PROBLEM.title }).click();
    await expect(solver.getByText(`Đang làm bài tập lớp: ${ASSIGNMENT}`)).toBeVisible();
    await expectLive(solver);
    await setEditorCode(solver, CORRECT_SUM);
    await solver.getByRole('button', { name: 'Nộp bài' }).click();
    await expect(solver.getByRole('tabpanel').getByText('Chấp nhận', { exact: true })).toBeVisible({ timeout: 30_000 });

    // The watcher's board moves without a reload: full points and first place.
    await expect(totalCell).toHaveText('100', { timeout: 15_000 });
    await expect(solverRow.getByRole('cell').first()).toHaveText('1');
    await expect(boardRow(watcher, STUDENTS.binh.name)).toBeVisible();
    await expectNoReload(watcher);
  } finally {
    await watcherCtx.close();
    await solverCtx.close();
  }
});
