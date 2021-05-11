// In lack of being reliably able to spy on a class constructor, use more low
// level features to implement the mocking of the class.
export default jest.fn().mockImplementation(() => ({
  enable: jest.fn().mockResolvedValue(true),
  on: jest.fn(),
}));
