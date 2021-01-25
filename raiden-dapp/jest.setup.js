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
