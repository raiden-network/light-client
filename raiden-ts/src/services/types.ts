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

/**
 * Codec for PFS API returned data
 */
export const PathResults = t.readonly(
  t.intersection([
    t.type({
      result: t.array(
        t.readonly(
          t.type({
            path: t.readonlyArray(Address),
            estimated_fee: Int(32),
          }),
        ),
      ),
    }),
    t.partial({ feedback_token: t.string }),
  ]),
);
export interface PathResults extends t.TypeOf<typeof PathResults> {}

/**
 * Codec for raiden-ts internal representation of a PFS result/routes
 */
export const Paths = t.array(
  t.readonly(
    t.type({
      path: t.readonlyArray(Address),
      fee: Int(32),
    }),
  ),
);
export type Paths = t.TypeOf<typeof Paths>;

/**
 * Public Raiden interface for routes data
 */
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
