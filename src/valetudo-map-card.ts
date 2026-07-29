import type { HomeAssistant } from "custom-card-helpers";
import type { HassEntity } from "home-assistant-js-websocket";
// Named import: a namespace import would defeat tree-shaking and pull in the
// entire deflate half of pako, which this card never uses.
import { inflate } from "pako";

import { preprocessMap } from "./lib/mapUtils";
import { extractZtxtPngChunks } from "./lib/pngUtils";
import { RawMapData } from "./lib/RawMapData";
import { BoundingBox, Configuration, CropConfig, HaIconElement } from "./lib/types";
import { MapRenderer } from "./render/MapRenderer";
import { DEFAULT_CARD_CONFIG, POLL_INTERVAL_STATE_MAP } from "./res/consts";
import { CARD_STYLES, MAP_CONTAINER_STYLE_TEMPLATE } from "./res/styles";
import { ControlPanel } from "./ui/ControlPanel";
import { StatusOverlay } from "./ui/StatusOverlay";

// Replaced at build time by rollup, see rollup.config.js
declare const __VERSION__: string;
declare const __BUILD_ID__: string;

console.info(
    `%c   Valetudo-Map-Card   \n%c   Version ${__VERSION__} (build ${__BUILD_ID__})   `,
    "color: #0076FF; font-weight: bold; background: #121212",
    "color: #52AEFF; font-weight: bold; background: #1e1e1e"
);

const DEFAULT_POLL_INTERVAL = 10000;

class ValetudoMapCard extends HTMLElement {
    private _hass: HomeAssistant | null = null;
    private _config: Configuration | null = null;

    private readonly cardContainer: HTMLElement;
    private readonly cardHeader: HTMLDivElement;
    private readonly cardTitle: HTMLDivElement;
    private readonly mapWarning: HTMLElement;
    private readonly vacuumWarning: HTMLElement;
    private readonly mapContainer: HTMLDivElement;
    private readonly mapContainerStyle: HTMLStyleElement;
    private readonly controlContainer: HTMLDivElement;
    private readonly cardStyle: HTMLStyleElement;

    private readonly renderer = new MapRenderer();
    private controls: ControlPanel | null = null;
    private overlay: StatusOverlay | null = null;

    private lastMapPoll = 0;
    private isPollingMap = false;
    private forcePoll = true;
    private lastRobotState = "docked";
    private pollInterval = POLL_INTERVAL_STATE_MAP["docked"];
    private lastMapStyle = "";

    private inViewport = true;
    private observer: IntersectionObserver | null = null;

    private readonly onVisibilityChange = (): void => {
        this.onActivityChange();
    };

    constructor() {
        super();

        this.attachShadow({ mode: "open" });

        this.cardContainer = document.createElement("ha-card");
        this.cardContainer.id = "valetudoMapCard";

        this.cardHeader = document.createElement("div");
        this.cardHeader.setAttribute("class", "card-header");
        this.cardTitle = document.createElement("div");
        this.cardTitle.setAttribute("class", "name");
        this.cardHeader.appendChild(this.cardTitle);
        this.cardContainer.appendChild(this.cardHeader);

        this.mapWarning = document.createElement("hui-warning");
        this.mapWarning.id = "valetudoMapCardWarning1";
        this.mapWarning.style.display = "none";
        this.cardContainer.appendChild(this.mapWarning);

        this.vacuumWarning = document.createElement("hui-warning");
        this.vacuumWarning.id = "valetudoMapCardWarning2";
        this.vacuumWarning.style.display = "none";
        this.cardContainer.appendChild(this.vacuumWarning);

        this.mapContainer = document.createElement("div");
        // Has to match the selector in MAP_CONTAINER_STYLE_TEMPLATE, otherwise the
        // crop and min_height rules silently do nothing.
        this.mapContainer.id = "lovelaceValetudoMapCard";
        this.mapContainer.appendChild(this.renderer.element);
        this.mapContainerStyle = document.createElement("style");
        this.cardContainer.appendChild(this.mapContainer);
        this.cardContainer.appendChild(this.mapContainerStyle);

        this.controlContainer = document.createElement("div");
        this.controlContainer.id = "valetudoMapCardControlsContainer";
        this.cardStyle = document.createElement("style");
        this.cardStyle.textContent = CARD_STYLES;
        this.cardContainer.appendChild(this.controlContainer);
        this.cardContainer.appendChild(this.cardStyle);

        this.shadowRoot?.appendChild(this.cardContainer);
    }

    static getStubConfig(): { vacuum: string } {
        return { vacuum: "valetudo_REPLACEME" };
    }

    // noinspection JSUnusedGlobalSymbols
    getCardSize(): number {
        return 1;
    }

    connectedCallback(): void {
        document.addEventListener("visibilitychange", this.onVisibilityChange);

        // A card scrolled out of view (or on an inactive dashboard view) has no
        // reason to keep fetching, inflating and parsing a map every few seconds.
        if (typeof IntersectionObserver !== "undefined") {
            this.observer = new IntersectionObserver((entries) => {
                this.inViewport = entries.some((entry) => entry.isIntersecting);
                this.onActivityChange();
            });
            this.observer.observe(this);
        }

        this.controls?.connect();
    }

    disconnectedCallback(): void {
        document.removeEventListener("visibilitychange", this.onVisibilityChange);
        this.observer?.disconnect();
        this.observer = null;
        this.controls?.disconnect();
    }

    // noinspection JSUnusedGlobalSymbols
    setConfig(config: Configuration): void {
        const crop = config.crop === Object(config.crop) ? config.crop : ({} as CropConfig);

        // Never mutate the object Lovelace handed us; it is reused across editor
        // previews and re-renders.
        const merged = {
            ...DEFAULT_CARD_CONFIG,
            ...config,
            crop: {
                top: crop.top ?? 0,
                bottom: crop.bottom ?? 0,
                left: crop.left ?? 0,
                right: crop.right ?? 0
            },
            custom_buttons: Array.isArray(config.custom_buttons) ? config.custom_buttons : [],
            segment_colors: Array.isArray(config.segment_colors) && config.segment_colors.length > 0
                ? config.segment_colors
                : DEFAULT_CARD_CONFIG.segment_colors
        } as Configuration;

        if (typeof merged.vacuum === "string") {
            merged.vacuum = merged.vacuum.toLowerCase();
        }

        // Always carry a unit, otherwise `rotate(-0)` is invalid CSS and the whole
        // transform (including the icon scaling) gets dropped.
        const rotate = `${merged.rotate ?? ""}`.trim();
        merged.rotate = /^-?\d+(\.\d+)?$/.test(rotate) || rotate === "" ? `${Number(rotate) || 0}deg` : rotate;

        this._config = merged;

        this.cardHeader.style.display = merged.title ? "block" : "none";
        this.cardTitle.textContent = merged.title;
        this.cardContainer.style.background = merged.background_color ?? null;

        this.renderer.invalidate();
        this.lastMapStyle = "";
        this.forcePoll = true;

        this.controls?.disconnect();
        this.controls = new ControlPanel(merged);
        this.controlContainer.replaceChildren(this.controls.element);

        this.overlay = new StatusOverlay(merged);
        this.mapContainer.replaceChildren(this.renderer.element, this.overlay.element);

        if (this.isConnected) {
            this.controls.connect();
        }
    }

    // noinspection JSUnusedGlobalSymbols
    set hass(hass: HomeAssistant) {
        if (hass === undefined) {
            // Home Assistant 0.110.0 may call this function with undefined sometimes if inside another card
            return;
        }

        this._hass = hass;
        this.update();
    }

    private get isActive(): boolean {
        return this.inViewport && document.visibilityState !== "hidden";
    }

    private onActivityChange(): void {
        if (this.isActive) {
            this.forcePoll = true;
            this.update();
        }
    }

    private update(): void {
        const hass = this._hass;
        const config = this._config;

        if (!hass || !config || !this.isActive) {
            return;
        }

        const vacuumEntity: HassEntity | undefined = hass.states[`vacuum.${config.vacuum}`];

        if (vacuumEntity && vacuumEntity.state !== this.lastRobotState) {
            this.lastRobotState = vacuumEntity.state;
            this.pollInterval = POLL_INTERVAL_STATE_MAP[vacuumEntity.state] || DEFAULT_POLL_INTERVAL;
            this.forcePoll = true;
        }

        this.updateControls(hass, config, vacuumEntity);
        this.pollMap(hass, config);
    }

    private updateControls(hass: HomeAssistant, config: Configuration, vacuumEntity: HassEntity | undefined): void {
        if (!vacuumEntity || vacuumEntity.state === "unavailable" || !vacuumEntity.attributes) {
            this.controlContainer.style.display = "none";
            this.overlay?.hide();
            this.vacuumWarning.textContent = `Entity not available: vacuum.${config.vacuum}`;
            this.vacuumWarning.style.display = "block";

            return;
        }

        this.controlContainer.style.display = "block";
        this.vacuumWarning.style.display = "none";
        this.controls?.update(hass, vacuumEntity);
        this.overlay?.update(hass, vacuumEntity);
    }

    private pollMap(hass: HomeAssistant, config: Configuration): void {
        const mapEntity = hass.states[`camera.${config.vacuum}_map_data`];
        const entityPicture = mapEntity?.attributes?.entity_picture;

        if (!mapEntity || mapEntity.state === "unavailable" || !entityPicture) {
            this.renderer.element.style.display = "none";
            this.mapWarning.textContent = `Entity not available: camera.${config.vacuum}_map_data`;
            this.mapWarning.style.display = "block";

            return;
        }

        if (this.isPollingMap || (!this.forcePoll && Date.now() - this.lastMapPoll < this.pollInterval)) {
            return;
        }

        this.forcePoll = false;
        this.isPollingMap = true;

        this.loadMapData(hass, entityPicture).then((mapData) => {
            this.draw(config, mapData);
        }).catch((error) => {
            this.draw(config, null);
            console.warn(error);
        }).finally(() => {
            // Always released, so a single failed fetch cannot wedge the card into
            // never polling again.
            this.lastMapPoll = Date.now();
            this.isPollingMap = false;
        });
    }

    private async loadMapData(hass: HomeAssistant, url: string): Promise<RawMapData> {
        const response = await hass.fetchWithAuth(url);

        if (!response.ok) {
            throw new Error(`Got error while fetching image ${response.status} - ${response.statusText}`);
        }

        const chunks = extractZtxtPngChunks(new Uint8Array(await response.arrayBuffer()))
            .filter((chunk) => chunk.keyword === "ValetudoMap");

        if (chunks.length < 1) {
            throw new Error("No map data found in image");
        }

        // Native TextDecoder instead of pako's own string conversion: it is faster
        // and keeps the bundle free of pako's charset helpers.
        return preprocessMap(JSON.parse(new TextDecoder().decode(inflate(chunks[0].data))));
    }

    private draw(config: Configuration, attributes: RawMapData | null): void {
        const canDrawMap = attributes?.__class === "ValetudoMap";
        const showMap = canDrawMap && config.show_map;

        this.renderer.element.style.display = showMap ? "block" : "none";

        // The badges float over the map, so they follow it rather than hovering over
        // an empty container.
        if (this.overlay) {
            this.overlay.element.style.display = showMap ? "" : "none";
        }

        if (!canDrawMap) {
            if (config.show_map) {
                this.mapWarning.textContent = `Entity not available: camera.${config.vacuum}_map_data`;
                this.mapWarning.style.display = "block";
            }

            return;
        }

        this.mapWarning.style.display = "none";

        if (!config.show_map || !attributes) {
            return;
        }

        const boundingBox: BoundingBox = {
            minX: attributes.size.x / attributes.pixelSize,
            minY: attributes.size.y / attributes.pixelSize,
            maxX: 0,
            maxY: 0
        };

        for (const layer of attributes.layers) {
            boundingBox.minX = Math.min(boundingBox.minX, layer.dimensions.x.min);
            boundingBox.minY = Math.min(boundingBox.minY, layer.dimensions.y.min);
            boundingBox.maxX = Math.max(boundingBox.maxX, layer.dimensions.x.max);
            boundingBox.maxY = Math.max(boundingBox.maxY, layer.dimensions.y.max);
        }

        const mapWidth = (boundingBox.maxX - boundingBox.minX) + 2 - config.crop.right;
        const mapHeight = (boundingBox.maxY - boundingBox.minY) + 2 - config.crop.bottom;

        if (mapWidth <= 0 || mapHeight <= 0) {
            return;
        }

        this.applyContainerStyle(config, mapWidth, mapHeight);
        this.renderer.render(config, attributes, mapWidth, mapHeight, boundingBox);
    }

    private applyContainerStyle(config: Configuration, mapWidth: number, mapHeight: number): void {
        const containerHeight = (mapHeight * config.map_scale) - config.crop.top;

        let minHeight = Number(config.min_height);
        if (typeof config.min_height === "string" && config.min_height.endsWith("w")) {
            minHeight = Number(config.min_height.slice(0, -1)) * this.mapContainer.offsetWidth;
        }

        const verticalPadding = minHeight > containerHeight ? (minHeight - containerHeight) / 2 : 0;
        const style = MAP_CONTAINER_STYLE_TEMPLATE(
            containerHeight,
            verticalPadding,
            config.left_padding,
            mapWidth * config.map_scale,
            mapHeight * config.map_scale,
            String(config.rotate),
            config.crop.top,
            config.crop.left
        );

        if (style !== this.lastMapStyle) {
            this.lastMapStyle = style;
            this.mapContainerStyle.textContent = style;
        }
    }
}

declare global {
    interface Window {
        customCards: { type: string, name: string, preview?: boolean, description?: string }[];
    }

    interface HTMLElementTagNameMap {
        "ha-icon": HaIconElement;
    }
}

const componentName = "valetudo-map-card";

if (!customElements.get(componentName)) {
    customElements.define(componentName, ValetudoMapCard);

    window.customCards = window.customCards || [];
    window.customCards.push({
        type: componentName,
        name: "Valetudo Map Card",
        preview: false,
        description: "Display the Map data of your Valetudo-enabled robot"
    });
}
