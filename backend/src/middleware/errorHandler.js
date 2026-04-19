function errorHandler(err, req, res, next) {
  if (process.env.NODE_ENV !== 'production') {
    console.error('[Error Details]', err.stack);
  }

  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(status).json({
    error: message,
    details: err.details || []
  });
}

module.exports = errorHandler;
