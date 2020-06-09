import { Request, Response, NextFunction } from 'express';
import { Address } from 'raiden-ts';

export function validateAddressParameter(
  this: string,
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const addressParameter = request.params[this];

  if (!Address.is(addressParameter)) {
    response
      .status(404)
      .send(`The given address '${addressParameter}' is not valid eip55-encoded Ethereum address`);
  } else {
    next();
  }
}
