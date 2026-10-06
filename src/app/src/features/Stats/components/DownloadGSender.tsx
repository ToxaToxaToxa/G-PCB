import { Button } from 'app/components/Button';
import { FaDownload, FaExternalLinkAlt } from 'react-icons/fa';
import { useState } from 'react';
import isElectron from 'is-electron';

export function DownloadGSender({ version = '1.5.0', downloadPercent = 0 }) {
    const [canClick, setCanClick] = useState(true);
    function updateGSender() {
        setCanClick(false);
        if (isElectron()) {
            window.ipcRenderer.send('restart_app');
        }
    }

    return (
        <div
            className="text-blue-800 border border-blue-500 rounded-lg bg-blue-50 bg-opacity-50 text-center mt-8 dark:text-white dark:border-blue-500 dark:bg-blue-900 dark:bg-opacity-50 h-fit"
            role="alert"
        >
            <div className="flex items-center justify-center p-4">
                <svg
                    className="shrink-0 w-4 h-4 me-2"
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                >
                    <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z" />
                </svg>
                <span className="sr-only">Info</span>
                <h3 className="text-lg font-medium">
                    G-PCB v{version} available to download!
                </h3>
            </div>
            <div className="mt-2 mb-4 text-sm flex flex-col gap-2">
                <p>
                    Clicking the below button will update G-PCB to version{' '}
                    {version}. Your settings stay as they are.
                </p>{' '}
                <p>
                    <a
                        className="text-sm text-blue-500 underline text-center"
                        href="https://github.com/ToxaToxaToxa/G-PCB/releases"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <div className="flex items-center gap-1 text-center justify-center">
                            <span>All G-PCB releases</span>
                            <FaExternalLinkAlt />
                        </div>
                    </a>
                </p>
            </div>
            <div className="flex items-center justify-center border-t border-t-blue-500 py-4">
                <Button
                    type="button"
                    variant="primary"
                    className="gap-2"
                    onClick={updateGSender}
                >
                    <FaDownload />
                    {canClick && <span>Update to v{version} now!</span>}
                    {!canClick && <span>Downloading ({downloadPercent}%)</span>}
                </Button>
            </div>
        </div>
    );
}
