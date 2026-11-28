import 'server-only';
import type { AgentTool } from '../types';
import { CalcError, evaluate, formatNumber } from './calc';

/** Small built-in helpers: current time and a safe calculator. */
export function utilityTools(): AgentTool[] {
  return [
    {
      name: 'get_current_time',
      description: 'Get the current date and time (UTC and in an optional IANA time zone).',
      source: 'builtin',
      parameters: {
        type: 'object',
        properties: { timezone: { type: 'string', description: 'IANA time zone, e.g. Asia/Kolkata' } },
      },
      label: (args) => (typeof args.timezone === 'string' ? `Checking the time in ${args.timezone}` : 'Checking the time'),
      execute: async (args) => {
        const now = new Date();
        const tz = typeof args.timezone === 'string' ? args.timezone : undefined;
        let local = '';
        if (tz) {
          try {
            local = now.toLocaleString('en-US', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' });
          } catch {
            local = `unknown time zone "${tz}"`;
          }
        }
        return { content: JSON.stringify({ utc: now.toISOString(), ...(tz ? { timezone: tz, local } : {}) }) };
      },
    },
    {
      name: 'calculate',
      description:
        'Evaluate an arithmetic expression exactly instead of doing mental math. Supports + - * / % ^ !, parentheses, ' +
        'pi, e, and sqrt, cbrt, abs, exp, ln, log(x[, base]), log2, sin, cos, tan, asin, acos, atan (radians), floor, ceil, round(x[, digits]), min, max, pow.',
      source: 'builtin',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string', description: 'e.g. (1250 * 1.07^5) - 300' } },
        required: ['expression'],
      },
      label: (args) => (typeof args.expression === 'string' ? `Calculating ${args.expression.slice(0, 60)}` : 'Calculating'),
      execute: async (args) => {
        const expression = typeof args.expression === 'string' ? args.expression : '';
        try {
          const value = formatNumber(evaluate(expression));
          return { content: JSON.stringify({ expression, result: value }), display: `${expression} = ${value}` };
        } catch (err) {
          if (err instanceof CalcError) return { content: JSON.stringify({ expression, error: err.message }) };
          throw err;
        }
      },
    },
  ];
}
