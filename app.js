var scene;
var openedDb;
var meshesObjectStore;
var worker;
//BABYLON.Scene.prototype._getNewPosition = function (position: BABYLON.Vector3, velocity: BABYLON.Vector3, colliderRadius: BABYLON.Vector3, maximumRetry: number, finalPosition: BABYLON.Vector3, excludedMesh: BABYLON.AbstractMesh = null, onNewPosition?: (newPosition:BABYLON.Vector3, collidedMesh?:BABYLON.AbstractMesh) => void): void {
//    position.divideToRef(colliderRadius, this._scaledPosition);
//    velocity.divideToRef(colliderRadius, this._scaledVelocity);
//    if (worker)
//        worker.postMessage({ position: this._scaledPosition.initialPosition.asArray(), velocity: this._scaledVelocity.initialVelocity.asArray(), radius: colliderRadius.asArray(), maximumRetry: maximumRetry, finalPosition: finalPosition.asArray(), excludedMesh: excludedMesh ? excludedMesh.id : null });
//}
window.onload = function () {
    var canvas = document.getElementById("renderCanvas");
    var engine = new BABYLON.Engine(canvas, true);
    var createScene = function () {
        var scene = new BABYLON.Scene(engine);
        scene['collisionIndex'] = 0;
        scene['colliderQueue'] = [];
        //registerIndexedDBCallbacks(scene);
        //Camera
        var camera = new BABYLON.FreeCamera("Camera", BABYLON.Vector3.Zero(), scene);
        camera.attachControl(canvas, true);
        camera.checkCollisions = true;
        //Setting up the light
        var light = new BABYLON.HemisphericLight("Hemispheric", new BABYLON.Vector3(0, 1, 0), scene);
        //Now start adding meshes.
        var box = BABYLON.Mesh.CreateBox("box", 6.0, scene);
        var sphere = BABYLON.Mesh.CreateSphere("sphere", 10.0, 10.0, scene);
        var plan = BABYLON.Mesh.CreatePlane("plane", 10.0, scene);
        var cylinder = BABYLON.Mesh.CreateCylinder("cylinder", 3, 3, 3, 6, 1, scene, false);
        var torus = BABYLON.Mesh.CreateTorus("torus", 5, 1, 10, scene, false);
        var knot = BABYLON.Mesh.CreateTorusKnot("knot", 2, 0.5, 128, 64, 2, 3, scene);
        var lines = BABYLON.Mesh.CreateLines("lines", [
            new BABYLON.Vector3(-10, 0, 0),
            new BABYLON.Vector3(10, 0, 0),
            new BABYLON.Vector3(0, 0, -10),
            new BABYLON.Vector3(0, 0, 10)
        ], scene);
        box.position = new BABYLON.Vector3(-10, 0, 0);
        sphere.position = new BABYLON.Vector3(0, 10, 0);
        plan.position.z = 10;
        cylinder.position.z = -10;
        torus.position.x = 10;
        knot.position.y = -10;
        return scene;
    };
    scene = createScene();
    scene.collisionsEnabled = true;
    scene.meshes.forEach(function (m) {
        m.checkCollisions = true;
    });
    engine.runRenderLoop(function () {
        scene.render();
    });
    window.addEventListener("resize", function () {
        engine.resize();
    });
    //window.onclick = function () {
    //    var box = BABYLON.Mesh.CreateSphere("sphere", 10.0, 10.0, scene);
    //    box.position.x = (Math.random() * 50) - 25;
    //    box.position.y = (Math.random() * 50) - 25;
    //    box.position.z = (Math.random() * 50) - 25;
    //    box.checkCollisions = true;
    //}
    var collisionHost = new BABYLONX.CollisionHost(scene);
};
//# sourceMappingURL=app.js.map