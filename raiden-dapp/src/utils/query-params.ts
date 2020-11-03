import { BigNumber } from 'ethers';
import AddressUtils from '@/utils/address-utils';

type RouteQueryParameter = string | (string | null)[];

/**
 * @param queryParam - pure paremter of the query
 * @returns parsed payment identifier if parameter is (correctly) defined
 */
export function getPaymentId(queryParam: RouteQueryParameter): BigNumber | undefined {
  try {
    return BigNumber.from(queryParam);
  } catch (_error) {
    return undefined;
  }
}

/**
 * @param queryParam - pure paremter of the query
 * @returns parsed amount value if parameter is (correctly) defined
 */
export function getAmount(queryParam: RouteQueryParameter): string {
  let amount = '';

  if (queryParam && typeof queryParam === 'string') {
    if (/^\d*[.]?\d*$/.test(queryParam)) {
      amount = queryParam;
    }
  }

  return amount;
}

/**
 * @param queryParam - pure paremter of the query
 * @returns parsed address if parameter is (correctly) defined
 */
export function getAddress(queryParam: RouteQueryParameter): string {
  let address = '';

  if (queryParam && typeof queryParam === 'string') {
    if (AddressUtils.isAddress(queryParam) && AddressUtils.checkAddressChecksum(queryParam)) {
      address = queryParam;
    }
  }

  return address;
}
