/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LogMessage, LogType } from '@jest/console';
import { CustomConsole } from '@jest/console';
import type { Event, State } from 'jest-circus';
import { TestEnvironment as NodeEnvironment } from 'jest-environment-node';
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
    const TITLE = _type !== 'log' ? ` [${_type}]`.padEnd(10) : '';
    const INDENT = _type !== 'log' ? ''.padStart(10) : '  ';

    return message
      .split(/\n/)
      .map((line, i) => (i ? INDENT : TITLE) + line)
      .join('\n');
  }

  private enqueue(level: Level, ...args: [any, ...any[]]) {
    let trace = '';
    if (level === 'warn' || level === 'error') {
      const trace_ = new Error().stack!.split('\n');
      trace_.shift(); // removes Error: stacktrace
      trace_.shift(); // removes enqueue()
      trace = trace_.join('\n');
    }
    this.queue.push({
      level,
      stack: trace,
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
      );
    }
  }
}

/**
 * A NodeEnvironment which stores logs from tests, and prints them only if test fails
 * Can be disabled (i.e. original behavior) with `--verbose` command line arg (not config)
 */
export class LogfailNodeEnvironment extends NodeEnvironment {
  private testConsole: FailBufferedConsole | undefined;

  async setup() {
    if (!process.argv.includes('--verbose'))
      this.global.console = this.testConsole = new FailBufferedConsole();
    await super.setup();
  }

  async handleTestEvent(event: Event, _: State) {
    if (!this.testConsole) return;
    if (event.name === 'test_fn_failure') {
      this.testConsole.raw(
        'log',
        `=== ● [LOGS]  ${event.test.parent.name} › ${event.test.name}  ===\n`,
      );
      this.testConsole.log('');
      this.testConsole.log(
        `=== ● [LOGS]  ${event.test.parent.name} › ${event.test.name}  [END] ===\n`,
      );
      this.testConsole.flush();
    } else if (event.name === 'test_fn_success') {
      this.testConsole.clear();
    }
  }
}

export default LogfailNodeEnvironment;
