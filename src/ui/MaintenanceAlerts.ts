import type { HomeAssistant } from "custom-card-helpers";

import { prettifyLabel } from "../lib/text";
import { Configuration, HaIconElement } from "../lib/types";

interface Alert {
    key: string;
    label: string;
    icon: string;
    /** `button.*` entity that clears the alert, absent for read-only dock components. */
    resetEntityId?: string;
}

interface Preset {
    label: string;
    icon: string;
}

// Action-phrased labels for the consumables and dock components Valetudo currently
// ships. Anything else falls back to the prettified entity suffix, which keeps the
// alerts working on robots exposing a different set.
const CONSUMABLE_PRESETS: Record<string, Preset> = {
    main_brush: { label: "Clean main brush", icon: "mdi:broom" },
    side_brush: { label: "Clean side brush", icon: "mdi:broom" },
    right_brush: { label: "Clean side brush", icon: "mdi:broom" },
    left_brush: { label: "Clean side brush", icon: "mdi:broom" },
    main_filter: { label: "Change filter", icon: "mdi:air-filter" },
    filter: { label: "Change filter", icon: "mdi:air-filter" },
    sensor_cleaning: { label: "Clean sensors", icon: "mdi:eye-outline" },
    wheel_cleaning: { label: "Clean wheels", icon: "mdi:rotate-orbit" },
    mop: { label: "Change mop", icon: "mdi:water-outline" }
};

const DOCK_PRESETS: Record<string, Preset> = {
    dustbag: { label: "Change dust bag", icon: "mdi:delete-outline" },
    freshwater: { label: "Refill fresh water", icon: "mdi:water-outline" },
    wastewater: { label: "Empty waste water", icon: "mdi:water-off-outline" },
    detergent: { label: "Refill detergent", icon: "mdi:bottle-tonic-outline" }
};

const UNKNOWN_STATES = new Set(["unknown", "unavailable", ""]);

/**
 * The maintenance chips overlaid on the map: one per consumable that ran out or dock
 * component that is no longer `ok`, each carrying the reset button that clears it.
 *
 * Everything is derived from the entities the robot exposes - a reset button is
 * `button.<vacuum>_reset_<slug>_consumable`, and its remaining life is the paired
 * `sensor.<vacuum>_<slug>` - so a robot with a different set of consumables needs no
 * configuration.
 */
export class MaintenanceAlerts {
    readonly element: HTMLDivElement;

    private hass: HomeAssistant | null = null;

    private registrySource: unknown = null;
    private resetButtonIds: string[] = [];
    private dockSensorIds: string[] = [];
    private shape = "";

    constructor(private readonly config: Configuration) {
        this.element = document.createElement("div");
        this.element.classList.add("vmc-maintenance");
        this.element.style.display = "none";
    }

    hide(): void {
        this.element.style.display = "none";
    }

    update(hass: HomeAssistant): void {
        this.hass = hass;

        if (!this.config.show_maintenance) {
            this.hide();

            return;
        }

        this.discover(hass);
        this.render([...this.dueConsumables(hass), ...this.failingDockComponents(hass)]);
    }

    /**
     * Resolves the maintenance entity ids once instead of on every state change.
     * `hass.entities` (the entity registry) keeps a stable object identity across
     * state updates, unlike `hass.states`, so the O(all entities) scan runs only when
     * the registry itself changes.
     */
    private discover(hass: HomeAssistant): void {
        const registry = (hass as unknown as { entities?: Record<string, unknown> }).entities;
        const source: Record<string, unknown> = registry ?? hass.states;

        if (source === this.registrySource) {
            return;
        }

        this.registrySource = source;

        const buttonPrefix = `button.${this.config.vacuum}_reset_`;
        const sensorPrefix = `sensor.${this.config.vacuum}_`;
        const ids = Object.keys(source).sort();

        this.resetButtonIds = ids.filter((id) => id.startsWith(buttonPrefix) && id.endsWith("_consumable"));
        this.dockSensorIds = ids.filter((id) => id.startsWith(sensorPrefix) && id.endsWith("_dock_component"));
    }

    private dueConsumables(hass: HomeAssistant): Alert[] {
        const prefix = `button.${this.config.vacuum}_reset_`;
        const alerts: Alert[] = [];

        for (const entity_id of this.resetButtonIds) {
            const slug = entity_id.slice(prefix.length, -"_consumable".length);
            const remaining = Number(hass.states[`sensor.${this.config.vacuum}_${slug}`]?.state);

            // A missing or non-numeric sensor means the remaining life is unknown, which
            // is not the same as depleted - staying quiet beats crying wolf.
            if (!Number.isFinite(remaining) || remaining > this.config.maintenance_threshold) {
                continue;
            }

            const preset = CONSUMABLE_PRESETS[slug];

            alerts.push({
                key: entity_id,
                label: preset?.label ?? prettifyLabel(slug),
                icon: preset?.icon ?? "mdi:progress-wrench",
                resetEntityId: entity_id
            });
        }

        return alerts;
    }

    private failingDockComponents(hass: HomeAssistant): Alert[] {
        const prefix = `sensor.${this.config.vacuum}_`;
        const alerts: Alert[] = [];

        for (const entity_id of this.dockSensorIds) {
            const state = hass.states[entity_id]?.state?.toLowerCase() ?? "";

            if (state === "ok" || UNKNOWN_STATES.has(state)) {
                continue;
            }

            const slug = entity_id.slice(prefix.length, -"_dock_component".length);
            const preset = DOCK_PRESETS[slug];

            alerts.push({
                key: entity_id,
                label: preset?.label ?? `${prettifyLabel(slug)}: ${prettifyLabel(state)}`,
                icon: preset?.icon ?? "mdi:alert-outline"
            });
        }

        return alerts;
    }

    private render(alerts: Alert[]): void {
        const shape = alerts.map((alert) => alert.key).join("|");

        this.element.style.display = alerts.length > 0 ? "" : "none";

        if (shape === this.shape) {
            return;
        }

        this.shape = shape;
        this.element.replaceChildren(...alerts.map((alert) => this.createChip(alert)));
    }

    private createChip(alert: Alert): HTMLDivElement {
        const chip = document.createElement("div");
        chip.classList.add("vmc-badge", "vmc-badge-maintenance");

        const icon: HaIconElement = document.createElement("ha-icon");
        icon.icon = alert.icon;
        chip.appendChild(icon);

        const label = document.createElement("span");
        label.textContent = alert.label;
        chip.appendChild(label);

        if (alert.resetEntityId) {
            const reset = document.createElement("button");
            reset.type = "button";
            reset.classList.add("vmc-reset");
            reset.title = `Mark done and reset ${alert.label.toLowerCase()}`;
            reset.setAttribute("aria-label", reset.title);

            const resetIcon: HaIconElement = document.createElement("ha-icon");
            resetIcon.icon = "mdi:restore";
            reset.appendChild(resetIcon);

            reset.addEventListener("click", () => {
                this.hass?.callService("button", "press", { entity_id: alert.resetEntityId }).catch((error) => {
                    console.warn(`valetudo-map-card: button.press ${alert.resetEntityId} failed`, error);
                });
            });

            chip.appendChild(reset);
        }

        return chip;
    }
}
