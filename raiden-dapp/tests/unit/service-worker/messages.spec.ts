import {
  ServiceWorkerMessageEvent,
  ServiceWorkerMessageSimple,
  ServiceWorkerMessageType,
} from '@/service-worker/messages';

describe('service worker messages', () => {
  describe('ServiceWorkerMessageSimple', () => {
    test('decode to new format with payload', () => {
      const message = new ServiceWorkerMessageSimple(ServiceWorkerMessageType.INSTALLED_VERSION, {
        version: '1.0.0',
      });

      expect(message.encode()).toMatchObject({
        type: 'installed_version',
        version: '1.0.0',
      });
    });

    test('decode to old format without payload', () => {
      const message = new ServiceWorkerMessageSimple(ServiceWorkerMessageType.INSTALLED_VERSION, {
        version: '1.0.0',
      });

      expect(message.encodeOldFormat()).toBe('installed_version');
    });
  });

  describe('ServiceWorkerMessageEvent', () => {
    test('parses unknown event data format to unknown message', () => {
      const event = new MessageEvent('message', { data: { super: 'crazy' } });
      const message = new ServiceWorkerMessageEvent(event);

      expect(message.type).toBe('unknown');
      expect(message.payload).toMatchObject({});
    });

    test('can parse events with old data format', () => {
      const event = new MessageEvent('message', { data: 'installed_version' });
      const message = new ServiceWorkerMessageEvent(event);

      expect(message.type).toBe('installed_version');
      expect(message.payload).toMatchObject({});
    });

    test('can parse events with new data format and payload', () => {
      const data = { type: 'installed_version', version: '1.0.0' };
      const event = new MessageEvent('message', { data });
      const message = new ServiceWorkerMessageEvent(event);

      expect(message.type).toBe('installed_version');
      expect(message.payload).toMatchObject({ version: '1.0.0' });
    });

    test('decode to new format with payload', () => {
      const data = { type: 'installed_version', version: '1.0.0' };
      const event = new MessageEvent('message', { data });
      const message = new ServiceWorkerMessageEvent(event);

      expect(message.encode()).toMatchObject({
        type: 'installed_version',
        version: '1.0.0',
      });
    });

    test('decode to old format without payload', () => {
      const event = new MessageEvent('message', { data: 'installed_version' });
      const message = new ServiceWorkerMessageEvent(event);

      expect(message.encodeOldFormat()).toBe('installed_version');
    });
  });
});
