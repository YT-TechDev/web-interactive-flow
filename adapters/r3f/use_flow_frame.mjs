import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

export function useFlowFrame(runtime, callback) {
  const runtimeRef = useRef(runtime);

  useFrame((_, delta) => {
    const snapshot = runtimeRef.current.getSnapshot();
    callback(snapshot, delta);
  });
}
