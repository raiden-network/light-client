export interface RaidenState {
  blockNumber: number,
  address: string,
}

export const initialState: RaidenState = {
  blockNumber: 0,
  address: '',
}
