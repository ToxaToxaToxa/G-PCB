/**
 * @jest-environment node
 */
// See the note in GrblHalAxsProbe.test.js for why this uses require().
process.env.GSENDER_LOG_LEVEL = process.env.GSENDER_LOG_LEVEL || 'error';

const net = require('net');
const Connection = require('../Connection').default;
const SerialConnection = require('../SerialConnection').default;
const { GRBL } = require('../../controllers/Grbl/constants');

// A port nothing listens on: the connect fails right away with ECONNREFUSED,
// the same path as ENETUNREACH / EHOSTUNREACH on an unreachable machine.
const closedPort = () =>
    new Promise((resolve) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });

describe('network connection errors', () => {
    it('report a failed connect through the callback without throwing', async () => {
        const ethernetPort = await closedPort();
        const serial = new SerialConnection({ path: '127.0.0.1', baudRate: 115200, network: true, ethernetPort });
        const err = await new Promise((resolve) => serial.open(resolve));
        expect(err && err.code).toBe('ECONNREFUSED');
    });

    it('do not crash the server before a controller listens', async () => {
        const ethernetPort = await closedPort();
        const connection = new Connection(
            { io: null },
            '127.0.0.1',
            { baudrate: 115200, network: true, ethernetPort, defaultFirmware: GRBL },
            () => {},
        );
        const events = [];
        connection.on('serialport:error', ({ err }) => events.push(err.code));
        // no 'error' listener on purpose: that is the state before firmware detection
        const err = await new Promise((resolve) => connection.open(resolve));
        expect(err.code).toBe('ECONNREFUSED');
        expect(events).toEqual(['ECONNREFUSED']);
    });
});
