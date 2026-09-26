import JSZip from 'jszip';
import { InputFile } from '../definitions';

const TEXT_RE = /\.(gbr|ger|gtl|gbl|gko|gm\d*|gml|gto|gbo|gts|gbs|gtp|gbp|drl|xln|txt|nc|xnc|exc|drd|cmp|sol|dim|g\d|art|pho|gbrjob)$/i;

/** Reads the chosen files; zip archives are expanded. */
export const readInputFiles = async (list: FileList | File[]): Promise<InputFile[]> => {
    const out: InputFile[] = [];
    for (const file of Array.from(list)) {
        if (/\.zip$/i.test(file.name)) {
            const zip = await JSZip.loadAsync(await file.arrayBuffer());
            const entries = Object.values(zip.files).filter((e) => !e.dir && !/__MACOSX|\/\./.test(e.name));
            for (const entry of entries) {
                if (TEXT_RE.test(entry.name) || !/\.[a-z0-9]{2,5}$/i.test(entry.name)) {
                    out.push({ name: entry.name, content: await entry.async('string') });
                }
            }
        } else {
            out.push({ name: file.name, content: await file.text() });
        }
    }
    return out;
};

export const downloadText = (name: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
};
