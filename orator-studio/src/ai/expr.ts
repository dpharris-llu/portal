/**
 * A small formula language for Claude to show how it got each number:
 *   [Row]            every figure in a row (use inside sum, mean, min, max, count)
 *   [Row @ Period]   one figure
 *   sum() mean() min() max() count() abs(), + - * / and parentheses.
 * Example: (sum([Purchases]) - [Purchases @ Jan 2026]) / 9
 * The app evaluates the formula against the confirmed figures, so a number is
 * checked however many steps it took.
 */
export interface FormulaData {
  periods: string[];
  rows: { label: string; values: (number | null)[] }[];
}

type Val = number | number[];
type Token = { t: "num"; v: number } | { t: "ref"; v: string } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|\[([^\]]+)\]|([A-Za-z_]+)|([-+*/(),]))/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new Error(`can't read the formula at "${src.slice(i, i + 12)}"`);
    if (m[1] !== undefined) out.push({ t: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: "ref", v: m[2] });
    else if (m[3] !== undefined) out.push({ t: "id", v: m[3].toLowerCase() });
    else out.push({ t: "op", v: m[4] });
    i = re.lastIndex;
  }
  return out;
}

export function evaluate(formula: string, data: FormulaData): number {
  const tokens = tokenize(formula);
  let p = 0;
  const peek = () => tokens[p];
  const take = (v?: string) => {
    const tok = tokens[p];
    if (!tok || (v !== undefined && tok.v !== v)) throw new Error(`expected "${v ?? "more"}" in the formula`);
    p++;
    return tok;
  };
  const scalar = (v: Val): number => {
    if (Array.isArray(v)) throw new Error("a whole row needs sum(), mean(), min(), max() or count()");
    return v;
  };

  const ref = (body: string): Val => {
    const [rowPart, periodPart] = body.split("@").map((x) => x.trim());
    const row = data.rows.find((r) => r.label.toLowerCase() === rowPart.toLowerCase());
    if (!row) throw new Error(`unknown row "${rowPart}"`);
    if (periodPart === undefined) return row.values.filter((v): v is number => v !== null);
    const i = data.periods.findIndex((x) => x.toLowerCase() === periodPart.toLowerCase());
    if (i < 0) throw new Error(`unknown period "${periodPart}"`);
    const v = row.values[i];
    if (v === null) throw new Error(`${row.label} has no figure for ${data.periods[i]}`);
    return v;
  };

  const FUNCS: Record<string, (xs: number[]) => number> = {
    sum: (xs) => xs.reduce((a, b) => a + b, 0),
    mean: (xs) => xs.reduce((a, b) => a + b, 0) / xs.length,
    min: (xs) => Math.min(...xs),
    max: (xs) => Math.max(...xs),
    count: (xs) => xs.length,
    abs: (xs) => {
      if (xs.length !== 1) throw new Error("abs() takes one number");
      return Math.abs(xs[0]);
    },
  };

  function factor(): Val {
    const tok = peek();
    if (!tok) throw new Error("the formula ends early");
    if (tok.t === "op" && tok.v === "-") {
      take();
      return -scalar(factor());
    }
    if (tok.t === "op" && tok.v === "(") {
      take();
      const v = expr();
      take(")");
      return v;
    }
    if (tok.t === "num") return take().v as number;
    if (tok.t === "ref") return ref(take().v as string);
    if (tok.t === "id") {
      const name = take().v as string;
      const fn = FUNCS[name];
      if (!fn) throw new Error(`unknown function ${name}()`);
      take("(");
      const args: number[] = [];
      if (!(peek()?.t === "op" && peek()?.v === ")")) {
        for (;;) {
          const v = expr();
          args.push(...(Array.isArray(v) ? v : [v]));
          if (peek()?.t === "op" && peek()?.v === ",") take(",");
          else break;
        }
      }
      take(")");
      if (!args.length && name !== "count") throw new Error(`${name}() has no figures`);
      return fn(args);
    }
    throw new Error(`unexpected "${tok.v}" in the formula`);
  }
  function term(): Val {
    let v = factor();
    while (peek()?.t === "op" && (peek()!.v === "*" || peek()!.v === "/")) {
      const op = take().v;
      const r = scalar(factor());
      if (op === "/" && r === 0) throw new Error("division by zero");
      v = op === "*" ? scalar(v) * r : scalar(v) / r;
    }
    return v;
  }
  function expr(): Val {
    let v = term();
    while (peek()?.t === "op" && (peek()!.v === "+" || peek()!.v === "-")) {
      const op = take().v;
      const r = scalar(term());
      v = op === "+" ? scalar(v) + r : scalar(v) - r;
    }
    return v;
  }
  const result = expr();
  if (p < tokens.length) throw new Error(`unexpected "${tokens[p].v}" in the formula`);
  return scalar(result);
}
