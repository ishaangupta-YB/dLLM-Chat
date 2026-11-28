// Safe arithmetic evaluator (recursive descent, no eval / Function).
//   expr   := term (('+' | '-') term)*
//   term   := unary (('*' | '/' | '%') unary)*      (implicit multiplication: 2(3), 2pi)
//   unary  := ('-' | '+') unary | power
//   power  := primary '!'* ('^' unary)?             (right associative)
//   primary:= number | constant | func '(' args ')' | '(' expr ')'

const FUNCS: Record<string, { arity: [number, number]; fn: (...a: number[]) => number }> = {
  sqrt: { arity: [1, 1], fn: Math.sqrt },
  cbrt: { arity: [1, 1], fn: Math.cbrt },
  abs: { arity: [1, 1], fn: Math.abs },
  exp: { arity: [1, 1], fn: Math.exp },
  ln: { arity: [1, 1], fn: Math.log },
  log: { arity: [1, 2], fn: (x, b) => (b === undefined ? Math.log10(x) : Math.log(x) / Math.log(b)) },
  log10: { arity: [1, 1], fn: Math.log10 },
  log2: { arity: [1, 1], fn: Math.log2 },
  sin: { arity: [1, 1], fn: Math.sin },
  cos: { arity: [1, 1], fn: Math.cos },
  tan: { arity: [1, 1], fn: Math.tan },
  asin: { arity: [1, 1], fn: Math.asin },
  acos: { arity: [1, 1], fn: Math.acos },
  atan: { arity: [1, 1], fn: Math.atan },
  floor: { arity: [1, 1], fn: Math.floor },
  ceil: { arity: [1, 1], fn: Math.ceil },
  round: {
    arity: [1, 2],
    fn: (x, d) => {
      const f = 10 ** Math.max(0, Math.min(12, Math.trunc(d ?? 0)));
      return Math.round(x * f) / f;
    },
  },
  min: { arity: [1, 20], fn: Math.min },
  max: { arity: [1, 20], fn: Math.max },
  pow: { arity: [2, 2], fn: Math.pow },
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };

export class CalcError extends Error {}

type Tok = { k: 'num'; v: number } | { k: 'id'; v: string } | { k: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\*\*/g, '^');
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const num = /^(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
    if (num) {
      const v = Number(num[0].replace(/_/g, ''));
      if (!Number.isFinite(v)) throw new CalcError(`Bad number "${num[0]}"`);
      out.push({ k: 'num', v });
      i += num[0].length;
      continue;
    }
    const id = /^[a-zA-Z][a-zA-Z0-9]*/.exec(s.slice(i));
    if (id) {
      out.push({ k: 'id', v: id[0].toLowerCase() });
      i += id[0].length;
      continue;
    }
    if ('+-*/%^(),!'.includes(c)) {
      out.push({ k: 'op', v: c });
      i++;
      continue;
    }
    throw new CalcError(`Unexpected character "${c}"`);
  }
  return out;
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new CalcError('Factorial needs a non-negative integer');
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** Evaluate an arithmetic expression. Throws CalcError on invalid input. */
export function evaluate(expression: string): number {
  if (typeof expression !== 'string' || !expression.trim()) throw new CalcError('Empty expression');
  if (expression.length > 500) throw new CalcError('Expression too long');
  const toks = tokenize(expression);
  let pos = 0;
  let depth = 0;
  const peek = () => toks[pos];
  const isOp = (v: string) => peek()?.k === 'op' && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new CalcError(`Expected "${v}"`);
    pos++;
  };

  const expr = (): number => {
    if (++depth > 100) throw new CalcError('Expression nested too deeply');
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = toks[pos++].v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    depth--;
    return v;
  };
  const startsPrimary = () => {
    const t = peek();
    return !!t && (t.k === 'num' || t.k === 'id' || (t.k === 'op' && t.v === '('));
  };
  const term = (): number => {
    let v = unary();
    while (true) {
      if (isOp('*') || isOp('/') || isOp('%')) {
        const op = toks[pos++].v;
        const r = unary();
        if (op === '*') v *= r;
        else if (op === '/') {
          if (r === 0) throw new CalcError('Division by zero');
          v /= r;
        } else {
          if (r === 0) throw new CalcError('Modulo by zero');
          v %= r;
        }
      } else if (startsPrimary()) {
        v *= power(); // implicit multiplication
      } else break;
    }
    return v;
  };
  // Unary minus binds looser than ^ (-2^2 = -4), tighter than * and /.
  const unary = (): number => {
    if (isOp('-')) {
      pos++;
      return -unary();
    }
    if (isOp('+')) {
      pos++;
      return unary();
    }
    return power();
  };
  const power = (): number => {
    let base = primary();
    while (isOp('!')) {
      pos++;
      base = factorial(base);
    }
    if (isOp('^')) {
      pos++;
      return base ** unary(); // right associative, allows 2^-1
    }
    return base;
  };
  const primary = (): number => {
    const t = peek();
    if (!t) throw new CalcError('Unexpected end of expression');
    if (t.k === 'num') {
      pos++;
      return t.v;
    }
    if (t.k === 'op' && t.v === '(') {
      pos++;
      const v = expr();
      expect(')');
      return v;
    }
    if (t.k === 'id') {
      pos++;
      if (Object.hasOwn(CONSTS, t.v) && !isOp('(')) return CONSTS[t.v];
      const f = Object.hasOwn(FUNCS, t.v) ? FUNCS[t.v] : undefined;
      if (!f) throw new CalcError(`Unknown name "${t.v}"`);
      expect('(');
      const args: number[] = [];
      if (!isOp(')')) {
        args.push(expr());
        while (isOp(',')) {
          pos++;
          args.push(expr());
        }
      }
      expect(')');
      if (args.length < f.arity[0] || args.length > f.arity[1]) throw new CalcError(`Wrong number of arguments for ${t.v}`);
      return f.fn(...args);
    }
    throw new CalcError(`Unexpected "${t.v}"`);
  };

  const result = expr();
  if (pos < toks.length) throw new CalcError(`Unexpected "${toks[pos].v}"`);
  if (Number.isNaN(result)) throw new CalcError('Result is not a number');
  return result;
}

/** Format a result without float noise (0.1+0.2 -> 0.3). */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity';
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return String(n);
  return String(Number(n.toPrecision(15)));
}
