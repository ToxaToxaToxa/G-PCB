import { Button } from 'app/components/Button';
import { useTypedSelector } from 'app/hooks/useTypedSelector';

import { Card } from '../../PcbMilling/components/controls';
import { isFinished } from '../lib/session';
import { MachineCheck, StoredSession, checkMachine, loadMachineMark } from '../lib/storedSession';

interface Props {
    stored: StoredSession;
    stepTitle: string;
    onContinue: (zeroKept: boolean) => void;
    onDiscard: () => void;
}

const VERDICT: Record<MachineCheck, { text: string; tone: string }> = {
    kept: {
        text: 'The machine has not moved since then: the work zero and Z0 stay.',
        tone: 'text-green-600',
    },
    moved: {
        text: 'The machine position has changed (switched off, reset or moved): the work zero and Z0 will be set again.',
        tone: 'text-orange-500',
    },
    'not-connected': {
        text: 'Connect the machine first to keep the work zero; without it the work zero and Z0 will be set again.',
        tone: 'text-orange-500',
    },
    unknown: {
        text: 'The work zero and Z0 will be set again.',
        tone: 'text-gray-500',
    },
};

/** Offers the project that was open when the app was closed. */
const RestoreCard = ({ stored, stepTitle, onContinue, onDiscard }: Props) => {
    const connected = useTypedSelector((s) => s.connection.isConnected);
    const mpos = useTypedSelector((s) => s.controller.mpos);
    const wpos = useTypedSelector((s) => s.controller.wpos);
    const m = { x: Number(mpos?.x), y: Number(mpos?.y), z: Number(mpos?.z) };
    const w = { x: Number(wpos?.x), y: Number(wpos?.y), z: Number(wpos?.z) };
    const verdict = checkMachine(loadMachineMark(), {
        connected,
        mpos: m,
        wco: { x: m.x - w.x, y: m.y - w.y, z: m.z - w.z },
    });
    const hadZero = stored.xySet || !!stored.zeroBit;

    const ran = Object.values(stored.results);
    const finished = ran.filter(isFinished).length;
    const total = Object.keys(stored.opHashes).length;
    const saved = new Date(stored.savedAt);

    return (
        <Card className="border-blue-300 dark:border-blue-700">
            <p className="text-sm font-semibold">Continue the last project?</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
                <b>{stored.projectName}</b> · step {stored.step + 1}, {stepTitle}
                {total > 0 && ` · ${finished} of ${total} programs finished`} · saved {saved.toLocaleString()}
            </p>
            {hadZero && <p className={`text-xs ${VERDICT[verdict].tone}`}>{VERDICT[verdict].text}</p>}
            <div className="grid grid-cols-2 gap-2">
                <Button variant="primary" onClick={() => onContinue(verdict === 'kept')}>
                    Continue
                </Button>
                <Button onClick={onDiscard}>New project</Button>
            </div>
        </Card>
    );
};

export default RestoreCard;
