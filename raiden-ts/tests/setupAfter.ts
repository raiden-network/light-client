import 'jest-extended';

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LogMessage, LogType } from '@jest/console';
import { CustomConsole } from '@jest/console';
import util from 'util';

type Level = 'log' | 'error' | 'warn' | 'info' | 'debug';

class FailBufferedConsole extends CustomConsole {
  private queue: { level: Level; stack?: string; message: string }[] = [];

  constructor() {
    super(process.stdout, process.stderr, FailBufferedConsole.formatter);

    this.log = this.enqueue.bind(this, 'log');
    this.error = this.enqueue.bind(this, 'error');
    this.warn = this.enqueue.bind(this, 'warn');
    this.info = this.enqueue.bind(this, 'info');
    this.debug = this.enqueue.bind(this, 'debug');
  }

  private static formatter(_type: LogType, message: LogMessage): string {
    const TITLE = `  [${_type}]`.padEnd(10);
    const INDENT = ''.padStart(12);

    return message
      .split(/\n/)
      .map((line, i) => (i ? INDENT : TITLE) + line)
      .join('\n');
  }

  private enqueue(level: Level, ...args: [any, ...any[]]) {
    const trace = new Error().stack!.split('\n');
    trace.shift(); // removes Error: stacktrace
    trace.shift(); // removes enqueue()
    this.queue.push({
      level,
      stack: trace.join('\n'),
      message: util.formatWithOptions({ colors: true, depth: 6 }, ...args),
    });
  }

  raw(level: Level, ...args: [any, ...any[]]) {
    super[level].call(this, ...args);
  }

  clear() {
    return this.queue.splice(0, this.queue.length);
  }

  flush() {
    for (const { level, stack, message } of this.clear()) {
      this.raw(
        level,
        message,
        ...(stack && ['warn', 'error'].includes(level) ? ['\n' + stack] : []),
        '\n',
      );
    }
  }
}

const testConsole = new FailBufferedConsole();

jasmine.getEnv().addReporter({
  specStarted(result) {
    jasmine.currentTest = result;
  },
});

beforeAll(() => {
  globalThis.console = testConsole;
});

afterEach(() => {
  // this includes tests that got aborted, ran into errors etc.
  const failed =
    jasmine.currentTest && Array.isArray(jasmine.currentTest.failedExpectations)
      ? jasmine.currentTest.failedExpectations.length > 0
      : true;
  if (failed) {
    testConsole.raw('info', `====== LOGS [${jasmine.currentTest!.fullName}] ======\n`);
    testConsole.info(`====== LOGS [${jasmine.currentTest!.fullName}] END ======`);
    testConsole.flush();
  } else {
    testConsole.clear();
  }
  jasmine.currentTest = null;
});
