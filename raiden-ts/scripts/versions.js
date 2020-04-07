const fs = require('fs');
const path = require('path');

const cwd = path.dirname(fs.realpathSync(__filename));

// Get the smart contract version from the `raiden-contracts`
// sub module.
const contracts_version = '0.36.2';
// TODO: Enable when https://github.com/raiden-network/raiden-contracts/issues/1287 done
/*
const { contracts_version } = require(path.join(
  cwd,
  '../raiden-contracts/raiden_contracts/data/contracts.json',
));
*/

// Get the current raiden SDK version
const { version } = require(path.join(cwd, '../package.json'));

// Create a version file in `/src`
fs.writeFileSync(
  path.join(cwd, `../src/versions.json`),
  JSON.stringify({ sdk: version, contracts: contracts_version }),
);
