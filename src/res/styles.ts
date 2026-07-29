export const CARD_STYLES = `
.flex-box {
  display: flex;
  justify-content: space-evenly;
  flex-wrap: wrap;
}
paper-button {
  cursor: pointer;
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 8px;
}
paper-button[disabled] {
  opacity: 0.5;
  cursor: default;
}
ha-icon {
  width: 24px;
  height: 24px;
}
.vmc-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 8px 12px;
}
.vmc-select-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  justify-content: space-evenly;
}
.vmc-field {
  display: flex;
  flex-direction: column;
  font-size: 0.8em;
}
.vmc-caption {
  opacity: 0.7;
  margin-bottom: 2px;
}
.vmc-select {
  box-sizing: border-box;
  height: 28px;
  background: var(--card-background-color);
  color: var(--primary-text-color);
  border: 1px solid var(--divider-color);
  border-radius: 4px;
  padding: 4px;
}
.vmc-segments {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.vmc-dropdown {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.vmc-dropdown-toggle {
  box-sizing: border-box;
  height: 28px;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  font: inherit;
  padding: 4px 8px;
  border: 1px solid var(--divider-color);
  border-radius: 4px;
  background: var(--card-background-color);
  color: var(--primary-text-color);
}
.vmc-dropdown-panel {
  margin-top: 4px;
  width: 100%;
  max-width: 320px;
  max-height: 40vh;
  overflow-y: auto;
  border: 1px solid var(--divider-color);
  border-radius: 4px;
  background: var(--card-background-color);
}
.vmc-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
}
.vmc-dropdown-item:hover {
  background: var(--secondary-background-color);
}
.vmc-seg-action {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
.vmc-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  pointer-events: none;
  z-index: 10;
}
.vmc-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 45%;
  padding: 3px 10px 3px 6px;
  border-radius: 999px;
  font-size: 0.8em;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--primary-text-color);
  background: rgba(var(--rgb-card-background-color, 255, 255, 255), 0.72);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.vmc-badge-battery {
  margin-left: auto;
}
.vmc-badge ha-icon {
  flex: none;
  width: 18px;
  height: 18px;
  --mdc-icon-size: 18px;
}
`;

export const MAP_CONTAINER_STYLE_TEMPLATE = (
    containerHeight: number,
    verticalPadding: number,
    leftPadding: number,
    cardWidth: number,
    cardHeight: number,
    rotate: string,
    cropTop: number,
    cropLeft: number
): string => `
#lovelaceValetudoMapCard {
  position: relative;
  height: ${containerHeight}px;
  padding-top: ${verticalPadding}px;
  padding-bottom: ${verticalPadding}px;
  padding-left: ${leftPadding}px;
  overflow: hidden;
}
#lovelaceValetudoCard {
  position: relative;
  margin-left: auto;
  margin-right: auto;
  width: ${cardWidth}px;
  height: ${cardHeight}px;
  transform: rotate(${rotate});
  top: -${cropTop}px;
  left: -${cropLeft}px;
}
#lovelaceValetudoCard div {
  position: absolute;
  background-color: transparent;
  width: 100%;
  height: 100%;
}
`;
