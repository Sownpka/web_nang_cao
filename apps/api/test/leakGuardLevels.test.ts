// Level checks added after testing with the real 9router model: it kept telling students how to fix
// their code in words, and pointed at lines already at level 1. The hints below are its real answers.
import { describe, expect, it } from 'vitest';
import { checkHint, FALLBACK_HINTS } from '../src/ai/leak-guard.js';

const kadane = `n = int(input())
a = list(map(int, input().split()))
best = 0
cur = 0
for x in a:
    cur = max(x, cur + x)
    best = max(best, cur)
print(best)`;

const check = (hint: string, level: 1 | 2 | 3) => checkHint({ hint, studentCode: kadane, level });

describe('fix directives (all levels)', () => {
  it.each([
    'Hãy khởi tạo `best` bằng phần tử đầu tiên của mảng, để nó có thể nhận giá trị âm khi cần.',
    'Cần khởi tạo `best` bằng một giá trị từ mảng thực tế.',
    'Cách khắc phục: thay đổi cách khởi tạo `best`.',
    '**Mẹo:** Em nên áp dụng modulo ngay sau mỗi phép cộng.',
    'Thay vì kiểm tra tất cả cặp, em có thể dùng một cấu trúc dữ liệu để nhớ các số đã gặp.',
    'Em chỉ cần đổi nó thành giá trị nhỏ nhất.',
  ])('blocks: %s', (hint) => {
    expect(check(hint, 3)).toMatchObject({ ok: false, reason: 'FIX_DIRECTIVE' });
  });

  it('allows explaining why a line is wrong and asking the student', () => {
    const hint =
      'Thầy chỉ em **dòng 3: `best = 0`**. Với dãy toàn số âm như `-3 -1 -2`, `cur` luôn âm nên `best` không bao giờ nhỏ hơn 0 và chương trình in 0 thay vì -1. Em nghĩ giá trị ban đầu của `best` nên thỏa điều kiện gì?';
    expect(check(hint, 3)).toEqual({ ok: true });
  });
});

describe('level 1 must not point at code', () => {
  it('blocks line numbers and quotes of the student’s code', () => {
    expect(check('Lỗi nằm ở dòng 3, em xem lại nhé. Em nghĩ sao?', 1)).toMatchObject({ reason: 'TOO_SPECIFIC' });
    expect(check('Code hiện tại khởi tạo `best = 0`. Khi tất cả các số đều âm thì sao?', 1)).toMatchObject({ reason: 'TOO_SPECIFIC' });
  });

  it('allows naming the kind of mistake and quoting the statement', () => {
    const hint = 'Lỗi của em thuộc loại **trường hợp biên**. Đề yêu cầu đoạn con khác rỗng và in `F(n) mod 1000000007` — nếu mọi số đều âm thì chương trình của em in ra gì?';
    expect(check(hint, 1)).toEqual({ ok: true });
  });

  it('allows line numbers from level 2 on', () => {
    expect(check('Em xem vùng khởi tạo ở dòng 3–4 trước vòng lặp. Với dãy toàn số âm thì giá trị ban đầu ảnh hưởng thế nào?', 2).ok).toBe(true);
  });
});

describe('fallback hints', () => {
  it('pass every check for their level', () => {
    for (const level of [1, 2, 3] as const) {
      expect(checkHint({ hint: FALLBACK_HINTS[level], studentCode: kadane, level }), `level ${level}`).toEqual({ ok: true });
    }
  });
});
