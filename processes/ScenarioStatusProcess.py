import glob
import json
import os

from pygeoapi.process.base import BaseProcessor

from processes.PMARProcess import SCENARIOS_DIR, _fetch_t4msp_areas
from processes.logging_utils import setup_logger

logger = setup_logger('scenario_status_process', 'pmar', 'scenario_status.log')

PROCESS_METADATA = {
    'version': '0.1.0',
    'id': 'scenario_status',
    'title': {'en': 'PMAR Scenario Status'},
    'description': {
        'en': 'Returns the pre-computation status for each defined PMAR scenario.'
    },
    'jobControlOptions': ['sync-execute'],
    'keywords': ['pmar', 'scenario', 'status'],
    'inputs': {},
    'outputs': {
        'result': {
            'title': 'Scenario status map',
            'schema': {'type': 'object', 'contentMediaType': 'application/json'},
        }
    },
}


class ScenarioStatusProcessor(BaseProcessor):

    def __init__(self, processor_def):
        super().__init__(processor_def, PROCESS_METADATA)

    def execute(self, data):
        scenarios = {}

        for meta_file in sorted(glob.glob(os.path.join(SCENARIOS_DIR, 'custom_*.json'))):
            try:
                with open(meta_file) as f:
                    sc = json.load(f)
                sid     = sc.get('scenario_id', os.path.basename(meta_file).replace('.json', ''))
                nc_path = os.path.join(SCENARIOS_DIR, sc['nc_filename'])
                if os.path.exists(nc_path):
                    nc_size_mb = round(os.path.getsize(nc_path) / (1024 * 1024), 2)
                    computed   = True
                else:
                    nc_size_mb = None
                    computed   = False
                scenarios[sid] = {
                    'computed':        computed,
                    'nc_size_mb':      nc_size_mb,
                    'label_it':        sc['label_it'],
                    'label_en':        sc['label_en'],
                    'area_it':         sc.get('area_it', ''),
                    'area_en':         sc.get('area_en', ''),
                    'pressure':        sc['pressure'],
                    'pnum':            sc['pnum'],
                    'duration_days':   sc['duration_days'],
                    'time_step_hours': sc['time_step_hours'],
                    'start_time':      sc['start_time'][:10],
                    'res':             sc['res'],
                    'cmems_margin':    sc.get('cmems_margin', 5.0),
                    'description':     sc.get('description', ''),
                    'source':          'custom',
                }
            except Exception as e:
                logger.warning(f'[ScenarioStatus] Impossibile caricare {meta_file}: {e}')

        t4msp_areas = [{'id': a['id'], 'label': a['label']} for a in _fetch_t4msp_areas()]

        logger.info(f'[ScenarioStatus] Scenari custom: {len(scenarios)}, aree T4MSP: {len(t4msp_areas)}')
        return 'application/json', {'scenarios': scenarios, 't4msp_areas': t4msp_areas}

    def __repr__(self):
        return '<ScenarioStatusProcessor>'
