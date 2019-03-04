import { AnyAction } from 'redux';

export const NEW_BLOCK = 'newBlock';

interface NewBlockAction extends AnyAction {
  type: typeof NEW_BLOCK,
  payload: number,
}

export function newBlock(blockNumber: number): NewBlockAction {
  return {
    type: NEW_BLOCK,
    payload: blockNumber,
  };
}

export type RaidenActionTypes = NewBlockAction;
