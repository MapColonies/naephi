# naephi
- nae: Scottish English or Northern English for no or not
- phi ( Φ, φ ):
    1. a plane angle.
    2. a polar coordinate.
    3. in mathematics, the Greek letter φ denotes the golden ratio.

`naephi` leverages `BullMQ` flow to build an `OSM` `changeset` upload flow, that is being processed in 4 stages:

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

## API
Checkout the OpenAPI spec [here](/openapi3.yaml)


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
