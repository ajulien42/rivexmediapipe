import {
  Alignment,
  Fit,
  Layout,
  useRive,
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceNumber,
} from "@rive-app/react-webgl2";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Nose tip landmark — simple single-point proxy for gaze direction
const NOSE_TIP = 1;

// Eyelid landmarks for computing eye openness
const LEFT_EYE_TOP = 159;
const LEFT_EYE_BOTTOM = 145;
const LEFT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 133;
const RIGHT_EYE_TOP = 386;
const RIGHT_EYE_BOTTOM = 374;
const RIGHT_EYE_OUTER = 263;
const RIGHT_EYE_INNER = 362;

function FaceTracking() {
  const { rive, RiveComponent } = useRive({
    src: "simpleEyes.riv",
    autoplay: true,
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center,
    }),
  });

  const viewModel = useViewModel(rive);
  const vmi = useViewModelInstance(viewModel, { rive });

  const { setValue: setEyeLx } = useViewModelInstanceNumber("eyeLx", vmi);
  const { setValue: setEyeRx } = useViewModelInstanceNumber("eyeRx", vmi);
  const { setValue: setEyeRy } = useViewModelInstanceNumber("eyeRy", vmi);
  const { setValue: setEyeLy } = useViewModelInstanceNumber("eyeLy", vmi);
  const { setValue: setEyeLH } = useViewModelInstanceNumber("eyeLH", vmi);
  const { setValue: setEyeRH } = useViewModelInstanceNumber("eyeRH", vmi);

  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafIdRef = useRef<number>(0);
  const [ready, setReady] = useState(false);

  // Store setters in a ref so the detection loop doesn't depend on them
  // (avoids re-creating the loop when hooks update)
  const settersRef = useRef({
    setEyeLx,
    setEyeLy,
    setEyeRx,
    setEyeRy,
    setEyeLH,
    setEyeRH,
  });
  useEffect(() => {
    settersRef.current = {
      setEyeLx,
      setEyeLy,
      setEyeRx,
      setEyeRy,
      setEyeLH,
      setEyeRH,
    };
  }, [setEyeLx, setEyeLy, setEyeRx, setEyeRy, setEyeLH, setEyeRH]);

  const lastTimestampRef = useRef<number>(-1);

  // Smoothing: exponential moving average (0 = no smoothing, 1 = frozen)
  const SMOOTHING = 0.7;
  const smoothed = useRef({ x: 50, y: 50, lh: 50, rh: 50 });

  const detect = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) {
      rafIdRef.current = requestAnimationFrame(detect);
      return;
    }

    const now = performance.now();
    // Throttle to ~15 fps (one detection every ~66ms)
    const FRAME_INTERVAL = 33;
    if (now - lastTimestampRef.current < FRAME_INTERVAL) {
      rafIdRef.current = requestAnimationFrame(detect);
      return;
    }
    lastTimestampRef.current = now;

    const result = landmarker.detectForVideo(video, now);

    if (result.faceLandmarks && result.faceLandmarks.length > 0) {
      const lm = result.faceLandmarks[0];
      const nose = lm[NOSE_TIP];
      const { setEyeLx, setEyeLy, setEyeRx, setEyeRy, setEyeLH, setEyeRH } =
        settersRef.current;

      // --- Gaze direction from nose tip ---
      const GAIN = 1.5;
      const rawX = Math.min(100, Math.max(0, 50 + (nose.x * 100 - 50) * GAIN));
      const rawY = Math.min(
        100,
        Math.max(0, 50 + ((1 - nose.y) * 100 - 50) * GAIN),
      );

      // --- Eye openness (squint) from eyelid distance / eye width ---
      const leftEyeWidth = Math.abs(
        lm[LEFT_EYE_INNER].x - lm[LEFT_EYE_OUTER].x,
      );
      const leftEyeHeight = Math.abs(
        lm[LEFT_EYE_TOP].y - lm[LEFT_EYE_BOTTOM].y,
      );
      const rightEyeWidth = Math.abs(
        lm[RIGHT_EYE_INNER].x - lm[RIGHT_EYE_OUTER].x,
      );
      const rightEyeHeight = Math.abs(
        lm[RIGHT_EYE_TOP].y - lm[RIGHT_EYE_BOTTOM].y,
      );

      // Eye aspect ratio mapped to 0–100 with exaggeration
      const EYE_GAIN = 3;
      const leftOpenness =
        leftEyeWidth > 0 ? leftEyeHeight / leftEyeWidth : 0.2;
      const rightOpenness =
        rightEyeWidth > 0 ? rightEyeHeight / rightEyeWidth : 0.2;
      // Typical range is ~0.15 (squinting) to ~0.30 (wide open), center ~0.22
      const landmarkLh = Math.min(
        100,
        Math.max(0, 50 + ((leftOpenness - 0.22) / 0.15) * 50 * EYE_GAIN),
      );
      const landmarkRh = Math.min(
        100,
        Math.max(0, 50 + ((rightOpenness - 0.22) / 0.15) * 50 * EYE_GAIN),
      );

      // --- Blendshape-based signals (0 = open, 1 = closed) → invert to 0–100 ---
      let blinkLh = 100;
      let blinkRh = 100;
      let squintLh = 100;
      let squintRh = 100;

      if (result.faceBlendshapes && result.faceBlendshapes.length > 0) {
        const bs = result.faceBlendshapes[0].categories;
        const get = (name: string) =>
          bs.find((c) => c.categoryName === name)?.score ?? 0;

        const eyeBlinkL = get("eyeBlinkLeft");
        const eyeBlinkR = get("eyeBlinkRight");
        const eyeSquintL = get("eyeSquintLeft");
        const eyeSquintR = get("eyeSquintRight");

        // Invert: blendshape 0 = fully open (100), 1 = fully closed (0)
        blinkLh = (1 - eyeBlinkL) * 100;
        blinkRh = (1 - eyeBlinkR) * 100;
        squintLh = (1 - eyeSquintL) * 100;
        squintRh = (1 - eyeSquintR) * 100;
      }

      // Take the lowest (most closed) of the 3 signals
      const rawLh = Math.min(landmarkLh, blinkLh, squintLh);
      const rawRh = Math.min(landmarkRh, blinkRh, squintRh);

      const s = smoothed.current;
      s.x = s.x * SMOOTHING + rawX * (1 - SMOOTHING);
      s.y = s.y * SMOOTHING + rawY * (1 - SMOOTHING);
      s.lh = s.lh * SMOOTHING + rawLh * (1 - SMOOTHING);
      s.rh = s.rh * SMOOTHING + rawRh * (1 - SMOOTHING);

      // Gaze direction
      setEyeLx(100 - s.x);
      setEyeRx(s.x);
      setEyeLy(s.y);
      setEyeRy(s.y);

      // Eye height (squint)
      setEyeLH(s.lh);
      setEyeRH(s.rh);
    }

    rafIdRef.current = requestAnimationFrame(detect);
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function init() {
      // 1. Load WASM runtime (served locally from public/wasm)
      const vision = await FilesetResolver.forVisionTasks("/wasm");

      if (cancelled) return;

      // 2. Create FaceLandmarker
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/face_landmarker.task",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      });

      if (cancelled) {
        landmarker.close();
        return;
      }

      landmarkerRef.current = landmarker;

      // 3. Start webcam
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        landmarker.close();
        return;
      }

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.onloadeddata = () => {
          setReady(true);
          rafIdRef.current = requestAnimationFrame(detect);
        };
      }
    }

    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafIdRef.current);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, [detect]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <div className="flex flex-row gap-12">
        <RiveComponent className="w-64 h-64 border-white border rounded" />
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-64 h-64 rounded object-cover"
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 text-xs text-white">
              Loading camera…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FaceTracking;
