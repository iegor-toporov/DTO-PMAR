# Digital Twin Ocean — A Graphical Interface to the PMAR engine

A lightweight web application for Lagrangian particle tracking in the ocean. It combines an OGC API Processing backend with an interactive map frontend to simulate how substances and organisms disperse under real ocean currents, and to compute particle density maps with the PMAR engine.

---

## Architecture

```
demo_5/
├── processes/
│   ├── OpenDriftProcess.py              # OGC API process: runs OpenDrift with CMEMS data
│   ├── PMARProcess.py                   # OGC API process: runs PMAR with CMEMS data
│   ├── WindfarmsProcess.py              # OGC API process: EMODnet wind farm preview (bbox query)
│   ├── OffshoreInstallationsProcess.py  # OGC API process: EMODnet offshore installations preview
│   └── logging_utils.py                 # Shared log handler with line-count rotation
├── frontend/
│   └── src/                             # React + Vite SPA
├── cache/
│   ├── *.nc                             # Downloaded CMEMS NetCDF files (auto-managed)
│   └── emodnet/                         # EMODnet WFS responses (pickle, 7-day TTL)
├── out/                                 # Temporary simulation outputs (cleaned on startup)
├── logs/
│   ├── pygeoapi/pygeoapi.log            # pygeoapi server logs (WARNING+)
│   ├── opendrift/opendrift.log          # OpenDrift simulation logs
│   ├── pmar/pmar.log                    # PMAR process logs
│   ├── windfarms/windfarms.log          # Wind farms WFS logs
│   └── offshore_installations/          # Offshore installations WFS logs
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
- `networkx` (`pip install networkx`) — required by the new PMAR library
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

## PMAR process

**Endpoint:** `POST /processes/pmar/execution`

Runs an OpenDrift simulation over the seeded area, then computes a particle density map using the PMAR engine.

### Inputs

| Parameter | Description | Default |
|---|---|---|
| `geojson` | GeoJSON string of the seeding area (drawn on map) | — |
| `shapefile_b64` | Base64-encoded ZIP of a shapefile (alternative to GeoJSON) | — |
| `pressure` | Particle type: `generic`, `plastic`, or `oil` | `generic` |
| `start_time` | ISO 8601 datetime | 10 days ago |
| `duration_days` | Simulation duration in days (max 100) | 3 |
| `pnum` | Number of particles (max 100 000) | 200 |
| `res` | Grid resolution in degrees (`0.001` to `1.0`) | 0.1 |
| `use_source` | Anthropogenic weighting layer: `none`, `windfarms`, or `offshore_installations` | `none` |

### Output

```json
{
  "type": "raster",
  "image_b64": "...",        // transparent PNG for Leaflet overlay (300 dpi, bilinear interpolation)
  "geotiff_b64": "...",      // georeferenced GeoTIFF (EPSG:4326, LZW) for download
  "bounds": [[lat_min, lon_min], [lat_max, lon_max]],
  "pressure": "generic|plastic|oil",
  "label_it": "...",
  "label_en": "...",
  "use_source": "none|windfarms|offshore_installations",
  "use_weighted": false,
  "start_time": "YYYYMMDD",
  "end_time": "YYYYMMDD",
  "pnum": 200,
  "windfarms_geojson": {...},       // only if use_source=windfarms
  "offshore_geojson": {...}         // only if use_source=offshore_installations
}
```

### GeoTIFF structure

Single float32 band, `ny × nx` cells. Cell value = raw particle passage counts (or weighted density if `use_weighted` is true). `nodata = 0.0`, CRS EPSG:4326, LZW compression.

### Heatmap colormap

Computed in `_raster_to_png` (PMARProcess.py):
- Transparent: cells with value ≤ 0 or NaN
- Colormap `Spectral_r` (blue/purple → green → yellow → orange → red) with `LogNorm`
- vmin = 2nd percentile of positive values, vmax = 98th percentile (auto-adaptive per run)
- PNG rendered at 300 dpi with bilinear interpolation

### Download filename format

```
pmar_<pressure>_<YYYYMMDD>-<YYYYMMDD>_p<pnum>[_<use_source>].tif
```
e.g. `pmar_oil_20260501-20260510_p30000_offshore_installations.tif`

### Temporary file size

The OpenDrift simulation writes a temporary NetCDF to `out/` before PMAR analysis. Estimated sizes:

| Pressure | Bytes/particle/step | Example: 30k × 70 days |
|---|---|---|
| `generic` | ~40 (5 vars × float64) | ~1.6 GB |
| `plastic` | ~60 (8 vars × float64) | ~2.4 GB |
| `oil` | ~160 (20 vars × float64) | ~8 GB |

The frontend shows a live estimate below the run button. Temporary files are deleted after each run and cleaned up on server startup.

### Spatial margin

The CMEMS download bbox and PMAR study area extend beyond the seeding polygon using logarithmic growth: `margin = log(days + 1) × k`. This limits the download area for long simulations while still covering plausible particle drift.

### PROJ note

`pmar.py` hardcodes `PROJ_LIB` to a conda path at import time, which corrupts PROJ for pyproj and rasterio. PMARProcess.py removes both `PROJ_LIB` and `PROJ_DATA` from the environment immediately after importing PMAR, allowing each library to find its own data directory.

---

## Anthropogenic layers

Both layers query [EMODnet Human Activities WFS](https://ows.emodnet-humanactivities.eu/wfs) and cache results as pickle files (7-day TTL) in `cache/emodnet/`.

| `use_source` | Data source | Coverage note |
|---|---|---|
| `windfarms` | `emodnet:windfarmspoly` (polygons) | North Sea, Atlantic, Baltic |
| `offshore_installations` | `emodnet:platforms` (points) | European waters; Mediterranean data concentrated in the Adriatic (Italian/Croatian platforms) |

When a layer is active, its features are rasterized onto the simulation grid and used as PMAR weights. Features are also returned in the response as GeoJSON for display on the map.

### Preview processes

Two lightweight processes allow the frontend to preview layer coverage before running a full PMAR simulation:

- `POST /processes/windfarms/execution` — returns a GeoJSON FeatureCollection of wind farm polygons for a given bbox
- `POST /processes/offshore_installations/execution` — returns a GeoJSON FeatureCollection of offshore platforms for a given bbox

Both accept `lon_min`, `lat_min`, `lon_max`, `lat_max` as inputs.

---

## CMEMS data

Ocean currents are downloaded automatically from the Copernicus Marine Service:

- **Primary dataset:** `cmems_mod_med_phy-cur_anfc_0.042deg_PT1H-m` (Mediterranean, hourly)
- **Fallback:** `cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m` (global, daily)

Wind data (for `PlastDrift`, `OpenOil`, and PMAR plastic/oil pressure):

- **Primary:** `cmems_obs-wind_med_phy_nrt_l4_0.125deg_PT1H` (Mediterranean)
- **Fallback:** `cmems_obs-wind_glo_phy_nrt_l4_0.125deg_PT1H` (global)

Files are cached in `cache/` keyed on seeding coordinates, start date, and duration. The spatial domain is centred on the seeding point with a logarithmic margin based on simulation duration.

---

## Frontend features

### OpenDrift tab

- Interactive seeding: draw a **circle** or **rectangle** on the map to define the release area
- Animated particle trajectories with play/pause, time slider, and speed control
- Stranded particles highlighted in red
- Toggle to show/hide the seeding area overlay

### PMAR tab

- Draw a seeding polygon on the map (or upload a shapefile)
- Select pressure type (`generic`, `plastic`, `oil`), duration (up to 100 days), particle count (up to 100 000), and grid resolution (`0.001°` to `1.0°`)
- Live estimate of temporary NetCDF file size, colour-coded by severity, updates as parameters change
- Select an anthropogenic weighting layer (`windfarms` or `offshore_installations`)
- Anthropogenic layer features are previewed on the map as soon as a source is selected, before running the simulation
- After the simulation completes, a **PmarControls** bar appears at the bottom with:
  - Toggle heatmap overlay
  - Toggle seeding area overlay
  - Toggle wind farms layer (if windfarms was used)
  - Toggle offshore installations layer (if offshore_installations was used)
  - **Download raster** — downloads the raw GeoTIFF with a descriptive filename

### Map markers for anthropogenic layers

All anthropogenic layer features use a standardised SVG teardrop pin icon (`createPinIcon` in `App.jsx`):

| Layer | Fill | Stroke |
|---|---|---|
| Wind farms | yellow `#fef08a` | amber `#ca8a04` |
| Offshore installations | peach `#fed7aa` | orange `#ea580c` |

Point features use `pointToLayer`; polygon features display a pin at the centroid of their bounding box.

### General

- **IT / EN** language switch (i18n via `frontend/src/i18n.js`)

---

## Logging

Each process writes to its own subdirectory under `logs/`. All process loggers use `LineRotatingFileHandler` (`processes/logging_utils.py`): the log file is truncated (not archived) when it exceeds 1000 lines.

| Directory | Content |
|---|---|
| `logs/pygeoapi/pygeoapi.log` | pygeoapi server logs (WARNING level — configured in `pygeoapi-config.yml`) |
| `logs/opendrift/opendrift.log` | OpenDrift simulation logs (DEBUG) |
| `logs/pmar/pmar.log` | PMAR process logs (DEBUG) |
| `logs/windfarms/windfarms.log` | Wind farms WFS fetch logs (DEBUG) |
| `logs/offshore_installations/offshore_installations.log` | Offshore installations WFS fetch logs (DEBUG) |
