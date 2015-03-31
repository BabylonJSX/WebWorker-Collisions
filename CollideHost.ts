﻿var worker: Worker;

module BABYLONX {

    export class CollisionHost {

        private _worker: Worker;
        private _indexedDBPersist: any; //IndexedDBPersist

        private _init: boolean;

        private _runningCollisionDetection: boolean = false;
        private _runningDatabaseUpdate: number = 0;

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
                if (this._runningDatabaseUpdate > 3) return;
                this._runningDatabaseUpdate++;
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
            BABYLON.Scene.prototype._getNewPosition = function (position: BABYLON.Vector3, velocity: BABYLON.Vector3, collider: BABYLON.Collider, maximumRetry: number, finalPosition: BABYLON.Vector3, excludedMesh: BABYLON.AbstractMesh = null, onNewPosition?: (newPosition: BABYLON.Vector3, collidedMesh?: BABYLON.AbstractMesh) => void, collisionIndex: number = 0): void {
                position.divideToRef(collider.radius, this._scaledPosition);
                velocity.divideToRef(collider.radius, this._scaledVelocity);

                //Collision Index should be according to the trigger, and not incremented,

                if (this['colliderQueue'][collisionIndex]) return;
                this['colliderQueue'][collisionIndex] = onNewPosition;

                if (worker) {
                    var payload: BABYLONX.CollidePayload = {
                        collider: {
                            position: this._scaledPosition.asArray(),
                            velocity: this._scaledVelocity.asArray(),
                            radius: collider.radius.asArray()
                        },
                        collisionId: collisionIndex,
                        excludedMeshUniqueId: excludedMesh ? excludedMesh.uniqueId : null,
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
                        //A simple hack to create a unique velocity id for gravity calculations.
                    }, velocity.equals(this.getScene().gravity) ? this.uniqueId * 10000 : this.uniqueId);

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
                    }, this.uniqueId);
            }
        }

        private _onMessageFromWorker = (e: MessageEvent) => {
            var returnData = <BABYLONX.WorkerReply> e.data;

            switch (returnData.taskType) {
                case WorkerTaskType.OPEN_DB:
                    if (returnData.error == WorkerErrorType.NO_INDEXEDDB) {
                        console.log("no indexeddb in worker, fallback to normal collision detection");
                    } else {
                        if (!this._init) {
                            console.log("webworker initialized");
                            this.initSceneFunctions();
                        }
                    }
                    this._init = true;
                    break;
                case WorkerTaskType.DB_UPDATE:
                    this._runningDatabaseUpdate--;
                    break;
                case WorkerTaskType.COLLIDE:
                    this._runningCollisionDetection = false;
                    var returnPayload : CollisionReplyPayload = returnData.payload;
                    if (!this._scene['colliderQueue'][returnPayload.collisionId]) return;

                    this._scene['colliderQueue'][returnPayload.collisionId](BABYLON.Vector3.FromArray(returnPayload.newPosition), this._scene.getMeshByUniqueID(returnPayload.collidedMeshUniqueId));
                    //cleanup
                    this._scene['colliderQueue'][returnPayload.collisionId] = undefined;
                    break;
            }

            
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

    export interface WorkerReply {
        error: WorkerErrorType;
        taskType: WorkerTaskType;
        payload?: any; 
    }

    export interface CollisionReplyPayload {
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