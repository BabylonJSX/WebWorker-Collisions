var window = {};
importScripts("vendor/babylon.2.1-alpha.debug.js");
importScripts("CollideHost.js");
console.log("loading worker");
var BABYLONX;
(function (BABYLONX) {
    var CollisionCache = (function () {
        function CollisionCache() {
            this._meshes = {};
            this._geometries = {};
        }
        CollisionCache.prototype.getMeshes = function () {
            return this._meshes;
        };
        CollisionCache.prototype.getGeometries = function () {
            return this._geometries;
        };
        CollisionCache.prototype.getMesh = function (id) {
            return this._meshes[id];
        };
        CollisionCache.prototype.addMesh = function (mesh) {
            this._meshes[mesh.uniqueId] = mesh;
        };
        CollisionCache.prototype.getGeometry = function (id) {
            return this._geometries[id];
        };
        CollisionCache.prototype.addGeometry = function (geometry) {
            this._geometries[geometry.id] = geometry;
        };
        return CollisionCache;
    })();
    BABYLONX.CollisionCache = CollisionCache;
    var CollideWorker = (function () {
        function CollideWorker(collider, _collisionCache, finalPosition) {
            this.collider = collider;
            this._collisionCache = _collisionCache;
            this.finalPosition = finalPosition;
            this.collisionsScalingMatrix = BABYLON.Matrix.Zero();
            this.collisionTranformationMatrix = BABYLON.Matrix.Zero();
        }
        CollideWorker.prototype.collideWithWorld = function (position, velocity, maximumRetry, excludedMeshUniqueId) {
            var closeDistance = BABYLON.Engine.CollisionsEpsilon * 10.0;
            if (this.collider.retry >= maximumRetry) {
                this.finalPosition.copyFrom(position);
                return;
            }
            this.collider._initialize(position, velocity, closeDistance);
            var meshes = this._collisionCache.getMeshes();
            for (var uniqueId in meshes) {
                if (meshes.hasOwnProperty(uniqueId) && parseInt(uniqueId) != excludedMeshUniqueId) {
                    var mesh = meshes[uniqueId];
                    if (mesh.checkCollisions)
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
                this.finalPosition.copyFrom(position);
                return;
            }
            this.collider.retry++;
            this.collideWithWorld(position, velocity, maximumRetry, excludedMeshUniqueId);
        };
        CollideWorker.prototype.checkCollision = function (mesh) {
            if (!this.collider._canDoCollision(BABYLON.Vector3.FromArray(mesh.sphereCenter), mesh.sphereRadius, BABYLON.Vector3.FromArray(mesh.boxMinimum), BABYLON.Vector3.FromArray(mesh.boxMaximum))) {
                return;
            }
            ;
            BABYLON.Matrix.ScalingToRef(1.0 / this.collider.radius.x, 1.0 / this.collider.radius.y, 1.0 / this.collider.radius.z, this.collisionsScalingMatrix);
            var worldFromCache = BABYLON.Matrix.FromArray(mesh.worldMatrixFromCache);
            worldFromCache.multiplyToRef(this.collisionsScalingMatrix, this.collisionTranformationMatrix);
            this.processCollisionsForSubMeshes(this.collisionTranformationMatrix, mesh);
        };
        CollideWorker.prototype.processCollisionsForSubMeshes = function (transformMatrix, mesh) {
            var len;
            if (!mesh.geometryId) {
                console.log("no mesh geometry id");
                return;
            }
            var meshGeometry = this._collisionCache.getGeometry(mesh.geometryId);
            if (!meshGeometry) {
                console.log("couldn't find geometry", mesh.geometryId);
                return;
            }
            for (var index = 0; index < mesh.subMeshes.length; index++) {
                var subMesh = mesh.subMeshes[index];
                if (len > 1 && !this.checkSubmeshCollision(subMesh))
                    continue;
                subMesh['getMesh'] = function () {
                    return mesh.uniqueId;
                };
                this.collideForSubMesh(subMesh, transformMatrix, meshGeometry);
            }
        };
        CollideWorker.prototype.collideForSubMesh = function (subMesh, transformMatrix, meshGeometry) {
            var positionsArray = [];
            for (var i = 0; i < meshGeometry.positions.length; i = i + 3) {
                var p = BABYLON.Vector3.FromArray([meshGeometry.positions[i], meshGeometry.positions[i + 1], meshGeometry.positions[i + 2]]);
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
            };
            this.collider._collide(subMesh, subMesh['_lastColliderWorldVertices'], meshGeometry.indices, subMesh.indexStart, subMesh.indexStart + subMesh.indexCount, subMesh.verticesStart);
        };
        CollideWorker.prototype.checkSubmeshCollision = function (subMesh) {
            return true;
        };
        return CollideWorker;
    })();
    BABYLONX.CollideWorker = CollideWorker;
    var CollisionDetectorTransferable = (function () {
        function CollisionDetectorTransferable() {
        }
        CollisionDetectorTransferable.prototype.onInit = function (payload) {
            this._collisionCache = new CollisionCache();
            var reply = {
                error: BABYLONX.WorkerErrorType.SUCCESS,
                taskType: BABYLONX.WorkerTaskType.OPEN_DB
            };
            postMessage(reply, undefined);
        };
        CollisionDetectorTransferable.prototype.onUpdate = function (payload) {
            for (var id in payload.updatedGeometries) {
                if (payload.updatedGeometries.hasOwnProperty(id)) {
                    this._collisionCache.addGeometry(payload.updatedGeometries[id]);
                }
            }
            for (var uniqueId in payload.updatedMeshes) {
                if (payload.updatedMeshes.hasOwnProperty(uniqueId)) {
                    this._collisionCache.addMesh(payload.updatedMeshes[uniqueId]);
                }
            }
            var replay = {
                error: BABYLONX.WorkerErrorType.SUCCESS,
                taskType: BABYLONX.WorkerTaskType.DB_UPDATE
            };
            console.log("updated");
            postMessage(replay, undefined);
        };
        CollisionDetectorTransferable.prototype.onCollision = function (payload) {
            var finalPosition = BABYLON.Vector3.Zero();
            var collider = new BABYLON.Collider();
            collider.radius = BABYLON.Vector3.FromArray(payload.collider.radius);
            var colliderWorker = new CollideWorker(collider, this._collisionCache, finalPosition);
            colliderWorker.collideWithWorld(BABYLON.Vector3.FromArray(payload.collider.position), BABYLON.Vector3.FromArray(payload.collider.velocity), payload.maximumRetry, payload.excludedMeshUniqueId);
            var replyPayload = {
                collidedMeshUniqueId: collider.collidedMesh,
                collisionId: payload.collisionId,
                newPosition: finalPosition.asArray()
            };
            var reply = {
                error: BABYLONX.WorkerErrorType.SUCCESS,
                taskType: BABYLONX.WorkerTaskType.COLLIDE,
                payload: replyPayload
            };
            postMessage(reply, undefined);
        };
        return CollisionDetectorTransferable;
    })();
    BABYLONX.CollisionDetectorTransferable = CollisionDetectorTransferable;
    var CollisionDetectorIndexedDB = (function () {
        function CollisionDetectorIndexedDB() {
        }
        CollisionDetectorIndexedDB.prototype.onInit = function (payload) {
            var _this = this;
            this._collisionCache = new CollisionCache();
            this._objectStoreNameMeshes = payload.objectStoreNameMeshes;
            this._objectStoreNameGeometries = payload.objectStoreNameGeometries;
            this.openDatabase(payload.dbName, payload.dbVersion, false, function (db) {
                var reply = {
                    error: BABYLONX.WorkerErrorType.SUCCESS,
                    taskType: BABYLONX.WorkerTaskType.OPEN_DB
                };
                if (!db) {
                    reply.error = BABYLONX.WorkerErrorType.NO_INDEXEDDB;
                    postMessage(reply, undefined);
                }
                else {
                    _this._indexedDb = db;
                    _this.getAllMeshes(function (meshes) {
                        meshes.forEach(function (mesh) {
                            _this._collisionCache.addMesh(mesh);
                        });
                        _this.getAllGeometries(function (geometries) {
                            geometries.forEach(function (geometry) {
                                _this._collisionCache.addGeometry(geometry);
                            });
                            postMessage(reply, undefined);
                        });
                    });
                }
            });
        };
        CollisionDetectorIndexedDB.prototype.onUpdate = function (payload) {
            var _this = this;
            if (!this._indexedDb)
                return;
            this.getSpecificMeshes(payload.updatedMeshes, function (meshes) {
                meshes.forEach(function (mesh) {
                    _this._collisionCache.addMesh(mesh);
                });
                _this.getSpecificGeometries(payload.updatedGeometries, function (geometries) {
                    geometries.forEach(function (geometry) {
                        _this._collisionCache.addGeometry(geometry);
                    });
                    var replay = {
                        error: BABYLONX.WorkerErrorType.SUCCESS,
                        taskType: BABYLONX.WorkerTaskType.DB_UPDATE
                    };
                    console.log("updated");
                    postMessage(replay, undefined);
                });
            });
        };
        CollisionDetectorIndexedDB.prototype.onCollision = function (payload) {
            var finalPosition = BABYLON.Vector3.Zero();
            var collider = new BABYLON.Collider();
            collider.radius = BABYLON.Vector3.FromArray(payload.collider.radius);
            var colliderWorker = new CollideWorker(collider, this._collisionCache, finalPosition);
            colliderWorker.collideWithWorld(BABYLON.Vector3.FromArray(payload.collider.position), BABYLON.Vector3.FromArray(payload.collider.velocity), payload.maximumRetry, payload.excludedMeshUniqueId);
            var replyPayload = {
                collidedMeshUniqueId: collider.collidedMesh,
                collisionId: payload.collisionId,
                newPosition: finalPosition.asArray()
            };
            var reply = {
                error: BABYLONX.WorkerErrorType.SUCCESS,
                taskType: BABYLONX.WorkerTaskType.COLLIDE,
                payload: replyPayload
            };
            postMessage(reply, undefined);
        };
        CollisionDetectorIndexedDB.prototype.getSpecificMeshes = function (meshesToFetch, callback) {
            var trans = this._indexedDb.transaction([this._objectStoreNameMeshes]);
            var store = trans.objectStore(this._objectStoreNameMeshes);
            var meshes = [];
            trans.oncomplete = function (evt) {
                callback(meshes);
            };
            var fetchObject = function (key) {
                var req = store.get(key);
                req.onsuccess = function (evt) {
                    meshes.push(req.result);
                };
            };
            meshesToFetch.forEach(function (key) {
                fetchObject(key);
            });
        };
        CollisionDetectorIndexedDB.prototype.getAllMeshes = function (callback) {
            var trans = this._indexedDb.transaction([this._objectStoreNameMeshes]);
            var store = trans.objectStore(this._objectStoreNameMeshes);
            var meshes = [];
            trans.oncomplete = function (evt) {
                callback(meshes);
            };
            var cursorRequest = store.openCursor();
            cursorRequest.onerror = function (error) {
                console.log(error);
                postMessage({ error: BABYLONX.WorkerErrorType.TRANSACTION_FAILED }, undefined);
            };
            cursorRequest.onsuccess = function (evt) {
                var cursor = evt.target['result'];
                if (cursor) {
                    meshes.push(cursor.value);
                    cursor.continue();
                }
            };
        };
        CollisionDetectorIndexedDB.prototype.getSpecificGeometries = function (geometriesToFetch, callback) {
            var trans = this._indexedDb.transaction([this._objectStoreNameGeometries]);
            var store = trans.objectStore(this._objectStoreNameGeometries);
            var geometries = [];
            trans.oncomplete = function (evt) {
                callback(geometries);
            };
            var fetchObject = function (key) {
                var req = store.get(key);
                req.onsuccess = function (evt) {
                    geometries.push(req.result);
                };
            };
            geometriesToFetch.forEach(function (key) {
                fetchObject(key);
            });
        };
        CollisionDetectorIndexedDB.prototype.getAllGeometries = function (callback) {
            var trans = this._indexedDb.transaction([this._objectStoreNameGeometries]);
            var store = trans.objectStore(this._objectStoreNameGeometries);
            var geometries = [];
            trans.oncomplete = function (evt) {
                callback(geometries);
            };
            var cursorRequest = store.openCursor();
            cursorRequest.onerror = function (error) {
                console.log(error);
                postMessage({ error: BABYLONX.WorkerErrorType.TRANSACTION_FAILED }, undefined);
            };
            cursorRequest.onsuccess = function (evt) {
                var cursor = evt.target['result'];
                if (cursor) {
                    geometries.push(cursor.value);
                    cursor.continue();
                }
            };
        };
        CollisionDetectorIndexedDB.prototype.openDatabase = function (dbName, dbVersion, deleteDatabase, successCallback) {
            if (!indexedDB) {
                successCallback(null);
            }
            if (deleteDatabase) {
                indexedDB.deleteDatabase(dbName);
            }
            var request = indexedDB.open(dbName, dbVersion);
            request.onerror = function (e) {
                console.log(e);
                postMessage({ error: BABYLONX.WorkerErrorType.TRANSACTION_FAILED }, undefined);
            };
            request.onsuccess = function (event) {
                var openedDb = event.target['result'];
                successCallback(openedDb);
            };
        };
        return CollisionDetectorIndexedDB;
    })();
    BABYLONX.CollisionDetectorIndexedDB = CollisionDetectorIndexedDB;
    var collisionDetector = new CollisionDetectorTransferable();
    BABYLONX.onNewMessage = function (event) {
        var message = event.data;
        switch (message.taskType) {
            case BABYLONX.WorkerTaskType.OPEN_DB:
                collisionDetector.onInit(message.payload);
                break;
            case BABYLONX.WorkerTaskType.COLLIDE:
                collisionDetector.onCollision(message.payload);
                break;
            case BABYLONX.WorkerTaskType.DB_UPDATE:
                collisionDetector.onUpdate(message.payload);
                break;
        }
    };
})(BABYLONX || (BABYLONX = {}));
onmessage = BABYLONX.onNewMessage;
