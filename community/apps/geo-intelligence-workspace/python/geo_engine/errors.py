class GeoError(ValueError):
    code = "invalid_request"
    status_code = 409


class NotFound(GeoError):
    code = "not_found"
    status_code = 404


class RunInProgress(GeoError):
    code = "run_in_progress"


class IdempotencyConflict(GeoError):
    code = "idempotency_conflict"


class ModelNotConfigured(RuntimeError):
    pass


class ProviderUnavailable(RuntimeError):
    pass
