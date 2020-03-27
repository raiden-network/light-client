import logging from 'loglevel';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

const collectionName = 'logs';

interface RaidenDB extends DBSchema {
  [collectionName]: {
    value: {
      logger: string;
      level: string;
      message: any[];
    };
    key: number;
    indexes: {
      'by-logger': string;
      'by-level': number;
    };
  };
}

let db: IDBPDatabase<RaidenDB>;

/* istanbul ignore next */
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

/* istanbul ignore next */
function filterMessage(message: any[]) {
  if (message[0] === '%c prev state') return;
  if (message[0] === '—— log end ——') return;
  message = message.map(e => (e instanceof Error ? serializeError(e) : e));
  if (typeof message[1] === 'string' && message[1].startsWith('color:'))
    message.splice(1, 1);
  return message;
}

/* istanbul ignore next */
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

/* istanbul ignore next */
export async function setupLogStore(
  dbName = 'raiden',
  additionalLoggers: string[] = ['matrix']
): Promise<void> {
  if (typeof db !== 'undefined') return;
  db = await openDB<RaidenDB>(dbName, 1, {
    upgrade(db) {
      const logsStore = db.createObjectStore(collectionName);
      logsStore.createIndex('by-logger', 'logger');
      logsStore.createIndex('by-level', 'level');
    }
  });

  for (const log of [logging, ...additionalLoggers.map(logging.getLogger)]) {
    const origFactory = log.methodFactory;
    log.methodFactory = (
      methodName: string,
      level: 0 | 1 | 2 | 3 | 4 | 5,
      loggerName: string
    ): logging.LoggingMethod => {
      const rawMethod = origFactory(methodName, level, loggerName);
      return (...message: any[]): void => {
        rawMethod(...message);
        const filtered = filterMessage(message);
        if (!filtered) return;
        db.put(
          collectionName,
          { logger: loggerName, level: methodName, message },
          Date.now()
        ).catch(() =>
          db.put(
            collectionName,
            {
              logger: loggerName,
              level: methodName,
              message: message.map(serialize)
            },
            Date.now()
          )
        );
      };
    };
  }
}

export async function getLogsFromStore(): Promise<[number, string]> {
  let content = '';
  let cursor = await db.transaction(collectionName).store.openCursor();
  let lastTime = Date.now();
  while (cursor) {
    const { logger, level, message } = cursor.value;
    const line = message
      .map(m => (typeof m === 'string' ? m : JSON.stringify(m)))
      .join(' ');
    lastTime = +cursor.key;
    const time = new Date(cursor.key).toISOString();
    content += `${time} @ ${logger} [${level}] \t=> ${line}\n`;
    cursor = await cursor.continue();
  }
  return [lastTime, content];
}
