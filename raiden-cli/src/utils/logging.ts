import logging, { LoggingMethod } from 'loglevel';

export function setupLoglevel(): void {
  const originalFactory = logging.methodFactory;

  logging.methodFactory = (
    methodName: string,
    level: 0 | 1 | 2 | 3 | 4 | 5,
    loggerName: string,
  ): LoggingMethod => {
    const rawMethod = originalFactory(methodName, level, loggerName);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (...message: any[]): void => {
      const prefix = `${new Date(Date.now()).toISOString()} [${methodName}]`;
      rawMethod(prefix, ...message);
    };
  };
  if (process.env.NODE_ENV === 'production') {
    logging.setLevel('INFO');
  } else {
    logging.setLevel('DEBUG');
  }
}
