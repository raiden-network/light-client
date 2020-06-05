/* eslint-disable @typescript-eslint/camelcase */
import { Request, Response, NextFunction } from 'express';
import {
  ValidationChain,
  ValidationError,
  validationResult,
  Location,
  buildCheckFunction,
} from 'express-validator';
import { getAddress } from 'ethers/utils';

function formatValdiationErrors(error: ValidationError): string {
  return `${error.param} - ${error.msg}.`;
}

export function validate(validations: ValidationChain[]) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    await Promise.all(validations.map((validation) => validation.run(request)));
    const errors = validationResult(request).formatWith(formatValdiationErrors);

    if (errors.isEmpty()) {
      next();
    } else {
      response.status(404).json({ errors: errors.array() });
    }
  };
}

// TODO: Ethers v5 provides this natively. Consider to update.
export function checkEtherumAddress(rawAddress: string): boolean {
  try {
    getAddress(rawAddress);
    return true;
  } catch {
    return false;
  }
}

function basicExistenceValidation(name: string, location: Location, optional: boolean) {
  const checkFunction = buildCheckFunction([location]);
  const existanceCheck = checkFunction(name).exists().withMessage('is missing').bail();

  if (optional) {
    return existanceCheck.optional();
  } else {
    return existanceCheck;
  }
}

export function isAddress(name: string, location: Location, optional = false): ValidationChain {
  return basicExistenceValidation(name, location, optional)
    .custom(checkEtherumAddress)
    .withMessage('is not a valid eip55-encoded Ethereum address');
}

export function isAmount(name: string, location: Location, optional = false): ValidationChain {
  return basicExistenceValidation(name, location, optional)
    .isInt({ min: 0 })
    .withMessage('is not a number greater or equal zero');
}

export function isTimeout(name: string, location: Location, optional = false): ValidationChain {
  return basicExistenceValidation(name, location, optional)
    .isInt({ min: 1 })
    .withMessage('is not a positive number');
}

export function isState(name: string, location: Location, optional = false): ValidationChain {
  return basicExistenceValidation(name, location, optional)
    .isIn(['closed'])
    .withMessage("only allowed to be 'closed'");
}

export function isFraction(name: string, location: Location, optional = false): ValidationChain {
  return basicExistenceValidation(name, location, optional)
    .isFloat({ gt: 0 })
    .withMessage('is not a floating number greater zero');
}

export function isIdentifier(name: string, location: Location, optional = false): ValidationChain {
  return basicExistenceValidation(name, location, optional)
    .isInt({ min: 1 })
    .withMessage('is not a positive number');
  // TODO: any further checks?
}
