const { v4: uuidv4 } = require('uuid');
const logger = require('../logger');
const { redactLogValue } = require('../utils/logRedaction');

module.exports = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  const details = {
    requestId,
    method: req.method,
    url: req.url,
  };
  if (process.env.LOG_REQUEST_BODY === 'true') details.body = redactLogValue(req.body);
  logger.info('request', details);
  next();
};
