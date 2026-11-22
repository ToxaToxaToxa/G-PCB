jest.mock('app/lib/controller', () => ({ __esModule: true, default: { command: jest.fn() } }));
jest.mock('app/lib/toaster', () => ({ toast: { success: jest.fn() } }));

import { describeFailure } from '../steps/HeightMapStep';

describe('describeFailure', () => {
    it('says what to check for the usual probing alarms', () => {
        expect(describeFailure({ kind: 'alarm', code: '5' })).toMatch(/did not touch the copper/);
        expect(describeFailure({ kind: 'no-contact' })).toMatch(/did not touch the copper/);
        expect(describeFailure({ kind: 'alarm', code: '4' })).toMatch(/closed before probing/);
        expect(describeFailure({ kind: 'alarm', code: '3' })).toMatch(/position may be lost/);
        expect(describeFailure({ kind: 'alarm', code: '2' })).toMatch(/outside the machine travel/);
        expect(describeFailure({ kind: 'alarm', code: '1' })).toMatch(/limit switch/);
        expect(describeFailure({ kind: 'alarm', code: '9' })).toMatch(/ALARM:9/);
    });

    it('points to the USB link when the controller stops answering', () => {
        expect(describeFailure({ kind: 'timeout', seconds: 46 })).toMatch(/46 s.*USB cable/);
    });
});
