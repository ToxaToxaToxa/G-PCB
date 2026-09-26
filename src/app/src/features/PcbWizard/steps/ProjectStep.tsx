import { useRef } from 'react';
import cx from 'classnames';

import { Button } from 'app/components/Button';

import { BoardSide, LayerKind } from '../../PcbMilling/definitions';
import { BoardModel, ParsedProject } from '../../PcbMilling/lib/board';
import PcbPreview from '../../PcbMilling/components/PcbPreview';
import { Card, LAYER_OPTIONS, Select } from '../../PcbMilling/components/controls';

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
        <div className="grid grid-cols-[minmax(20rem,26rem)_1fr] max-lg:grid-cols-1 gap-4 min-h-0 flex-1">
            <div className="flex flex-col gap-3 overflow-y-auto pr-1">
                <Card>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Open the Gerber and drill files of one board (a zip or the CAMOutputs files from Fusion 360,
                        KiCad, EasyEDA and others). Check that every file got the right role.
                    </p>
                    <div>
                        <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
                            {project ? 'Open other files' : 'Open Gerber files / zip'}
                        </Button>
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
                    </div>
                </Card>

                {project && (
                    <Card>
                        <p className="text-sm font-semibold">Layers</p>
                        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
                            {project.files.map((f) => (
                                <div key={f.name} className="grid grid-cols-[1fr_8rem] gap-2 items-center text-xs">
                                    <span className={cx('truncate', { 'text-gray-400': f.kind === 'ignored' })} title={f.name}>
                                        {f.name.split('/').pop() || f.name}
                                    </span>
                                    <select
                                        className="border border-gray-300 dark:border-dark-lighter rounded px-1 bg-white dark:bg-dark"
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

                {warnings.length > 0 && (
                    <Card>
                        {warnings.map((w) => (
                            <p key={w} className="text-xs text-orange-500">{w}</p>
                        ))}
                    </Card>
                )}
            </div>

            <Card className="min-h-[20rem]">
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
        </div>
    );
};

export default ProjectStep;
