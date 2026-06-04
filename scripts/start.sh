#!/bin/bash
export PYGEOAPI_CONFIG=pygeoapi-config.yml
export PYGEOAPI_OPENAPI=pygeoapi-openapi.yml
export PYTHONPATH=$(dirname "$0")
rm -f out/pmar_*.nc out/pmar_*.nc_tmp out/opendrift_*.nc out/opendrift_*.nc_tmp
pygeoapi openapi generate $PYGEOAPI_CONFIG --output-file $PYGEOAPI_OPENAPI
pygeoapi serve