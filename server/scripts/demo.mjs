// `npm run demo`: start the server in demo mode on any OS (Windows PowerShell, macOS, Linux) with no shell syntax.
// Generates a throw-away JWT secret if you have not set one (logins reset when the server restarts, which is fine for a demo).
import crypto from 'node:crypto'; import {loadEnv} from '../env.js';
loadEnv();
process.env.JWT_SECRET||=crypto.randomBytes(48).toString('base64');
process.env.DEMO_MODE||='1'; process.env.MOCK_MARKETPLACE||='1';
await import('../index.js');
