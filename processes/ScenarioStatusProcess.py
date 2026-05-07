import os

from pygeoapi.process.base import BaseProcessor

from processes.PMARProcess import SCENARIOS, SCENARIOS_DIR
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
        result = {}
        for scenario_id, sc in SCENARIOS.items():
            nc_path = os.path.join(SCENARIOS_DIR, sc['nc_filename'])
            if os.path.exists(nc_path):
                nc_size_mb = round(os.path.getsize(nc_path) / (1024 * 1024), 2)
                computed = True
            else:
                nc_size_mb = None
                computed = False

            result[scenario_id] = {
                'computed':   computed,
                'nc_size_mb': nc_size_mb,
                'label_it':   sc['label_it'],
                'label_en':   sc['label_en'],
            }

        logger.info(f'[ScenarioStatus] Status: { {k: v["computed"] for k, v in result.items()} }')
        return 'application/json', result

    def __repr__(self):
        return '<ScenarioStatusProcessor>'
