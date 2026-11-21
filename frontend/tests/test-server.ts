/** Separate local profiles may use their own loopback ports; CI jobs keep defaults. */
function port(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`${name} must be an unprivileged TCP port.`);
  }
  return value;
}

export const frontendPort = port('E2E_FRONTEND_PORT', 5174);
export const backendPort = port('E2E_BACKEND_PORT', 8001);
export const browserOrigin = `http://127.0.0.1:${frontendPort}`;
export const backendOrigin = `http://127.0.0.1:${backendPort}`;
