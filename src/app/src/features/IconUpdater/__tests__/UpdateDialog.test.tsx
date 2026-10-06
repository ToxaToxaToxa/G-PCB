import { act, fireEvent, render, screen } from '@testing-library/react';

let mockWorkflow = 'idle';
jest.mock('app/hooks/useTypedSelector', () => ({
    useTypedSelector: (select: (s: unknown) => unknown) =>
        select({ controller: { workflow: { state: mockWorkflow } }, preferences: { accessibility: { focusTrapping: true } } }),
}));
jest.mock('is-electron', () => ({ __esModule: true, default: () => true }));

import UpdateDialog, { notesHtml } from '../UpdateDialog';

const send = jest.fn();
beforeEach(() => {
    mockWorkflow = 'idle';
    send.mockClear();
    (window as unknown as { ipcRenderer: unknown }).ipcRenderer = { send, on: jest.fn(), removeListener: jest.fn() };
});

const info = { version: '1.0.4', releaseNotes: '<p>Fixes a crash on Ethernet.</p>' };

it('offers the update with its notes and installs on request', () => {
    render(<UpdateDialog info={info} />);
    expect(screen.getByText('G-PCB 1.0.4 is available')).toBeTruthy();
    expect(screen.getByText('Fixes a crash on Ethernet.')).toBeTruthy();
    fireEvent.click(screen.getByText('Update to 1.0.4'));
    expect(send).toHaveBeenCalledWith('restart_app');
});

it('waits for the running job to end before asking', () => {
    mockWorkflow = 'running';
    const { rerender } = render(<UpdateDialog info={info} />);
    expect(screen.queryByText('G-PCB 1.0.4 is available')).toBeNull();
    mockWorkflow = 'idle';
    act(() => rerender(<UpdateDialog info={{ ...info }} />));
    expect(screen.getByText('G-PCB 1.0.4 is available')).toBeTruthy();
});

it('reads release notes as HTML or a list per version', () => {
    expect(notesHtml('<p>a</p>')).toBe('<p>a</p>');
    expect(notesHtml([{ note: '<p>a</p>' }, { note: '<p>b</p>' }])).toBe('<p>a</p><p>b</p>');
    expect(notesHtml(null)).toBe('');
});
