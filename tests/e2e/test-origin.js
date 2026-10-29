const rawPort = process.env.FORX_E2E_PORT ?? '4184';
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('FORX_E2E_PORT debe ser un puerto local entre 1024 y 65535.');
}

export const e2ePort = port;
export const e2eOrigin = `http://127.0.0.1:${port}`;
