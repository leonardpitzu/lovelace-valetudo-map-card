export interface RawMapData {
    __class?: string;

    metaData: RawMapDataMetaData;
    size: {
        x: number;
        y: number;
    };
    pixelSize: number;
    layers: RawMapLayer[];
    entities: RawMapEntity[];
}

export interface RawMapEntity {
    metaData: RawMapEntityMetaData;
    points: number[];
    type: RawMapEntityType;
}

export interface RawMapEntityMetaData {
    angle?: number;
}

export interface RawMapLayer {
    metaData: RawMapLayerMetaData;
    type: RawMapLayerType;
    pixels: number[];
    compressedPixels?: number[];
    dimensions: {
        x: RawMapLayerDimension;
        y: RawMapLayerDimension;
        pixelCount: number;
    };
}

export interface RawMapLayerDimension {
    min: number;
    max: number;
    mid: number;
    avg: number;
}

export interface RawMapLayerMetaData {
    area: number;
    segmentId?: string;
    name?: string;
    active?: boolean;
    material?: RawMapLayerMaterial;
}

export type RawMapLayerType = "floor" | "segment" | "wall";

// Segment floor material, as reported/configured in Valetudo (>= 2026.01).
export type RawMapLayerMaterial =
    | "generic"
    | "tile"
    | "wood"
    | "wood_horizontal"
    | "wood_vertical"
    | "carpet"
    | "carpet_low"
    | "carpet_high";

export type RawMapEntityType =
    | "charger_location"
    | "robot_position"
    | "go_to_target"
    | "obstacle"
    | "path"
    | "predicted_path"
    | "virtual_wall"
    | "threshold"
    | "curtain"
    | "no_go_area"
    | "no_mop_area"
    | "active_zone"
    | "carpet"
    | "ramp";

export interface RawMapDataMetaData {
    version: number;
    nonce: string;
}
