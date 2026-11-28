import { describe, expect, it } from 'vitest';
import { evaluate, formatNumber } from '@/lib/agent/tools/calc';

describe('calculator', () => {
  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['2 ^ 3 ^ 2', 512],
    ['-2 ^ 2', -4],
    ['10 % 4', 2],
    ['5!', 120],
    ['sqrt(16) + abs(-3)', 7],
    ['round(pi, 2)', 3.14],
    ['log(1000)', 3],
    ['log(8, 2)', 3],
    ['max(1, 9, 4)', 9],
    ['2(3 + 1)', 8],
    ['1e3 / 4', 250],
    ['1_000 × 3 ÷ 2', 1500],
    ['2 ** 10', 1024],
  ])('%s = %s', (expr, value) => expect(evaluate(expr)).toBeCloseTo(value, 10));

  it('formats float noise away', () => {
    expect(formatNumber(evaluate('0.1 + 0.2'))).toBe('0.3');
    expect(formatNumber(1 / 0)).toBe('Infinity');
  });

  it.each([
    ['', /Empty/],
    ['1 / 0', /Division by zero/],
    ['2 +', /end of expression/],
    ['(1 + 2', /Expected "\)"/],
    ['process.exit()', /Unexpected character|Unknown name/],
    ['constructor', /Unknown name/],
    ['alert(1)', /Unknown name/],
    ['1; 2', /Unexpected character/],
    ['sqrt(1, 2)', /Wrong number/],
    ['(-1)!', /Factorial/],
  ])('rejects %j', (expr, msg) => expect(() => evaluate(expr)).toThrow(msg));

  it('limits nesting depth', () => {
    expect(() => evaluate('('.repeat(150) + '1' + ')'.repeat(150))).toThrow(/nested|too long/);
  });
});
