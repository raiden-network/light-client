export const mockedFetch = jest
  .fn()
  .mockImplementation(async (_url: string) => new MockedResponse('<body></body>'));

export class MockedRequest {
  private input: string | MockedRequest;
  private init: RequestInit | undefined;

  constructor(input: string | MockedRequest, init?: RequestInit) {
    this.input = input;
    this.init = init;
  }

  get url(): string {
    return this.input instanceof MockedRequest ? this.input.url : this.input;
  }

  get method(): string {
    return this.init?.method ?? 'GET';
  }

  clone = jest.fn().mockImplementation(() => {
    return new MockedRequest(this.input, this.init);
  });
}

export class MockedResponse {
  constructor(
    private body: string,
    private init?: ResponseInit,
    public headers: Headers = new Headers(),
  ) {}

  get status(): number {
    return this.init?.status ?? 200;
  }

  clone = jest.fn().mockImplementation(() => {
    return new MockedResponse(this.body, this.init);
  });

  static error = jest.fn().mockImplementation(() => {
    return new MockedResponse('error', { status: 400 });
  });

  blob = jest.fn().mockImplementation(async () => {
    return new Blob([this.body], { type: 'text/html' });
  });
}
