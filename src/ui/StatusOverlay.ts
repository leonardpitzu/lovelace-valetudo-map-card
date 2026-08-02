import type { HomeAssistant } from "custom-card-helpers";
import type { HassEntity } from "home-assistant-js-websocket";

import { Configuration, HaIconElement } from "../lib/types";
import { MaintenanceAlerts } from "./MaintenanceAlerts";

const STATE_ICONS: Record<string, string> = {
    cleaning: "mdi:robot-vacuum",
    returning: "mdi:home-import-outline",
    docked: "mdi:power-plug",
    idle: "mdi:sleep",
    paused: "mdi:pause",
    error: "mdi:alert-circle",
    unavailable: "mdi:help-circle-outline"
};

/**
 * Home Assistant dropped `battery_level` / `battery_icon` from the vacuum entity,
 * so the icon has to be derived from the level itself. Rounded to the nearest ten
 * to match the icon set, with the "empty" and "full" ends pinned to the names MDI
 * actually ships.
 */
function batteryIconFor(level: number, charging: boolean): string {
    if (level >= 95) {
        return charging ? "mdi:battery-charging-100" : "mdi:battery";
    }

    const step = Math.max(10, Math.round(level / 10) * 10);

    return charging ? `mdi:battery-charging-${step}` : `mdi:battery-${step}`;
}

/**
 * Reads the battery level from wherever it currently lives: the vacuum entity for
 * older Home Assistant releases, otherwise the dedicated sensor the Valetudo
 * integration exposes.
 */
function batteryLevelFor(hass: HomeAssistant, config: Configuration, vacuumEntity: HassEntity): number | undefined {
    const fromAttribute = vacuumEntity.attributes?.battery_level;
    if (typeof fromAttribute === "number" && Number.isFinite(fromAttribute)) {
        return fromAttribute;
    }

    const sensor = hass.states[`sensor.${config.vacuum}_battery_level`];
    const fromSensor = sensor ? Number(sensor.state) : Number.NaN;

    return Number.isFinite(fromSensor) ? fromSensor : undefined;
}

function createBadge(className: string): { element: HTMLDivElement; icon: HaIconElement; text: HTMLSpanElement } {
    const element = document.createElement("div");
    element.classList.add("vmc-badge", className);
    element.style.display = "none";

    const icon = document.createElement("ha-icon");
    const text = document.createElement("span");

    element.appendChild(icon);
    element.appendChild(text);

    return { element, icon, text };
}

/**
 * The badges floating over the map: robot status top left, battery top right, and a
 * maintenance chip per consumable or dock component that needs attention below them.
 *
 * Lives in the map container but outside the rotated map element, so `rotate` tilts
 * the floor plan without tilting the readouts. Patched in place like the control
 * panel, since it updates on every Home Assistant state change.
 */
export class StatusOverlay {
    readonly element: HTMLDivElement;

    private readonly status = createBadge("vmc-badge-status");
    private readonly battery = createBadge("vmc-badge-battery");
    private readonly maintenance: MaintenanceAlerts;

    constructor(private readonly config: Configuration) {
        this.element = document.createElement("div");
        this.element.classList.add("vmc-overlay");

        const badges = document.createElement("div");
        badges.classList.add("vmc-badge-row");
        badges.appendChild(this.status.element);
        badges.appendChild(this.battery.element);
        this.element.appendChild(badges);

        this.maintenance = new MaintenanceAlerts(config);
        this.element.appendChild(this.maintenance.element);
    }

    hide(): void {
        this.status.element.style.display = "none";
        this.battery.element.style.display = "none";
        this.maintenance.hide();
    }

    update(hass: HomeAssistant, vacuumEntity: HassEntity): void {
        const state = vacuumEntity.state;

        this.maintenance.update(hass);

        if (this.config.show_status && state) {
            const label = hass.localize?.(`component.vacuum.entity_component._.state.${state}`);

            this.status.icon.icon = STATE_ICONS[state] ?? "mdi:robot-vacuum";
            this.status.text.textContent = label || state[0].toUpperCase() + state.substring(1);
            this.status.element.style.display = "";
        } else {
            this.status.element.style.display = "none";
        }

        const level = this.config.show_battery_level ? batteryLevelFor(hass, this.config, vacuumEntity) : undefined;

        if (level === undefined) {
            this.battery.element.style.display = "none";

            return;
        }

        const rounded = Math.round(level);
        const icon = vacuumEntity.attributes?.battery_icon ?? batteryIconFor(rounded, state === "docked" && rounded < 100);

        this.battery.icon.icon = icon;
        this.battery.text.textContent = `${rounded}%`;
        this.battery.element.style.display = "";
    }
}
