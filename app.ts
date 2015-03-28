
var scene: BABYLON.Scene;
var openedDb: IDBDatabase;
var meshesObjectStore: IDBObjectStore;
var worker: Worker;

//BABYLON.Scene.prototype._getNewPosition = function (position: BABYLON.Vector3, velocity: BABYLON.Vector3, colliderRadius: BABYLON.Vector3, maximumRetry: number, finalPosition: BABYLON.Vector3, excludedMesh: BABYLON.AbstractMesh = null, onNewPosition?: (newPosition:BABYLON.Vector3, collidedMesh?:BABYLON.AbstractMesh) => void): void {
//    position.divideToRef(colliderRadius, this._scaledPosition);
//    velocity.divideToRef(colliderRadius, this._scaledVelocity);

//    if (worker)
//        worker.postMessage({ position: this._scaledPosition.initialPosition.asArray(), velocity: this._scaledVelocity.initialVelocity.asArray(), radius: colliderRadius.asArray(), maximumRetry: maximumRetry, finalPosition: finalPosition.asArray(), excludedMesh: excludedMesh ? excludedMesh.id : null });
//}

window.onload = () => {
    var canvas = <HTMLCanvasElement> document.getElementById("renderCanvas");
    var engine = new BABYLON.Engine(canvas, true);
    var createScene = function () {
        var scene = new BABYLON.Scene(engine);

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
    }

    var createScene2 = function () {
        //var createScene = function () {
            var scene = new BABYLON.Scene(engine);

            // Lights
            var light0 = new BABYLON.DirectionalLight("Omni", new BABYLON.Vector3(-2, -5, 2), scene);
            var light1 = new BABYLON.PointLight("Omni", new BABYLON.Vector3(2, -5, -2), scene);

            // Need a free camera for collisions
            var camera = new BABYLON.FreeCamera("FreeCamera", new BABYLON.Vector3(0, -8, -20), scene);
            camera.attachControl(canvas, true);

            //Ground
            var ground = BABYLON.Mesh.CreatePlane("ground", 20.0, scene);
            var material = new BABYLON.StandardMaterial("groundMat", scene);
            material.diffuseColor = new BABYLON.Color3(1, 1, 1);
            ground.material = material;
            ground.material.backFaceCulling = false;
            ground.position = new BABYLON.Vector3(5, -10, -15);
            ground.rotation = new BABYLON.Vector3(Math.PI / 2, 0, 0);

            //Simple crate
            var box = BABYLON.Mesh.CreateBox("crate", 2, scene);
            var material2 = new BABYLON.StandardMaterial("groundMat", scene);
            material2.diffuseColor = new BABYLON.Color3(1, 0, 0);
            box.material = material2;
            box.position = new BABYLON.Vector3(5, -9, -9);

            //Simple crate
            var box2 = BABYLON.Mesh.CreateBox("crate2", 2, scene);
            box2.position = new BABYLON.Vector3(0, -9, -10);

            //Set gravity for the scene (G force like, on Y-axis)
            scene.gravity = new BABYLON.Vector3(0, -0.9, 0);

            // Enable Collisions
            scene.collisionsEnabled = true;

            //Then apply collisions and gravity to the active camera
            camera.checkCollisions = true;
            //camera.applyGravity = true;

            //Set the ellipsoid around the camera (e.g. your player's size)
            camera.ellipsoid = new BABYLON.Vector3(1, 1, 1);

            //finally, say which mesh will be collisionable
            ground.checkCollisions = true;
            box.checkCollisions = true;

            return scene;
        //}
    }

    scene = createScene2();
    scene.collisionsEnabled = true;
    //scene.debugLayer.show();

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

    scene.beforeRender = function () {
        if (collisionHost.isInitialized()) {
            var mesh = scene.getMeshByName("crate2");
            mesh.moveWithCollisions(new BABYLON.Vector3(0.1, 0, 0));
        }
    }
};