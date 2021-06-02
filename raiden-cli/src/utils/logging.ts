import { BigNumber } from 'ethers';
import fs from 'fs';
import type { LoggingMethod, LogLevelNumbers, RootLogger } from 'loglevel';
import logging from 'loglevel';
import util from 'util';

util.inspect.defaultOptions.depth = 4; // +2 from default of 2

const redactions: readonly [RegExp, string][] = [
  [/(\\?["']?access_?token\\?["']?\s*[=:]\s*\\?["']?)[\w-]+(\\?["']?)/gi, '$1<redacted>$2'],
  [/(\\?["']?secret\\?["']?\s*[=:]\s*)\[[^\]]+\]/gi, '$1["<redacted>"]'],
  [/(\\?["']?secret\\?["']?\s*[=:]\s*\\?["']?)\w+(\\?["']?)/gi, '$1<redacted>$2'],
];
function redactLogs(text: unknown) {
  if (typeof text === 'string')
    text = redactions.reduce((text, [re, repl]) => text.replace(re, repl), text);
  return text;
}

/**
 * @param output - Output filepath
 */
export function setupLoglevel(output?: string): void {
  if (output) {
    util.inspect.colors = {};
    const logfile = fs.createWriteStream(output, { flags: 'a' });
    process.stdout.write = process.stderr.write = (chunk: unknown) => {
      return logfile.write(redactLogs(chunk));
    };
  }

  const originalFactory = logging.methodFactory;
  let first = true;
  function raidenMethodFactory(
    this: RootLogger,
    methodName: string,
    level: LogLevelNumbers,
    loggerName: string | symbol,
  ): LoggingMethod {
    const rawMethod = originalFactory.call(this, methodName, level, loggerName);

    return (...message: unknown[]): void => {
      const prefix = [new Date(Date.now()).toISOString()];
      if (first && typeof loggerName === 'string' && loggerName.startsWith('raiden')) {
        prefix.push('@', loggerName);
        first = false;
      }
      prefix.push(`[${methodName}]`, '=>');
      rawMethod.call(this, ...prefix, ...message);
    };
  }

  raidenMethodFactory.allow_overwrite = true;
  logging.methodFactory = raidenMethodFactory;
  logging.setLevel(process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG');
}

// better BigNumber inspect representation for logs
Object.defineProperty(BigNumber.prototype, util.inspect.custom, {
  enumerable: false,
  value(this: BigNumber, _: number, opts: util.InspectOptionsStylized) {
    return `${opts.stylize('BN', 'special')}(${opts.stylize(this.toString(), 'number')})`;
  },
});
