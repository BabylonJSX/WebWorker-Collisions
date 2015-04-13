var worker: Worker;

module BABYLONX {

    export class CollisionHost {

        private _worker: Worker;
        private _indexedDBPersist: any; //IndexedDBPersist

        private _init: boolean;

        private _runningCollisionDetection: boolean = false;
        private _runningDatabaseUpdate: number = 0;

        private _addUpdateList: { [n: number]: SerializedMesh; }//: Array<SerializedMesh>;
        private _addUpdateListGeometries: { [s: string]: SerializedGeometry; };

        constructor(private _scene: BABYLON.Scene, transferables: boolean = false) {

            this._scene['collisionIndex'] = 0;

            this._scene['colliderQueue'] = [];
            this._init = false;

            //Detect if worker is available.
            if (!Worker) {
                return;
            }

            this._worker = new Worker("CollideWorker.js");
            worker = this._worker;
            this._worker.onmessage = this._onMessageFromWorker

            if (!transferables) {
                this._indexedDBPersist = new BABYLONX['IndexedDBPersist'](scene);
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

            } else {

                this._addUpdateList = {};
                this._addUpdateListGeometries = {};
                console.log("registering");

                this._scene.onNewMeshAdded = this._onMeshAdded;
                this._scene.onMeshRemoved = this._onMeshRemoved;
                this._scene.onGeometryAdded = this._onGeometryAdded;
                this._scene.onGeometryRemoved = this._onGeometryRemoved;
                this._scene.registerAfterRender(this._afterRender);
                //if (processRegistered) {
                    //register already-created meshes and geometries
                    setTimeout(() => {
                        this._scene.meshes.forEach((node) => {
                            this._onMeshAdded(node);
                        });
                        this._scene.getGeometries().forEach((geometry) => {
                            this._onGeometryAdded(geometry);
                        });
                    });
                //}

                    var message: BABYLONX.BabylonMessage = {
                        payload: {},
                        taskType: BABYLONX.WorkerTaskType.OPEN_DB
                    }
                    this._worker.postMessage(message);

            }
            
        }

        public isInitialized() {
            return !!this._init;
        }

        private _onMeshAdded = (mesh: BABYLON.AbstractMesh) => {
            mesh.registerAfterWorldMatrixUpdate(this._onMeshUpdated);
            //console.log("mesh added");
            this._onMeshUpdated(mesh);
        }

        private _onMeshRemoved = (mesh: BABYLON.AbstractMesh) => {
            //this._remvoeList.push(mesh.uniqueId);
        }

        private _onMeshUpdated = (mesh: BABYLON.AbstractMesh) => {
            //console.log("mesh updated");
            this._addUpdateList[mesh.uniqueId] = CollisionHost.SerializeMesh(mesh);
        }

        private _onGeometryAdded = (geometry: BABYLON.Geometry) => {
            geometry.onGeometryUpdated = this._onGeometryUpdated;
            this._onGeometryUpdated(geometry);
        }

        private _onGeometryRemoved = (geometry: BABYLON.Geometry) => {
            //this._removeListGeometries.push(geometry.id);
        }

        private _onGeometryUpdated = (geometry: BABYLON.Geometry) => {
            this._addUpdateListGeometries[geometry.id] = CollisionHost.SerializeGeometry(geometry);
        }

        private _afterRender = () => {
            var payload: BABYLONX.UpdateWithTransferable = {
                updatedMeshes: this._addUpdateList,
                updatedGeometries: this._addUpdateListGeometries
            };
            var message: BABYLONX.BabylonMessage = {
                payload: payload,
                taskType: BABYLONX.WorkerTaskType.DB_UPDATE
            }
            var serializable = [];
            for (var id in payload.updatedGeometries) {
                if (payload.updatedGeometries.hasOwnProperty(id)) {
                    serializable.push((<BABYLONX.UpdateWithTransferable> message.payload).updatedGeometries[id].indices.buffer);
                    serializable.push((<BABYLONX.UpdateWithTransferable> message.payload).updatedGeometries[id].normals.buffer);
                    serializable.push((<BABYLONX.UpdateWithTransferable> message.payload).updatedGeometries[id].positions.buffer);
                    serializable.push((<BABYLONX.UpdateWithTransferable> message.payload).updatedGeometries[id].uvs.buffer);
                }
            }
            this._worker.postMessage(message, serializable);
            this._addUpdateList = {};
            this._addUpdateListGeometries = {};
        }

        //TEMP
        public static SerializeMesh = function (mesh: BABYLON.AbstractMesh): SerializedMesh {
            var submeshes = [];
            if (mesh.subMeshes) {
                submeshes = mesh.subMeshes.map(function (sm, idx) {
                    return {
                        position: idx,
                        verticesStart: sm.verticesStart,
                        verticesCount: sm.verticesCount,
                        indexStart: sm.indexStart,
                        indexCount: sm.indexCount
                    }
                });
            }

            var geometryId = (<BABYLON.Mesh>mesh).geometry ? (<BABYLON.Mesh>mesh).geometry.id : null;

            return {
                uniqueId: mesh.uniqueId,
                id: mesh.id,
                name: mesh.name,
                geometryId: geometryId,
                sphereCenter: mesh.getBoundingInfo().boundingSphere.centerWorld.asArray(),
                sphereRadius: mesh.getBoundingInfo().boundingSphere.radiusWorld,
                boxMinimum: mesh.getBoundingInfo().boundingBox.minimumWorld.asArray(),
                boxMaximum: mesh.getBoundingInfo().boundingBox.maximumWorld.asArray(),
                worldMatrixFromCache: mesh.worldMatrixFromCache.asArray(),
                subMeshes: submeshes,
                checkCollisions: mesh.checkCollisions
            }
        }

        public static SerializeGeometry = function (geometry: BABYLON.Geometry): SerializedGeometry {
            return {
                id: geometry.id,
                positions: new Float32Array(geometry.getVerticesData(BABYLON.VertexBuffer.PositionKind) || []),
                normals: new Float32Array(geometry.getVerticesData(BABYLON.VertexBuffer.NormalKind) || []),
                indices: new Int32Array(geometry.getIndices() || []),
                uvs: new Float32Array(geometry.getVerticesData(BABYLON.VertexBuffer.UVKind) || [])
            }
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
        positions: Float32Array;
        indices: Int32Array;
        normals: Float32Array;
        uvs?: Float32Array;
    }

    export interface BabylonMessage {
        taskType: WorkerTaskType;
        payload: InitPayload|CollidePayload|UpdatePayload /*any for TS under 1.4*/;
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

    export interface InitPayload {

    }

    export interface OpenDatabasePayload extends InitPayload {
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

    export interface UpdatePayload {

    }

    export interface UpdateDatabasePayload extends UpdatePayload {
        updatedMeshes: Array<number>;
        updatedGeometries: Array<string>;
    }

    export interface UpdateWithTransferable extends UpdatePayload {
        updatedMeshes: { [n: number]: SerializedMesh; };
        updatedGeometries: { [s: string]: SerializedGeometry; };
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