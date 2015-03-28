var scene;
var openedDb;
var meshesObjectStore;
var worker;
window.onload = function () {
    var canvas = document.getElementById("renderCanvas");
    var engine = new BABYLON.Engine(canvas, true);
    var createScene = function () {
        var scene = new BABYLON.Scene(engine);
        var camera = new BABYLON.FreeCamera("Camera", BABYLON.Vector3.Zero(), scene);
        camera.attachControl(canvas, true);
        camera.checkCollisions = true;
        var light = new BABYLON.HemisphericLight("Hemispheric", new BABYLON.Vector3(0, 1, 0), scene);
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
    var createScene2 = function () {
        var scene = new BABYLON.Scene(engine);
        var light0 = new BABYLON.DirectionalLight("Omni", new BABYLON.Vector3(-2, -5, 2), scene);
        var light1 = new BABYLON.PointLight("Omni", new BABYLON.Vector3(2, -5, -2), scene);
        var camera = new BABYLON.FreeCamera("FreeCamera", new BABYLON.Vector3(0, -8, -20), scene);
        camera.attachControl(canvas, true);
        var ground = BABYLON.Mesh.CreatePlane("ground", 20.0, scene);
        var material = new BABYLON.StandardMaterial("groundMat", scene);
        material.diffuseColor = new BABYLON.Color3(1, 1, 1);
        ground.material = material;
        ground.material.backFaceCulling = false;
        ground.position = new BABYLON.Vector3(5, -10, -15);
        ground.rotation = new BABYLON.Vector3(Math.PI / 2, 0, 0);
        var box = BABYLON.Mesh.CreateBox("crate", 2, scene);
        var material2 = new BABYLON.StandardMaterial("Mat", scene);
        box.position = new BABYLON.Vector3(5, -9, -10);
        scene.gravity = new BABYLON.Vector3(0, -0.9, 0);
        scene.collisionsEnabled = true;
        camera.checkCollisions = true;
        camera.applyGravity = true;
        camera.ellipsoid = new BABYLON.Vector3(1, 1, 1);
        ground.checkCollisions = true;
        box.checkCollisions = true;
        return scene;
    };
    scene = createScene2();
    scene.collisionsEnabled = true;
    scene.debugLayer.show();
    scene.meshes.forEach(function (m) {
        m.checkCollisions = true;
    });
    engine.runRenderLoop(function () {
        scene.render();
    });
    window.addEventListener("resize", function () {
        engine.resize();
    });
    var collisionHost = new BABYLONX.CollisionHost(scene);
};
