import { expect, test } from "bun:test";
import { evaluate, formatNumber } from "../src/lib/calc";

test("precedence and associativity", () => {
  expect(evaluate("1+2*3")).toBe(7);
  expect(evaluate("(1+2)*3")).toBe(9);
  expect(evaluate("2^3^2")).toBe(512);
  expect(evaluate("10-4-3")).toBe(3);
  expect(evaluate("8/2/2")).toBe(2);
});

test("unary minus, postfix operators, display symbols", () => {
  expect(evaluate("-2^2")).toBe(-4);
  expect(evaluate("3*-2")).toBe(-6);
  expect(evaluate("5!")).toBe(120);
  expect(evaluate("50%*200")).toBe(100);
  expect(evaluate("6×7÷2−1")).toBe(20);
  expect(evaluate("+3")).toBe(3);
});

test("functions, constants, implicit multiplication, degrees", () => {
  expect(evaluate("sqrt(16)+√(9)")).toBe(7);
  expect(evaluate("2π")).toBeCloseTo(2 * Math.PI);
  expect(evaluate("sin(90)", { degrees: true })).toBeCloseTo(1);
  expect(evaluate("log(1000)")).toBeCloseTo(3);
  expect(evaluate("2(3+1)")).toBe(8);
});

test("errors", () => {
  expect(() => evaluate("1/0")).toThrow("Division by zero");
  expect(() => evaluate("(1+2")).toThrow("Mismatched");
  expect(() => evaluate("1+")).toThrow("Malformed");
  expect(() => evaluate("2#3")).toThrow("Unknown symbol");
  expect(() => evaluate("2.5!")).toThrow("Factorial");
});

test("formatNumber hides float noise", () => {
  expect(formatNumber(evaluate("0.1+0.2"))).toBe("0.3");
  expect(formatNumber(1 / 3)).toBe("0.333333333333");
});
