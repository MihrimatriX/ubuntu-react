// Calculator engine without eval: tokenize → shunting-yard (operator precedence, right-assoc ^, unary
// minus, postfix ! and %) → evaluate the RPN queue. Functions take one parenthesised argument.

export class CalcError extends Error {}

type Token = { kind: "num"; value: number } | { kind: "op"; value: string } | { kind: "fn"; value: string } | { kind: "paren"; value: "(" | ")" };

const FUNCTIONS: Record<string, (x: number, degrees: boolean) => number> = {
  sin: (x, deg) => Math.sin(deg ? (x * Math.PI) / 180 : x),
  cos: (x, deg) => Math.cos(deg ? (x * Math.PI) / 180 : x),
  tan: (x, deg) => Math.tan(deg ? (x * Math.PI) / 180 : x),
  sqrt: (x) => Math.sqrt(x), "√": (x) => Math.sqrt(x),
  ln: (x) => Math.log(x), log: (x) => Math.log10(x), abs: (x) => Math.abs(x),
};
const CONSTANTS: Record<string, number> = { "π": Math.PI, pi: Math.PI, e: Math.E };
// [precedence, right-associative, arity]
const OPERATORS: Record<string, [number, boolean, number]> = {
  "+": [1, false, 2], "-": [1, false, 2], "*": [2, false, 2], "/": [2, false, 2],
  "neg": [3, true, 1], "^": [4, true, 2], "!": [5, false, 1], "%": [5, false, 1],
};

export function tokenize(input: string): Token[] {
  const source = input.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\s+/g, "");
  const tokens: Token[] = [];
  for (let index = 0; index < source.length; ) {
    const rest = source.slice(index);
    const number = rest.match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/);
    const word = rest.match(/^(sqrt|sin|cos|tan|ln|log|abs|pi|π|√|e)/);
    const previous = tokens.at(-1);
    const afterOperand = previous && (previous.kind === "num" || previous.value === ")" || previous.value === "!" || previous.value === "%");
    if (number) {
      if (afterOperand) tokens.push({ kind: "op", value: "*" });
      tokens.push({ kind: "num", value: Number(number[0]) });
      index += number[0].length;
    } else if (word) {
      const name = word[0];
      if (afterOperand) tokens.push({ kind: "op", value: "*" }); // implicit multiplication: 2π, 3sin(x)
      tokens.push(name in CONSTANTS ? { kind: "num", value: CONSTANTS[name]! } : { kind: "fn", value: name });
      index += name.length;
    } else if ("()".includes(rest[0]!)) {
      if (rest[0] === "(" && afterOperand) tokens.push({ kind: "op", value: "*" });
      tokens.push({ kind: "paren", value: rest[0] as "(" | ")" });
      index++;
    } else if (rest[0]! in OPERATORS) {
      const unary = rest[0] === "-" && !afterOperand;
      if (!(rest[0] === "+" && !afterOperand)) tokens.push({ kind: "op", value: unary ? "neg" : rest[0]! });
      index++;
    } else throw new CalcError(`Unknown symbol “${rest[0]}”`);
  }
  return tokens;
}

/** Shunting-yard: infix tokens → reverse Polish notation. */
function toRpn(tokens: Token[]): Token[] {
  const output: Token[] = [];
  const stack: Token[] = [];
  for (const token of tokens) {
    if (token.kind === "num") output.push(token);
    else if (token.kind === "fn" || token.value === "(") stack.push(token);
    else if (token.value === ")") {
      while (stack.length && stack.at(-1)!.value !== "(") output.push(stack.pop()!);
      if (!stack.pop()) throw new CalcError("Mismatched parentheses");
      if (stack.at(-1)?.kind === "fn") output.push(stack.pop()!);
    } else {
      const [precedence, rightAssoc] = OPERATORS[token.value]!;
      while (stack.length) {
        const top = stack.at(-1)!;
        if (top.kind === "fn") { output.push(stack.pop()!); continue; }
        if (top.kind !== "op") break;
        const [topPrecedence] = OPERATORS[top.value]!;
        if (topPrecedence > precedence || (topPrecedence === precedence && !rightAssoc)) output.push(stack.pop()!);
        else break;
      }
      stack.push(token);
    }
  }
  while (stack.length) {
    const token = stack.pop()!;
    if (token.kind === "paren") throw new CalcError("Mismatched parentheses");
    output.push(token);
  }
  return output;
}

const factorial = (n: number) => {
  if (n < 0 || !Number.isInteger(n) || n > 170) throw new CalcError("Factorial is only defined for integers 0…170");
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
};

function apply(op: string, args: number[]): number {
  const [a = 0, b = 0] = args;
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": if (b === 0) throw new CalcError("Division by zero is undefined"); return a / b;
    case "^": return a ** b;
    case "neg": return -a;
    case "!": return factorial(a);
    default: return a / 100; // "%"
  }
}

export function evaluate(input: string, options: { degrees?: boolean } = {}): number {
  const stack: number[] = [];
  for (const token of toRpn(tokenize(input))) {
    if (token.kind === "num") stack.push(token.value);
    else if (token.kind === "fn") {
      if (!stack.length) throw new CalcError("Malformed expression");
      stack.push(FUNCTIONS[token.value]!(stack.pop()!, options.degrees ?? false));
    } else {
      const arity = OPERATORS[token.value]![2];
      if (stack.length < arity) throw new CalcError("Malformed expression");
      stack.push(apply(token.value, stack.splice(-arity)));
    }
  }
  if (stack.length !== 1 || !Number.isFinite(stack[0])) throw new CalcError(stack.length ? "Result is not a finite number" : "Malformed expression");
  return stack[0]!;
}

/** GNOME-style display: up to 12 significant digits, no float noise (0.1+0.2 → 0.3). */
export const formatNumber = (value: number) => String(Number(value.toPrecision(12)));
