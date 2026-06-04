import logging
import sys

_LOG_FORMAT = '[%(asctime)s] {%(filename)s:%(lineno)d} %(levelname)s - %(message)s'
_DATE_FORMAT = '%Y-%m-%dT%H:%M:%S'


def setup_logger(name, subdir=None, filename=None, max_lines=None):
    log = logging.getLogger(name)
    if not log.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))
        log.addHandler(handler)
        log.setLevel(logging.DEBUG)
        log.propagate = False
    return log
