/*
 * Asks once per start when a new G-PCB release is available, so fixes reach
 * people who would not notice the badge on the logo. Never shows during a
 * job: installing restarts the app.
 */
import { useEffect, useState } from 'react';
import ReactParse from 'html-react-parser';
import isElectron from 'is-electron';

import { Button } from 'app/components/Button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from 'app/components/shadcn/Dialog';
import { WORKFLOW_STATE_IDLE } from 'app/constants';
import { useTypedSelector } from 'app/hooks/useTypedSelector';

export interface UpdateInfo {
    version?: string;
    releaseNotes?: string | { note?: string }[] | null;
}

/** electron-updater gives the release body as HTML, or a list of notes per version. */
export const notesHtml = (notes: UpdateInfo['releaseNotes']) => {
    if (!notes) return '';
    if (typeof notes === 'string') return notes;
    return notes.map((n) => n.note ?? '').join('');
};

const UpdateDialog = ({ info }: { info: UpdateInfo | null }) => {
    const [open, setOpen] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [percent, setPercent] = useState(0);
    const workflow = useTypedSelector((s) => s.controller.workflow.state);
    const idle = workflow === WORKFLOW_STATE_IDLE;

    // the update check answers a few seconds after start; wait for an idle machine
    useEffect(() => {
        if (info?.version && idle && !installing) setOpen(true);
    }, [info?.version, idle]);

    useEffect(() => {
        if (!isElectron()) return undefined;
        const onProgress = (_e: unknown, p: number) => setPercent(Math.round(Number(p) || 0));
        window.ipcRenderer.on('update_download_progress', onProgress);
        return () => window.ipcRenderer.removeListener?.('update_download_progress', onProgress);
    }, []);

    if (!info?.version) return null;

    const install = () => {
        setInstalling(true);
        if (isElectron()) window.ipcRenderer.send('restart_app');
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !installing && setOpen(v)}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle className="text-lg">G-PCB {info.version} is available</DialogTitle>
                    <DialogDescription>
                        Your settings stay as they are. G-PCB restarts to finish the update.
                    </DialogDescription>
                </DialogHeader>
                <div className="max-h-[50vh] overflow-y-auto rounded border border-gray-200 dark:border-gray-700 p-3 text-sm [&_a]:text-blue-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-2">
                    {ReactParse(notesHtml(info.releaseNotes) || '<p>Bug fixes and improvements.</p>')}
                </div>
                {!idle && <p className="text-xs text-orange-600">Finish or stop the running job before updating.</p>}
                <DialogFooter className="gap-2">
                    <Button onClick={() => setOpen(false)} disabled={installing}>
                        Later
                    </Button>
                    <Button variant="primary" onClick={install} disabled={installing || !idle}>
                        {installing ? `Downloading… ${percent}%` : `Update to ${info.version}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default UpdateDialog;
