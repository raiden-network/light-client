const fs = require('fs');
const path = require('path');

const cwd = path.dirname(fs.realpathSync(__filename));

// Create or clear `src/deployment` and `src/abi` directories
['../src/deployment', '../src/abi'].forEach(dir => {
  const absPath = path.join(cwd, dir);
  if (!fs.existsSync(absPath)) {
    fs.mkdirSync(absPath);
  } else {
    fs.readdirSync(absPath).map(file => fs.unlinkSync(path.join(absPath, file)));
  }
});

// Copy deployment files from `raiden-contracts`
const dataDirectoryPath = path.join(cwd, '../raiden-contracts/raiden_contracts/data/');
fs.readdirSync(dataDirectoryPath)
  .filter(fileName => fileName.includes('deployment_'))
  .forEach(fileName =>
    fs.copyFileSync(
      path.join(dataDirectoryPath, fileName),
      path.join(cwd, `../src/deployment/${fileName}`),
    ),
  );

// Split contracts.json from `raiden-contracts`
const { contracts } = require(path.join(
  cwd,
  '../raiden-contracts/raiden_contracts/data/contracts.json',
));

Object.keys(contracts)
  .filter(contractName => !contractName.includes('Test'))
  .forEach(contractName =>
    fs.writeFileSync(
      path.join(cwd, `../src/abi/${contractName}.json`),
      JSON.stringify(contracts[contractName].abi, null, 2),
    ),
  );
