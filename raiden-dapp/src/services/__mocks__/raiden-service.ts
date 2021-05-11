export default class RaidenService {
  closeChannel = jest.fn().mockResolvedValue(undefined);
  connect = jest.fn();
  deposit = jest.fn().mockResolvedValue(undefined);
  fetchAndUpdateTokenData = jest.fn().mockResolvedValue(undefined);
  monitorToken = jest.fn().mockResolvedValue(undefined);
  openChannel = jest.fn().mockResolvedValue(undefined);
  planUDCWithdraw = jest.fn().mockResolvedValue(undefined);
  settleChannel = jest.fn().mockResolvedValue(undefined);
  withdraw = jest.fn().mockResolvedValue(undefined);
}
