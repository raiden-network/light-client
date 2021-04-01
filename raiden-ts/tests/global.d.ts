declare module 'pouchdb-debug';

declare namespace jasmine {
  interface TestResult {
    id: string;
    description: string;
    fullName: string;
    failedExpectations: {
      actual: string;
      error: Error;
      expected: string;
      matcherName: string;
      message: string;
      passed: boolean;
      stack: string;
    }[];
    passedExpectations: unknown[];
    pendingReason: string;
    testPath: string;
  }
  let currentTest: TestResult | null;

  interface Reporter {
    specStarted(result: TestResult): void;
  }

  interface Env {
    addReporter: (reporter: Reporter) => void;
  }

  function getEnv(): Env;
}
