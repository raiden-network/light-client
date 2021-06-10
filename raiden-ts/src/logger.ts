import logging, { methodFactory } from 'loglevel';

let curMethodFactory = methodFactory;
Object.defineProperty(logging, 'methodFactory', {
  enumerable: true,
  configurable: true,
  get() {
    return curMethodFactory;
  },
  set(func: typeof curMethodFactory & { allowOverwrite?: boolean }) {
    /* prevent anyone else but us (e.g. matrix) from overwriting methodFactory  */
    if (!func.allowOverwrite) return;
    curMethodFactory = func;
  },
});
