import logging, { methodFactory } from 'loglevel';

let curMethodFactory = methodFactory;
Object.defineProperty(logging, 'methodFactory', {
  enumerable: true,
  configurable: true,
  get() {
    return curMethodFactory;
  },
  set(func: typeof curMethodFactory & { allow_overwrite?: boolean }) {
    /* prevent anyone else but us (e.g. matrix) from overwriting methodFactory  */
    if (!func.allow_overwrite) return;
    curMethodFactory = func;
  },
});
