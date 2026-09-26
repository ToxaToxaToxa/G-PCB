import { useRef } from 'react';
import cx from 'classnames';

import { Button } from 'app/components/Button';

import { BoardSide, LayerKind } from '../../PcbMilling/definitions';
import { BoardModel, ParsedProject } from '../../PcbMilling/lib/board';
import PcbPreview from '../../PcbMilling/components/PcbPreview';
import { Card, LAYER_OPTIONS, Select } from '../../PcbMilling/components/controls';
import { StepColumns, Warnings } from '../components/Layout';

interface Props {
    project: ParsedProject | null;
    board: BoardModel | null;
    side: BoardSide;
    busy: boolean;
    onFiles: (files: File[]) => void;
    onLayer: (name: string, kind: LayerKind) => void;
    onSide: (side: BoardSide) => void;
}

const ProjectStep = ({ project, board, side, busy, onFiles, onLayer, onSide }: Props) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const warnings = [...(project?.warnings ?? []), ...(board?.warnings ?? [])];

    return (
        <StepColumns
            left={
                <>
                    <Card>
                        <div className="flex items-center gap-3">
                            <p className="text-sm text-gray-500 dark:text-gray-300 flex-1">
                                A zip or the Gerber and drill files of one board.
                            </p>
                            <Button variant="primary" className="shrink-0" onClick={() => fileRef.current?.click()} disabled={busy}>
                                {project ? 'Open other files' : 'Open files / zip'}
                            </Button>
                        </div>
                        <input
                            ref={fileRef}
                            type="file"
                            multiple
                            className="hidden"
                            accept=".zip,.gbr,.ger,.gtl,.gbl,.gko,.gm1,.gml,.drl,.xln,.txt,.nc,.xnc,.exc,.cmp,.sol,.dim"
                            onChange={(e) => {
                                // copy first: clearing the input empties the live FileList
                                const files = Array.from(e.target.files ?? []);
                                e.target.value = '';
                                if (files.length) onFiles(files);
                            }}
                        />
                    </Card>

                    {project && (
                        <Card>
                            <p className="text-sm font-semibold">Layers — check the role of every file</p>
                            <div className="flex flex-col gap-0.5">
                                {project.files.map((f) => (
                                    <div key={f.name} className="grid grid-cols-[1fr_8.5rem] gap-2 items-center text-sm">
                                        <span className={cx('truncate', { 'text-gray-400': f.kind === 'ignored' })} title={f.name}>
                                            {f.name.split('/').pop() || f.name}
                                        </span>
                                        <select
                                            className="h-6 border border-gray-300 dark:border-dark-lighter rounded px-1 bg-white dark:bg-dark text-sm"
                                            value={f.kind}
                                            onChange={(e) => onLayer(f.name, e.target.value as LayerKind)}
                                        >
                                            {LAYER_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                            <Select
                                label="Copper side to mill"
                                value={side}
                                options={[
                                    { value: 'top', label: 'Top' },
                                    { value: 'bottom', label: 'Bottom (mirrored)' },
                                ]}
                                onChange={onSide}
                            />
                        </Card>
                    )}
                </>
            }
            right={
                <>
                    <Card className="flex-1 min-h-0">
                        {board && board.width > 0 ? (
                            <>
                                <div className="flex-1 min-h-0">
                                    <PcbPreview model={board} operations={[]} selectedId={null} />
                                </div>
                                <p className="text-xs text-gray-500">
                                    Board {board.width.toFixed(2)} × {board.height.toFixed(2)} mm · {board.holes.length} holes
                                    {!board.hasOutline && ' · no outline'}
                                </p>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                                {busy ? 'Reading files...' : 'Open Gerber files to see the board'}
                            </div>
                        )}
                    </Card>
                    <Warnings items={warnings} />
                </>
            }
        />
    );
};

export default ProjectStep;
