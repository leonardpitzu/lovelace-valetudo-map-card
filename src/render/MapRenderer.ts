import { FourColorTheoremSolver } from "../lib/colors/FourColorTheoremSolver";
import { parseColor, resolveCssColor, Rgba } from "../lib/cssColors";
import {
    RawMapData,
    RawMapEntity,
    RawMapEntityType,
    RawMapLayer,
    RawMapLayerMaterial,
    RawMapLayerType
} from "../lib/RawMapData";
import { BoundingBox, Configuration, HaIconElement, RobotInfo } from "../lib/types";

type Projector = (raw: number) => number;

/**
 * Source-over compositing of a single RGBA color onto an ImageData buffer.
 *
 * The three fast paths cover every combination the card actually produces (opaque
 * source, untouched destination, opaque destination), so the divide in the general
 * case is effectively never executed.
 */
function blendPixel(data: Uint8ClampedArray, idx: number, color: Rgba, opacity: number): void {
    const srcA = color[3] * opacity;

    if (srcA >= 1) {
        data[idx] = color[0];
        data[idx + 1] = color[1];
        data[idx + 2] = color[2];
        data[idx + 3] = 255;

        return;
    }

    if (srcA <= 0) {
        return;
    }

    const dstA = data[idx + 3];

    if (dstA === 0) {
        data[idx] = color[0];
        data[idx + 1] = color[1];
        data[idx + 2] = color[2];
        data[idx + 3] = srcA * 255;

        return;
    }

    const inv = 1 - srcA;

    if (dstA === 255) {
        data[idx] = color[0] * srcA + data[idx] * inv;
        data[idx + 1] = color[1] * srcA + data[idx + 1] * inv;
        data[idx + 2] = color[2] * srcA + data[idx + 2] * inv;

        return;
    }

    const keep = (dstA / 255) * inv;
    const outA = srcA + keep;

    data[idx] = (color[0] * srcA + data[idx] * keep) / outA;
    data[idx + 1] = (color[1] * srcA + data[idx + 1] * keep) / outA;
    data[idx + 2] = (color[2] * srcA + data[idx + 2] * keep) / outA;
    data[idx + 3] = outA * 255;
}

/**
 * Decides whether a given segment pixel should receive the material accent color,
 * producing a lightweight texture without extra canvas layers. Coordinates are raw
 * map pixels, so the pattern is map-scale independent.
 */
function isFloorMaterialAccentPixel(material: RawMapLayerMaterial, x: number, y: number): boolean {
    switch (material) {
        case "wood":
        case "wood_horizontal":
            return y % 4 === 0;
        case "wood_vertical":
            return x % 4 === 0;
        case "tile":
            return x % 6 === 0 || y % 6 === 0;
        case "carpet":
        case "carpet_low":
            return (x + y) % 3 === 0;
        case "carpet_high":
            return (x + y) % 2 === 0;
        default:
            return false;
    }
}

function getLayers(attributes: RawMapData, type: RawMapLayerType, maxCount?: number): RawMapLayer[] {
    const layers: RawMapLayer[] = [];

    for (const layer of attributes.layers) {
        if (layer.type === type) {
            layers.push(layer);

            if (layers.length === maxCount) {
                break;
            }
        }
    }

    return layers;
}

function getEntities(attributes: RawMapData, type: RawMapEntityType, maxCount?: number): RawMapEntity[] {
    const entities: RawMapEntity[] = [];

    for (const entity of attributes.entities) {
        if (entity.type === type) {
            entities.push(entity);

            if (entities.length === maxCount) {
                break;
            }
        }
    }

    return entities;
}

/**
 * Owns the map DOM and all canvas drawing.
 *
 * Two properties make this cheap enough to run on the 3s cleaning cadence:
 *
 *  1. Pixel layers (floor/segments/walls) are composited into a single ImageData
 *     buffer at native map resolution and blitted once, instead of one `fillRect`
 *     per map pixel. Upscaling happens in one `drawImage` with smoothing disabled,
 *     which keeps the pixel art crisp at any `map_scale`.
 *  2. Everything that is not the robot, its path or the goto marker is geometry
 *     that changes only when the robot re-maps or the user edits zones. That whole
 *     stack is fingerprinted and re-rendered only when the fingerprint changes, so
 *     a normal poll costs one path redraw and three style writes.
 */
export class MapRenderer {
    readonly element: HTMLDivElement;

    private readonly mapCanvas: HTMLCanvasElement;
    private readonly pathCanvas: HTMLCanvasElement;
    private readonly bufferCanvas: HTMLCanvasElement;
    private readonly chargerIcon: HaIconElement;
    private readonly vacuumIcon: HaIconElement;
    private readonly gotoIcon: HaIconElement;

    private buffer: ImageData | null = null;
    private staticSignature = "";
    private configRevision = 0;
    private lastValidRobotInfo: RobotInfo | null = null;

    constructor() {
        this.element = document.createElement("div");
        this.element.id = "lovelaceValetudoCard";

        this.mapCanvas = document.createElement("canvas");
        this.pathCanvas = document.createElement("canvas");
        this.bufferCanvas = document.createElement("canvas");

        this.chargerIcon = document.createElement("ha-icon");
        this.vacuumIcon = document.createElement("ha-icon");
        this.gotoIcon = document.createElement("ha-icon");

        this.element.appendChild(this.wrapLayer(this.mapCanvas, 1));
        this.element.appendChild(this.wrapLayer(this.chargerIcon, 2));
        this.element.appendChild(this.wrapLayer(this.pathCanvas, 3));
        this.element.appendChild(this.wrapLayer(this.vacuumIcon, 4));
        this.element.appendChild(this.wrapLayer(this.gotoIcon, 5));
    }

    /** Invalidates the cached static layer stack. Call whenever the config changes. */
    invalidate(): void {
        this.configRevision++;
    }

    render(config: Configuration, attributes: RawMapData, mapWidth: number, mapHeight: number, boundingBox: BoundingBox): void {
        const scale = config.map_scale;
        const canvasWidth = mapWidth * scale;
        const canvasHeight = mapHeight * scale;

        if (this.mapCanvas.width !== canvasWidth || this.mapCanvas.height !== canvasHeight) {
            this.mapCanvas.width = canvasWidth;
            this.mapCanvas.height = canvasHeight;
            this.pathCanvas.width = canvasWidth;
            this.pathCanvas.height = canvasHeight;
            this.staticSignature = "";
        }

        // Raw map units -> scaled canvas pixels.
        const unitScale = attributes.pixelSize / scale;
        const leftOffset = (boundingBox.minX - 1) * scale;
        const topOffset = (boundingBox.minY - 1) * scale;
        const toX: Projector = (raw) => Math.floor(raw / unitScale) - leftOffset;
        const toY: Projector = (raw) => Math.floor(raw / unitScale) - topOffset;

        const signature = this.computeStaticSignature(config, attributes, mapWidth, mapHeight, boundingBox);
        if (signature !== this.staticSignature) {
            this.renderStaticLayers(config, attributes, mapWidth, mapHeight, boundingBox, toX, toY);
            this.staticSignature = signature;
        }

        this.renderPaths(config, attributes, toX, toY);
        this.renderIcons(config, attributes, toX, toY);
    }

    private wrapLayer(child: HTMLElement, zIndex: number): HTMLDivElement {
        const container = document.createElement("div");
        container.style.zIndex = String(zIndex);
        container.appendChild(child);

        return container;
    }

    /**
     * Cheap fingerprint (O(layers + entities), never O(pixels)) of everything drawn
     * into the static stack. Deliberately ignores `metaData.nonce`, which changes on
     * every single map update even when nothing moved.
     */
    private computeStaticSignature(config: Configuration, attributes: RawMapData, mapWidth: number, mapHeight: number, boundingBox: BoundingBox): string {
        const parts: (string | number)[] = [
            this.configRevision,
            mapWidth,
            mapHeight,
            boundingBox.minX,
            boundingBox.minY,
            attributes.pixelSize,
            config.map_scale
        ];

        for (const layer of attributes.layers) {
            parts.push(
                layer.type,
                layer.metaData.segmentId ?? "",
                layer.metaData.material ?? "",
                layer.dimensions.pixelCount,
                layer.dimensions.x.min,
                layer.dimensions.x.max,
                layer.dimensions.y.min,
                layer.dimensions.y.max
            );
        }

        for (const entity of attributes.entities) {
            switch (entity.type) {
                case "carpet":
                case "active_zone":
                case "no_go_area":
                case "no_mop_area":
                case "virtual_wall":
                    parts.push(entity.type, entity.points.length, ...entity.points);
                    break;
                default:
                    break;
            }
        }

        return parts.join(",");
    }

    private renderStaticLayers(config: Configuration, attributes: RawMapData, mapWidth: number, mapHeight: number, boundingBox: BoundingBox, toX: Projector, toY: Projector): void {
        const scale = config.map_scale;
        const ctx = this.mapCanvas.getContext("2d")!;
        const haRoot = document.getElementsByTagName("home-assistant")[0] ?? null;

        ctx.clearRect(0, 0, this.mapCanvas.width, this.mapCanvas.height);

        const buffer = this.ensureBuffer(mapWidth, mapHeight);
        const data = buffer.data;

        // Buffer coordinates are raw map pixels shifted by the bounding box, matching
        // the +1 padding the container sizing accounts for.
        const offsetX = boundingBox.minX - 1;
        const offsetY = boundingBox.minY - 1;
        const minX = config.crop.left / scale;
        const minY = config.crop.top / scale;

        // Pass 1: floor and segments, which sit below the carpet polygons.
        if (config.show_floor) {
            const floor = getLayers(attributes, "floor", 1)[0];
            if (floor) {
                this.writePixels(data, mapWidth, mapHeight, floor.pixels, offsetX, offsetY, minX, minY, parseColor(resolveCssColor(haRoot, config.floor_color, "--valetudo-map-floor-color", "--secondary-background-color")), config.floor_opacity);
            }
        }

        if (config.show_segments) {
            const segments = getLayers(attributes, "segment");
            if (segments.length > 0) {
                const colorFinder = new FourColorTheoremSolver(segments, 6);
                const accentColor = parseColor(resolveCssColor(haRoot, config.floor_material_color, "--valetudo-floor-material-color", "rgba(0, 0, 0, 0.5)"));

                for (const segment of segments) {
                    // The greedy solver is not strictly bounded to four colors, so wrap
                    // instead of indexing past the configured palette.
                    const palette = config.segment_colors;
                    const color = parseColor(palette[colorFinder.getColor(segment.metaData.segmentId) % palette.length]);
                    const material = config.show_floor_material ? segment.metaData.material : undefined;

                    this.writePixels(
                        data, mapWidth, mapHeight, segment.pixels, offsetX, offsetY, minX, minY, color, config.segment_opacity,
                        material && material !== "generic" ? material : undefined,
                        accentColor,
                        config.floor_material_opacity
                    );
                }
            }
        }

        this.flushBuffer(ctx, buffer, mapWidth, mapHeight, scale);

        // Detected carpets (polygon entities, Valetudo >= 2025.12) go above the floor
        // and segments but below the walls, so physical geometry stays on top.
        if (config.show_carpets) {
            this.drawPolygons(ctx, getEntities(attributes, "carpet"), resolveCssColor(haRoot, config.carpet_color, "--valetudo-carpet-color", "--primary-color"), config.carpet_opacity, config.show_carpet_border, toX, toY);
        }

        // Pass 2: walls, on their own buffer so the carpets stay underneath.
        if (config.show_walls) {
            const wall = getLayers(attributes, "wall", 1)[0];
            if (wall) {
                data.fill(0);
                this.writePixels(data, mapWidth, mapHeight, wall.pixels, offsetX, offsetY, minX, minY, parseColor(resolveCssColor(haRoot, config.wall_color, "--valetudo-map-wall-color", "--accent-color")), config.wall_opacity);
                this.flushBuffer(ctx, buffer, mapWidth, mapHeight, scale);
            }
        }

        if (config.show_currently_cleaned_zones) {
            this.drawPolygons(ctx, getEntities(attributes, "active_zone"), resolveCssColor(haRoot, config.currently_cleaned_zone_color, "--valetudo-currently_cleaned_zone_color", "--secondary-text-color"), config.currently_cleaned_zone_opacity, config.show_currently_cleaned_zones_border, toX, toY);
        }

        if (config.show_no_go_areas) {
            this.drawPolygons(ctx, getEntities(attributes, "no_go_area"), resolveCssColor(haRoot, config.no_go_area_color, "--valetudo-no-go-area-color", "--accent-color"), config.no_go_area_opacity, config.show_no_go_area_border, toX, toY);
        }

        if (config.show_no_mop_areas) {
            this.drawPolygons(ctx, getEntities(attributes, "no_mop_area"), resolveCssColor(haRoot, config.no_mop_area_color, "--valetudo-no-mop-area-color", "--secondary-text-color"), config.no_mop_area_opacity, config.show_no_mop_area_border, toX, toY);
        }

        if (config.show_virtual_walls && config.virtual_wall_width > 0) {
            ctx.globalAlpha = config.virtual_wall_opacity;
            ctx.strokeStyle = resolveCssColor(haRoot, config.virtual_wall_color, "--valetudo-virtual-wall-color", "--accent-color");
            ctx.lineWidth = config.virtual_wall_width;

            for (const item of getEntities(attributes, "virtual_wall")) {
                ctx.beginPath();
                ctx.moveTo(toX(item.points[0]), toY(item.points[1]));
                ctx.lineTo(toX(item.points[2]), toY(item.points[3]));
                ctx.stroke();
            }

            ctx.globalAlpha = 1;
        }
    }

    private ensureBuffer(width: number, height: number): ImageData {
        if (!this.buffer || this.buffer.width !== width || this.buffer.height !== height) {
            this.bufferCanvas.width = width;
            this.bufferCanvas.height = height;
            this.buffer = this.bufferCanvas.getContext("2d")!.createImageData(width, height);
        } else {
            this.buffer.data.fill(0);
        }

        return this.buffer;
    }

    private flushBuffer(ctx: CanvasRenderingContext2D, buffer: ImageData, width: number, height: number, scale: number): void {
        const bufferCtx = this.bufferCanvas.getContext("2d")!;
        bufferCtx.putImageData(buffer, 0, 0);

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.bufferCanvas, 0, 0, width, height, 0, 0, width * scale, height * scale);
    }

    private writePixels(data: Uint8ClampedArray, width: number, height: number, pixels: number[], offsetX: number, offsetY: number, minX: number, minY: number, color: Rgba, opacity: number, material?: RawMapLayerMaterial, accentColor?: Rgba, accentOpacity = 0): void {
        for (let i = 0; i < pixels.length; i += 2) {
            const rawX = pixels[i];
            const rawY = pixels[i + 1];
            const x = rawX - offsetX;
            const y = rawY - offsetY;

            if (x < minX || y < minY || x < 0 || y < 0 || x >= width || y >= height) {
                continue;
            }

            const idx = (y * width + x) << 2;
            blendPixel(data, idx, color, opacity);

            if (material !== undefined && accentColor !== undefined && isFloorMaterialAccentPixel(material, rawX, rawY)) {
                blendPixel(data, idx, accentColor, accentOpacity);
            }
        }
    }

    private drawPolygons(ctx: CanvasRenderingContext2D, items: RawMapEntity[], color: string, opacity: number, border: boolean, toX: Projector, toY: Projector): void {
        if (items.length === 0) {
            return;
        }

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;

        for (const item of items) {
            const points = item.points;
            if (points.length < 2) {
                continue;
            }

            ctx.globalAlpha = opacity;
            ctx.beginPath();
            ctx.moveTo(toX(points[0]), toY(points[1]));

            for (let i = 2; i < points.length; i += 2) {
                ctx.lineTo(toX(points[i]), toY(points[i + 1]));
            }

            ctx.fill();

            if (border) {
                ctx.closePath();
                ctx.globalAlpha = 1;
                ctx.stroke();
            }
        }

        ctx.globalAlpha = 1;
    }

    private renderPaths(config: Configuration, attributes: RawMapData, toX: Projector, toY: Projector): void {
        const ctx = this.pathCanvas.getContext("2d")!;
        ctx.clearRect(0, 0, this.pathCanvas.width, this.pathCanvas.height);

        if (config.path_width <= 0) {
            return;
        }

        const haRoot = document.getElementsByTagName("home-assistant")[0] ?? null;

        ctx.globalAlpha = config.path_opacity;
        ctx.strokeStyle = resolveCssColor(haRoot, config.path_color, "--valetudo-map-path-color", "--primary-text-color");
        ctx.lineWidth = config.path_width;

        if (config.show_path) {
            // The canvas is persistent now, so the dash pattern has to be reset
            // explicitly instead of relying on a freshly created element.
            ctx.setLineDash([]);
            this.strokePolylines(ctx, getEntities(attributes, "path"), toX, toY);
        }

        if (config.show_predicted_path) {
            ctx.setLineDash([5, 3]);
            this.strokePolylines(ctx, getEntities(attributes, "predicted_path"), toX, toY);
            ctx.setLineDash([]);
        }

        ctx.globalAlpha = 1;
    }

    private strokePolylines(ctx: CanvasRenderingContext2D, items: RawMapEntity[], toX: Projector, toY: Projector): void {
        for (const item of items) {
            const points = item.points;
            if (points.length < 4) {
                continue;
            }

            ctx.beginPath();
            ctx.moveTo(toX(points[0]), toY(points[1]));

            for (let i = 2; i < points.length; i += 2) {
                ctx.lineTo(toX(points[i]), toY(points[i + 1]));
            }

            ctx.stroke();
        }
    }

    private renderIcons(config: Configuration, attributes: RawMapData, toX: Projector, toY: Projector): void {
        const haRoot = document.getElementsByTagName("home-assistant")[0] ?? null;
        const iconScale = config.icon_scale;
        const nudge = 12 * iconScale;

        const charger = getEntities(attributes, "charger_location", 1)[0];
        this.placeIcon(
            this.chargerIcon,
            config.show_dock && charger !== undefined,
            config.dock_icon || "mdi:flash",
            resolveCssColor(haRoot, config.dock_color, "green"),
            charger ? toX(charger.points[0]) - nudge : 0,
            charger ? toY(charger.points[1]) - nudge : 0,
            `scale(${iconScale}, ${iconScale}) rotate(-${config.rotate})`
        );

        const robotEntity = getEntities(attributes, "robot_position", 1)[0];
        const robotInfo: RobotInfo | null = robotEntity
            ? [robotEntity.points[0], robotEntity.points[1], robotEntity.metaData.angle]
            : this.lastValidRobotInfo;

        if (robotInfo) {
            this.lastValidRobotInfo = robotInfo;
        }

        this.placeIcon(
            this.vacuumIcon,
            config.show_vacuum && robotInfo !== null,
            config.vacuum_icon || "mdi:robot-vacuum",
            resolveCssColor(haRoot, config.vacuum_color, "--primary-text-color"),
            robotInfo ? toX(robotInfo[0]) - nudge : 0,
            robotInfo ? toY(robotInfo[1]) - nudge : 0,
            `scale(${iconScale}, ${iconScale}) rotate(${robotInfo?.[2] ?? 0}deg)`
        );

        const gotoTarget = getEntities(attributes, "go_to_target", 1)[0];
        this.placeIcon(
            this.gotoIcon,
            config.show_goto_target && gotoTarget !== undefined,
            config.goto_target_icon || "mdi:pin",
            resolveCssColor(haRoot, config.goto_target_color, "blue"),
            gotoTarget ? toX(gotoTarget.points[0]) - nudge : 0,
            gotoTarget ? toY(gotoTarget.points[1]) - 22 * iconScale : 0,
            `scale(${iconScale}, ${iconScale}) rotate(-${config.rotate})`
        );
    }

    private placeIcon(icon: HaIconElement, visible: boolean, name: string, color: string, left: number, top: number, transform: string): void {
        if (!visible) {
            icon.style.display = "none";

            return;
        }

        icon.style.display = "";
        // Needed in Home Assistant 0.110.0 and up
        icon.style.position = "absolute";
        icon.icon = name;
        icon.style.color = color;
        icon.style.left = `${left}px`;
        icon.style.top = `${top}px`;
        icon.style.transform = transform;
    }
}
