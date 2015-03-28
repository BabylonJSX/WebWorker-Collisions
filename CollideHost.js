var worker;
var BABYLONX;
(function (BABYLONX) {
    var CollisionHost = (function () {
        function CollisionHost(_scene) {
            var _this = this;
            this._scene = _scene;
            this._onMessageFromWorker = function (e) {
                var returnData = e.data;
                if (returnData.error == 1 /* NO_INDEXEDDB */) {
                    console.log("no indexeddb, fallback to normal collision detection");
                    return;
                }
                if (!_this._init) {
                    console.log("webworker initialized");
                    _this.initSceneFunctions();
                    _this._init = true;
                }
                if (!returnData.collisionId)
                    return;
                _this._scene['colliderQueue'][returnData.collisionId](BABYLON.Vector3.FromArray(returnData.newPosition), null);
                _this._scene['colliderQueue'][returnData.collisionId] = undefined;
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
            this._indexedDBPersist.onDatabaseUpdated = function (meshes) {
                var payload = {
                    updatedMeshes: meshes
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
        CollisionHost.prototype.initSceneFunctions = function () {
            BABYLON.Scene.prototype._getNewPosition = function (position, velocity, collider, maximumRetry, finalPosition, excludedMesh, onNewPosition) {
                if (excludedMesh === void 0) { excludedMesh = null; }
                position.divideToRef(collider.radius, this._scaledPosition);
                velocity.divideToRef(collider.radius, this._scaledVelocity);
                this['collisionIndex'] = this['collisionIndex'] % 1000;
                var collisionId = this['collisionIndex']++;
                this['colliderQueue'][collisionId] = onNewPosition;
                if (worker) {
                    var payload = {
                        collider: {
                            position: this._scaledPosition.asArray(),
                            velocity: this._scaledVelocity.asArray(),
                            radius: collider.radius.asArray()
                        },
                        collisionId: collisionId,
                        excludedMeshUniqueId: null,
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
                });
            };
        };
        CollisionHost.prototype._sendOpenDBMessage = function () {
            var openDbPayload = {
                dbName: "babylonJsMeshes",
                dbVersion: 1,
                objectStoreName: "meshes"
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
