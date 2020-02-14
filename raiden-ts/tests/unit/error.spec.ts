import { isError } from 'util';

import RaidenError, { ErrorCodes } from '../../src/utils/error';

describe('Test custom error', () => {
  test('MyCustomError is instance of its custom class', () => {
    try {
      throw new RaidenError(ErrorCodes.PFS_DISABLED);
    } catch (err) {
      expect(err.name).toEqual('RaidenError');
    }
  });

  test('MyCustomError is an instance of Error', () => {
    try {
      throw new RaidenError(ErrorCodes.PFS_DISABLED);
    } catch (err) {
      expect(err instanceof Error).toBeTruthy();
      expect(isError(err)).toBeTruthy();
    }
  });

  test('Has stack trace w/ class name and developer-friendly message', () => {
    try {
      function doSomething() {
        throw new RaidenError(ErrorCodes.PFS_DISABLED);
      }
      doSomething();
    } catch (err) {
      // Stack trace exists
      expect(err.stack).toBeDefined();

      // Stack trace starts with the error message
      expect(err.stack.split('\n').shift()).toEqual(
        'RaidenError: Pathfinding Service is disabled and no direct route is available.',
      );

      // Stack trace contains function where error was thrown
      expect(err.stack.split('\n')[1]).toContain('doSomething');
    }
  });

  test('End user "code" property is set', () => {
    try {
      throw new RaidenError(ErrorCodes.PFS_DISABLED);
    } catch (err) {
      expect(err.code).toBeDefined();
      expect(err.code).toEqual('PFS_DISABLED');
    }
  });

  test('Details can be added and are shown in stack trace', () => {
    try {
      throw new RaidenError(ErrorCodes.PFS_DISABLED, [{ value: 'bar', key: 'foo' }]);
    } catch (err) {
      expect(err.details).toEqual([{ value: 'bar', key: 'foo' }]);
    }
  });
});
