import { randomBytes } from 'crypto';

export const generateRequestId = () => {
  return `req_${Date.now()}_${randomBytes(8).toString('hex')}`;
};

export const requestIdMiddleware = (req, res, next) => {
  req.id = req.headers['x-request-id'] || generateRequestId();
  res.setHeader('X-Request-ID', req.id);
  next();
};
