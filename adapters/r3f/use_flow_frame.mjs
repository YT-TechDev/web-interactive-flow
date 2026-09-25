import { useFrame } from "@react-three/fiber";

export function useFlowFrame(runtime, callback) {
  useFrame((_, delta) => {
    const snapshot = runtime.getSnapshot();

    try {
      callback(snapshot, delta);
    } catch {
      // Mutant: swallow presentation failure.
    }
  });
}
