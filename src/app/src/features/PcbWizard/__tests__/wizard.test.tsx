import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const uploads: File[] = [];
const storeData: Record<string, unknown> = {};

jest.mock('app/lib/controller', () => ({ __esModule: true, default: { port: '/dev/test' } }));
jest.mock('app/lib/fileupload', () => ({
    uploadGcodeFileToServer: jest.fn(async (file: File) => {
        uploads.push(file);
    }),
}));
jest.mock('app/lib/toaster', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('app/features/WidgetConfig/WidgetConfig', () => ({
    __esModule: true,
    default: class {
        id: string;
        constructor(id: string) {
            this.id = id;
        }
        get(_key: string, def: unknown) {
            return storeData[this.id] ?? def;
        }
        set(_key: string, value: unknown) {
            storeData[this.id] = value;
        }
    },
}));

import PcbWizard from '../index';

const dir = path.join(__dirname, '../../PcbMilling/__tests__/fixtures/power-replay-usbc');

const makeFile = (name: string) => {
    const content = fs.readFileSync(path.join(dir, name), 'utf8');
    const file = new File([content], name);
    (file as File & { text: () => Promise<string> }).text = async () => content;
    return file;
};

it('walks from Gerber files to a 2 x 2 array of loadable programs', async () => {
    const { container } = render(<PcbWizard />);
    // steps after the project stay locked until a board is loaded
    expect((screen.getByText('Next') as HTMLButtonElement).closest('button')!.disabled).toBe(true);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const files = ['copper_top.gbr', 'copper_bottom.gbr', 'profile.gbr', 'drill_1_16.xln'].map(makeFile);
    fireEvent.change(input, { target: { files } });
    await waitFor(() => expect(screen.getByText(/Board 28\.88 × 45\.49 mm/)).toBeTruthy(), { timeout: 20000 });
    expect(screen.getByText('profile.gbr')).toBeTruthy();

    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('2. Blank & array')).toBeTruthy();
    expect(screen.getByText(/\(2 × 2\), rotated 90°/)).toBeTruthy();

    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('V-bits (isolation)')).toBeTruthy();

    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText(/Programs · ~\d+ min in total/)).toBeTruthy(), { timeout: 30000 });
    expect(screen.getByText('Isolation (top)')).toBeTruthy();
    expect(screen.getAllByText('Board outline', { selector: 'span.font-medium' })).toHaveLength(1);

    fireEvent.click(screen.getAllByText('Load')[0]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0].name).toBe('pcb_01_isolation-top.nc');

    // any finished step can be reopened from the list
    fireEvent.click(screen.getByText('Blank & array'));
    expect(screen.getByText('2. Blank & array')).toBeTruthy();
    expect(storeData.pcbWizard).toBeTruthy();
}, 60000);
