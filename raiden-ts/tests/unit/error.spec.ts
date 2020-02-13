import { isError } from 'util';

import RaidenError, { ErrorDetails } from '../../src/utils/error';

enum MyCustomErrorCodes {
  TEST = 'Developer-friendly description',
}

class MyCustomError extends RaidenError {
  constructor(message: MyCustomErrorCodes, detail?: ErrorDetails) {
    super(message, detail);
    this.name = 'MyCustomError';
  }

  getCode(message: string): string {
    return (
      Object.keys(MyCustomErrorCodes).find(code => Object(MyCustomErrorCodes)[code] === message) ??
      'GENERAL_ERROR'
    );
  }
}

describe('Test custom error', () => {
  test('MyCustomError is instance of its custom class', () => {
    try {
      throw new MyCustomError(MyCustomErrorCodes.TEST);
    } catch (err) {
      expect(err).toBeInstanceOf(MyCustomError);
      expect(err.name).toEqual('MyCustomError');
    }
  });

  test('MyCustomError is an instance of Error', () => {
    try {
      throw new MyCustomError(MyCustomErrorCodes.TEST);
    } catch (err) {
      expect(err instanceof Error).toBeTruthy();
      expect(isError(err)).toBeTruthy();
    }
  });

  test('Has stack trace w/ class name and developer-friendly message', () => {
    try {
      function doSomething() {
        throw new MyCustomError(MyCustomErrorCodes.TEST);
      }
      doSomething();
    } catch (err) {
      // Stack trace exists
      expect(err.stack).toBeDefined();

      // Stack trace starts with the error message
      expect(err.stack.split('\n').shift()).toEqual(
        'MyCustomError: Developer-friendly description',
      );

      // Stack trace contains function where error was thrown
      expect(err.stack.split('\n')[1]).toContain('doSomething');
    }
  });

  test('End user "code" property is set', () => {
    try {
      throw new MyCustomError(MyCustomErrorCodes.TEST);
    } catch (err) {
      expect(err.code).toBeDefined();
      expect(err.code).toEqual('TEST');
    }
  });

  test('Details can be added and are shown in stack trace', () => {
    try {
      throw new MyCustomError(MyCustomErrorCodes.TEST, [{ value: 'bar', key: 'foo' }]);
    } catch (err) {
      expect(err.details).toEqual([{ value: 'bar', key: 'foo' }]);
    }
  });
});
