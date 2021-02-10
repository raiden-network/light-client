import type { BigNumber } from 'ethers';

import type { Token } from '@/model/types';

export interface PlannedUdcWithdrawal {
  txHash: string;
  txBlock: number;
  amount: BigNumber;
  withdrawBlock: number;
  confirmed: boolean | undefined;
}

export interface UserDepositContractState {
  tokenAddress: string;
  token: Token | undefined;
  plannedWithdrawal: PlannedUdcWithdrawal | undefined;
}
