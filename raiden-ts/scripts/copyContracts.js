const fs = require('fs');
const path = require('path');

const cwd = path.dirname(fs.realpathSync(__filename));

/**
 * Copy raiden-contracts's deployment_* to src/deployment, split contracts.json into src/abi's
 *
 * This is expected to run before running typechain and build steps, as those steps depend on these
 * files.
 */
function preBuild() {
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
}

/*
 * Copy typechain's generated Contracts.d.ts to dist/outDir folders
 *
 * This is needed because tsc manage .d.ts files as just references, and never copy/move them to
 * the output directories, causing any generated .d.ts refering to them relatively to break.
 * This is expected to be run as a postbuild step, when outDir folders already exist.
 */
function postBuild() {
  ['../dist/contracts', '../dist:cjs/contracts'].forEach(dir => {
    dir = path.join(cwd, dir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    const contractsDir = path.join(cwd, '../src/contracts');
    fs.readdirSync(contractsDir)
      .forEach(fileName =>
        fs.copyFileSync(path.join(contractsDir, fileName), path.join(dir, fileName)),
      );
  });
}

if (process.argv.includes('prebuild')) {
  preBuild();
} else if (process.argv.includes('postbuild')) {
  postBuild();
} else {
  console.error(`Usage: ${process.argv.slice(0, 2).join(' ')} [prebuild|postbuild]`);
  process.exit(1);
}
