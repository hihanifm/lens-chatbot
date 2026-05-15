const ts = () => new Date().toISOString();

const fmt = (level: string, msg: string, data?: object) => {
  const extra = data && Object.keys(data).length ? " " + JSON.stringify(data) : "";
  return `${ts()} ${level} ${msg}${extra}`;
};

export const log = {
  info:  (msg: string, data?: object) => console.log(fmt("INFO ", msg, data)),
  debug: (msg: string, data?: object) => console.debug(fmt("DEBUG", msg, data)),
  warn:  (msg: string, data?: object) => console.warn(fmt("WARN ", msg, data)),
  error: (msg: string, data?: object) => console.error(fmt("ERROR", msg, data)),
};
