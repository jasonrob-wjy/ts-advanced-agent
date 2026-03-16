export function calculator(expression: string): string {
  try {
    const result = eval(expression);
    return String(result);
  } catch (e: any) {
    return `Error: ${e?.message ?? String(e)}`;
  }
}
