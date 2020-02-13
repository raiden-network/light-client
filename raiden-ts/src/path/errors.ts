export enum PfsErrorCodes {
  PFS_EMPTY_URL = 'A registered Pathfinding Service returned an empty service URL.',
  PFS_INVALID_URL = 'A registered Pathfinding Service returned an invalid service URL.',
  PFS_INVALID_INFO = 'Could not any valid Pathfinding services. Client and PFS versions are possibly out-of-sync.',
  PFS_NO_ROUTES_FOUND = 'No valid routes found.',
  PFS_ERROR_RESPONSE = 'Pathfinding Service request returned an error',
  PFS_DISABLED = 'Pathfinding Service is disabled and no direct route is available.',
  PFS_UNKNOWN_TOKEN_NETWORK = 'Unknown token network.',
  PFS_TARGET_OFFLINE = 'The requested target is offline.',
  PFS_LAST_IOU_REQUEST_FAILED = 'The request for the last IOU has failed.',
  PFS_IOU_SIGNATURE_MISMATCH = 'The signature of the last IOU did not match.',
}
