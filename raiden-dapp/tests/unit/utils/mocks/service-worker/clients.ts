export const postClientMessageMock = jest.fn();

export class MockedClients {
  private clients: { [id: string]: MockedClient } = {};

  constructor(clients?: MockedClient[]) {
    (clients ?? []).forEach((client) => {
      this.clients[client.id] = client;
    });
  }

  get = jest.fn().mockImplementation(async (id: string) => this.clients[id]);
  matchAll = jest.fn().mockImplementation(async () => Object.values(this.clients));
  claim = jest.fn();
}

export class MockedClient {
  public id: string;

  constructor(id?: string) {
    this.id = id ?? 'client-id';
  }

  postMessage = jest.fn();
}
