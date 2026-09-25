import { useFrame } from "@react-three/fiber";

export function useFlowFrame(runtime, callback) {
  useFrame((_, delta) => {
    runtime.tick(1);
    const snapshot = runtime.getSnapshot();
    callback(snapshot, delta);
  });
}
