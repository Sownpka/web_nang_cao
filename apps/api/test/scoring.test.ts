import { describe, expect, it } from 'vitest';
import { applyHintPenalty, hintMultiplier } from '@judgehint/shared';

describe('hint penalty (CLAUDE.md §8)', () => {
  it('removes 10% per opened level', () => {
    expect(hintMultiplier(0)).toBe(1);
    expect(applyHintPenalty(100, 1)).toBe(90);
    expect(applyHintPenalty(100, 3)).toBe(70);
  });

  it('never goes below 50% of the points', () => {
    expect(applyHintPenalty(100, 5)).toBe(50);
    expect(applyHintPenalty(100, 9)).toBe(50);
    expect(applyHintPenalty(80, 7)).toBe(40);
  });

  it('rounds to whole points', () => {
    expect(applyHintPenalty(75, 1)).toBe(68);
  });
});
