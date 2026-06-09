import logging
import sys

_LOG_FORMAT = '[%(asctime)s] {%(filename)s:%(lineno)d} %(levelname)s - %(message)s'
_DATE_FORMAT = '%Y-%m-%dT%H:%M:%S'


def setup_logger(name, subdir=None, filename=None, max_lines=None):
    """Configure and return a named logger that writes to stdout.

    Attaches a StreamHandler to ``sys.stdout`` with a standard ISO-8601 timestamp
    format.  Idempotent: calling this function multiple times with the same *name*
    returns the existing logger without adding duplicate handlers.

    Args:
        name (str): Logger identifier used as the Python logging hierarchy key.
        subdir (str | None): Reserved for future use; currently ignored.
        filename (str | None): Reserved for future use; currently ignored.
        max_lines (int | None): Reserved for future use; currently ignored.

    Returns:
        logging.Logger: Configured logger instance with level DEBUG.
    """
    log = logging.getLogger(name)
    if not log.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))
        log.addHandler(handler)
        log.setLevel(logging.DEBUG)
        log.propagate = False
    return log
