import json
import logging
import os

import geopandas as gpd
from pygeoapi.process.base import BaseProcessor, ProcessorExecuteError
from processes.PMARProcess import _fetch_windfarms, EMODNET_CACHE_DIR
from processes.logging_utils import setup_logger

logger = setup_logger('windfarms_process', 'windfarms', 'windfarms.log')

PROCESS_METADATA = {
    'version': '0.1.0',
    'id': 'windfarms',
    'title': {'en': 'Wind Farms Query'},
    'description': {
        'en': 'Returns EMODnet offshore wind farm polygons for a given bounding box.'
    },
    'jobControlOptions': ['sync-execute'],
    'keywords': ['windfarms', 'emodnet', 'geojson'],
    'inputs': {
        'lon_min': {'schema': {'type': 'number'}, 'minOccurs': 1, 'maxOccurs': 1},
        'lat_min': {'schema': {'type': 'number'}, 'minOccurs': 1, 'maxOccurs': 1},
        'lon_max': {'schema': {'type': 'number'}, 'minOccurs': 1, 'maxOccurs': 1},
        'lat_max': {'schema': {'type': 'number'}, 'minOccurs': 1, 'maxOccurs': 1},
    },
    'outputs': {
        'result': {
            'title': 'GeoJSON FeatureCollection of wind farms',
            'schema': {'type': 'object', 'contentMediaType': 'application/json'},
        }
    },
}


class WindfarmsProcessor(BaseProcessor):

    def __init__(self, processor_def):
        super().__init__(processor_def, PROCESS_METADATA)

    def execute(self, data):
        try:
            lon_min = float(data['lon_min'])
            lat_min = float(data['lat_min'])
            lon_max = float(data['lon_max'])
            lat_max = float(data['lat_max'])
        except (KeyError, TypeError, ValueError) as e:
            raise ProcessorExecuteError(f'Parametri bbox non validi: {e}')

        study_area = [lon_min, lat_min, lon_max, lat_max]
        logger.info(f'Windfarms query: bbox={study_area}')

        gdf = _fetch_windfarms(study_area, EMODNET_CACHE_DIR)

        if gdf.empty:
            return 'application/json', {'type': 'FeatureCollection', 'features': []}

        geojson = json.loads(gdf[['geometry']].simplify(0.005).to_json())
        logger.info(f'Windfarms restituiti: {len(gdf)} feature')
        return 'application/json', geojson

    def __repr__(self):
        return '<WindfarmsProcessor>'
