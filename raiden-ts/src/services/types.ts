import { isLeft } from 'fp-ts/lib/Either';
import * as t from 'io-ts';
import invert from 'lodash/invert';

import type { Decodable } from '../utils/types';
import { Address, Int, Signed, UInt } from '../utils/types';

// it's like an enum, but with literals
export const Service = {
  PFS: 'path_finding',
  MS: 'monitoring',
} as const;
export type Service = typeof Service[keyof typeof Service];
export const ServiceC = t.keyof(invert(Service) as { [D in Service]: string });

export const ServiceDeviceId: { readonly [K in Service]: string } = {
  [Service.PFS]: 'PATH_FINDING',
  [Service.MS]: 'MONITORING',
};

export const PfsMode = {
  disabled: 'disabled',
  auto: 'auto',
  onlyAdditional: 'onlyAdditional',
} as const;
export type PfsMode = typeof PfsMode[keyof typeof PfsMode];
export const PfsModeC = t.keyof(invert(PfsMode) as { [D in PfsMode]: string });

export const Path = t.readonlyArray(Address);
export type Path = t.TypeOf<typeof Path>;

const _AddressMetadata = t.readonly(
  t.type({
    user_id: t.string,
    displayname: t.string,
    capabilities: t.string,
  }),
);
export interface AddressMetadata extends t.TypeOf<typeof _AddressMetadata> {}
export interface AddressMetadataC
  extends t.Type<AddressMetadata, t.OutputOf<typeof _AddressMetadata>> {}
/** metadata/presence information of an address */
export const AddressMetadata: AddressMetadataC = _AddressMetadata;

const _AddressMetadataMap = t.readonly(t.record(t.string, AddressMetadata));
export type AddressMetadataMap = t.TypeOf<typeof _AddressMetadataMap>;
const addressMetadataMapPredicate = (u: AddressMetadataMap) => t.array(Address).is(Object.keys(u));
/** an address_metadata map which decodes to checksummed addresses as keys */
export const AddressMetadataMap = new t.RefinementType(
  'AddressMetadataMap',
  (u): u is AddressMetadataMap => _AddressMetadataMap.is(u) && addressMetadataMapPredicate(u),
  (i, c) => {
    const e = _AddressMetadataMap.validate(i, c);
    if (isLeft(e)) return e;
    const a = e.right;
    const res: Mutable<AddressMetadataMap> = {};
    // for each key of address_metadata's record, validate/decode it as Address
    for (const [addr, meta] of Object.entries(a)) {
      const ev = Address.validate(addr, c);
      if (isLeft(ev)) return ev;
      res[ev.right] = meta;
    }
    return t.success<AddressMetadataMap>(res);
  },
  _AddressMetadataMap.encode,
  _AddressMetadataMap,
  addressMetadataMapPredicate,
);

export const RoutesExtra = t.partial({ address_metadata: AddressMetadataMap });

export const Fee = Int(32);
export type Fee = t.TypeOf<typeof Fee>;

/** Codec for raiden-ts internal representation of a PFS result/routes */
export const Paths = t.readonlyArray(
  t.readonly(t.intersection([t.type({ path: Path, fee: Fee }), RoutesExtra])),
);
export type Paths = t.TypeOf<typeof Paths>;

/**
 * A broader codec representing paths received as input:
 * - paths array can come on a `route` or `path` member
 * - `fee` represents the final fee to be used, `estimated_fee` is what comes from PFS and can be
 *   increased of fee margins
 * - rest is kept (currently, `address_metadata` map)
 * Paths is a specific subset of InputPaths
 */
export const InputPaths = t.readonlyArray(
  t.readonly(
    t.intersection([
      t.union([t.type({ route: Path }), t.type({ path: Path })]),
      t.union([t.type({ fee: Fee }), t.type({ estimated_fee: Fee })]),
      RoutesExtra,
    ]),
  ),
);
export type InputPaths = t.TypeOf<typeof InputPaths>;

/** Codec for result from PFS path request */
export const PfsResult = t.readonly(t.type({ result: InputPaths }));

/** Codec for PFS API returned error */
export const PfsError = t.readonly(
  t.intersection([
    t.type({
      error_code: t.number,
      errors: t.string,
    }),
    t.partial({ error_details: t.record(t.string, t.unknown) }),
  ]),
);
export type PfsError = t.TypeOf<typeof PfsError>;

/** Public Raiden interface for routes data */
export type RaidenPaths = Decodable<Paths>;

/**
 * A PFS server/service instance info
 */
export const PFS = t.readonly(
  t.type({
    address: Address,
    url: t.string,
    rtt: t.number,
    price: UInt(32),
    token: Address,
    validTill: t.number,
  }),
);
export interface PFS extends t.TypeOf<typeof PFS> {}

/**
 * Public Raiden interface for PFS info
 */
export type RaidenPFS = Decodable<PFS>;

/**
 * An IOU used to pay the services
 */
export const IOU = t.readonly(
  t.type({
    sender: Address,
    receiver: Address,
    amount: UInt(32),
    expiration_block: UInt(32),
    one_to_n_address: Address,
    chain_id: UInt(32),
  }),
);

export interface IOU extends t.TypeOf<typeof IOU> {}

export const LastIOUResults = t.readonly(t.type({ last_iou: Signed(IOU) }));

export interface LastIOUResults extends t.TypeOf<typeof LastIOUResults> {}

export const SuggestedPartner = t.readonly(
  t.type({
    address: Address,
    capacity: UInt(32),
    centrality: t.union([t.number, t.string]),
    score: t.union([t.number, t.string]),
    uptime: t.union([t.number, t.string]),
  }),
  'SuggestedPartner',
);
export interface SuggestedPartner extends t.TypeOf<typeof SuggestedPartner> {}
export const SuggestedPartners = t.array(SuggestedPartner, 'SuggestedPartners');

export const ServicesValidityMap = t.readonly(t.record(t.string, t.number), 'ServicesValidityMap');
export type ServicesValidityMap = t.TypeOf<typeof ServicesValidityMap>;
