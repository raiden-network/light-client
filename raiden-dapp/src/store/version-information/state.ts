import type { VersionInformationState } from './types';

export const defaultState = (): VersionInformationState => ({
  activeVersion: process.env.PACKAGE_VERSION ?? '0.0.0',
  availableVersion: undefined,
  updateIsMandatory: false,
});

const state: VersionInformationState = defaultState();

export default state;
