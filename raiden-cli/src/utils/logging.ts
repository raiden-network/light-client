/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import logging from 'loglevel';
import util from 'util';

util.inspect.defaultOptions.depth = 3; // +1 from default of 2

/**
 * @param output - Output filepath
 */
export function setupLoglevel(output?: string): void {
  const originalFactory = logging.methodFactory;

  logging.methodFactory = function raidenMethodFactory(methodName, level, loggerName) {
    const rawMethod = originalFactory(methodName, level, loggerName);
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

  if (output) {
    const logfile = fs.createWriteStream(output, { flags: 'a' });
    process.stdout.write = process.stderr.write = logfile.write.bind(logfile) as any;
  }
}
