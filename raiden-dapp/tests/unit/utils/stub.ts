export function stub<T>(): T {
  const typeAssertion = <T>{};
  for (const prop in typeAssertion) {
    // @ts-ignore
    if (typeAssertion.hasOwnProperty(prop)) {
      // @ts-ignore
      typeAssertion[prop] = undefined;
    }
  }

  return typeAssertion;
}
