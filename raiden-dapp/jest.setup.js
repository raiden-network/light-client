import { MockedIDBObjectStore } from './tests/unit/utils/mocks/service-worker/indexeddb.ts';

if (!('IntersectionObserver' in global)) {
  class IntersectionObserver {
    constructor() {}

    observe() {
      return null;
    }

    unobserve() {
      return null;
    }
  }

  Object.assign(global, { IntersectionObserver });
}

if (typeof window.URL.createObjectURL === 'undefined') {
  window.URL.createObjectURL = () => {
    /*
     * Mock URL.createObjectURL which were causing
     * the qr-code-overlay.spec.ts to fail.
     */
  };
}

class EventTarget {
  listeners = {};

  addEventListener(type, callback) {
    if (!(type in this.listeners)) {
      this.listeners[type] = [];
    }

    this.listeners[type].push(callback);
  }

  dispatchEvent(event) {
    var callbacks = this.listeners[event.type] ?? [];

    for (const callback of callbacks) {
      callback.call(this, event);
    }
  }
}

Object.assign(global, { EventTarget });

Object.assign(global, { IDBObjectStore: MockedIDBObjectStore });
