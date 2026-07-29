import { RawMapData } from "./RawMapData";

/**
 * Expands the run-length encoded pixel lists Valetudo ships in map format v2.
 *
 * The total pixel count is derived up front so the target array can be allocated
 * once - a large map expands to several hundred thousand entries, and growing a
 * plain array by `push()` that many times per poll is the single most expensive
 * thing that happens before anything is drawn.
 */
export function preprocessMap(data: RawMapData): RawMapData {
    if (data.metaData?.version !== 2 || !Array.isArray(data.layers)) {
        return data;
    }

    for (const layer of data.layers) {
        const compressed = layer.compressedPixels;

        if (layer.pixels.length !== 0 || !compressed || compressed.length === 0) {
            continue;
        }

        let total = 0;
        for (let i = 2; i < compressed.length; i += 3) {
            total += compressed[i];
        }

        const pixels = new Array<number>(total * 2);
        let write = 0;

        for (let i = 0; i < compressed.length; i += 3) {
            const xStart = compressed[i];
            const y = compressed[i + 1];
            const count = compressed[i + 2];

            for (let j = 0; j < count; j++) {
                pixels[write++] = xStart + j;
                pixels[write++] = y;
            }
        }

        layer.pixels = pixels;
        delete layer.compressedPixels;
    }

    return data;
}

