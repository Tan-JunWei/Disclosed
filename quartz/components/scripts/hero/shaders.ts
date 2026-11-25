/**
 * The network form's attack timeline, shared by its idle motion and its lighting. Three packets
 * strike the perimeter one after another (angles must agree with NETWORK_STRIKES in geometry.ts).
 * Times are in hold phase (0..1). The network holds longer than other forms (see scene.ts).
 */
const networkTimeline = /* glsl */ `
  float netTurn(float k) { return k < 0.5 ? 1.0 / 6.0 : (k < 1.5 ? 0.5 : 5.0 / 6.0); }
  float netStrike(float k) { return 0.25 + 0.21 * k; }
  const float NET_APPROACH = 0.17;
  const float NET_ASH = 0.22;
  const float NET_HIT = 0.16;
  vec2 netDir(float k) { float a = netTurn(k) * 6.2831853; return vec2(cos(a), sin(a)); }
  // how strongly the firewall is reacting to a strike right now (0..1)
  float netHits(float ph) {
    float hits = 0.0;
    for (int i = 0; i < 3; i++) {
      float s = netStrike(float(i));
      hits = max(hits, sin(3.14159265 * clamp((ph - s) / NET_HIT, 0.0, 1.0)));
    }
    return hits;
  }
  // Allowed traffic: one packet per spoke shuttles device -> firewall (request) and back (reply),
  // easing in and out at each end. 0 is the device end, 1 the firewall end.
  float netClock(float i, float time) { return time * 0.36 + fract(sin(i * 91.7 + 3.1) * 437.58); }
  float netInbound(float i, float time) { return step(mod(floor(netClock(i, time)), 2.0), 0.5); }
  float netTraffic(float i, float time) {
    float t = fract(netClock(i, time));
    float e = t * t * (3.0 - 2.0 * t);
    return mix(1.0 - e, e, netInbound(i, time));
  }
  float netTrafficFade(float i, float time) {
    float t = fract(netClock(i, time));
    return smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.92, 1.0, t));
  }
  // How alert the inspection rings are: up as each packet closes in, back down once it is ash.
  float netAlert(float ph) {
    float a = 0.0;
    for (int i = 0; i < 3; i++) {
      float s = netStrike(float(i));
      a = max(a, sin(3.14159265 * clamp((ph - s + 0.1) / 0.17, 0.0, 1.0)));
    }
    return a;
  }
  // The rings turn slowly, and spin up by a further turn-and-a-bit with each threat.
  float netSpin(float ph, float time) {
    float turn = time * 0.2;
    for (int i = 0; i < 3; i++) {
      float s = netStrike(float(i));
      float t = clamp((ph - s + 0.1) / 0.16, 0.0, 1.0);
      turn += 1.6 * t * t * (3.0 - 2.0 * t);
    }
    return turn;
  }
`

/**
 * Shared by edges, markers and morph particles so idle motion never snaps at handoff.
 * `ph` runs 0..1 across the hold. The outgoing object plays it, the incoming one stays at 0, and
 * every pose returns to (or fades out from) rest, so the morph starts and ends cleanly.
 * `ch` is the edge channel, or -1 where only a position is known (particles, markers).
 */
const idleMotion = /* glsl */ `
  const float PI = 3.14159265;
  ${networkTimeline}
  float rng(float x, float a, float b) { return clamp((x - a) / (b - a), 0.0, 1.0); }
  float eio(float t) { return t * t * (3.0 - 2.0 * t); }
  float eout(float t) { float s = 1.0 - t; return 1.0 - s * s * s; }
  float bump(float t) { return sin(PI * clamp(t, 0.0, 1.0)); }
  vec2 rot2(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
  // Mirrors tilt() in geometry.ts so tilted objects can be animated in their own frame.
  vec3 tiltFwd(vec3 p, float yaw, float pitch) {
    float x1 = p.x * cos(yaw) + p.z * sin(yaw);
    float z1 = p.z * cos(yaw) - p.x * sin(yaw);
    return vec3(x1, p.y * cos(pitch) - z1 * sin(pitch), p.y * sin(pitch) + z1 * cos(pitch));
  }
  vec3 tiltInv(vec3 p, float yaw, float pitch) {
    float z1 = -p.y * sin(pitch) + p.z * cos(pitch);
    float y = p.y * cos(pitch) + p.z * sin(pitch);
    return vec3(p.x * cos(yaw) - z1 * sin(yaw), y, p.x * sin(yaw) + z1 * cos(yaw));
  }

  float eback(float t) { float u = t - 1.0; return 1.0 + 2.70158 * u * u * u + 1.70158 * u * u; }
  float blipPop(vec2 p, vec2 t, float time) {
    float passed = mod(time * 3.1 - atan(t.y, t.x) + 6.2831853, 6.2831853);
    return (1.0 - smoothstep(0.105, 0.125, length(p - t))) * smoothstep(0.0, 0.9, passed) * exp(-passed * 1.4);
  }

  vec3 idlePosition(vec3 p, float form, float time, float ph, float ch) {
    if (form < 0.5) {
      if (p.z > 0.4) {
        // Key: it forms in front of the lock, aligns, slides in along the keyhole axis, then turns.
        vec2 axis = vec2(0.0, -0.125);
        float come = eio(rng(ph, 0.14, 0.48));
        float align = eio(rng(ph, 0.14, 0.42));
        float turn = eio(rng(ph, 0.58, 0.80)) * 1.309;
        p.z -= 0.82 * come;
        vec2 rel = rot2(p.xy - axis, 0.38 * (1.0 - align) - turn);
        p.xy = axis + rel + vec2(-0.2, -0.1) * (1.0 - align);
      } else if ((abs(p.z - 0.265) < 0.012 && p.y > 0.105) || (ch > 16.5 && ch < 17.5)) {
        // Shackle: pops straight up. The heel leg stays seated, the toe leg clears its hole.
        p.y += 0.14 * eback(rng(ph, 0.68, 0.84));
      }
    } else if (form < 1.5) {
      // Servers: units are hot-swapped, each sliding out smoothly and seating back with a firm stop.
      vec3 q = tiltInv(p, -0.26, -0.17);
      float unit = q.y > 0.33 ? 0.0 : (q.y < -0.33 ? 2.0 : 1.0);
      float s0 = 0.04 + unit * 0.2;
      q.z += 0.2 * (eout(rng(ph, s0, s0 + 0.2)) - eio(rng(ph, s0 + 0.27, s0 + 0.44)));
      p = tiltFwd(q, -0.26, -0.17);
    } else if (form < 2.5) {
      // Database: platters spin up on the spindle and write in sequence while the head sweeps.
      vec3 q = tiltInv(p, 0.0, 0.18);
      float hub = length(q.xz);
      if (abs(q.y - 0.645) < 0.004) {
        vec2 pv = vec2(0.54, -0.38);
        q.xz = pv + rot2(q.xz - pv, 0.42 * sin(ph * 6.2831853));
      } else if (hub < 0.64) {
        float level = q.y < -0.4 ? 0.0 : (q.y < 0.0 ? 1.0 : (q.y < 0.4 ? 2.0 : 3.0));
        float dir = mod(level, 2.0) < 0.5 ? 1.0 : -1.0;
        q.xz = rot2(q.xz, dir * 6.2831853 * eio(rng(ph, 0.04 * level, 0.84 + 0.04 * level)));
        q.y += 0.045 * bump(rng(ph, 0.1 + 0.15 * level, 0.5 + 0.15 * level));
      }
      p = tiltFwd(q, 0.0, 0.18);
    } else if (form < 3.5) {
      // Globe: it turns through the hold so attacks in different regions come into view, and is
      // tilted like the Earth. The limb ring is placed in view space and is left alone.
      if (!(ch > 20.5 && ch < 21.5)) {
        p.xz = rot2(p.xz, mix(-0.5, 0.5, ph));
        p = tiltFwd(p, 0.0, 0.42);
        p.xy = rot2(p.xy, -0.28);
      }
    } else if (form < 4.5) {
      // Code: language badges flip in beside the hexagon one after another, then float gently.
      if (ch > 17.5 && ch < 20.5) {
        float k = ch - 18.0;
        vec2 c = k < 0.5 ? vec2(-1.64, 0.0) : (k < 1.5 ? vec2(1.64, 0.44) : vec2(1.64, -0.44));
        float t = rng(ph, 0.06 + k * 0.22, 0.4 + k * 0.22);
        p.xz = vec2(c.x, 0.15) + rot2(p.xz - vec2(c.x, 0.15), (1.0 - eout(t)) * 1.2);
        p.y += 0.02 * sin(time * 1.6 + k * 2.1) * smoothstep(0.5, 1.0, t);
      }
    } else if (form < 5.5) {
      // Radar: a ping ripples through the range rings and each return pops out of the plane
      // as the beam sweeps over it.
      if (p.z > 0.115 && p.z < 0.135) {
        p.z += 0.07 * max(blipPop(p.xy, vec2(0.3, 0.48), time), max(blipPop(p.xy, vec2(-0.5, -0.23), time), blipPop(p.xy, vec2(0.55, -0.39), time)));
      }
      if (p.z > 0.05 && p.z < 0.2) {
        float bezel = length(p.xy);
        if (bezel > 0.995 && bezel < 1.12) p.xy = rot2(p.xy, -0.5 * ph);
        float d = (length(p.xy) - (ph * 1.5 - 0.1)) * 7.0;
        p.xy *= 1.0 + 0.045 * exp(-d * d);
      }
    } else if (form < 6.5) {
      // Network: packets run in at the perimeter and burn up on it. The ring gives a little where
      // each one hits, and the firewall's flame sways and flares as it blocks them.
      if (ch > 103.5 && ch < 117.5) {
        vec3 q = tiltInv(p, 0.28, 0.16);
        if (ch > 115.5 && ch < 116.5) {
          // traffic packet: slides along its spoke (the travel length is in z, see geometry.ts)
          float i = mod(floor((atan(q.y, q.x) - PI * 0.5) / (PI / 3.0) + 0.5) + 6.0, 6.0);
          q.xy -= normalize(q.xy) * q.z * 100.0 * netTraffic(i, time);
          q.z = 0.0;
        } else if (ch > 116.5 && ch < 117.5) {
          // inspection rings: the arcs turn one way, the finer tick ring the other, slower
          float spin = netSpin(ph, time);
          q.xy = rot2(q.xy, length(q.xy) > 0.58 ? spin : -0.45 * spin);
        } else if (ch > 109.5 && ch < 112.5) {
          float k = ch - 110.0, s = netStrike(k);
          vec2 dir = netDir(k);
          // accelerates in (ease-in), so it strikes rather than parks, and crumples as it ignites
          float t = rng(ph, s - NET_APPROACH, s);
          q.xy += dir * 0.62 * (1.0 - t * t);
          vec2 c = dir * 1.285;
          q.xy = c + (q.xy - c) * (1.0 - 0.35 * eout(rng(ph, s, s + 0.03)));
        } else if (ch > 112.5) {
          // Ash: each flake (its index is in z) puffs back off the ring, spreads, then drifts up,
          // fluttering. Both ends of a flake move together, so it never stretches.
          float k = ch - 113.0, s = netStrike(k);
          vec2 dir = netDir(k), side = vec2(-dir.y, dir.x);
          float id = floor(q.z / 0.0006 + 0.5);
          float h1 = fract(sin(id * 12.9898 + k * 4.1) * 43758.5453);
          float h2 = fract(sin(id * 78.233 + k * 1.7) * 24634.6345);
          float age = rng(ph, s, s + NET_ASH);
          float e = eout(age);
          q.xy += dir * (0.05 + 0.08 * h1) * e + side * (h2 - 0.5) * 0.24 * e;
          q.y += 0.14 * age * age * (0.6 + 0.8 * h2);
          q.x += sin(time * 3.1 + id * 1.7) * 0.014 * age;
          q.z = 0.0;
        } else if (ch > 107.5 && ch < 108.5) {
          // the flame's tongues sway, and it flares upwards each time it blocks a packet
          float up = smoothstep(0.0, 0.45, q.y);
          q.x += sin(time * 2.4 + q.y * 6.0) * 0.01 * up;
          q.y *= 1.0 + 0.05 * netHits(ph) * smoothstep(-0.2, 0.45, q.y);
        } else if (ch < 104.5) {
          for (int i = 0; i < 3; i++) {
            float s = netStrike(float(i));
            float d = acos(clamp(dot(normalize(q.xy), netDir(float(i))), -1.0, 1.0));
            q.xy *= 1.0 - 0.03 * exp(-d * d * 30.0) * bump(rng(ph, s, s + 0.12));
          }
        }
        p = tiltFwd(q, 0.28, 0.16);
      }
    } else if (form < 7.5) {
      // Fingerprint: the frame locks on while the ridges swell under the scan line.
      if (abs(p.z - 0.06) < 0.02 && max(abs(p.x), abs(p.y)) > 0.7) {
        p.xy *= 1.0 - 0.07 * bump(rng(ph, 0.18, 0.62));
      } else if (abs(p.z - 0.17) < 0.011) {
        float d = (p.y - sin(time * 1.7) * 0.9) * 6.0;
        p.x *= 1.0 + 0.035 * exp(-d * d);
      }
    } else if (form < 8.5) {
      // Malware: the whole mark stays rigid. The infection wave is a gradient (see fxFragment).
    } else {
      // Eye: a reticle spins in and locks on, the iris turns and wanders, the pupil dilates, and
      // the lid blinks.
      if (ch > 69.5 && ch < 70.5) {
        float lock = eout(rng(ph, 0.0, 0.8));
        vec2 iris = vec2(sin(time * 1.15) * 0.065, sin(time * 0.73 + 0.4) * 0.032);
        p.xy = iris + rot2(p.xy, (1.0 - lock) * 2.6) * (1.0 + 0.1 * (1.0 - lock));
      } else {
        if (p.z > 0.2 && dot(p.xy, p.xy) < 0.025) p.xy *= 1.0 + 0.3 * bump(rng(ph, 0.58, 0.95));
        if (p.z > 0.1925 && p.z < 0.2025 && dot(p.xy, p.xy) < 0.12) p.xy = rot2(p.xy, time * 0.25);
        if (p.z > 0.17 && dot(p.xy, p.xy) < 0.19) {
          if (dot(p.xy, p.xy) < 0.025) p.xy *= 1.0 + sin(time * 1.5) * 0.025;
          p.xy += vec2(sin(time * 1.15) * 0.065, sin(time * 0.73 + 0.4) * 0.032);
        }
      }
      float blink = bump(rng(ph, 0.36, 0.60));
      if ((p.z > 0.12 || p.z < 0.07) && abs(p.y) < 0.6 && abs(p.x) < 1.01) {
        p.y *= 1.0 - 0.94 * blink * blink;
      }
    }
    return p;
  }
`

/**
 * The morph, shared by particles, wires and markers so they never disagree. Each point of wire
 * fades into particles, which drift off almost at once, loosen while they rearrange, gather on the
 * next object's outline, and fade as solid wire grows back under them. Every point has its own
 * random `j` (0..1) and the windows are wide and overlapping, so at any moment some of the object is
 * in each state and the whole thing reads as one continuous morph rather than a series of steps.
 * Times are in morph progress (0..1).
 */
const handoff = /* glsl */ `
  // how long one stretch of wire takes to fade into particles, or back into wire
  const float FADE = 0.12;
  float dissolveAt(float j) { return 0.22 * j; }
  float solidifyAt(float j) { return 0.62 + 0.24 * j; }
  // When a point of the outgoing object comes apart. Wire and particles read the same smooth field
  // over space (with a little per-point jitter), so wherever a stretch of wire fades there is already
  // a particle sitting on it, instead of wire vanishing in one place and particles popping up in
  // another. The mirror of the arrival, where particles land before the wire grows back.
  float dissolveField(vec3 p) {
    return clamp(0.5 + 0.27 * sin(p.x * 2.9 + p.y * 1.4 + 1.7) + 0.23 * sin(p.y * 2.5 - p.z * 2.1 + p.x * 0.9 + 0.4), 0.0, 1.0);
  }
  float dissolveWhen(vec3 p, float j) { return 0.03 + 0.21 * mix(dissolveField(p), j, 0.3); }
  float hbump(float t) { return sin(3.14159265 * clamp(t, 0.0, 1.0)); }
  float hrng(float x, float a, float b) { return clamp((x - a) / (b - a), 0.0, 1.0); }
  // A slight, slow draw-in as the object starts to come apart and a slight breathe-out as the next
  // one forms. Both return to exactly 1, so the hold on either side never snaps.
  float windupScale(float progress) { return 1.0 - 0.015 * hbump(hrng(progress, 0.0, 0.35)); }
  float settleScale(float progress) { return 1.0 + 0.012 * hbump(hrng(progress, 0.65, 1.0)); }
`

export const particleVertex = /* glsl */ `
  attribute vec3 aSource;
  attribute vec3 aTarget;
  attribute vec2 aSeed;
  uniform float uProgress;
  uniform float uTransition;
  uniform float uTime;
  uniform float uDensity;
  uniform float uSourceForm;
  uniform float uTargetForm;
  uniform float uPhase;
  uniform float uPixelRatio;
  uniform vec2 uResolution;
  uniform float uSwirl;
  uniform float uFlowSeed;
  uniform vec3 uPointer;
  uniform float uGlow;
  varying float vAlpha;
  varying float vTint;
  varying float vEnergy;
  varying float vSpark;
  varying vec2 vStreak;
  varying float vHalf;
  varying float vRadius;
  varying float vDepthFade;

  ${idleMotion}
  ${handoff}

  // Divergence free (no component depends on its own axis), so particles that start close together
  // are carried along together and the cloud forms strands instead of fog.
  vec3 flow(vec3 p) {
    float t = uTime * 0.35 + uFlowSeed;
    vec3 f = vec3(
      sin(p.y * 1.7 + t) + sin(p.z * 2.3 - t * 0.7),
      sin(p.z * 1.9 + t * 0.8) + sin(p.x * 2.1 + t * 0.6),
      sin(p.x * 1.6 - t * 0.9) + sin(p.y * 2.4 + t * 0.5)
    );
    f += 0.5 * vec3(sin(p.y * 3.9 - t * 1.3), sin(p.z * 4.3 + t * 1.1), sin(p.x * 3.7 + t * 1.2));
    return f * 0.4;
  }

  vec3 pathAt(vec3 source, vec3 target, float t) {
    // Zero velocity at both ends, quickest at a third of the way: a fast release, a slow approach.
    // Smootherstep: starts and finishes at rest with no jolt in speed, so nothing launches or lands.
    float e = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    // Each particle loops out by its own amount, so the cloud has depth instead of one shell.
    float arc = 4.0 * e * (1.0 - e) * (0.6 + 0.7 * fract(aSeed.y * 5.37 + aSeed.x));
    vec3 p = mix(source, target, e);
    p.xz = rot2(p.xz, uSwirl * 0.22 * arc);
    // bow outwards, so the stream does not pile up where the two objects overlap
    p.xy += normalize(p.xy + vec2(0.0001)) * 0.12 * arc;
    // Mostly every particle for itself: its own scatter direction, a wobble that keeps changing
    // while it flies, and only a light pull from the shared flow, which keeps a sense of direction.
    vec3 scatter = normalize(vec3(
      cos(aSeed.x * 6.2831853) * 1.2,
      sin(aSeed.y * 6.2831853),
      sin(aSeed.x * 9.4247779 + aSeed.y * 3.0)
    ) + vec3(0.0001));
    float wobbleTime = uTime * (1.6 + aSeed.y * 1.8);
    vec3 wobble = vec3(
      sin(wobbleTime + aSeed.x * 40.0),
      cos(wobbleTime * 1.3 + aSeed.y * 31.0),
      sin(wobbleTime * 0.8 + aSeed.x * 23.0)
    );
    vec3 ownFlow = flow(p * 1.15 + scatter * 1.7);
    return p + (scatter * (0.13 + 0.17 * aSeed.x) + wobble * 0.045 + ownFlow * 0.08) * arc;
  }


  vec2 toPixels(vec4 clip) { return clip.xy / clip.w * uResolution * 0.5; }

  void main() {
    vTint = aSeed.x;
    if (aSeed.x > uDensity || uTransition < 0.5) {
      vAlpha = 0.0;
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    vec3 rest = idlePosition(aSource, uSourceForm, uTime, uPhase, -1.0);
    // It fades in on the wire just before that stretch of wire starts to fade, and only lifts off
    // once the wire beneath it is mostly gone, so the outline hands over to points without a gap.
    // Independent jitters for each phase, so a particle that appears early does not also land early.
    float release = dissolveWhen(rest, aSeed.y);
    float appear = max(release - 0.035, 0.0);
    float depart = release + 0.06 + 0.05 * fract(aSeed.x * 13.7 + aSeed.y * 3.1);
    float arrive = max(0.50 + 0.24 * fract(aSeed.x * 7.9 + aSeed.y * 11.3), depart + 0.32);
    float fade = max(arrive + 0.04, solidifyAt(fract(aSeed.x * 5.3 + aSeed.y * 17.9)) + 0.03);
    float flight = arrive - depart;
    float t = clamp((uProgress - depart) / flight, 0.0, 1.0);
    // Where it was a moment ago, for the streak. Faster particles leave longer streaks.
    float before = clamp((uProgress - 0.011 - depart) / flight, 0.0, 1.0);

    vec3 source = rest * windupScale(uProgress);
    vec3 target = idlePosition(aTarget, uTargetForm, uTime, 0.0, -1.0) * settleScale(uProgress);
    vec3 p = pathAt(source, target, t);
    // At rest on an outline, particles shimmer a little rather than sitting dead still.
    float resting = 1.0 - hbump(t);
    p += vec3(sin(uTime * 5.0 + aSeed.x * 61.0), cos(uTime * 4.3 + aSeed.y * 47.0), 0.0) * 0.006 * resting;
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    vec4 projected = projectionMatrix * view;
    vec2 head = toPixels(projected);
    vec2 tail = toPixels(projectionMatrix * modelViewMatrix * vec4(pathAt(source, target, before), 1.0));

    float spark = step(0.94, fract(aSeed.y * 7.31 + aSeed.x * 3.7));
    float depth = clamp(1.1 - (-view.z - 4.0) * 0.23, 0.0, 1.0);
    // Small points, so neighbours on a crowded outline stay separate instead of merging into a band.
    // Nearer points are a little larger as well as brighter, which gives the cloud real depth.
    float radius = (0.56 + aSeed.y * 0.40) * (1.0 + spark * 0.8) * uPixelRatio;
    radius *= clamp(5.3 / -view.z, 0.55, 1.6) * mix(0.78, 1.18, depth);
    radius = max(radius, 0.8);

    vec2 dir = head - tail;
    // Short comet heads: long hairline streaks smeared the cloud into grey scratches.
    float len = min(length(dir), 3.6 * uPixelRatio);
    dir = len > 0.001 ? normalize(dir) : vec2(1.0, 0.0);
    vec2 normal = vec2(-dir.y, dir.x);
    // streaks are a little thinner than dots, and the glow copy is wide and soft
    radius *= mix(1.0, 0.88, clamp(len / (3.6 * uPixelRatio), 0.0, 1.0));
    if (uGlow > 0.5) radius *= 2.6;
    float halfLen = len * 0.5;
    vec2 centre = head - dir * halfLen;

    float airborne = hbump(t);
    vec2 toPointer = centre - uPointer.xy * uResolution * 0.5;
    float reach = 70.0 * uPixelRatio;
    float push = exp(-dot(toPointer, toPointer) / (reach * reach)) * uPointer.z * airborne;
    centre += (length(toPointer) > 0.001 ? normalize(toPointer) : dir) * push * 26.0 * uPixelRatio;

    vec2 local = vec2(position.x * 2.0 * (halfLen + radius), position.y * 2.0 * radius);
    vec2 pixel = centre + dir * local.x + normal * local.y;
    projected.xy = pixel * 2.0 / uResolution * projected.w;
    gl_Position = projected;
    vStreak = local;
    vHalf = halfLen;
    vRadius = radius;

    vEnergy = clamp(len / (3.6 * uPixelRatio), 0.0, 1.0);
    vSpark = spark;
    float glint = exp(-pow((uProgress - appear - 0.05) / 0.06, 2.0));
    float landing = exp(-pow((uProgress - arrive) / 0.06, 2.0));
    float shown = smoothstep(appear, appear + FADE, uProgress) * (1.0 - smoothstep(fade, fade + 0.09, uProgress));
    float twinkle = mix(1.0, 0.65 + 0.35 * sin(uTime * 9.0 + aSeed.y * 50.0), spark);
    // a streak spreads its light along its length, so it is not brighter than a dot overall
    vDepthFade = depth;
    // Rises with take-off, then eases to 70% once landed and holds until the wire takes over (the
    // particle fades out then anyway), so the gap before the new outline solidifies is not a dip.
    float lift = t < 0.5 ? hbump(t) : mix(1.0, 0.7, smoothstep(0.5, 1.0, t));
    // Airborne points burn brighter: the cloud is sparser than an outline, and without this lift the
    // middle of the morph would read as a dip in light.
    vAlpha = shown * mix(0.32, 1.0, depth) * twinkle * (1.0 + 0.85 * lift) * (mix(0.85, 0.68, vEnergy) + 0.14 * glint + 0.14 * landing);
  }
`

export const particleFragment = /* glsl */ `
  uniform vec3 uBlue;
  uniform vec3 uLavender;
  uniform float uGlow;
  uniform float uCrowd;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vTint;
  varying float vEnergy;
  varying float vSpark;
  varying vec2 vStreak;
  varying float vHalf;
  varying float vRadius;
  varying float vDepthFade;
  void main() {
    if (vAlpha < 0.002) discard;
    // A capsule: a round dot at rest, a streak in flight, brightest at the head.
    float d = length(vec2(max(abs(vStreak.x) - vHalf, 0.0), vStreak.y));
    if (d > vRadius) discard;
    float along = vHalf > 0.5 ? clamp((vStreak.x + vHalf) / (2.0 * vHalf), 0.0, 1.0) : 1.0;
    float tail = mix(0.3, 1.0, along * along);
    vec3 color = mix(uBlue, uLavender, smoothstep(0.55, 1.0, vTint) * 0.7 + vSpark * 0.45);
    if (uGlow > 0.5) {
      float soft = 1.0 - d / vRadius;
      gl_FragColor = vec4(color * 1.4, uCrowd * vAlpha * soft * soft * tail * (0.008 + 0.016 * vEnergy + vSpark * 0.02));
      return;
    }
    // Analytic anti-aliasing over about one device pixel keeps the rim crisp at any pixel ratio.
    float rim = clamp((vRadius - d) / max(0.55 * uPixelRatio, 0.75), 0.0, 1.0);
    // A hot centre inside each point, so it reads as a pin of light, not a flat disc.
    // measured from the head, so a moving point is a bright pin with a short fading trail
    float r = length(vec2(vStreak.x - max(vHalf, 0.0), vStreak.y)) / vRadius;
    float hot = exp(-r * r * 4.5);
    // Grain: mostly modest points with a few bright ones, so the cloud has clear separation.
    float g = fract(vTint * 91.7 + vRadius * 3.1);
    float grain = 0.42 + 1.05 * g * g;
    // Far points sink into a deeper blue, near ones run whiter: aerial perspective in the cloud.
    vec3 deep = color * vec3(0.55, 0.72, 1.0);
    color = mix(deep, color, smoothstep(0.1, 0.8, vDepthFade));
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = max(mix(vec3(luma), color, 1.3), 0.0);
    color = mix(color, vec3(1.0), hot * (0.25 + 0.3 * vDepthFade) + vSpark * 0.12);
    color = 1.055 * pow(max(color, 0.0), vec3(1.0 / 2.4)) - 0.055;
    float profile = 0.5 + 0.7 * hot;
    gl_FragColor = vec4(color, min(1.0, vAlpha * 1.9 * grain * uCrowd * profile) * rim * tail);
  }
`

export const edgeVertex = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute float aEdge;
  attribute float aWeight;
  attribute float aChannel;
  attribute float aFlow;
  attribute float aSpan;
  uniform float uForm;
  uniform float uTime;
  uniform float uPhase;
  uniform vec2 uLineResolution;
  uniform float uNodePixelRatio;
  varying float vAlong;
  varying float vEdge;
  varying float vDepth;
  varying float vLight;
  varying vec3 vLocal;
  varying float vFlow;
  varying float vChannel;
  varying vec2 vStroke;
  varying float vLength;
  varying float vRadius;
  varying float vMotion;
  varying float vRel;
  uniform float uRole;
  uniform float uProgress;
  ${idleMotion}
  ${handoff}
  void main() {
    float handoffScale = mix(windupScale(uProgress), settleScale(uProgress), uRole);
    vec3 startPoint = idlePosition(aStart,uForm,uTime,uPhase,aChannel) * handoffScale;
    vec3 endPoint = idlePosition(aEnd,uForm,uTime,uPhase,aChannel) * handoffScale;
    vLocal = mix(startPoint,endPoint,uv.x);
    vMotion = mix(length(startPoint - aStart), length(endPoint - aEnd), uv.x);
    vFlow = aFlow + aSpan * uv.x;
    vChannel = aChannel;
    vec4 startView = modelViewMatrix * vec4(startPoint, 1.0);
    vec4 endView = modelViewMatrix * vec4(endPoint, 1.0);
    if (aChannel > 20.5 && aChannel < 21.5) {
      // The globe's limb is a true circle facing the camera, whatever the object's rotation.
      startView = vec4(modelViewMatrix[3].xyz + vec3(aStart.xy, 0.0), 1.0);
      endView = vec4(modelViewMatrix[3].xyz + vec3(aEnd.xy, 0.0), 1.0);
    }
    vRel = mix(startView.z, endView.z, uv.x) - modelViewMatrix[3].z;
    vec4 start = projectionMatrix * startView;
    vec4 end = projectionMatrix * endView;
    vec2 a = start.xy / start.w * uLineResolution * 0.5;
    vec2 b = end.xy / end.w * uLineResolution * 0.5;
    vec2 direction = b - a;
    float lengthPx = max(length(direction), 0.001);
    direction /= lengthPx;
    vec2 normal = vec2(-direction.y, direction.x);
    float radius = 1.12 * aWeight * uNodePixelRatio;
    float padding = radius + 0.75;
    float along = uv.x * (lengthPx + padding * 2.0) - padding;
    vec2 pixel = a + direction * along + normal * (uv.y * 2.0 - 1.0) * padding;
    vec4 projected = mix(start, end, uv.x);
    projected.xy = pixel * 2.0 / uLineResolution * projected.w;
    gl_Position = projected;
    vStroke = vec2(along, (uv.y * 2.0 - 1.0) * padding);
    vRadius = radius;
    vLength = lengthPx;
    vAlong = uv.x;
    vEdge = aEdge;
    float depth = mix(startView.z, endView.z, uv.x);
    vDepth = clamp(1.05 - (-depth - 4.0) * 0.31, 0.25, 1.0);
    vec3 local = mix(aStart, aEnd, uv.x);
    vLight = clamp(0.96 + local.y * 0.12 - local.x * 0.065 + local.z * 0.12, 0.66, 1.18);
  }
`

export const edgeFragment = /* glsl */ `
  uniform float uProgress;
  uniform float uForm;
  uniform float uRole;
  uniform float uTime;
  uniform float uPhase;
  uniform vec3 uBlue;
  uniform vec3 uLavender;
  float rng(float x, float a, float b) { return clamp((x - a) / (b - a), 0.0, 1.0); }
  float eio(float t) { return t * t * (3.0 - 2.0 * t); }
  float eout(float t) { float s = 1.0 - t; return 1.0 - s * s * s; }
  float bump(float t) { return sin(3.14159265 * clamp(t, 0.0, 1.0)); }
  varying float vAlong;
  varying float vEdge;
  varying float vDepth;
  varying float vLight;
  varying vec3 vLocal;
  varying float vFlow;
  varying float vChannel;
  varying vec2 vStroke;
  varying float vLength;
  varying float vRadius;
  varying float vMotion;
  varying float vRel;
  ${handoff}
  ${networkTimeline}
  float hash(float p) { return fract(sin(p * 127.1) * 43758.5453); }
  // Signal palette: green = safe, amber/orange = threat or heat. Violet, yellow and teal mark
  // identity. Each is a touch richer than the base blue/lavender so it separates from it.
  const vec3 C_GREEN = vec3(0.33, 0.95, 0.64);
  const vec3 C_AMBER = vec3(1.0, 0.71, 0.4);
  const vec3 C_ORANGE = vec3(1.0, 0.52, 0.18);
  const vec3 C_VIOLET = vec3(0.74, 0.55, 1.0);
  const vec3 C_YELLOW = vec3(0.97, 0.79, 0.28);
  const vec3 C_TEAL = vec3(0.27, 0.87, 0.92);
  void main() {
    float cap = max(max(-vStroke.x, vStroke.x - vLength), 0.0);
    float distanceToEdge = length(vec2(cap, vStroke.y));
    // a one-pixel analytic edge: as sharp as the raster allows without stair-stepping
    float coverage = 1.0 - smoothstep(vRadius - 0.5, vRadius + 0.5, distanceToEdge);
    if (coverage < 0.01) discard;
    // Each short stretch of wire has its own moment, blended smoothly into its neighbours' so the
    // dissolving wire frays continuously instead of breaking into hard-edged blocks.
    float cellPos = vAlong * 24.0;
    float cell = floor(cellPos);
    float blend = smoothstep(0.25, 0.75, fract(cellPos));
    float phase = mix(hash(cell + vEdge * 43.71), hash(cell + 1.0 + vEdge * 43.71), blend);
    // Short stretches of wire fade into particles, and later back, each at its own moment.
    float dissolve = dissolveWhen(vLocal, phase);
    float solidify = solidifyAt(phase);
    float outgoing = 1.0 - smoothstep(dissolve, dissolve + FADE, uProgress);
    float incoming = smoothstep(solidify, solidify + FADE, uProgress);
    float alpha = mix(outgoing, incoming, uRole);
    // a soft glow while a stretch changes state, never a pop
    float handoffFlash = uRole < 0.5
      ? exp(-pow((uProgress - dissolve - 0.03) / 0.05, 2.0)) * 0.35
      : exp(-pow((uProgress - solidify - 0.06) / 0.05, 2.0)) * 0.4;
    if (alpha < 0.003) discard;
    float pulse = 0.0;
    float gain = 0.0;
    float visibility = 1.0;
    float phaseAlong = fract(uTime * 0.30);
    float distanceAlong = abs(vFlow - phaseAlong);
    float runner = exp(-pow(min(distanceAlong,1.0-distanceAlong) * 28.0,2.0));
    if (vChannel > 0.5 && vChannel < 1.5) {
      pulse = runner;
      if (uForm > 2.5 && uForm < 3.5) pulse = exp(-pow((vLocal.y-sin(uTime*1.1)*0.78)*9.0,2.0));
      if (uForm > 7.5 && uForm < 8.5) pulse = 0.0;
      gain = 1.05;
    }
    if (vChannel > 1.5 && vChannel < 2.5) { pulse=pow(max(0.0,sin(uTime*2.0)),4.0); gain=1.3; }
    if (vChannel > 2.5 && vChannel < 3.5) { pulse=pow(max(0.0,sin(uTime*5.0+vLocal.y*5.2+vLocal.x*2.0)),6.0); gain=2.8; }
    if (uForm > 1.5 && uForm < 2.5 && vChannel < 0.5) { pulse=exp(-pow((vLocal.y-sin(uTime*1.5)*0.65)*10.0,2.0)); gain=0.55; }
    if (vChannel > 4.5 && vChannel < 5.5) { pulse=runner; gain=2.8; }
    if (vChannel > 5.5 && vChannel < 6.5) { pulse=exp(-pow((vFlow-fract(uTime*0.4))*7.0,2.0)); gain=1.2; }
    if (vChannel > 6.5 && vChannel < 7.5) {
      float packet = fract(vFlow-uTime*0.85+atan(vLocal.y,vLocal.x)*0.22);
      pulse=exp(-pow(min(packet,1.0-packet)*22.0,2.0)); gain=3.3;
    }
    if (vChannel > 7.5 && vChannel < 8.5) { pulse=pow(max(0.0,sin(uTime*3.5)),2.0); gain=2.0; }
    if (vChannel > 8.5 && vChannel < 9.5) { pulse=exp(-pow((vLocal.y-sin(uTime*1.7)*0.90)*13.0,2.0)); gain=1.7; }
    if (vChannel > 10.5 && vChannel < 11.5) {
      float breath = 0.5 + 0.5 * sin(uTime * 1.6 - 0.4);
      pulse = breath * breath * (3.0 - 2.0 * breath);
      gain = 1.25;
    }
    float whiten = 0.0;
    vec3 accent = vec3(0.0);
    float accentMix = 0.0;
    // Animation-only wires: the key draws on from the bow and fades once it has done its work,
    // and it is hidden where it passes inside the lock body.
    if (vChannel > 11.5 && vChannel < 12.5) {
      float reveal = eio(rng(uPhase, 0.0, 0.2)) * 1.1;
      visibility = (1.0 - smoothstep(reveal - 0.05, reveal, vFlow)) * (1.0 - smoothstep(0.9, 0.99, uPhase));
      visibility *= smoothstep(0.3, 0.335, vLocal.z);
      float front = (vFlow - reveal) * 12.0;
      pulse = exp(-front * front) * (1.0 - step(0.22, uPhase));
      gain = 2.2;
    }
    // Containment strike: ignites at one end and runs through the mark like a lightsaber.
    if (vChannel > 13.5 && vChannel < 14.5) {
      float reach = eout(rng(uPhase, 0.58, 0.78)) * 1.03;
      visibility = 1.0 - smoothstep(reach - 0.015, reach, vFlow);
      float tipGlow = (vFlow - reach) * 9.0;
      pulse = max(exp(-tipGlow * tipGlow), 0.5) * (1.0 + 0.07 * sin(uTime * 38.0));
      gain = 3.4 - 1.8 * rng(uPhase, 0.84, 1.0);
      whiten = 0.55;
    }
    // The heel leg runs into the body and is hidden below its top face.
    if (vChannel > 16.5 && vChannel < 17.5) {
      float plane = 0.1107;
      visibility *= smoothstep(plane + 0.0005, plane + 0.004, vLocal.y);
    }
    // The eye glows after the blink, brightest through the iris.
    if (uForm > 8.5) {
      float lit = smoothstep(0.58, 0.68, uPhase) * (1.0 - 0.4 * rng(uPhase, 0.8, 1.0));
      float inIris = 1.0 - smoothstep(0.38, 0.46, length(vLocal.xy));
      pulse = max(pulse, lit * mix(0.35, 0.7, inIris));
      gain = max(gain, lit * mix(1.1, 1.6, inIris));
    }
    // A scan band sweeps down the shell.
    if (vChannel > 10.5 && vChannel < 11.5) {
      float band = (vLocal.y - mix(0.75, -0.65, rng(uPhase, 0.05, 0.55))) * 7.0;
      pulse = max(pulse, exp(-band * band));
      gain = max(gain, 1.6);
    }
    // A soft sweep of light crosses the shield before the key arrives.
    if (uForm < 0.5 && vChannel < 1.5) {
      float d = (vLocal.x * 0.6 + vLocal.y * 0.8 - mix(-1.6, 1.6, rng(uPhase, 0.0, 0.5))) * 3.2;
      pulse = max(pulse, exp(-d * d) * 0.7);
      gain = max(gain, 1.2);
    }
    // The lock lights up as the key turns.
    if (uForm < 0.5 && vChannel < 0.5 && abs(vLocal.x) < 0.45 && vLocal.y > -0.5 && vLocal.y < 0.72 && vLocal.z > 0.12) {
      pulse = smoothstep(0.62, 0.78, uPhase) * (1.0 - smoothstep(0.84, 1.0, uPhase));
      gain = 1.5;
    }
    // The fingerprint glows as a match is confirmed.
    if (uForm > 6.5 && uForm < 7.5) {
      float matched = smoothstep(0.66, 0.78, uPhase) * (1.0 - smoothstep(0.9, 1.0, uPhase));
      pulse = max(pulse, matched);
      gain = max(gain, 1.4 * step(0.001, matched));
    }
    // Language badges draw themselves on one after another and then stay.
    float tintShift = 0.0;
    if (vChannel > 17.5 && vChannel < 20.5) {
      float k = vChannel - 18.0;
      float t = rng(uPhase, 0.06 + k * 0.22, 0.4 + k * 0.22);
      float reveal = eout(rng(t, 0.0, 0.6)) * 1.1;
      visibility = 1.0 - smoothstep(reveal - 0.05, reveal, vFlow);
      float front = (vFlow - reveal) * 12.0;
      pulse = exp(-front * front) * (1.0 - step(0.6, t));
      gain = 2.0;
      // Python stays blue, JavaScript yellow, PHP violet
      accent = k < 1.5 ? C_YELLOW : C_VIOLET;
      accentMix = k < 0.5 ? 0.0 : (k < 1.5 ? 0.6 : 0.62);
    }
    // Servers: the drive-bay slots chase light along each unit.
    if (vChannel > 4.5 && vChannel < 5.5) {
      pulse = pow(max(0.0, sin(uTime * 7.0 - vLocal.x * 10.0)), 3.0);
      gain = 1.7;
    }
    // Malware: the frame flashes as the strike lands.
    if (uForm > 7.5 && uForm < 8.5 && vChannel > 0.5 && vChannel < 1.5) {
      pulse = max(pulse, bump(rng(uPhase, 0.6, 0.95)) * 0.6);
      gain = max(gain, 1.2);
    }
    // Code: two lines type themselves out beneath the glyph, with a bright caret at the head.
    if (vChannel > 59.5 && vChannel < 61.5) {
      float row = vChannel - 60.0;
      float t = rng(uPhase, 0.08 + row * 0.26, 0.38 + row * 0.26);
      float reveal = t * 1.04;
      visibility = 1.0 - smoothstep(reveal - 0.03, reveal, vFlow);
      float caret = (vFlow - reveal) * 16.0;
      pulse = exp(-caret * caret) * step(0.001, t) * (1.0 - step(0.999, t));
      gain = 2.4;
    }
    // Eye: the targeting reticle appears, then flares as it locks on.
    if (vChannel > 69.5 && vChannel < 70.5) {
      visibility = smoothstep(0.02, 0.14, uPhase);
      pulse = bump(rng(uPhase, 0.7, 0.9));
      gain = 2.2;
    }
    // Fingerprint: the check badge draws on, the confidence bar fills, minutiae pop as found.
    if (vChannel > 77.5 && vChannel < 78.5) {
      float reveal = eout(rng(uPhase, 0.74, 0.9)) * 1.05;
      visibility = 1.0 - smoothstep(reveal - 0.04, reveal, vFlow);
      float front = (vFlow - reveal) * 12.0;
      pulse = exp(-front * front);
      gain = 2.0;
      tintShift = 0.3;
    }
    if (vChannel > 78.5 && vChannel < 79.5) {
      float level = (vLocal.x + 0.45) / 0.9;
      float filled = step(level, rng(uPhase, 0.1, 0.72) * 1.02);
      visibility = mix(0.35, 1.0, filled);
      pulse = filled * 0.35;
      gain = 1.2;
      tintShift = 0.35 * smoothstep(0.7, 0.8, uPhase);
    }
    if (vChannel > 79.5 && vChannel < 87.5) {
      float t = rng(uPhase, 0.12 + (vChannel - 80.0) * 0.07, 0.2 + (vChannel - 80.0) * 0.07);
      visibility = smoothstep(0.0, 1.0, t);
      pulse = bump(rng(t, 0.0, 0.6));
      gain = 2.4;
    }
    // Network: allowed traffic flows inwards along the spokes as packets, each spoke on its own beat.
    // The wire lights up under each traffic packet, with a short trail behind it.
    if (vChannel > 106.5 && vChannel < 107.5) {
      float i = floor(vFlow * 6.0 + 0.5);
      float d = vAlong - netTraffic(i, uTime);
      float behind = mix(d, -d, netInbound(i, uTime));
      float trail = step(0.0, behind) * exp(-behind * 7.0);
      pulse = max(exp(-pow(d * 16.0, 2.0)), trail * 0.55) * netTrafficFade(i, uTime);
      gain = 2.2;
    }
    if (vChannel > 115.5 && vChannel < 116.5) {
      float i = floor(vFlow * 6.0 + 0.5);
      visibility = netTrafficFade(i, uTime);
      pulse = 0.9;
      gain = 2.0;
      whiten = 0.2;
    }
    // Inspection rings: quiet at rest, brightening as a packet closes in.
    if (vChannel > 116.5 && vChannel < 117.5) {
      float alert = netAlert(uPhase);
      float secured = smoothstep(netStrike(2.0) + 0.12, netStrike(2.0) + 0.2, uPhase);
      visibility = (vFlow < 0.5 ? 0.6 : 0.4) + 0.4 * alert;
      pulse = alert * 0.8;
      gain = 1.6;
      accent = C_GREEN;
      accentMix = 0.55 * secured;
    }
    // Network: the perimeter is quiet until a packet strikes it. The stretch it hits turns green
    // for a moment.
    if (vChannel > 103.5 && vChannel < 104.5) {
      float held = 0.0;
      for (int i = 0; i < 3; i++) {
        float k = float(i), s = netStrike(k);
        float d = abs(vFlow - netTurn(k));
        d = min(d, 1.0 - d);
        held = max(held, exp(-pow(d * 15.0, 2.0)) * bump(rng(uPhase, s - 0.005, s + 0.15)));
      }
      visibility = 0.62 + 0.38 * held;
      pulse = held;
      gain = 2.6;
      accent = C_GREEN;
      accentMix = held;
    }
    // Network: the packets, amber while they approach, flaring orange as they catch fire.
    if (vChannel > 109.5 && vChannel < 112.5) {
      float s = netStrike(vChannel - 110.0);
      visibility = smoothstep(s - NET_APPROACH, s - NET_APPROACH + 0.04, uPhase) * (1.0 - smoothstep(s + 0.005, s + 0.035, uPhase));
      float ignite = rng(uPhase, s - 0.01, s + 0.03);
      pulse = 0.25 + 0.9 * exp(-pow((uPhase - s - 0.005) / 0.012, 2.0));
      gain = 1.5;
      accent = mix(vec3(1.0, 0.62, 0.28), vec3(1.0, 0.42, 0.12), ignite);
      accentMix = 1.0;
    }
    // Network: ash, glowing embers at first that cool to grey and fade as they drift away.
    if (vChannel > 112.5 && vChannel < 115.5) {
      float s = netStrike(vChannel - 113.0);
      float age = rng(uPhase, s, s + NET_ASH);
      float ember = 1.0 - smoothstep(0.0, 0.45, age);
      visibility = step(s, uPhase) * (1.0 - smoothstep(0.5, 1.0, age)) * mix(0.55, 1.0, ember);
      pulse = ember * 0.9;
      gain = 1.8;
      accent = mix(vec3(0.42, 0.40, 0.40), vec3(1.0, 0.5, 0.16), ember);
      accentMix = 1.0;
    }
    // Network: the check is a quiet blue until a packet is blocked. Then it turns green, running
    // from one end of the stroke to the other, holds a moment, and settles back, until the last
    // block, after which it stays green. The shield around it flashes with each block.
    float blocked = 0.0;
    float front = -1.0;
    for (int i = 0; i < 3; i++) {
      float s = netStrike(float(i));
      float settle = i < 2 ? 1.0 - rng(uPhase, s + 0.1, s + 0.15) : 1.0;
      float run = rng(uPhase, s + 0.005, s + 0.045);
      if (uPhase > s) front = run * 1.15;
      blocked = max(blocked, step(0.001, run) * settle);
    }
    if (vChannel > 104.5 && vChannel < 105.5) {
      float green = blocked * (1.0 - smoothstep(front - 0.1, front, vFlow));
      float head = exp(-pow((vFlow - front) * 10.0, 2.0)) * step(front, 1.1);
      visibility = 0.6 + 0.4 * green;
      pulse = max(green * 0.6, head * blocked);
      gain = 2.0;
      accent = C_GREEN;
      accentMix = 0.92 * green;
    }
    if (vChannel > 105.5 && vChannel < 106.5) {
      float flash = 0.0;
      for (int i = 0; i < 3; i++) flash = max(flash, bump(rng(uPhase, netStrike(float(i)), netStrike(float(i)) + 0.09)));
      float secured = smoothstep(netStrike(2.0) + 0.06, netStrike(2.0) + 0.12, uPhase);
      pulse = max(flash, secured * 0.3);
      gain = 1.8;
      accent = C_GREEN;
      accentMix = max(0.85 * flash, 0.6 * secured);
    }
    // Network: the firewall's flame warms to orange once it is in action, flaring with each block,
    // with a flicker running round its outline.
    if (vChannel > 107.5 && vChannel < 108.5) {
      float hits = netHits(uPhase);
      float armed = smoothstep(netStrike(0.0), netStrike(0.0) + 0.06, uPhase);
      float heat = clamp(0.3 * armed + 0.4 * hits, 0.0, 0.65);
      float flicker = 0.5 + 0.5 * sin(uTime * 6.0 - vFlow * 25.0);
      pulse = heat * (0.6 + 0.4 * flicker);
      gain = 1.6;
      accent = vec3(1.0, 0.55, 0.22);
      accentMix = heat;
    }
    // Network: status lights tick over quietly, then go green one after another once it is clear.
    if (vChannel > 102.5 && vChannel < 103.5) {
      float idle = 0.25 + 0.25 * pow(max(0.0, sin(uTime * 2.2 + vFlow * 6.2831853)), 4.0);
      float sweep = bump(rng(uPhase, 0.74 + vFlow * 0.14, 0.86 + vFlow * 0.14));
      float clear = smoothstep(0.76 + vFlow * 0.14, 0.8 + vFlow * 0.14, uPhase);
      pulse = max(idle, sweep);
      gain = 2.4;
      accent = C_GREEN;
      accentMix = 0.7 * max(clear, sweep);
    }
    // Radar: each return has its own hue. Fingerprint: each minutia mark does too.
    if (vChannel > 99.5 && vChannel < 102.5) {
      float k = vChannel - 100.0;
      accent = k < 0.5 ? C_AMBER : (k < 1.5 ? C_GREEN : C_VIOLET);
      accentMix = 0.75;
    }
    if (vChannel > 79.5 && vChannel < 87.5) {
      float k = mod(vChannel - 80.0, 3.0);
      accent = k < 0.5 ? C_GREEN : (k < 1.5 ? C_AMBER : C_VIOLET);
      accentMix = 0.7;
    }
    // Globe: limb ring, grid, land dots, and attacks. Anything on the far side is dimmed.
    float onFront = smoothstep(-0.15, 0.2, vRel);
    if (vChannel > 20.5 && vChannel < 21.5) {
      pulse = 0.3;
      gain = 1.0;
    }
    // Subtle palette: the graticule leans teal and each land dot picks its own cool hue.
    if (vChannel > 21.5 && vChannel < 22.5) {
      visibility = mix(0.1, 1.0, onFront) * 0.5;
      accent = C_TEAL;
      accentMix = 0.57;
    }
    if (vChannel > 22.5 && vChannel < 23.5) {
      visibility = mix(0.04, 1.0, onFront) * 0.95;
      float h = hash(vEdge * 0.37);
      accent = h < 0.34 ? C_GREEN : (h < 0.68 ? C_VIOLET : C_AMBER);
      accentMix = 0.75;
    }
    // Attacks are colour coded lightly: blue, violet and amber.
    if (vChannel > 23.5 && vChannel < 56.5) {
      float id = vChannel < 31.5 ? vChannel - 24.0 : floor((vChannel - 32.0) / 3.0);
      float kind = mod(id, 3.0);
      accent = kind < 1.5 ? C_VIOLET : C_AMBER;
      accentMix = kind > 0.5 ? 0.55 : 0.0;
      float launch = id * 0.0743;
      if (vChannel < 31.5) {
        float head = rng(uPhase, launch, launch + 0.32);
        float fade = 1.0 - rng(uPhase, launch + 0.32, launch + 0.5);
        float tail = pow(smoothstep(head - 0.95, head, vFlow), 1.6);
        visibility = step(vFlow, head) * step(0.001, head) * tail * fade * mix(0.12, 1.0, onFront);
        float atHead = (vFlow - head) * 14.0;
        pulse = exp(-atHead * atHead);
        gain = 3.0;
      } else {
        float ring = vChannel - 32.0 - id * 3.0;
        float t = rng(uPhase, launch + 0.32 + 0.035 * ring, launch + 0.47 + 0.035 * ring);
        visibility = bump(t) * 0.85 * mix(0.1, 1.0, onFront);
        pulse = 0.6;
        gain = 1.6;
      }
    }
    if (handoffFlash > 0.01) {
      pulse = max(pulse, handoffFlash);
      gain = max(gain, 1.8);
      whiten = max(whiten, handoffFlash * 0.3);
    }
    // Moving parts catch the light.
    float lift = clamp(vMotion * 2.5, 0.0, 1.0) * 0.5 * (1.0 - step(11.5, vChannel) * (1.0 - step(12.5, vChannel))) * (1.0 - step(20.5, vChannel));
    if (lift > 0.001) {
      pulse = max(pulse, lift);
      gain = max(gain, 1.2);
    }
    vec3 color = mix(uBlue,uLavender,clamp(0.20+min(pulse*gain*0.10,0.24)+tintShift,0.0,1.0));
    color = mix(color, accent, accentMix);
    color = mix(color, vec3(1.0), whiten);
    // Cross-section: a hot, near-white filament runs down the middle of a richer, more saturated
    // sheath. The filament carries the HDR energy (and so the bloom), the sheath gives the stroke a
    // crisp coloured edge, so outlines read as sharp lit tubes rather than flat pale bands.
    float energy = (1.0 + pulse * gain * 0.6) * vDepth * vLight;
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    vec3 sheathColor = max(mix(vec3(luma), color, 1.45), 0.0);
    float across = clamp(distanceToEdge / max(vRadius, 0.001), 0.0, 1.0);
    vec3 sheath = sheathColor * mix(1.05, 0.62, across * across);
    float coreRadius = max(vRadius * 0.36, 0.42);
    float core = 1.0 - smoothstep(coreRadius - 0.45, coreRadius + 0.45, distanceToEdge);
    // Coloured strokes keep more of their hue in the filament so they don't wash out to white.
    vec3 filament = mix(color, vec3(1.0), 0.6 - 0.15 * accentMix) * core * (0.75 + pulse * gain * 0.35);
    // Premultiplied for MAX blending (see scene.ts): where one stroke's round cap overlaps the next,
    // the brighter of the two wins, so the filament runs unbroken through every joint.
    float a = alpha * coverage * visibility;
    gl_FragColor = vec4((sheath + filament) * energy * a, a);
  }
`

export const nodeVertex = /* glsl */ `
  uniform float uNodePixelRatio;
  uniform float uProgress;
  uniform float uTime;
  uniform float uForm;
  uniform float uRole;
  uniform float uPhase;
  varying float vAlpha;
  ${idleMotion}
  ${handoff}
  void main() {
    float scale = mix(windupScale(uProgress), settleScale(uProgress), uRole);
    vec4 view = modelViewMatrix * vec4(idlePosition(position,uForm,uTime,uPhase,-1.0) * scale, 1.0);
    float dissolve = dissolveAt(0.5), solidify = solidifyAt(0.5);
    vAlpha = mix(1.0 - smoothstep(dissolve, dissolve + FADE, uProgress), smoothstep(solidify, solidify + FADE, uProgress), uRole);
    vAlpha *= clamp(1.1 - (-view.z - 4.0) * 0.25, 0.3, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = 1.8 * uNodePixelRatio;
  }
`

export const nodeFragment = /* glsl */ `
  uniform vec3 uBlue;
  varying float vAlpha;
  void main() {
    if (vAlpha < 0.002) discard;
    gl_FragColor = vec4(uBlue * 1.6, vAlpha * 0.1);
  }
`

/** Background dust: drifts slowly, is pushed outward by each morph, and parallaxes with the pointer. */
export const ambientVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uProgress;
  uniform float uTransition;
  uniform float uNodePixelRatio;
  uniform vec3 uPointer;
  varying float vAlpha;
  varying float vNear;
  float bumpAt(float x, float a, float b) { return sin(3.14159265 * clamp((x - a) / (b - a), 0.0, 1.0)); }
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.08 + aSeed * 20.0) * 0.06;
    p.y += cos(uTime * 0.10 + aSeed * 30.0) * 0.07;
    float gust = bumpAt(uProgress, 0.06 + aSeed * 0.08, 0.75) * uTransition;
    p.xy += normalize(p.xy + vec2(0.001)) * gust * (0.10 + aSeed * 0.12);
    float near = 1.0 + p.z * 0.4;
    p.xy += uPointer.xy * vec2(0.05, 0.04) * near;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (1.4 + aSeed * 2.2) * near * uNodePixelRatio;
    vAlpha = (0.10 + 0.08 * sin(uTime * 0.25 + aSeed * 12.0)) * near + gust * 0.12;
    vNear = near;
  }
`

export const ambientFragment = /* glsl */ `
  uniform vec3 uBlue;
  uniform vec3 uLavender;
  varying float vAlpha;
  varying float vNear;
  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    // depth layering: near motes are crisp specks, far ones stay soft and recede
    float edge = mix(0.15, 0.62, smoothstep(0.5, 0.85, vNear));
    float alpha = vAlpha * (1.0 - smoothstep(edge, 1.0, r)) * mix(0.85, 1.15, smoothstep(0.5, 0.85, vNear));
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(mix(uBlue, uLavender, 0.25) * 1.2, alpha);
  }
`

export const fullscreenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const blurFragment = /* glsl */ `
  uniform sampler2D tSource;
  uniform vec2 uDirection;
  uniform float uExtract;
  varying vec2 vUv;
  // Soft-knee extraction on peak brightness: only the hot filaments and bright particles bloom,
  // and they ease in, so the glow is controlled and never floods the dim body of the wires.
  vec3 sampleAt(vec2 uv) {
    vec3 color = texture2D(tSource, uv).rgb;
    if (uExtract < 0.5) return color;
    float peak = max(max(color.r, color.g), color.b);
    const float threshold = 0.42, knee = 0.32;
    float soft = clamp(peak - threshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 0.0001);
    return color * max(soft, peak - threshold) / max(peak, 0.0001);
  }
  void main() {
    vec3 color = sampleAt(vUv) * 0.227027;
    color += sampleAt(vUv + uDirection * 1.384615) * 0.316216;
    color += sampleAt(vUv - uDirection * 1.384615) * 0.316216;
    color += sampleAt(vUv + uDirection * 3.230769) * 0.070270;
    color += sampleAt(vUv - uDirection * 3.230769) * 0.070270;
    gl_FragColor = vec4(color, 1.0);
  }
`

export const compositeFragment = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform sampler2D tAura;
  uniform sampler2D tParticles;
  uniform float uTime;
  // 0 = dark theme (light glowing on a night ground), 1 = light theme (coloured ink on paper)
  uniform float uLight;
  varying vec2 vUv;
  vec3 toSRGB(vec3 v) {
    return mix(v * 12.92, 1.055 * pow(max(v, 0.0), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), v));
  }
  // ACES-style filmic curve: a firm toe keeps the ground dark and the mid-tones contrasty, and the
  // gentle shoulder rolls hot cores towards white without clipping them flat.
  vec3 filmic(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    vec3 k = vec3(0.1031, 0.1030, 0.0973);
    vec3 a = fract(vec3(i.xyx) * k); a += dot(a, a.yzx + 33.33);
    float n00 = fract((a.x+a.y)*a.z);
    a = fract(vec3((i+vec2(1,0)).xyx) * k); a += dot(a,a.yzx+33.33);
    float n10 = fract((a.x+a.y)*a.z);
    a = fract(vec3((i+vec2(0,1)).xyx) * k); a += dot(a,a.yzx+33.33);
    float n01 = fract((a.x+a.y)*a.z);
    a = fract(vec3((i+vec2(1,1)).xyx) * k); a += dot(a,a.yzx+33.33);
    float n11 = fract((a.x+a.y)*a.z);
    return mix(mix(n00,n10,f.x),mix(n01,n11,f.x),f.y);
  }
  // how strongly a pixel of light covers the paper, saturating softly instead of clipping
  float inkCover(vec3 light, float gain) {
    return 1.0 - exp(-max(max(light.r, light.g), light.b) * gain);
  }
  // The ink colour for a pixel of light. Nearly white or softly tinted light (the blue wireframes,
  // the pastel globe dots, hot cores) all become one deep navy close to the site's accent, so the
  // drawing reads as a single ink instead of confetti. Only clearly coloured light (the green tick,
  // the orange packet, amber blips, PHP violet) keeps its own hue, darkened to an ink. Warm hues
  // are darkened less, since a dark orange reads as brown. Dense cores go a little deeper.
  vec3 inkColour(vec3 light, float cover) {
    float peak = max(max(light.r, light.g), light.b);
    float low = min(min(light.r, light.g), light.b);
    vec3 hue = light / max(peak, 1e-5);
    float grey = dot(hue, vec3(0.2126, 0.7152, 0.0722));
    hue = clamp(mix(vec3(grey), hue, 1.25), 0.0, 1.0);
    float warm = clamp((hue.r - hue.b) * 1.6, 0.0, 1.0);
    vec3 tinted = hue * hue * 0.6 * mix(1.0, 1.45, warm);
    float colourful = smoothstep(0.22, 0.5, (peak - low) / max(peak, 1e-5));
    vec3 navy = vec3(0.14, 0.29, 0.45);
    return mix(navy, tinted, colourful) * mix(1.0, 0.85, cover);
  }
  // The "lit" ink for light well above a normal stroke (LED flashes, signal runners, sweeps, the
  // sparks of a dissolve). At night these flare towards white. On paper the same moments switch the
  // ink to a vivid azure, or to a vivid version of their own colour, and cast a soft tinted glow.
  vec3 litColour(vec3 light) {
    float peak = max(max(light.r, light.g), light.b);
    float low = min(min(light.r, light.g), light.b);
    vec3 hue = light / max(peak, 1e-5);
    float grey = dot(hue, vec3(0.2126, 0.7152, 0.0722));
    hue = clamp(mix(vec3(grey), hue, 1.6), 0.0, 1.0);
    float colourful = smoothstep(0.22, 0.5, (peak - low) / max(peak, 1e-5));
    vec3 azure = vec3(0.09, 0.5, 0.9);
    return mix(azure, pow(hue, vec3(1.3)) * 0.88, colourful);
  }
  void main() {
    vec2 drift = vec2(uTime * 0.025, -uTime * 0.018);
    float mist = noise(vUv * 7.0 + drift);
    mist = mix(mist, noise(vUv * 15.0 - drift * 1.3 + mist * 0.8), 0.35);
    vec3 aura = texture2D(tAura, vUv).rgb;
    // Tight bloom around the hot cores, a faint broad halo for depth, and only a trace of mist so
    // the dark ground stays clean instead of hazy.
    vec3 light = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * 0.30;
    light += aura * (0.045 + mist * 0.05);
    vec3 mapped = toSRGB(filmic(light * 1.08));
    vec2 p = vUv - 0.5;
    vec3 background = vec3(0.043137, 0.062745, 0.086275);
    background += vec3(0.008, 0.011, 0.018) * exp(-dot(p, p) * 12.0);
    // An offset, soft silhouette shadow gives the emission a darker ground behind it.
    vec3 shadow = texture2D(tAura, vUv + vec2(-0.02, 0.025)).rgb;
    background *= 1.0 - clamp(dot(shadow, vec3(0.333)) * 0.65, 0.0, 0.32);
    float vignette = 1.0 - smoothstep(0.35, 0.76, length(p)) * 0.25;
    vec3 particles = texture2D(tParticles, vUv).rgb;
    vec3 night = background + mapped * vignette + particles;
    if (uLight <= 0.0) {
      gl_FragColor = vec4(night, 1.0);
      return;
    }

    // Light theme. Additive light vanishes on a pale ground, so every emitter is re-read as ink:
    // how much light a pixel holds sets how much ink covers it, and the light's hue, saturated and
    // deepened, sets the ink colour. The blue and lavender glow become the site's deep blue and
    // violet, and the bloom becomes a faint tinted haze around the lines instead of a glare.
    vec3 paper = vec3(0.980, 0.980, 0.969);
    // a soft, cool contact shadow under the object gives it the depth the glow gave it at night
    float shade = clamp(dot(shadow, vec3(0.333)) * 1.4, 0.0, 1.0);
    paper *= 1.0 - shade * vec3(0.05, 0.04, 0.025);
    vec3 day = paper;
    vec3 haze = texture2D(tBloom, vUv).rgb * 0.30 + aura * 0.06;
    float hazePeak = max(max(haze.r, haze.g), haze.b);
    day = mix(day, inkColour(haze, 0.0), inkCover(haze, 1.6) * 0.16);
    // the glow of a flare: only light well above an ordinary stroke's halo reaches the paper
    day = mix(day, mix(litColour(haze), vec3(1.0), 0.35), smoothstep(0.06, 0.26, hazePeak) * 0.55);
    vec3 lines = texture2D(tScene, vUv).rgb;
    float lineCover = inkCover(lines, 2.4);
    float lineLit = smoothstep(1.2, 2.6, max(max(lines.r, lines.g), lines.b));
    day = mix(day, mix(inkColour(lines, lineCover), litColour(lines), lineLit), lineCover);
    float sparkCover = inkCover(particles, 2.0);
    float sparkLit = smoothstep(0.25, 1.0, max(max(particles.r, particles.g), particles.b));
    day = mix(
      day,
      mix(inkColour(particles, sparkCover), litColour(particles), sparkLit * 0.85),
      sparkCover * 0.9
    );
    gl_FragColor = vec4(mix(night, day, uLight), 1.0);
  }
`

export const guideVertex = /* glsl */ `
  attribute vec3 aTarget;
  attribute float aAlong;
  attribute float aLane;
  uniform float uTime;
  uniform float uProgress;
  uniform float uNodePixelRatio;
  uniform float uGuideNodes;
  uniform float uGuideRole;
  varying float vAlong;
  varying float vLane;
  void main() {
    vec3 p = mix(position, aTarget, uGuideRole);
    float phase = uTime * 0.65 + aLane * 1.8;
    // Each trace bends and breathes independently, and its endpoints drift with it.
    p.x += sin(phase + aAlong * 2.6) * 0.035 * aAlong;
    p.y += sin(phase * 0.83 + aAlong * 3.2) * 0.045 * aAlong;
    p.z += cos(phase + aAlong * 2.0) * 0.04 * aAlong;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (2.6 + sin(phase) * 0.3) * uNodePixelRatio;
    vAlong = aAlong;
    vLane = aLane;
  }
`
export const guideFragment = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform float uGuideNodes;
  uniform float uGuideRole;
  uniform float uGuideStyleFrom;
  uniform float uGuideStyleTo;
  uniform vec3 uBlue;
  varying float vAlong;
  varying float vLane;
  float pattern(float style) {
    float dashed = 0.35 + 0.65 * smoothstep(0.16, 0.24, fract(vAlong * 7.0 - uTime * 0.12));
    return mix(1.0, dashed, step(0.5, style) * (1.0 - step(1.5, style)));
  }
  void main() {
    float dash = pattern(mix(uGuideStyleFrom, uGuideStyleTo, uGuideRole));
    float cell = floor(vAlong * 36.0);
    float stagger = fract(sin(cell * 17.13 + vLane * 43.7) * 43758.5453);
    float outgoing = 1.0 - smoothstep(0.02 + stagger * 0.10, 0.15 + stagger * 0.13, uProgress);
    float incoming = smoothstep(0.62 + stagger * 0.12, 0.84 + stagger * 0.12, uProgress);
    float visibility = mix(outgoing, incoming, uGuideRole);
    float head = fract(uTime * 0.19 + vLane * 0.27);
    float pulse = exp(-pow((vAlong - head) * 20.0, 2.0));
    float alpha = mix((0.20 + pulse * 0.52) * dash, 0.68, uGuideNodes);
    gl_FragColor = vec4(uBlue * (0.8 + pulse * 0.5), alpha * visibility);
  }
`

/** Detached telemetry fragments share the object's continuous arrival/crossfade timing. */
export const guideParticleVertex = /* glsl */ `
  attribute vec3 aTarget;
  attribute float aAlong;
  attribute float aLane;
  uniform float uTime;
  uniform float uProgress;
  uniform float uTransition;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    float delay = aAlong * 0.10;
    float t = clamp((uProgress - delay) / 0.78, 0.0, 1.0);
    float eased = t * t * (3.0 - 2.0 * t);
    float arc = sin(eased * 3.14159265);
    float seed = aAlong * 29.0 + aLane * 8.3;
    vec3 p = mix(position, aTarget, eased);
    p += vec3(sin(seed), cos(seed * 1.7), sin(seed * 0.8)) * arc * 0.14;
    float phase = uTime * 0.65 + aLane * 1.8;
    p.x += sin(phase + aAlong * 2.6) * 0.035 * aAlong;
    p.y += sin(phase * 0.83 + aAlong * 3.2) * 0.045 * aAlong;
    p.z += cos(phase + aAlong * 2.0) * 0.04 * aAlong;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (1.15 + fract(seed) * 0.5) * uPixelRatio;
    vAlpha = smoothstep(0.02, 0.20, uProgress) * (1.0 - smoothstep(0.60, 0.96, uProgress)) * uTransition * 0.65;
  }
`
export const guideParticleFragment = /* glsl */ `
  uniform vec3 uBlue;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    float alpha = vAlpha * (1.0 - smoothstep(0.5, 1.0, r));
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(mix(uBlue, vec3(1.0), 0.35), alpha);
  }
`

export const radarVertex = /* glsl */ `
  varying vec2 vRadar;
  void main() {
    vRadar = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
export const radarFragment = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform float uRadarSource;
  uniform float uRadarTarget;
  uniform vec3 uBlue;
  varying vec2 vRadar;
  void main() {
    float radius = length(vRadar);
    if (radius > 1.0) discard;
    float angle = atan(vRadar.y, vRadar.x);
    float sweep = uTime * 3.1;
    float behind = mod(sweep - angle + 6.2831853, 6.2831853);
    float beam = exp(-pow(behind * 140.0, 2.0));
    float trail = exp(-behind * 5.2) * (1.0-smoothstep(0.65,1.15,behind));
    float radial = smoothstep(0.02,0.12,radius) * (1.0-smoothstep(0.96,1.0,radius));
    float outgoing = 1.0-smoothstep(0.0,0.32,uProgress);
    float incoming = smoothstep(0.64,0.97,uProgress);
    float visibility = clamp(uRadarSource*outgoing+uRadarTarget*incoming,0.0,1.0);
    float energy = (beam * 0.85 + trail * 0.16) * radial;
    // Tiny returns brighten as the beam passes their real positions on the range grid.
    vec2 targets[3]; targets[0]=vec2(0.30,0.48); targets[1]=vec2(-0.50,-0.23); targets[2]=vec2(0.55,-0.39);
    for(int i=0;i<3;i++) {
      float passed=mod(sweep-atan(targets[i].y,targets[i].x)+6.2831853,6.2831853);
      energy += exp(-length(vRadar-targets[i])*95.0) * exp(-passed*1.8) * 1.8;
    }
    gl_FragColor=vec4(uBlue*1.5, energy*visibility);
  }
`

/** Contiguous Gaussian taps avoid repeated contour bands in the broad halo. */
export const auraBlurFragment = /* glsl */ `
  uniform sampler2D tSource;
  uniform vec2 uDirection;
  varying vec2 vUv;
  void main() {
    vec3 color=vec3(0.0);
    float total=0.0;
    for(int i=-8;i<=8;i++) {
      float x=float(i);
      float weight=exp(-x*x/18.0);
      color+=texture2D(tSource,vUv+uDirection*x).rgb*weight;
      total+=weight;
    }
    gl_FragColor=vec4(color/total,1.0);
  }
`

/** Soft gradient effects drawn on a plane behind the wires: the infection wave and the eye glow. */
export const fxFragment = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uProgress;
  uniform float uSourceForm;
  uniform vec3 uBlue;
  uniform vec3 uLavender;
  varying vec2 vRadar;
  float rng(float x, float a, float b) { return clamp((x - a) / (b - a), 0.0, 1.0); }
  float eout(float t) { float s = 1.0 - t; return 1.0 - s * s * s; }
  float bump(float t) { return sin(3.14159265 * clamp(t, 0.0, 1.0)); }
  void main() {
    vec2 w = vRadar * 1.6;
    float leave = 1.0 - smoothstep(0.0, 0.34, uProgress);
    float energy = 0.0;
    vec3 tint = uBlue;
    if (abs(uSourceForm - 8.0) < 0.1) {
      // Infection: like the radar sweep, each wave is a soft leading edge with a gradient tail that
      // fades back towards the body. Pure blue, never white.
      vec2 q = (w - vec2(-0.011, -0.11)) / vec2(0.33, 0.43);
      float dist = (length(q) - 1.0) * 0.38;
      for (int i = 0; i < 2; i++) {
        float t = rng(uPhase, 0.06 + float(i) * 0.26, 0.82 + float(i) * 0.16);
        float behind = eout(t) * 0.5 - dist;
        float edge = exp(-(behind / 0.07) * (behind / 0.07));
        float tail = exp(-max(behind, 0.0) * 5.0) * step(0.0, behind) * smoothstep(0.0, 0.14, dist);
        float fade = smoothstep(0.0, 0.22, t) * (1.0 - t) * (1.0 - t);
        energy += (edge * 0.04 + tail * 0.018) * fade * step(0.0, dist);
      }
      energy *= 1.0 - smoothstep(0.9, 1.5, length(w));
    } else if (abs(uSourceForm - 9.0) < 0.1) {
      // Eye: after the blink the iris lights up with a soft halo that stays inside the lids.
      vec2 iris = vec2(sin(uTime * 1.15) * 0.065, sin(uTime * 0.73 + 0.4) * 0.032);
      float r = length(w - iris);
      float lit = smoothstep(0.58, 0.7, uPhase) * (1.0 - 0.35 * rng(uPhase, 0.8, 1.0));
      float lens = 1.0 - smoothstep(0.82, 1.0, length(vec2(w.x, w.y / 0.58)));
      float core = exp(-(r / 0.16) * (r / 0.16));
      float halo = exp(-(r / 0.42) * (r / 0.42));
      float rim = exp(-((r - 0.31) / 0.07) * ((r - 0.31) / 0.07));
      energy = (core * 0.7 + halo * 0.5 + rim * 0.45) * lit * lens * (1.0 + 0.06 * sin(uTime * 3.0)) * 0.2;
      tint = mix(uBlue, vec3(1.0), 0.35);
    }
    gl_FragColor = vec4(tint * 1.5, energy * leave);
  }
`

export const biometricFragment = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform float uSourceForm;
  uniform float uTargetForm;
  uniform vec3 uBlue;
  varying vec2 vRadar;
  void main() {
    vec2 p=vRadar*1.1;
    float scan=sin(uTime*1.7)*0.90;
    float d=abs(p.y-scan);
    float beam=exp(-d*d*24000.0)*0.40+exp(-d*d*1400.0)*0.055;
    beam*=1.0-smoothstep(0.65,0.83,abs(p.x));
    float source=1.0-step(0.1,abs(uSourceForm-7.0));
    float target=1.0-step(0.1,abs(uTargetForm-7.0));
    float visibility=clamp(source*(1.0-smoothstep(0.0,0.32,uProgress))+target*smoothstep(0.64,0.97,uProgress),0.0,1.0);
    gl_FragColor=vec4(uBlue*1.5,beam*visibility);
  }
`
