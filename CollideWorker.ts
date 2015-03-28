//load the babylon scripts.
var window = <Window> {};
importScripts("vendor/babylon.2.1-alpha.debug.js");
importScripts("CollideHost.js");

console.log("loading worker");

module BABYLONX {

   export class CollideWorker {

        private collisionsScalingMatrix = BABYLON.Matrix.Zero();
        private collisionTranformationMatrix = BABYLON.Matrix.Zero();

        constructor(public collider: BABYLON.Collider, private meshes_: { [n: number]: SerializedMesh; }, private finalPosition:BABYLON.Vector3) {

        }

        public collideWithWorld(position: BABYLON.Vector3, velocity: BABYLON.Vector3, maximumRetry: number, excludedMeshUniqueId?: number) {

            var closeDistance = BABYLON.Engine.CollisionsEpsilon * 10.0;
            //is initializing here correct? A quick look - looks like it is fine.
            
            if (this.collider.retry >= maximumRetry) {
                this.finalPosition.copyFrom(position);
                return;
            }

            this.collider._initialize(position, velocity, closeDistance);
        

            // Check all meshes

            for (var uniqueId in this.meshes_) {
                if (this.meshes_.hasOwnProperty(uniqueId) && parseInt(uniqueId) != excludedMeshUniqueId) {
                    var mesh: SerializedMesh = this.meshes_[uniqueId];
                    if(mesh.checkCollisions)
                        this.checkCollision(mesh);
                }
            }

            if (!this.collider.collisionFound) {
                position.addToRef(velocity, this.finalPosition);
                return;
            }

            if (velocity.x !== 0 || velocity.y !== 0 || velocity.z !== 0) {
                this.collider._getResponse(position, velocity);
            }

            if (velocity.length() <= closeDistance) {
                //console.log("webworker collision with " + this.collider.collidedMesh);
                this.finalPosition.copyFrom(position);
                return;
            }

            this.collider.retry++;
            this.collideWithWorld(position, velocity, maximumRetry, excludedMeshUniqueId);
        }

        private checkCollision(mesh: SerializedMesh) {

            if (!this.collider._canDoCollision(BABYLON.Vector3.FromArray(mesh.sphereCenter), mesh.sphereRadius, BABYLON.Vector3.FromArray(mesh.boxMinimum), BABYLON.Vector3.FromArray(mesh.boxMaximum))) {
                return;
            };

            // Transformation matrix
            BABYLON.Matrix.ScalingToRef(1.0 / this.collider.radius.x, 1.0 / this.collider.radius.y, 1.0 / this.collider.radius.z, this.collisionsScalingMatrix);
            var worldFromCache = BABYLON.Matrix.FromArray(mesh.worldMatrixFromCache);
            worldFromCache.multiplyToRef(this.collisionsScalingMatrix, this.collisionTranformationMatrix);

            this.processCollisionsForSubMeshes(this.collisionTranformationMatrix, mesh);
            //return colTransMat;
        }

        private processCollisionsForSubMeshes(transformMatrix: BABYLON.Matrix, mesh: SerializedMesh): void {
            var len: number;

            // No Octrees for now
            //if (this._submeshesOctree && this.useOctreeForCollisions) {
            //    var radius = collider.velocityWorldLength + Math.max(collider.radius.x, collider.radius.y, collider.radius.z);
            //    var intersections = this._submeshesOctree.intersects(collider.basePointWorld, radius);

            //    len = intersections.length;
            //    subMeshes = intersections.data;
            //} else {
            //    subMeshes = this.subMeshes;
            //    len = subMeshes.length;
            //}

            for (var index = 0; index < mesh.subMeshes.length; index++) {
                var subMesh = mesh.subMeshes[index];

                // Bounding test
                if (len > 1 && !this.checkSubmeshCollision(subMesh))
                    continue;

                subMesh['getMesh'] = function () {
                    return mesh.uniqueId;
                }
                this.collideForSubMesh(subMesh, transformMatrix, mesh.indices, mesh.positions);
            }
        }

        private collideForSubMesh(subMesh: SerializedSubMesh, transformMatrix: BABYLON.Matrix, indices, positions: Array<number>): void {
            var positionsArray = [];
            for (var i = 0; i < positions.length; i = i + 3) {
                var p = BABYLON.Vector3.FromArray([positions[i], positions[i + 1], positions[i + 2]]);
                positionsArray.push(p);
            }
            subMesh['_lastColliderTransformMatrix'] = transformMatrix.clone();
            subMesh['_lastColliderWorldVertices'] = [];
            subMesh['_trianglePlanes'] = [];
            var start = subMesh.verticesStart;
            var end = (subMesh.verticesStart + subMesh.verticesCount);
            for (var i = start; i < end; i++) {
                subMesh['_lastColliderWorldVertices'].push(BABYLON.Vector3.TransformCoordinates(positionsArray[i], transformMatrix));
            }
            subMesh['getMaterial'] = function () {
                return true;
            }
        
            //}
            // Collide
            this.collider._collide(subMesh, subMesh['_lastColliderWorldVertices'], indices, subMesh.indexStart, subMesh.indexStart + subMesh.indexCount, subMesh.verticesStart);
        }

        //TODO - this! :-)
        private checkSubmeshCollision(subMesh: SerializedSubMesh) {
            return true;
        }


    }

    export class CollisionDetector {

        private indexedDb_: IDBDatabase;

        private objectStoreName_: string;

        private meshes_: { [n: number]: SerializedMesh; } = {};

        public onOpenDatabaseMessage(payload: OpenDatabasePayload) {
            this.objectStoreName_ = payload.objectStoreName;
            this.openDatabase(payload.dbName, payload.dbVersion, false,(db) => {
                //indexedDB not available
                if (!db) {
                    postMessage({ error: WorkerErrorType.NO_INDEXEDDB }, undefined);
                } else {
                    postMessage({ error: WorkerErrorType.SUCCESS }, undefined);
                }
                this.indexedDb_ = db;
                this.getAllMeshes((meshes) => {
                    meshes.forEach((mesh) => {
                        this.meshes_[mesh.uniqueId] = mesh;
                    });
                });
            });
        }

        public onUpdateDatabaseMessage(payload: UpdateDatabasePayload) {
            if (!this.indexedDb_) return;
            this.getSpecificMeshes(payload.updatedMeshes,(meshes) => {
                meshes.forEach((mesh) => {
                    this.meshes_[mesh.uniqueId] = mesh;
                });
            });
        }

        public onCollideMessage(payload: CollidePayload) {
            var finalPosition = BABYLON.Vector3.Zero();
            //create a new collider
            var collider = new BABYLON.Collider();
            collider.radius = BABYLON.Vector3.FromArray(payload.collider.radius);
            
            var colliderWorker = new CollideWorker(collider, this.meshes_, finalPosition);
            colliderWorker.collideWithWorld(BABYLON.Vector3.FromArray(payload.collider.position), BABYLON.Vector3.FromArray(payload.collider.velocity), payload.maximumRetry, payload.excludedMeshUniqueId);
            var reply: CollisionReply = {
                collidedMeshUniqueId: <any> collider.collidedMesh,
                collisionId: payload.collisionId,
                newPosition: finalPosition.asArray(),
                error: WorkerErrorType.SUCCESS
            }

            postMessage(reply, undefined);
        }

        

        //This is sadly impossible in a single query!
        private getSpecificMeshes(meshesToFetch: Array<number>, callback: (meshes: Array<SerializedMesh>) => void) {
            var trans = this.indexedDb_.transaction([this.objectStoreName_]);
            var store = trans.objectStore(this.objectStoreName_);
            var meshes = [];

            trans.oncomplete = function (evt) {
                //console.log("transaction finished", meshes.length);
                callback(meshes);
            };

            var fetchObject = function (key: number) {
                var req = store.get(key);
                req.onsuccess = function (evt) {
                    meshes.push(req.result);
                }
            }

            meshesToFetch.forEach(function (key) {
                fetchObject(key);
            });
        }

        private getAllMeshes(callback: (meshes: Array<SerializedMesh>) => void) {
            var trans = this.indexedDb_.transaction([this.objectStoreName_]);
            var store = trans.objectStore(this.objectStoreName_);
            var meshes = [];

            trans.oncomplete = function (evt) {
                callback(meshes);
            };

            var cursorRequest = store.openCursor();

            cursorRequest.onerror = function (error) {
                console.log(error);
                postMessage({ error: WorkerErrorType.TRANSACTION_FAILED }, undefined);
            };

            cursorRequest.onsuccess = function (evt) {
                var cursor = evt.target['result'];
                if (cursor) {
                    meshes.push(cursor.value);
                    cursor.continue();
                }
            };
        }

        private openDatabase(dbName: string, dbVersion: number, deleteDatabase: boolean, successCallback: (db: IDBDatabase) => void) {
            //check for support!
            if (!indexedDB) {
                //return a null database
                successCallback(null);
            }
            if (deleteDatabase) {
                indexedDB.deleteDatabase(dbName);
            }
            var request = indexedDB.open(dbName, dbVersion);

            request.onerror = function (e: ErrorEvent) {
                console.log(e);
                postMessage({ error: WorkerErrorType.TRANSACTION_FAILED }, undefined);
            }

            request.onsuccess = function (event: Event) {
                var openedDb = event.target['result'];
                successCallback(openedDb);
            }
        }
   }

    var collisionDetector = new CollisionDetector();

    export var onNewMessage = function (event: MessageEvent) {
        var message = <BabylonMessage> event.data;
        switch (message.taskType) {
            case WorkerTaskType.OPEN_DB:
                collisionDetector.onOpenDatabaseMessage(<OpenDatabasePayload> message.payload);
                break;
            case WorkerTaskType.COLLIDE:
                collisionDetector.onCollideMessage(<CollidePayload> message.payload);
                break;
            case WorkerTaskType.DB_UPDATE:
                collisionDetector.onUpdateDatabaseMessage(<UpdateDatabasePayload> message.payload);
                break;
        }
    }

    
} 

onmessage = BABYLONX.onNewMessage;