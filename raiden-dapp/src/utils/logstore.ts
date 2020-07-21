/* istanbul ignore file */
import logging from 'loglevel';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

const storeName = 'logs';
let lastBlockNumber: number | undefined = undefined;

interface RaidenDB extends DBSchema {
  [storeName]: {
    value: {
      logger: string;
      level: string;
      message: any[];
      block?: number;
    };
    key: number;
    indexes: {
      'by-logger': string;
      'by-level': number;
    };
  };
}

let db: IDBPDatabase<RaidenDB>;

function serializeError(e: Error): string {
  // special handling of Errors, since firefox doesn't like to structure-clone it
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1556604
  const strError = e.toString();
  if (!e.stack) {
    return strError;
  } else if (e.stack.startsWith(strError)) {
    return e.stack; // chrome includes error str repr on top of stack
  } else {
    return `${strError}\n${e.stack}`;
  }
}

function filterMessage(message: any[]) {
  if (message[0] === '%c prev state') return;
  if (message[0]?.startsWith?.('action %c')) return;
  if (message[0] === '—— log end ——') return;
  const blockNumber: number | undefined = message[2]?.payload?.blockNumber;
  if (blockNumber) {
    lastBlockNumber = blockNumber; // set lastBlockNumber and skip newBlock action
    return;
  }
  message = message.map((e) =>
    e instanceof Error
      ? serializeError(e)
      : e?.payload instanceof Error // error action
      ? { ...e, payload: serializeError(e.payload) }
      : e
  );
  if (typeof message[1] === 'string' && message[1].startsWith('color:'))
    message.splice(1, 1);
  return message;
}

function serialize(e: any): string {
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch (err) {
    try {
      return e.toString();
    } catch (err) {
      return '<unserializable>';
    }
  }
}

async function setupDb(dbName: string) {
  if (db?.name === dbName) return;
  db = await openDB<RaidenDB>(dbName, 1, {
    upgrade(db) {
      const logsStore = db.createObjectStore(storeName);
      logsStore.createIndex('by-logger', 'logger');
      logsStore.createIndex('by-level', 'level');
    },
  });
}

const loggerRe = /^raiden:(0x[0-9a-f]{40})$/i;
async function setDbForLogger(loggerName: string) {
  if (!loggerRe.test(loggerName)) return;
  await setupDb(loggerName);
}

export async function setupLogStore(
  additionalLoggers: string[] = ['matrix']
): Promise<void> {
  if (typeof db !== 'undefined') return;
  await setupDb('raiden'); // init database, for startup logs

  for (const log of [logging, ...additionalLoggers.map(logging.getLogger)]) {
    const origFactory = log.methodFactory;
    log.methodFactory = (
      methodName: string,
      level: 0 | 1 | 2 | 3 | 4 | 5,
      loggerName: string
    ): logging.LoggingMethod => {
      const rawMethod = origFactory(methodName, level, loggerName);
      setDbForLogger(loggerName);
      return (...message: any[]): void => {
        rawMethod(...message);
        const filtered = filterMessage(message);
        if (!filtered) return;
        db.put(
          storeName,
          {
            logger: loggerName,
            level: methodName,
            message: filtered,
            ...(lastBlockNumber ? { block: lastBlockNumber } : {}),
          },
          Date.now()
        ).catch(() =>
          db.put(
            storeName,
            {
              logger: loggerName,
              level: methodName,
              message: message.map(serialize),
              ...(lastBlockNumber ? { block: lastBlockNumber } : {}),
            },
            Date.now()
          )
        );
      };
    };
  }
}

const redactions: readonly [RegExp, string][] = [
  [/("?access_?token"?\s*[=:]\s*)("?)\w+("?)/gi, '$1$2<redacted>$3'],
  [/("?secret"?\s*[=:]\s*)\[[^\]]+\]/gi, '$1["<redacted>"]'],
  [/("?secret"?\s*[=:]\s*)("?)\w+("?)/gi, '$1$2<redacted>$3'],
];
function redactLogs(text: string): string {
  for (const [re, repl] of redactions) text = text.replace(re, repl);
  return text;
}

export async function getLogsFromStore(): Promise<[number, string]> {
  let content = '';
  let cursor = await db.transaction(storeName).store.openCursor();
  let lastTime = Date.now();
  let first = true;
  while (cursor) {
    const { logger, level, message, block } = cursor.value;
    const line = message
      .map((m) => (typeof m === 'string' ? m : JSON.stringify(m)))
      .join(' ');
    lastTime = +cursor.key;
    const time = new Date(cursor.key).toISOString();
    const blockStr = block ? ` #${block}` : ''; // don't print block if there's none
    // most (usually all) entries have loggerName == dbName == `raiden:<address>`
    // in this case, we print the loggerName only once and omit later to save space
    let loggerStr;
    if (logger === db.name && !first) loggerStr = '';
    else {
      loggerStr = ` @ ${logger}`;
      first = false;
    }
    content += `${time}${blockStr}${loggerStr} [${level}] \t=> ${line}\n`;
    cursor = await cursor.continue();
  }
  content = redactLogs(content);
  return [lastTime, content];
}
