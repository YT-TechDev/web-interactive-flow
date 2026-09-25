import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

export function useFlowFrame(runtime, callback) {
  const callbackRef = useRef(callback);

  useFrame((_, delta) => {
    const snapshot = runtime.getSnapshot();
    callbackRef.current(snapshot, delta);
  });
}
