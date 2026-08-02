/** Turns "vacuum_then_mop" / "carpet_sensor_mode" into "Vacuum then mop" / "Carpet sensor mode". */
export function prettifyLabel(value: string): string {
    return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
