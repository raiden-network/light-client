import { RaidenTransfer } from 'raiden-ts';
import { ApiPayment, ApiPaymentEvents } from '../types';

export function transformSdkTransferToApiPayment(transfer: RaidenTransfer): ApiPayment {
  // TODO: The payment object representation of the API spec is not clear
  // enough. We need to clarify this and agree on a single representation.
  return {
    event: ApiPaymentEvents[transfer.direction],
    initiator_address: transfer.initiator,
    target_address: transfer.target,
    token_address: transfer.token,
    amount: transfer.value.toString(),
    identifier: transfer.paymentId.toString(),
    secret: transfer.secret ?? '',
    secret_hash: transfer.secrethash,
    log_time: transfer.changedAt.toISOString(),
  };
}
