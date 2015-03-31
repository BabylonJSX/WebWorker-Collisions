var worker;
var BABYLONX;
(function (BABYLONX) {
    var CollisionHost = (function () {
        function CollisionHost(_scene) {
            var _this = this;
            this._scene = _scene;
            this._runningCollisionDetection = false;
            this._runningDatabaseUpdate = 0;
            this._onMessageFromWorker = function (e) {
                var returnData = e.data;
                switch (returnData.taskType) {
                    case 0 /* OPEN_DB */:
                        if (returnData.error == 1 /* NO_INDEXEDDB */) {
                            console.log("no indexeddb in worker, fallback to normal collision detection");
                        }
                        else {
                            if (!_this._init) {
                                console.log("webworker initialized");
                                _this.initSceneFunctions();
                            }
                        }
                        _this._init = true;
                        break;
                    case 2 /* DB_UPDATE */:
                        _this._runningDatabaseUpdate--;
                        break;
                    case 1 /* COLLIDE */:
                        _this._runningCollisionDetection = false;
                        var returnPayload = returnData.payload;
                        if (!_this._scene['colliderQueue'][returnPayload.collisionId])
                            return;
                        _this._scene['colliderQueue'][returnPayload.collisionId](BABYLON.Vector3.FromArray(returnPayload.newPosition), _this._scene.getMeshByUniqueID(returnPayload.collidedMeshUniqueId));
                        _this._scene['colliderQueue'][returnPayload.collisionId] = undefined;
                        break;
                }
            };
            this._scene['collisionIndex'] = 0;
            this._scene['colliderQueue'] = [];
            this._init = false;
            this._indexedDBPersist = new BABYLONX['IndexedDBPersist'](scene);
            if (!Worker) {
                return;
            }
            this._worker = new Worker("CollideWorker.js");
            worker = this._worker;
            this._indexedDBPersist.onDatabaseUpdated = function (meshes, geometries) {
                if (_this._runningDatabaseUpdate > 3)
                    return;
                _this._runningDatabaseUpdate++;
                var payload = {
                    updatedMeshes: meshes,
                    updatedGeometries: geometries
                };
                var message = {
                    payload: payload,
                    taskType: 2 /* DB_UPDATE */
                };
                _this._worker.postMessage(message);
            };
            this._sendOpenDBMessage();
            this._worker.onmessage = this._onMessageFromWorker;
        }
        CollisionHost.prototype.isInitialized = function () {
            return !!this._init;
        };
        CollisionHost.prototype.initSceneFunctions = function () {
            BABYLON.Scene.prototype._getNewPosition = function (position, velocity, collider, maximumRetry, finalPosition, excludedMesh, onNewPosition, collisionIndex) {
                if (excludedMesh === void 0) { excludedMesh = null; }
                if (collisionIndex === void 0) { collisionIndex = 0; }
                position.divideToRef(collider.radius, this._scaledPosition);
                velocity.divideToRef(collider.radius, this._scaledVelocity);
                if (this['colliderQueue'][collisionIndex])
                    return;
                this['colliderQueue'][collisionIndex] = onNewPosition;
                if (worker) {
                    var payload = {
                        collider: {
                            position: this._scaledPosition.asArray(),
                            velocity: this._scaledVelocity.asArray(),
                            radius: collider.radius.asArray()
                        },
                        collisionId: collisionIndex,
                        excludedMeshUniqueId: excludedMesh ? excludedMesh.uniqueId : null,
                        maximumRetry: maximumRetry
                    };
                    var message = {
                        payload: payload,
                        taskType: 1 /* COLLIDE */
                    };
                    worker.postMessage(message);
                }
            };
            BABYLON.FreeCamera.prototype._collideWithWorld = function (velocity) {
                var _this = this;
                var globalPosition;
                if (this.parent) {
                    globalPosition = BABYLON.Vector3.TransformCoordinates(this.position, this.parent.getWorldMatrix());
                }
                else {
                    globalPosition = this.position;
                }
                globalPosition.subtractFromFloatsToRef(0, this.ellipsoid.y, 0, this._oldPosition);
                this._collider.radius = this.ellipsoid;
                this.getScene()._getNewPosition(this._oldPosition, velocity, this._collider, 3, null, null, function (newPosition, collidedMesh) {
                    _this._newPosition.copyFrom(newPosition);
                    _this._newPosition.multiplyInPlace(_this._collider.radius);
                    _this._newPosition.subtractToRef(_this._oldPosition, _this._diffPosition);
                    if (_this._diffPosition.length() > BABYLON.Engine.CollisionsEpsilon) {
                        _this.position.addInPlace(_this._diffPosition);
                        if (_this.onCollide) {
                            _this.onCollide(_this._collider.collidedMesh);
                        }
                    }
                }, velocity.equals(this.getScene().gravity) ? this.uniqueId * 10000 : this.uniqueId);
            };
            BABYLON.AbstractMesh.prototype.moveWithCollisions = function (velocity) {
                var _this = this;
                var globalPosition = this.getAbsolutePosition();
                globalPosition.subtractFromFloatsToRef(0, this.ellipsoid.y, 0, this._oldPositionForCollisions);
                this._oldPositionForCollisions.addInPlace(this.ellipsoidOffset);
                this._collider.radius = this.ellipsoid;
                this.getScene()._getNewPosition(this._oldPositionForCollisions, velocity, this._collider, 3, null, this, function (newPosition, collidedMesh) {
                    _this._newPositionForCollisions.copyFrom(newPosition);
                    _this._newPositionForCollisions.multiplyInPlace(_this._collider.radius);
                    _this._newPositionForCollisions.subtractToRef(_this._oldPositionForCollisions, _this._diffPositionForCollisions);
                    if (_this._diffPositionForCollisions.length() > BABYLON.Engine.CollisionsEpsilon) {
                        _this.position.addInPlace(_this._diffPositionForCollisions);
                    }
                }, this.uniqueId);
            };
        };
        CollisionHost.prototype._sendOpenDBMessage = function () {
            var openDbPayload = {
                dbName: "babylonJsMeshes",
                dbVersion: 1,
                objectStoreNameMeshes: "meshes",
                objectStoreNameGeometries: "geometries"
            };
            var message = {
                payload: openDbPayload,
                taskType: 0 /* OPEN_DB */
            };
            this._worker.postMessage(message);
        };
        return CollisionHost;
    })();
    BABYLONX.CollisionHost = CollisionHost;
    (function (WorkerTaskType) {
        WorkerTaskType[WorkerTaskType["OPEN_DB"] = 0] = "OPEN_DB";
        WorkerTaskType[WorkerTaskType["COLLIDE"] = 1] = "COLLIDE";
        WorkerTaskType[WorkerTaskType["DB_UPDATE"] = 2] = "DB_UPDATE";
    })(BABYLONX.WorkerTaskType || (BABYLONX.WorkerTaskType = {}));
    var WorkerTaskType = BABYLONX.WorkerTaskType;
    (function (WorkerErrorType) {
        WorkerErrorType[WorkerErrorType["SUCCESS"] = 0] = "SUCCESS";
        WorkerErrorType[WorkerErrorType["NO_INDEXEDDB"] = 1] = "NO_INDEXEDDB";
        WorkerErrorType[WorkerErrorType["TRANSACTION_FAILED"] = 2] = "TRANSACTION_FAILED";
    })(BABYLONX.WorkerErrorType || (BABYLONX.WorkerErrorType = {}));
    var WorkerErrorType = BABYLONX.WorkerErrorType;
})(BABYLONX || (BABYLONX = {}));
