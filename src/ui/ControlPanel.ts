import type { HomeAssistant } from "custom-card-helpers";
import type { HassEntity } from "home-assistant-js-websocket";

import { prettifyLabel } from "../lib/text";
import { Configuration } from "../lib/types";

interface SelectEntity {
    entity_id: string;
    state: string;
    options: string[];
    label: string;
}

interface SegmentEntry {
    id: string;
    name: string;
}

interface ActionButton {
    name: string;
    element: HTMLElement;
}

const ACTION_BUTTONS: { name: string, configKey: keyof Configuration, icon: string, service: string }[] = [
    { name: "start", configKey: "show_start_button", icon: "mdi:play", service: "start" },
    { name: "pause", configKey: "show_pause_button", icon: "mdi:pause", service: "pause" },
    { name: "stop", configKey: "show_stop_button", icon: "mdi:stop", service: "stop" },
    { name: "home", configKey: "show_home_button", icon: "hass:home-map-marker", service: "return_to_base" },
    { name: "locate", configKey: "show_locate_button", icon: "hass:map-marker", service: "locate" }
];

// Friendlier labels for the standard Valetudo selects; unknown ones fall back to the
// auto-prettified entity suffix, which keeps the panel adaptive to future robots.
const SELECT_LABEL_OVERRIDES: Record<string, string> = {
    fan: "Suction",
    carpet_sensor_mode: "Carpet mode"
};

function shouldDisplayButton(buttonName: string, vacuumState: string): boolean {
    switch (vacuumState) {
        case "on":
        case "auto":
        case "spot":
        case "edge":
        case "single_room":
        case "cleaning":
            return buttonName === "pause" || buttonName === "stop" || buttonName === "home";
        case "returning":
            return buttonName === "start" || buttonName === "pause";
        case "docked":
            return buttonName === "start";
        case "idle":
        case "paused":
        default:
            return buttonName === "start" || buttonName === "home";
    }
}

function createButton(icon: string, text?: string): HTMLElement {
    const button = document.createElement("paper-button");
    const iconElement = document.createElement("ha-icon");
    iconElement.icon = icon;
    button.appendChild(iconElement);

    if (text) {
        const label = document.createElement("span");
        label.textContent = text;
        button.appendChild(label);
    }

    button.appendChild(document.createElement("paper-ripple"));

    return button;
}

/**
 * The under-map control panel.
 *
 * Built once and then patched in place: `update()` runs on every Home Assistant
 * state change, so tearing the DOM down and rebuilding it would drop focus, close
 * the open room picker and re-run an O(all entities) scan on every event. Instead
 * only the parts whose shape actually changed (option lists, segment list) are
 * rebuilt, and everything else is a text/attribute write.
 */
export class ControlPanel {
    readonly element: HTMLDivElement;

    private hass: HomeAssistant | null = null;

    private readonly actionButtons: ActionButton[] = [];
    private readonly selectRow: HTMLDivElement;
    private readonly segmentsBlock: HTMLDivElement;
    private readonly roomToggle: HTMLButtonElement;
    private readonly roomPanel: HTMLDivElement;
    private readonly cleanButton: HTMLElement;
    private readonly passesSelect: HTMLSelectElement;

    private readonly selectViews = new Map<string, HTMLSelectElement>();
    private readonly selectedSegments = new Set<string>();
    private segmentPasses = 1;

    private selectSource: unknown = null;
    private selectIds: string[] = [];
    private selectShape = "";
    private segmentShape = "";
    private lastVacuumState = "";

    private readonly onDocumentPointerDown = (event: Event): void => {
        if (this.roomPanel.style.display === "none") {
            return;
        }

        if (!event.composedPath().includes(this.roomPanel.parentElement as EventTarget)) {
            this.roomPanel.style.display = "none";
            this.roomToggle.setAttribute("aria-expanded", "false");
        }
    };

    constructor(private readonly config: Configuration) {
        this.element = document.createElement("div");

        // Action buttons
        const controlFlexBox = document.createElement("div");
        controlFlexBox.classList.add("flex-box");

        for (const spec of ACTION_BUTTONS) {
            if (!config[spec.configKey]) {
                continue;
            }

            const button = createButton(spec.icon);
            button.addEventListener("click", () => {
                this.callService("vacuum", spec.service, { entity_id: `vacuum.${this.config.vacuum}` });
            });

            this.actionButtons.push({ name: spec.name, element: button });
            controlFlexBox.appendChild(button);
        }

        // Custom buttons are fully config driven, so they never change at runtime.
        const customFlexBox = document.createElement("div");
        customFlexBox.classList.add("flex-box");

        for (const buttonConfig of config.custom_buttons) {
            if (buttonConfig !== Object(buttonConfig) || !buttonConfig.service) {
                continue;
            }

            const button = createButton(buttonConfig.icon || "mdi:radiobox-blank", buttonConfig.text);
            button.addEventListener("click", () => {
                const [domain, service] = buttonConfig.service.split(".");
                this.callService(domain, service, buttonConfig.service_data as Record<string, unknown> | undefined);
            });

            customFlexBox.appendChild(button);
        }

        // Adaptive menus
        const extras = document.createElement("div");
        extras.classList.add("vmc-controls");

        this.selectRow = document.createElement("div");
        this.selectRow.classList.add("vmc-select-row");
        this.selectRow.style.display = "none";
        extras.appendChild(this.selectRow);

        this.segmentsBlock = document.createElement("div");
        this.segmentsBlock.classList.add("vmc-segments");
        this.segmentsBlock.style.display = "none";

        const action = document.createElement("div");
        action.classList.add("vmc-seg-action");

        const dropdown = document.createElement("div");
        dropdown.classList.add("vmc-dropdown");

        this.roomToggle = document.createElement("button");
        this.roomToggle.type = "button";
        this.roomToggle.classList.add("vmc-dropdown-toggle");
        this.roomToggle.setAttribute("aria-haspopup", "true");
        this.roomToggle.setAttribute("aria-expanded", "false");

        this.roomPanel = document.createElement("div");
        this.roomPanel.classList.add("vmc-dropdown-panel");
        this.roomPanel.style.display = "none";

        this.roomToggle.addEventListener("click", () => {
            const open = this.roomPanel.style.display === "none";
            this.roomPanel.style.display = open ? "" : "none";
            this.roomToggle.setAttribute("aria-expanded", String(open));
        });

        dropdown.appendChild(this.roomToggle);
        dropdown.appendChild(this.roomPanel);

        // Wrap the rooms dropdown in a captioned field so its label lines up with the
        // other controls.
        const roomsField = document.createElement("div");
        roomsField.classList.add("vmc-field");
        roomsField.appendChild(this.createCaption("Rooms"));
        roomsField.appendChild(dropdown);
        action.appendChild(roomsField);

        const passesField = document.createElement("label");
        passesField.classList.add("vmc-field");
        passesField.appendChild(this.createCaption("Passes"));
        this.passesSelect = document.createElement("select");
        this.passesSelect.classList.add("vmc-select");

        for (let i = 1; i <= config.max_passes; i++) {
            const option = document.createElement("option");
            option.value = String(i);
            option.textContent = String(i);
            option.selected = i === this.segmentPasses;
            this.passesSelect.appendChild(option);
        }

        this.passesSelect.addEventListener("change", () => {
            this.segmentPasses = Number(this.passesSelect.value) || 1;
        });
        passesField.appendChild(this.passesSelect);
        action.appendChild(passesField);

        this.cleanButton = createButton("mdi:play-box-multiple", "Clean rooms");
        this.cleanButton.style.display = "none";
        this.cleanButton.addEventListener("click", () => {
            this.cleanSelectedSegments();
        });
        action.appendChild(this.cleanButton);

        this.segmentsBlock.appendChild(action);
        extras.appendChild(this.segmentsBlock);

        this.element.appendChild(controlFlexBox);
        this.element.appendChild(customFlexBox);

        if (config.show_controls_menu) {
            this.element.appendChild(extras);
        }

        this.refreshRoomSelection();
    }

    connect(): void {
        document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
    }

    disconnect(): void {
        document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
    }

    update(hass: HomeAssistant, vacuumEntity: HassEntity): void {
        this.hass = hass;

        if (vacuumEntity.state !== this.lastVacuumState) {
            this.lastVacuumState = vacuumEntity.state;

            for (const button of this.actionButtons) {
                button.element.style.display = shouldDisplayButton(button.name, vacuumEntity.state) ? "" : "none";
            }
        }

        if (!this.config.show_controls_menu) {
            return;
        }

        this.syncSelects(this.collectSelectEntities(hass));
        this.syncSegments(this.collectSegments(hass));
        this.refreshRoomSelection();
    }

    private createCaption(text: string): HTMLSpanElement {
        const caption = document.createElement("span");
        caption.classList.add("vmc-caption");
        caption.textContent = text;

        return caption;
    }

    private callService(domain: string, service: string, data?: Record<string, unknown>): void {
        this.hass?.callService(domain, service, data).catch((error) => {
            console.warn(`valetudo-map-card: ${domain}.${service} failed`, error);
        });
    }

    /**
     * Resolves the robot's `select.*` entity ids once instead of on every state
     * change. `hass.entities` (the entity registry) keeps a stable object identity
     * across state updates, unlike `hass.states`, so the O(all entities) scan runs
     * only when the registry itself changes.
     */
    private selectEntityIds(hass: HomeAssistant): string[] {
        const registry = (hass as unknown as { entities?: Record<string, unknown> }).entities;
        const source: Record<string, unknown> = registry ?? hass.states;

        if (source !== this.selectSource) {
            this.selectSource = source;

            const prefix = `select.${this.config.vacuum}_`;
            this.selectIds = Object.keys(source).filter((id) => id.startsWith(prefix)).sort();
        }

        return this.selectIds;
    }

    private collectSelectEntities(hass: HomeAssistant): SelectEntity[] {
        const prefix = `select.${this.config.vacuum}_`;
        const result: SelectEntity[] = [];

        for (const entity_id of this.selectEntityIds(hass)) {
            const state = hass.states[entity_id];
            const options = state?.attributes?.options;

            if (!Array.isArray(options) || options.length === 0) {
                continue;
            }

            const suffix = entity_id.slice(prefix.length);
            result.push({
                entity_id,
                state: state.state,
                options,
                label: SELECT_LABEL_OVERRIDES[suffix] ?? prettifyLabel(suffix)
            });
        }

        return result;
    }

    /**
     * Segments (rooms) as published live by Valetudo in `sensor.<robot>_map_segments`,
     * where each numeric attribute key maps a segment id to its name.
     */
    private collectSegments(hass: HomeAssistant): SegmentEntry[] {
        const state = hass.states[`sensor.${this.config.vacuum}_map_segments`];
        const segments: SegmentEntry[] = [];

        if (state?.attributes) {
            for (const key of Object.keys(state.attributes)) {
                if (/^\d+$/.test(key)) {
                    segments.push({ id: key, name: String(state.attributes[key]) });
                }
            }
        }

        return segments.sort((a, b) => Number(a.id) - Number(b.id));
    }

    private syncSelects(selects: SelectEntity[]): void {
        const shape = selects.map((select) => `${select.entity_id}:${select.options.join("/")}`).join("|");

        if (shape !== this.selectShape) {
            this.selectShape = shape;
            this.selectViews.clear();
            this.selectRow.replaceChildren();

            for (const select of selects) {
                const field = document.createElement("label");
                field.classList.add("vmc-field");
                field.appendChild(this.createCaption(select.label));

                const dropdown = document.createElement("select");
                dropdown.classList.add("vmc-select");

                for (const option of select.options) {
                    const optionElement = document.createElement("option");
                    optionElement.value = option;
                    optionElement.textContent = prettifyLabel(option);
                    dropdown.appendChild(optionElement);
                }

                dropdown.addEventListener("change", () => {
                    this.callService("select", "select_option", {
                        entity_id: select.entity_id,
                        option: dropdown.value
                    });
                });

                field.appendChild(dropdown);
                this.selectRow.appendChild(field);
                this.selectViews.set(select.entity_id, dropdown);
            }

            this.selectRow.style.display = selects.length > 0 ? "" : "none";
        }

        for (const select of selects) {
            const dropdown = this.selectViews.get(select.entity_id);
            if (!dropdown || dropdown.value === select.state) {
                continue;
            }

            // Never clobber a dropdown the user is currently interacting with.
            const root = dropdown.getRootNode() as Document | ShadowRoot;
            if (root.activeElement !== dropdown) {
                dropdown.value = select.state;
            }
        }
    }

    private syncSegments(segments: SegmentEntry[]): void {
        const shape = segments.map((segment) => `${segment.id}:${segment.name}`).join("|");

        if (shape === this.segmentShape) {
            return;
        }

        this.segmentShape = shape;
        this.roomPanel.replaceChildren();

        const known = new Set(segments.map((segment) => segment.id));
        for (const id of Array.from(this.selectedSegments)) {
            if (!known.has(id)) {
                this.selectedSegments.delete(id);
            }
        }

        for (const segment of segments) {
            const item = document.createElement("label");
            item.classList.add("vmc-dropdown-item");

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = this.selectedSegments.has(segment.id);
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    this.selectedSegments.add(segment.id);
                } else {
                    this.selectedSegments.delete(segment.id);
                }

                this.refreshRoomSelection();
            });

            const name = document.createElement("span");
            name.textContent = segment.name;

            item.appendChild(checkbox);
            item.appendChild(name);
            this.roomPanel.appendChild(item);
        }

        this.segmentsBlock.style.display = segments.length > 0 ? "" : "none";
        this.refreshRoomSelection();
    }

    private refreshRoomSelection(): void {
        const count = this.selectedSegments.size;
        const available = this.mqttIdentifier() !== undefined;

        this.roomToggle.textContent = count > 0 ? `${count} selected \u25be` : "Room \u25be";
        this.cleanButton.style.display = count > 0 ? "" : "none";

        if (available) {
            this.cleanButton.removeAttribute("disabled");
            this.cleanButton.removeAttribute("title");
        } else {
            this.cleanButton.setAttribute("disabled", "true");
            this.cleanButton.title = "Set mqtt_identifier in the card config to enable room cleaning";
        }
    }

    /**
     * Resolves the Valetudo MQTT identifier (topic segment) from the device registry,
     * so segment cleaning keeps working after swapping robots. Overridable via config.
     */
    private mqttIdentifier(): string | undefined {
        if (this.config.mqtt_identifier) {
            return this.config.mqtt_identifier;
        }

        const hass = this.hass as unknown as {
            entities?: Record<string, { device_id?: string }>;
            devices?: Record<string, { identifiers?: [string, string][] }>;
        } | null;

        const deviceId = hass?.entities?.[`vacuum.${this.config.vacuum}`]?.device_id;
        const device = deviceId ? hass?.devices?.[deviceId] : undefined;
        const identifier = device?.identifiers?.find((tuple) => Array.isArray(tuple) && tuple[0] === "mqtt");

        return identifier ? identifier[1] : undefined;
    }

    /**
     * Triggers segment cleanup with passes. Valetudo does not expose `send_command`,
     * and HA's native `clean_segments` cannot pass iterations, so publish the
     * authoritative REST-shaped payload straight to the capability topic.
     */
    private cleanSelectedSegments(): void {
        const ids = Array.from(this.selectedSegments);
        const identifier = this.mqttIdentifier();

        if (ids.length === 0 || identifier === undefined) {
            return;
        }

        this.callService("mqtt", "publish", {
            topic: `${this.config.mqtt_topic_prefix}/${identifier}/MapSegmentationCapability/clean/set`,
            payload: JSON.stringify({
                segment_ids: ids,
                iterations: this.segmentPasses,
                customOrder: true
            })
        });

        this.selectedSegments.clear();
        this.roomPanel.querySelectorAll("input[type=checkbox]").forEach((element) => {
            (element as HTMLInputElement).checked = false;
        });
        this.roomPanel.style.display = "none";
        this.roomToggle.setAttribute("aria-expanded", "false");
        this.refreshRoomSelection();
    }
}
