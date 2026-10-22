import * as THREE from 'three'
import { GeneratedTicketTextures } from './ticketTextureGenerator'

export interface HolographicUniforms {
  [uniform: string]: THREE.IUniform<unknown>
  uFrontMap: THREE.IUniform<THREE.Texture>
  uFrontFoilMap: THREE.IUniform<THREE.Texture>
  uBackMap: THREE.IUniform<THREE.Texture>
  uBackFoilMap: THREE.IUniform<THREE.Texture>
  uTime: THREE.IUniform<number>
  uFoilMode: THREE.IUniform<number>
  uPointerUv: THREE.IUniform<THREE.Vector2>
  uSeamHoverIntensity: THREE.IUniform<number>
  uTearProgress: THREE.IUniform<number>
  uXRayMix: THREE.IUniform<number>
  uLightPos1: THREE.IUniform<THREE.Vector3>
  uLightPos2: THREE.IUniform<THREE.Vector3>
}

const VERTEX_SHADER = /* glsl */ `
  attribute float aStrain;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vStrain;

  void main() {
    vUv = uv;
    vStrain = aStrain;

    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uFrontMap;
  uniform sampler2D uFrontFoilMap;
  uniform sampler2D uBackMap;
  uniform sampler2D uBackFoilMap;

  uniform float uTime;
  uniform float uFoilMode;
  uniform vec2 uPointerUv;
  uniform float uSeamHoverIntensity;
  uniform float uTearProgress;
  uniform float uXRayMix;
  uniform vec3 uLightPos1;
  uniform vec3 uLightPos2;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vStrain;

  // Hash & 2D Voronoi cellular micro-glitter flake functions
  vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
  }

  // Smooth thin-film interference rainbow palette
  vec3 spectralRainbow(float t) {
    vec3 a = vec3(0.55, 0.52, 0.58);
    vec3 b = vec3(0.45, 0.46, 0.42);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec3(0.00, 0.33, 0.67);
    return a + b * cos(6.28318 * (c * t + d));
  }

  // Edition-specific holographic spectrum (0: Silver Holo, 1: 24K Gold Leaf, 2: Ultraviolet Dichroic)
  vec3 getEditionSpectrum(float phase, float mode) {
    vec3 fullPrism = spectralRainbow(phase);
    if (mode < 0.5) {
      // 01: Silver Holo Edition (Liquid Chrome + Pastel/Vivid Full Spectrum)
      vec3 chrome = vec3(0.88, 0.91, 0.96);
      return mix(chrome, fullPrism, 0.78);
    } else if (mode < 1.5) {
      // 02: Founders Gold Leaf (24K Hammered Gold + Solar Amber/Rose/Emerald shift)
      vec3 goldBase = vec3(1.0, 0.78, 0.28);
      vec3 warmPrism = 0.55 + 0.45 * cos(6.28318 * (phase + vec3(0.0, 0.16, 0.48)));
      return mix(goldBase, warmPrism, 0.62);
    } else {
      // 03: Ultraviolet Prism (Electric Cyan / Magenta / Violet Dichroic Laser Foil)
      vec3 uvPrism = 0.55 + 0.45 * cos(6.28318 * (phase + vec3(0.52, 0.18, 0.85)));
      return mix(vec3(0.38, 0.62, 1.0), uvPrism, 0.84);
    }
  }

  void main() {
    bool isFront = gl_FrontFacing;
    vec2 sampleUv = isFront ? vUv : vec2(1.0 - vUv.x, vUv.y);

    vec4 baseTex = isFront ? texture2D(uFrontMap, sampleUv) : texture2D(uBackMap, sampleUv);
    vec4 foilMask = isFront ? texture2D(uFrontFoilMap, sampleUv) : texture2D(uBackFoilMap, sampleUv);

    // Alpha cutout for rounded corners, side security notches, and punched perforation holes
    if (baseTex.a < 0.22) {
      discard;
    }

    float foilAmount = foilMask.r;
    float embossHeight = foilMask.g;
    float patternPhase = foilMask.b;

    // Compute embossed normal perturbation from foil heightfield derivatives
    vec2 texel = vec2(1.0 / 1024.0, 1.0 / 1740.0);
    float hRight = (isFront
      ? texture2D(uFrontFoilMap, sampleUv + vec2(texel.x, 0.0)).g
      : texture2D(uBackFoilMap, sampleUv + vec2(texel.x, 0.0)).g);
    float hUp = (isFront
      ? texture2D(uFrontFoilMap, sampleUv + vec2(0.0, texel.y)).g
      : texture2D(uBackFoilMap, sampleUv + vec2(0.0, texel.y)).g);

    float dHx = (hRight - embossHeight) * 6.5;
    float dHy = (hUp - embossHeight) * 6.5;

    vec3 N = normalize(vWorldNormal);
    if (!isFront) N = -N;
    vec3 perturbedN = normalize(N + vec3(-dHx * 0.24, -dHy * 0.24, 0.0));

    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L1 = normalize(uLightPos1 - vWorldPos);
    vec3 L2 = normalize(uLightPos2 - vWorldPos);
    vec3 H1 = normalize(L1 + V);
    vec3 H2 = normalize(L2 + V);

    // Studio Dual-Softbox Diffuse & Specular Lighting on 350gsm Card Stock
    float diff1 = max(dot(perturbedN, L1), 0.0);
    float diff2 = max(dot(perturbedN, L2), 0.0);
    // Keep paperLight between 0.84 and 1.00 so warm alabaster never washes out to pure white
    float paperLight = 0.82 + diff1 * 0.13 + diff2 * 0.05;

    // Subtle procedural paper fiber micro-tooth
    vec2 toothSeed = floor(sampleUv * vec2(460.0, 780.0));
    float paperTooth = ( fract(sin(dot(toothSeed, vec2(12.9898, 78.233))) * 43758.5453) - 0.5 ) * 0.022;

    vec3 paperColor = baseTex.rgb * paperLight + paperTooth;

    // --- PRISMATIC HOLOGRAPHIC FOIL SHADING ---
    // 1. View + Normal + Diagonal UV Sweep Phase
    float viewAngle = dot(V, perturbedN);
    float normalTilt = dot(perturbedN, normalize(vec3(0.65, 0.55, 0.52)));
    float diagCoord = sampleUv.x * 0.85 + sampleUv.y * 1.15;

    // Primary & secondary diagonal rainbow sweep bands across the pass as it tilts/waves
    float holoPhase =
      diagCoord * 1.75 +
      normalTilt * 2.5 -
      viewAngle * 1.55 +
      patternPhase * 1.45 +
      sin(uTime * 0.65) * 0.08;

    vec3 holoSpectrum = getEditionSpectrum(holoPhase, uFoilMode);

    // 2. Crisp Diagonal Softbox Specular Sweep Band
    float sweepCoord = sampleUv.x * 0.9 - sampleUv.y * 0.75 + normalTilt * 1.85;
    float sweepBand1 = exp(-pow(fract(sweepCoord) - 0.5, 2.0) * 26.0);
    float sweepBand2 = exp(-pow(fract(sweepCoord * 1.7 + 0.25) - 0.5, 2.0) * 42.0);
    float specularCoat = pow(max(dot(perturbedN, H1), 0.0), 48.0) * 0.72 +
                         pow(max(dot(perturbedN, H2), 0.0), 32.0) * 0.42;

    // 3. Circular Voronoi Micro-Glitter Flakes (restricted to hot-stamped foil zones)
    vec2 flakeGrid = sampleUv * vec2(480.0, 820.0);
    vec2 flakeId = floor(flakeGrid);
    vec2 flakeCellUv = fract(flakeGrid);
    vec2 flakeRnd = hash22(flakeId);
    float flakeDisc = smoothstep(0.38, 0.10, length(flakeCellUv - (0.25 + 0.5 * flakeRnd)));
    vec3 flakeNormal = normalize(perturbedN + vec3((flakeRnd.x - 0.5) * 0.68, (flakeRnd.y - 0.5) * 0.68, 0.0));
    float flakeAlign = max(dot(flakeNormal, H1), dot(flakeNormal, H2));
    float microSparkle = pow(max(flakeAlign, 0.0), 110.0) * 2.2 * flakeDisc * smoothstep(0.32, 0.85, foilAmount);

    vec3 foilFinal =
      holoSpectrum * (0.68 + 0.42 * sweepBand1 + 0.28 * sweepBand2) +
      vec3(1.0, 0.98, 0.95) * (specularCoat * 0.45 + microSparkle);

    // Blend matte 350gsm card stock with hot-stamped holographic foil + subtle full-card laminate sheen
    float laminateSheen = (sweepBand1 * 0.055 + specularCoat * 0.065);
    vec3 litColor = mix(paperColor + holoSpectrum * laminateSheen, foilFinal, foilAmount * 0.88);

    // --- PERFORATION SEAM LASER CUT GUIDE & FIBER STRAIN GLOW ---
    // Seam sits at v = 1.0 - 0.72 = 0.28
    float seamV = 0.28;
    float distToSeam = abs(vUv.y - seamV);
    float distToPointerU = abs(vUv.x - uPointerUv.x);

    // Subtle continuous holographic guide along perforation line when untorn
    if (uTearProgress < 0.99) {
      float guideLine = exp(-distToSeam * 190.0) * (0.28 + 0.55 * uSeamHoverIntensity);
      float pointerSpot = exp(-distToSeam * 140.0) * exp(-distToPointerU * 14.0) * uSeamHoverIntensity;
      vec3 guideColor = mix(vec3(0.35, 0.78, 1.0), vec3(1.0, 0.48, 0.15), uSeamHoverIntensity);
      litColor += guideColor * (guideLine * 0.45 + pointerSpot * 1.15);
    }

    // Highlight active fiber strain near perforation seam or grabbed flex zone
    if (vStrain > 0.08) {
      vec3 strainGlow = mix(vec3(0.98, 0.65, 0.12), vec3(0.98, 0.22, 0.28), clamp(vStrain, 0.0, 1.0));
      litColor = mix(litColor, strainGlow, clamp(vStrain * 0.42 * exp(-distToSeam * 45.0), 0.0, 0.55));
    }

    // --- [X] PHYSICS & NORMAL MAP X-RAY MODE OVERLAY ---
    if (uXRayMix > 0.001) {
      vec3 normalVis = perturbedN * 0.5 + 0.5;
      vec3 strainHeat = mix(
        vec3(0.06, 0.09, 0.16),
        mix(vec3(0.12, 0.68, 0.88), vec3(0.98, 0.28, 0.24), clamp(vStrain * 1.6, 0.0, 1.0)),
        clamp(vStrain * 1.4 + foilAmount * 0.25, 0.0, 1.0)
      );
      vec3 xraySurface = mix(strainHeat, normalVis * 0.55, 0.42);
      litColor = mix(litColor, xraySurface, uXRayMix * 0.86);
    }

    float finalAlpha = mix(1.0, 0.76, uXRayMix);
    gl_FragColor = vec4(litColor, finalAlpha);
  }
`

export function createHolographicPassMaterial(
  textures: GeneratedTicketTextures
): { material: THREE.ShaderMaterial; uniforms: HolographicUniforms } {
  const uniforms: HolographicUniforms = {
    uFrontMap: { value: textures.frontMap },
    uFrontFoilMap: { value: textures.frontFoilMap },
    uBackMap: { value: textures.backMap },
    uBackFoilMap: { value: textures.backFoilMap },
    uTime: { value: 0 },
    uFoilMode: { value: 0 },
    uPointerUv: { value: new THREE.Vector2(0.5, 0.28) },
    uSeamHoverIntensity: { value: 0 },
    uTearProgress: { value: 0 },
    uXRayMix: { value: 0 },
    uLightPos1: { value: new THREE.Vector3(2.8, 3.4, 4.2) },
    uLightPos2: { value: new THREE.Vector3(-3.2, -1.8, 3.8) }
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    transparent: true
  })

  return { material, uniforms }
}

/**
 * Creates a real-time deforming soft contact shadow material that mirrors the exact Verlet mesh
 * (both upper pass and peeling/falling lower stub) onto the studio backdrop plane!
 */
export function createContactShadowMaterial(
  frontMap: THREE.Texture
): { material: THREE.ShaderMaterial; setDarkTheme: (isDark: boolean) => void } {
  const uniforms = {
    uAlphaMap: { value: frontMap },
    uShadowOpacity: { value: 0.22 },
    uShadowColor: { value: new THREE.Color('#181612') }
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDepthOffset;
      void main() {
        vUv = uv;
        // Project the deforming Verlet vertices onto the studio backplane with a soft directional light offset
        vec3 shifted = position;
        vDepthOffset = clamp((position.z + 0.5) * 0.5, 0.0, 1.0);
        shifted.x += 0.16 + position.z * 0.18;
        shifted.y -= 0.18 + position.z * 0.16;
        shifted.z = -0.58;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(shifted, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAlphaMap;
      uniform float uShadowOpacity;
      uniform vec3 uShadowColor;
      varying vec2 vUv;
      varying float vDepthOffset;

      void main() {
        float a = texture2D(uAlphaMap, vUv).a;
        if (a < 0.1) discard;
        // Soft radial edge feathering so the shadow looks like a diffused studio softbox shadow
        float edgeX = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        float edgeY = smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
        float softAlpha = a * uShadowOpacity * (0.65 + 0.35 * edgeX * edgeY) * (1.0 - vDepthOffset * 0.28);
        gl_FragColor = vec4(uShadowColor, softAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  })

  return {
    material,
    setDarkTheme: (isDark: boolean) => {
      uniforms.uShadowOpacity.value = isDark ? 0.52 : 0.19
      uniforms.uShadowColor.value.set(isDark ? '#020305' : '#1E1B16')
    }
  }
}
