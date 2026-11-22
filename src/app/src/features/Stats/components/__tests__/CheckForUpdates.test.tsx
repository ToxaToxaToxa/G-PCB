import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('is-electron', () => () => true);

import CheckForUpdates, { describeCheck } from '../CheckForUpdates';

const at = new Date(2026, 10, 22, 10, 42);

describe('describeCheck', () => {
    it('answers for every outcome of the check', () => {
        expect(describeCheck({ status: 'available', version: '1.0.8' }, at)).toBe('Version 1.0.8 is available');
        expect(describeCheck({ status: 'latest', version: '1.0.7' }, at)).toMatch(/^Up to date · checked at 10:42/);
        expect(describeCheck({ status: 'error', message: 'offline' }, at)).toBe('Could not check: offline');
        expect(describeCheck({ status: 'unsupported' }, at)).toMatch(/GitHub releases/);
    });
});

describe('CheckForUpdates', () => {
    it('asks the main process and shows the answer', async () => {
        const invoke = jest.fn().mockResolvedValue({ status: 'latest', version: '1.0.7' });
        (window as unknown as { ipcRenderer: unknown }).ipcRenderer = { invoke };
        render(<CheckForUpdates />);
        fireEvent.click(screen.getByText('Check for updates'));
        expect(invoke).toHaveBeenCalledWith('check-for-updates');
        await waitFor(() => expect(screen.getByText(/Up to date · checked at/)).toBeTruthy());
        expect(screen.getByText('Check for updates')).toBeTruthy();
    });
});
