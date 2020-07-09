import { getAddress, getAmount } from '@/utils/query-params';

describe('query params', () => {
  describe('amount', () => {
    test('invalid param returns empty string', () => {
      expect(getAmount('3u4jhfeslkjdhf')).toBe('');
    });

    test('valid number returns the value', () => {
      expect(getAmount('1.2')).toBe('1.2');
    });

    test('undefined returns empty string', () => {
      expect(getAmount(undefined)).toBe('');
    });
  });

  describe('address', () => {
    test('invalid param returns empty string', () => {
      expect(getAddress('0xaqsdjhaslkjdh')).toBe('');
    });

    test('valid address returns the value', () => {
      expect(getAddress('0x1D36124C90f53d491b6832F1c073F43E2550E35b')).toBe(
        '0x1D36124C90f53d491b6832F1c073F43E2550E35b'
      );
    });

    test('non-checksum address returns empty string', () => {
      expect(getAddress('0x1d36124c90f53d491b6832f1c073f43e2550e35b')).toBe('');
    });

    test('undefined returns empty string', () => {
      expect(getAddress(undefined)).toBe('');
    });
  });
});
