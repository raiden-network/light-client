import log, { Logger, methodFactory, LoggingMethod } from 'loglevel';

export function setupLoglevel(): Logger {
  log.methodFactory = (
    methodName: string,
    level: 0 | 1 | 2 | 3 | 4 | 5,
    loggerName: string,
  ): LoggingMethod => {
    const rawMethod = methodFactory(methodName, level, loggerName);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (...message: any[]): void => {
      const prefix = `${new Date(Date.now()).toISOString()} [${methodName}]`;
      rawMethod(prefix, ...message);
    };
  };
  if (process.env.NODE_ENV === 'production') {
    log.setLevel('INFO');
  } else {
    log.setLevel('DEBUG');
  }
  return log;
}
