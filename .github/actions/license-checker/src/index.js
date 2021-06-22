const { readFileSync } = require('fs');

const { getInput, setFailed } = require('@actions/core');
const { getPackageManifest } = require('query-registry');

function getYarnWorkspaceToCheck() {
  return getInput('YARN_WORKSPACE', { required: true });
}

function stripVersionString(raw_version) {
  return raw_version.replace(/\^|\*/g, '');
}

function getProductionDepedenciesOfWorkspace(workspace) {
  try {
    // Read the file directly instead of requiring it. The `require` function is
    // quite restricted and will fail on string composition.
    const packageFile = readFileSync(`./${workspace}/package.json`);
    const packageInfo = JSON.parse(packageFile);
    return packageInfo.dependencies;
  } catch (error) {
    throw new Error(`Could not read './${workspace}/package.json'.`);
  }
}

function getAllowedLicenseNames() {
  const rawAllowedLicenseNames = getInput('ALLOWED_LICENSE_NAMES', { required: true });
  const allowedLicenseNames = JSON.parse(rawAllowedLicenseNames);

  if (Array.isArray(allowedLicenseNames)) {
    return allowedLicenseNames;
  } else {
    throw new Error('The input for the allowed license names is not a JSON encoded array.');
  }
}

async function getLicenseOfPackage(name, rawVersion) {
  const version = stripVersionString(rawVersion) || undefined;
  const manifest = await getPackageManifest({ name, version });
  return manifest.license;
}

function checkIfLicenseIsAllowed(license, allowedLicenseNames) {
  return allowedLicenseNames.includes(license);
}

function logValidatingPackage(name, license) {
  const message = `The package '${name}' uses the not allowed license '${license}'.`;
  setFailed(message);
}

async function main() {
  const workspace = getYarnWorkspaceToCheck();
  const allowedLicenseNames = getAllowedLicenseNames();
  const dependencies = getProductionDepedenciesOfWorkspace(workspace);

  for (const [packageName, packageRawVersion] of Object.entries(dependencies)) {
    const license = await getLicenseOfPackage(packageName, packageRawVersion);

    if (!checkIfLicenseIsAllowed(license, allowedLicenseNames)) {
      logValidatingPackage(packageName, license);
    }
  }
}

main().catch((error) => {
  setFailed(error);
});
