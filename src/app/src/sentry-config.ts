import * as Sentry from '@sentry/react';
import process from 'process';
import pkg from '../package.json';

const env = process.env;
// G-PCB's own Sentry project, set at build time in .env; without it nothing is sent
const dsn = import.meta.env.VITE_SENTRY_DSN;
if (env.NODE_ENV === 'production' && dsn) {
    Sentry.init({
        dsn,
        // no IP addresses or other personal data in the reports
        sendDefaultPii: false,
        release: pkg.version,
    });
}
