import cx from 'classnames';

import { GRBL_ACTIVE_STATE_IDLE } from 'app/constants';
import { useTypedSelector } from 'app/hooks/useTypedSelector';

export const useMachine = () => {
    const connected = useTypedSelector((s) => s.connection.isConnected);
    const activeState = useTypedSelector((s) => s.controller.state?.status?.activeState) as string | undefined;
    const wpos = useTypedSelector((s) => s.controller.wpos);
    return {
        connected,
        activeState: activeState ?? '',
        idle: connected && activeState === GRBL_ACTIVE_STATE_IDLE,
        wpos: { x: Number(wpos.x), y: Number(wpos.y), z: Number(wpos.z) },
    };
};

const MachineStatus = () => {
    const { connected, activeState, idle, wpos } = useMachine();
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className={cx('font-semibold', connected ? (idle ? 'text-green-600' : 'text-orange-500') : 'text-red-500')}>
                {connected ? activeState || 'Connected' : 'Not connected'}
            </span>
            {connected && (
                <span className="text-gray-500 font-mono">
                    X {wpos.x.toFixed(3)} · Y {wpos.y.toFixed(3)} · Z {wpos.z.toFixed(3)}
                </span>
            )}
            {!connected && <span className="text-gray-500">Connect to the CNC with the button at the top.</span>}
        </div>
    );
};

export default MachineStatus;
