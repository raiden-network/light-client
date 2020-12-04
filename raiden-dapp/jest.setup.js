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
