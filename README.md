# Digital Twin Ocean — A Graphical Interface to the PMAR engine

A lightweight web application for Lagrangian particle tracking in the ocean. It combines an OGC API Processing backend with an interactive map frontend to simulate how substances and organisms disperse under real ocean currents, and to compute particle density maps with the PMAR engine.

---

## Architecture

```
demo_5/
├── processes/
│   ├── OpenDriftProcess.py              # OGC API process: runs OpenDrift with CMEMS data
│   ├── PMARProcess.py                   # OGC API process: PMAR density analysis on a precomputed scenario
│   ├── PrecomputeProcess.py             # OGC API process: precomputes and stores a trajectory NC file
│   ├── ScenarioStatusProcess.py         # OGC API process: lists saved scenarios + Tools4MSP areas
│   ├── WindfarmsProcess.py              # OGC API process: EMODnet wind farm preview (bbox query)
│   ├── OffshoreInstallationsProcess.py  # OGC API process: EMODnet offshore installations preview
│   └── logging_utils.py                 # Shared log handler with line-count rotation
├── frontend/
│   └── src/                             # React + Vite SPA
├── cache/
│   ├── *.nc                             # Downloaded CMEMS NetCDF files (auto-managed)
│   └── emodnet/                         # EMODnet WFS responses (pickle, 7-day TTL)
├── scenarios/
│   ├── custom_<id>.nc                   # Precomputed trajectory files
│   ├── custom_<id>.json                 # Scenario metadata (params, shapefile path, label)
│   └── shapefiles/
│       ├── custom_<id>.shp              # Seeding area shapefiles for custom scenarios
│       └── t4msp_<area_id>.shp         # Cached Tools4MSP area geometries
├── out/                                 # Temporary simulation outputs (cleaned on startup)
├── logs/
│   ├── pygeoapi/pygeoapi.log
│   ├── opendrift/opendrift.log
│   ├── pmar/pmar.log
│   ├── pmar/precompute_process.log
│   ├── pmar/scenario_status.log
│   ├── windfarms/windfarms.log
│   └── offshore_installations/
├── pygeoapi-config.yml
└── start.sh
```

**Backend:** [pygeoapi](https://pygeoapi.io) (port 5001) exposes all processes via the OGC API - Processes standard.

**Frontend:** React 18 + Vite SPA with react-leaflet. Served statically; communicates with the backend via `POST /processes/<process>/execution`.

---

## Requirements

- Python 3.12 with a virtual environment (`venv/`)
- pygeoapi (installed from source in `venv/pygeoapi/`)
- OpenDrift and its dependencies
- PMAR library — install from private repo: `pip install git+https://<token>@github.com/sofbo/pmar.git`
- `copernicusmarine` Python client (requires a free Copernicus Marine account)
- `rasterio` (for GeoTIFF export)
- `networkx` — required by the PMAR library
- `cartopy` — required by `pmar.utils.make_grid`
- Node.js ≥ 18 (for frontend development only)

---

## Getting started

### Backend

```bash
source venv/bin/activate
./start.sh
```

`start.sh` removes leftover temporary NetCDF files from `out/`, regenerates the OpenAPI spec from `pygeoapi-config.yml`, and starts the server on port 5001.

### Frontend (development)

```bash
cd frontend
npm install
npm run dev
```

Vite proxies API requests to `http://localhost:5001` automatically.

### Frontend (production build)

```bash
cd frontend
npm run build
```

The built files go to `frontend/dist/` and are served as static assets by pygeoapi.

---

## OpenDrift process

**Endpoint:** `POST /processes/opendrift/execution`

### Drift models

| Key | Description | Wind forcing |
|---|---|---|
| `OceanDrift` | Passive tracer — surface currents only | No |
| `PlastDrift` | Plastic debris — Stokes drift + wind drag | Yes |
| `LarvalFish` | Fish larvae/eggs — vertical buoyancy + turbulent mixing | No |
| `OpenOil` | Hydrocarbons — evaporation, emulsification, dispersion | Yes |

### Inputs

| Parameter | Description | Default |
|---|---|---|
| `seeding_type` | `circle` or `rectangle` | `circle` |
| `lon`, `lat`, `radius` | Centre and radius (m) for circle seeding | — |
| `lon_min/max`, `lat_min/max` | Bounding box for rectangle seeding | — |
| `model` | Drift model key (see table above) | `OceanDrift` |
| `start_time` | ISO 8601 datetime | 3 days ago |
| `number` | Number of particles (max 10 000) | 100 |
| `duration_hours` | Simulation duration in hours (max 720) | 24 |

### Output

JSON with `times` (ISO timestamps array), `steps` (per-timestep particle positions `[lon, lat]`), and `model` name.

---

## PMAR workflow

The PMAR panel uses a two-step workflow split across two tabs.

### Tab 1 — Simulation

The user defines a seeding area and simulation parameters, then triggers a **precomputation** that runs OpenDrift and saves the trajectory to disk. The result is a named scenario that can be reused for multiple analyses without re-running the simulation.

**Seeding area options:**

| Mode | Description |
|---|---|
| Draw | Circle or rectangle drawn interactively on the map |
| Shapefile | ZIP archive containing `.shp`, `.shx`, `.dbf` files |
| Pre-defined area | Geographic area from the [Tools4MSP API](https://api.tools4msp.eu/api/v2/domainareas/) |

**Simulation parameters:**

| Parameter | Range | Default |
|---|---|---|
| Pressure type | `generic`, `plastic`, `oil` | `generic` |
| Start date | ISO 8601 date | 10 days ago |
| Duration | 1–730 days | 30 |
| Particles | 10–100 000 | 1 000 |
| Time step | 1, 3, 6, 12, 24 h | 1 h |

A live estimate of the temporary NetCDF file size is shown below the form, colour-coded by severity (normal / caution >500 MB / warning >2 GB).

Once submitted, the precomputation runs asynchronously. The job is polled every 5 seconds and the new scenario appears automatically in the list when ready.

Existing simulations are listed in a dropdown at the top of the tab and carry over to the Analysis tab.

### Tab 2 — Analysis

Once a simulation is selected from the Simulation tab, the Analysis tab allows running the PMAR density analysis on it with different configurations without re-running the OpenDrift simulation.

**Analysis parameters:**

| Parameter | Options | Default |
|---|---|---|
| Source layer | `Uniform`, `Wind farms`, `Offshore installations`, `Custom GeoTIFF` | `Uniform` |
| Grid resolution | 0.001°, 0.01°, 0.05°, 0.1°, 0.2°, 0.5°, 1.0° | 0.1° |

Running the analysis produces a particle density heatmap overlaid on the map.

---

## Precompute process

**Endpoint:** `POST /processes/precompute/execution`  
**Execution mode:** asynchronous (`Prefer: respond-async`)

Runs an OpenDrift simulation, saves the trajectory as `scenarios/custom_<id>.nc`, and writes metadata to `scenarios/custom_<id>.json`.

### Inputs

| Parameter | Description |
|---|---|
| `geojson` | GeoJSON string of the seeding area |
| `shapefile_b64` | Base64-encoded shapefile ZIP (alternative to GeoJSON) |
| `t4msp_area_id` | Integer ID of a Tools4MSP domain area (alternative to GeoJSON) |
| `pressure` | `generic`, `plastic`, or `oil` |
| `start_time` | ISO 8601 datetime |
| `duration_days` | Duration in days |
| `pnum` | Number of particles (max 100 000) |
| `time_step_hours` | Time step in hours (1–24) |
| `label` | Human-readable name for the scenario |

Exactly one of `geojson`, `shapefile_b64`, or `t4msp_area_id` must be provided.

### Output

```json
{ "scenario_id": "custom_a1b2c3d4", "status": "done", "nc_filename": "custom_a1b2c3d4.nc" }
```

---

## Scenario status process

**Endpoint:** `POST /processes/scenario_status/execution`

Returns the list of all saved custom scenarios and the available Tools4MSP geographic areas.

### Output

```json
{
  "scenarios": {
    "custom_a1b2c3d4": {
      "computed": true,
      "nc_size_mb": 142.5,
      "label_it": "Plastica — 2026-04-01",
      "label_en": "Plastica — 2026-04-01",
      "pressure": "plastic",
      "pnum": 5000,
      "duration_days": 30,
      "time_step_hours": 1,
      "start_time": "2026-04-01",
      "res": 0.1,
      "source": "custom"
    }
  },
  "t4msp_areas": [
    { "id": 12, "label": "Adriatic Sea" },
    { "id": 7,  "label": "North Sea" }
  ]
}
```

---

## PMAR process

**Endpoint:** `POST /processes/pmar/execution`

Runs PMAR density analysis on a precomputed scenario trajectory.

### Inputs

| Parameter | Description | Default |
|---|---|---|
| `scenario_id` | ID of a precomputed scenario (`custom_<id>`) | — |
| `res` | Grid resolution in degrees | 0.1 |
| `use_source` | Weighting layer: `none`, `windfarms`, `offshore_installations`, `geotiff` | `none` |
| `geotiff_b64` | Base64-encoded GeoTIFF for custom weighting (when `use_source=geotiff`) | — |
| `geotiff_url` | URL of a GeoTIFF to download (when `use_source=geotiff`, ignored if `geotiff_b64` given) | — |

### Output

```json
{
  "type": "raster",
  "raster_values": [[...]],
  "raster_lon_min": 12.1,
  "raster_lat_min": 43.5,
  "raster_res": 0.1,
  "raster_nx": 80,
  "raster_ny": 50,
  "vmin": 1.2,
  "vmax": 847.0,
  "colorbar_b64": "...",
  "geotiff_b64": "...",
  "bounds": [[lat_min, lon_min], [lat_max, lon_max]],
  "pressure": "generic|plastic|oil",
  "label_it": "...",
  "label_en": "...",
  "use_source": "none|windfarms|offshore_installations|geotiff",
  "use_weighted": false,
  "start_time": "YYYYMMDD",
  "end_time": "YYYYMMDD",
  "pnum": 1000,
  "scenario_id": "custom_a1b2c3d4",
  "seeding_geojson": {...},
  "windfarms_geojson": {...},
  "offshore_geojson": {...}
}
```

`seeding_geojson` is always included and contains the simplified seeding area polygon displayed on the map. `windfarms_geojson` and `offshore_geojson` are included only when the respective source layer was used.

### Heatmap rendering

- Colormap `Spectral_r` with `LogNorm`
- vmin = 2nd percentile of positive values, vmax = 98th percentile (auto-adaptive per run)
- Transparent cells for value ≤ 0 or NaN
- Rendered as a canvas overlay in the browser (not a server-side PNG)

### GeoTIFF structure

Single float32 band. Cell value = raw particle passage counts (or weighted density). `nodata = 0.0`, CRS EPSG:4326, LZW compression.

### Download filename format

```
pmar_<pressure>_<YYYYMMDD>-<YYYYMMDD>_p<pnum>[_<use_source>].tif
```

### PROJ note

`pmar.py` hardcodes `PROJ_LIB` to a conda path at import time, corrupting PROJ for pyproj and rasterio. PMARProcess.py removes both `PROJ_LIB` and `PROJ_DATA` from the environment after importing PMAR, allowing each library to find its own data directory.

---

## Anthropogenic layers

Both layers query [EMODnet Human Activities WFS](https://ows.emodnet-humanactivities.eu/wfs) and cache results as pickle files (7-day TTL) in `cache/emodnet/`.

| `use_source` | Data source | Coverage note |
|---|---|---|
| `windfarms` | `emodnet:windfarmspoly` (polygons) | North Sea, Atlantic, Baltic |
| `offshore_installations` | `emodnet:platforms` (points) | European waters |

When a layer is active, its features are rasterized onto the simulation grid and used as PMAR weights. Features are returned in the response as GeoJSON for display on the map.

### Preview processes

Two lightweight processes allow the frontend to preview layer coverage before running an analysis:

- `POST /processes/windfarms/execution`
- `POST /processes/offshore_installations/execution`

Both accept `lon_min`, `lat_min`, `lon_max`, `lat_max` as inputs.

---

## CMEMS data

Ocean currents are downloaded automatically from the Copernicus Marine Service:

- **Primary:** `cmems_mod_med_phy-cur_anfc_0.042deg_PT1H-m` (Mediterranean, hourly)
- **Fallback:** `cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m` (global, daily)

Wind data (for `PlastDrift`, `OpenOil`, and PMAR plastic/oil pressure):

- **Primary:** `cmems_obs-wind_med_phy_nrt_l4_0.125deg_PT1H` (Mediterranean)
- **Fallback:** `cmems_obs-wind_glo_phy_nrt_l4_0.125deg_PT1H` (global)

Files are cached in `cache/` keyed on seeding coordinates, start date, and duration.

---

## Frontend features

### OpenDrift tab

- Interactive seeding: draw a **circle** or **rectangle** on the map
- Animated particle trajectories with play/pause, time slider, and speed control
- Stranded particles highlighted in red
- Toggle seeding area overlay

### PMAR tab — Simulation

- Define a seeding area by drawing on the map, uploading a shapefile, or selecting a Tools4MSP pre-defined area
- Set simulation parameters (pressure type, start date, duration, particles, time step)
- Live NetCDF size estimate, colour-coded by severity
- Precompute button runs the simulation asynchronously; status is polled automatically
- Saved simulations listed in a dropdown at the top of the tab

### PMAR tab — Analysis

- Select a saved simulation from the dropdown in the Simulation tab
- Choose an anthropogenic weighting layer and grid resolution
- After analysis, a **controls bar** appears at the bottom with:
  - Toggle heatmap overlay
  - Toggle seeding area polygon (returned from the backend with each result)
  - Toggle wind farms layer
  - Toggle offshore installations layer
  - Download raster as GeoTIFF

### Map

- **Light / dark theme toggle** (top-right corner): switches between CartoDB Light and Dark basemaps; the panel and controls bar follow the same theme
- IT / EN language switch

---

## Logging

Each process writes to its own subdirectory under `logs/`. All loggers use `LineRotatingFileHandler` (`processes/logging_utils.py`): the log file is truncated when it exceeds 1000 lines.

| File | Content |
|---|---|
| `logs/pygeoapi/pygeoapi.log` | pygeoapi server logs (WARNING level) |
| `logs/opendrift/opendrift.log` | OpenDrift simulation logs |
| `logs/pmar/pmar.log` | PMAR analysis logs |
| `logs/pmar/precompute_process.log` | Precomputation logs (progress every 60 s) |
| `logs/pmar/scenario_status.log` | Scenario status query logs |
| `logs/windfarms/windfarms.log` | Wind farms WFS logs |
| `logs/offshore_installations/offshore_installations.log` | Offshore installations WFS logs |
