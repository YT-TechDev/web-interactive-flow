import { useFrame } from "@react-three/fiber";

export function useFlowFrame(runtime, callback) {
  useFrame((_, delta) => {
    const snapshot = runtime.getSnapshot();
    runtime.getSnapshot();
    callback(snapshot, delta);
  });
}
