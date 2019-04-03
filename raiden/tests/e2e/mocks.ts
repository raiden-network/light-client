import { Storage } from 'raiden/types';

export const MockStorage: jest.Mock<
  jest.Mocked<Storage>,
  [({ [key: string]: string })?]
> = jest.fn(function(init?: { [key: string]: string }) {
  const storage: NonNullable<typeof init> = init || {};
  return {
    storage,
    getItem: jest.fn(async (key: string) => storage[key] || null),
    setItem: jest.fn(async (key: string, value: string) => {
      storage[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete storage[key];
    }),
  };
});
