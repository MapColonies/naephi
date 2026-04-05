# naephi
- nae: Scottish English or Northern English for no or not
- phi ( Φ, φ ):
    1. a plane angle.
    2. a polar coordinate.
    3. in mathematics, the Greek letter φ denotes the golden ratio.

`naephi` leverages `BullMQ` flow to build an `OSM` `changeset` upload flow, that is being processed in 4 stages and 2 separate cleanup stages:

### Stage I: pre-upload
In this stage we set the environment before the actual upload - this includes generating a `changeset` on `osm-api` and setting the tracked resources on `osm-sync-tracker`.

```mermaid
graph TD
    Start((Start Job)) --> GetRedis[1. Redis::GET changesetId]

    GetRedis --> RedisExists{Exists?}
    RedisExists -- No --> Unrecoverable[Throw UnrecoverableError]
    RedisExists -- Yes --> GetTracker[2. Tracker::GET <br/> /changeset/:changesetId]

    GetTracker --> HasOsmId{Changeset has osmId?}

    %% Branch: No osmId in tracker
    HasOsmId -- No --> CreateOSM[3.ii OsmApi::PUT <br/> /changeset/create ]

    %% Branch: osmId exists in tracker
    HasOsmId -- Yes --> GetOSMStatus[3.i. OsmApi::GET <br/> /changeset/:osmId]
    GetOSMStatus --> StatusCheck{Changeset is <br/> Closed & Empty?}

    StatusCheck -- Yes --> CreateOSM
    StatusCheck -- No --> UseExisting[Reuse Existing Changeset]

    %% Handle Tracker Update
    CreateOSM --> TrackerNull{Tracker Changeset <br/> Exists?}
    TrackerNull -- No --> PostTracker[4.i. Tracker::POST <br/> /changeset/]
    TrackerNull -- Yes --> PatchTracker[4.ii. Tracker::PATCH <br/> /changeset/:changesetId]

    %% Final Steps
    PostTracker --> PatchEntities
    PatchTracker --> PatchEntities
    UseExisting --> PatchEntities[5. Tracker::PATCH <br/> /entity/_bulk]

    PatchEntities --> Finish((Complete Job <br/> & Return osmId))

```

### Stage II: upload:
This stage is responsible for the actual delivery of data to OSM. It transforms local changes into a valid OSM XML changeset and performs the upload. A key feature of this stage is its state-awareness: it can detect if an upload is redundant (already full) or if the environment has become invalid (closed empty), in which case it triggers a flow recovery.

```mermaid
graph TD
    Start((Start Job)) --> GetStage1[Fetch osmId from <br/> pre-upload]
    GetStage1 --> GetStatus[1. OsmApi::GET <br/> /changeset/:osmId]

    GetStatus --> StatusCheck{Changeset Status?}

    %% Path: Open & Empty (The standard path)
    StatusCheck -- "Open & Empty" --> GetRedis[2. Redis::GET changesetId]
    GetRedis --> RedisExists{Exists?}
    RedisExists -- No --> Unrecoverable[Throw UnrecoverableError]
    RedisExists -- Yes --> Merge[3. Change-Merger::POST <br/> /change/merge]
    Merge --> Upload[4. OsmApi::POST <br/> /changeset/:osmId/upload]

    %% Upload Decision Node
    Upload --> UploadStatus{Upload Status?}
    UploadStatus -- 201 Success --> Cleanup
    UploadStatus -- 409 Conflict --> GetStatusRefetch[OsmApi::GET <br/> /changeset/:osmId]
    UploadStatus -- 4XX Unrecoverable --> Unrecoverable
    UploadStatus -- 5XXdiff --> Retry[Throw Error: BullMQ Retry]

    %% Path: Already Full
    StatusCheck -- "Open & Full <br/> OR <br/> Closed & Full" --> Cleanup

    %% Path: Dead State
    StatusCheck -- "Closed & Empty" --> NewFlow

    %% Conflict Refetch Logic
    GetStatusRefetch --> StatusCheckRefetch{Changeset Status?}
    StatusCheckRefetch -- "Closed & Full" --> Cleanup
    StatusCheckRefetch -- "Closed & Empty" --> NewFlow

    %% Flow Recovery
    NewFlow[CREATE NEW <br/> pre-upload job]
    NewFlow --> Terminate[Throw UnrecoverableError]

    %% Finalize
    Cleanup[5. Publish Cleanup Jobs]
    Cleanup --> Finish((Complete Job<br/> & Return osmId))

```

### Stage III: post upload:
This stage performs ID reconciliation in `id-2-osm`. It fetches the permanent OSM IDs generated during the upload using `change-merger` interpretation, maps them to local entities, and finalizes the tracking state.

```mermaid
graph TD
    Start((Start Job)) --> GetStage2[Fetch osmId from <br/> upload-stage]

    GetStage2 --> Interpret[1. Change-Merger::GET <br/> /change/:osmId/interpret]

    Interpret --> IsRequestNull

    IsRequestNull{Interpretation is <br/> empty?}

    IsRequestNull -- No --> Id2Osm[2. Id-2-Osm::POST <br/> /entity/bulk]
    IsRequestNull -- Yes --> TrackerClose

    Id2Osm --> Id2OsmStatus{Status?}

    Id2OsmStatus -- Success --> TrackerClose
    Id2OsmStatus -- 409 Conflict --> Unrecoverable[Throw UnrecoverableError]
    Id2OsmStatus -- 5XX --> Retry[Throw Error: BullMQ Retry]

    TrackerClose[3. Tracker::PATCH <br/> /changeset/:changesetId/entities]

    TrackerClose --> Finish((Complete Job))

```

### Stage IV: closure
The purpose of this final stage is triggering asynchronous lifecycle finalization in `osm-sync-tracker`. Operating as a batch worker, it aggregates multiple completed flows to signal `osm-sync-tracker` that these changesets are up for closure, triggering closure chain reaction.

```mermaid

graph TD
    Start((Start Batch)) --> BatchProcess[Tracker::POST <br/> /changeset/closure]

    BatchProcess --> Status{Status?}

    Status -- Success --> Finish((Finish Batch))
    Status -- Error --> Retry[Throw Error: BullMQ Retry]
```

### Cleanup Stages: Redis & OSM Cleanup
After the 2nd stage of uploading the changeset completes successfuly, two independent batch cleanup workers run in parallel to release resources.

#### Redis Cleanup (changeset-redis-cleanup queue)
Deletes changeset merge request data from Redis that was stored at the beginning of the flow. Jobs are processed in batches — all changeset keys in a batch are deleted in a single atomic operation.
This stage is purely internal and has no external service dependencies beyond Redis itself.

#### OSM Cleanup (changeset-osm-cleanup queue)
Attempts to explicitly close changesets on the OSM API. Jobs are processed in batches with each close call executed concurrently via Promise.allSettled, meaning a failure on one changeset does not block the others.
Even if a changeset closure fails, it will be closed automaticly after 24h by OSM internal triggers.

## API
Checkout the OpenAPI spec [here](/openapi3.yaml)


## Configuration

All configuration values can be set via environment variables. Values marked as **Required** have no default and must be provided.

---

## Server

| Key | Env Var | Description | Type | Required | Default |
|-----|---------|-------------|------|----------|---------|
| `server.request.payload.limit` | `REQUEST_PAYLOAD_LIMIT` | Maximum request payload size | string | No | `1mb` |
| `server.response.compression.enabled` | `RESPONSE_COMPRESSION_ENABLED` | Enable response compression | boolean | No | `true` |

---

## Telemetry

| Key | Env Var | Description | Type | Required | Default |
|-----|---------|-------------|------|----------|---------|
| `telemetry.shared.serviceName` | `TELEMETRY_SERVICE_NAME` | Service name reported to telemetry backends | string | Yes | — |
| `telemetry.shared.hostname` | `TELEMETRY_HOST_NAME` | Hostname reported to telemetry backends | string | Yes | — |
| `telemetry.shared.serviceVersion` | `TELEMETRY_SERVICE_VERSION` | Service version reported to telemetry backends | string | Yes | — |
| `telemetry.logger.level` | `LOG_LEVEL` | Log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) | string | No | `info` |
| `telemetry.logger.prettyPrint` | `LOG_PRETTY_PRINT_ENABLED` | Enable pretty-printed log output | boolean | No | `false` |
| `telemetry.tracing.isEnabled` | `TELEMETRY_TRACING_ENABLED` | Enable distributed tracing | boolean | No | `false` |
| `telemetry.tracing.url` | `TELEMETRY_TRACING_URL` | Tracing collector URL | string | No | — |
| `telemetry.metrics.enabled` | `TELEMETRY_METRICS_ENABLED` | Enable metrics export | boolean | No | `false` |
| `telemetry.metrics.url` | `TELEMETRY_METRICS_URL` | Metrics collector URL | string | No | — |
| `telemetry.metrics.interval` | `TELEMETRY_METRICS_INTERVAL` | Metrics export interval in ms | number | No | — |

---

## App

| Key | Env Var | Description | Type | Required | Default |
|-----|---------|-------------|------|----------|---------|
| `app.uiPath` | `APP_UI_PATH` | Path to serve the UI from | string | No | `/ui` |
| `app.initTimeout` | `APP_INIT_TIMEOUT` | Worker initialization timeout in ms | number | No | `30000` |
| `app.osmIdResolver` | `APP_OSM_ID_RESOLVER` | OSM ID resolver strategy (`tracker` or `childJob`) | string | No | `tracker` |

---

## Flows

### `changesetUpload`

| Key | Env Var | Description | Type | Required | Default |
|-----|---------|-------------|------|----------|---------|
| `app.flows.changesetUpload.maxAttempts` | `APP_FLOWS_CHANGESET_UPLOAD_MAX_ATTEMPTS` | Maximum number of flow re-initialization attempts before aborting | number | No | `10` |

---

## Queues

All queues share the same configuration structure. Fields marked as **Required** must be provided for each queue.

### Queue Env Var Prefixes

| Queue | Env Var Prefix |
|-------|---------------|
| `changesetPreUpload` | `APP_QUEUES_CHANGESET_PRE_UPLOAD` |
| `changesetUpload` | `APP_QUEUES_CHANGESET_UPLOAD` |
| `changesetPostUpload` | `APP_QUEUES_CHANGESET_POST_UPLOAD` |
| `changesetClosure` | `APP_QUEUES_CHANGESET_CLOSURE` |
| `changesetRedisCleanup` | `APP_QUEUES_CHANGESET_REDIS_CLEANUP` |
| `changesetOsmCleanup` | `APP_QUEUES_CHANGESET_OSM_CLEANUP` |

### Job Options

| Key | Env Var suffix | Description | Type | Required | Default |
|-----|----------------|-------------|------|----------|---------|
| `jobOptions.attempts` | `_JOB_ATTEMPTS` | Maximum number of job attempts | number | No | `10` |
| `jobOptions.delay` | `_JOB_DELAY` | Delay in ms before the job is processed | number | No | `0` |
| `jobOptions.backoff.type` | `_JOB_BACKOFF_TYPE` | Backoff strategy (`exponential` or `fixed`) | string | No | `fixed` |
| `jobOptions.backoff.delay` | `_JOB_BACKOFF_DELAY` | Base backoff delay in ms | number | No | `5000` (`3600000` for `changesetUpload`) |

### Worker Options

| Key | Env Var suffix | Description | Type | Required | Default |
|-----|----------------|-------------|------|----------|---------|
| `workerOptions.concurrency` | `_WORKER_CONCURRENCY` | Number of jobs processed concurrently | number | No | `1` |
| `workerOptions.limiter.max` | `_WORKER_LIMITER_MAX` | Max jobs processed per limiter duration (only applied when limiter is enabled) | number | No | `100` |
| `workerOptions.limiter.duration` | `_WORKER_LIMITER_DURATION` | Limiter window duration in ms (only applied when limiter is enabled) | number | No | `1000` |
| `workerOptions.lockDuration` | `_WORKER_LOCK_DURATION` | Duration of a single job lock in ms | number | No | `30000` |
| `workerOptions.maxStalledCount` | `_WORKER_MAX_STALLED_COUNT` | Max number of times a job can stall before failing | number | No | `1` |
| `workerOptions.stalledInterval` | `_WORKER_STALLED_INTERVAL` | Interval in ms to check for stalled jobs | number | No | `30000` |
| `workerOptions.removeOnComplete.age` | `_WORKER_REMOVE_ON_COMPLETE_AGE` | Max age in seconds to keep completed jobs | number | No | `3600` |
| `workerOptions.removeOnComplete.count` | `_WORKER_REMOVE_ON_COMPLETE_COUNT` | Max number of completed jobs to keep | number | No | — |
| `workerOptions.removeOnFail.age` | `_WORKER_REMOVE_ON_FAIL_AGE` | Max age in seconds to keep failed jobs | number | No | `86400` |
| `workerOptions.removeOnFail.count` | `_WORKER_REMOVE_ON_FAIL_COUNT` | Max number of failed jobs to keep | number | No | — |

### Batch Options *(only applicable to batch workers which are `changesetClosure`, `changesetRedisCleanup`, `changesetOsmCleanup`)*

| Key | Env Var suffix | Description | Type | Required | Default |
|-----|----------------|-------------|------|----------|---------|
| `batchOptions.size` | `_BATCH_SIZE` | Maximum batch size that triggers an immediate flush | number | No | `10` |
| `batchOptions.minSize` | `_BATCH_MIN_SIZE` | Minimum number of jobs required to flush when the timer fires | number | No | `1` |
| `batchOptions.timeout` | `_BATCH_TIMEOUT` | Duration in ms to wait before attempting a flush | number | No | `5000` |
| `batchOptions.lockDuration` | `_BATCH_LOCK_DURATION` | Duration of a batch processing lock in ms | number | No | `30000` |

---

## Clients

All HTTP clients share the same configuration structure.

### Client Env Var Prefixes

| Client | Env Var Prefix |
|--------|---------------|
| `osmApi` | `APP_CLIENTS_OSM_API` |
| `osmSyncTracker` | `APP_CLIENTS_OSM_SYNC_TRACKER` |
| `changeMerger` | `APP_CLIENTS_CHANGE_MERGER` |
| `idToOsm` | `APP_CLIENTS_ID_TO_OSM` |

### Client Options

| Key | Env Var suffix | Description | Type | Required | Default |
|-----|----------------|-------------|------|----------|---------|
| `url` | `_URL` | Base URL of the service | string | Yes | — |
| `timeout` | `_TIMEOUT` | Request timeout in ms | number | No | `5000` |
| `enableRetryStrategy` | `_ENABLE_RETRY_STRATEGY` | Enable automatic request retries | boolean | No | `false` |
| `retryStrategy.retries` | `_RETRY_RETRIES` | Number of retry attempts (only applied when retry is enabled) | number | No | `3` |
| `retryStrategy.shouldResetTimeout` | `_RETRY_SHOULD_RESET_TIMEOUT` | Reset timeout on each retry (only applied when retry is enabled) | boolean | No | `true` |
| `retryStrategy.isExponential` | `_RETRY_IS_EXPONENTIAL` | Use exponential backoff between retries (only applied when retry is enabled) | boolean | No | `false` |
| `retryStrategy.delay` | `_RETRY_DELAY` | Base retry delay in ms (only applied when retry is enabled) | number | No | `5000` |
| `headers` | `_HEADERS` | Additional headers sent with every request (JSON object string) | JSON | No | `{}` |

### Auth Options *(optional, `osmApi` only)*

| Key | Env Var | Description | Type | Required | Default |
|-----|---------|-------------|------|----------|---------|
| `auth.type` | `APP_CLIENTS_OSM_API_AUTH_TYPE` | Auth type (`basic`, `oauth1`, or `oauth2`) | string | No | — |
| `auth.username` | `APP_CLIENTS_OSM_API_AUTH_USERNAME` | Username (basic auth only) | string | No | — |
| `auth.password` | `APP_CLIENTS_OSM_API_AUTH_PASSWORD` | Password (basic auth only) | string | No | — |
| `auth.accessToken` | `APP_CLIENTS_OSM_API_AUTH_ACCESS_TOKEN` | Access token (oauth1 and oauth2) | string | No | — |
| `auth.consumerKey` | `APP_CLIENTS_OSM_API_AUTH_CONSUMER_KEY` | Consumer key (oauth1 only) | string | No | — |
| `auth.consumerSecret` | `APP_CLIENTS_OSM_API_AUTH_CONSUMER_SECRET` | Consumer secret (oauth1 only) | string | No | — |
| `auth.accessTokenSecret` | `APP_CLIENTS_OSM_API_AUTH_ACCESS_TOKEN_SECRET` | Access token secret (oauth1 only) | string | No | — |

---

## Redis

| Key | Env Var | Description | Type | Required | Default |
|-----|---------|-------------|------|----------|---------|
| `redis.host` | `REDIS_HOST` | Redis host | string | Yes | `localhost` |
| `redis.port` | `REDIS_PORT` | Redis port | number | No | `6379` |
| `redis.username` | `REDIS_USERNAME` | Redis username | string | No | `""` |
| `redis.password` | `REDIS_PASSWORD` | Redis password | string | No | `""` |
| `redis.db` | `REDIS_DB` | Redis database index | number | No | `0` |
| `redis.keyPrefix` | `REDIS_KEY_PREFIX` | Key prefix for all Redis keys | string | No | — |
| `redis.enableSslAuth` | `REDIS_ENABLE_SSL_AUTH` | Enable SSL/TLS authentication | boolean | No | `false` |
| `redis.sslPaths.ca` | `REDIS_CA_PATH` | Path to CA certificate *(only when SSL enabled)* | string | No | — |
| `redis.sslPaths.key` | `REDIS_KEY_PATH` | Path to client key *(only when SSL enabled)* | string | No | — |
| `redis.sslPaths.cert` | `REDIS_CERT_PATH` | Path to client certificate *(only when SSL enabled)* | string | No | — |

---

## BullMQ

| Key | Env Var | Description | Type | Required | Default |
|-----|---------|-------------|------|----------|---------|
| `bullmq.host` | `BULLMQ_HOST` | BullMQ Redis host | string | Yes | `localhost` |
| `bullmq.port` | `BULLMQ_PORT` | BullMQ Redis port | number | No | `6379` |
| `bullmq.username` | `BULLMQ_USERNAME` | BullMQ Redis username | string | No | `""` |
| `bullmq.password` | `BULLMQ_PASSWORD` | BullMQ Redis password | string | No | `""` |
| `bullmq.db` | `BULLMQ_DB` | BullMQ Redis database index | number | No | `0` |
| `bullmq.keyPrefix` | `BULLMQ_KEY_PREFIX` | Key prefix for all BullMQ keys | string | No | `{naephi}` |
| `bullmq.enableSslAuth` | `BULLMQ_ENABLE_SSL_AUTH` | Enable SSL/TLS authentication | boolean | No | `false` |
| `bullmq.sslPaths.ca` | `BULLMQ_CA_PATH` | Path to CA certificate *(only when SSL enabled)* | string | No | — |
| `bullmq.sslPaths.key` | `BULLMQ_KEY_PATH` | Path to client key *(only when SSL enabled)* | string | No | — |
| `bullmq.sslPaths.cert` | `BULLMQ_CERT_PATH` | Path to client certificate *(only when SSL enabled)* | string | No | — |

---

## Running Tests

To run tests, run the following command

```bash
npm run test
```

To only run unit tests:
```bash
npm run test:unit
```

To only run integration tests:
```bash
npm run test:integration
```
