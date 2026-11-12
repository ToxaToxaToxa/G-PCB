/**
 * @jest-environment node
 */
// See the note in GrblHalAxsProbe.test.js for why this uses require().
process.env.GSENDER_LOG_LEVEL = process.env.GSENDER_LOG_LEVEL || 'error';

// The flashing module imports .hex firmware images Jest cannot parse.
jest.mock('../../../lib/Firmware/Flashing/firmwareflashing', () => ({}));

const net = require('net');
const CNCEngine = require('../CNCEngine').default;
const SerialConnection = require('../../../lib/SerialConnection').default;

// The app closes the machine port before it quits (Sentry G-PCB-4).
describe('closing the machine port on exit', () => {
    it('resolves at once without a connection', async () => {
        const engine = new CNCEngine();
        await expect(engine.closeConnection()).resolves.toBeUndefined();
    });

    it('closes an open port and waits for it', async () => {
        const peerClosed = [];
        const server = net.createServer((sock) => sock.on('close', () => peerClosed.push(true)));
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const serial = new SerialConnection({
            path: '127.0.0.1', baudRate: 115200, network: true, ethernetPort: server.address().port,
        });
        expect(await new Promise((resolve) => serial.open(resolve))).toBeFalsy();

        const engine = new CNCEngine();
        engine.connection = { connection: serial };
        await engine.closeConnection();
        expect(serial.port).toBeNull();

        for (let i = 0; i < 50 && !peerClosed.length; i++) {
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(peerClosed).toEqual([true]);
        await new Promise((resolve) => server.close(resolve));
    });

    it('gives up after the timeout when the port never reports closed', async () => {
        const engine = new CNCEngine();
        engine.connection = { connection: { port: {}, close() {} } };
        const started = Date.now();
        await engine.closeConnection(50);
        expect(Date.now() - started).toBeGreaterThanOrEqual(40);
    });
});
