export type Rgba = readonly [r: number, g: number, b: number, a: number];

const TRANSPARENT: Rgba = [0, 0, 0, 0];

const parsedColorCache = new Map<string, Rgba>();

let probeCtx: CanvasRenderingContext2D | null | undefined;

function getProbeContext(): CanvasRenderingContext2D | null {
    if (probeCtx === undefined) {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        probeCtx = canvas.getContext("2d", { willReadFrequently: true });
    }

    return probeCtx;
}

/**
 * Resolves the first usable color out of the given candidates, following the same
 * precedence the card has always used: an explicit config value wins, then any
 * number of CSS custom properties (`--foo`) read off the Home Assistant root, then
 * a literal fallback.
 */
export function resolveCssColor(container: Element | null, ...colors: (string | undefined)[]): string {
    for (const color of colors) {
        if (!color) {
            continue;
        }

        if (color.startsWith("--")) {
            const resolved = container ? getComputedStyle(container).getPropertyValue(color) : "";
            if (!resolved) {
                continue;
            }

            return resolved.trim();
        }

        return color;
    }

    return "";
}

/**
 * Turns any CSS color string into numeric RGBA so pixel layers can be composited
 * into an ImageData buffer instead of issuing one canvas call per map pixel.
 * Results are memoized because the same handful of colors is used for every frame.
 */
export function parseColor(color: string): Rgba {
    const cached = parsedColorCache.get(color);
    if (cached !== undefined) {
        return cached;
    }

    let result: Rgba = TRANSPARENT;
    const ctx = getProbeContext();

    if (ctx) {
        // An invalid assignment silently keeps the previous fillStyle, so reset to a
        // known-transparent value first and treat "still transparent" as "invalid".
        ctx.fillStyle = "rgba(0, 0, 0, 0)";
        ctx.fillStyle = color;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillRect(0, 0, 1, 1);

        const data = ctx.getImageData(0, 0, 1, 1).data;
        result = [data[0], data[1], data[2], data[3] / 255];
    }

    parsedColorCache.set(color, result);

    return result;
}
