import logging from 'loglevel';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface RaidenDB extends DBSchema {
  logs: {
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

function filterMessage(message: any[]) {
  if (message[0] === '%c prev state') return;
  if (message[0] === '—— log end ——') return;
  if (typeof message[1] === 'string' && message[1].startsWith('color:'))
    message.splice(1, 1);
  return message;
}

export async function setupLogStore(
  dbName = 'raiden',
  additionalLoggers: string[] = ['matrix']
): Promise<void> {
  if (typeof db !== 'undefined') return;
  db = await openDB<RaidenDB>(dbName, 1, {
    upgrade(db) {
      const logsStore = db.createObjectStore('logs');
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
        if (filtered !== undefined)
          db.put(
            'logs',
            { logger: loggerName, level: methodName, message },
            Date.now()
          );
      };
    };
  }
}

export async function getLogsFromStore(): Promise<[number, string]> {
  let content = '';
  let cursor = await db.transaction('logs').store.openCursor();
  let lastTime = 0;
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
