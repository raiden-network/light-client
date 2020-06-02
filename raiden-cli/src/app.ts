import express, { Request, Response, NextFunction } from 'express';
import createError from 'http-errors';
import apiV1 from './routes/api.v1';

const app = express();

app.use(express.json());
app.use('/api/v1', apiV1);
app.use(function (_request: Request, _response: Response, next: NextFunction) {
  next(createError(404));
});

export default app;
