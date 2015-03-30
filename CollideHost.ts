var worker: Worker;

module BABYLONX {

    export class CollisionHost {

        private _worker: Worker;
        private _indexedDBPersist: any; //IndexedDBPersist

        private _init: boolean;

        constructor(private _scene: BABYLON.Scene) {

            this._scene['collisionIndex'] = 0;

            this._scene['colliderQueue'] = [];
            this._init = false;

            this._indexedDBPersist = new BABYLONX['IndexedDBPersist'](scene);

            //Detect if worker is available.
            if (!Worker) {
                return;
            }

            this._worker = new Worker("CollideWorker.js");
            worker = this._worker;

            this._indexedDBPersist.onDatabaseUpdated = (meshes, geometries) => {
                var payload: BABYLONX.UpdateDatabasePayload = {
                    updatedMeshes: meshes,
                    updatedGeometries: geometries
                };
                var message: BABYLONX.BabylonMessage = {
                    payload: payload,
                    taskType: BABYLONX.WorkerTaskType.DB_UPDATE
                }
                this._worker.postMessage(message);
            }

            this._sendOpenDBMessage();

            this._worker.onmessage = this._onMessageFromWorker
        }

        public isInitialized() {
            return !!this._init;
        }

        private initSceneFunctions() {
            BABYLON.Scene.prototype._getNewPosition = function (position: BABYLON.Vector3, velocity: BABYLON.Vector3, collider: BABYLON.Collider, maximumRetry: number, finalPosition: BABYLON.Vector3, excludedMesh: BABYLON.AbstractMesh = null, onNewPosition?: (newPosition: BABYLON.Vector3, collidedMesh?: BABYLON.AbstractMesh) => void): void {
                position.divideToRef(collider.radius, this._scaledPosition);
                velocity.divideToRef(collider.radius, this._scaledVelocity);

                //this['collisionIndex'] = this['collisionIndex'] % 1000;

                var collisionId = this['collisionIndex']++;
                this['colliderQueue'][collisionId] = onNewPosition;

                if (worker) {
                    var payload: BABYLONX.CollidePayload = {
                        collider: {
                            position: this._scaledPosition.asArray(),
                            velocity: this._scaledVelocity.asArray(),
                            radius: collider.radius.asArray()
                        },
                        collisionId: collisionId,
                        excludedMeshUniqueId: excludedMesh ? excludedMesh['uniqueId'] : null,
                        maximumRetry: maximumRetry
                    };
                    var message: BABYLONX.BabylonMessage = {
                        payload: payload,
                        taskType: BABYLONX.WorkerTaskType.COLLIDE
                    }
                    //console.time("webworker");
                    worker.postMessage(message);
                }
            }

            BABYLON.FreeCamera.prototype._collideWithWorld = function (velocity: BABYLON.Vector3): void {
                var globalPosition: BABYLON.Vector3;

                if (this.parent) {
                    globalPosition = BABYLON.Vector3.TransformCoordinates(this.position, this.parent.getWorldMatrix());
                } else {
                    globalPosition = this.position;
                }

                globalPosition.subtractFromFloatsToRef(0, this.ellipsoid.y, 0, this._oldPosition);
                this._collider.radius = this.ellipsoid;

                this.getScene()._getNewPosition(this._oldPosition, velocity, this._collider, 3, null, null,
                    (newPosition: BABYLON.Vector3, collidedMesh: BABYLON.AbstractMesh) => {
                        this._newPosition.copyFrom(newPosition);
                        this._newPosition.multiplyInPlace(this._collider.radius);
                        this._newPosition.subtractToRef(this._oldPosition, this._diffPosition);

                        if (this._diffPosition.length() > BABYLON.Engine.CollisionsEpsilon) {
                            this.position.addInPlace(this._diffPosition);
                            if (this.onCollide) {
                                this.onCollide(this._collider.collidedMesh);
                            }
                        }
                        //console.timeEnd("webworker");
                    });

            }

            BABYLON.AbstractMesh.prototype.moveWithCollisions = function (velocity: BABYLON.Vector3): void {
                var globalPosition = this.getAbsolutePosition();

                globalPosition.subtractFromFloatsToRef(0, this.ellipsoid.y, 0, this._oldPositionForCollisions);
                this._oldPositionForCollisions.addInPlace(this.ellipsoidOffset);
                this._collider.radius = this.ellipsoid;

                this.getScene()._getNewPosition(this._oldPositionForCollisions, velocity, this._collider, 3, null, this,
                    (newPosition: BABYLON.Vector3, collidedMesh: BABYLON.AbstractMesh) => {
                        this._newPositionForCollisions.copyFrom(newPosition);
                        this._newPositionForCollisions.multiplyInPlace(this._collider.radius);
                        this._newPositionForCollisions.subtractToRef(this._oldPositionForCollisions, this._diffPositionForCollisions);

                        if (this._diffPositionForCollisions.length() > BABYLON.Engine.CollisionsEpsilon) {
                            this.position.addInPlace(this._diffPositionForCollisions);
                        }
                    });
            }
        }

        private _onMessageFromWorker = (e: MessageEvent) => {
            var returnData = <BABYLONX.CollisionReply> e.data;
            if (returnData.error == WorkerErrorType.NO_INDEXEDDB) {
                console.log("no indexeddb, fallback to normal collision detection");
                this._init = true;
                return;
            }
            if (!this._init) {
                console.log("webworker initialized");
                this.initSceneFunctions();
                this._init = true;
            }
            if (!returnData.collisionId) return;

            this._scene['colliderQueue'][returnData.collisionId](BABYLON.Vector3.FromArray(returnData.newPosition), this._scene.getMeshByUniqueID(returnData.collidedMeshUniqueId));
            //cleanup
            this._scene['colliderQueue'][returnData.collisionId] = undefined;
        }

        private _sendOpenDBMessage() {
            var openDbPayload: BABYLONX.OpenDatabasePayload = {
                dbName: "babylonJsMeshes",
                dbVersion: 1,
                objectStoreNameMeshes: "meshes",
                objectStoreNameGeometries: "geometries"
            };
            var message: BABYLONX.BabylonMessage = {
                payload: openDbPayload,
                taskType: BABYLONX.WorkerTaskType.OPEN_DB
            }
            this._worker.postMessage(message);
        }
    }

    export interface SerializedMesh {
        id: string;
        name: string;
        uniqueId: number;
        geometryId: string;
        sphereCenter: Array<number>;
        sphereRadius: number;
        boxMinimum: Array<number>;
        boxMaximum: Array<number>;
        worldMatrixFromCache: any;
        subMeshes: Array<SerializedSubMesh>;
        checkCollisions: boolean;
    }

    export interface SerializedSubMesh {
        position: number;
        verticesStart: number;
        verticesCount: number;
        indexStart: number;
        indexCount: number;
    }

    export interface SerializedGeometry {
        id: string;
        positions: Array<number>;
        indices: Array<number>;
        normals: Array<number>;
        uvs?: Array<number>;
    }

    export interface BabylonMessage {
        taskType: WorkerTaskType;
        payload: OpenDatabasePayload|CollidePayload|UpdateDatabasePayload /*any for TS under 1.4*/;
    }

    export interface SerializedColliderToWorker {
        position: Array<number>;
        velocity: Array<number>;
        radius: Array<number>;
    }

    export interface CollisionReply {
        error: WorkerErrorType;
        newPosition: Array<number>;
        collisionId: number;
        collidedMeshUniqueId: number;
    }

    export interface OpenDatabasePayload {
        dbName: string;
        dbVersion: number;
        objectStoreNameMeshes: string;
        objectStoreNameGeometries: string;
    }

    export interface CollidePayload {
        collisionId: number;
        collider: SerializedColliderToWorker;
        maximumRetry: number;
        excludedMeshUniqueId?: number;
    }

    export interface UpdateDatabasePayload {
        updatedMeshes: Array<number>;
        updatedGeometries: Array<string>;
    }

    export enum WorkerTaskType {
        OPEN_DB,
        COLLIDE,
        DB_UPDATE
    }

    export enum WorkerErrorType {
        SUCCESS,
        NO_INDEXEDDB,
        TRANSACTION_FAILED
    }

} 