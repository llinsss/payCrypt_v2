export const versionDetection = (req, res, next) => {
  const version = req.path.split('/')[1];
  req.apiVersion = version?.match(/^v\d+$/) ? version : 'v1';
  next();
};

export const deprecationWarning = (version, sunsetDate) => (req, res, next) => {
  res.setHeader('X-API-Version', version);
  res.setHeader('X-API-Deprecated', 'true');
  res.setHeader('X-API-Sunset-Date', sunsetDate);
  res.setHeader('Warning', `299 - "API ${version} is deprecated. Please migrate to v2. Sunset date: ${sunsetDate}"`);
  next();
};
