import {
  amount,
  deposit,
  ensureChannelIsDeposited,
  ensureChannelIsOpen,
  ensureTransferPending,
  ensureTransferUnlocked,
  getChannel,
  id,
  token,
  tokenNetwork,
} from '../fixtures';
import {
  makeLog,
  makeRaidens,
  mockedSignMessage,
  originalSignMessage,
  providersEmit,
  waitBlock,
} from '../mocks';

import { defaultAbiCoder } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';
import { Two, WeiPerEther } from '@ethersproject/constants';
import { first, pluck } from 'rxjs/operators';

import { raidenConfigUpdate, raidenShutdown } from '@/actions';
import { Capabilities } from '@/constants';
import { messageServiceSend } from '@/messages/actions';
import { MessageType } from '@/messages/types';
import { createBalanceHash } from '@/messages/utils';
import { msBalanceProofSent, udcDeposit } from '@/services/actions';
import { Service } from '@/services/types';
import type { UInt } from '@/utils/types';

import { makeAddress, makeHash } from '../../utils';

describe('msMonitorRequestEpic', () => {
  test('success: receiving a transfer triggers monitoring', async () => {
    expect.assertions(1);
    const [raiden, partner] = await makeRaidens(2);
    const monitoringReward = BigNumber.from(5) as UInt<32>;

    raiden.store.dispatch(
      raidenConfigUpdate({
        httpTimeout: 30,
        monitoringReward,
        caps: {
          [Capabilities.DELIVERY]: 0,
          [Capabilities.MEDIATE]: 0,
          // 'Receive' should be auto-enabled by 'getCaps$'
        },
        // rate=WeiPerEther == 1:1 to SVT
        rateToSvt: { [token]: WeiPerEther as UInt<32> },
      }),
    );
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], deposit);
    await ensureTransferUnlocked([partner, raiden], amount);

    await waitBlock();
    const partnerBP = getChannel(raiden, partner).partner.balanceProof;

    expect(raiden.output).toContainEqual(
      messageServiceSend.request(
        {
          message: {
            type: MessageType.MONITOR_REQUEST,
            balance_proof: {
              chain_id: partnerBP.chainId,
              token_network_address: tokenNetwork,
              channel_identifier: partnerBP.channelId,
              nonce: partnerBP.nonce,
              balance_hash: createBalanceHash(partnerBP),
              additional_hash: partnerBP.additionalHash,
              signature: partnerBP.signature,
            },
            non_closing_participant: raiden.address,
            non_closing_signature: expect.any(String),
            monitoring_service_contract_address: expect.any(String),
            reward_amount: monitoringReward,
            signature: expect.any(String),
          },
        },
        { service: Service.MS, msgId: expect.any(String) },
      ),
    );
  });

  test('success: token without known rateToSvt gets monitored', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    raiden.store.dispatch(raidenConfigUpdate({ rateToSvt: {} }));
    expect(
      (await raiden.deps.latest$.pipe(pluck('udcDeposit', 'balance'), first()).toPromise()).gte(
        raiden.config.monitoringReward!,
      ),
    ).toBe(true);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], deposit);
    await ensureTransferUnlocked([partner, raiden], amount);
    await waitBlock();

    const partnerBP = getChannel(raiden, partner).partner.balanceProof;

    expect(raiden.output).toContainEqual(
      messageServiceSend.request(
        {
          message: {
            type: MessageType.MONITOR_REQUEST,
            balance_proof: {
              chain_id: partnerBP.chainId,
              token_network_address: tokenNetwork,
              channel_identifier: partnerBP.channelId,
              nonce: partnerBP.nonce,
              balance_hash: createBalanceHash(partnerBP),
              additional_hash: partnerBP.additionalHash,
              signature: partnerBP.signature,
            },
            non_closing_participant: raiden.address,
            non_closing_signature: expect.any(String),
            monitoring_service_contract_address: expect.any(String),
            reward_amount: raiden.config.monitoringReward!,
            signature: expect.any(String),
          },
        },
        { service: Service.MS, msgId: expect.any(String) },
      ),
    );
  });

  test('ignore: not enough udcDeposit.balance', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    const { userDepositContract } = raiden.deps;
    const monitoringReward = BigNumber.from(5) as UInt<32>;
    raiden.store.dispatch(
      raidenConfigUpdate({
        httpTimeout: 30,
        monitoringReward,
        caps: {
          [Capabilities.DELIVERY]: 0,
          [Capabilities.MEDIATE]: 0,
          // 'Receive' should be auto-enabled by 'getCaps$'
        },
        // rate=WeiPerEther == 1:1 to SVT
        rateToSvt: { [token]: WeiPerEther as UInt<32> },
      }),
    );

    userDepositContract.effectiveBalance.mockResolvedValue(monitoringReward.sub(1));
    userDepositContract.total_deposit.mockResolvedValue(monitoringReward.sub(1));
    await waitBlock();

    const balance = monitoringReward.sub(1) as UInt<32>;
    expect(raiden.output).toContainEqual(
      udcDeposit.success({ balance }, { totalDeposit: balance }),
    );

    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], deposit);
    await ensureTransferUnlocked([partner, raiden], amount);
    await waitBlock();

    expect(raiden.output).not.toContainEqual(
      messageServiceSend.request(
        { message: expect.objectContaining({ type: MessageType.MONITOR_REQUEST }) },
        expect.anything(),
      ),
    );
  });

  test('ignore: config.monitoringReward unset', async () => {
    expect.assertions(1);
    const [raiden, partner] = await makeRaidens(2);
    raiden.store.dispatch(raidenConfigUpdate({ monitoringReward: null }));

    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], deposit);
    await ensureTransferUnlocked([partner, raiden], amount);
    await waitBlock();

    expect(raiden.output).not.toContainEqual(
      messageServiceSend.request(
        { message: expect.objectContaining({ type: MessageType.MONITOR_REQUEST }) },
        expect.anything(),
      ),
    );
  });

  test('ignore: signing rejected not fatal', async () => {
    expect.assertions(3);

    const [raiden, partner] = await makeRaidens(2);
    const monitoringReward = BigNumber.from(5) as UInt<32>;
    raiden.store.dispatch(
      raidenConfigUpdate({
        httpTimeout: 30,
        monitoringReward,
        caps: {
          [Capabilities.DELIVERY]: 0,
          [Capabilities.MEDIATE]: 0,
          // 'Receive' should be auto-enabled by 'getCaps$'
        },
        // rate=WeiPerEther == 1:1 to SVT
        rateToSvt: { [token]: WeiPerEther as UInt<32> },
      }),
    );
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], deposit);
    await ensureTransferPending([partner, raiden], amount);

    // fails on RequestMonitoring message
    mockedSignMessage.mockImplementation(async (signer, message, opts) => {
      if (message.type === MessageType.MONITOR_REQUEST) throw new Error('Signature rejected');
      return originalSignMessage(signer, message, opts);
    });

    await ensureTransferUnlocked([partner, raiden], amount);
    await waitBlock();

    expect(raiden.output).not.toContainEqual(
      messageServiceSend.request(
        { message: expect.objectContaining({ type: MessageType.MONITOR_REQUEST }) },
        expect.anything(),
      ),
    );
    expect(raiden.output).not.toContainEqual(raidenShutdown(expect.anything()));
    /* We expect 4 times because in the ensureTransferUnlocked after the transfer/success  action
     we have MonitorRequest, SecretReveal, PFSCapacityUpdate which fail*/
    expect(mockedSignMessage).toHaveBeenCalledWith(
      raiden.deps.signer,
      expect.objectContaining({ type: MessageType.MONITOR_REQUEST }),
      expect.anything(),
    );
  });

  test('ignore: non economically viable channels', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const monitoringReward = BigNumber.from(5) as UInt<32>;
    raiden.store.dispatch(
      raidenConfigUpdate({
        httpTimeout: 30,
        monitoringReward,
        caps: {
          [Capabilities.DELIVERY]: 0,
          [Capabilities.MEDIATE]: 0,
          // 'Receive' should be auto-enabled by 'getCaps$'
        },
        // rate=WeiPerEther == 1:1 to SVT
        rateToSvt: { [token]: WeiPerEther as UInt<32> },
      }),
    );
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], deposit);

    // transfer <= monitoringReward isn't worth to be monitored
    await ensureTransferUnlocked([partner, raiden], monitoringReward.sub(1) as UInt<32>);
    await waitBlock();

    expect(raiden.output).not.toContainEqual(
      messageServiceSend.request(
        { message: expect.objectContaining({ type: MessageType.MONITOR_REQUEST }) },
        expect.anything(),
      ),
    );
  });

  test('ignore: non unlocked amount', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const monitoringReward = BigNumber.from(5) as UInt<32>;
    raiden.store.dispatch(
      raidenConfigUpdate({
        httpTimeout: 30,
        monitoringReward,
        caps: {
          [Capabilities.DELIVERY]: 0,
          [Capabilities.MEDIATE]: 0,
          // 'Receive' should be auto-enabled by 'getCaps$'
        },
        // rate=WeiPerEther == 1:1 to SVT
        rateToSvt: { [token]: WeiPerEther as UInt<32> },
      }),
    );
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], deposit);

    // transfer <= monitoringReward isn't worth to be monitored
    await ensureTransferPending([partner, raiden], amount);
    await waitBlock();

    expect(raiden.output).not.toContainEqual(
      messageServiceSend.request(
        { message: expect.objectContaining({ type: MessageType.MONITOR_REQUEST }) },
        expect.anything(),
      ),
    );
  });
});

test('msMonitorNewBPEpic', async () => {
  expect.assertions(1);

  const [raiden, partner] = await makeRaidens(2);
  await ensureChannelIsOpen([raiden, partner]);

  const { monitoringServiceContract } = raiden.deps;
  const monitoringService = makeAddress();
  const nonce = Two as UInt<8>;
  const txHash = makeHash();

  // emit a NewBalanceProofReceived event
  await providersEmit(
    {},
    makeLog({
      transactionHash: txHash,
      filter: monitoringServiceContract.filters.NewBalanceProofReceived(
        null,
        null,
        null,
        nonce,
        monitoringService,
        raiden.address,
      ),
      data: defaultAbiCoder.encode(
        ['address', 'uint256', 'uint256'], // first 3 event arguments, non-indexed
        [tokenNetwork, id, raiden.config.monitoringReward!],
      ),
    }),
  );
  await waitBlock();

  expect(raiden.output).toContainEqual(
    msBalanceProofSent({
      tokenNetwork,
      partner: partner.address,
      id,
      reward: raiden.config.monitoringReward!,
      nonce,
      monitoringService,
      txHash,
      txBlock: expect.any(Number),
      confirmed: undefined,
    }),
  );
});
