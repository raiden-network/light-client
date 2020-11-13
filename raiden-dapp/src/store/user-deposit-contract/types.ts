import { Token } from '@/model/types';

export interface UserDepositContractState {
  tokenAddress: string;
  token: Token | undefined;
}
