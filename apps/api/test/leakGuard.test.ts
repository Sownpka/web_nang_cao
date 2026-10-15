import { describe, expect, it } from 'vitest';
import { checkHint, extractCode, looksLikeCode } from '../src/ai/leak-guard.js';

const studentCode = `n = int(input())
a = list(map(int, input().split()))
best = 0
cur = 0
for x in a:
    cur = cur + x
    best = max(best, cur)
print(best)`;

const reference = `n = int(input())
a = list(map(int, input().split()))
best = a[0]
cur = 0
for x in a:
    cur = max(x, cur + x)
    best = max(best, cur)
print(best)`;

const check = (hint: string) => checkHint({ hint, studentCode, referenceSolution: reference });

describe('leak guard — should block', () => {
  it('a full solution in a code block', () => {
    const hint = 'Bạn có thể làm thế này:\n```python\nbest = a[0]\ncur = 0\nfor x in a:\n    cur = max(x, cur + x)\n```';
    expect(check(hint)).toMatchObject({ ok: false, reason: 'CODE_BLOCK' });
  });

  it('an unterminated code block', () => {
    expect(check('```\nx = 1\ny = 2\nz = 3').ok).toBe(false);
  });

  it('a corrected line the student did not write', () => {
    const verdict = check('Hãy đổi dòng 6 thành `cur = max(x, cur + x)` là xong.');
    expect(verdict).toMatchObject({ ok: false, reason: 'FOREIGN_CODE' });
  });

  it('a corrected line written as plain text', () => {
    expect(check('Gợi ý:\nbest = a[0] if n > 0 else max(a)').ok).toBe(false);
  });

  it('a JavaScript snippet', () => {
    expect(check('Dùng `const best = Math.max(...arr);` sẽ nhanh hơn.').ok).toBe(false);
  });

  it('a solution paraphrased mostly in reference tokens', () => {
    const hint = 'Ý tưởng: cur = max ( x , cur + x ) rồi best = a [ 0 ] và best = max ( best , cur ) cho mỗi x in a';
    expect(check(hint).ok).toBe(false);
  });
});

describe('leak guard — should allow', () => {
  it('a conceptual level-1 hint', () => {
    const hint =
      'Lỗi của bạn thuộc loại **xử lý trường hợp biên**. Hãy tự hỏi: nếu mọi phần tử đều âm thì kết quả của bạn là bao nhiêu? Đề yêu cầu đoạn con khác rỗng.';
    expect(check(hint)).toEqual({ ok: true });
  });

  it('quoting one of the student’s own lines (level 3)', () => {
    const hint = 'Ở dòng 3, `best = 0` khởi tạo giá trị lớn nhất bằng 0. Với dãy toàn số âm, giá trị này không bao giờ bị thay thế.';
    expect(check(hint)).toEqual({ ok: true });
  });

  it('quoting the student’s line in a 1-line code block', () => {
    expect(check('Xem lại dòng này:\n```\nbest = max(best, cur)\n```\nNó chạy sau khi cur đã được cập nhật.').ok).toBe(true);
  });

  it('short fragments such as `n = 1` or `a[0]`', () => {
    expect(check('Thử với `n = 1` và `a[0]` âm, ví dụ input `1` rồi `-5`.').ok).toBe(true);
  });

  it('works without a reference solution', () => {
    expect(checkHint({ hint: 'Xem lại vòng lặp của bạn.', studentCode }).ok).toBe(true);
  });
});

describe('helpers', () => {
  it('extracts blocks, spans and prose', () => {
    const { blocks, spans } = extractCode('a `x = 1` b\n```\nfoo()\n```');
    expect(blocks).toEqual([['foo()']]);
    expect(spans).toEqual(['x = 1']);
  });

  it('recognises code but not Vietnamese prose', () => {
    expect(looksLikeCode('for i in range(n): total += a[i]')).toBe(true);
    expect(looksLikeCode('Hãy kiểm tra lại điều kiện dừng của vòng lặp')).toBe(false);
  });
});
