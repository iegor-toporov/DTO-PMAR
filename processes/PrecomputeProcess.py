import base64
import glob
import io
import json
import os
import uuid
import time as _time
import threading
import zipfile
from datetime import datetime, timedelta

import geopandas as gpd

from pygeoapi.process.base import BaseProcessor, ProcessorExecuteError

from processes.PMARProcess import (
    SCENARIOS_DIR, SCENARIOS_SHP_DIR, PRESSURE_MODELS,
    ensure_t4msp_shapefile, _fetch_t4msp_areas,
)
from processes.OpenDriftProcess import _get_forcing_file, _get_wind_file, _build_model, OUT_DIR
from processes.logging_utils import setup_logger

logger = setup_logger('precompute_process', 'pmar', 'precompute_process.log')

_precompute_lock = threading.Semaphore(1)

PROCESS_METADATA = {
    'version': '0.1.0',
    'id': 'precompute',
    'title': {'en': 'Pre-compute PMAR scenario'},
    'description': {
        'en': 'Pre-computes trajectories for a fixed PMAR scenario and saves the NC file.'
    },
    'jobControlOptions': ['async-execute'],
    'keywords': ['pmar', 'precompute', 'scenario', 'trajectories'],
    'inputs': {
        'geojson': {
            'title': 'Seeding area GeoJSON',
            'description': 'GeoJSON string for the seeding area.',
            'schema': {'type': 'string'},
            'minOccurs': 0, 'maxOccurs': 1,
        },
        't4msp_area_id': {
            'title': 'Tools4MSP area ID',
            'description': 'Numeric ID of a Tools4MSP domain area to use as seeding region.',
            'schema': {'type': 'integer'},
            'minOccurs': 0, 'maxOccurs': 1,
        },
        'shapefile_b64': {
            'title': 'Shapefile ZIP (base64)',
            'description': 'Base64-encoded shapefile ZIP for custom seeding area.',
            'schema': {'type': 'string'},
            'minOccurs': 0, 'maxOccurs': 1,
        },
        'pressure': {
            'title': 'Pressure type',
            'schema': {'type': 'string', 'default': 'generic'},
            'minOccurs': 0, 'maxOccurs': 1,
        },
        'start_time': {
            'title': 'Simulation start time (ISO 8601)',
            'schema': {'type': 'string'},
            'minOccurs': 0, 'maxOccurs': 1,
        },
        'duration_days': {
            'title': 'Duration (days)',
            'schema': {'type': 'integer', 'default': 30},
            'minOccurs': 0, 'maxOccurs': 1,
        },
        'pnum': {
            'title': 'Number of particles',
            'schema': {'type': 'integer', 'default': 1000},
            'minOccurs': 0, 'maxOccurs': 1,
        },
        'time_step_hours': {
            'title': 'Time step (hours)',
            'schema': {'type': 'integer', 'default': 1},
            'minOccurs': 0, 'maxOccurs': 1,
        },
        'res': {
            'title': 'Grid resolution (degrees)',
            'schema': {'type': 'number', 'default': 0.1},
            'minOccurs': 0, 'maxOccurs': 1,
        },
        'label': {
            'title': 'Scenario label',
            'schema': {'type': 'string'},
            'minOccurs': 0, 'maxOccurs': 1,
        },
        'area_name': {
            'title': 'Seeding area name (drawn areas only)',
            'description': 'User-provided name for a manually drawn seeding area.',
            'schema': {'type': 'string'},
            'minOccurs': 0, 'maxOccurs': 1,
        },
        'description': {
            'title': 'Simulation description',
            'description': 'Free-text notes about the simulation.',
            'schema': {'type': 'string'},
            'minOccurs': 0, 'maxOccurs': 1,
        },
        'cmems_margin': {
            'title': 'CMEMS download margin (degrees)',
            'description': 'Degrees added around the seeding area centre for CMEMS data download. Default: 5.0.',
            'schema': {'type': 'number', 'default': 5.0},
            'minOccurs': 0, 'maxOccurs': 1,
        },
    },
    'outputs': {
        'result': {
            'title': 'Pre-compute result',
            'schema': {'type': 'object', 'contentMediaType': 'application/json'},
        }
    },
}


def _save_custom_shapefile(geojson_input, shapefile_b64, dest_dir, custom_id):
    """Salva la geometria di un custom scenario in dest_dir e restituisce il path .shp."""
    shp_path = os.path.join(dest_dir, f'{custom_id}.shp')
    if geojson_input is not None:
        geojson = json.loads(geojson_input) if isinstance(geojson_input, str) else geojson_input
        if geojson.get('type') == 'FeatureCollection':
            features = geojson['features']
        elif geojson.get('type') == 'Feature':
            features = [geojson]
        else:
            features = [{'type': 'Feature', 'geometry': geojson, 'properties': {}}]
        gdf = gpd.GeoDataFrame.from_features(features, crs='EPSG:4326')
        gdf.to_file(shp_path)
        return shp_path
    if shapefile_b64 is not None:
        import tempfile
        zip_bytes = base64.b64decode(shapefile_b64)
        with tempfile.TemporaryDirectory() as tmpdir:
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                zf.extractall(tmpdir)
            shp_files = glob.glob(os.path.join(tmpdir, '**', '*.shp'), recursive=True)
            if not shp_files:
                raise ProcessorExecuteError('Nessun file .shp trovato nello ZIP.')
            gdf = gpd.read_file(shp_files[0]).to_crs('EPSG:4326')
        gdf.to_file(shp_path)
        return shp_path
    raise ProcessorExecuteError('Fornire geojson oppure shapefile_b64.')


def _build_custom_scenario(data, shp_path=None, area_label=None):
    """Valida i parametri, crea lo shapefile (se non fornito) e il JSON di metadati. Restituisce (sc, custom_id, shp_path)."""
    geojson_input = data.get('geojson')
    shapefile_b64 = data.get('shapefile_b64')
    pressure      = data.get('pressure', 'generic')
    if pressure not in PRESSURE_MODELS:
        raise ProcessorExecuteError(f'Pressione non valida: {pressure!r}')

    duration_days   = int(data.get('duration_days', 30))
    pnum            = min(int(data.get('pnum', 1000)), 100000)
    time_step_hours = int(data.get('time_step_hours', 1))
    time_step_hours = max(1, min(time_step_hours, 24))
    res             = float(data.get('res', 0.1))

    start_time_str = data.get('start_time')
    if not start_time_str:
        start_time_str = (datetime.utcnow() - timedelta(days=10)).strftime('%Y-%m-%dT00:00:00')
    else:
        try:
            datetime.fromisoformat(start_time_str)
        except ValueError:
            raise ProcessorExecuteError(f'start_time non valido: {start_time_str!r}')

    label     = data.get('label') or f'{PRESSURE_MODELS[pressure]["label_en"]} — {start_time_str[:10]}'
    custom_id = f'custom_{uuid.uuid4().hex[:8]}'

    if shp_path is None:
        shp_path = _save_custom_shapefile(geojson_input, shapefile_b64, SCENARIOS_SHP_DIR, custom_id)

    cmems_margin = float(data.get('cmems_margin', 5.0))
    cmems_margin = max(0.0, min(cmems_margin, 20.0))
    description  = (data.get('description') or '').strip()

    sc = {
        'scenario_id':     custom_id,
        'label_it':        label,
        'label_en':        label,
        'area_it':         area_label or 'Area personalizzata',
        'area_en':         area_label or 'Custom area',
        'pressure':        pressure,
        'pnum':            pnum,
        'duration_days':   duration_days,
        'time_step_hours': time_step_hours,
        'start_time':      start_time_str,
        'res':             res,
        'cmems_margin':    cmems_margin,
        'description':     description,
        'nc_filename':     f'{custom_id}.nc',
        'shapefile':       shp_path,
        'source':          'custom',
    }
    meta_path = os.path.join(SCENARIOS_DIR, f'{custom_id}.json')
    with open(meta_path, 'w') as f:
        json.dump(sc, f, indent=2)

    logger.info(f'[PrecomputeProcess] Scenario custom creato: {custom_id}, label={label!r}')
    return sc, custom_id, shp_path


def _run_scenario(scenario_id, sc, shp_path):
    nc_output = os.path.join(SCENARIOS_DIR, sc['nc_filename'])

    if os.path.exists(nc_output):
        logger.info(f'[{scenario_id}] NC già presente, salto.')
        return

    logger.info(f'[{scenario_id}] Avvio pre-calcolo: {sc["label_en"]}')

    start_time      = datetime.fromisoformat(sc['start_time'])
    end_time        = start_time + timedelta(days=sc['duration_days'])
    pressure        = sc['pressure']
    pnum            = sc['pnum']
    duration_days   = sc['duration_days']
    time_step_hours = sc['time_step_hours']
    cmems_margin    = float(sc.get('cmems_margin', 5.0))

    gdf    = gpd.read_file(shp_path).to_crs('EPSG:4326')
    bounds = gdf.total_bounds

    logger.info(f'[{scenario_id}] bounds={bounds.tolist()}, cmems_margin={cmems_margin}°')

    pm_cfg = PRESSURE_MODELS[pressure]
    forcing_paths = [_get_forcing_file(
        bounds[0], bounds[2], bounds[1], bounds[3],
        start_time, end_time, time_step_hours, pm_cfg.get('max_depth', 0.5), cmems_margin,
    )]
    if pm_cfg['needs_wind']:
        wind_path = _get_wind_file(bounds[0], bounds[2], bounds[1], bounds[3], start_time, end_time, cmems_margin)
        if wind_path:
            forcing_paths.append(wind_path)
        else:
            logger.warning(f'[{scenario_id}] Vento non disponibile, solo correnti')

    logger.info(f'[{scenario_id}] Forcing files: {forcing_paths}')

    os.environ.pop('PROJ_LIB', None)
    os.environ.pop('PROJ_DATA', None)

    o = _build_model(pm_cfg['class'], pm_cfg)
    o.set_config('general:coastline_action', 'stranding')
    o.add_readers_from_list(forcing_paths)

    tmp_nc = os.path.join(OUT_DIR, f'precompute_{uuid.uuid4().hex}.nc')
    try:
        o.seed_from_shapefile(shapefile=shp_path, number=pnum, time=start_time)
        ts = timedelta(hours=time_step_hours)
        logger.info(
            f'[{scenario_id}] Run: model={pm_cfg["class"]}, pnum={pnum}, '
            f'duration={duration_days}d, time_step={time_step_hours}h'
        )
        stop_progress = threading.Event()

        def _log_progress():
            while not stop_progress.wait(60):
                try:
                    sim_time    = getattr(o, 'time', None)
                    active      = o.num_elements_active()
                    elapsed_now = (_time.monotonic() - t0) / 60
                    if sim_time is not None:
                        sim_day = (sim_time - start_time).total_seconds() / 86400
                        pct     = sim_day / duration_days * 100
                        logger.info(
                            f'[{scenario_id}] giorno {sim_day:.0f}/{duration_days} ({pct:.0f}%) '
                            f'— {active} particelle attive — {elapsed_now:.1f} min'
                        )
                    else:
                        logger.info(
                            f'[{scenario_id}] inizializzazione in corso '
                            f'— {active} particelle attive — {elapsed_now:.1f} min'
                        )
                except Exception:
                    pass

        t0 = _time.monotonic()
        _progress_thread = threading.Thread(target=_log_progress, daemon=True)
        _progress_thread.start()
        try:
            o.run(
                duration=timedelta(days=duration_days),
                time_step=ts,
                time_step_output=ts,
                outfile=tmp_nc,
            )
        finally:
            stop_progress.set()
            _progress_thread.join()
        elapsed = (_time.monotonic() - t0) / 60
        logger.info(f'[{scenario_id}] Simulazione completata in {elapsed:.1f} minuti')

        os.rename(tmp_nc, nc_output)
        logger.info(f'[{scenario_id}] NC salvato: {nc_output}')

    except Exception as e:
        logger.error(f'[{scenario_id}] Fallito: {e}', exc_info=True)
        if os.path.exists(tmp_nc):
            os.remove(tmp_nc)
        raise


class PrecomputeProcessor(BaseProcessor):

    def __init__(self, processor_def):
        super().__init__(processor_def, PROCESS_METADATA)

    def execute(self, data):
        geojson_input  = data.get('geojson')
        shapefile_b64  = data.get('shapefile_b64')
        t4msp_area_id  = data.get('t4msp_area_id')

        if not geojson_input and not shapefile_b64 and not t4msp_area_id:
            raise ProcessorExecuteError('Fornire geojson, shapefile_b64 oppure t4msp_area_id.')

        shp_path   = None
        area_label = data.get('area_name') or None
        if t4msp_area_id is not None:
            area_id  = int(t4msp_area_id)
            shp_path = ensure_t4msp_shapefile(area_id)
            areas    = _fetch_t4msp_areas()
            match    = next((a for a in areas if a['id'] == area_id), None)
            if match:
                area_label = match['label']

        sc, scenario_id, shp_path = _build_custom_scenario(data, shp_path=shp_path, area_label=area_label)

        logger.info(f'[PrecomputeProcess] Avvio pre-calcolo scenario: {scenario_id}')

        if not _precompute_lock.acquire(blocking=False):
            raise ProcessorExecuteError('Un pre-calcolo è già in corso. Riprova al termine.')

        try:
            _run_scenario(scenario_id, sc, shp_path)
        except Exception as e:
            logger.error(f'[PrecomputeProcess] Errore nel pre-calcolo di {scenario_id}: {e}', exc_info=True)
            raise ProcessorExecuteError(str(e))
        finally:
            _precompute_lock.release()

        logger.info(f'[PrecomputeProcess] Pre-calcolo completato: {sc["nc_filename"]}')

        return 'application/json', {
            'scenario_id': scenario_id,
            'status': 'done',
            'nc_filename': sc['nc_filename'],
        }

    def __repr__(self):
        return '<PrecomputeProcessor>'
