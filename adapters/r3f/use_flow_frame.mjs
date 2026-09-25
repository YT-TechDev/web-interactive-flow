import { useFrame } from "@react-three/fiber";
import { createContext, useContext } from "react";

const RuntimeContext = createContext(null);

export function useFlowFrame(runtime, callback) {
  const selectedRuntime = useContext(RuntimeContext) ?? runtime;

  useFrame((_, delta) => {
    const snapshot = selectedRuntime.getSnapshot();
    callback(snapshot, delta);
  });
}
