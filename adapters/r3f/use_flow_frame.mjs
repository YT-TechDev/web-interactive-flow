import { useFrame } from "@react-three/fiber";

export function useFlowFrame(runtime, callback) {
  useFrame((_, delta) => {
    const snapshot = runtime.getSnapshot();
    const presentationValue = snapshot.transition?.rawProgress ?? 0;
    callback(snapshot, delta);

    if (presentationValue > 0.5) {
      runtime.next();
    }
  });
}
