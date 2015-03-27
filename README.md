#BabylonJS WebWorker-based collision detection (alpha)

This BabylonJS (2.1 and up) extension will run collision detection in a Worker instead of on the main UI thread.

It is using the IndexedDB-Backend plugin (https://github.com/BabylonJSX/IndexedDB-Backend)

##Why do I need this?
The collision detection is one of the most expensive functions in BabylonJS. This is the major cause of FPS reduction.

"Outsourcing" the collision detection will allow the rendering engine to achieve high FPS even at more CPU-consuming scenes.

##Demo?

Can be found here - http://raananweber.com/webworkerCollision/

Move around and try going through the objects. The collisions are all calculated inside the worker and the results are delivered to the main thread.

##Usage

* Add the extension after BabylonJS's javasciprt file, together with the indexed db plugin:

```html
<script src="babylon.2.1-alpha.debug.js"></script>
<script src="babylonx.indexeddbpersistence.2.1-alpha.js"></script>
<script src="CollideHost.js"></script>
```

* initialize the CollideHost class after creating the scene:

```javascript
var scene = myWonderfulSceneCreationMethod();
var collisionHost = new BABYLONX.CollisionHost(scene);
```

* Don't forget to set the collision flags (scene, camera, and meshes) to true:

```javascript
camera.checkCollisions = true;
scene.collisionsEnabled = true;
mesh.checkCollisions = true;
```

* And that's it!

##How does it work?

CollideHost will start a webworker and will send it constant collision requests. The results will be updated async after the worker did its magic.

More information coming soon.

##Notes

* It will currently only work on the active camera of a scene, mesh-based collisions will not be computed at all.
* Was not yet tested on a very large scene. Should be interesting! :-)

##Suggestions?

If you need something specific please contact me.

##MIT License

Copyright (c) 2014-2015 Raanan Weber (info@raananweber.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


