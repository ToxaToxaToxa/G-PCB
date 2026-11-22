/*
 * Checks for a new G-PCB release on demand. G-PCB also checks once at start,
 * but says nothing when there is no update; this button always answers.
 * A new version opens the update window (IconUpdater) as at start.
 */
import { useState } from 'react';
import isElectron from 'is-electron';

import { Button } from 'app/components/Button';

type CheckResult =
    | { status: 'available'; version: string }
    | { status: 'latest'; version: string }
    | { status: 'error'; message: string }
    | { status: 'unsupported' };

export const describeCheck = (result: CheckResult, at: Date) => {
    const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    switch (result.status) {
        case 'available':
            return `Version ${result.version} is available`;
        case 'latest':
            return `Up to date · checked at ${time}`;
        case 'error':
            return `Could not check: ${result.message}`;
        default:
            return 'Updates are installed from the GitHub releases page';
    }
};

const CheckForUpdates = () => {
    const [checking, setChecking] = useState(false);
    const [text, setText] = useState('');

    if (!isElectron()) {
        return null;
    }

    const check = async () => {
        setChecking(true);
        try {
            const result: CheckResult = await window.ipcRenderer.invoke('check-for-updates');
            setText(describeCheck(result, new Date()));
        } catch (err) {
            setText(describeCheck({ status: 'error', message: String(err) }, new Date()));
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={check} disabled={checking}>
                {checking ? 'Checking…' : 'Check for updates'}
            </Button>
            {text && <span className="text-sm text-gray-500 dark:text-gray-300">{text}</span>}
        </div>
    );
};

export default CheckForUpdates;
