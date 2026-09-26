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

import PcbMilling from '../index';

const dir = path.join(__dirname, 'fixtures/power-replay-usbc');

const makeFile = (name: string) => {
    const content = fs.readFileSync(path.join(dir, name), 'utf8');
    const file = new File([content], name);
    // jsdom File has no text() in some versions
    (file as File & { text: () => Promise<string> }).text = async () => content;
    return file;
};

it('loads Fusion 360 CAM outputs and produces loadable operations', async () => {
    const { container } = render(<PcbMilling />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const files = ['copper_top.gbr', 'copper_bottom.gbr', 'profile.gbr', 'drill_1_16.xln'].map(makeFile);
    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(screen.getByText('Isolation (top)')).toBeTruthy(), { timeout: 20000 });
    expect(screen.getByText('Drill 0.2 mm')).toBeTruthy();
    expect(screen.getAllByText('Board outline', { selector: 'span.font-medium' })).toHaveLength(1);
    expect(screen.getByText(/Board 28\.88 × 45\.49 mm/)).toBeTruthy();
    expect(container.querySelector('svg[aria-label="PCB toolpath preview"]')).toBeTruthy();

    fireEvent.click(screen.getAllByText('Load')[0]);
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0].name).toBe('pcb_top_isolation-top.nc');
    expect(storeData.pcbMilling).toBeTruthy();
}, 30000);
