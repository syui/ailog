---
title: "three.jsでatmosphereを作る"
slug: "three-cloud"
date: "2025-11-20"
tags: ["vrm", "react", "three.js", "webgl"]
language: ["ja", "en"]
draft: false
---

今回は、atmpsphere+three-vrmでキャラクターを表示する方法を紹介。

非常に良いpackageを見つけたので、それを使います。

[https://github.com/takram-design-engineering/three-geospatial](https://github.com/takram-design-engineering/three-geospatial)

<iframe width="100%" height="415" src="https://www.youtube.com/embed/mTuvL_lJDk8?rel=0&showinfo=0&controls=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

## three-vrm+vrmaの最小構成

vrmを表示の上、animation(.vrma)を適用。

```json:package.json
{
  "name": "min-react-vrm",
  "version": "1.0.0",
  "description": "Minimal VRM Animation Player",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@pixiv/three-vrm": "^3.4.4",
    "@pixiv/three-vrm-animation": "^3.4.4",
    "@react-three/drei": "^10.7.7",
    "@react-three/fiber": "^9.4.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "three": "^0.181.2"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.1"
  }
}
```

```js:vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

```js:src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

```js:src/App.jsx
import React, { useEffect, useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import { AnimationMixer, GridHelper, AxesHelper } from 'three';
import { OrbitControls } from '@react-three/drei';

const VRM_URL = '/ai.vrm';
const VRMA_URL = '/idle.vrma';

function Avatar() {
  const mixerRef = useRef(null);
  const vrmRef = useRef(null);
  const gltf = useLoader(GLTFLoader, VRM_URL, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  });

  const vrma = useLoader(GLTFLoader, VRMA_URL, (loader) => {
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  });

  useEffect(() => {
    const vrm = gltf.userData.vrm;
    vrmRef.current = vrm;
    VRMUtils.removeUnnecessaryJoints(vrm.scene);
    vrm.humanoid.resetPose();
    vrm.scene.rotation.y = Math.PI;
    if (vrma.userData.vrmAnimations && vrma.userData.vrmAnimations.length > 0) {
      const clip = createVRMAnimationClip(vrma.userData.vrmAnimations[0], vrm);
      mixerRef.current = new AnimationMixer(vrm.scene);
      mixerRef.current.clipAction(clip).play();
    }
  }, [gltf, vrma]);

  useFrame((state, delta) => {
    if (mixerRef.current) mixerRef.current.update(delta);
    if (vrmRef.current) vrmRef.current.update(delta);
  });

  return <primitive object={gltf.scene} />;
}

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [0, 1.5, 3] }}>
        <color attach="background" args={['#202020']} />
        <directionalLight position={[1, 1, 1]} intensity={1.5} />
        <ambientLight intensity={0.5} />
        <primitive object={new GridHelper(10, 10)} />
        <primitive object={new AxesHelper(1)} />
        <React.Suspense fallback={null}>
          <Avatar />
        </React.Suspense>
        <OrbitControls target={[0, 1, 0]} />
      </Canvas>
    </div>
  );
}
```

```html:index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <title>VRM Animation Preview</title>
    <style>
      html, body, #root { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

これで`npm run dev`すれば、VRMが表示され、vrmaのアニメーションが再生されます。

## atmosphereの追加

```json:package.json
{
  "name": "react-vrm-atmosphere",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@pixiv/three-vrm": "^3.4.4",
    "@pixiv/three-vrm-animation": "^3.4.4",
    "@react-three/drei": "^10.7.7",
    "@react-three/fiber": "^9.4.0",
    "@react-three/postprocessing": "^3.0.4",
    "@takram/three-atmosphere": "^0.15.1",
    "@takram/three-clouds": "^0.5.2",
    "react": "^19.0.0-rc.1",
    "react-dom": "^19.0.0-rc.1",
    "three": "^0.181.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.1.0"
  }
}
```

```js:src/App.jsx
import React, { useEffect, useRef, Suspense } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import { AnimationMixer, Vector3 } from 'three';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';

import { AerialPerspective, Atmosphere } from '@takram/three-atmosphere/r3f';
import { Clouds, CloudLayer } from '@takram/three-clouds/r3f';

const VRM_URL = '/ai.vrm';
const VRMA_URL = '/fly.vrma';
const EARTH_RADIUS = 6378137;

const FIXED_DATE = new Date('2024-06-21T12:00:00');
function ExposureController() {
  const { gl } = useThree();
  useEffect(() => {
    gl.toneMapping = THREE.NoToneMapping;
    gl.toneMappingExposure = 10.0; 
  }, [gl]);
  return null;
}

function AtmosphereLayer() {
  const cameraRef = useRef();

  return (
    <Canvas>
      <ExposureController />
      
      <PerspectiveCamera 
        makeDefault 
        ref={cameraRef}
        position={[0, EARTH_RADIUS + 2000, 0]} 
        near={1} 
        far={10000000}
        fov={45} 
      />

      <directionalLight 
        position={[0, 1, 0]} 
        intensity={3.0} 
      />

      <Atmosphere date={FIXED_DATE}>
        <EffectComposer multisampling={0} disableNormalPass={false}>
          <Clouds disableDefaultLayers>
            <CloudLayer 
              channel='r' 
              altitude={1500} 
              height={500} 
              densityScale={0.5}
            />
            <CloudLayer 
              channel='g' 
              altitude={2500} 
              height={800} 
            />
            <CloudLayer
              channel='b'
              altitude={7500}
              height={500}
              densityScale={0.003}
              shapeAmount={0.4}
            />
          </Clouds>
          
          <AerialPerspective sky sunLight skyLight />
          
          <ToneMapping mode={ToneMappingMode.AGX} />
        </EffectComposer>
      </Atmosphere>
      
      <FlyOverCamera />
    </Canvas>
  );
}

function FlyOverCamera() {
  useFrame((state) => {
    const t = state.clock.getElapsedTime() * 0.05;
    const altitude = 2000;
    const radius = 5000;

    state.camera.position.x = Math.sin(t) * radius;
    state.camera.position.z = Math.cos(t) * radius;
    state.camera.position.y = EARTH_RADIUS + altitude;
    
    const lookAtTarget = new Vector3(
      Math.sin(t + 0.1) * radius,
      EARTH_RADIUS + altitude, 
      Math.cos(t + 0.1) * radius
    );
    state.camera.lookAt(lookAtTarget);
  });
  return null;
}

function VrmCharacter() {
  const mixerRef = useRef(null);
  const vrmRef = useRef(null);

  const gltf = useLoader(GLTFLoader, VRM_URL, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  });
  
  const vrma = useLoader(GLTFLoader, VRMA_URL, (loader) => {
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  });

  useEffect(() => {
    const vrm = gltf.userData.vrm;
    vrmRef.current = vrm;
    VRMUtils.removeUnnecessaryJoints(vrm.scene);
    vrm.humanoid.resetPose();
    vrm.scene.rotation.y = Math.PI; 

    if (vrma.userData.vrmAnimations?.[0]) {
      const clip = createVRMAnimationClip(vrma.userData.vrmAnimations[0], vrm);
      mixerRef.current = new AnimationMixer(vrm.scene);
      mixerRef.current.clipAction(clip).play();
    }
  }, [gltf, vrma]);

  useFrame((state, delta) => {
    mixerRef.current?.update(delta);
    vrmRef.current?.update(delta);
  });

  return <primitive object={gltf.scene} />;
}

function AvatarLayer() {
  return (
    <Canvas gl={{ alpha: true, antialias: true }}>
      <PerspectiveCamera makeDefault position={[0, 1.5, 3]} fov={30} />
      <directionalLight position={[-1, 1, 1]} intensity={1.5} />
      <ambientLight intensity={1.0} />
      <spotLight position={[0, 2, -2]} intensity={3} color="#ffdcb4" />

      <Suspense fallback={null}>
        <VrmCharacter />
      </Suspense>

      <OrbitControls target={[0, 1.2, 0]} />
    </Canvas>
  );
}

export default function App() {
  const layerStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000' }}>
      
      <div style={{ ...layerStyle, zIndex: 0 }}>
        <AtmosphereLayer />
      </div>

      <div style={{ ...layerStyle, zIndex: 1, pointerEvents: 'none' }}>
         <div style={{ width: '100%', height: '100%', pointerEvents: 'auto' }}>
            <AvatarLayer />
         </div>
      </div>

    </div>
  );
}
```

## google map api

街を表示するには料金がかかります。

`gcp`で`Map Tiles API`だけ有効にすればよいです。

```sh:.env
VITE_GOOGLE_MAP_API_KEY=xxx
```

```js:src/App.jsx
import {
  GLTFExtensionsPlugin,
  GoogleCloudAuthPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin,
} from '3d-tiles-renderer/plugins';

const apiKey = import.meta.env.VITE_GOOGLE_MAP_API_KEY;
```

認証情報は、localhostで使用するものと、webで使用するものを分けて、それぞれ制限をつけましょう。

```md
[test-map]
localhost:4400

[production-map]
example.com
```

これでサイトにapi-keyが埋め込まれていても比較的安全です。また、gh-pagesではなく、`gh-actions + cf-pages`でdeployしたほうがいいかも。

[msg type="warning" content="2つのkeyを用意することで、localhostを削除したり追加する手順を省略できます。keyにlocalhostを許可している状態だと悪用される危険が高まります。"]

[msg type="note" content="gh-pagesは無料プランでprivate-repoを許可していないません。そのため、private-repoでgh-actionsからcf-pagesにdeployする方法があります。"]

### ハマったポイント

vrmとの合せ技なので、太陽光を調整するのが難しく、影が大きくなりすぎてしまい見づらかいのでやめました。

```diff
- <AerialPerspective sky sunLight skyLight />
+ <AerialPerspective sky />
```
