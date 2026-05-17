const ts = () => new Date().toISOString();

const fmt = (level: string, msg: string, data?: object) => {
  const extra = data && Object.keys(data).length ? " " + JSON.stringify(data) : "";
  return `${ts()} ${level} ${msg}${extra}`;
};

const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const threshold = LEVELS[(process.env.LOG_LEVEL ?? "info").toLowerCase()] ?? 1;

export const log = {
  debug: (msg: string, data?: object) => { if (threshold <= 0) console.debug(fmt("DEBUG", msg, data)); },
  info:  (msg: string, data?: object) => { if (threshold <= 1) console.log(fmt("INFO ", msg, data)); },
  warn:  (msg: string, data?: object) => { if (threshold <= 2) console.warn(fmt("WARN ", msg, data)); },
  error: (msg: string, data?: object) => { if (threshold <= 3) console.error(fmt("ERROR", msg, data)); },
};
