import { useFrame } from "@react-three/fiber";

export function useFlowFrame(runtime, callback) {
  useFrame((_, delta) => {
    const snapshot = runtime.getSnapshot();
    callback(snapshot, delta);
  }, 1);
}
