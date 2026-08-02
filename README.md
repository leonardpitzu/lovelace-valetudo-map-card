# Valetudo Map Card

[![CI](https://github.com/leonardpitzu/lovelace-valetudo-map-card/actions/workflows/ci.yml/badge.svg)](https://github.com/leonardpitzu/lovelace-valetudo-map-card/actions/workflows/ci.yml)

A [Home Assistant](https://www.home-assistant.io/) dashboard card that draws the
live map of a [Valetudo](https://valetudo.cloud/)-enabled robot vacuum - floor,
walls, segments, carpets, no-go areas, path and robot position - straight from the
map the robot publishes over MQTT.  No cloud, no vendor app.

A personal fork of [Hypfer/lovelace-valetudo-map-card](https://github.com/Hypfer/lovelace-valetudo-map-card),
kept for my own house.  It is not in the HACS default store and no support is
offered - fork it or install it by hand.  Anything that also reproduces upstream
belongs upstream.

## Features

| Feature | Description |
|---|---|
| Full map rendering | Floor, walls, segments, charger, robot, path, predicted path, goto target |
| Zones and restrictions | Currently cleaned zones, no-go areas, no-mop areas, virtual walls |
| Carpet detection | Firmware-detected carpets drawn as their own layer (Valetudo >= 2025.12) |
| Floor material texture | Per-segment wood/tile/carpet accent overlay (Valetudo >= 2026.01) |
| Adaptive control menus | Suction, water, operation mode and carpet-sensor dropdowns discovered from the robot's own `select` entities - nothing hardcoded |
| Status and battery badges | Floating over the map, upper left and upper right; battery falls back to `sensor.<vacuum>_battery_level` now that HA has dropped it from the vacuum entity |
| Per-room cleanup | Rooms read live from `sensor.<vacuum>_map_segments`, with a pass count, published as Valetudo's native MQTT payload |
| Single-blit renderer | Every pixel layer is composited into one `ImageData` at native map resolution and blitted once, instead of thousands of `fillRect` calls |
| Cached static layers | Floor, segments, walls, carpets and zones are fingerprinted and redrawn only when the map actually changes - a poll otherwise repaints just path and icons |
| Visibility gating | Polling stops when the card scrolls off-screen or the tab is hidden, and resumes immediately on return |
| Overlay mode | Transparent background for stacking on `picture-elements`, with crop, rotate, scale and padding |
| Custom buttons | Arbitrary service calls rendered as extra buttons |

## Installation

1. Copy `dist/valetudo-map-card.js` into your Home Assistant `config/www/` directory.
2. Add it under **Settings** -> **Dashboards** -> **⋮** -> **Resources** as
   `/local/valetudo-map-card.js`, type **JavaScript module**.
3. Hard-refresh the browser - the old bundle is cached aggressively.

HACS works too, as a custom repository of type **Dashboard** pointing at this repo,
but dashboards have to be under manual control first (**⋮** -> **Take control**).

## Configuration

### MQTT

This card makes use of [Valetudo's MQTT support](https://valetudo.cloud/pages/integrations/mqtt.html).
MQTT has to be configured in [Home Assistant](https://www.home-assistant.io/docs/mqtt/broker) and [Valetudo](https://valetudo.cloud/pages/integrations/home-assistant-integration.html).

### Custom card

To get the card up and running, head over to [https://hass.valetudo.cloud](https://hass.valetudo.cloud) for a short walkthrough.

## Usage examples

### Displaying with the vacuum entity

![image](https://user-images.githubusercontent.com/974410/198376172-db7a5441-0f5f-429c-8022-fc43d28446b9.png)

For easy control of the vacuum, consider using a vertical-stack with an entities card like so:

```
type: vertical-stack
cards:
  - vacuum: valetudo_thirstyserpentinestingray
    type: custom:valetudo-map-card
  - entities:
      - vacuum.valetudo_thirstyserpentinestingray
    type: entities
```

### Displaying as overlay

When combining this card with Home Assistant's `picture-elements`, you could use this to show your vacuum's position on top of your house. Make sure to set both `show_floor: false` and `background_color: transparent` in this card:

```
type: picture-elements
image: https://online.visual-paradigm.com/repository/images/e5728e49-09ce-4c95-b83c-482deee24386.png
elements:
  - type: 'custom:valetudo-map-card'
    vacuum: valetudo_thirstyserpentinestingray
    show_floor: false
    background_color: transparent
```

Then use map_scale and crop to make it fit.

## Options

| Name                                | Type    | Default                                                             | Description                                                                                                                                                                                                         
|-------------------------------------|---------|---------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
| type                                | string  | **Required**                                                        | `custom:valetudo-map-card`                                                                                                                                                                                          
| vacuum                              | string  | **Required**                                                        | Name of the vacuum in MQTT (without vacuum. prefix)                                                                                                                                                                 
| title                               | string  | Vacuum                                                              | Title to show in the card header                                                                                                                                                                                    
| show_map                            | boolean | true                                                                | Show the map                                                                                                                                                                                                        
| background_color                    | string  |                                                                     | Background color of the card                                                                                                                                                                                        
| floor_color                         | string  | '--valetudo-map-floor-color', '--secondary-background-color'        | Floor color                                                                                                                                                                                                         
| floor_opacity                       | number  | 1                                                                   | Floor opacity                                                                                                                                                                                                       
| wall_color                          | string  | '--valetudo-map-wall-color', '--accent-color'                       | Wall                                                                                                                                                                                                                
| wall_opacity                        | number  | 1                                                                   | Wall opacity                                                                                                                                                                                                        
| currently_cleaned_zone_color        | string  | '--valetudo-currently_cleaned_zone_color', '--secondary-text-color' | Color of zones selected for cleanup                                                                                                                                                                                 
| currently_cleaned_zone_opacity      | number  | 0.5                                                                 | Opacity of the currently cleaned zones                                                                                                                                                                              
| no_go_area_color                    | string  | '--valetudo-no-go-area-color', '--accent-color'                     | No go area color                                                                                                                                                                                                    
| no_go_area_opacity                  | number  | 0.5                                                                 | Opacity of the no go areas                                                                                                                                                                                          
| no_mop_area_color                   | string  | '--valetudo-no-mop-area-color', '--secondary-text-color'            | No mop area color                                                                                                                                                                                                   
| no_mop_area_opacity                 | number  | 0.5                                                                 | Opacity of the no mop areas                                                                                                                                                                                         
| virtual_wall_color                  | string  | '--valetudo-virtual-wall-color', '--accent-color'                   | Virtual wall color                                                                                                                                                                                                  
| virtual_wall_opacity                | number  | 1                                                                   | Virtual wall opacity                                                                                                                                                                                                
| virtual_wall_width                  | number  | 1                                                                   | Virtual wall line width                                                                                                                                                                                             
| path_color                          | string  | '--valetudo-map-path-color', '--primary-text-color'                 | Path color                                                                                                                                                                                                          
| path_opacity                        | number  | 1                                                                   | Path opacity                                                                                                                                                                                                        
| path_width                          | number  | 1                                                                   | Path line width                                                                                                                                                                                                     
| segment_colors                      | array   | '#19A1A1', '#7AC037', '#DF5618', '#F7C841'                          | Segment colors                                                                                                                                                                                                      
| segment_opacity                     | number  | 0.75                                                                | Segment opacity                                                                                                                                                                                                     
| show_floor                          | boolean | true                                                                | Draw the floor on the map                                                                                                                                                                                           
| show_dock                           | boolean | true                                                                | Draw the charging dock on the map                                                                                                                                                                                   
| show_vacuum                         | boolean | true                                                                | Draw the vacuum on the map                                                                                                                                                                                          
| show_walls                          | boolean | true                                                                | Draw walls on the map                                                                                                                                                                                               
| show_currently_cleaned_zones        | boolean | true                                                                | Show zones selected for zoned cleanup on the map                                                                                                                                                                    
| show_no_go_areas                    | boolean | true                                                                | Draw no go areas on the map                                                                                                                                                                                         
| show_no_mop_areas                   | boolean | true                                                                | Draw no mop areas on the map                                                                                                                                                                                        
| show_virtual_walls                  | boolean | true                                                                | Draw virtual walls on the map                                                                                                                                                                                       
| show_path                           | boolean | true                                                                | Draw the path the vacuum took                                                                                                                                                                                       
| show_currently_cleaned_zones_border | boolean | true                                                                | Draw a border around the currently cleaned zones                                                                                                                                                                    
| show_no_go_border                   | boolean | true                                                                | Draw a border around no go areas                                                                                                                                                                                    
| show_no_mop_border                  | boolean | true                                                                | Draw a border around no mop areas                                                                                                                                                                                   
| show_predicted_path                 | boolean | true                                                                | Draw the predicted path for the vacuum                                                                                                                                                                              
| show_goto_target                    | boolean | true                                                                | Draw the go to target                                                                                                                                                                                               
| show_segments                       | boolean | true                                                                | Draw the floor segments on the map                                                                                                                                                                                  
| show_carpets                        | boolean | true                                                                | Draw firmware-detected carpets on the map (Valetudo >= 2025.12)                                                                                                                                                     
| show_carpet_border                  | boolean | true                                                                | Draw a border around detected carpets                                                                                                                                                                               
| show_floor_material                 | boolean | true                                                                | Overlay a texture reflecting each segment's floor material (wood/tile/carpet, Valetudo >= 2026.01)                                                                                                                  
| carpet_opacity                      | number  | 0.4                                                                 | Opacity of detected carpets                                                                                                                                                                                         
| carpet_color                        | string  | '--valetudo-carpet-color', '--primary-color'                        | Detected carpet color                                                                                                                                                                                               
| floor_material_opacity              | number  | 0.5                                                                 | Opacity of the floor material texture overlay                                                                                                                                                                       
| floor_material_color                | string  | '--valetudo-floor-material-color', 'rgba(0, 0, 0, 0.5)'             | Accent color used to draw the floor material texture                                                                                                                                                                
| show_controls_menu                  | boolean | true                                                                | Show auto-generated control menus under the map (suction/water/mode selects + per-room cleanup)                                                                                                                     
| mqtt_topic_prefix                   | string  | 'valetudo'                                                          | Valetudo MQTT topic prefix, used to publish room-cleanup commands                                                                                                                                                   
| mqtt_identifier                     | string  | *(auto)*                                                            | Valetudo MQTT identifier; auto-derived from the device registry, override only if detection fails                                                                                                                   
| max_passes                          | number  | 3                                                                   | Maximum selectable passes (iterations) for per-room cleanup                                                                                                                                                         
| show_status                         | boolean | true                                                                | Show the status badge in the upper left corner of the map                                                                                                                                                           
| show_battery_level                  | boolean | true                                                                | Show the battery badge in the upper right corner of the map                                                                                                                                                         
| show_maintenance                    | boolean | true                                                                | Overlay a chip on the map for every consumable that ran out or dock component that is no longer ok, each with its reset button                                                                                       
| maintenance_threshold               | number  | 0                                                                   | Minutes of remaining life at or below which a consumable is reported as due                                                                                                                                         
| show_start_button                   | boolean | true                                                                | Show the start button for vacuum_entity                                                                                                                                                                             
| show_pause_button                   | boolean | true                                                                | Show the pause button for vacuum_entity                                                                                                                                                                             
| show_stop_button                    | boolean | true                                                                | Show the stop button for vacuum_entity                                                                                                                                                                              
| show_home_button                    | boolean | true                                                                | Show the home button for vacuum_entity                                                                                                                                                                              
| show_locate_button                  | boolean | true                                                                | Show the locate button for vacuum_entity                                                                                                                                                                            
| goto_target_icon                    | string  | mdi:pin                                                             | The icon to use for the go to target                                                                                                                                                                                
| goto_target_color                   | string  | 'blue'                                                              | The color to use for the go to target icon                                                                                                                                                                          
| dock_icon                           | string  | mdi:flash                                                           | The icon to use for the charging dock                                                                                                                                                                               
| dock_color                          | string  | 'green'                                                             | The color to use for the charging dock icon                                                                                                                                                                         
| vacuum_icon                         | string  | mdi:robot-vacuum                                                    | The icon to use for the vacuum                                                                                                                                                                                      
| vacuum_color                        | string  | '--primary-text-color'                                              | The color to use for the vacuum icon                                                                                                                                                                                
| map_scale                           | number  | 1                                                                   | Scale the map by this value                                                                                                                                                                                         
| icon_scale                          | number  | 1                                                                   | Scale the icons (vacuum & dock) by this value                                                                                                                                                                       
| rotate                              | number  | 0                                                                   | Value to rotate the map by (default is in deg, but a value like `2rad` is valid too)                                                                                                                                
| left_padding                        | number  | 0                                                                   | Value that moves the map `number` pixels from left to right                                                                                                                                                         
| crop                                | Object  | {top: 0, bottom: 0, left: 0, right: 0}                              | Crop the map                                                                                                                                                                                                        
| min_height                          | string  | 0                                                                   | The minimum height of the card the map is displayed in, regardless of the map's size itself. Suffix with 'w' if you want it to be times the width (ex: 0.5625w is equivalent to a picture card's 16x9 aspect_ratio) 
| custom_buttons                      | array   | []                                                                  | An array of custom buttons. Options detailed below.                                                                                                                                                                 
| debug                               | boolean | false                                                               | Log one line per static map render (canvas size, per-segment floor material, resolved accent colour) to the browser console                                                                                          

Colors can be any valid CSS value in the card config, like name (red), hex code (#FF0000), rgb(255,255,255), rgba(255,255,255,0.8)...

## Custom Buttons

Custom buttons can be added to this card when vacuum_entity is set. Each custom button supports the following options:

| Name         | Type   | Default            | Description                                              
|--------------|--------|--------------------|----------------------------------------------------------
| service      | string | **Required**       | The service to call when this button is pressed          
| service_data | Object | {}                 | Optional service data that will be passed to the service 
| icon         | string | mdi:radiobox-blank | The icon that will represent the custom button           
| text         | string | ""                 | Optional text to display next to the icon                

## Control menus

When `show_controls_menu` is enabled (default), the card renders adaptive control
menus **below the map**, built entirely from what Valetudo exposes for the robot -
nothing is hardcoded, so they follow you across house or robot changes:

- **Selects** - every `select.<vacuum>_*` entity (suction/fan, water/mop intensity,
  operation mode incl. *vacuum then mop*, carpet sensor mode, ...) is auto-discovered
  and rendered as a dropdown wired to `select.select_option`.
- **Per-room cleanup** - rooms are read live from `sensor.<vacuum>_map_segments`.
  Pick rooms from the compact checkbox dropdown (scales to any number of rooms),
  choose the number of passes, then **Clean rooms** (the button only appears once
  at least one room is selected, and the selection clears after it runs).

Room cleanup publishes the Valetudo-native payload
(`{segment_ids, iterations, customOrder}`) to
`<mqtt_topic_prefix>/<mqtt_identifier>/MapSegmentationCapability/clean/set` via the
`mqtt.publish` service - the only path that supports passes (HA's native
`clean_segments` cannot). This requires the
[MQTT integration](https://www.home-assistant.io/integrations/mqtt/). The
identifier is auto-derived from the device registry; set `mqtt_identifier`
manually only if that detection fails.

## Maintenance alerts

With `show_maintenance` enabled (default), the card overlays a chip on the map for
each maintenance action the robot is actually asking for - nothing is shown while
everything is fine:

- **Consumables** - every `button.<vacuum>_reset_<slug>_consumable` entity is paired
  with its remaining-life sensor `sensor.<vacuum>_<slug>`. When that sensor drops to
  `maintenance_threshold` minutes or below, a chip appears (*Change filter*, *Clean
  sensors*, *Clean wheels*, ...) with a reset button that presses the matching reset
  entity; the chip disappears as soon as the counter is back up.
- **Dock components** - `sensor.<vacuum>_<slug>_dock_component` entities in any state
  other than `ok` show an alert-only chip (*Change dust bag*, *Empty waste water*,
  ...), since Valetudo exposes no reset for them.

Both lists are discovered from the robot's own entities, so a vacuum with a different
set of consumables works with no configuration. Slugs Valetudo does not currently
ship fall back to the prettified entity suffix and a generic icon.

## Development

```bash
npm install
npm run lint        # ESLint, flat config
npm run typecheck   # tsc --noEmit, strict
npm run build       # rollup -> dist/valetudo-map-card.js
```

`dist/valetudo-map-card.js` is committed because it is the artifact HACS serves, so
a source change only ships once the bundle is rebuilt and committed alongside it.
The console banner carries the version, build timestamp and parent commit - a newer
stamp after an update is what proves the fresh bundle loaded instead of a cached one.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

