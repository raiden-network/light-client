import type { Migrations } from './types';

const migrations: Migrations = {
  1: async (doc) => {
    if (doc._id === 'state.address') return [doc, { _id: 'state.services', value: {} }];
    return [doc];
  },
};
export default migrations;
