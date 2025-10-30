export const failure = (res, message = "failed", data = null, status = 400) => {
  return res.status(status).json({
    error: true,
    message,
    data,
  });
};

export const success = (
  res,
  message = "successful",
  data = null,
  status = 200
) => {
  return res.status(status).json({
    error: false,
    message,
    data,
  });
};

export const unauthorized = (res) => {
  return res.status(401).json({
    error: true,
    message: "unauthorized",
    data: null,
  });
};

export const multilogin = (res) => {
  return res.status(400).json({
    success: false,
    message: "close_other_running_session",
    data: null,
  });
};
