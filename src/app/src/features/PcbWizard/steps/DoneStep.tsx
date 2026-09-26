import { Button } from 'app/components/Button';

import { Card } from '../../PcbMilling/components/controls';
import { PlannedOperation } from '../lib/plan';
import { useSession } from '../lib/session';

interface Props {
    ops: PlannedOperation[];
    boards: number;
    onNewBlank: () => void;
    onNewProject: () => void;
}

const DoneStep = ({ ops, boards, onNewBlank, onNewProject }: Props) => {
    const session = useSession();
    const done = ops.filter((op) => session.results[op.id] === 'done');
    const stopped = ops.filter((op) => session.results[op.id] === 'stopped');
    const minutes = done.reduce((s, op) => s + op.stats.estimatedMinutes, 0);

    return (
        <div className="flex flex-col gap-3 max-w-2xl">
            <Card>
                <p className="text-lg font-semibold">
                    {done.length === ops.length ? `${boards} board${boards === 1 ? '' : 's'} milled` : 'Not finished yet'}
                </p>
                <p className="text-sm text-gray-500">
                    {done.length} of {ops.length} programs done
                    {done.length > 0 && ` · about ${Math.max(1, Math.round(minutes))} min of cutting`}
                </p>
                {stopped.map((op) => (
                    <p key={op.id} className="text-sm text-orange-500">{op.name} was stopped before the end.</p>
                ))}
                {ops
                    .filter((op) => !session.results[op.id])
                    .map((op) => (
                        <p key={op.id} className="text-sm text-gray-500">{op.name} has not run.</p>
                    ))}
            </Card>
            <Card>
                <p className="text-sm text-gray-500">
                    Break the boards out of the blank at the tabs and clean the edges.
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button variant="primary" onClick={onNewBlank}>
                        Same boards on a new blank
                    </Button>
                    <Button onClick={onNewProject}>New project</Button>
                </div>
            </Card>
        </div>
    );
};

export default DoneStep;
