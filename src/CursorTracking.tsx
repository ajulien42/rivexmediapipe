import {
  Alignment,
  Fit,
  Layout,
  useRive,
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceNumber,
} from "@rive-app/react-webgl2";
import { useEffect, useState } from "react";

function CursorTracking() {
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
  const { setValue: setEyeLy } = useViewModelInstanceNumber("eyeLy", vmi);
  const { setValue: setEyeRx } = useViewModelInstanceNumber("eyeRx", vmi);
  const { setValue: setEyeRy } = useViewModelInstanceNumber("eyeRy", vmi);

  const [maxWidth, setMaxWidth] = useState(0);
  const [maxHeight, setMaxHeight] = useState(0);

  useEffect(() => {
    const body = document.querySelector("body");
    if (body) {
      const bodyRect = body.getBoundingClientRect();
      setMaxWidth(bodyRect.right);
      setMaxHeight(bodyRect.bottom);
    }
  }, []);

  useEffect(() => {
    const update = (e: MouseEvent) => {
      if (maxWidth && maxHeight) {
        // Map mouse position from [0, maxWidth/maxHeight] to [0, 100] and invert
        const cursorNormalizedX = (e.clientX / maxWidth) * 100;
        const normalizedY = 100 - (e.clientY / maxHeight) * 100;

        // Update all eye positions
        setEyeLx(100 - cursorNormalizedX);
        setEyeRx(cursorNormalizedX);

        setEyeLy(normalizedY);
        setEyeRy(normalizedY);
      }
    };
    window.addEventListener("mousemove", update);
    return () => {
      window.removeEventListener("mousemove", update);
    };
  }, [maxHeight, maxWidth, setEyeLx, setEyeLy, setEyeRx, setEyeRy]);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <RiveComponent className="w-64 h-64" />
    </div>
  );
}

export default CursorTracking;
