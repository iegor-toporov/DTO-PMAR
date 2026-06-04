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
    return f'pmar:job:{job_id}'


def _set_status(job_id: str, status: str, message: str = None) -> None:
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
