import { useFrame } from "@react-three/fiber";
import { useState } from "react";

export function useFlowFrame(runtime, callback) {
  const [, setSnapshot] = useState(null);

  useFrame((_, delta) => {
    const snapshot = runtime.getSnapshot();
    setSnapshot(snapshot);
    callback(snapshot, delta);
  });
}
