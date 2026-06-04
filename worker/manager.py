import json
import os
from datetime import datetime, timezone
from typing import Any, Optional, Tuple

import redis as redis_client

from pygeoapi.process.manager.base import BaseManager
from pygeoapi.process.base import (
    BaseProcessor,
    JobNotFoundError,
    JobResultNotFoundError,
)
from pygeoapi.util import JobStatus, RequestedResponse, Subscriber

_TTL = 7 * 24 * 3600  # 7 giorni


class CeleryManager(BaseManager):
    """
    pygeoapi process manager che usa Redis per la persistenza dei job
    e Celery per l'esecuzione asincrona delle simulazioni.
    """

    def __init__(self, manager_def: dict):
        super().__init__(manager_def)
        self.is_async = True
        self.supports_subscribing = False
        redis_url = os.environ.get('REDIS_URL', 'redis://redis:6379/0')
        self._redis = redis_client.Redis.from_url(redis_url, decode_responses=True)

    # ── helpers ──────────────────────────────────────────────────────────

    @staticmethod
    def _key(job_id: str) -> str:
        return f'pmar:job:{job_id}'

    def _serialize(self, d: dict) -> dict:
        out = {}
        for k, v in d.items():
            if v is None:
                out[k] = ''
            elif isinstance(v, (dict, list)):
                out[k] = json.dumps(v)
            else:
                out[k] = str(v)
        return out

    # ── BaseManager interface ─────────────────────────────────────────────

    def add_job(self, job_metadata: dict) -> str:
        job_id = job_metadata.get('identifier', '')
        if not job_id:
            import uuid
            job_id = str(uuid.uuid1())
            job_metadata['identifier'] = job_id
        self._redis.hset(self._key(job_id), mapping=self._serialize(job_metadata))
        self._redis.expire(self._key(job_id), _TTL)
        return job_id

    def update_job(self, job_id: str, update_dict: dict) -> bool:
        self._redis.hset(self._key(job_id), mapping=self._serialize(update_dict))
        self._redis.expire(self._key(job_id), _TTL)
        return True

    def get_job(self, job_id: str) -> dict:
        data = self._redis.hgetall(self._key(job_id))
        if not data:
            raise JobNotFoundError()
        return data

    def get_jobs(self,
                 status: JobStatus = None,
                 limit: Optional[int] = None,
                 offset: Optional[int] = None) -> dict:
        keys = self._redis.keys('pmar:job:*')
        jobs = []
        for key in keys:
            try:
                job_id = key.replace('pmar:job:', '')
                job = self.get_job(job_id)
                if status is None or job.get('status') == status.value:
                    jobs.append(job)
            except JobNotFoundError:
                pass
        jobs.sort(key=lambda j: j.get('created', ''), reverse=True)
        total = len(jobs)
        if offset:
            jobs = jobs[offset:]
        if limit:
            jobs = jobs[:limit]
        return {'jobs': jobs, 'numberMatched': total}

    def delete_job(self, job_id: str) -> bool:
        if not self._redis.exists(self._key(job_id)):
            raise JobNotFoundError()
        self._redis.delete(self._key(job_id))
        return True

    def get_job_result(self, job_id: str) -> Tuple[str, Any]:
        job = self.get_job(job_id)
        if job.get('status') != JobStatus.successful.value:
            raise JobResultNotFoundError()
        result_str = job.get('result')
        if not result_str:
            raise JobResultNotFoundError()
        mimetype = job.get('mimetype', 'application/json')
        try:
            return mimetype, json.loads(result_str)
        except (json.JSONDecodeError, TypeError):
            return mimetype, result_str

    # ── Async dispatch → Celery ──────────────────────────────────────────

    def _execute_handler_async(self,
                               p: BaseProcessor,
                               job_id: str,
                               data_dict: dict,
                               requested_outputs: Optional[dict] = None,
                               subscriber: Optional[Subscriber] = None,
                               requested_response: Optional[RequestedResponse] = RequestedResponse.raw.value  # noqa
                               ) -> Tuple[str, None, JobStatus]:
        from worker.tasks import run_processor
        process_class_path = f"{p.__class__.__module__}.{p.__class__.__name__}"
        run_processor.delay(job_id, process_class_path, data_dict)
        return 'application/json', None, JobStatus.accepted

    def __repr__(self):
        return '<CeleryManager>'
