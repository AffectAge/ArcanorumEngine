import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { createApp } from './app.js';
import {
  DEFAULT_SERVER_CONFIGURATION_PATH,
  parseServerConfig,
  readServerConfiguration,
} from './config.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const configurationPath = process.env.SERVER_CONFIGURATION_PATH ?? DEFAULT_SERVER_CONFIGURATION_PATH;
const config = parseServerConfig(process.env, readServerConfiguration(configurationPath));
const app = await createApp({ config });

await app.listen({ host: config.bindHost, port: config.port });
