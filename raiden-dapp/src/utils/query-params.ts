import AddressUtils from '@/utils/address-utils';

export function getAmount(queryParam: any): string {
  let amount = '';

  if (queryParam && typeof queryParam === 'string') {
    if (/^\d*[.]?\d*$/.test(queryParam)) {
      amount = queryParam;
    }
  }

  return amount;
}

export function getAddress(queryParam: any) {
  let address = '';

  if (queryParam && typeof queryParam === 'string') {
    if (
      AddressUtils.isAddress(queryParam) &&
      AddressUtils.checkAddressChecksum(queryParam)
    ) {
      address = queryParam;
    }
  }

  return address;
}
