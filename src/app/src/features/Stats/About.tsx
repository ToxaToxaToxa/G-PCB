import Markdown from 'react-markdown';
import { ReactMarkdownProps } from 'react-markdown/lib/ast-to-react';
import { FaExternalLinkAlt } from 'react-icons/fa';

import { version } from 'app-root/package.json';

import useGetReleaseNotes from './utils/useGetReleaseNotes';
import { Button } from 'app/components/Button';
import { cn } from 'app/lib/utils';
import { RootState } from 'app/store/redux';
import { useSelector } from 'react-redux';
import { UpdateGSender } from 'app/features/Stats/components/UpdateGSender.tsx';
import CheckForUpdates from 'app/features/Stats/components/CheckForUpdates';

const About = () => {
    const { releaseNotes, status, fetchReleaseNotes } = useGetReleaseNotes();

    const updateReleaseNotes = useSelector(
        (state: RootState) => state.gSenderInfo.releaseNotes,
    );
    const hasUpdate = useSelector(
        (state: RootState) => state.gSenderInfo.hasUpdate,
    );

    // G-PCB is built on gSender: credit its team
    const gSenderTeam = [
        { name: 'Chris T.', title: 'Project Lead' },
        { name: 'Kevin G.', title: 'Lead Dev' },
        { name: 'Walid K.', title: 'Dev Manager' },
        { name: 'Sophia B.', title: 'Dev' },
        { name: 'Shilpa G', title: 'QA' },
        { name: 'Stephen C.', title: 'Docs' },
        { name: 'Kelly Z.', title: 'Icon Design' },
    ];

    const logo = new URL('../../../images/g-pcb-square.png', import.meta.url);

    const renderReleaseNotes = () => {
        if (status === 'loading') {
            return (
                <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-500" />
                </div>
            );
        }

        if (status === 'error') {
            return (
                <div className="flex flex-col gap-2 items-center justify-center h-full">
                    <p>
                        There was a problem loading the release notes. Please
                        try again.
                    </p>
                    <p>
                        If this issue persists, please checkout the release
                        notes on{' '}
                        <a
                            href="https://github.com/ToxaToxaToxa/G-PCB/releases"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 underline"
                        >
                            GitHub.
                        </a>
                    </p>
                    <Button onClick={fetchReleaseNotes} variant="outline">
                        Retry
                    </Button>
                </div>
            );
        }

        if (releaseNotes.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                    <p>No release notes found</p>

                    <Button onClick={fetchReleaseNotes} variant="outline">
                        Retry
                    </Button>
                </div>
            );
        }

        if (hasUpdate) {
            return <UpdateGSender />;
        }

        return releaseNotes.map((release, index) => {
            return (
                <Markdown
                    key={release.date}
                    components={{
                        h3: (props: ReactMarkdownProps) => (
                            <h3
                                className={cn(
                                    'text-xl font-bold underline dark:text-white',
                                    {
                                        'mt-8': index !== 0,
                                    },
                                )}
                            >
                                {props.children}
                            </h3>
                        ),
                        ul: (props: ReactMarkdownProps) => (
                            <ul className="ml-4 list-disc [&>li]:mt-2 dark:text-white">
                                {props.children}
                            </ul>
                        ),
                        li: (props: ReactMarkdownProps) => (
                            <li className="leading-7 dark:text-white">
                                {props.children}
                            </li>
                        ),
                    }}
                >
                    {`### ${release.version} (${release.date})\n\n${release.notes.map((note) => `- ${note}`).join('\n')}`}
                </Markdown>
            );
        });
    };

    return (
        <div className="w-full flex flex-col gap-6 h-full">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <img src={logo.href} alt="G-PCB logo" width={125} height={125} />
                    <div className="dark:text-white">
                        <h1 className="text-3xl font-bold">G-PCB</h1>
                        <p className="text-sm text-gray-500 dark:text-white">
                            By ToxaToxaToxa
                        </p>
                        <p className="text-sm text-gray-500 dark:text-white">
                            Version {version}
                        </p>
                        <div className="mt-2">
                            <CheckForUpdates />
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2 text-sm text-gray-500 dark:text-white">
                    <p>Copyright © {new Date().getFullYear()} ToxaToxaToxa</p>
                    <p>Based on gSender, © Sienci Labs Inc.</p>
                    <p className="flex gap-3">
                        <a
                            href="https://github.com/ToxaToxaToxa/G-PCB"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 underline"
                        >
                            GitHub
                        </a>
                        <a
                            href="https://github.com/ToxaToxaToxa/G-PCB/blob/master/LICENSE"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 underline"
                        >
                            GNU GPLv3 License
                        </a>
                    </p>
                </div>
            </div>

            <p className="text-md md:text-lg dark:text-white">
                G-PCB mills printed circuit boards on a GRBL CNC, step by step:
                Gerber files in, finished boards out. Board arrays, isolation,
                drilling, the outline with tabs, a probed height map and guided
                bit changes, all in one place.
            </p>

            <div>
                <h2 className="text-2xl text-blue-500 mb-2">Built on gSender</h2>
                <p className="text-md md:text-lg dark:text-white">
                    G-PCB is a fork of{' '}
                    <a
                        href="https://github.com/Sienci-Labs/gsender"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 underline"
                    >
                        gSender
                    </a>
                    , the free CNC sender by Sienci Labs. Connecting, jogging,
                    probing and running jobs work as in gSender; G-PCB adds the
                    PCB section. Thanks to the gSender team:{' '}
                    {gSenderTeam.map((member, index) => (
                        <span key={member.name}>
                            <strong>{member.name}</strong> ({member.title})
                            {index < gSenderTeam.length - 1 ? ', ' : '.'}
                        </span>
                    ))}
                </p>
            </div>
            {hasUpdate && <UpdateGSender notes={updateReleaseNotes} />}
            {!hasUpdate && (
                <div className="h-full flex flex-col gap-2">
                    <div className="flex gap-2 items-center justify-between">
                        <h2 className="text-2xl text-blue-500">Release Notes</h2>

                        <a
                            className="text-sm text-blue-500 underline"
                            href="https://github.com/ToxaToxaToxa/G-PCB/releases"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <div className="flex items-center gap-1">
                                <span>See all latest updates made</span>
                                <FaExternalLinkAlt />
                            </div>
                        </a>
                    </div>

                    <div className="relative h-full">
                        <div className="absolute top-0 left-0 w-full h-full overflow-y-auto border border-gray-300 rounded-md p-4">
                            {renderReleaseNotes()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default About;
