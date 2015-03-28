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

            this._worker = new Worker("CollideWorker.js");
            worker = this._worker;

            this._indexedDBPersist.onDatabaseUpdated = (meshes) => {
                var payload: BABYLONX.UpdateDatabasePayload = {
                    updatedMeshes: meshes 
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

        private initSceneFunctions() {
            BABYLON.Scene.prototype._getNewPosition = function (position: BABYLON.Vector3, velocity: BABYLON.Vector3, collider: BABYLON.Collider, maximumRetry: number, finalPosition: BABYLON.Vector3, excludedMesh: BABYLON.AbstractMesh = null, onNewPosition?: (newPosition: BABYLON.Vector3, collidedMesh?: BABYLON.AbstractMesh) => void): void {
                position.divideToRef(collider.radius, this._scaledPosition);
                velocity.divideToRef(collider.radius, this._scaledVelocity);

                this['collisionIndex'] = this['collisionIndex'] % 1000;

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
                        excludedMeshUniqueId: null,//excludedMesh['uniqueId'],
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

                this.getScene()._getNewPosition(this._oldPosition, velocity, this._collider, 3, null, null,(newPosition: BABYLON.Vector3, collidedMesh: BABYLON.AbstractMesh) => {
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

        }

        private _onMessageFromWorker = (e: MessageEvent) => {
            var returnData = <BABYLONX.CollisionReply> e.data;
            if (returnData.error == WorkerErrorType.NO_INDEXEDDB) {
                console.log("no indexeddb, fallback to normal collision detection");
                return;
            } 
            if (!this._init) {
                console.log("webworker initialized");
                this.initSceneFunctions();
                this._init = true;
            }
            if (!returnData.collisionId) return;

            this._scene['colliderQueue'][returnData.collisionId](BABYLON.Vector3.FromArray(returnData.newPosition), null);
            //cleanup
            this._scene['colliderQueue'][returnData.collisionId] = undefined;
        }

        private _sendOpenDBMessage() {
            var openDbPayload: BABYLONX.OpenDatabasePayload = {
                dbName: "babylonJsMeshes",
                dbVersion: 1,
                objectStoreName: "meshes"
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
        indices: Array<number>;
        positions: Array<number>;
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
        objectStoreName: string;
    }

    export interface CollidePayload {
        collisionId: number;
        collider: SerializedColliderToWorker;
        maximumRetry: number;
        excludedMeshUniqueId?: number;
    }

    export interface UpdateDatabasePayload {
        updatedMeshes: Array<number>;
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