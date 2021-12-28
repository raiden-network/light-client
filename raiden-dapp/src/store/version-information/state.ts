import type { VersionInformationState } from './types';

export const defaultState = (): VersionInformationState => ({
  activeVersion: process.env.PACKAGE_VERSION ?? '0.0.0',
  installedVersion: undefined,
  availableVersion: undefined,
  updateIsMandatory: false,
});

const state: VersionInformationState = defaultState();

export default state;
