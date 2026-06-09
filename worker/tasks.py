import importlib
import json
import os
from datetime import datetime, timezone

import redis as redis_client

from worker.app import app

_REDIS_URL = os.environ.get('REDIS_URL', 'redis://redis:6379/0')
_redis = redis_client.Redis.from_url(_REDIS_URL, decode_responses=True)
_TTL = 7 * 24 * 3600  # 7 giorni


def _key(job_id: str) -> str:
    """Return the Redis hash key for a given job ID."""
    return f'pmar:job:{job_id}'


def _set_status(job_id: str, status: str, message: str = None) -> None:
    """Write a status update for *job_id* to the Redis hash, with an optional message.

    The hash entry is given a 7-day TTL so stale job records are automatically evicted.

    Args:
        job_id (str): Unique job identifier.
        status (str): New status string (e.g. ``'running'``, ``'successful'``, ``'failed'``).
        message (str | None): Optional detail message stored under the ``'message'`` key.
    """
    data = {
        'status': status,
        'updated': datetime.now(timezone.utc).isoformat(),
    }
    if message:
        data['message'] = message
    _redis.hset(_key(job_id), mapping=data)
    _redis.expire(_key(job_id), _TTL)


@app.task(bind=True, name='run_processor')
def run_processor(self, job_id: str, process_class_path: str, data_dict: dict):
    """Execute a pygeoapi processor inside a Celery worker and persist the result to Redis.

    Dynamically imports the processor class identified by *process_class_path*, calls its
    ``execute()`` method with *data_dict*, and writes the outcome back to the Redis hash
    ``pmar:job:<job_id>``.  On failure the exception is re-raised so Celery can mark the
    task as failed and trigger any configured retry/error handling.

    Args:
        job_id (str): Unique job identifier (also the Redis hash key suffix).
        process_class_path (str): Fully qualified dotted import path to the processor class,
            e.g. ``'processes.PMARProcess.PMARProcessor'``.
        data_dict (dict): OGC API input payload forwarded verbatim to ``processor.execute()``.

    Raises:
        Exception: Re-raises any exception from the processor after recording the
            ``'failed'`` status in Redis.
    """
    _set_status(job_id, 'running')
    try:
        module_path, class_name = process_class_path.rsplit('.', 1)
        mod = importlib.import_module(module_path)
        cls = getattr(mod, class_name)
        processor = cls({'name': process_class_path})

        mimetype, result = processor.execute(data_dict)

        _redis.hset(_key(job_id), mapping={
            'status': 'successful',
            'mimetype': mimetype or 'application/json',
            'result': json.dumps(result),
            'finished': datetime.now(timezone.utc).isoformat(),
            'updated': datetime.now(timezone.utc).isoformat(),
            'progress': '100',
            'message': 'Job complete',
        })
        _redis.expire(_key(job_id), _TTL)

    except Exception as exc:
        _set_status(job_id, 'failed', message=str(exc))
        raise
