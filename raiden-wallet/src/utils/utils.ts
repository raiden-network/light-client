export function assertNonNull<T extends string | number | boolean | object>(
  item?: T | null,
  message?: string
): T {
  if (!item) {
    throw new Error(message || `Expected a non null value.`);
  } else {
    return item;
  }
}
export function offset(element: Element): Offset {
  const rect = element.getBoundingClientRect(),
    scrollLeft = window.pageXOffset || document.documentElement.scrollLeft,
    scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  return { top: rect.top + scrollTop, left: rect.left + scrollLeft };
}

export type Offset = { top: number; left: number };
