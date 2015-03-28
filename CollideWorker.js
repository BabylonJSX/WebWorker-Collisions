var window = {};
importScripts("vendor/babylon.2.1-alpha.debug.js");
importScripts("CollideHost.js");
console.log("loading worker");
var BABYLONX;
(function (BABYLONX) {
    var CollideWorker = (function () {
        function CollideWorker(collider, meshes_, finalPosition) {
            this.collider = collider;
            this.meshes_ = meshes_;
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
            for (var uniqueId in this.meshes_) {
                if (this.meshes_.hasOwnProperty(uniqueId) && parseInt(uniqueId) != excludedMeshUniqueId) {
                    var mesh = this.meshes_[uniqueId];
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
            for (var index = 0; index < mesh.subMeshes.length; index++) {
                var subMesh = mesh.subMeshes[index];
                if (len > 1 && !this.checkSubmeshCollision(subMesh))
                    continue;
                subMesh['getMesh'] = function () {
                    return mesh.uniqueId;
                };
                this.collideForSubMesh(subMesh, transformMatrix, mesh.indices, mesh.positions);
            }
        };
        CollideWorker.prototype.collideForSubMesh = function (subMesh, transformMatrix, indices, positions) {
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
            };
            this.collider._collide(subMesh, subMesh['_lastColliderWorldVertices'], indices, subMesh.indexStart, subMesh.indexStart + subMesh.indexCount, subMesh.verticesStart);
        };
        CollideWorker.prototype.checkSubmeshCollision = function (subMesh) {
            return true;
        };
        return CollideWorker;
    })();
    BABYLONX.CollideWorker = CollideWorker;
    var CollisionDetector = (function () {
        function CollisionDetector() {
            this.meshes_ = {};
        }
        CollisionDetector.prototype.onOpenDatabaseMessage = function (payload) {
            var _this = this;
            this.objectStoreName_ = payload.objectStoreName;
            this.openDatabase(payload.dbName, payload.dbVersion, false, function (db) {
                if (!db) {
                    postMessage({ error: 1 /* NO_INDEXEDDB */ }, undefined);
                }
                else {
                    postMessage({ error: 0 /* SUCCESS */ }, undefined);
                }
                _this.indexedDb_ = db;
                _this.getAllMeshes(function (meshes) {
                    meshes.forEach(function (mesh) {
                        _this.meshes_[mesh.uniqueId] = mesh;
                    });
                });
            });
        };
        CollisionDetector.prototype.onUpdateDatabaseMessage = function (payload) {
            var _this = this;
            if (!this.indexedDb_)
                return;
            this.getSpecificMeshes(payload.updatedMeshes, function (meshes) {
                meshes.forEach(function (mesh) {
                    _this.meshes_[mesh.uniqueId] = mesh;
                });
            });
        };
        CollisionDetector.prototype.onCollideMessage = function (payload) {
            var finalPosition = BABYLON.Vector3.Zero();
            var collider = new BABYLON.Collider();
            collider.radius = BABYLON.Vector3.FromArray(payload.collider.radius);
            var colliderWorker = new CollideWorker(collider, this.meshes_, finalPosition);
            colliderWorker.collideWithWorld(BABYLON.Vector3.FromArray(payload.collider.position), BABYLON.Vector3.FromArray(payload.collider.velocity), payload.maximumRetry, payload.excludedMeshUniqueId);
            var reply = {
                collidedMeshUniqueId: collider.collidedMesh,
                collisionId: payload.collisionId,
                newPosition: finalPosition.asArray(),
                error: 0 /* SUCCESS */
            };
            postMessage(reply, undefined);
        };
        CollisionDetector.prototype.getSpecificMeshes = function (meshesToFetch, callback) {
            var trans = this.indexedDb_.transaction([this.objectStoreName_]);
            var store = trans.objectStore(this.objectStoreName_);
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
        CollisionDetector.prototype.getAllMeshes = function (callback) {
            var trans = this.indexedDb_.transaction([this.objectStoreName_]);
            var store = trans.objectStore(this.objectStoreName_);
            var meshes = [];
            trans.oncomplete = function (evt) {
                callback(meshes);
            };
            var cursorRequest = store.openCursor();
            cursorRequest.onerror = function (error) {
                console.log(error);
                postMessage({ error: 2 /* TRANSACTION_FAILED */ }, undefined);
            };
            cursorRequest.onsuccess = function (evt) {
                var cursor = evt.target['result'];
                if (cursor) {
                    meshes.push(cursor.value);
                    cursor.continue();
                }
            };
        };
        CollisionDetector.prototype.openDatabase = function (dbName, dbVersion, deleteDatabase, successCallback) {
            if (!indexedDB) {
                successCallback(null);
            }
            if (deleteDatabase) {
                indexedDB.deleteDatabase(dbName);
            }
            var request = indexedDB.open(dbName, dbVersion);
            request.onerror = function (e) {
                console.log(e);
                postMessage({ error: 2 /* TRANSACTION_FAILED */ }, undefined);
            };
            request.onsuccess = function (event) {
                var openedDb = event.target['result'];
                successCallback(openedDb);
            };
        };
        return CollisionDetector;
    })();
    BABYLONX.CollisionDetector = CollisionDetector;
    var collisionDetector = new CollisionDetector();
    BABYLONX.onNewMessage = function (event) {
        var message = event.data;
        switch (message.taskType) {
            case 0 /* OPEN_DB */:
                collisionDetector.onOpenDatabaseMessage(message.payload);
                break;
            case 1 /* COLLIDE */:
                collisionDetector.onCollideMessage(message.payload);
                break;
            case 2 /* DB_UPDATE */:
                collisionDetector.onUpdateDatabaseMessage(message.payload);
                break;
        }
    };
})(BABYLONX || (BABYLONX = {}));
onmessage = BABYLONX.onNewMessage;
